import * as readline from "readline";
// Agent 类型已改为 any，因为 createToolCallingAgent 返回的是 Runnable 类型
import { HumanMessage } from "@langchain/core/messages";
import { MCPConfig } from "../types/mcp-config.js";
import { REPLContext, handleCommand } from "./commands.js";

/**
 * 启动交互式REPL
 */
export async function startREPL(
  agent: any, // createToolCallingAgent 返回的是 Runnable 类型
  config: MCPConfig,
  clients?: any[]
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n🤖 > ",
  });

  const context: REPLContext = {
    agent,
    config,
    clients,
  };

  console.log("\n" + "=".repeat(50));
  console.log("🤖 LangChain Agent with MCP Support");
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

      // 使用流式输出
      const stream = await agent.stream(
        {
          messages: [new HumanMessage(trimmed)],
        },
        { streamMode: "values" }
      );

      for await (const chunk of stream) {
        const lastMessage = chunk.messages[chunk.messages.length - 1];

        if (!lastMessage) continue;

        const messageType = lastMessage.constructor.name;

        if (lastMessage instanceof HumanMessage) {
          // 通常不会在这里看到用户消息，但为了完整性保留
        } else if (messageType === "AIMessage" || messageType.includes("AI")) {
          // AI响应
          const aiMessage = lastMessage as any;
          
          if (aiMessage.content) {
            process.stdout.write(aiMessage.content);
            process.stdout.write("\n");
          }

          // 显示工具调用
          if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
            console.log("\n\n🔧 调用工具:");
            for (const toolCall of aiMessage.tool_calls) {
              console.log(`  - ${toolCall.name}`);
              if (toolCall.args) {
                console.log(`    参数: ${JSON.stringify(toolCall.args, null, 2)}`);
              }
            }
            console.log();
          }
        } else if (messageType === "ToolMessage" || messageType.includes("Tool")) {
          // 工具执行结果
          const toolMessage = lastMessage as any;
          if (toolMessage.content) {
            console.log(`\n📊 工具结果:\n${toolMessage.content}\n`);
          }
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

