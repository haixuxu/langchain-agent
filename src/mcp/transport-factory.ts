import { ClientTransport } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { MCPServerConfig } from "../types/mcp-config.js";

/**
 * 创建MCP客户端传输实例
 */
export async function createTransport(
  config: MCPServerConfig
): Promise<ClientTransport> {
  switch (config.transport) {
    case "stdio": {
      if (!config.command) {
        throw new Error(
          `Stdio传输配置错误: 缺少 'command' 字段 (服务器: ${config.name})`
        );
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args || [],
      });
    }

    case "http": {
      if (!config.url) {
        throw new Error(
          `HTTP传输配置错误: 缺少 'url' 字段 (服务器: ${config.name})`
        );
      }
      const url = new URL(config.url);
      return new StreamableHTTPClientTransport(url);
    }

    case "sse": {
      if (!config.url) {
        throw new Error(
          `SSE传输配置错误: 缺少 'url' 字段 (服务器: ${config.name})`
        );
      }
      const url = new URL(config.url);
      return new SSEClientTransport(url);
    }

    default:
      throw new Error(
        `不支持的传输类型: ${(config as any).transport} (服务器: ${config.name})`
      );
  }
}

