# SIP Call MCP Server

一个基于 Model Context Protocol (MCP) 的 SIP 呼叫服务器，支持拨打和接听 SIP 电话。

## 功能特性

- 🔌 **MCP 集成**: 完整的 Model Context Protocol 服务器实现
- 📞 **双向通话**: 支持拨打和接听 SIP 电话
- 🔐 **SIP 认证**: 支持用户名/密码认证和 SIP 注册
- 🎵 **音频处理**: WebRTC 音频流处理
- 🌐 **WebSocket 支持**: 使用 WSS 协议连接 SIP 服务器

## 安装

### 从 GitHub 安装（推荐）

```bash
git clone https://github.com/tanbaoxing1/sipcall-mcp-server.git
cd sipcall-mcp-server
npm install
```

### 直接使用 npx（无需安装）

```bash
npx github:tanbaoxing1/sipcall-mcp-server
```

### 本地开发安装

如果你想修改或贡献代码：

```bash
git clone https://github.com/tanbaoxing1/sipcall-mcp-server.git
cd sipcall-mcp-server
npm install
npm start
```

## 使用方法

### AI Agent 使用（推荐）

通过 npx 从 GitHub 启动（最常见的 AI Agent 使用方式）：

```bash
npx github:tanbaoxing1/sipcall-mcp-server
```

或者使用本地安装的版本：

```bash
cd sipcall-mcp-server
npm start
```

### 本地开发使用

```bash
# 启动服务器
npm start

# 调试模式
npm run dev
```

## Agent 配置指南

### 1. MCP 服务器配置

在 Claude Desktop 或其他支持 MCP 的客户端中，需要在配置文件中添加此服务器：

**Claude Desktop 配置文件位置:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**配置示例:**

使用 GitHub npx（推荐）：
```json
{
  "mcpServers": {
    "sip-call-server": {
      "command": "npx",
      "args": ["github:tanbaoxing1/sipcall-mcp-server"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

使用本地克隆的仓库：
```json
{
  "mcpServers": {
    "sip-call-server": {
      "command": "node",
      "args": ["sipcall.js"],
      "cwd": "/path/to/sipcall-mcp-server",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Windows 本地路径示例：
```json
{
  "mcpServers": {
    "sip-call-server": {
      "command": "node",
      "args": ["sipcall.js"],
      "cwd": "C:\\Users\\YourName\\sipcall-mcp-server",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

macOS/Linux 本地路径示例：
```json
{
  "mcpServers": {
    "sip-call-server": {
      "command": "node",
      "args": ["sipcall.js"],
      "cwd": "/Users/YourName/sipcall-mcp-server",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 2. 在其他 MCP 客户端中使用

如果你正在开发自己的 MCP 客户端，可以这样连接：

使用 GitHub npx（推荐）：
```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['github:tanbaoxing1/sipcall-mcp-server']
});

const client = new Client({
  name: "sip-client",
  version: "1.0.0"
}, {
  capabilities: {}
});

await client.connect(transport);
```

使用本地克隆的仓库（开发用）：
```javascript
const transport = new StdioClientTransport({
  command: 'node',
  args: ['./sipcall.js'],
  cwd: '/path/to/sipcall-mcp-server'
});
```

### 3. MCP Inspector 调试

使用 MCP Inspector 来测试和调试服务器：

使用 GitHub npx 启动服务器：
```bash
npx @modelcontextprotocol/inspector npx github:tanbaoxing1/sipcall-mcp-server
```

使用本地克隆的仓库调试：
```bash
cd sipcall-mcp-server
npx @modelcontextprotocol/inspector node sipcall.js
```

## Agent 使用流程

### 完整的通话流程示例

```javascript
// 1. 配置 SIP 连接
await client.callTool('sip_configure', {
  sipServer: 'sip.example.com',
  username: 'your_username',
  password: 'your_password',
  domain: 'example.com'
});

// 2. 检查连接状态
const status = await client.callTool('sip_status', {});
console.log('SIP 状态:', status);

// 3. 拨打电话
await client.callTool('sip_call', {
  phoneNumber: '1234567890'
});

// 4. 在通话中... (Agent 可以进行语音交互)

// 5. 挂断电话
await client.callTool('sip_hangup', {});
```

### 接听来电流程

```javascript
// 1. 服务器自动检测到来电时，Agent 会收到通知

// 2. 检查来电状态
const status = await client.callTool('sip_status', {});
if (status.content[0].text.includes('incoming')) {
  // 3. 选择接听
  await client.callTool('sip_answer', {});

  // 4. 开始通话...

  // 5. 结束通话
  await client.callTool('sip_hangup', {});
}
```

## MCP 工具

该服务器提供以下 MCP 工具：

### 1. sip_configure
配置 SIP 客户端连接参数

**参数:**
- `sipServer`: SIP 服务器地址
- `username`: 用户名
- `password`: 密码
- `domain`: SIP 域名

### 2. sip_call
拨打电话

**参数:**
- `phoneNumber`: 目标电话号码

### 3. sip_answer
接听来电

**参数:** 无

### 4. sip_hangup
挂断电话

**参数:** 无

### 5. sip_status
获取当前状态

**参数:** 无

## 使用示例

1. **配置 SIP 客户端**
   ```javascript
   // 使用 sip_configure 工具
   {
     \"sipServer\": \"your-sip-server.com\",
     \"username\": \"tanbaoxing1\",
     \"password\": \"your-password\",
     \"domain\": \"your-domain.com\"
   }
   ```

2. **拨打电话**
   ```javascript
   // 使用 sip_call 工具
   {
     \"phoneNumber\": \"1234567890\"
   }
   ```

3. **接听来电**
   ```javascript
   // 使用 sip_answer 工具
   {}
   ```

4. **挂断电话**
   ```javascript
   // 使用 sip_hangup 工具
   {}
   ```

5. **查看状态**
   ```javascript
   // 使用 sip_status 工具
   {}
   ```

## Agent 应用场景

### 1. AI 客服系统
```javascript
// Agent 主动回访客户
await client.callTool('sip_configure', { /* 配置信息 */ });
await client.callTool('sip_call', { phoneNumber: customerPhone });
// Agent: "您好，我是AI客服小助手，想了解您对我们服务的满意度..."
```

### 2. 语音助手服务
```javascript
// 用户呼入，Agent 提供服务
// 自动检测来电并接听
await client.callTool('sip_answer', {});
// Agent: "您好，我是AI语音助手，请问需要什么帮助？"
```

### 3. 预约提醒系统
```javascript
// Agent 拨打用户确认预约
const appointments = getUpcomingAppointments();
for (const appointment of appointments) {
  await client.callTool('sip_call', { phoneNumber: appointment.phone });
  // Agent: "您好，提醒您明天上午10点有预约，请问是否需要调整时间？"
}
```

### 4. 紧急通知系统
```javascript
// 批量紧急通知
const emergencyContacts = getEmergencyContacts();
for (const contact of emergencyContacts) {
  await client.callTool('sip_call', { phoneNumber: contact.phone });
  // Agent: "紧急通知：由于系统维护，服务将在1小时后暂停..."
}
```

## 高级 Agent 使用模式

### 1. 智能呼叫路由
```javascript
class SmartCallRouter {
  async handleIncomingCall() {
    const status = await client.callTool('sip_status', {});
    const callerInfo = this.extractCallerInfo(status);

    if (this.isVIPCustomer(callerInfo)) {
      await client.callTool('sip_answer', {});
      return this.provideVIPService();
    } else {
      await client.callTool('sip_answer', {});
      return this.provideStandardService();
    }
  }
}
```

### 2. 多语言支持
```javascript
class MultiLanguageAgent {
  async handleCall(preferredLanguage = 'zh-CN') {
    await client.callTool('sip_answer', {});

    const greeting = this.getGreeting(preferredLanguage);
    // 使用对应语言进行对话
  }
}
```

### 3. 通话录音和分析
```javascript
class CallAnalytics {
  async startCall(phoneNumber) {
    const callStart = Date.now();
    await client.callTool('sip_call', { phoneNumber });

    // 记录通话开始时间
    this.logCallStart(phoneNumber, callStart);

    // 在通话结束后进行分析
    await this.analyzeCallQuality();
  }
}
```

## 故障排除

### 常见问题

1. **连接失败**
   ```bash
   # 检查 SIP 服务器连接
   ping your-sip-server.com

   # 检查端口是否开放
   telnet your-sip-server.com 5061
   ```

2. **音频问题**
   - 确保浏览器支持 WebRTC
   - 检查麦克风和扬声器权限
   - 验证防火墙设置

3. **MCP 连接问题**
   ```bash
   # 使用 MCP Inspector 调试
   npx @modelcontextprotocol/inspector node sipcall.js
   ```

4. **SIP 注册失败**
   - 验证用户名和密码
   - 检查 SIP 域名配置
   - 确认 SIP 服务器支持 WSS

### 调试模式

启用详细日志：
```bash
DEBUG=sip* npm start
```

### 性能监控

```javascript
class PerformanceMonitor {
  monitorCallQuality() {
    // 监控网络延迟
    // 监控音频质量
    // 监控连接稳定性
  }
}
```

## 技术栈

- **Node.js**: 运行时环境 (>=18.0.0)
- **SIP.js**: SIP 协议实现
- **@modelcontextprotocol/sdk**: MCP 服务器框架
- **WebRTC**: 音频流处理
- **zod**: 数据验证

## 系统要求

- Node.js >= 18.0.0
- 支持 WebRTC 的环境
- SIP 服务器访问权限
- 网络连接稳定

## 安全注意事项

- 不要在代码中硬编码 SIP 凭据
- 使用环境变量存储敏感信息
- 定期更新依赖包
- 监控异常连接尝试

## 许可证

MIT

---

## 贡献指南

欢迎提交 Issues 和 Pull Requests 来改进这个项目。

### 开发环境设置

```bash
git clone https://github.com/tanbaoxing1/sipcall-mcp-server.git
cd sipcall-mcp-server
npm install
npm run dev
```

### 测试

```bash
# 运行测试
npm test

# 使用 MCP Inspector 测试
npx @modelcontextprotocol/inspector node sipcall.js
```

## 快速开始

1. **克隆仓库**
   ```bash
   git clone https://github.com/tanbaoxing1/sipcall-mcp-server.git
   cd sipcall-mcp-server
   npm install
   ```

2. **配置 Claude Desktop**

   编辑配置文件并添加：
   ```json
   {
     "mcpServers": {
       "sip-call-server": {
         "command": "node",
         "args": ["sipcall.js"],
         "cwd": "/path/to/sipcall-mcp-server"
       }
     }
   }
   ```

3. **开始使用**

   重启 Claude Desktop，现在你可以让 AI 助手：
   - 配置 SIP 连接
   - 拨打电话
   - 接听来电
   - 管理通话状态

## 项目结构

```
sipcall-mcp-server/
├── sipcall.js          # 主服务器文件
├── bin.js              # 可执行文件入口
├── package.json        # 项目配置
├── .gitignore         # Git 忽略文件
├── README.md          # 项目文档
└── CLAUDE.md          # Claude Code 指南
```