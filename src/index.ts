import { config } from "dotenv";
import { loadMCPConfig } from "./config/mcp-config.js";
import { createAgentWithMCPTools } from "./agent/agent-factory.js";
import { startREPL } from "./cli/repl.js";

// 加载 .env 文件
config();

/**
 * 主函数
 */
async function main() {
  try {
    console.log("正在加载MCP配置...");
    const config = await loadMCPConfig();

    console.log(`已加载 ${config.mcpServers.length} 个MCP服务器配置`);
    
    console.log("正在初始化Agent...");
    const { agent, clients, cleanup } = await createAgentWithMCPTools(config, {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0"),
    });

    console.log("Agent初始化完成！\n");

    // 设置优雅退出
    const gracefulExit = async () => {
      console.log("\n\n正在清理资源...");
      await cleanup();
      process.exit(0);
    };

    process.on("SIGINT", gracefulExit);
    process.on("SIGTERM", gracefulExit);

    // 启动REPL
    await startREPL(agent, config, clients);
  } catch (error) {
    console.error("\n❌ 程序启动失败:");
    if (error instanceof Error) {
      console.error(`   错误: ${error.message}`);
      if (error.stack && process.env.DEBUG === "true") {
        console.error("\n堆栈跟踪:");
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// 运行主函数
main();

