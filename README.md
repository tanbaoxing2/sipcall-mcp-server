# SIP Call MCP Server

一个基于 Model Context Protocol (MCP) 的专业 SIP 呼叫服务器，支持 UDP 和 WebRTC 两种协议拨打 SIP 电话。

## 🚀 功能特性

- 🔌 **MCP 集成**: 完整的 Model Context Protocol 服务器实现
- 📞 **双协议支持**: UDP SIP（生产就绪）+ WebRTC SIP（待测试）
- 🔐 **SIP 认证**: 支持摘要认证和 SIP 注册
- 🎵 **RTP 音频**: 实时音频流处理和回声检测
- 🌐 **NAT 穿透**: 智能网络检测和 NAT 环境适配
- 📊 **状态监控**: 详细的通话统计和历史记录
- 🛠️ **网络诊断**: 自动网络路径分析和问题诊断

## 📦 安装

### 从 GitHub 安装（推荐）

```bash
git clone https://github.com/tanbaoxing2/sipcall-mcp-server.git
cd sipcall-mcp-server
npm install
```

### 直接使用 npx（无需安装）

```bash
npx github:tanbaoxing2/sipcall-mcp-server
```

### 本地开发安装

```bash
git clone https://github.com/tanbaoxing2/sipcall-mcp-server.git
cd sipcall-mcp-server
npm install
npm start
```

## 🎯 快速开始

### 1. 启动服务器

```bash
# 使用 npx（推荐）
npx github:tanbaoxing2/sipcall-mcp-server

# 或本地启动
node sipcall.js
```

### 2. 配置 Claude Desktop

编辑配置文件：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sip-call-server": {
      "command": "npx",
      "args": ["github:tanbaoxing2/sipcall-mcp-server"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 3. 开始使用

重启 Claude Desktop，现在你可以让 AI 助手进行 SIP 通话！

## 🛠️ MCP 工具

该服务器提供以下 10 个专业 MCP 工具：

### 配置管理
- **`sip_configure`**: 配置 SIP 客户端连接参数，支持协议选择
- **`sip_test_connection`**: 测试 SIP 服务器连接和网络诊断
- **`sip_reset`**: 重置 SIP 客户端，清除所有状态

### 通话管理
- **`sip_call`**: 拨打 SIP 电话，支持持续时间控制
- **`sip_answer`**: 接听来电
- **`sip_hangup`**: 挂断当前通话

### 状态监控
- **`sip_status`**: 获取当前 SIP 客户端和通话状态
- **`sip_call_history`**: 获取通话历史记录
- **`sip_statistics`**: 获取详细的统计信息

### 高级功能
- **`sip_switch_protocol`**: 在 UDP 和 WebRTC 协议之间切换

## 📋 使用示例

### 基础通话流程

```javascript
// 1. 配置 SIP 连接（UDP 协议）
await client.callTool('sip_configure', {
  sipServer: 'rtcdev1.sinupaas.com',
  username: '62200051906030',
  password: 'your_password',
  domain: 'rtcdev1.sinupaas.com',
  protocol: 'udp',
  port: 10060
});

// 2. 测试连接
const testResult = await client.callTool('sip_test_connection', {});
console.log('连接测试:', testResult);

// 3. 拨打电话
await client.callTool('sip_call', {
  phoneNumber: '62200051906022',
  duration: 30,
  autoHangup: true
});

// 4. 查看通话状态
const status = await client.callTool('sip_status', { detailed: true });
console.log('通话状态:', status);

// 5. 查看统计信息
const stats = await client.callTool('sip_statistics', {});
console.log('统计信息:', stats);
```

### 协议切换示例

```javascript
// 切换到 WebRTC 协议（开发中）
await client.callTool('sip_switch_protocol', {
  protocol: 'webrtc'
});

// 切换回 UDP 协议
await client.callTool('sip_switch_protocol', {
  protocol: 'udp'
});
```

### 通话历史查询

```javascript
// 获取最近 10 次通话记录
const history = await client.callTool('sip_call_history', {
  limit: 10
});
console.log('通话历史:', history);
```

## 🔧 配置参数

### SIP 配置参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `sipServer` | string | ✅ | - | SIP 服务器地址 |
| `username` | string | ✅ | - | SIP 用户名 |
| `password` | string | ✅ | - | SIP 密码 |
| `domain` | string | ✅ | - | SIP 域名 |
| `protocol` | string | ❌ | 'udp' | 传输协议（udp/webrtc/auto） |
| `port` | number | ❌ | 25060 | SIP 服务器端口 |
| `localPort` | number | ❌ | 0 | 本地绑定端口（0=自动分配） |

### 通话参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `phoneNumber` | string | ✅ | - | 目标电话号码 |
| `duration` | number | ❌ | 30 | 通话持续时间（秒，1-3600） |
| `autoHangup` | boolean | ❌ | true | 是否自动挂断 |
| `recordCall` | boolean | ❌ | false | 是否录音（预留功能） |

## 🌐 协议支持

### UDP SIP（生产就绪）✅
- **完整 SIP 协议栈**: 基于 RFC 3261 标准
- **事务管理**: 自动重传、超时处理、状态管理
- **摘要认证**: MD5 认证自动处理
- **RTP 处理**: 实时音频包生成和回声检测
- **NAT 支持**: 智能网络检测和穿透
- **网络诊断**: 自动路径分析和问题排查

### WebRTC SIP（待测试）🚧
- **浏览器兼容**: 支持现代浏览器 WebRTC
- **WSS 传输**: 安全的 WebSocket 连接
- **媒体协商**: 自动 SDP 协商
- **ICE 候选**: 自动 NAT 穿透

## 📊 监控和统计

### 实时状态监控
```javascript
{
  "timestamp": "2025-09-20T08:25:00.000Z",
  "configured": true,
  "registered": true,
  "protocol": "udp",
  "hasActiveCall": false,
  "server": "rtcdev1.sinupaas.com",
  "username": "62200051906030"
}
```

### 详细统计信息
```javascript
{
  "totalCalls": 10,
  "successfulCalls": 8,
  "failedCalls": 2,
  "successRate": "80.00%",
  "totalDuration": 240,
  "averageDuration": "30.00s",
  "lastCallTime": "2025-09-20T08:15:00.000Z",
  "registrationAttempts": 5,
  "registrationSuccesses": 5,
  "udpClient": {
    "registrationSuccesses": 5,
    "registrationFailures": 0,
    "callSuccesses": 8,
    "callFailures": 2,
    "rtpPacketsSent": 12000,
    "rtpPacketsReceived": 11800
  }
}
```

### 通话历史记录
```javascript
{
  "total": 5,
  "limit": 10,
  "calls": [
    {
      "id": 1726825500000,
      "phoneNumber": "62200051906022",
      "direction": "outbound",
      "startTime": "2025-09-20T08:25:00.000Z",
      "endTime": "2025-09-20T08:25:30.000Z",
      "duration": 30,
      "status": "completed",
      "protocol": "udp"
    }
  ]
}
```

## 🔍 网络诊断

### 自动网络检测
- **本地 IP 检测**: 自动识别网络接口
- **NAT 类型检测**: 识别网络环境类型
- **防火墙检测**: 检查端口可达性
- **延迟测试**: 测量网络延迟

### 故障排除工具
```javascript
// 使用连接测试工具
const testResult = await client.callTool('sip_test_connection', {});

// 检查测试结果
if (!testResult.tests.udp.success) {
  console.log('UDP 连接失败:', testResult.tests.udp.error);
  // 自动提供解决建议
}
```

## 🎯 应用场景

### 1. AI 客服系统
```javascript
// AI 主动回访客户
await configureSIP();
await client.callTool('sip_call', { 
  phoneNumber: customerPhone,
  duration: 300 
});
// AI: "您好，我是 AI 客服，想了解您对我们服务的满意度..."
```

### 2. 语音助手服务
```javascript
// 用户呼入，AI 提供服务
await client.callTool('sip_answer', {});
// AI: "您好，我是 AI 语音助手，请问需要什么帮助？"
```

### 3. 预约提醒系统
```javascript
// AI 批量拨打确认预约
const appointments = getUpcomingAppointments();
for (const appointment of appointments) {
  await client.callTool('sip_call', { 
    phoneNumber: appointment.phone,
    duration: 60
  });
  // AI: "提醒您明天上午 10 点有预约，请问是否需要调整？"
}
```

### 4. 紧急通知系统
```javascript
// 批量紧急通知
const emergencyContacts = getEmergencyContacts();
for (const contact of emergencyContacts) {
  await client.callTool('sip_call', { 
    phoneNumber: contact.phone,
    duration: 120
  });
  // AI: "紧急通知：由于系统维护，服务将在 1 小时后暂停..."
}
```

## 🛡️ 安全和最佳实践

### 安全配置
- ✅ 不要在代码中硬编码 SIP 凭据
- ✅ 使用环境变量存储敏感信息
- ✅ 定期更新依赖包
- ✅ 监控异常连接尝试
- ✅ 使用强密码和安全的 SIP 服务器

### 网络要求
- **SIP 信令**: UDP 端口（默认 25060，可配置）
- **RTP 媒体**: UDP 动态端口（自动分配）
- **防火墙**: 允许出站 UDP 连接
- **NAT 环境**: 自动适配，支持对称 NAT

### 性能优化
- **连接复用**: 自动管理 SIP 连接
- **资源清理**: 自动释放网络资源
- **错误恢复**: 智能重连和故障恢复
- **统计监控**: 实时性能指标

## 🔧 故障排除

### 常见问题

#### 1. SIP 注册失败
```bash
# 检查网络连接
ping rtcdev1.sinupaas.com

# 检查端口可达性
telnet rtcdev1.sinupaas.com 10060

# 使用连接测试工具
await client.callTool('sip_test_connection', {});
```

**可能原因:**
- 用户名或密码错误
- SIP 服务器地址或端口错误
- 网络防火墙阻止连接
- SIP 服务器不支持当前认证方式

#### 2. 通话建立失败
```javascript
// 检查注册状态
const status = await client.callTool('sip_status', { detailed: true });
if (!status.registered) {
  console.log('SIP 未注册，请先配置并注册');
}
```

**可能原因:**
- SIP 客户端未注册
- 目标号码格式错误
- 网络连接不稳定
- SIP 服务器拒绝呼叫

#### 3. RTP 音频问题
```javascript
// 查看 RTP 统计
const stats = await client.callTool('sip_statistics', {});
console.log('RTP 包发送:', stats.udpClient.rtpPacketsSent);
console.log('RTP 包接收:', stats.udpClient.rtpPacketsReceived);
```

**可能原因:**
- NAT 配置问题
- 防火墙阻止 RTP 端口
- 网络延迟过高
- 音频编解码器不匹配

### 调试模式

```bash
# 启用详细日志
DEBUG=sip* node sipcall.js

# 使用 MCP Inspector 调试
npx @modelcontextprotocol/inspector node sipcall.js
```

## 📋 系统要求

- **Node.js**: >= 18.0.0
- **操作系统**: Windows, macOS, Linux
- **网络**: 稳定的互联网连接
- **防火墙**: 允许 UDP 出站连接
- **SIP 服务器**: 支持 UDP SIP 协议

## 🏗️ 技术架构

### 协议栈层次
```
┌─────────────────────────────────────┐
│           MCP Server Layer          │
├─────────────────────────────────────┤
│         SIP Application Layer       │
├─────────────────────────────────────┤
│       SIP Transaction Layer         │
├─────────────────────────────────────┤
│         UDP Transport Layer         │
├─────────────────────────────────────┤
│           RTP Media Layer           │
└─────────────────────────────────────┘
```

### 核心组件
- **EnhancedUDPSIPClient**: 核心 SIP 客户端
- **TransactionManager**: SIP 事务管理器
- **RTPHandler**: RTP 媒体处理器
- **StatisticsCollector**: 统计信息收集器
- **NetworkDiagnostics**: 网络诊断工具

## 🧪 测试

### 运行测试
```bash
# 基础功能测试
npm test

# 真实 SIP 账号测试
node test_real_sip_account.js

# 使用 MCP Inspector 测试
npx @modelcontextprotocol/inspector node sipcall.js
```

### 测试覆盖
- ✅ SIP 注册和认证
- ✅ 通话建立和挂断
- ✅ RTP 媒体流处理
- ✅ NAT 穿透测试
- ✅ 错误处理和恢复
- ✅ 统计信息收集

## 📚 技术栈

- **Node.js**: 运行时环境
- **@modelcontextprotocol/sdk**: MCP 服务器框架
- **dgram**: UDP 网络通信
- **crypto**: 摘要认证
- **uuid**: 唯一标识符生成
- **zod**: 数据验证

## 🤝 贡献指南

欢迎提交 Issues 和 Pull Requests！

### 开发环境设置
```bash
git clone https://github.com/tanbaoxing2/sipcall-mcp-server.git
cd sipcall-mcp-server
npm install
npm run dev
```

### 提交规范
- 🐛 **fix**: 修复 bug
- ✨ **feat**: 新功能
- 📚 **docs**: 文档更新
- 🎨 **style**: 代码格式
- ♻️ **refactor**: 代码重构
- ⚡ **perf**: 性能优化
- ✅ **test**: 测试相关

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关链接

- **GitHub**: https://github.com/tanbaoxing2/sipcall-mcp-server
- **Issues**: https://github.com/tanbaoxing2/sipcall-mcp-server/issues
- **MCP 官方文档**: https://modelcontextprotocol.io/
- **SIP 协议 RFC 3261**: https://tools.ietf.org/html/rfc3261

---

## 📞 联系我们

如有问题或建议，请通过以下方式联系：

- 📧 **Email**: 14774913528@139.com
- 🐛 **Issues**: [GitHub Issues](https://github.com/tanbaoxing2/sipcall-mcp-server/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/tanbaoxing2/sipcall-mcp-server/discussions)

**让 AI 助手拥有打电话的能力！** 🚀📞
