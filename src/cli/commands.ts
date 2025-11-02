import { MCPConfig } from "../types/mcp-config.js";

/**
 * REPL上下文
 */
export interface REPLContext {
  agent: any; // AgentExecutor 包装的 agent
  config: MCPConfig;
  clients?: any[];
  tools?: any[]; // 工具列表
}

/**
 * 命令处理函数类型
 */
export type CommandHandler = (
  args: string[],
  context: REPLContext
) => Promise<void> | void;

/**
 * 命令注册表
 */
export const commands = new Map<string, CommandHandler>();

/**
 * 列出所有可用工具
 */
commands.set("list-tools", async (args, context) => {
  // 优先使用 context 中的 tools，否则尝试从 agent 获取
  const tools = context.tools || context.agent.tools || context.agent.getTools?.() || [];
  if (tools.length === 0) {
    console.log("当前没有可用的工具");
    return;
  }
  
  console.log("\n可用工具:");
  console.log("=".repeat(50));
  tools.forEach((tool: any, index: number) => {
    // 兼容不同的工具格式
    const toolName = tool.name || tool.function?.name || `工具 ${index + 1}`;
    const toolDesc = tool.description || tool.function?.description || "无描述";
    console.log(`${index + 1}. ${toolName}`);
    if (toolDesc && toolDesc !== "无描述") {
      console.log(`   描述: ${toolDesc}`);
    }
    // 如果是原生工具，显示更多信息
    if (tool.serverName && tool.mcpToolName) {
      console.log(`   来源: ${tool.serverName} / ${tool.mcpToolName}`);
    }
  });
  console.log("=".repeat(50));
});

/**
 * 显示帮助信息
 */
commands.set("help", async () => {
  console.log("\n可用命令:");
  console.log("  /list-tools  - 列出所有可用工具");
  console.log("  /reload      - 重新加载配置和工具");
  console.log("  /exit        - 退出程序");
  console.log("  /help        - 显示此帮助信息");
  console.log("\n提示: 直接输入问题或指令，Agent将自动使用工具回答");
});

/**
 * 退出程序
 */
commands.set("exit", async () => {
  console.log("\n再见！");
  process.exit(0);
});

/**
 * 重新加载（占位符，实际需要重新创建agent）
 */
commands.set("reload", async (args, context) => {
  console.log("\n重新加载功能需要重启程序才能生效");
  console.log("请退出并重新启动程序");
});

/**
 * 处理命令输入
 */
export async function handleCommand(
  input: string,
  context: REPLContext
): Promise<boolean> {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith("/")) {
    return false;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = commands.get(commandName);
  if (!handler) {
    console.log(`未知命令: ${commandName}`);
    console.log('输入 "/help" 查看可用命令');
    return true; // 已处理（虽然无效）
  }

  try {
    await handler(args, context);
  } catch (error) {
    console.error(
      `执行命令失败:`,
      error instanceof Error ? error.message : error
    );
  }

  return true;
}

