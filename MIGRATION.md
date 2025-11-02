# 迁移说明

本项目已从单包结构迁移到 monorepo 结构。

## 新结构

代码已重新组织为以下 monorepo 结构：

```
packages/
├── core/              # 共享代码（MCP 客户端、配置、类型、CLI 命令）
├── langchain-agent/   # LangChain 实现
└── native-agent/      # Native 实现
```

## 主要变化

1. **共享代码移至 `packages/core`**：
   - `src/mcp/` → `packages/core/src/mcp/`
   - `src/config/` → `packages/core/src/config/`
   - `src/types/` → `packages/core/src/types/`
   - `src/cli/commands.ts` → `packages/core/src/cli/commands.ts`

2. **LangChain 实现移至 `packages/langchain-agent`**：
   - `src/agent/agent-factory.ts` → `packages/langchain-agent/src/agent-factory.ts`
   - `src/cli/repl.ts` → `packages/langchain-agent/src/cli/repl.ts`
   - `src/index.ts` → `packages/langchain-agent/src/index.ts`

3. **Native 实现移至 `packages/native-agent`**：
   - `src/agent/native/*` → `packages/native-agent/src/*`

4. **导入路径更新**：
   - 所有从 `../types/mcp-config.js` 的导入改为 `@langchain-agent/core`
   - 所有从 `../mcp/mcp-client.js` 的导入改为 `@langchain-agent/core`
   - 其他相关导入也相应更新

## 旧代码清理

旧的 `src/` 目录已不再使用，可以安全删除：

```bash
rm -rf src/
```

## 使用新结构

### 安装依赖

```bash
pnpm install
```

### 运行 LangChain Agent

```bash
pnpm dev:langchain
```

### 运行 Native Agent

```bash
pnpm dev:native
```

### 构建

```bash
pnpm build
```

## 注意事项

- 配置文件 `mcp_settings.json` 和 `.env` 仍位于项目根目录
- 所有包的 TypeScript 配置已独立配置
- 使用 pnpm workspaces 管理依赖

