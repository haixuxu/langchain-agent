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
  tools?: any[]
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

      // AgentExecutor 的输入格式是 { input: string }
      // 先尝试使用 invoke 方法获取完整响应
      try {
        const result = await agent.invoke({
          input: trimmed,
        });

        // 处理 AgentExecutor 的输出
        // 调试：输出完整结果结构
        if (process.env.DEBUG === "true") {
          console.log("完整响应结构:", JSON.stringify(result, null, 2));
        }

        if (result.output) {
          console.log(result.output);
        } else if (result.messages && Array.isArray(result.messages)) {
          // 从 messages 中提取最后的 AI 响应
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
          // 如果没有找到预期的字段，尝试直接输出整个结果
          console.log("响应:", JSON.stringify(result, null, 2));
        }
      } catch (invokeError) {
        // 如果 invoke 失败，尝试使用 stream
        console.warn("invoke 失败，尝试使用 stream...");
        
        const stream = await agent.stream(
          {
            input: trimmed,
          },
          { streamMode: "values" }
        );

        let hasOutput = false;
        for await (const chunk of stream) {
          // 调试：输出 chunk 结构
          if (process.env.DEBUG === "true") {
            console.log("Chunk:", JSON.stringify(chunk, null, 2));
          }

          // AgentExecutor 的流式输出可能包含 output 或 messages
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
              } else if (messageType === "tool" || messageType.includes("Tool")) {
                const toolMessage = lastMessage as any;
                if (toolMessage.content) {
                  console.log(`\n📊 工具结果:\n${toolMessage.content}\n`);
                  hasOutput = true;
                }
              }
            }
          }
        }
        
        if (!hasOutput) {
          console.log("（无响应内容）");
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

