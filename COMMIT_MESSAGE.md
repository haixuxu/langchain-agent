feat: 添加原生 Agent 实现（不使用 LangChain）

实现了完全独立于 LangChain 的原生 Agent，直接使用 OpenAI API 和 MCP 工具。

主要变更：
- 新增 src/agent/native/ 目录，包含原生 Agent 实现
  - tool-converter.ts: MCP 工具到 OpenAI Function 格式转换器
  - native-agent.ts: 核心 Agent 类，实现工具调用循环逻辑
  - agent-factory.ts: Agent 创建工厂函数
  - repl.ts: REPL 交互界面
  - index.ts: 独立入口文件
  - README.md: 使用说明文档

- 更新 package.json
  - 添加 openai 依赖
  - 新增 npm run native 和 npm run native:build 脚本

- 更新 src/cli/commands.ts
  - 改进 /list-tools 命令，支持原生 Agent 的工具列表格式
  - 显示工具来源信息（服务器名称/MCP 工具名称）

功能特性：
- ✅ 直接使用 OpenAI API，不依赖 LangChain
- ✅ 支持 MCP 工具自动发现和加载
- ✅ 实现完整的工具调用循环（Tool Calling Loop）
- ✅ 支持流式和非流式输出
- ✅ 与现有 LangChain Agent 功能完全兼容
- ✅ 使用相同的配置文件和环境变量

使用方法：
  npm run native          # 开发模式运行原生 Agent
  npm run native:build    # 编译后运行
