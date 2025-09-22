#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { UDPSIPClient } from './udp_sip.js';
import { WebRTCSipClient } from './webrtc_sip.js';

/**
 * Enhanced SIP Call MCP Server
 * Provides comprehensive SIP calling functionality through MCP
 * Features: UDP SIP support, WebRTC fallback, call management, status monitoring
 */
class SipCallServer {
    constructor() {
        this.server = new Server(
            {
                name: 'sip-call-server',
                version: '1.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // SIP clients
        this.udpSipClient = null;
        this.webrtcSipClient = null;
        this.config = null;
        this.isRegistered = false;
        this.preferredProtocol = 'udp';
        this.currentProtocol = null;

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

        this.setupToolHandlers();
    }

    setupToolHandlers() {
        // Handle tools/list request
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'sip_configure',
                        description: '配置SIP客户端连接参数，支持UDP和WebRTC协议，自动进行SIP注册',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sipServer: {
                                    type: 'string',
                                    description: 'SIP服务器地址'
                                },
                                username: {
                                    type: 'string',
                                    description: 'SIP用户名'
                                },
                                password: {
                                    type: 'string',
                                    description: 'SIP密码'
                                },
                                domain: {
                                    type: 'string',
                                    description: 'SIP域名'
                                },
                                port: {
                                    type: 'number',
                                    description: 'SIP服务器端口',
                                    default: 10060
                                },
                                localPort: {
                                    type: 'number',
                                    description: '本地端口（UDP协议）',
                                    default: 0
                                },
                                protocol: {
                                    type: 'string',
                                    description: 'SIP协议类型',
                                    enum: ['udp', 'webrtc'],
                                    default: 'udp'
                                }
                            },
                            required: ['sipServer', 'username', 'password', 'domain']
                        }
                    },
                    {
                        name: 'sip_call',
                        description: '拨打SIP电话，支持RTP音频流和回声检测',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                phoneNumber: {
                                    type: 'string',
                                    description: '目标电话号码'
                                },
                                duration: {
                                    type: 'number',
                                    description: '通话持续时间（秒）',
                                    default: 30,
                                    minimum: 1,
                                    maximum: 3600
                                }
                            },
                            required: ['phoneNumber']
                        }
                    },
                    {
                        name: 'sip_status',
                        description: '获取当前SIP客户端状态，包括注册状态和网络信息',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                detailed: {
                                    type: 'boolean',
                                    description: '是否返回详细状态信息',
                                    default: false
                                }
                            }
                        }
                    },
                    {
                        name: 'sip_statistics',
                        description: '获取SIP客户端详细统计信息，包括通话成功率和RTP数据',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'sip_reset',
                        description: '重置SIP客户端，清除所有状态和统计信息',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'sip_answer_call',
                        description: '接听来电（支持UDP和WebRTC协议）',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'sip_hangup_call',
                        description: '挂断/拒绝电话（支持UDP和WebRTC协议）',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'webrtc_set_stream',
                        description: '设置WebRTC本地媒体流（仅WebRTC协议）',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                streamData: {
                                    type: 'string',
                                    description: '媒体流数据或标识符'
                                }
                            },
                            required: ['streamData']
                        }
                    },
                    {
                        name: 'webrtc_answer_call',
                        description: '接听来电（仅WebRTC协议）',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'webrtc_hangup_call',
                        description: '挂断电话（仅WebRTC协议）',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    }
                ]
            };
        });

        // Handle tools/call request
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'sip_configure':
                        return await this.handleConfigure(args);
                    case 'sip_call':
                        return await this.handleCall(args);
                    case 'sip_status':
                        return await this.handleStatus(args);
                    case 'sip_statistics':
                        return await this.handleStatistics();
                    case 'sip_reset':
                        return await this.handleReset();
                    case 'sip_answer_call':
                        return await this.handleAnswerCall(args);
                    case 'sip_hangup_call':
                        return await this.handleHangupCall(args);
                    case 'webrtc_set_stream':
                        return await this.handleWebRTCSetStream(args);
                    case 'webrtc_answer_call':
                        return await this.handleWebRTCAnswerCall(args);
                    case 'webrtc_hangup_call':
                        return await this.handleWebRTCHangupCall(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `错误: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        });
    }

    async handleConfigure(args) {
        try {
            this.config = {
                sipServer: args.sipServer,
                username: args.username,
                password: args.password,
                domain: args.domain,
                port: args.port || 10060,
                localPort: args.localPort || 0,
                protocol: args.protocol || 'udp'
            };

            this.currentProtocol = this.config.protocol;
            this.preferredProtocol = this.config.protocol;

            if (this.config.protocol === 'udp') {
                // Initialize UDP SIP client
                this.udpSipClient = new UDPSIPClient({
                    username: this.config.username,
                    password: this.config.password,
                    server: this.config.sipServer,
                    port: this.config.port,
                    localPort: this.config.localPort
                });

                // Wait for client to be ready
                await this.udpSipClient.clientReady;
            } else if (this.config.protocol === 'webrtc') {
                // Initialize WebRTC SIP client
                this.webrtcSipClient = new WebRTCSipClient();
                const result = await this.webrtcSipClient.register(this.config);
                if (!result.success) {
                    throw new Error(result.message);
                }

                // Mark as registered for WebRTC
                this.isRegistered = true;
                this.stats.registrationSuccesses++;

                const webrtcResult = {
                    success: true,
                    protocol: 'webrtc',
                    message: 'WebRTC SIP客户端配置成功并已注册',
                    server: this.config.sipServer,
                    username: this.config.username,
                    port: this.config.port
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(webrtcResult, null, 2)
                        }
                    ]
                };
            }

            // Attempt UDP registration
            this.stats.registrationAttempts++;
            const registered = await this.udpSipClient.register();

            if (registered) {
                this.isRegistered = true;
                this.stats.registrationSuccesses++;

                const result = {
                    success: true,
                    protocol: 'udp',
                    message: 'UDP SIP客户端配置成功并已注册',
                    server: this.config.sipServer,
                    username: this.config.username,
                    localPort: this.udpSipClient.actualLocalPort,
                    localIP: this.udpSipClient.localIP
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } else {
                throw new Error('SIP注册失败');
            }
        } catch (error) {
            throw new Error(`配置失败: ${error.message}`);
        }
    }

    async handleCall(args) {
        if (!this.isRegistered) {
            throw new Error('SIP客户端未注册，请先使用sip_configure配置');
        }

        const callConfig = {
            phoneNumber: args.phoneNumber,
            duration: args.duration || 30,
            startTime: new Date()
        };

        this.stats.totalCalls++;

        let result;
        let response;

        try {
            if (this.currentProtocol === 'udp') {
                result = await this.udpSipClient.makeCall(callConfig.phoneNumber, callConfig.duration);

                if (result) {
                    response = {
                        success: true,
                        callId: Date.now(),
                        phoneNumber: callConfig.phoneNumber,
                        duration: callConfig.duration,
                        protocol: 'udp',
                        message: '通话完成',
                        stats: this.udpSipClient.getStats()
                    };
                } else {
                    throw new Error('UDP 通话失败');
                }
            } else if (this.currentProtocol === 'webrtc') {
                result = await this.webrtcSipClient.makeCall(callConfig.phoneNumber);

                if (result.success) {
                    response = {
                        success: true,
                        callId: Date.now(),
                        phoneNumber: callConfig.phoneNumber,
                        protocol: 'webrtc',
                        message: result.message,
                        status: this.webrtcSipClient.getStatus()
                    };
                } else {
                    throw new Error(`WebRTC 通话失败: ${result.message}`);
                }
            }

            this.stats.successfulCalls++;
            this.stats.lastCallTime = new Date();

            // Add to call history
            const callRecord = {
                id: response.callId,
                phoneNumber: callConfig.phoneNumber,
                direction: 'outbound',
                startTime: callConfig.startTime,
                endTime: new Date(),
                duration: callConfig.duration,
                status: 'completed',
                protocol: this.currentProtocol
            };

            this.callHistory.unshift(callRecord);
            if (this.callHistory.length > 100) {
                this.callHistory = this.callHistory.slice(0, 100);
            }

            this.stats.totalDuration += callConfig.duration;

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                    }
                ]
            };
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
                protocol: this.currentProtocol
            };

            this.callHistory.unshift(callRecord);
            throw error;
        }
    }

    async handleStatus(args) {
        const detailed = args?.detailed || false;

        const status = {
            timestamp: new Date().toISOString(),
            configured: !!this.config,
            registered: this.isRegistered,
            protocol: this.currentProtocol || this.preferredProtocol,
            server: this.config?.sipServer || null,
            username: this.config?.username || null
        };

        if (detailed) {
            status.config = this.config;
            status.stats = this.stats;

            if (this.currentProtocol === 'udp' && this.udpSipClient) {
                status.udpClient = {
                    ready: true,
                    registered: this.udpSipClient.isRegistered(),
                    localIP: this.udpSipClient.localIP,
                    localPort: this.udpSipClient.actualLocalPort,
                    hasIncomingCall: this.udpSipClient.hasIncomingCall(),
                    incomingCallInfo: this.udpSipClient.getIncomingCallInfo(),
                    stats: this.udpSipClient.getStats()
                };
            } else if (this.currentProtocol === 'webrtc' && this.webrtcSipClient) {
                status.webrtcClient = this.webrtcSipClient.getStatus();
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(status, null, 2)
                }
            ]
        };
    }

    async handleStatistics() {
        const stats = { ...this.stats };
        stats.protocol = this.currentProtocol;

        if (this.currentProtocol === 'udp' && this.udpSipClient) {
            stats.udpClient = this.udpSipClient.getStats();
        } else if (this.currentProtocol === 'webrtc' && this.webrtcSipClient) {
            stats.webrtcClient = this.webrtcSipClient.getStatus();
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

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(stats, null, 2)
                }
            ]
        };
    }

    async handleReset() {
        // Close existing clients
        if (this.udpSipClient) {
            await this.udpSipClient.close();
            this.udpSipClient = null;
        }

        if (this.webrtcSipClient) {
            await this.webrtcSipClient.unregister();
            this.webrtcSipClient = null;
        }

        // Reset state
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

        const result = {
            success: true,
            message: 'SIP客户端已重置',
            timestamp: new Date().toISOString()
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }

    async handleAnswerCall(args) {
        if (!this.isRegistered) {
            throw new Error('SIP客户端未注册，无法接听电话');
        }

        try {
            let result;
            let response;

            if (this.currentProtocol === 'udp') {
                if (!this.udpSipClient.hasIncomingCall()) {
                    throw new Error('没有来电需要接听');
                }

                result = await this.udpSipClient.answerCall();

                if (result) {
                    response = {
                        success: true,
                        message: '来电已接听',
                        protocol: 'udp',
                        timestamp: new Date().toISOString()
                    };
                } else {
                    throw new Error('UDP 接听来电失败');
                }
            } else if (this.currentProtocol === 'webrtc') {
                result = await this.webrtcSipClient.answerCall();

                if (result.success) {
                    response = {
                        success: true,
                        message: result.message,
                        protocol: 'webrtc',
                        timestamp: new Date().toISOString(),
                        status: this.webrtcSipClient.getStatus()
                    };
                } else {
                    throw new Error(`WebRTC 接听来电失败: ${result.message}`);
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`接听电话失败: ${error.message}`);
        }
    }

    async handleHangupCall(args) {
        if (!this.isRegistered) {
            throw new Error('SIP客户端未注册');
        }

        try {
            let result;
            let response;

            if (this.currentProtocol === 'udp') {
                if (this.udpSipClient.hasIncomingCall()) {
                    result = this.udpSipClient.rejectCurrentIncomingCall();
                    response = {
                        success: true,
                        message: '来电已拒绝',
                        protocol: 'udp',
                        timestamp: new Date().toISOString()
                    };
                } else {
                    response = {
                        success: true,
                        message: '没有活动通话或来电',
                        protocol: 'udp',
                        timestamp: new Date().toISOString()
                    };
                }
            } else if (this.currentProtocol === 'webrtc') {
                result = await this.webrtcSipClient.hangupCall();

                if (result.success) {
                    response = {
                        success: true,
                        message: result.message,
                        protocol: 'webrtc',
                        timestamp: new Date().toISOString(),
                        status: this.webrtcSipClient.getStatus()
                    };
                } else {
                    throw new Error(`WebRTC 挂断失败: ${result.message}`);
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`挂断电话失败: ${error.message}`);
        }
    }

    async handleWebRTCSetStream(args) {
        if (this.currentProtocol !== 'webrtc') {
            throw new Error('当前协议不是WebRTC，无法设置媒体流');
        }

        if (!this.webrtcSipClient) {
            throw new Error('WebRTC SIP客户端未初始化');
        }

        try {
            // 这里需要应用层提供实际的MediaStream对象
            console.log('媒体流标识:', args.streamData);

            const result = {
                success: true,
                message: '媒体流标识已设置，请在应用层提供实际MediaStream对象',
                streamData: args.streamData
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`设置媒体流失败: ${error.message}`);
        }
    }

    async handleWebRTCAnswerCall(args) {
        if (this.currentProtocol !== 'webrtc') {
            throw new Error('当前协议不是WebRTC，无法接听电话');
        }

        if (!this.webrtcSipClient) {
            throw new Error('WebRTC SIP客户端未初始化');
        }

        try {
            const result = await this.webrtcSipClient.answerCall();

            if (result.success) {
                const response = {
                    success: true,
                    message: result.message,
                    timestamp: new Date().toISOString(),
                    status: this.webrtcSipClient.getStatus()
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response, null, 2)
                        }
                    ]
                };
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            throw new Error(`接听电话失败: ${error.message}`);
        }
    }

    async handleWebRTCHangupCall(args) {
        if (this.currentProtocol !== 'webrtc') {
            throw new Error('当前协议不是WebRTC，无法挂断电话');
        }

        if (!this.webrtcSipClient) {
            throw new Error('WebRTC SIP客户端未初始化');
        }

        try {
            const result = await this.webrtcSipClient.hangupCall();

            if (result.success) {
                const response = {
                    success: true,
                    message: result.message,
                    timestamp: new Date().toISOString(),
                    status: this.webrtcSipClient.getStatus()
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response, null, 2)
                        }
                    ]
                };
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            throw new Error(`挂断电话失败: ${error.message}`);
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('SIP Call MCP Server 已启动');
    }
}

const server = new SipCallServer();
server.run().catch(console.error);
