import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { MCPConfig, RawMCPConfig, MCPConfigSchema, MCPServerConfig } from "../types/mcp-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 从环境变量加载配置文件路径
 */
function getConfigPath(): string {
  const envPath = process.env.MCP_CONFIG_PATH;
  if (envPath) {
    return envPath;
  }
  
  // 默认查找项目根目录下的 mcp_settings.json
  const projectRoot = join(__dirname, "../..");
  return join(projectRoot, "mcp_settings.json");
}

/**
 * 将 Cursor/Cline 格式转换为内部格式
 */
function convertConfigFormat(rawConfig: RawMCPConfig): MCPConfig {
  const servers: MCPServerConfig[] = [];
  
  for (const [serverName, serverConfig] of Object.entries(rawConfig.mcpServers)) {
    const config: MCPServerConfig = {
      name: serverName,
      transport: "stdio", // 默认值，会被覆盖
    };
    
    // 判断传输类型并填充配置
    if ("command" in serverConfig) {
      // Stdio 传输
      config.transport = "stdio";
      config.command = serverConfig.command;
      config.args = serverConfig.args || [];
      if (serverConfig.env) {
        config.env = serverConfig.env;
      }
      if (serverConfig.restart) {
        config.restart = serverConfig.restart;
      }
    } else if ("url" in serverConfig) {
      // HTTP 或 SSE 传输
      config.transport = serverConfig.transport === "sse" ? "sse" : "http";
      config.url = serverConfig.url;
      if (serverConfig.headers) {
        config.headers = serverConfig.headers;
      }
      if (serverConfig.env) {
        config.env = serverConfig.env;
      }
      if (serverConfig.reconnect) {
        config.reconnect = serverConfig.reconnect;
      }
    } else {
      throw new Error(`服务器 ${serverName} 的配置无效：必须包含 command 或 url`);
    }
    
    servers.push(config);
  }
  
  return { mcpServers: servers };
}

/**
 * 加载并验证MCP配置
 */
export async function loadMCPConfig(filePath?: string): Promise<MCPConfig> {
  const configPath = filePath || getConfigPath();
  
  try {
    const configContent = readFileSync(configPath, "utf-8");
    const configData = JSON.parse(configContent);
    
    // 应用环境变量覆盖
    const mergedConfig = applyEnvOverrides(configData);
    
    // 验证配置格式（Cursor/Cline 格式）
    const rawConfig = MCPConfigSchema.parse(mergedConfig);
    
    // 转换为内部格式
    return convertConfigFormat(rawConfig);
  } catch (error) {
    if (error instanceof Error) {
      if ("code" in error && error.code === "ENOENT") {
        throw new Error(
          `MCP配置文件不存在: ${configPath}\n请创建 mcp_settings.json 配置文件或设置 MCP_CONFIG_PATH 环境变量`
        );
      }
      throw new Error(`加载MCP配置失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 应用环境变量覆盖
 */
function applyEnvOverrides(config: any): any {
  // 可以在这里实现环境变量覆盖逻辑
  // 例如：MCP_SERVER_0_URL 覆盖第一个服务器的URL
  return config;
}


