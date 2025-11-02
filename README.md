# LangChain Agent Monorepo

一个 monorepo 项目，包含两个不同的 Agent 实现，都支持 Model Context Protocol (MCP)：
- **LangChain Agent**: 基于 LangChain.js 框架的实现
- **Native Agent**: 直接使用 OpenAI API 的原生实现（不依赖 LangChain）

## 项目结构

```
.
├── packages/
│   ├── core/                  # 共享核心功能
│   │   ├── src/
│   │   │   ├── mcp/          # MCP 客户端封装
│   │   │   ├── config/       # 配置加载
│   │   │   ├── types/        # 类型定义
│   │   │   └── cli/          # CLI 命令处理
│   │   └── package.json
│   ├── langchain-agent/       # LangChain 实现
│   │   ├── src/
│   │   │   ├── agent-factory.ts
│   │   │   ├── cli/repl.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── native-agent/          # Native 实现
│       ├── src/
│       │   ├── agent-factory.ts
│       │   ├── native-agent.ts
│       │   ├── tool-converter.ts
│       │   ├── cli/repl.ts
│       │   └── index.ts
│       └── package.json
├── package.json               # 根目录配置
├── pnpm-workspace.yaml        # pnpm workspace 配置
├── mcp_settings.json.example  # MCP 配置示例
└── README.md

```

## 功能特性

- ✅ 支持多种 MCP 传输方式（Stdio、HTTP、SSE）
- ✅ 可配置任意 MCP 服务器
- ✅ 命令行交互界面（REPL）
- ✅ 流式输出显示 Agent 思考过程
- ✅ 自动工具发现和加载
- ✅ 工具命名空间管理，避免冲突
- ✅ 错误容错处理
- ✅ Monorepo 架构，代码复用

## 安装

### 1. 克隆或进入项目目录

```bash
cd langchain-agent
```

### 2. 安装依赖

使用 pnpm（推荐）：

```bash
pnpm install
```

或使用 npm：

```bash
npm install
```

### 3. 配置 MCP 服务器

复制示例配置文件：

```bash
cp mcp_settings.json.example mcp_settings.json
```

编辑 `mcp_settings.json`，配置你的 MCP 服务器。示例配置包括：

- **Stdio 传输**：本地进程间通信（如 npx 命令启动的服务器）
- **HTTP 传输**：通过 HTTP 连接到远程服务器
- **SSE 传输**：通过 Server-Sent Events 连接

### 4. 设置环境变量

创建 `.env` 文件并配置 OpenAI 相关设置：

```bash
# .env 文件
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini  # 可选，默认值：gpt-4o-mini
OPENAI_TEMPERATURE=0      # 可选，默认值：0
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，默认值：https://api.openai.com/v1
MCP_CONFIG_PATH=./mcp_settings.json  # 可选，默认值：./mcp_settings.json
```

**注意**：`.env` 文件已添加到 `.gitignore`，不会被提交到版本库。

## 使用方式

### LangChain Agent

开发模式运行：

```bash
pnpm dev:langchain
# 或
npm run dev:langchain
```

编译后运行：

```bash
pnpm build:langchain
pnpm --filter langchain-agent start
```

### Native Agent

开发模式运行：

```bash
pnpm dev:native
# 或
npm run dev:native
```

编译后运行：

```bash
pnpm build:native
pnpm --filter native-agent start
```

### 构建所有包

```bash
pnpm build
```

## 配置文件说明

### MCP 服务器配置

`mcp_settings.json` 格式（与 Cursor/Cline 兼容）：

```json
{
  "mcpServers": {
    "math-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-math"],
      "restart": {
        "enabled": true,
        "maxAttempts": 3,
        "delayMs": 1000
      }
    },
    "http-server": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      },
      "reconnect": {
        "enabled": true,
        "maxAttempts": 5,
        "delayMs": 2000
      }
    }
  }
}
```

### 传输类型

#### Stdio 传输

用于本地进程间通信，适合通过命令启动的 MCP 服务器。

```json
{
  "server-name": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-math"],
    "restart": {
      "enabled": true,
      "maxAttempts": 3,
      "delayMs": 1000
    }
  }
}
```

#### HTTP 传输

用于通过 HTTP 连接到远程 MCP 服务器（推荐）。

```json
{
  "server-name": {
    "url": "https://example.com/mcp",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN"
    },
    "reconnect": {
      "enabled": true,
      "maxAttempts": 5,
      "delayMs": 2000
    }
  }
}
```

#### SSE 传输

用于通过 Server-Sent Events 连接（旧版兼容）。

```json
{
  "server-name": {
    "url": "https://example.com/mcp",
    "transport": "sse",
    "reconnect": {
      "enabled": true,
      "maxAttempts": 5,
      "delayMs": 2000
    }
  }
}
```

## 命令行交互

启动后会进入交互式 REPL，你可以：

1. **直接提问**：输入任何问题，Agent 会自动选择合适的工具回答
2. **查看工具**：输入 `/list-tools` 查看所有可用工具
3. **获取帮助**：输入 `/help` 查看命令列表
4. **退出程序**：输入 `/exit` 或按 `Ctrl+C`

### 示例对话

```
🤖 > 计算 3 + 5 乘以 12

🤔 思考中...

🔧 调用工具:
  - math-server_add
    参数: { "a": 3, "b": 5 }

📊 工具结果:
8

🔧 调用工具:
  - math-server_multiply
    参数: { "a": 8, "b": 12 }

📊 工具结果:
96

结果是 96。
```

## 两个实现的区别

### LangChain Agent (`packages/langchain-agent`)

- **优点**：
  - 基于成熟的 LangChain 框架
  - 使用 `@langchain/mcp-adapters` 官方适配器
  - 更好的工具集成和错误处理
  - 支持更复杂的 Agent 模式

- **依赖**：
  - `langchain`
  - `@langchain/openai`
  - `@langchain/mcp-adapters`

### Native Agent (`packages/native-agent`)

- **优点**：
  - 不依赖 LangChain，更轻量
  - 直接使用 OpenAI API
  - 更少的依赖包，更快的启动速度
  - 更简单的代码结构

- **依赖**：
  - `openai`

## 故障排除

### 问题：无法连接到 MCP 服务器

- 检查配置文件格式是否正确
- 确认 MCP 服务器是否正在运行
- 对于 stdio 传输，确认命令和参数是否正确
- 对于 HTTP 传输，确认 URL 和认证信息是否正确

### 问题：缺少 OpenAI API Key

- 确保在 `.env` 文件中设置了 `OPENAI_API_KEY`
- 确保 `.env` 文件位于项目根目录

### 问题：工具加载失败

- 检查 MCP 服务器是否正常响应
- 查看控制台错误消息
- 尝试单独测试 MCP 服务器连接

### 问题：TypeScript 编译错误

- 运行 `pnpm install` 确保所有依赖已安装
- 检查各包的 `tsconfig.json` 配置
- 确认 Node.js 版本 >= 18

### 问题：Workspace 依赖未解析

如果遇到 `@langchain-agent/core` 找不到的问题，运行：

```bash
pnpm install
```

确保所有 workspace 依赖都已正确链接。

## 开发

### 构建所有包

```bash
pnpm build
```

### 构建单个包

```bash
pnpm --filter langchain-agent build
pnpm --filter native-agent build
pnpm --filter core build
```

### 调试

设置环境变量启用详细日志：

```bash
export DEBUG=true
pnpm dev:langchain
# 或
pnpm dev:native
```

## 技术栈

- **pnpm**: Monorepo 包管理
- **TypeScript**: 类型安全
- **LangChain.js** (LangChain Agent): Agent 框架
- **OpenAI SDK** (Native Agent): 直接 API 调用
- **@modelcontextprotocol/sdk**: MCP 官方 SDK
- **Zod**: 配置验证

## 许可证

MIT
