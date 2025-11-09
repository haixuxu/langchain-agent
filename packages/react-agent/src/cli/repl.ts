import * as readline from "readline";
import { ReActAgent } from "../react-agent.js";
import {
  MCPConfig,
  REPLContext,
  handleCommand,
  StreamConsoleRenderer,
  StreamEvent,
} from "@langchain-agent/core";
import { ReActTool } from "../tool-converter.js";

/**
 * 启动交互式REPL（ReAct Agent 版本 - 不使用 function calling）
 */
export async function startReActREPL(
  agent: ReActAgent,
  config: MCPConfig,
  clients?: any[],
  tools?: ReActTool[]
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n🧠 > ",
  });

  const context: REPLContext = {
    agent: agent as any, // 兼容 REPLContext 类型
    config,
    clients,
    tools: tools as any,
  };

  // 设置 readline 接口到 agent，以便确认管理器可以询问用户
  agent.setReadlineInterface(rl);

  console.log("\n" + "=".repeat(50));
  console.log("🧠 ReAct Agent with MCP Support (不使用 Function Calling)");
  console.log("=".repeat(50));
  console.log('输入 "/help" 查看可用命令');
  console.log('直接输入问题开始对话\n');
  console.log('提示: 工具调用前会请求确认，可以使用 y/n/all/stop 命令\n');

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    // 检查是否为命令
    if (trimmed.startsWith("/")) {
      await handleCommand(trimmed, context);
      rl.prompt();
      return;
    }

    // 处理用户输入
    try {
      console.log("\n🤔 思考中...\n");

      // Prefer streaming output first
      try {
        const renderer = new StreamConsoleRenderer();

        for await (const event of agent.stream(trimmed) as AsyncIterable<StreamEvent>) {
          renderer.handle(event);
        }

        renderer.complete();
      } catch (streamError) {
        // If streaming fails, fallback to invoke
        console.warn("stream 失败，退回到 invoke 方法：", streamError instanceof Error ? streamError.message : streamError);
        try {
          const result = await agent.invoke(trimmed);
          // print final result (same as above)
          const lastMessage = result.messages[result.messages.length - 1];
          if (lastMessage?.role === "assistant") {
            const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = lastMessage.content.match(jsonBlockRegex);
            if (match) {
              const parts = lastMessage.content.split(/```json[\s\S]*?```/);
              if (parts.length > 1 && parts[parts.length - 1].trim()) {
                console.log(parts[parts.length - 1].trim());
              }
            } else {
              console.log(lastMessage.content);
            }
          } else {
            if (result.output) console.log(result.output);
          }
        } catch (invokeError) {
          console.error("invoke 失败：", invokeError instanceof Error ? invokeError.message : invokeError);
        }
      }

      console.log("\n");
    } catch (error) {
      console.error(
        "\n❌ 错误:",
        error instanceof Error ? error.message : error
      );
      if (process.env.DEBUG === "true") {
        console.error(error);
      }
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\n\n再见！");
    process.exit(0);
  });
}

