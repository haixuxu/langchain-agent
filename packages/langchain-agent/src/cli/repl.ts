import * as readline from "readline";
// Agent 类型已改为 any，因为 createToolCallingAgent 返回的是 Runnable 类型
import {
  MCPConfig,
  REPLContext,
  handleCommand,
  StreamConsoleRenderer,
  StreamEvent,
} from "@langchain-agent/core";

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

      // 优先使用统一的流式输出
      try {
        const renderer = new StreamConsoleRenderer();

        for await (const event of agent.stream(trimmed) as AsyncIterable<StreamEvent>) {
          renderer.handle(event);
        }

        renderer.complete();
      } catch (streamError) {
        // 如果流式调用失败，再退回到 invoke
        console.warn("stream 调用失败，退回到 invoke 方法：", streamError instanceof Error ? streamError.message : streamError);
        try {
          const result = await agent.invoke(trimmed);

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

