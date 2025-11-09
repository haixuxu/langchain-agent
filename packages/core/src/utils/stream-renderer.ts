import { StreamEvent } from "../types/stream.js";

/**
 * 负责将 StreamEvent 渲染到控制台的通用工具。
 */
export class StreamConsoleRenderer {
  hasVisibleOutput = false;
  private finalOutput: string | null = null;

  handle(event: StreamEvent): void {
    switch (event.type) {
      case "content":
        process.stdout.write(event.content);
        this.hasVisibleOutput = true;
        break;
      case "tool_call_start":
        console.log("\n\n🔧 调用工具:");
        console.log(`  - ${event.toolCall.name}`);
        if (event.toolCall.rawArguments) {
          try {
            const parsed = JSON.parse(event.toolCall.rawArguments);
            console.log(`    参数: ${JSON.stringify(parsed, null, 2)}`);
          } catch {
            console.log(`    参数: ${event.toolCall.rawArguments}`);
          }
        }
        this.hasVisibleOutput = true;
        break;
      case "tool_call_delta":
        if (event.argumentDelta.trim()) {
          console.log(`    参数片段: ${event.argumentDelta.trim()}`);
          this.hasVisibleOutput = true;
        }
        break;
      case "tool_calls_complete":
        if (event.toolCalls.length > 1) {
          console.log("\n🔧 调用工具（批量）:");
          for (const toolCall of event.toolCalls) {
            console.log(`  - ${toolCall.name}`);
            if (toolCall.rawArguments) {
              try {
                const parsed = JSON.parse(toolCall.rawArguments);
                console.log(`    参数: ${JSON.stringify(parsed, null, 2)}`);
              } catch {
                console.log(`    参数: ${toolCall.rawArguments}`);
              }
            }
          }
          this.hasVisibleOutput = true;
        }
        break;
      case "tool_execute":
        console.log(`\n⏳ 执行工具: ${event.toolCall.name}...`);
        this.hasVisibleOutput = true;
        break;
      case "tool_result":
        if (event.confirmed === false) {
          console.log(`\n⚠️ 工具调用未确认或被取消\n`);
        }
        console.log(`\n📊 工具结果:\n${event.result}\n`);
        this.hasVisibleOutput = true;
        break;
      case "tool_error":
        console.log(`\n❌ 工具错误: ${event.error}\n`);
        this.hasVisibleOutput = true;
        break;
      case "stopped":
        console.log(`\n${event.message}`);
        this.hasVisibleOutput = true;
        break;
      case "final_output":
        this.finalOutput = event.output;
        break;
    }
  }

  /**
   * 在流结束后调用，确保最终输出被打印。
   */
  complete(): void {
    if (!this.hasVisibleOutput && this.finalOutput) {
      console.log(this.finalOutput);
      this.hasVisibleOutput = true;
    }

    if (!this.hasVisibleOutput) {
      console.log("（无响应内容）");
    }

    this.finalOutput = null;
  }
}


