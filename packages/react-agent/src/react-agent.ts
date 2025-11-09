import { OpenAI } from "openai";
import { ReActTool } from "./tool-converter.js";
import {
  ToolConfirmationManager,
  AuthorizationPolicy,
  StreamEvent,
  StreamToolCall,
} from "@langchain-agent/core";

/**
 * 消息类型（简化版，不需要 tool_calls）
 */
export interface ReActMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 解析出的工具调用
 */
export interface ParsedToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * ReAct Agent 类 - 不使用 function calling
 * 
 * 工作原理：
 * 1. 将工具信息以文本形式放在 system prompt 中
 * 2. 要求 LLM 以特定格式输出工具调用（JSON格式）
 * 3. 解析 LLM 的响应，提取工具调用
 * 4. 执行工具调用（带用户确认）
 * 5. 将结果反馈给 LLM
 * 6. 循环直到得到最终答案
 */
export class ReActAgent {
  private client: OpenAI;
  private model: string;
  private tools: ReActTool[];
  private messages: ReActMessage[];
  private maxIterations: number;
  private confirmationManager: ToolConfirmationManager;

  constructor(
    apiKey: string,
    baseURL: string,
    model: string,
    tools: ReActTool[],
    maxIterations: number = 10,
    authorizationPolicy?: AuthorizationPolicy
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.model = model;
    this.tools = tools;
    this.maxIterations = maxIterations;
    this.confirmationManager = new ToolConfirmationManager(authorizationPolicy);
    
    // 构建包含工具信息的 system prompt
    const systemPrompt = this.buildSystemPrompt();
    this.messages = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
  }

  /**
   * 设置确认管理器的 readline 接口
   */
  setReadlineInterface(rl: any): void {
    this.confirmationManager.setReadlineInterface(rl);
  }

  /**
   * 更新授权策略
   */
  updateAuthorizationPolicy(policy: Partial<AuthorizationPolicy>): void {
    this.confirmationManager.updatePolicy(policy);
  }

  /**
   * 构建包含工具信息的 system prompt
   */
  private buildSystemPrompt(): string {
    // 将工具描述嵌入 system prompt，引导模型以指定 JSON 格式调用工具
    const toolDescriptions = this.tools.map((tool) => {
      const params = tool.function.parameters.properties || {};
      const required = tool.function.parameters.required || [];
      
      const paramDescriptions = Object.entries(params)
        .map(([key, value]: [string, any]) => {
          const isRequired = required.includes(key);
          const type = value.type || "string";
          const desc = value.description || "";
          return `  - ${key} (${type}${isRequired ? ", required" : ", optional"}): ${desc}`;
        })
        .join("\n");

      return `工具名称: ${tool.name}
描述: ${tool.description || tool.function.description || "无描述"}
参数:
${paramDescriptions || "  无参数"}`;
    }).join("\n\n");

    return `你是一个有用的AI助手。你可以使用工具来回答问题。

可用工具列表：
${toolDescriptions}

使用工具的格式：
当你需要使用工具时，请严格按照以下JSON格式输出：
\`\`\`json
{
  "action": "tool_call",
  "tool_name": "工具名称",
  "arguments": {
    "参数1": "值1",
    "参数2": "值2"
  },
  "reasoning": "为什么要调用这个工具"
}
\`\`\`

重要提示：
1. 如果你想调用工具，必须输出上述JSON格式，且必须包含在代码块中（\`\`\`json ... \`\`\`）
2. 如果你已经得到足够的信息，可以直接回答用户，不需要调用工具
3. 当你调用工具后，我会返回工具的执行结果，然后你可以继续思考或调用其他工具
4. 最终答案请直接以自然语言输出，不要使用JSON格式`;
  }

  /**
   * 从 LLM 响应中解析工具调用
   */
  private parseToolCall(content: string): ParsedToolCall | null {
    // 尝试提取 JSON 代码块
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = content.match(jsonBlockRegex);
    
    if (!match) {
      // 如果没有代码块，尝试直接解析整个内容为 JSON
      try {
        const parsed = JSON.parse(content.trim());
        if (parsed.action === "tool_call" && parsed.tool_name && parsed.arguments) {
          return {
            name: parsed.tool_name,
            arguments: parsed.arguments,
          };
        }
      } catch {
        // 不是有效的 JSON
      }
      return null;
    }

    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.action === "tool_call" && parsed.tool_name && parsed.arguments) {
        return {
          name: parsed.tool_name,
          arguments: parsed.arguments,
        };
      }
    } catch (error) {
      console.warn("解析工具调用JSON失败:", error);
    }

    return null;
  }

  /**
   * 执行工具调用（带确认机制）
   */
  private async executeToolCall(
    toolCall: ParsedToolCall
  ): Promise<{ result: string; confirmed: boolean; stop: boolean }> {
    // 查找对应的工具
    const tool = this.tools.find((t) => t.name === toolCall.name);
    
    if (!tool) {
      throw new Error(`工具 ${toolCall.name} 不存在`);
    }

    // 构建工具调用信息
    const toolCallInfo = {
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      serverName: tool.serverName,
    };

    // 检查是否需要确认：结合策略判断是否要询问用户
    const needsConfirmation = await this.confirmationManager.shouldConfirm(
      toolCallInfo
    );

    let confirmed = !needsConfirmation;
    let stop = false;

    // 如果需要确认，请求用户确认
    if (needsConfirmation) {
      const confirmation = await this.confirmationManager.requestConfirmation(
        toolCallInfo
      );

      switch (confirmation) {
        case "yes":
        case "all":
          confirmed = true;
          break;
        case "no":
          confirmed = false;
          return {
            result: "用户取消了工具调用",
            confirmed: false,
            stop: false,
          };
        case "stop":
          confirmed = false;
          stop = true;
          return {
            result: "用户停止了对话",
            confirmed: false,
            stop: true,
          };
      }
    }

    // 如果未确认，返回取消消息
    if (!confirmed) {
      return {
        result: "工具调用被取消",
        confirmed: false,
        stop: false,
      };
    }

    // 显示工具调用信息，便于调试与展示
    this.confirmationManager.displayToolCall(toolCallInfo, false);

    try {
      // 调用 MCP 工具
      const result = await tool.client.callTool(tool.mcpToolName, toolCall.arguments);
      
      // 处理返回结果，兼容 array/text 等不同返回类型
      let resultStr: string;
      if (result.content && Array.isArray(result.content)) {
        resultStr = result.content
          .map((item: any) => {
            if (typeof item === "string") return item;
            if (item.type === "text" && item.text) return item.text;
            return JSON.stringify(item);
          })
          .join("\n");
      } else if (result.content) {
        resultStr = typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content);
      } else {
        resultStr = JSON.stringify(result);
      }

      // 显示工具结果并同步状态
      this.confirmationManager.displayToolResult(toolCallInfo, resultStr, true);

      return {
        result: resultStr,
        confirmed: true,
        stop: false,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const fullError = `工具调用失败: ${errorMsg}`;
      
      // 显示错误结果
      this.confirmationManager.displayToolResult(toolCallInfo, fullError, false);

      throw new Error(fullError);
    }
  }

  /**
   * 调用 agent（非流式）
   */
  async invoke(input: string): Promise<{ output: string; messages: ReActMessage[] }> {
    // 添加用户消息
    this.messages.push({
      role: "user",
      content: input,
    });

    let iterations = 0;
    const conversationMessages = [...this.messages];

    while (iterations < this.maxIterations) {
      iterations++;

      // 调用 OpenAI API（不使用 function calling），依赖 prompt 指引模型输出
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: conversationMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        // 不使用 tools 和 tool_choice 参数
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error("OpenAI API 返回空响应");
      }

      const assistantMessage = choice.message;
      const content = assistantMessage.content || "";

      // 添加到对话历史，使 LLM 在下一轮参考本轮输出
      conversationMessages.push({
        role: "assistant",
        content: content,
      });

      // 尝试解析工具调用：模型需输出 JSON 代码块
      const toolCall = this.parseToolCall(content);

      // 如果没有工具调用，说明模型已经得出最终回答
      if (!toolCall) {
        this.messages = conversationMessages;
        return {
          output: content,
          messages: conversationMessages,
        };
      }

      // 执行工具调用：确认、实际调用 MCP，并将结果反馈
      try {
        const executionResult = await this.executeToolCall(toolCall);

        // 如果用户要求停止，提前退出
        if (executionResult.stop) {
          this.messages = conversationMessages;
          return {
            output: "用户停止了对话",
            messages: conversationMessages,
          };
        }

        // 添加工具结果消息，引导模型继续推理
        conversationMessages.push({
          role: "user",
          content: `工具调用结果:\n工具: ${toolCall.name}\n结果: ${executionResult.result}\n\n请基于这个结果继续回答用户的问题。如果需要更多信息，可以继续调用工具。`,
        });
      } catch (error) {
        // 添加错误消息，让模型有机会重新规划
        const errorMsg = error instanceof Error ? error.message : String(error);
        conversationMessages.push({
          role: "user",
          content: `工具调用失败:\n工具: ${toolCall.name}\n错误: ${errorMsg}\n\n请尝试其他方法或告知用户问题。`,
        });
      }
    }

    // 如果达到最大迭代次数，返回最后的响应
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    this.messages = conversationMessages;
    return {
      output: lastMessage.content || "达到最大迭代次数，未完成处理",
      messages: conversationMessages,
    };
  }

  /**
   * 流式调用 agent
   */
  async *stream(input: string): AsyncGenerator<StreamEvent, void, unknown> {
    // 添加用户消息
    this.messages.push({
      role: "user",
      content: input,
    });

    let iterations = 0;
    const conversationMessages = [...this.messages];
    let accumulatedContent = "";

    while (iterations < this.maxIterations) {
      iterations++;

      // 调用 OpenAI API（流式，不使用 tools 参数），依赖 prompt 解析工具调用
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: conversationMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: true,
        // 不使用 tools 和 tool_choice 参数
      });

      let content = "";

      // 处理流式响应，逐步累计回答文本
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice || !choice.delta) {
          continue;
        }

        const delta = choice.delta;

        // 累积内容并向上游发送实时文本
        if (delta.content) {
          content += delta.content;
          accumulatedContent += delta.content;
          yield {
            type: "content",
            content: delta.content,
          };
        }
      }

      // 添加到对话历史，保持对话上下文
      conversationMessages.push({
        role: "assistant",
        content: content,
      });

      // 尝试解析工具调用
      const toolCall = this.parseToolCall(content);

      // 如果没有工具调用，输出最终结果并结束流
      if (!toolCall) {
        if (content) {
          yield { type: "final_output", output: content };
        }
        this.messages = conversationMessages;
        return;
      }

      const toolCallInfo: StreamToolCall = {
        name: toolCall.name,
        rawArguments: JSON.stringify(toolCall.arguments),
        arguments: toolCall.arguments,
      };

      // 通知上游：工具调用开始
      yield {
        type: "tool_call_start",
        toolCall: toolCallInfo,
      };

      // 该实现一次只触发一个工具，直接发送 complete
      yield {
        type: "tool_calls_complete",
        toolCalls: [toolCallInfo],
      };

      try {
        yield {
          type: "tool_execute",
          toolCall: toolCallInfo,
        };

        const executionResult = await this.executeToolCall(toolCall);

        // 如果用户要求停止，提前退出
        if (executionResult.stop) {
          yield {
            type: "stopped",
            message: "用户停止了对话",
          };
          this.messages = conversationMessages;
          return;
        }

        // 返回成功的工具结果
        yield {
          type: "tool_result",
          toolCall: toolCallInfo,
          result: executionResult.result,
          confirmed: executionResult.confirmed,
        };

        // 添加工具结果消息
        conversationMessages.push({
          role: "user",
          content: `工具调用结果:\n工具: ${toolCall.name}\n结果: ${executionResult.result}\n\n请基于这个结果继续回答用户的问题。如果需要更多信息，可以继续调用工具。`,
        });
      } catch (error) {
        // 工具执行失败时广播错误，让调用方更新 UI
        const errorMsg = error instanceof Error ? error.message : String(error);
        yield {
          type: "tool_error",
          toolCall: toolCallInfo,
          error: errorMsg,
        };

        conversationMessages.push({
          role: "user",
          content: `工具调用失败:\n工具: ${toolCall.name}\n错误: ${errorMsg}\n\n请尝试其他方法或告知用户问题。`,
        });
      }

      // 重置累积内容，为下一轮思考重新收集文本
      accumulatedContent = "";
    }

    // 若循环自然结束，补充最终输出
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.content) {
      yield { type: "final_output", output: lastMessage.content };
    }

    // 更新消息历史
    this.messages = conversationMessages;
  }

  /**
   * 重置对话历史
   */
  reset(): void {
    const systemPrompt = this.buildSystemPrompt();
    this.messages = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
  }
}

