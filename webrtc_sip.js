import { UserAgent, Registerer, Inviter, SessionState, URI } from 'sip.js';
import WebSocket from 'ws';
// import { SessionDescriptionHandler } from 'sip.js/lib/platform/web';

// 为Node.js环境提供WebSocket和MediaStream全局对象
if (typeof global !== 'undefined') {
    if (!global.WebSocket) {
        // 创建一个包装器，添加浏览器兼容的选项
        class BrowserCompatibleWebSocket extends WebSocket {
            constructor(url, protocols, options = {}) {
                // 添加浏览器兼容的默认选项
                const defaultOptions = {
                    headers: {
                        'Sec-WebSocket-Protocol': protocols || 'sip',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Origin': url.includes('rtcdev1.sinupaas.com') ? 'https://rtcdev1.sinupaas.com' : undefined
                    },
                    ...options
                };

                super(url, protocols, defaultOptions);
            }
        }

        global.WebSocket = BrowserCompatibleWebSocket;
    }

    // 为Node.js提供MediaStream polyfill
    if (!global.MediaStream) {
        class NodeMediaStream {
            constructor() {
                this.tracks = [];
                this.id = Math.random().toString(36).substr(2, 9);
            }

            getAudioTracks() {
                return this.tracks.filter(track => track.kind === 'audio');
            }

            getVideoTracks() {
                return this.tracks.filter(track => track.kind === 'video');
            }

            getTracks() {
                return this.tracks;
            }

            addTrack(track) {
                this.tracks.push(track);
            }

            removeTrack(track) {
                const index = this.tracks.indexOf(track);
                if (index !== -1) {
                    this.tracks.splice(index, 1);
                }
            }
        }

        global.MediaStream = NodeMediaStream;
    }

    // 为Node.js提供RTCPeerConnection polyfill - 强制使用我们的实现
    if (!global.RTCPeerConnection) {
        class NodeRTCPeerConnection {
            constructor(config) {
                this.configuration = config || {};
                this.localDescription = null;
                this.remoteDescription = null;
                this.signalingState = 'stable';
                this.iceConnectionState = 'new';
                this.iceGatheringState = 'new';
                this.connectionState = 'new';
                this.tracks = [];
                this.ontrack = null;
                this.onicecandidate = null;
                this.oniceconnectionstatechange = null;
                this.onicegatheringstatechange = null;
                this.onnegotiationneeded = null;

                console.log('NodeRTCPeerConnection polyfill created - 强制使用PCMA/PCMU');
            }

            async createOffer(options) {
                console.log('NodeRTCPeerConnection: Creating offer with PCMA/PCMU codecs');
                // 生成随机端口号
                const audioPort = Math.floor(Math.random() * 30000) + 20000;
                const sessionId = Date.now();
                
                const sdp = `v=0\r\no=- ${sessionId} 2 IN IP4 114.215.29.144\r\ns=Doubango Telecom - Node.js\r\nt=0 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS ${this.generateUUID()}\r\nm=audio ${audioPort} RTP/AVP 0 8\r\nc=IN IP4 114.215.29.144\r\na=msid:${this.generateUUID()} ${this.generateUUID()}\r\na=rtcp-rsize\r\na=ssrc:${Math.floor(Math.random() * 1000000000)} cname:${this.generateRandomString(12)}\r\na=ssrc:${Math.floor(Math.random() * 1000000000)} msid:${this.generateUUID()} ${this.generateUUID()}\r\na=mid:0\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:8 PCMA/8000\r\na=sendrecv\r\n`;
                
                console.log('NodeRTCPeerConnection: Generated SDP:', sdp);
                
                return {
                    type: 'offer',
                    sdp: sdp
                };
            }

            async createAnswer(options) {
                console.log('NodeRTCPeerConnection: Creating answer with PCMA/PCMU codecs');
                // 生成随机端口号
                const audioPort = Math.floor(Math.random() * 30000) + 20000;
                const sessionId = Date.now();
                
                const sdp = `v=0\r\no=- ${sessionId} 2 IN IP4 114.215.29.144\r\ns=Doubango Telecom - Node.js\r\nt=0 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS ${this.generateUUID()}\r\nm=audio ${audioPort} RTP/AVP 0 8\r\nc=IN IP4 114.215.29.144\r\na=msid:${this.generateUUID()} ${this.generateUUID()}\r\na=rtcp-rsize\r\na=ssrc:${Math.floor(Math.random() * 1000000000)} cname:${this.generateRandomString(12)}\r\na=ssrc:${Math.floor(Math.random() * 1000000000)} msid:${this.generateUUID()} ${this.generateUUID()}\r\na=mid:0\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:8 PCMA/8000\r\na=sendrecv\r\n`;
                
                console.log('NodeRTCPeerConnection: Generated SDP:', sdp);
                
                return {
                    type: 'answer',
                    sdp: sdp
                };
            }

            generateUUID() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }

            generateRandomString(length) {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                let result = '';
                for (let i = 0; i < length; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            }

            async setLocalDescription(description) {
                console.log('Setting local description');
                this.localDescription = description;
                this.signalingState = 'have-local-offer';

                // Simulate ICE gathering
                setTimeout(() => {
                    this.iceGatheringState = 'gathering';
                    if (this.onicegatheringstatechange) {
                        this.onicegatheringstatechange({ target: this });
                    }

                    setTimeout(() => {
                        this.iceGatheringState = 'complete';
                        if (this.onicegatheringstatechange) {
                            this.onicegatheringstatechange({ target: this });
                        }
                    }, 100);
                }, 10);
            }

            async setRemoteDescription(description) {
                console.log('Setting remote description');
                this.remoteDescription = description;
                this.signalingState = 'stable';
            }

            addTrack(track, stream) {
                console.log('Adding track to peer connection');
                this.tracks.push({ track, stream });
                return { track };
            }

            getLocalStreams() {
                return this.tracks.map(t => t.stream);
            }

            getRemoteStreams() {
                return [];
            }

            getReceivers() {
                return [];
            }

            getSenders() {
                return this.tracks.map(t => ({ track: t.track }));
            }

            getTransceivers() {
                return [];
            }

            close() {
                console.log('Closing peer connection');
                this.connectionState = 'closed';
            }
        }

        global.RTCPeerConnection = NodeRTCPeerConnection;
    }

    // 为Node.js提供navigator polyfill
    if (!global.navigator) {
        global.navigator = {
            userAgent: 'Node.js WebRTC SIP Client',
            mediaDevices: {
                getUserMedia: async (constraints) => {
                    console.log('Mock getUserMedia called');
                    return new global.MediaStream();
                }
            }
        };
    }
}

export class WebRTCSipClient {
    constructor() {
        this.userAgent = null;
        this.registerer = null;
        this.currentSession = null;
        this.isRegistered = false;
        this.config = null;
        this.localStream = null;
        this.remoteStream = null;
        this.remoteAudio = null;
    }

    async register(config) {
        try {
            this.config = config;

            const uri = new URI('sip', config.username, config.domain);
            const transportOptions = {
                server: `wss://${config.sipServer}:${config.port || 5062}`,
                connectionTimeout: 30000,
                keepAliveDebounce: 30000,
                extraHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Origin': `https://${config.sipServer}`,
                    'Sec-WebSocket-Protocol': 'sip'
                }
            };

            const userAgentOptions = {
                uri,
                transportOptions,
                authorizationUsername: config.username,
                authorizationPassword: config.password,
                hackIpInContact: true,
                hackWssInTransport: true,
                sessionDescriptionHandlerFactoryOptions: {
                    peerConnectionConfiguration: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    },
                    // 自定义SDP修改器
                    modifiers: [
                        (description) => {
                            console.log('原始SDP:', description.sdp);
                            
                            // 修改SDP以使用PCMA/PCMU编码
                            let modifiedSdp = description.sdp;
                            
                            // 替换音频行，添加PCMA和PCMU编码
                            modifiedSdp = modifiedSdp.replace(
                                /m=audio \d+ RTP\/AVP.*$/m,
                                'm=audio 31652 RTP/AVP 0 8'
                            );
                            
                            // 替换IP地址
                            modifiedSdp = modifiedSdp.replace(
                                /c=IN IP4 0\.0\.0\.0/g,
                                'c=IN IP4 114.215.29.144'
                            );
                            
                            // 移除opus相关的rtpmap
                            modifiedSdp = modifiedSdp.replace(/a=rtpmap:111 opus\/48000\/2\r?\n?/g, '');
                            
                            // 添加PCMA和PCMU的rtpmap
                            if (!modifiedSdp.includes('a=rtpmap:0 PCMU/8000')) {
                                modifiedSdp += 'a=rtpmap:0 PCMU/8000\r\n';
                            }
                            if (!modifiedSdp.includes('a=rtpmap:8 PCMA/8000')) {
                                modifiedSdp += 'a=rtpmap:8 PCMA/8000\r\n';
                            }
                            
                            // 替换sendonly为sendrecv
                            modifiedSdp = modifiedSdp.replace(/a=sendonly/g, 'a=sendrecv');
                            
                            console.log('修改后SDP:', modifiedSdp);
                            
                            return Promise.resolve({
                                type: description.type,
                                sdp: modifiedSdp
                            });
                        }
                    ]
                }
            };

            this.userAgent = new UserAgent(userAgentOptions);

            this.userAgent.delegate = {
                onInvite: (invitation) => {
                    console.log('收到来电:', invitation.remoteIdentity.uri.user);
                    this.handleIncomingCall(invitation);
                },
                onConnect: () => {
                    console.log('SIP连接已建立');
                },
                onDisconnect: (error) => {
                    console.log('SIP连接断开:', error ? error.message : '未知原因');
                    this.isRegistered = false;
                }
            };

            await this.userAgent.start();

            this.registerer = new Registerer(this.userAgent);

            this.registerer.stateChange.addListener((newState) => {
                console.log('注册状态变更:', newState);
                this.isRegistered = newState === 'Registered';
            });

            await this.registerer.register();

            console.log('SIP注册成功');
            return { success: true, message: 'WebRTC SIP注册成功' };

        } catch (error) {
            console.error('SIP注册失败:', error);
            return { success: false, message: `注册失败: ${error.message}` };
        }
    }

    async makeCall(targetNumber) {
        if (!this.isRegistered) {
            throw new Error('未注册，无法拨打电话');
        }

        if (this.currentSession) {
            throw new Error('当前已有通话进行中');
        }

        try {
            const target = new URI('sip', targetNumber, this.config.domain);
            const inviteOptions = {
                sessionDescriptionHandlerOptions: {
                    constraints: {
                        audio: true,
                        video: false
                    },
                    // 自定义SDP修改器
                    modifiers: [
                        (description) => {
                            console.log('原始SDP:', description.sdp);
                            
                            // 修改SDP以使用PCMA/PCMU编码
                            let modifiedSdp = description.sdp;
                            
                            // 替换音频行，添加PCMA和PCMU编码
                            modifiedSdp = modifiedSdp.replace(
                                /m=audio \d+ RTP\/AVP.*$/m,
                                'm=audio 31652 RTP/AVP 0 8'
                            );
                            
                            // 替换IP地址
                            modifiedSdp = modifiedSdp.replace(
                                /c=IN IP4 0\.0\.0\.0/g,
                                'c=IN IP4 114.215.29.144'
                            );
                            
                            // 移除opus相关的rtpmap
                            modifiedSdp = modifiedSdp.replace(/a=rtpmap:111 opus\/48000\/2\r?\n/g, '');
                            
                            // 添加PCMA和PCMU的rtpmap
                            if (!modifiedSdp.includes('a=rtpmap:0 PCMU/8000')) {
                                modifiedSdp += 'a=rtpmap:0 PCMU/8000\r\n';
                            }
                            if (!modifiedSdp.includes('a=rtpmap:8 PCMA/8000')) {
                                modifiedSdp += 'a=rtpmap:8 PCMA/8000\r\n';
                            }
                            
                            // 添加其他必要的属性
                            if (!modifiedSdp.includes('a=sendrecv')) {
                                modifiedSdp += 'a=sendrecv\r\n';
                            }
                            
                            console.log('修改后SDP:', modifiedSdp);
                            
                            return Promise.resolve({
                                type: description.type,
                                sdp: modifiedSdp
                            });
                        }
                    ]
                }
            };

            this.currentSession = new Inviter(this.userAgent, target, inviteOptions);

            this.setupSessionHandlers(this.currentSession);

            const outgoingRequestDelegate = {
                onTrying: () => {
                    console.log('正在呼叫...');
                },
                onProgress: (response) => {
                    console.log('呼叫进行中，响应码:', response.message.statusCode);
                },
                onAccept: (response) => {
                    console.log('通话已接通');
                },
                onReject: (response) => {
                    console.log('通话被拒绝，响应码:', response.message.statusCode);
                    this.currentSession = null;
                }
            };

            await this.currentSession.invite({ requestDelegate: outgoingRequestDelegate });

            console.log(`开始呼叫: ${targetNumber}`);
            return { success: true, message: `正在呼叫 ${targetNumber}` };

        } catch (error) {
            console.error('拨打电话失败:', error);
            this.currentSession = null;
            throw error;
        }
    }

    async answerCall() {
        if (!this.currentSession) {
            throw new Error('没有来电需要接听');
        }

        try {
            const answerOptions = {
                sessionDescriptionHandlerOptions: {
                    constraints: {
                        audio: true,
                        video: false
                    }
                }
            };

            await this.currentSession.accept(answerOptions);
            console.log('通话已接听');
            return { success: true, message: '通话已接听' };

        } catch (error) {
            console.error('接听电话失败:', error);
            throw error;
        }
    }

    async hangupCall() {
        if (!this.currentSession) {
            return { success: true, message: '没有活动通话' };
        }

        try {
            if (this.currentSession.state === SessionState.Initial ||
                this.currentSession.state === SessionState.Establishing) {
                await this.currentSession.cancel();
                console.log('已取消通话');
            } else if (this.currentSession.state === SessionState.Established) {
                await this.currentSession.bye();
                console.log('已挂断通话');
            }

            this.currentSession = null;
            return { success: true, message: '通话已结束' };

        } catch (error) {
            console.error('挂断电话失败:', error);
            this.currentSession = null;
            throw error;
        }
    }

    handleIncomingCall(invitation) {
        if (this.currentSession) {
            invitation.reject();
            console.log('有通话进行中，自动拒绝来电');
            return;
        }

        this.currentSession = invitation;
        this.setupSessionHandlers(this.currentSession);

        console.log(`来电: ${invitation.remoteIdentity.uri.user}`);
    }

    setupSessionHandlers(session) {
        session.stateChange.addListener((newState) => {
            console.log('通话状态变更:', newState);

            if (newState === SessionState.Established) {
                console.log('通话已建立，开始音频流传输');
                if (this.localStream) {
                    this.attachLocalStream(session);
                }
            } else if (newState === SessionState.Terminated) {
                console.log('通话已结束');
                this.cleanupAudioStreams();
                this.currentSession = null;
            }
        });

        // Set peer connection delegate after session description handler is available
        session.delegate = {
            onSessionDescriptionHandler: (sessionDescriptionHandler) => {
                console.log('设置 peer connection delegate');
                sessionDescriptionHandler.peerConnectionDelegate = {
                    ontrack: (event) => {
                        console.log('接收到远程音频流');
                        this.handleRemoteStream(event.streams[0]);
                    },
                    onicegatheringstatechange: (event) => {
                        console.log('ICE收集状态:', event.target.iceGatheringState);
                    },
                    oniceconnectionstatechange: (event) => {
                        console.log('ICE连接状态:', event.target.iceConnectionState);
                    }
                };
            }
        };
    }

    setLocalStream(mediaStream) {
        if (!mediaStream) {
            throw new Error('媒体流不能为空');
        }

        if (this.localStream) {
            console.log('替换现有本地音频流');
            this.localStream.getTracks().forEach(track => track.stop());
        }

        this.localStream = mediaStream;
        console.log('本地媒体流已设置');

        if (this.currentSession && this.currentSession.state === SessionState.Established) {
            this.attachLocalStream(this.currentSession);
        }

        return { success: true, message: '媒体流设置成功' };
    }

    attachLocalStream(session) {
        if (!this.localStream || !session.sessionDescriptionHandler) {
            console.warn('无法附加本地音频流');
            return;
        }

        try {
            const peerConnection = session.sessionDescriptionHandler.peerConnection;
            const audioTrack = this.localStream.getAudioTracks()[0];

            if (audioTrack) {
                peerConnection.addTrack(audioTrack, this.localStream);
                console.log('本地音频流已发送到远程端');
            }
        } catch (error) {
            console.error('附加本地音频流失败:', error);
        }
    }

    handleRemoteStream(stream) {
        try {
            this.remoteStream = stream;

            if (typeof document !== 'undefined') {
                this.remoteAudio = document.createElement('audio');
                this.remoteAudio.srcObject = stream;
                this.remoteAudio.autoplay = true;
                this.remoteAudio.volume = 1.0;

                this.remoteAudio.play().then(() => {
                    console.log('远程音频播放成功');
                }).catch(e => {
                    console.error('播放远程音频失败:', e);
                });
            } else {
                console.log('非浏览器环境，需要其他方式处理音频流');
            }
        } catch (error) {
            console.error('处理远程音频流失败:', error);
        }
    }

    cleanupAudioStreams() {
        this.localStream = null;

        if (this.remoteAudio) {
            this.remoteAudio.pause();
            this.remoteAudio.srcObject = null;
            this.remoteAudio = null;
            console.log('远程音频已清理');
        }

        this.remoteStream = null;
    }


    getLocalStream() {
        return this.localStream;
    }

    getRemoteStream() {
        return this.remoteStream;
    }

    getAudioStatus() {
        const localTrack = this.localStream?.getAudioTracks()[0];
        return {
            hasLocalStream: !!this.localStream,
            hasRemoteStream: !!this.remoteStream,
            localAudioEnabled: localTrack?.enabled || false,
            remoteVolume: this.remoteAudio?.volume || 0
        };
    }

    getStatus() {
        return {
            isRegistered: this.isRegistered,
            hasActiveCall: !!this.currentSession,
            callState: this.currentSession ? this.currentSession.state : null,
            userAgent: this.userAgent ? this.userAgent.configuration.uri.toString() : null,
            audio: this.getAudioStatus()
        };
    }

    async unregister() {
        try {
            if (this.currentSession) {
                await this.hangupCall();
            }

            if (this.registerer && this.isRegistered) {
                await this.registerer.unregister();
            }

            if (this.userAgent) {
                await this.userAgent.stop();
            }

            this.cleanupAudioStreams();
            this.isRegistered = false;
            this.currentSession = null;
            this.registerer = null;
            this.userAgent = null;

            console.log('SIP客户端已停止');
            return { success: true, message: 'SIP客户端已停止' };

        } catch (error) {
            console.error('停止SIP客户端失败:', error);
            throw error;
        }
    }
}

export default WebRTCSipClient;
