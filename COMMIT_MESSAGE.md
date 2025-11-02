refactor: 重构为 monorepo 架构，分离 LangChain 和 Native 实现

将项目重构为 monorepo 结构，使用 pnpm workspaces 管理多个包。

主要变更：

1. Monorepo 结构
   - 创建 pnpm-workspace.yaml，配置 workspace
   - 更新根目录 package.json，添加 monorepo 脚本
   - 更新 tsconfig.json 为项目引用模式
   - 更新 .gitignore，添加 packages/*/node_modules 和 .pnpm-store

2. 创建共享核心包 (packages/core)
   - MCP 客户端封装 (mcp/mcp-client.ts)
   - 传输层工厂 (mcp/transport-factory.ts)
   - 配置加载器 (config/mcp-config.ts)
   - 类型定义 (types/mcp-config.ts)
   - CLI 命令处理 (cli/commands.ts)
   - 统一导出入口 (index.ts)
   - 修复 Transport 类型导入（从 shared/transport 导入）

3. LangChain Agent 包 (packages/langchain-agent)
   - 迁移 agent-factory.ts
   - 迁移 CLI REPL (cli/repl.ts)
   - 迁移主入口文件 (index.ts)
   - 更新导入路径，使用 @langchain-agent/core
   - 修复 .env 文件读取路径，使用 process.cwd()

4. Native Agent 包 (packages/native-agent)
   - 迁移所有原生 Agent 实现
   - 修复 OpenAI SDK 工具调用类型问题
   - 修复 .env 文件读取路径，使用 process.cwd()
   - 更新导入路径，使用 @langchain-agent/core

5. 配置文件读取修复
   - .env 文件从 process.cwd() 读取（而不是相对路径）
   - mcp_settings.json 从 process.cwd() 读取
   - 更新包的 dev 脚本，切换到根目录执行

6. 其他改进
   - 更新 README.md，添加 monorepo 使用说明
   - 创建 MIGRATION.md，说明迁移内容
   - 修复所有 TypeScript 编译错误
   - 所有包都能成功构建

包结构：
- packages/core: 共享核心功能
- packages/langchain-agent: LangChain 实现
- packages/native-agent: Native OpenAI 实现

使用方法：
  npm run dev:langchain  # 开发模式运行 LangChain Agent
  npm run dev:native     # 开发模式运行 Native Agent
  pnpm build             # 构建所有包
