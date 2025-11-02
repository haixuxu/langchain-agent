# 工具调用确认机制使用指南

## 概述

现在所有的 Agent 都支持工具调用前的用户确认机制。这增强了安全性，允许用户在工具执行前审查和授权。

## 功能特性

### 1. 交互式确认提示

当 Agent 需要调用工具时，会显示：
- 工具名称
- 服务器来源
- 调用参数
- 是否为危险工具（如果配置了危险工具列表）

用户可以选择：
- `y` 或 `yes` - 确认执行此工具调用
- `n` 或 `no` - 取消此工具调用
- `all` - 确认执行，并自动批准后续所有调用（除非是危险工具）
- `stop` - 停止整个对话

### 2. 授权策略配置

可以通过 `AuthorizationPolicy` 配置授权行为：

```typescript
import { AuthorizationPolicy } from "@langchain-agent/core";

const policy: AuthorizationPolicy = {
  // 是否需要进行确认（默认：true）
  requireConfirmation: true,
  
  // 自动批准的工具列表（这些工具不需要确认）
  autoApproveTools: [
    "context7_get-library-docs",
    "context7_resolve-library-id"
  ],
  
  // 危险工具列表（这些工具总是需要确认，即使 autoApproveTools 中有）
  dangerousTools: [
    "*delete*",
    "*remove*",
    "*write*",
    "*update*"
  ]
};
```

### 3. 通配符支持

危险工具列表支持通配符模式：
- `*delete*` - 匹配任何包含 "delete" 的工具名
- `*_write*` - 匹配任何包含 "_write" 的工具名

## 使用示例

### 基本使用（默认需要确认）

```typescript
import { createNativeAgentWithMCPTools } from "@langchain-agent/native-agent";
import { loadMCPConfig } from "@langchain-agent/core";

const config = await loadMCPConfig("mcp_settings.json");
const { agent, cleanup } = await createNativeAgentWithMCPTools(config);

// 在 REPL 中，工具调用会自动请求确认
// 或者在代码中使用：
agent.setReadlineInterface(readlineInterface); // 如果使用 REPL
```

### 配置自动批准列表

```typescript
const { agent, cleanup } = await createNativeAgentWithMCPTools(config, {
  model: "gpt-4o-mini",
  authorizationPolicy: {
    requireConfirmation: true,
    autoApproveTools: [
      "context7_get-library-docs",
      "context7_resolve-library-id"
    ]
  }
});
```

### 禁用确认（不推荐）

```typescript
const { agent, cleanup } = await createNativeAgentWithMCPTools(config, {
  authorizationPolicy: {
    requireConfirmation: false  // 禁用确认（安全风险！）
  }
});
```

### 动态更新授权策略

```typescript
// 在运行时更新策略
agent.updateAuthorizationPolicy({
  autoApproveTools: ["new-safe-tool"]
});
```

## REPL 中的使用

在 REPL 中，工具调用确认是自动的：

```
🤖 > 帮我查找 React 的文档

🤔 思考中...

⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
🔧 准备调用工具:
   工具名称: context7_resolve-library-id
   服务器: context7
   参数:
   {
     "libraryName": "react"
   }

   选项:
     y    - 确认执行此工具调用
     n    - 取消此工具调用
     all  - 确认执行，并自动批准后续所有调用
     stop - 停止整个对话

   请选择 (y/n/all/stop): y

🔧 准备调用工具: context7_resolve-library-id
   服务器: context7
   参数: {...}

📊 工具执行成功:
   工具: context7_resolve-library-id
   结果: {...}

React 的文档已找到...
```

## 安全最佳实践

1. **默认启用确认**
   - 保持 `requireConfirmation: true` 作为默认值

2. **谨慎配置自动批准**
   - 只为完全安全的工具配置自动批准
   - 避免为文件操作、网络请求等配置自动批准

3. **使用危险工具列表**
   - 为所有可能造成数据丢失或系统修改的工具配置危险工具列表
   - 危险工具总是需要确认，即使在其他列表中

4. **审查工具调用**
   - 仔细查看工具调用的参数
   - 确保参数符合预期

5. **使用 `stop` 命令**
   - 如果发现意外的工具调用，立即使用 `stop` 停止对话

## 示例配置

### 安全的默认配置

```typescript
const safePolicy: AuthorizationPolicy = {
  requireConfirmation: true,
  autoApproveTools: [],  // 不自动批准任何工具
  dangerousTools: [
    "*delete*",
    "*remove*",
    "*write*",
    "*update*",
    "*create*",
    "*send*",
    "*post*",
    "*put*",
    "*patch*"
  ]
};
```

### 开发环境配置（宽松）

```typescript
const devPolicy: AuthorizationPolicy = {
  requireConfirmation: true,
  autoApproveTools: [
    "context7_*",  // 自动批准所有 context7 工具
  ],
  dangerousTools: [
    "*delete*",
    "*remove*"
  ]
};
```

## 注意事项

1. **无交互环境**
   - 如果在非交互式环境中使用（无 readline 接口），工具调用默认会被拒绝
   - 需要配置 `requireConfirmation: false` 或设置适当的自动批准列表

2. **流式响应**
   - 流式响应中的工具调用确认会暂停流式输出
   - 确认完成后，流式输出会继续

3. **工具调用失败**
   - 如果用户拒绝工具调用，Agent 会收到"工具调用被取消"的消息
   - Agent 可以基于这个信息调整策略

## 实现细节

确认机制通过 `ToolConfirmationManager` 类实现：
- 检查是否需要确认
- 请求用户确认
- 显示工具调用信息和结果
- 管理全局自动批准状态

所有 Agent（Native、ReAct）都集成了这个机制。

