import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { MCPServerConfig } from "../types/mcp-config.js";
import { createTransport } from "./transport-factory.js";

/**
 * MCP客户端包装类
 * 提供简化的接口来连接和使用MCP服务器
 */
export class MCPClientWrapper {
  private client: Client;
  private transport: Transport;
  private config: MCPServerConfig;
  private connected: boolean = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.client = new Client(
      {
        name: `langchain-agent-client-${config.name}`,
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    // transport 将在 connect() 中初始化
    this.transport = null as any;
  }

  /**
   * 连接到MCP服务器
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.transport = await createTransport(this.config);
      
      // 如果是HTTP传输，添加自定义headers
      if (this.config.transport === "http" && this.config.headers) {
        // StreamableHTTPClientTransport 可能需要特殊处理
        // 这里假设SDK支持headers配置
      }

      await this.client.connect(this.transport);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      if (error instanceof Error) {
        throw new Error(
          `连接MCP服务器失败 (${this.config.name}): ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * 断开MCP服务器连接
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          `断开MCP服务器连接失败 (${this.config.name}): ${error.message}`
        );
      }
      // 即使断开失败，也标记为未连接
      this.connected = false;
    }
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<Tool[]> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const result = await this.client.listTools();
      return result.tools;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `列出工具失败 (${this.config.name}): ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: any): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `调用工具失败 (${this.config.name}/${name}): ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * 获取底层客户端实例（用于适配器）
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * 获取配置信息
   */
  getConfig(): MCPServerConfig {
    return this.config;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }
}

