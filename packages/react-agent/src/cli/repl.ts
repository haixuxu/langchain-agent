import * as readline from "readline";
import { ReActAgent } from "../react-agent.js";
import { MCPConfig, REPLContext, handleCommand } from "@langchain-agent/core";
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

      // 使用 ReAct Agent 的 invoke 方法
      try {
        const result = await agent.invoke(trimmed);

        // 显示对话过程（包含工具调用）
        let toolCallsShown = false;
        for (let i = 0; i < result.messages.length; i++) {
          const msg = result.messages[i];
          
          // ReAct Agent 会在 assistant 消息中直接包含工具调用的 JSON
          if (msg.role === "assistant" && msg.content) {
            // 尝试检测是否包含工具调用 JSON
            const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = msg.content.match(jsonBlockRegex);
            
            if (match) {
              try {
                const parsed = JSON.parse(match[1].trim());
                if (parsed.action === "tool_call") {
                  if (!toolCallsShown) {
                    console.log("\n🔧 调用工具:");
                    toolCallsShown = true;
                  }
                  console.log(`  - ${parsed.tool_name}`);
                  console.log(`    原因: ${parsed.reasoning || "无"}`);
                  console.log(`    参数: ${JSON.stringify(parsed.arguments, null, 2)}`);
                  console.log();
                }
              } catch {
                // 不是工具调用，忽略
              }
            }
          }
          
          // 工具结果会在 user 消息中（格式：工具调用结果:...）
          if (msg.role === "user" && msg.content.startsWith("工具调用结果:")) {
            const lines = msg.content.split("\n");
            const toolResult = lines.slice(1).join("\n");
            console.log(`📊 ${lines[0]}\n${toolResult}\n`);
          } else if (msg.role === "user" && msg.content.startsWith("工具调用失败:")) {
            console.log(`❌ ${msg.content}\n`);
          }
        }

        // 显示最终输出（只显示不是工具调用的部分）
        const lastMessage = result.messages[result.messages.length - 1];
        if (lastMessage.role === "assistant") {
          // 检查是否包含工具调用 JSON，如果有则只显示 JSON 之后的内容
          const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
          const match = lastMessage.content.match(jsonBlockRegex);
          
          if (match) {
            // 有工具调用，提取 JSON 之后的内容
            const parts = lastMessage.content.split(/```json[\s\S]*?```/);
            if (parts.length > 1 && parts[parts.length - 1].trim()) {
              console.log(parts[parts.length - 1].trim());
            }
          } else {
            // 没有工具调用，显示完整内容
            console.log(lastMessage.content);
          }
        } else {
          // 最后的消息不是 assistant，显示最终输出
          if (result.output) {
            console.log(result.output);
          }
        }
      } catch (error) {
        // 如果 invoke 失败，尝试使用 stream
        console.warn("invoke 失败，尝试使用 stream...");
        
        try {
          let hasContent = false;
          let toolCallsShown = false;
          let accumulatedContent = "";

          for await (const chunk of agent.stream(trimmed)) {
            if (chunk.type === "content") {
              process.stdout.write(chunk.content);
              accumulatedContent += chunk.content;
              hasContent = true;
            } else if (chunk.type === "tool_call") {
              if (!toolCallsShown) {
                console.log("\n\n🔧 调用工具:");
                toolCallsShown = true;
              }
              console.log(`  - ${chunk.tool_call.name}`);
              console.log(`    参数: ${JSON.stringify(chunk.tool_call.arguments, null, 2)}`);
            } else if (chunk.type === "tool_execute") {
              console.log(`\n⏳ 执行工具: ${chunk.tool_call.name}...`);
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

