import * as readline from "readline";
// Agent 类型已改为 any，因为 createToolCallingAgent 返回的是 Runnable 类型
import { HumanMessage } from "@langchain/core/messages";
import { MCPConfig, REPLContext, handleCommand } from "@langchain-agent/core";

/**
 * 启动交互式REPL
 */
export async function startREPL(
  agent: any, // AgentExecutor 包装的 agent
  config: MCPConfig,
  clients?: any[],
  tools?: any[],
  confirmationManager?: any // ToolConfirmationManager
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
    tools,
  };

  // 设置 readline 接口到确认管理器（如果存在）
  if (confirmationManager) {
    confirmationManager.setReadlineInterface(rl);
  }

  console.log("\n" + "=".repeat(50));
  console.log("🤖 LangChain Agent with MCP Support");
  console.log("=".repeat(50));
  console.log('输入 "/help" 查看可用命令');
  console.log('直接输入问题开始对话\n');
  if (confirmationManager) {
    console.log('提示: 工具调用前会请求确认，可以使用 y/n/all/stop 命令\n');
  }

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

      // AgentExecutor 的输入格式是 { input: string }
      // 先尝试使用 invoke 方法获取完整响应
      // 优先使用流式输出：agent.stream 可作为首选路径，保证增量显示
      try {
        const stream = await agent.stream({ input: trimmed }, { streamMode: "values" });

        let hasOutput = false;
        for await (const chunk of stream) {
          if (process.env.DEBUG === "true") {
            console.log("Chunk:", JSON.stringify(chunk, null, 2));
          }

          // 支持多种 chunk 形态：{ output }, { messages }, { value }
          if (chunk.output) {
            process.stdout.write(String(chunk.output));
            hasOutput = true;
          } else if (chunk.messages && Array.isArray(chunk.messages)) {
            const lastMessage = chunk.messages[chunk.messages.length - 1];
            if (lastMessage) {
              const messageType = lastMessage.getType?.() || lastMessage.constructor.name;

              if (messageType === "ai" || messageType.includes("AI")) {
                const aiMessage = lastMessage as any;
                if (aiMessage.content) {
                  const content = typeof aiMessage.content === "string"
                    ? aiMessage.content
                    : JSON.stringify(aiMessage.content);
                  process.stdout.write(content);
                  hasOutput = true;
                }

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
              } else if (messageType === "tool" || messageType.includes("Tool")) {
                const toolMessage = lastMessage as any;
                if (toolMessage.content) {
                  console.log(`\n📊 工具结果:\n${toolMessage.content}\n`);
                  hasOutput = true;
                }
              }
            }
          } else if (chunk.value) {
            // LangChain 某些版本可能产出 value 字段
            process.stdout.write(String(chunk.value));
            hasOutput = true;
          }
        }

        if (!hasOutput) {
          // fallback：尝试调用 invoke 以获取最终结果（非流）
          try {
            const result = await agent.invoke({ input: trimmed });
            if (result.output) console.log(result.output);
            else console.log("（无响应内容）");
          } catch (e) {
            console.log("（无响应内容）");
          }
        }
      } catch (streamError) {
        // 如果流式调用失败，再退回到 invoke
        console.warn("stream 调用失败，退回到 invoke 方法：", streamError instanceof Error ? streamError.message : streamError);
        try {
          const result = await agent.invoke({ input: trimmed });

          if (process.env.DEBUG === "true") {
            console.log("完整响应结构:", JSON.stringify(result, null, 2));
          }

          if (result.output) {
            console.log(result.output);
          } else if (result.messages && Array.isArray(result.messages)) {
            const lastMessage = result.messages[result.messages.length - 1];
            if (lastMessage) {
              const messageType = lastMessage.getType?.() || lastMessage.constructor.name;
              if (messageType === "ai" || messageType.includes("AI")) {
                const aiMessage = lastMessage as any;
                if (aiMessage.content) {
                  const content = typeof aiMessage.content === "string"
                    ? aiMessage.content
                    : JSON.stringify(aiMessage.content);
                  console.log(content);
                }
              }
            }
          } else {
            console.log("响应:", JSON.stringify(result, null, 2));
          }
        } catch (invokeError) {
          console.error("调用 invoke 失败：", invokeError instanceof Error ? invokeError.message : invokeError);
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

