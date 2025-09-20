
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as SIP from 'sip.js';
import { z } from 'zod';

class SipCallServer {
    constructor() {
        this.server = new McpServer({
            name: 'sip-call-server',
            version: '1.0.0'
        });
        
        this.sipClient = null;
        this.currentCall = null;
        this.config = null;
        this.isRegistered = false;
        this.setupEventHandlers();
        this.setupTools();
    }
    
    setupEventHandlers() {
        // 注册MCP工具
        this.registerTools();
    }

    setupTools() {
        // 工具注册在 registerTools 方法中
    }

    registerTools() {
        // 配置SIP客户端
        this.server.registerTool(
            'sip_configure',
            {
                title: 'SIP 配置',
                description: '配置SIP客户端连接参数',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sipServer: { type: 'string', description: 'SIP服务器地址' },
                        username: { type: 'string', description: '用户名' },
                        password: { type: 'string', description: '密码' },
                        domain: { type: 'string', description: 'SIP域名' }
                    },
                    required: ['sipServer', 'username', 'password', 'domain']
                }
            },
            async (args) => {
                try {
                    await this.initializeSipClient(args);
                    return {
                        content: [{
                            type: 'text',
                            text: 'SIP客户端配置成功并已连接'
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

        // 拨打电话
        this.server.registerTool(
            'sip_call',
            {
                title: 'SIP 拨打',
                description: '拨打SIP电话',
                inputSchema: {
                    type: 'object',
                    properties: {
                        phoneNumber: { type: 'string', description: '目标电话号码' }
                    },
                    required: ['phoneNumber']
                }
            },
            async (args) => {
                try {
                    const result = await this.makeCall(args.phoneNumber);
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

        // 接听来电
        this.server.registerTool(
            'sip_answer',
            {
                title: 'SIP 接听',
                description: '接听来电',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                try {
                    if (!this.currentCall) {
                        throw new Error('没有待接听的来电');
                    }

                    if (this.currentCall.state !== 'Initial') {
                        throw new Error('通话状态不正确，无法接听');
                    }

                    await this.currentCall.accept({
                        sessionDescriptionHandlerOptions: {
                            constraints: { audio: true, video: false }
                        }
                    });

                    this.setupAudioStreams();

                    return {
                        content: [{
                            type: 'text',
                            text: '通话已接听'
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

        // 挂断电话
        this.server.registerTool(
            'sip_hangup',
            {
                title: 'SIP 挂断',
                description: '挂断电话',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                try {
                    if (!this.currentCall) {
                        throw new Error('没有进行中的通话');
                    }

                    if (this.currentCall.state === 'Established') {
                        await this.currentCall.bye();
                    } else if (this.currentCall.state === 'Initial') {
                        await this.currentCall.reject();
                    } else {
                        await this.currentCall.cancel();
                    }

                    this.currentCall = null;

                    return {
                        content: [{
                            type: 'text',
                            text: '通话已挂断'
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

        // 获取状态
        this.server.registerTool(
            'sip_status',
            {
                title: 'SIP 状态',
                description: '获取当前通话状态',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            async (args) => {
                const status = {
                    sipRegistered: this.isRegistered,
                    sipServer: this.config?.sipServer || '未配置',
                    username: this.config?.username || '未配置',
                    hasActiveCall: !!this.currentCall,
                    callState: this.currentCall?.state || 'none'
                };

                if (this.currentCall) {
                    status.remoteParty = this.currentCall.remoteIdentity?.uri?.user || '未知';
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(status, null, 2)
                    }]
                };
            }
        );
    }



    async initializeSipClient(config) {
        const { sipServer, username, password, domain } = config;
        
        const transportOptions = {
            server: `wss://${sipServer}:5061`,
            connectionTimeout: 5000,
            maxReconnectionAttempts: 3
        };
        
        const userAgentOptions = {
            delegate: {
                onConnect: () => console.log('SIP连接成功'),
                onDisconnect: () => console.log('SIP连接断开'),
            },
            transportOptions,
            uri: SIP.UserAgent.makeURI(`sip:${username}@${domain}`),
            authorizationUsername: username,
            authorizationPassword: password,
        };
        
        this.sipClient = new SIP.UserAgent(userAgentOptions);
        this.config = config;

        // 设置来电处理
        this.sipClient.delegate = {
            onInvite: (invitation) => this.handleIncomingCall(invitation)
        };

        await this.sipClient.start();
        this.isRegistered = true;
    }


    async makeCall(phoneNumber) {
        if (!this.sipClient) {
            throw new Error('SIP客户端未初始化');
        }
        
        if (this.currentCall) {
            throw new Error('已有通话在进行中');
        }
        
        const target = SIP.UserAgent.makeURI(`sip:${phoneNumber}@${this.config.domain}`);
        if (!target) {
            throw new Error('无效的电话号码');
        }
        
        const inviterOptions = {
            sessionDescriptionHandlerOptions: {
                constraints: { audio: true, video: false },
                iceGatheringTimeout: 5000
            }
        };
        
        this.currentCall = this.sipClient.invite(target.toString(), inviterOptions);
        
        // 设置通话事件处理器
        this.currentCall.delegate = {
            onAccept: () => this.handleCallAccepted(),
            onReject: () => this.handleCallRejected(),
            onCancel: () => this.handleCallCanceled(),
        };
        
        // 设置音频流处理
        this.setupAudioStreams();

        return { status: 'calling', message: '正在拨号...', phoneNumber };
    }
    
    handleIncomingCall(invitation) {
        console.log('收到来电:', invitation.remoteIdentity.uri.user);

        this.currentCall = invitation;

        // 设置来电事件处理器
        invitation.delegate = {
            onCancel: () => {
                console.log('来电已取消');
                this.currentCall = null;
            },
            onReject: () => {
                console.log('来电已拒绝');
                this.currentCall = null;
            }
        };

        return { status: 'incoming', caller: invitation.remoteIdentity.uri.user };
    }




    handleCallAccepted() {
        console.log('通话已接通');
        this.setupAudioStreams();
    }

    handleCallRejected() {
        console.log('通话被拒绝');
        this.currentCall = null;
    }

    handleCallCanceled() {
        console.log('通话已取消');
        this.currentCall = null;
    }

    setupAudioStreams() {
        if (!this.currentCall?.sessionDescriptionHandler?.peerConnection) {
            console.warn('无法设置音频流：PeerConnection不可用');
            return;
        }

        this.currentCall.sessionDescriptionHandler.peerConnection.addEventListener(
            'track',
            (event) => {
                console.log('收到远程音频流');
                const audioElement = new Audio();
                audioElement.srcObject = event.streams[0];
                audioElement.play().catch(console.error);
            }
        );
    }

    async start() {
        try {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.log('SIP Call MCP Server 已启动');
        } catch (error) {
            console.error('服务器启动失败:', error);
            throw error;
        }
    }
}

// 启动服务器
const server = new SipCallServer();
server.start().catch(console.error);