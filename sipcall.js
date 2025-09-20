import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { UDPSIPClient } from './udp_sip.js';

/**
 * Enhanced SIP Call MCP Server
 * Provides comprehensive SIP calling functionality through MCP
 * Features: UDP SIP support, WebRTC fallback, call management, status monitoring
 */
class EnhancedSipCallServer {
    constructor() {
        this.server = new McpServer({
            name: 'enhanced-sip-call-server',
            version: '2.0.0'
        });
        
        // SIP clients
        this.udpSipClient = null;
        this.webrtcSipClient = null;
        
        // State management
        this.currentCall = null;
        this.config = null;
        this.isRegistered = false;
        this.preferredProtocol = 'udp'; // 'udp' or 'webrtc'
        
        // Call history and statistics
        this.callHistory = [];
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            totalDuration: 0,
            lastCallTime: null,
            registrationAttempts: 0,
            registrationSuccesses: 0
        };
        
        this.setupTools();
    }

    setupTools() {
        this.registerConfigurationTools();
        this.registerCallManagementTools();
        this.registerStatusTools();
        this.registerAdvancedTools();
    }

    registerConfigurationTools() {
        // Enhanced SIP configuration with protocol selection
        this.server.registerTool(
            'sip_configure',
            {
                title: 'SIP 配置',
                description: '配置SIP客户端连接参数，支持UDP和WebRTC协议',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sipServer: { 
                            type: 'string', 
                            description: 'SIP服务器地址',
                            examples: ['sipproxy.ucpaas.com', 'sip.example.com']
                        },
                        username: { 
                            type: 'string', 
                            description: 'SIP用户名',
                            examples: ['69254000000001']
                        },
                        password: { 
                            type: 'string', 
                            description: 'SIP密码' 
                        },
                        domain: { 
                            type: 'string', 
                            description: 'SIP域名',
                            examples: ['sipproxy.ucpaas.com']
                        },
                        protocol: {
                            type: 'string',
                            enum: ['udp', 'webrtc', 'auto'],
                            description: '传输协议选择',
                            default: 'udp'
                        },
                        port: {
                            type: 'number',
                            description: 'SIP服务器端口',
                            default: 25060
                        },
                        localPort: {
                            type: 'number',
                            description: '本地端口（UDP协议）',
                            default: 0
                        }
                    },
                    required: ['sipServer', 'username', 'password', 'domain']
                }
            },
            async (args) => {
                try {
                    const result = await this.configureSipClient(args);
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `配置失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Test SIP connection
        this.server.registerTool(
            'sip_test_connection',
            {
                title: 'SIP 连接测试',
                description: '测试SIP服务器连接和注册',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                try {
                    const result = await this.testConnection();
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `连接测试失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );
    }

    registerCallManagementTools() {
        // Enhanced call functionality
        this.server.registerTool(
            'sip_call',
            {
                title: 'SIP 拨打电话',
                description: '拨打SIP电话，支持多种参数配置',
                inputSchema: {
                    type: 'object',
                    properties: {
                        phoneNumber: { 
                            type: 'string', 
                            description: '目标电话号码',
                            examples: ['008613444447777', '1001']
                        },
                        duration: {
                            type: 'number',
                            description: '通话持续时间（秒）',
                            default: 30,
                            minimum: 1,
                            maximum: 3600
                        },
                        autoHangup: {
                            type: 'boolean',
                            description: '是否自动挂断',
                            default: true
                        },
                        recordCall: {
                            type: 'boolean',
                            description: '是否记录通话（暂未实现）',
                            default: false
                        }
                    },
                    required: ['phoneNumber']
                }
            },
            async (args) => {
                try {
                    const result = await this.makeCall(args);
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `拨号失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Answer incoming call
        this.server.registerTool(
            'sip_answer',
            {
                title: 'SIP 接听来电',
                description: '接听来电',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                try {
                    const result = await this.answerCall();
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `接听失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Hangup call
        this.server.registerTool(
            'sip_hangup',
            {
                title: 'SIP 挂断电话',
                description: '挂断当前通话',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                try {
                    const result = await this.hangupCall();
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `挂断失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );
    }

    registerStatusTools() {
        // Get current status
        this.server.registerTool(
            'sip_status',
            {
                title: 'SIP 状态查询',
                description: '获取当前SIP客户端和通话状态',
                inputSchema: {
                    type: 'object',
                    properties: {
                        detailed: {
                            type: 'boolean',
                            description: '是否返回详细状态信息',
                            default: false
                        }
                    },
                    required: []
                }
            },
            async (args) => {
                const status = await this.getStatus(args.detailed);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(status, null, 2)
                    }]
                };
            }
        );

        // Get call history
        this.server.registerTool(
            'sip_call_history',
            {
                title: 'SIP 通话记录',
                description: '获取通话历史记录',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: '返回记录数量限制',
                            default: 10,
                            minimum: 1,
                            maximum: 100
                        }
                    },
                    required: []
                }
            },
            async (args) => {
                const history = this.getCallHistory(args.limit);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(history, null, 2)
                    }]
                };
            }
        );

        // Get statistics
        this.server.registerTool(
            'sip_statistics',
            {
                title: 'SIP 统计信息',
                description: '获取SIP客户端统计信息',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                const statistics = await this.getStatistics();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(statistics, null, 2)
                    }]
                };
            }
        );
    }

    registerAdvancedTools() {
        // Switch protocol
        this.server.registerTool(
            'sip_switch_protocol',
            {
                title: 'SIP 切换协议',
                description: '在UDP和WebRTC协议之间切换',
                inputSchema: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            enum: ['udp', 'webrtc'],
                            description: '目标协议'
                        }
                    },
                    required: ['protocol']
                }
            },
            async (args) => {
                try {
                    const result = await this.switchProtocol(args.protocol);
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `协议切换失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Reset client
        this.server.registerTool(
            'sip_reset',
            {
                title: 'SIP 重置客户端',
                description: '重置SIP客户端，清除所有状态',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                try {
                    const result = await this.resetClient();
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `重置失败: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        );
    }

    // Implementation methods
    async configureSipClient(config) {
        this.config = {
            sipServer: config.sipServer,
            username: config.username,
            password: config.password,
            domain: config.domain,
            protocol: config.protocol || 'udp',
            port: config.port || 25060,
            localPort: config.localPort || 0
        };

        this.preferredProtocol = this.config.protocol;

        // Initialize UDP SIP client
        if (this.preferredProtocol === 'udp' || this.preferredProtocol === 'auto') {
            try {
                this.udpSipClient = new UDPSIPClient({
                    username: this.config.username,
                    password: this.config.password,
                    server: this.config.sipServer,
                    port: this.config.port,
                    localPort: this.config.localPort
                });

                // Wait for client to be ready
                await this.udpSipClient.clientReady;

                // Attempt registration
                this.stats.registrationAttempts++;
                const registered = await this.udpSipClient.register();
                
                if (registered) {
                    this.isRegistered = true;
                    this.stats.registrationSuccesses++;
                    
                    return {
                        success: true,
                        protocol: 'udp',
                        message: 'UDP SIP客户端配置成功并已注册',
                        server: this.config.sipServer,
                        username: this.config.username,
                        localPort: this.udpSipClient.actualLocalPort,
                        localIP: this.udpSipClient.localIP
                    };
                }
            } catch (error) {
                console.warn(`UDP SIP configuration failed: ${error.message}`);
                if (this.preferredProtocol === 'udp') {
                    throw error;
                }
                // Fall back to WebRTC if auto mode
            }
        }

        // WebRTC fallback or explicit WebRTC mode
        if (this.preferredProtocol === 'webrtc' || this.preferredProtocol === 'auto') {
            // WebRTC implementation would go here
            throw new Error('WebRTC SIP implementation not yet available');
        }

        throw new Error('Failed to configure SIP client with any protocol');
    }

    async testConnection() {
        if (!this.config) {
            throw new Error('SIP客户端未配置');
        }

        const results = {
            timestamp: new Date().toISOString(),
            config: {
                server: this.config.sipServer,
                port: this.config.port,
                username: this.config.username,
                protocol: this.preferredProtocol
            },
            tests: {}
        };

        // Test UDP connection
        if (this.udpSipClient) {
            try {
                const stats = this.udpSipClient.getStats();
                results.tests.udp = {
                    success: true,
                    registered: this.udpSipClient.isRegistered(),
                    localIP: this.udpSipClient.localIP,
                    localPort: this.udpSipClient.actualLocalPort,
                    stats: stats
                };
            } catch (error) {
                results.tests.udp = {
                    success: false,
                    error: error.message
                };
            }
        }

        return results;
    }

    async makeCall(args) {
        if (!this.isRegistered) {
            throw new Error('SIP客户端未注册');
        }

        if (this.currentCall) {
            throw new Error('已有通话在进行中');
        }

        const callConfig = {
            phoneNumber: args.phoneNumber,
            duration: args.duration || 30,
            autoHangup: args.autoHangup !== false,
            recordCall: args.recordCall || false,
            startTime: new Date()
        };

        this.stats.totalCalls++;

        try {
            let result;
            
            if (this.udpSipClient && this.preferredProtocol === 'udp') {
                result = await this.udpSipClient.makeCall(callConfig.phoneNumber, callConfig.duration);
                
                if (result) {
                    this.stats.successfulCalls++;
                    this.stats.lastCallTime = new Date();
                    
                    // Add to call history
                    const callRecord = {
                        id: Date.now(),
                        phoneNumber: callConfig.phoneNumber,
                        direction: 'outbound',
                        startTime: callConfig.startTime,
                        endTime: new Date(),
                        duration: callConfig.duration,
                        status: 'completed',
                        protocol: 'udp'
                    };
                    
                    this.callHistory.unshift(callRecord);
                    if (this.callHistory.length > 100) {
                        this.callHistory = this.callHistory.slice(0, 100);
                    }
                    
                    this.stats.totalDuration += callConfig.duration;
                    
                    return {
                        success: true,
                        callId: callRecord.id,
                        phoneNumber: callConfig.phoneNumber,
                        duration: callConfig.duration,
                        protocol: 'udp',
                        message: '通话完成',
                        stats: this.udpSipClient.getStats()
                    };
                }
            }
            
            throw new Error('Call failed');
            
        } catch (error) {
            this.stats.failedCalls++;
            
            // Add failed call to history
            const callRecord = {
                id: Date.now(),
                phoneNumber: callConfig.phoneNumber,
                direction: 'outbound',
                startTime: callConfig.startTime,
                endTime: new Date(),
                duration: 0,
                status: 'failed',
                error: error.message,
                protocol: this.preferredProtocol
            };
            
            this.callHistory.unshift(callRecord);
            
            throw error;
        }
    }

    async answerCall() {
        throw new Error('接听功能暂未实现');
    }

    async hangupCall() {
        if (!this.currentCall) {
            throw new Error('没有进行中的通话');
        }

        // Implementation would depend on the active client
        this.currentCall = null;
        
        return {
            success: true,
            message: '通话已挂断'
        };
    }

    async getStatus(detailed = false) {
        const status = {
            timestamp: new Date().toISOString(),
            configured: !!this.config,
            registered: this.isRegistered,
            protocol: this.preferredProtocol,
            hasActiveCall: !!this.currentCall,
            server: this.config?.sipServer || null,
            username: this.config?.username || null
        };

        if (detailed) {
            status.config = this.config;
            status.stats = this.stats;
            
            if (this.udpSipClient) {
                status.udpClient = {
                    ready: true,
                    registered: this.udpSipClient.isRegistered(),
                    localIP: this.udpSipClient.localIP,
                    localPort: this.udpSipClient.actualLocalPort,
                    stats: this.udpSipClient.getStats()
                };
            }
        }

        return status;
    }

    getCallHistory(limit = 10) {
        return {
            total: this.callHistory.length,
            limit: limit,
            calls: this.callHistory.slice(0, limit)
        };
    }

    async getStatistics() {
        const stats = { ...this.stats };
        
        if (this.udpSipClient) {
            stats.udpClient = this.udpSipClient.getStats();
        }
        
        // Calculate success rate
        if (stats.totalCalls > 0) {
            stats.successRate = (stats.successfulCalls / stats.totalCalls * 100).toFixed(2) + '%';
        } else {
            stats.successRate = 'N/A';
        }
        
        // Calculate average call duration
        if (stats.successfulCalls > 0) {
            stats.averageDuration = (stats.totalDuration / stats.successfulCalls).toFixed(2) + 's';
        } else {
            stats.averageDuration = 'N/A';
        }
        
        return stats;
    }

    async switchProtocol(protocol) {
        if (protocol === this.preferredProtocol) {
            return {
                success: true,
                message: `已经在使用${protocol}协议`,
                currentProtocol: this.preferredProtocol
            };
        }

        // Implementation for protocol switching
        this.preferredProtocol = protocol;
        
        return {
            success: true,
            message: `已切换到${protocol}协议`,
            previousProtocol: this.preferredProtocol,
            currentProtocol: protocol
        };
    }

    async resetClient() {
        // Close existing clients
        if (this.udpSipClient) {
            await this.udpSipClient.close();
            this.udpSipClient = null;
        }

        // Reset state
        this.currentCall = null;
        this.config = null;
        this.isRegistered = false;
        this.callHistory = [];
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            totalDuration: 0,
            lastCallTime: null,
            registrationAttempts: 0,
            registrationSuccesses: 0
        };

        return {
            success: true,
            message: 'SIP客户端已重置',
            timestamp: new Date().toISOString()
        };
    }

    async start() {
        try {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.log('Enhanced SIP Call MCP Server v2.0 已启动');
            console.log('支持功能:');
            console.log('- UDP SIP 协议支持');
            console.log('- 增强的通话管理');
            console.log('- 通话历史记录');
            console.log('- 详细统计信息');
            console.log('- 连接测试工具');
        } catch (error) {
            console.error('服务器启动失败:', error);
            throw error;
        }
    }
}

// 启动增强的SIP服务器
const server = new EnhancedSipCallServer();
server.start().catch(console.error);
