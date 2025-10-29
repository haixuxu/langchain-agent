import { z } from "zod";

/**
 * MCP服务器重启配置
 */
export const RestartConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxAttempts: z.number().min(1).default(3),
  delayMs: z.number().min(0).default(1000),
});

/**
 * MCP服务器重连配置
 */
export const ReconnectConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxAttempts: z.number().min(1).default(5),
  delayMs: z.number().min(0).default(2000),
});

/**
 * Stdio传输配置（Cursor/Cline 格式）
 * 当存在 command 字段时，自动识别为 stdio 传输
 */
export const StdioServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string()).optional(),
  restart: RestartConfigSchema.optional(),
});

/**
 * HTTP/SSE传输配置（Cursor/Cline 格式）
 * 当存在 url 字段时，根据 transport 字段判断类型（默认为 http）
 */
export const HTTPServerConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.literal("http").optional().default("http"),
  reconnect: ReconnectConfigSchema.optional(),
});

export const SSEServerConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.literal("sse"),
  reconnect: ReconnectConfigSchema.optional(),
});

/**
 * MCP服务器配置（Cursor/Cline 格式 - 联合类型）
 */
export const MCPServerConfigSchema = z.union([
  StdioServerConfigSchema,
  HTTPServerConfigSchema,
  SSEServerConfigSchema,
]);

/**
 * MCP完整配置（Cursor/Cline 格式）
 * mcpServers 是一个对象，键是服务器名称，值是服务器配置
 */
export const MCPConfigSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema).refine(
    (servers) => Object.keys(servers).length > 0,
    { message: "至少需要一个MCP服务器配置" }
  ),
});

/**
 * 内部使用的传输类型（用于兼容现有代码）
 */
export type TransportType = "stdio" | "http" | "sse";

/**
 * 内部使用的服务器配置（包含传输类型和名称）
 */
export interface MCPServerConfig {
  name: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  restart?: z.infer<typeof RestartConfigSchema>;
  reconnect?: z.infer<typeof ReconnectConfigSchema>;
}

export type RestartConfig = z.infer<typeof RestartConfigSchema>;
export type ReconnectConfig = z.infer<typeof ReconnectConfigSchema>;

/**
 * 原始配置文件格式（Cursor/Cline 格式）
 */
export type RawMCPConfig = z.infer<typeof MCPConfigSchema>;

/**
 * 内部使用的配置格式（包含转换后的服务器列表）
 */
export interface MCPConfig {
  mcpServers: MCPServerConfig[];
}

