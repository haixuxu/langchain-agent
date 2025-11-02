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

  console.log("\n" + "=".repeat(50));
  console.log("🤖 Native Agent with MCP Support (不使用 LangChain)");
  console.log("=".repeat(50));
  console.log('输入 "/help" 查看可用命令');
  console.log('直接输入问题开始对话\n');

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

        // 显示工具调用过程
        let toolCallsShown = false;
        for (let i = 0; i < result.messages.length; i++) {
          const msg = result.messages[i];
          
          if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
            if (!toolCallsShown) {
              console.log("\n🔧 调用工具:");
              toolCallsShown = true;
            }
            for (const toolCall of msg.tool_calls) {
              console.log(`  - ${toolCall.function.name}`);
              try {
                const args = JSON.parse(toolCall.function.arguments);
                console.log(`    参数: ${JSON.stringify(args, null, 2)}`);
              } catch {
                console.log(`    参数: ${toolCall.function.arguments}`);
              }
            }
            console.log();
          }
          
          if (msg.role === "tool" && msg.content) {
            console.log(`📊 工具结果:\n${msg.content}\n`);
          }
        }

        // 显示最终输出
        if (result.output) {
          console.log(result.output);
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
              if (!toolCallsShown) {
                console.log("\n\n🔧 调用工具:");
                toolCallsShown = true;
              }
              console.log(`  - ${chunk.tool_call.function.name}`);
              try {
                const args = JSON.parse(chunk.tool_call.function.arguments);
                console.log(`    参数: ${JSON.stringify(args, null, 2)}`);
              } catch {
                console.log(`    参数: ${chunk.tool_call.function.arguments}`);
              }
            } else if (chunk.type === "tool_calls") {
              currentToolCalls = chunk.tool_calls;
            } else if (chunk.type === "tool_result") {
              console.log(`\n📊 工具结果:\n${chunk.result}\n`);
            } else if (chunk.type === "tool_error") {
              console.log(`\n❌ 工具错误: ${chunk.error}\n`);
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

