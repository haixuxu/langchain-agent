import * as readline from "readline";

/**
 * 确认结果
 */
export type ConfirmationResult = "yes" | "no" | "all" | "stop";

/**
 * 授权策略配置
 */
export interface AuthorizationPolicy {
  /**
   * 是否需要用户确认工具调用
   * @default true
   */
  requireConfirmation?: boolean;
  
  /**
   * 自动批准的工具名称列表（不需要确认）
   */
  autoApproveTools?: string[];
  
  /**
   * 危险工具列表（必须确认，即使 autoApproveTools 中有）
   */
  dangerousTools?: string[];
  
  /**
   * 全局自动批准状态（用户选择 "all" 后生效）
   */
  autoApproveAll?: boolean;
}

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  toolName: string;
  arguments: Record<string, any> | string;
  serverName?: string;
}

/**
 * 工具确认管理器
 */
export class ToolConfirmationManager {
  private policy: AuthorizationPolicy;
  private rl?: readline.Interface;

  constructor(
    policy: AuthorizationPolicy = {},
    rl?: readline.Interface
  ) {
    this.policy = {
      requireConfirmation: true,
      autoApproveTools: [],
      dangerousTools: [],
      autoApproveAll: false,
      ...policy,
    };
    this.rl = rl;
  }

  /**
   * 更新策略
   */
  updatePolicy(policy: Partial<AuthorizationPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * 设置 readline 接口（用于交互式确认）
   */
  setReadlineInterface(rl: readline.Interface): void {
    this.rl = rl;
  }

  /**
   * 检查是否需要确认
   */
  async shouldConfirm(toolCall: ToolCallInfo): Promise<boolean> {
    // 如果全局自动批准，且不是危险工具，则不需要确认
    if (this.policy.autoApproveAll && !this.isDangerousTool(toolCall.toolName)) {
      return false;
    }

    // 如果不需要确认，直接返回 false
    if (!this.policy.requireConfirmation) {
      return false;
    }

    // 如果在自动批准列表中，且不是危险工具，则不需要确认
    if (
      this.policy.autoApproveTools?.includes(toolCall.toolName) &&
      !this.isDangerousTool(toolCall.toolName)
    ) {
      return false;
    }

    // 危险工具总是需要确认
    if (this.isDangerousTool(toolCall.toolName)) {
      return true;
    }

    // 默认需要确认
    return true;
  }

  /**
   * 检查是否为危险工具
   */
  private isDangerousTool(toolName: string): boolean {
    const dangerousPatterns = this.policy.dangerousTools || [];
    return dangerousPatterns.some((pattern) => {
      if (pattern.includes("*")) {
        // 支持通配符匹配
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*") + "$"
        );
        return regex.test(toolName);
      }
      return toolName === pattern || toolName.endsWith(`_${pattern}`);
    });
  }

  /**
   * 请求用户确认
   */
  async requestConfirmation(
    toolCall: ToolCallInfo
  ): Promise<ConfirmationResult> {
    const argsStr =
      typeof toolCall.arguments === "string"
        ? toolCall.arguments
        : JSON.stringify(toolCall.arguments, null, 2);

    console.log("\n" + "⚠️".repeat(20));
    console.log("🔧 准备调用工具:");
    console.log(`   工具名称: ${toolCall.toolName}`);
    if (toolCall.serverName) {
      console.log(`   服务器: ${toolCall.serverName}`);
    }
    console.log(`   参数:`);
    console.log(`   ${argsStr.split("\n").join("\n   ")}`);

    if (this.isDangerousTool(toolCall.toolName)) {
      console.log(`\n   ⚠️  警告: 这是一个危险工具操作！`);
    }

    console.log("\n   选项:");
    console.log("     y    - 确认执行此工具调用");
    console.log("     n    - 取消此工具调用");
    console.log("     all  - 确认执行，并自动批准后续所有调用");
    console.log("     stop - 停止整个对话");

    if (!this.rl) {
      // 如果没有 readline 接口，默认拒绝（安全第一）
      console.log("\n   ⚠️  无交互接口，默认拒绝执行");
      return "no";
    }

    return new Promise<ConfirmationResult>((resolve) => {
      const question = "\n   请选择 (y/n/all/stop): ";
      this.rl!.question(question, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        switch (trimmed) {
          case "y":
          case "yes":
            resolve("yes");
            break;
          case "n":
          case "no":
            resolve("no");
            break;
          case "all":
            this.policy.autoApproveAll = true;
            console.log("\n   ✓ 已启用全局自动批准");
            resolve("all");
            break;
          case "stop":
          case "exit":
          case "quit":
            resolve("stop");
            break;
          default:
            console.log("\n   ⚠️  无效选择，默认取消");
            resolve("no");
            break;
        }
      });
    });
  }

  /**
   * 显示工具调用信息（不等待确认，用于日志记录）
   */
  displayToolCall(toolCall: ToolCallInfo, executed: boolean = false): void {
    const argsStr =
      typeof toolCall.arguments === "string"
        ? toolCall.arguments
        : JSON.stringify(toolCall.arguments, null, 2);

    const status = executed ? "✓" : "🔧";
    console.log(`\n${status} ${executed ? "已执行" : "准备调用"}工具: ${toolCall.toolName}`);
    if (toolCall.serverName) {
      console.log(`   服务器: ${toolCall.serverName}`);
    }
    console.log(`   参数: ${argsStr}`);
  }

  /**
   * 显示工具执行结果
   */
  displayToolResult(toolCall: ToolCallInfo, result: string, success: boolean = true): void {
    const icon = success ? "📊" : "❌";
    const status = success ? "成功" : "失败";
    console.log(`\n${icon} 工具执行${status}:`);
    console.log(`   工具: ${toolCall.toolName}`);
    if (!success) {
      console.log(`   结果: ${result}`);
    } else if (result.length > 200) {
      console.log(`   结果: ${result.substring(0, 200)}...`);
    } else {
      console.log(`   结果: ${result}`);
    }
  }
}

