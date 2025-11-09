import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  MCPConfig,
  MCPClientWrapper,
  ToolConfirmationManager,
  AuthorizationPolicy,
  StreamEvent,
  StreamToolCall,
} from "@langchain-agent/core";
import { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpTools } from "@langchain/mcp-adapters";

/**
 * LLM配置选项
 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  authorizationPolicy?: AuthorizationPolicy;
}

/**
 * 工具确认上下文（用于在工具执行时访问确认管理器）
 */
let globalConfirmationManager: ToolConfirmationManager | null = null;

/**
 * 设置全局确认管理器
 */
export function setGlobalConfirmationManager(
  manager: ToolConfirmationManager | null
): void {
  globalConfirmationManager = manager;
}

/**
 * 获取全局确认管理器
 */
export function getGlobalConfirmationManager(): ToolConfirmationManager | null {
  return globalConfirmationManager;
}

/**
 * 将MCP工具转换为LangChain工具
 */
function convertMCPToolToLangChainTool(
  tool: MCPTool,
  client: MCPClientWrapper,
  serverName: string
): DynamicStructuredTool {
  // 转换输入schema
  const inputSchema: Record<string, any> = {};
  if (tool.inputSchema && typeof tool.inputSchema === "object") {
    const props = (tool.inputSchema as any).properties || {};
    const required = (tool.inputSchema as any).required || [];
    
    for (const [key, value] of Object.entries(props)) {
      const prop = value as any;
      let zodType: z.ZodTypeAny;
      
      switch (prop.type) {
        case "string":
          zodType = z.string();
          break;
        case "number":
          zodType = z.number();
          break;
        case "boolean":
          zodType = z.boolean();
          break;
        case "array":
          zodType = z.array(z.any());
          break;
        case "object":
          zodType = z.record(z.any());
          break;
        default:
          zodType = z.any();
      }
      
      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }
      
      if (!required.includes(key)) {
        zodType = zodType.optional();
      }
      
      inputSchema[key] = zodType;
    }
  }

  const toolName = `${serverName}_${tool.name}`;
  
  return new DynamicStructuredTool({
    name: toolName,
    description: tool.description || `调用 ${serverName} 服务器的 ${tool.name} 工具`,
    schema: z.object(inputSchema),
    func: async (input: any) => {
      // 获取确认管理器，确保在工具执行前进行权限校验
      const confirmationManager = getGlobalConfirmationManager();

      // 构建工具调用信息
      const toolCallInfo = {
        toolName: toolName,
        arguments: input,
        serverName: serverName,
      };

      // 检查是否需要确认：结合策略决定是否询问用户
      let confirmed = true;
      if (confirmationManager) {
        const needsConfirmation =
          await confirmationManager.shouldConfirm(toolCallInfo);

        if (needsConfirmation) {
          const confirmation =
            await confirmationManager.requestConfirmation(toolCallInfo);

          switch (confirmation) {
            case "yes":
            case "all":
              confirmed = true;
              break;
            case "no":
              confirmed = false;
              break;
            case "stop":
              throw new Error("用户停止了对话");
          }
        }
      }

      // 如果未确认，抛出错误以阻止工具执行
      if (!confirmed) {
        throw new Error("用户取消了工具调用");
      }

      // 显示工具调用信息，方便用户了解执行详情
      if (confirmationManager) {
        confirmationManager.displayToolCall(toolCallInfo, false);
      }

      try {
        const result = await client.callTool(tool.name, input);
        
        // 处理 MCP 工具返回结果：兼容数组和单值
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
        if (confirmationManager) {
          confirmationManager.displayToolResult(toolCallInfo, resultStr, true);
        }

        return resultStr;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const fullError = `工具调用失败: ${errorMsg}`;

        // 显示错误结果，便于调试
        if (confirmationManager) {
          confirmationManager.displayToolResult(
            toolCallInfo,
            fullError,
            false
          );
        }

        throw new Error(fullError);
      }
    },
  });
}

/**
 * 创建带有MCP工具的LangChain Agent
 */
function extractMessageContent(message: any): string {
  const content = message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return JSON.stringify(part);
      })
      .join("");
  }
  if (typeof content === "object" && "toString" in content) {
    return String(content);
  }
  return "";
}

function normalizeToolCall(toolCall: any, index: number): StreamToolCall {
  const id = toolCall?.id || undefined;
  const name =
    toolCall?.name ||
    toolCall?.function?.name ||
    (id ? `tool_${id}` : `tool_${index}`);
  let rawArguments: string | undefined;
  let parsedArgs: Record<string, any> | undefined;

  const argsSource =
    toolCall?.args ??
    toolCall?.arguments ??
    toolCall?.function?.arguments ??
    toolCall?.function?.args;

  if (typeof argsSource === "string") {
    rawArguments = argsSource;
    try {
      parsedArgs = JSON.parse(argsSource);
    } catch {
      parsedArgs = undefined;
    }
  } else if (argsSource && typeof argsSource === "object") {
    parsedArgs = argsSource as Record<string, any>;
    try {
      rawArguments = JSON.stringify(argsSource);
    } catch {
      rawArguments = undefined;
    }
  }

  return {
    id,
    name,
    arguments: parsedArgs,
    rawArguments,
  };
}

async function* createLangChainUnifiedStream(
  executor: AgentExecutor,
  input: string
): AsyncGenerator<StreamEvent, void, unknown> {
  // 使用 AgentExecutor 的流接口，将 LangChain 输出映射到统一的 StreamEvent
  const iterator = await executor.stream(
    { input },
    { streamMode: "values" } as any
  );

  // 记录工具参数增量和元数据，确保可以增量地向外发送 tool_call 事件
  const toolArgumentBuffers = new Map<string, string>();
  const toolMetadata = new Map<string, StreamToolCall>();
  const emittedToolExecute = new Set<string>();
  let lastAssistantContent = "";
  let finalOutputCandidate = "";

  for await (const chunk of iterator as AsyncIterable<any>) {
    if (!chunk) {
      continue;
    }

    if (typeof chunk.output === "string") {
      // LangChain 直接返回纯文本增量
      const delta = chunk.output.slice(lastAssistantContent.length);
      if (delta) {
        yield { type: "content", content: delta };
        lastAssistantContent += delta;
        finalOutputCandidate = lastAssistantContent;
      }
      continue;
    }

    if (chunk.value && typeof chunk.value === "string") {
      // 某些版本会通过 chunk.value 暴露增量文本
      const delta = chunk.value;
      if (delta) {
        yield { type: "content", content: delta };
        lastAssistantContent += delta;
        finalOutputCandidate = lastAssistantContent;
      }
      continue;
    }

    if (Array.isArray(chunk.messages)) {
      // 通过消息对象追踪 AI/工具消息以及函数调用
      const lastMessage = chunk.messages[chunk.messages.length - 1];
      if (!lastMessage) continue;

      const messageType =
        lastMessage.getType?.() ||
        lastMessage.constructor?.name?.toLowerCase?.() ||
        "";

      if (messageType.includes("ai")) {
        // AI 消息可能携带回答文本和 tool_calls
        const content = extractMessageContent(lastMessage);
        const delta = content.slice(lastAssistantContent.length);
        if (delta) {
          yield { type: "content", content: delta };
        }
        lastAssistantContent = content;

        const toolCalls = Array.isArray(lastMessage.tool_calls)
          ? lastMessage.tool_calls
          : [];

        if (toolCalls.length > 0) {
          const normalized: StreamToolCall[] = toolCalls.map(
            (tc: unknown, index: number) => normalizeToolCall(tc, index)
          );

          for (let index = 0; index < normalized.length; index++) {
            const toolCall = normalized[index];
            const key = toolCall.id || `${toolCall.name}_${index}`;
            const previousArgs = toolArgumentBuffers.get(key) || "";
            const currentArgs = toolCall.rawArguments || "";

            if (!toolMetadata.has(key)) {
              // 第一次见到该工具调用，发送开始事件
              toolMetadata.set(key, toolCall);
              yield {
                type: "tool_call_start",
                toolCall,
              };
            }

            if (currentArgs && currentArgs !== previousArgs) {
              // 参数发生增量变化，发送对应的 delta
              const argumentDelta = currentArgs.slice(previousArgs.length);
              if (argumentDelta) {
                yield {
                  type: "tool_call_delta",
                  toolCall,
                  argumentDelta,
                };
              }
              toolArgumentBuffers.set(key, currentArgs);
              const existing = toolMetadata.get(key) || toolCall;
              const updated: StreamToolCall = {
                id: existing.id ?? toolCall.id,
                name: existing.name ?? toolCall.name,
                rawArguments: currentArgs || existing.rawArguments,
                arguments: toolCall.arguments ?? existing.arguments,
              };
              toolMetadata.set(key, updated);
            }
          }

          // 所有工具参数收集完毕，发送汇总事件
          yield {
            type: "tool_calls_complete",
            toolCalls: normalized.map((call, index) => {
              const key = call.id || `${call.name}_${index}`;
              return toolMetadata.get(key) || call;
            }),
          };

          for (let index = 0; index < normalized.length; index++) {
            const call = normalized[index];
            const key = call.id || `${call.name}_${index}`;
            if (!emittedToolExecute.has(key)) {
              // 标记执行开始，供上层触发实际工具调用
              emittedToolExecute.add(key);
              const meta = toolMetadata.get(key) || call;
              yield {
                type: "tool_execute",
                toolCall: meta,
              };
            }
          }

          finalOutputCandidate = "";
        } else {
          finalOutputCandidate = content;
        }
      } else if (messageType.includes("tool")) {
        // LangChain 转发的工具响应，包装为统一的 tool_result
        const content = extractMessageContent(lastMessage);
        const toolCallId = lastMessage.tool_call_id || undefined;
        const key =
          toolCallId ||
          `${(lastMessage as any)?.name || "tool"}_${toolArgumentBuffers.size}`;
        const meta = toolMetadata.get(key);
        yield {
          type: "tool_result",
          toolCallId,
          toolCall: meta,
          result: content,
          confirmed: true,
        };
      }
    }
  }

  if (finalOutputCandidate) {
    // 如果最后一个 AI 消息包含最终文本，发送 final_output
    yield { type: "final_output", output: finalOutputCandidate };
  }
}

export async function createAgentWithMCPTools(
  config: MCPConfig,
  llmOptions?: LLMOptions
): Promise<{
  agent: any; // 包装后的 agent，带统一 stream
  clients: MCPClientWrapper[];
  cleanup: () => Promise<void>;
  tools: any[]; // 工具列表，用于命令显示
  confirmationManager: ToolConfirmationManager; // 确认管理器
}> {
  const clients: MCPClientWrapper[] = [];
  const tools: any[] = [];

  // 初始化所有MCP客户端
  for (const serverConfig of config.mcpServers) {
    try {
      const client = new MCPClientWrapper(serverConfig);
      await client.connect();
      clients.push(client);

      // 尝试使用官方适配器
      let serverTools: any[] = [];
      
      try {
        // 优先尝试使用官方适配器加载工具（带更多元数据）
        const mcpTools = await loadMcpTools(
          serverConfig.name,
          client.getClient(),
          {
            throwOnLoadError: false,
            prefixToolNameWithServerName: true,
            additionalToolNamePrefix: "",
            useStandardContentBlocks: false,
          }
        );
        serverTools = mcpTools as any[];
      } catch (error) {
        // 适配器失败时回退到手动转换
        console.warn(
          `使用官方适配器加载 ${serverConfig.name} 的工具失败，改用手动转换:`,
          error instanceof Error ? error.message : error
        );
        // 回退到手动转换
        const mcpTools = await client.listTools();
        serverTools = mcpTools.map((tool) =>
          convertMCPToolToLangChainTool(tool, client, serverConfig.name)
        );
      }

      tools.push(...serverTools);
      console.log(
        `✓ 已加载 ${serverConfig.name}: ${serverTools.length} 个工具`
      );
    } catch (error) {
      console.error(
        `✗ 加载服务器 ${serverConfig.name} 失败:`,
        error instanceof Error ? error.message : error
      );
      // 继续加载其他服务器
    }
  }

  if (tools.length === 0) {
    throw new Error("没有成功加载任何MCP工具");
  }

  // 创建确认管理器并设置为全局，供转换后的工具共享
  const confirmationManager = new ToolConfirmationManager(
    llmOptions?.authorizationPolicy
  );
  setGlobalConfirmationManager(confirmationManager);

  // 创建LLM实例
  const apiKey = llmOptions?.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = llmOptions?.baseURL || process.env.OPENAI_BASE_URL||"https://api.openai.com/v1";
  if (!apiKey) {
    throw new Error(
      "缺少 OpenAI API Key。请设置 OPENAI_API_KEY 环境变量或在配置中提供"
    );
  }

  // 检查是否为占位符
  if (apiKey.includes("your-") || apiKey.includes("placeholder") || apiKey.length < 20) {
    throw new Error(
      `❌ 检测到无效的 API Key。请在 .env 文件中设置有效的 OPENAI_API_KEY。\n` +
      `   当前值: ${apiKey.substring(0, 20)}...\n` +
      `   请将 .env 文件中的 OPENAI_API_KEY 替换为您的真实 API key。`
    );
  }

  const llm = new ChatOpenAI({
    // 直接配置基础模型，与工具列表解耦
    configuration: {
      baseURL: baseURL
    },
    model: llmOptions?.model || "gpt-4o-mini",
    temperature: llmOptions?.temperature ?? 0,
    openAIApiKey: apiKey,
  });

  // 创建prompt模板
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个有用的AI助手。你可以使用工具来回答问题。"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // 使用 createToolCallingAgent（0.3.x 版本的 API）
  // 注意：不要绑定 tools 到 LLM，createToolCallingAgent 会处理
  const agentRunnable = await createToolCallingAgent({
    llm,
    tools,
    prompt,
  });

  // 使用 AgentExecutor 包装 agent，这样才能正确执行工具调用
  const agent = new AgentExecutor({
    agent: agentRunnable,
    tools,
    verbose: false,
  });

  // 清理函数
  const cleanup = async () => {
    for (const client of clients) {
      try {
        await client.disconnect();
      } catch (error) {
        console.error(`清理客户端失败:`, error);
      }
    }
  };

  const wrappedAgent = {
    tools,
    executor: agent,
    invoke: async (params: { input: string } | string) => {
      const payload =
        typeof params === "string" ? { input: params } : params;
      return agent.invoke(payload);
    },
    stream: (input: string): AsyncGenerator<StreamEvent, void, unknown> =>
      createLangChainUnifiedStream(agent, input),
  };

  return {
    agent: wrappedAgent,
    clients,
    cleanup,
    tools,
    confirmationManager, // 返回确认管理器，以便 REPL 可以设置 readline
  };
}

