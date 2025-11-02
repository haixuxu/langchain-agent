import { MCPConfig, MCPClientWrapper, AuthorizationPolicy } from "@langchain-agent/core";
import { NativeTool, convertMCPToolToOpenAIFunction } from "./tool-converter.js";
import { NativeAgent } from "./native-agent.js";

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
 * 创建带有MCP工具的原生 Agent
 */
export async function createNativeAgentWithMCPTools(
  config: MCPConfig,
  llmOptions?: LLMOptions
): Promise<{
  agent: NativeAgent;
  clients: MCPClientWrapper[];
  cleanup: () => Promise<void>;
  tools: NativeTool[];
}> {
  const clients: MCPClientWrapper[] = [];
  const tools: NativeTool[] = [];

  // 初始化所有MCP客户端
  for (const serverConfig of config.mcpServers) {
    try {
      const client = new MCPClientWrapper(serverConfig);
      await client.connect();
      clients.push(client);

      // 加载并转换工具
      const mcpTools = await client.listTools();
      const serverTools = mcpTools.map((tool) =>
        convertMCPToolToOpenAIFunction(tool, client, serverConfig.name)
      );

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

  // 获取 LLM 配置
  const apiKey = llmOptions?.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = llmOptions?.baseURL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  
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

  // 创建原生 Agent（传入授权策略）
  const agent = new NativeAgent(
    apiKey,
    baseURL,
    llmOptions?.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
    tools,
    10, // maxIterations
    llmOptions?.authorizationPolicy
  );

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

  return { agent, clients, cleanup, tools };
}

