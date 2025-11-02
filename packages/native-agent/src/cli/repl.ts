import * as readline from "readline";
import { NativeAgent } from "../native-agent.js";
import { MCPConfig, REPLContext, handleCommand } from "@langchain-agent/core";
import { NativeTool } from "../tool-converter.js";

/**
 * 启动交互式REPL（原生 Agent 版本）
 */
export async function startNativeREPL(
  agent: NativeAgent,
  config: MCPConfig,
  clients?: any[],
  tools?: NativeTool[]
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n🤖 > ",
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
  console.log("🤖 Native Agent with MCP Support (不使用 LangChain)");
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

      // 使用原生 Agent 的 invoke 方法
      try {
        const result = await agent.invoke(trimmed);

        // 显示最终输出（工具调用过程已由确认管理器处理）
        if (result.output) {
          console.log("\n" + result.output);
        }
      } catch (error) {
        // 如果 invoke 失败，尝试使用 stream
        console.warn("invoke 失败，尝试使用 stream...");
        
        try {
          let hasContent = false;
          let currentToolCalls: any[] = [];
          let toolCallsShown = false;

          for await (const chunk of agent.stream(trimmed)) {
            if (chunk.type === "content") {
              process.stdout.write(chunk.content);
              hasContent = true;
            } else if (chunk.type === "tool_call_start") {
              // 工具调用开始（确认管理器会处理确认提示）
              currentToolCalls.push(chunk.tool_call);
            } else if (chunk.type === "tool_calls") {
              currentToolCalls = chunk.tool_calls;
            } else if (chunk.type === "tool_result") {
              // 工具结果（确认管理器已显示，这里不再重复显示）
              if (chunk.confirmed === false) {
                console.log(`\n⚠️  工具调用被取消或未确认\n`);
              }
            } else if (chunk.type === "tool_error") {
              console.log(`\n❌ 工具错误: ${chunk.error}\n`);
            } else if (chunk.type === "stopped") {
              console.log(`\n\n${chunk.message}`);
              hasContent = true; // 标记为有内容，避免显示"无响应"
            }
          }
          
          if (!hasContent && !toolCallsShown) {
            console.log("（无响应内容）");
          }
        } catch (streamError) {
          throw streamError;
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

