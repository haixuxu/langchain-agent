import { Agent, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { MCPConfig } from "../types/mcp-config.js";
import { MCPClientWrapper } from "../mcp/mcp-client.js";
import { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpTools } from "@langchain/mcp-adapters";

/**
 * LLM配置选项
 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
}

/**
 * 将MCP工具转换为LangChain工具
 */
function convertMCPToolToLangChainTool(
  tool: MCPTool,
  client: MCPClientWrapper,
  serverName: string
): StructuredTool {
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
  
  return new StructuredTool({
    name: toolName,
    description: tool.description || `调用 ${serverName} 服务器的 ${tool.name} 工具`,
    schema: z.object(inputSchema),
    func: async (input: any) => {
      try {
        const result = await client.callTool(tool.name, input);
        
        // 处理MCP工具返回结果
        if (result.content && Array.isArray(result.content)) {
          return result.content
            .map((item: any) => {
              if (typeof item === "string") return item;
              if (item.type === "text" && item.text) return item.text;
              return JSON.stringify(item);
            })
            .join("\n");
        }
        
        if (result.content) {
          return typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content);
        }
        
        return JSON.stringify(result);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`工具调用失败: ${error.message}`);
        }
        throw error;
      }
    },
  });
}

/**
 * 创建带有MCP工具的LangChain Agent
 */
export async function createAgentWithMCPTools(
  config: MCPConfig,
  llmOptions?: LLMOptions
): Promise<{
  agent: any; // createToolCallingAgent 返回的是 Runnable 类型，不是 Agent
  clients: MCPClientWrapper[];
  cleanup: () => Promise<void>;
}> {
  const clients: MCPClientWrapper[] = [];
  const tools: StructuredTool[] = [];

  // 初始化所有MCP客户端
  for (const serverConfig of config.mcpServers) {
    try {
      const client = new MCPClientWrapper(serverConfig);
      await client.connect();
      clients.push(client);

      // 尝试使用官方适配器
      let serverTools: StructuredTool[] = [];
      
      try {
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
        serverTools = mcpTools;
      } catch (error) {
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

  // 创建LLM实例
  const apiKey = llmOptions?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "缺少 OpenAI API Key。请设置 OPENAI_API_KEY 环境变量或在配置中提供"
    );
  }

  const llm = new ChatOpenAI({
    model: llmOptions?.model || "gpt-4o-mini",
    temperature: llmOptions?.temperature ?? 0,
    openAIApiKey: apiKey,
  });

  // 创建prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个有用的AI助手。你可以使用工具来回答问题。"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // 创建Agent
  const agent = await createToolCallingAgent({
    llm,
    tools,
    prompt,
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

  return { agent, clients, cleanup };
}

