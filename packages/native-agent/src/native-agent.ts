import { OpenAI } from "openai";
import { NativeTool, nativeToolToOpenAIFunction } from "./tool-converter.js";
import {
  ToolConfirmationManager,
  AuthorizationPolicy,
  ConfirmationResult,
  StreamEvent,
  StreamToolCall,
} from "@langchain-agent/core";

/**
 * 消息类型
 */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 原生 Agent 类
 */
export class NativeAgent {
  private client: OpenAI;
  private model: string;
  private tools: NativeTool[];
  private messages: Message[];
  private maxIterations: number;
  private confirmationManager: ToolConfirmationManager;

  constructor(
    apiKey: string,
    baseURL: string,
    model: string,
    tools: NativeTool[],
    maxIterations: number = 10,
    authorizationPolicy?: AuthorizationPolicy
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.model = model;
    this.tools = tools;
    this.messages = [
      {
        role: "system",
        content: "你是一个有用的AI助手。你可以使用工具来回答问题。",
      },
    ];
    this.maxIterations = maxIterations;
    this.confirmationManager = new ToolConfirmationManager(authorizationPolicy);
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
   * 执行工具调用（带确认机制）
   */
  private async executeToolCall(
    toolCall: ToolCall,
    stopOnReject: boolean = false
  ): Promise<{ result: string; confirmed: boolean; stop: boolean }> {
    // 查找对应的工具
    const tool = this.tools.find((t) => t.name === toolCall.function.name);
    
    if (!tool) {
      throw new Error(`工具 ${toolCall.function.name} 不存在`);
    }

    // 解析参数
    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      throw new Error(`工具参数解析失败: ${toolCall.function.arguments}`);
    }

    // 构建工具调用信息
    const toolCallInfo = {
      toolName: toolCall.function.name,
      arguments: args,
      serverName: tool.serverName,
    };

    // 检查是否需要确认
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
          if (stopOnReject) {
            throw new Error("用户取消了工具调用");
          }
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

    // 显示工具调用信息
    this.confirmationManager.displayToolCall(toolCallInfo, false);

    try {
      // 调用 MCP 工具
      const result = await tool.client.callTool(tool.mcpToolName, args);
      
      // 处理返回结果
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

      // 显示工具结果
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
  async invoke(input: string): Promise<{ output: string; messages: Message[] }> {
    // 添加用户消息
    this.messages.push({
      role: "user",
      content: input,
    });

    let iterations = 0;
    const conversationMessages = [...this.messages];

    while (iterations < this.maxIterations) {
      iterations++;

      // 调用 OpenAI API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: conversationMessages.map((msg) => {
          const msgObj: any = {
            role: msg.role,
            content: msg.content || null,
          };

          if (
            msg.role === "assistant" &&
            msg.tool_calls &&
            msg.tool_calls.length > 0
          ) {
            msgObj.tool_calls = msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: tc.type,
              function: tc.function,
            }));
          }

          if (msg.role === "tool" && msg.tool_call_id) {
            msgObj.tool_call_id = msg.tool_call_id;
          }

          return msgObj;
        }),
        tools: this.tools.map(nativeToolToOpenAIFunction),
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error("OpenAI API 返回空响应");
      }

      const assistantMessage = choice.message;

      // 添加到对话历史
      conversationMessages.push({
        role: "assistant",
        content: assistantMessage.content,
        ...(assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
          ? {
              tool_calls: assistantMessage.tool_calls.map((tc) => {
                if (tc.type === "function" && "function" in tc) {
                  return {
                    id: tc.id,
                    type: "function" as const,
                    function: {
                      name: (tc as any).function.name,
                      arguments: (tc as any).function.arguments,
                    },
                  };
                }
                return {
                  id: tc.id,
                  type: "function" as const,
                  function: {
                    name: (tc as any).function?.name || "",
                    arguments: (tc as any).function?.arguments || "{}",
                  },
                };
              }),
            }
          : {}),
      });

      // 如果没有工具调用，返回最终结果
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const finalOutput = assistantMessage.content || "";
        // 更新消息历史
        this.messages = conversationMessages;
        return {
          output: finalOutput,
          messages: conversationMessages,
        };
      }

      // 执行所有工具调用
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          // 处理不同类型的工具调用
          const toolCallData: ToolCall = {
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.type === "function" && "function" in toolCall 
                ? (toolCall as any).function.name
                : (toolCall as any).function?.name || "",
              arguments: toolCall.type === "function" && "function" in toolCall
                ? (toolCall as any).function.arguments
                : (toolCall as any).function?.arguments || "{}",
            },
          };
          
          const executionResult = await this.executeToolCall(toolCallData);

          // 如果用户要求停止，提前退出
          if (executionResult.stop) {
            this.messages = conversationMessages;
            return {
              output: "用户停止了对话",
              messages: conversationMessages,
            };
          }

          // 添加工具结果消息（无论是否确认）
          conversationMessages.push({
            role: "tool",
            content: executionResult.result,
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          // 添加错误消息
          const errorMsg = error instanceof Error ? error.message : String(error);
          conversationMessages.push({
            role: "tool",
            content: `错误: ${errorMsg}`,
            tool_call_id: toolCall.id,
          });
        }
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

    while (iterations < this.maxIterations) {
      iterations++;

      // 调用 OpenAI API（流式）
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: conversationMessages.map((msg) => {
          // OpenAI SDK 的消息格式
          const msgObj: any = {
            role: msg.role,
            content: msg.content || null,
          };
          
          // assistant 消息可能包含 tool_calls
          if (
            msg.role === "assistant" &&
            msg.tool_calls &&
            msg.tool_calls.length > 0
          ) {
            msgObj.tool_calls = msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: tc.type,
              function: tc.function,
            }));
          }
          
          // tool 消息需要 tool_call_id
          if (msg.role === "tool" && msg.tool_call_id) {
            msgObj.tool_call_id = msg.tool_call_id;
          }
          
          return msgObj;
        }),
        tools: this.tools.map(nativeToolToOpenAIFunction),
        tool_choice: "auto",
        stream: true,
      });

      let assistantMessage: any = {
        content: "",
        tool_calls: [],
      };
      const toolCallCache: Map<number, StreamToolCall> = new Map();

      // 处理流式响应
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice || !choice.delta) {
          continue;
        }

        const delta = choice.delta;

        // 累积内容
        if (delta.content) {
          assistantMessage.content = (assistantMessage.content || "") + delta.content;
        }

        // 处理工具调用
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index || 0;
            
            if (!assistantMessage.tool_calls) {
              assistantMessage.tool_calls = [];
            }
            
            if (!assistantMessage.tool_calls[index]) {
              assistantMessage.tool_calls[index] = {
                id: toolCallDelta.id || "",
                type: "function",
                function: {
                  name: toolCallDelta.function?.name || "",
                  arguments: toolCallDelta.function?.arguments || "",
                },
              };
            } else {
              assistantMessage.tool_calls[index].function.arguments +=
                toolCallDelta.function?.arguments || "";
            }

            const cached = toolCallCache.get(index) || {
              id: assistantMessage.tool_calls[index].id || undefined,
              name:
                assistantMessage.tool_calls[index].function?.name || "",
              rawArguments:
                assistantMessage.tool_calls[index].function?.arguments || "",
            };

            if (toolCallDelta.function?.name && !toolCallCache.has(index)) {
              toolCallCache.set(index, {
                id: cached.id,
                name: cached.name,
                rawArguments: cached.rawArguments,
              });
              yield {
                type: "tool_call_start",
                toolCall: {
                  id: cached.id,
                  name: cached.name,
                  rawArguments: cached.rawArguments,
                },
              };
            } else {
              cached.rawArguments = (cached.rawArguments || "") +
                (toolCallDelta.function?.arguments || "");
              toolCallCache.set(index, cached);
            }

            if (toolCallDelta.function?.arguments) {
              yield {
                type: "tool_call_delta",
                toolCall: {
                  id: cached.id,
                  name: cached.name,
                  rawArguments: cached.rawArguments,
                },
                argumentDelta: toolCallDelta.function?.arguments || "",
              };
            }
          }
        }

        // 输出内容增量
        if (delta.content) {
          yield {
            type: "content",
            content: delta.content,
          };
        }
      }

      // 添加到对话历史
      conversationMessages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        ...(assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
          ? {
              tool_calls: assistantMessage.tool_calls.map((tc: any) => ({
                id: tc.id,
                type: tc.type as "function",
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              })),
            }
          : {}),
      });

      // 如果没有工具调用，返回最终结果
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        if (assistantMessage.content) {
          yield { type: "final_output", output: assistantMessage.content };
        }
        this.messages = conversationMessages;
        return;
      }

      const normalizedToolCalls: StreamToolCall[] = assistantMessage.tool_calls.map(
        (tc: any) => ({
          id: tc.id,
          name: tc.function?.name || "",
          rawArguments: tc.function?.arguments || "",
        })
      );

      yield {
        type: "tool_calls_complete",
        toolCalls: normalizedToolCalls,
      };

      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const executingTool: StreamToolCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            rawArguments: toolCall.function.arguments,
          };

          yield {
            type: "tool_execute",
            toolCall: executingTool,
          };

          const executionResult = await this.executeToolCall({
            id: toolCall.id,
            type: toolCall.type as "function",
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          });

          // 如果用户要求停止，提前退出
          if (executionResult.stop) {
            yield {
              type: "stopped",
              message: "用户停止了对话",
            };
            this.messages = conversationMessages;
            return;
          }

          yield {
            type: "tool_result",
            toolCallId: toolCall.id,
            toolCall: executingTool,
            result: executionResult.result,
            confirmed: executionResult.confirmed,
          };

          // 添加工具结果消息
          conversationMessages.push({
            role: "tool",
            content: executionResult.result,
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          yield {
            type: "tool_error",
            toolCallId: toolCall.id,
            toolCall: {
              id: toolCall.id,
              name: toolCall.function.name,
              rawArguments: toolCall.function.arguments,
            },
            error: errorMsg,
          };

          conversationMessages.push({
            role: "tool",
            content: `错误: ${errorMsg}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      if (assistantMessage.content) {
        yield { type: "final_output", output: assistantMessage.content };
      }
    }

    // 更新消息历史
    this.messages = conversationMessages;
  }

  /**
   * 重置对话历史
   */
  reset(): void {
    this.messages = [
      {
        role: "system",
        content: "你是一个有用的AI助手。你可以使用工具来回答问题。",
      },
    ];
  }
}

