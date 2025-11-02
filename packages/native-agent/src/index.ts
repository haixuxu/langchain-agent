import { config } from "dotenv";
import { resolve } from "path";
import { loadMCPConfig } from "@langchain-agent/core";
import { createNativeAgentWithMCPTools } from "./agent-factory.js";
import { startNativeREPL } from "./cli/repl.js";

// 加载 .env 文件（从当前工作目录）
config({ path: resolve(process.cwd(), ".env") });

/**
 * 主函数
 */
async function main() {
  try {
    console.log("正在加载MCP配置...");
    const config = await loadMCPConfig();

    console.log(`已加载 ${config.mcpServers.length} 个MCP服务器配置`);
    
    console.log("正在初始化原生 Agent...");
    const { agent, clients, cleanup, tools } = await createNativeAgentWithMCPTools(config, {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0"),
    });

    console.log("原生 Agent 初始化完成！\n");

    // 设置优雅退出
    const gracefulExit = async () => {
      console.log("\n\n正在清理资源...");
      await cleanup();
      process.exit(0);
    };

    process.on("SIGINT", gracefulExit);
    process.on("SIGTERM", gracefulExit);

    // 启动REPL
    await startNativeREPL(agent, config, clients, tools);
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

