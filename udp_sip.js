/**
 * Enhanced UDP SIP Call Client
 * Features: SIP registration, call handling, RTP streaming, transaction management
 */

import dgram from 'dgram';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

/**
 * Enhanced SIP Client using UDP protocol
 */
class UDPSIPClient {
    constructor(config = {}) {
        // SIP configuration with defaults
        this.username = config.username || "62200051906030";
        this.password = config.password || "9ea68973";
        this.server = config.server || "rtcdev1.sinupaas.com";
        this.port = config.port || 10060;
        this.localPort = config.localPort || 0;

        // Client state
        this.socket = null;
        this.registered = false;
        this.registrationAttempts = 0;
        this.maxRegistrationAttempts = 3;
        this.actualLocalPort = null;
        this.localIP = null;

        // Call state
        this.callAttempts = 0;
        this.maxCallAttempts = 3;
        this.currentCall = null;
        this.incomingCall = null;

        // RTP state
        this.rtpSocket = null;
        this.rtpPort = null;
        this.remoteRtpAddress = null;
        this.remoteRtpPort = null;
        this.rtpSequenceNumber = Math.floor(Math.random() * 65536);
        this.rtpTimestamp = (Date.now() * 8) & 0xFFFFFFFF;
        this.rtpSSRC = Math.floor(Math.random() * 4294967296);
        this.rtpSendInterval = null;
        this.rtpReceiveTimeout = null;
        this.lastRtpReceived = null;

        // SIP Transaction timers (RFC 3261)
        this.sipTimers = {
            T1: 500,        // Base RTT estimate (500ms)
            T2: 4000,       // Maximum retransmit interval (4s)
            T4: 5000        // Maximum duration message remains in network (5s)
        };

        // Active transactions for retransmission
        this.activeTransactions = new Map();

        // Statistics
        this.stats = {
            registrationSuccesses: 0,
            registrationFailures: 0,
            callSuccesses: 0,
            callFailures: 0,
            rtpPacketsSent: 0,
            rtpPacketsReceived: 0,
            lastRegistration: null,
            lastSuccessfulCall: null
        };

        console.log(`Initializing Enhanced UDP SIP Client for ${this.username}@${this.server}:${this.port}`);
        
        // Initialize client asynchronously
        this.clientReady = this.initClient();
    }

    // SIP Transaction Management Methods
    createTransaction(branch, method, message, messageHandler) {
        const transaction = {
            branch,
            method,
            message,
            messageHandler,
            state: 'CALLING',
            retransmitCount: 0,
            retransmitTimerId: null,
            timeoutTimerId: null,
            nextRetransmitInterval: this.sipTimers.T1,
            completed: false,
            terminated: false
        };

        this.activeTransactions.set(branch, transaction);

        if (messageHandler) {
            this.socket.on('message', messageHandler);
            console.log(`Added messageHandler for transaction ${branch}`);
        }

        return transaction;
    }

    sendWithRetransmission(transaction, callback) {
        if (transaction.terminated || transaction.completed) {
            const error = new Error('Transaction already terminated');
            if (callback) callback(error);
            return;
        }

        const msgBuffer = Buffer.from(transaction.message);
        this.socket.send(msgBuffer, this.port, this.server, (err) => {
            if (err) {
                console.error(`Failed to send ${transaction.method}: ${err.message}`);
                this.terminateTransaction(transaction.branch, err);
                if (callback) callback(err);
                return;
            }

            console.log(`${transaction.method} message sent successfully (with retransmission enabled)`);

            if (!transaction.terminated && !transaction.completed) {
                this.startRetransmissionTimer(transaction);
            }

            if (callback) callback(null);
        });
    }

    startRetransmissionTimer(transaction) {
        if (transaction.completed || transaction.terminated) return;

        const isInvite = transaction.method === 'INVITE';
        const maxRetransmits = isInvite ? 6 : 10;

        if (transaction.retransmitCount >= maxRetransmits) {
            console.error(`Transaction ${transaction.branch} failed: maximum retransmits exceeded`);
            this.terminateTransaction(transaction.branch, new Error('Transaction timeout'));
            return;
        }

        transaction.retransmitTimerId = setTimeout(() => {
            if (transaction.completed || transaction.terminated) {
                console.log(`Skipping retransmission for terminated transaction ${transaction.branch}`);
                return;
            }

            if (!this.activeTransactions.has(transaction.branch)) {
                console.log(`Skipping retransmission for removed transaction ${transaction.branch}`);
                return;
            }

            console.log(`Retransmitting ${transaction.method} (attempt ${transaction.retransmitCount + 1}/${maxRetransmits + 1})`);

            const msgBuffer = Buffer.from(transaction.message);
            this.socket.send(msgBuffer, this.port, this.server, (err) => {
                if (err) {
                    console.error(`Failed to retransmit ${transaction.method}: ${err.message}`);
                    this.terminateTransaction(transaction.branch, err);
                    return;
                }

                if (transaction.completed || transaction.terminated) {
                    return;
                }

                transaction.retransmitCount++;

                if (isInvite) {
                    transaction.nextRetransmitInterval = Math.min(
                        transaction.nextRetransmitInterval * 2,
                        this.sipTimers.T2
                    );
                } else {
                    transaction.nextRetransmitInterval = Math.min(
                        transaction.nextRetransmitInterval * 2,
                        this.sipTimers.T2
                    );
                }

                this.startRetransmissionTimer(transaction);
            });
        }, transaction.nextRetransmitInterval);

        if (!transaction.timeoutTimerId) {
            const totalTimeout = isInvite ? (64 * this.sipTimers.T1) : (32 * this.sipTimers.T1);
            transaction.timeoutTimerId = setTimeout(() => {
                if (!transaction.completed) {
                    console.error(`Transaction ${transaction.branch} timeout after ${totalTimeout}ms`);
                    this.terminateTransaction(transaction.branch, new Error('Transaction timeout'));
                }
            }, totalTimeout);
        }
    }

    terminateTransaction(branch, error = null) {
        const transaction = this.activeTransactions.get(branch);
        if (!transaction) return;

        if (transaction.terminated) return;

        transaction.terminated = true;
        transaction.completed = true;

        if (transaction.retransmitTimerId) {
            clearTimeout(transaction.retransmitTimerId);
            transaction.retransmitTimerId = null;
        }
        if (transaction.timeoutTimerId) {
            clearTimeout(transaction.timeoutTimerId);
            transaction.timeoutTimerId = null;
        }

        if (transaction.messageHandler) {
            this.socket.removeListener('message', transaction.messageHandler);
            console.log(`Removed messageHandler for transaction ${branch}`);
        }

        this.activeTransactions.delete(branch);

        if (error && transaction.errorCallback && !transaction.errorCallbackCalled) {
            transaction.errorCallbackCalled = true;
            transaction.errorCallback(error);
        }

        console.log(`Transaction ${branch} terminated (${transaction.method})`);
    }

    handleTransactionResponse(branch, responseCode) {
        const transaction = this.activeTransactions.get(branch);
        if (!transaction) return;

        const isInvite = transaction.method === 'INVITE';

        console.log(`Transaction ${branch} received response ${responseCode}`);

        if (responseCode >= 100 && responseCode < 200) {
            if (isInvite) {
                transaction.state = 'PROCEEDING';
                if (transaction.retransmitTimerId) {
                    clearTimeout(transaction.retransmitTimerId);
                    transaction.retransmitTimerId = null;
                    console.log(`Stopped retransmissions for INVITE transaction ${branch} on provisional response`);
                }
            }
        } else if (responseCode >= 200) {
            transaction.state = 'COMPLETED';
            if (transaction.retransmitTimerId) {
                clearTimeout(transaction.retransmitTimerId);
                transaction.retransmitTimerId = null;
                console.log(`Stopped retransmissions for transaction ${branch} on final response ${responseCode}`);
            }
        } else if (responseCode === 401 && !isInvite) {
            if (transaction.retransmitTimerId) {
                clearTimeout(transaction.retransmitTimerId);
                transaction.retransmitTimerId = null;
                console.log(`Stopped retransmissions for ${transaction.method} transaction ${branch} on 401 challenge`);
            }
        }
    }

    cleanupAllTransactions() {
        const branches = Array.from(this.activeTransactions.keys());
        branches.forEach(branch => {
            this.terminateTransaction(branch);
        });
        console.log(`Cleaned up ${branches.length} active transactions`);
    }

    async initClient() {
        try {
            this.localIP = this.getLocalIP();

            this.socket = dgram.createSocket('udp4');

            await new Promise((resolve, reject) => {
                this.socket.bind(this.localPort, '0.0.0.0');

                this.socket.on('listening', () => {
                    const address = this.socket.address();
                    this.actualLocalPort = address.port;
                    console.log(`SIP socket bound to ${address.address}:${address.port} (listening on all interfaces for NAT)`);
                    resolve();
                });

                this.socket.on('error', (err) => {
                    console.error(`Socket error: ${err.message}`);
                    reject(err);
                });

                this.socket.on('message', (msg, rinfo) => {
                    console.log(`[GLOBAL] Received UDP message from ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`);
                });

                setTimeout(() => {
                    reject(new Error('Socket binding timeout'));
                }, 5000);
            });

            this.socket.on('message', (msg, rinfo) => {
                this.handleSIPMessage(msg.toString(), rinfo);
            });

            await this.setupRTPSocket();

            console.log(`Initialized SIP client for ${this.username}@${this.server}:${this.port}`);

        } catch (error) {
            console.error(`Failed to initialize SIP client: ${error.message}`);
            throw error;
        }
    }

    getLocalIP() {
        try {
            const interfaces = os.networkInterfaces();

            for (const interfaceName in interfaces) {
                const interfaceInfo = interfaces[interfaceName];
                for (const info of interfaceInfo) {
                    if (info.family === 'IPv4' && !info.internal) {
                        console.log(`Detected local IP address: ${info.address}`);
                        if (this.isPrivateIP(info.address)) {
                            console.warn(`Local IP ${info.address} is private (behind NAT)`);
                            console.warn(`Echo test may fail due to NAT - remote cannot reach private IP`);
                        }
                        return info.address;
                    }
                }
            }

            console.warn('Could not detect local IP, using localhost');
            return '127.0.0.1';

        } catch (error) {
            console.warn(`Failed to detect local IP: ${error.message}`);
            return '127.0.0.1';
        }
    }

    isPrivateIP(ip) {
        return ip.startsWith('192.168.') ||
               ip.startsWith('10.') ||
               (ip.startsWith('172.') &&
                parseInt(ip.split('.')[1]) >= 16 &&
                parseInt(ip.split('.')[1]) <= 31);
    }

    async setupRTPSocket() {
        try {
            this.rtpSocket = dgram.createSocket('udp4');

            await new Promise((resolve, reject) => {
                this.rtpSocket.bind(0, '0.0.0.0');

                this.rtpSocket.on('listening', () => {
                    const address = this.rtpSocket.address();
                    this.rtpPort = address.port;
                    console.log(`RTP socket bound to ${address.address}:${address.port}`);
                    resolve();
                });

                this.rtpSocket.on('error', (err) => {
                    console.error(`RTP socket error: ${err.message}`);
                    reject(err);
                });

                setTimeout(() => {
                    reject(new Error('RTP socket binding timeout'));
                }, 5000);
            });

            this.rtpSocket.on('message', (msg, rinfo) => {
                console.log(`★ RTP PACKET RECEIVED ★ from ${rinfo.address}:${rinfo.port}, size: ${msg.length} bytes`);
                this.handleRTPPacket(msg, rinfo);
            });

        } catch (error) {
            console.error(`Failed to setup RTP socket: ${error.message}`);
            throw error;
        }
    }

    handleRTPPacket(packet, rinfo) {
        try {
            this.lastRtpReceived = new Date();
            this.stats.rtpPacketsReceived++;

            if (this.rtpReceiveTimeout) {
                clearTimeout(this.rtpReceiveTimeout);
                this.rtpReceiveTimeout = null;
            }

            const isFromRemote = (rinfo.address === this.remoteRtpAddress);

            if (this.stats.rtpPacketsReceived === 1 && isFromRemote) {
                console.log(`🎉 RTP echo established from ${rinfo.address}:${rinfo.port}`);
            } else if (!isFromRemote && rinfo.address !== this.localIP && rinfo.address !== '127.0.0.1') {
                console.warn(`Unexpected RTP from ${rinfo.address} (expected ${this.remoteRtpAddress})`);
            }

            if (packet.length >= 12) {
                const version = (packet[0] >> 6) & 0x03;
                const payloadType = packet[1] & 0x7F;

                if (version !== 2 || payloadType !== 0) {
                    const sequenceNumber = packet.readUInt16BE(2);
                    const timestamp = packet.readUInt32BE(4);
                    console.warn(`Invalid RTP: v=${version}, pt=${payloadType}, seq=${sequenceNumber}, ts=${timestamp}`);
                }
            }

        } catch (error) {
            console.error(`Error handling RTP packet: ${error.message}`);
        }
    }

    generateRTPPacket() {
        try {
            const header = Buffer.alloc(12);

            header[0] = 0x80; // V=2, P=0, X=0, CC=0
            header[1] = 0x00; // M=0, PT=0 (PCMU)

            header.writeUInt16BE(this.rtpSequenceNumber, 2);
            this.rtpSequenceNumber = (this.rtpSequenceNumber + 1) & 0xFFFF;

            header.writeUInt32BE(this.rtpTimestamp >>> 0, 4);
            this.rtpTimestamp = (this.rtpTimestamp + 160) >>> 0;

            header.writeUInt32BE(this.rtpSSRC >>> 0, 8);

            const payloadSize = 160;
            const payload = Buffer.alloc(payloadSize);
            payload.fill(0xFF);

            const rtpPacket = Buffer.concat([header, payload]);

            if (this.stats.rtpPacketsSent === 0) {
                console.log(`RTP packet generation: ${rtpPacket.length} bytes, PCMU/8kHz`);
            }

            return rtpPacket;

        } catch (error) {
            console.error(`Error generating RTP packet: ${error.message}`);
            return null;
        }
    }

    startRTPStream() {
        try {
            if (!this.remoteRtpAddress || !this.remoteRtpPort) {
                console.error('Cannot start RTP stream: Remote RTP address not set');
                return;
            }

            console.log(`Starting RTP stream: ${this.localIP}:${this.rtpPort} → ${this.remoteRtpAddress}:${this.remoteRtpPort}`);

            this.rtpTimestamp = (Date.now() * 8) & 0xFFFFFFFF;

            this.rtpSendInterval = setInterval(() => {
                const rtpPacket = this.generateRTPPacket();
                if (rtpPacket && this.rtpSocket) {
                    this.rtpSocket.send(rtpPacket, this.remoteRtpPort, this.remoteRtpAddress, (err) => {
                        if (err) {
                            console.error(`Failed to send RTP packet ${this.stats.rtpPacketsSent + 1}: ${err.message}`);
                        } else {
                            this.stats.rtpPacketsSent++;

                            if (this.stats.rtpPacketsSent === 1) {
                                console.log(`RTP stream started to ${this.remoteRtpAddress}:${this.remoteRtpPort}`);
                            } else if (this.stats.rtpPacketsSent % 100 === 0) {
                                console.log(`RTP: sent ${this.stats.rtpPacketsSent}, received ${this.stats.rtpPacketsReceived}`);
                            }
                        }
                    });
                }
            }, 20);

            this.setupRTPReceiveTimeout();

            console.log('RTP stream started');

        } catch (error) {
            console.error(`Error starting RTP stream: ${error.message}`);
        }
    }

    setupRTPReceiveTimeout() {
        if (this.rtpReceiveTimeout) {
            clearTimeout(this.rtpReceiveTimeout);
        }

        this.rtpReceiveTimeout = setTimeout(() => {
            console.warn(`RTP timeout: No RTP packets received within 5 seconds`);
            console.warn(`RTP Debug Info:`);
            console.warn(`  - Local RTP socket: ${this.localIP}:${this.rtpPort}`);
            console.warn(`  - Remote RTP address: ${this.remoteRtpAddress}:${this.remoteRtpPort}`);
            console.warn(`  - RTP packets sent: ${this.stats.rtpPacketsSent}`);
            console.warn(`  - RTP packets received: ${this.stats.rtpPacketsReceived}`);
        }, 5000);

        console.log(`⏰ RTP receive timeout set for 5 seconds. Listening on ${this.localIP}:${this.rtpPort}`);
    }

    stopRTPStream() {
        try {
            if (this.rtpSendInterval) {
                clearInterval(this.rtpSendInterval);
                this.rtpSendInterval = null;
                console.log('RTP send interval cleared');
            }

            if (this.rtpReceiveTimeout) {
                clearTimeout(this.rtpReceiveTimeout);
                this.rtpReceiveTimeout = null;
                console.log('RTP receive timeout cleared');
            }

            this.remoteRtpAddress = null;
            this.remoteRtpPort = null;
            this.lastRtpReceived = null;

            this.rtpTimestamp = (Date.now() * 8) & 0xFFFFFFFF;

            console.log('RTP stream stopped');

        } catch (error) {
            console.error(`Error stopping RTP stream: ${error.message}`);
        }
    }

    parseSDPForRTP(sdpContent) {
        try {
            const lines = sdpContent.split('\r\n');
            let remoteIP = null;
            let remotePort = null;

            console.log(`📄 Parsing SDP for RTP information:`);

            for (const line of lines) {
                console.log(`SDP line: "${line}"`);

                if (line.startsWith('c=IN IP4 ')) {
                    remoteIP = line.substring('c=IN IP4 '.length).trim();
                    console.log(`📍 Found connection line: c=IN IP4 ${remoteIP}`);
                }
                else if (line.startsWith('m=audio ')) {
                    const parts = line.split(' ');
                    if (parts.length >= 2) {
                        remotePort = parseInt(parts[1]);
                        console.log(`🎵 Found media line: m=audio ${remotePort}`);
                    }
                }
            }

            console.log(`📊 SDP parsing results:`);
            console.log(`  - Remote IP: ${remoteIP || 'NOT FOUND'}`);
            console.log(`  - Remote Port: ${remotePort || 'NOT FOUND'}`);

            if (remoteIP && remotePort) {
                this.remoteRtpAddress = remoteIP;
                this.remoteRtpPort = remotePort;
                console.log(`✅ Successfully parsed RTP destination: ${remoteIP}:${remotePort}`);

                if (remoteIP === this.localIP) {
                    console.log(`🔄 ECHO TEST DETECTED: Remote RTP IP matches our local IP`);
                } else {
                    console.log(`🌐 REMOTE RTP: Server RTP endpoint is ${remoteIP}:${remotePort}`);
                }

                return true;
            } else {
                console.warn('❌ Failed to parse RTP destination from SDP - missing IP or port');
                return false;
            }

        } catch (error) {
            console.error(`Error parsing SDP for RTP: ${error.message}`);
            return false;
        }
    }

    async register() {
        try {
            await this.clientReady;

            console.log(`Attempting registration to ${this.server}:${this.port}`);

            return new Promise((resolve, reject) => {
                this._doRegister(resolve, reject);
            });

        } catch (error) {
            console.error(`Registration error: ${error.message}`);
            this.stats.registrationFailures++;
            throw error;
        }
    }

    _doRegister(resolve, reject) {
        try {
            const callId = uuidv4().replace(/-/g, '');
            const branch = `z9hG4bK${uuidv4().replace(/-/g, '').substring(0, 16)}`;
            const tag = uuidv4().replace(/-/g, '').substring(0, 8);

            const registerMsg = this.buildRegisterMessage(callId, branch, tag);

            console.log(`Sending REGISTER message`);

            const transactionTimeout = 32 * this.sipTimers.T1;
            const timeout = Math.max(transactionTimeout + 5000, 20000);
            const timeoutId = setTimeout(() => {
                console.error('Registration timeout - terminating all related transactions');
                this.activeTransactions.forEach((transaction, branch) => {
                    if (transaction.method === 'REGISTER') {
                        this.terminateTransaction(branch);
                    }
                });
                this.stats.registrationFailures++;
                reject(new Error('Registration timeout'));
            }, timeout);

            const messageHandler = (msg, rinfo) => {
                try {
                    const message = typeof msg === 'string' ? msg : msg.toString();

                    console.log(`Received SIP response from ${rinfo.address}:${rinfo.port}`);

                    if (!message.includes(`Call-ID: ${callId}`)) {
                        console.log(`Ignoring message - different Call-ID (expected: ${callId})`);
                        return;
                    }

                    console.log(`Processing registration response for Call-ID: ${callId}`);

                    if (message.includes('SIP/2.0 200 OK')) {
                        const sipMatch = message.match(/^SIP\/2\.0\s+(\d+)/);
                        if (sipMatch) {
                            const responseCode = parseInt(sipMatch[1]);
                            this.handleTransactionResponse(branch, responseCode);
                        }
                        clearTimeout(timeoutId);
                        this.registered = true;
                        this.stats.registrationSuccesses++;
                        this.stats.lastRegistration = new Date();
                        console.log('Registration successful');
                        resolve(true);

                    } else if (message.includes('SIP/2.0 401 Unauthorized')) {
                        console.log('Received 401 challenge, stopping retransmission and retrying with authentication');

                        console.log(`Before cleanup, active transactions: ${this.activeTransactions.size}`);
                        this.cleanupAllTransactions();
                        console.log(`After cleanup, active transactions: ${this.activeTransactions.size}`);

                        const authChallenge = this.parseAuthChallenge(message);
                        if (authChallenge) {
                            const newBranch = `z9hG4bK${uuidv4().replace(/-/g, '').substring(0, 16)}`;
                            const authRegisterMsg = this.buildAuthenticatedRegisterMessage(callId, newBranch, tag, authChallenge);

                            console.log(`Sending authenticated REGISTER with NEW branch: ${newBranch}`);

                            const authMessageHandler = (msg, rinfo) => {
                                try {
                                    const authMessage = typeof msg === 'string' ? msg : msg.toString();

                                    if (!authMessage.includes(`Call-ID: ${callId}`)) {
                                        return;
                                    }

                                    console.log(`Processing authenticated registration response`);

                                    if (authMessage.includes('SIP/2.0 200 OK')) {
                                        clearTimeout(timeoutId);
                                        this.socket.removeListener('message', authMessageHandler);
                                        this.registered = true;
                                        this.stats.registrationSuccesses++;
                                        this.stats.lastRegistration = new Date();
                                        console.log('Authenticated registration successful');
                                        resolve(true);

                                    } else if (authMessage.includes('SIP/2.0 403') ||
                                              authMessage.includes('SIP/2.0 4') ||
                                              authMessage.includes('SIP/2.0 5')) {
                                        clearTimeout(timeoutId);
                                        this.socket.removeListener('message', authMessageHandler);
                                        const statusLine = authMessage.split('\r\n')[0];
                                        console.error(`Authenticated registration failed: ${statusLine}`);
                                        this.stats.registrationFailures++;
                                        reject(new Error(`Authenticated registration failed: ${statusLine}`));
                                    }
                                } catch (error) {
                                    console.error(`Error handling authenticated registration response: ${error.message}`);
                                }
                            };

                            this.socket.on('message', authMessageHandler);

                            const authMsgBuffer = Buffer.from(authRegisterMsg);
                            this.socket.send(authMsgBuffer, this.port, this.server, (err) => {
                                if (err) {
                                    clearTimeout(timeoutId);
                                    this.socket.removeListener('message', authMessageHandler);
                                    console.error(`Failed to send authenticated REGISTER: ${err.message}`);
                                    this.stats.registrationFailures++;
                                    reject(err);
                                } else {
                                    console.log('Authenticated REGISTER sent successfully - waiting for response');
                                }
                            });
                        } else {
                            clearTimeout(timeoutId);
                            console.error('Failed to parse authentication challenge');
                            this.stats.registrationFailures++;
                            reject(new Error('Failed to parse authentication challenge'));
                        }

                    } else if ((message.includes('SIP/2.0 403') ||
                              message.includes('SIP/2.0 4') || message.includes('SIP/2.0 5'))) {
                        clearTimeout(timeoutId);
                        const statusLine = message.split('\r\n')[0];
                        console.error(`Registration failed: ${statusLine}`);
                        this.stats.registrationFailures++;
                        reject(new Error(`Registration failed: ${statusLine}`));
                    }
                } catch (error) {
                    console.error(`Error handling registration response: ${error.message}`);
                }
            };

            const transaction = this.createTransaction(branch, 'REGISTER', registerMsg, messageHandler);
            transaction.errorCallback = (error) => {
                clearTimeout(timeoutId);
                this.stats.registrationFailures++;
                reject(error);
            };

            console.log(`Attempting to reach SIP server: ${this.server}:${this.port}`);
            console.log(`Local socket bound to: ${this.localIP}:${this.actualLocalPort}`);
            console.log(`Expected Call-ID pattern: ${callId}`);

            this.sendWithRetransmission(transaction, (err) => {
                if (err) {
                    clearTimeout(timeoutId);
                    this.stats.registrationFailures++;
                    reject(err);
                }
            });

        } catch (error) {
            console.error(`Registration error: ${error.message}`);
            this.stats.registrationFailures++;
            reject(error);
        }
    }

    buildRegisterMessage(callId, branch, tag) {
        const sipUri = `sip:${this.server}`;
        const aorUri = `sip:${this.username}@${this.server}`;
        const contactUri = `sip:${this.username}@${this.localIP}:${this.actualLocalPort}`;

        return [
            `REGISTER ${sipUri} SIP/2.0`,
            `Via: SIP/2.0/UDP ${this.localIP}:${this.actualLocalPort};rport;branch=${branch}`,
            `Max-Forwards: 70`,
            `Contact: <${contactUri}>`,
            `To: <${aorUri}>`,
            `From: <${aorUri}>;tag=${tag}`,
            `Call-ID: ${callId}@${this.localIP}`,
            `CSeq: 1 REGISTER`,
            `Expires: 3600`,
            `Allow: INVITE, ACK, BYE, CANCEL, OPTIONS, PRACK, REFER, NOTIFY, SUBSCRIBE, INFO`,
            `User-Agent: NodeJS-UDP-SIP-Client 1.0`,
            `Content-Length: 0`,
            ``,
            ``
        ].join('\r\n');
    }

    parseAuthChallenge(message) {
        try {
            const lines = message.split('\r\n');
            let wwwAuthLine = '';

            for (const line of lines) {
                if (line.startsWith('WWW-Authenticate:')) {
                    wwwAuthLine = line;
                    break;
                }
            }

            if (!wwwAuthLine) {
                console.error('No WWW-Authenticate header found');
                return null;
            }

            const challenge = {};
            const digestMatch = wwwAuthLine.match(/Digest\s+(.+)/);
            if (!digestMatch) {
                console.error('Not a Digest authentication challenge');
                return null;
            }

            const params = digestMatch[1];

            const realmMatch = params.match(/realm="([^"]+)"/);
            if (realmMatch) challenge.realm = realmMatch[1];

            const nonceMatch = params.match(/nonce="([^"]+)"/);
            if (nonceMatch) challenge.nonce = nonceMatch[1];

            const algorithmMatch = params.match(/algorithm=([^,\s]+)/);
            challenge.algorithm = algorithmMatch ? algorithmMatch[1] : 'MD5';

            const qopMatch = params.match(/qop="([^"]+)"/);
            if (qopMatch) challenge.qop = qopMatch[1];

            console.log(`Parsed auth challenge: realm="${challenge.realm}", nonce="${challenge.nonce}", algorithm="${challenge.algorithm}"`);

            return challenge;

        } catch (error) {
            console.error(`Error parsing auth challenge: ${error.message}`);
            return null;
        }
    }

    buildAuthenticatedRegisterMessage(callId, branch, tag, authChallenge) {
        const sipUri = `sip:${this.server}`;
        const aorUri = `sip:${this.username}@${this.server}`;
        const contactUri = `sip:${this.username}@${this.localIP}:${this.actualLocalPort}`;

        const authResponse = this.calculateDigestResponse(
            'REGISTER',
            sipUri,
            authChallenge
        );

        let authHeader = `Digest username="${this.username}", realm="${authChallenge.realm}", nonce="${authChallenge.nonce}", uri="${sipUri}", response="${authResponse}", algorithm=${authChallenge.algorithm}`;

        return [
            `REGISTER ${sipUri} SIP/2.0`,
            `Via: SIP/2.0/UDP ${this.localIP}:${this.actualLocalPort};rport;branch=${branch}`,
            `Max-Forwards: 70`,
            `Contact: <${contactUri}>`,
            `To: <${aorUri}>`,
            `From: <${aorUri}>;tag=${tag}`,
            `Call-ID: ${callId}@${this.localIP}`,
            `CSeq: 2 REGISTER`,
            `Expires: 3600`,
            `Authorization: ${authHeader}`,
            `Allow: INVITE, ACK, BYE, CANCEL, OPTIONS, PRACK, REFER, NOTIFY, SUBSCRIBE, INFO`,
            `User-Agent: NodeJS-UDP-SIP-Client 1.0`,
            `Content-Length: 0`,
            ``,
            ``
        ].join('\r\n');
    }

    calculateDigestResponse(method, uri, challenge) {
        try {
            const ha1 = crypto.createHash('md5')
                .update(`${this.username}:${challenge.realm}:${this.password}`)
                .digest('hex');

            const ha2 = crypto.createHash('md5')
                .update(`${method}:${uri}`)
                .digest('hex');

            const response = crypto.createHash('md5')
                .update(`${ha1}:${challenge.nonce}:${ha2}`)
                .digest('hex');

            console.log(`Calculated digest response: ${response}`);
            return response;

        } catch (error) {
            console.error(`Error calculating digest response: ${error.message}`);
            return '';
        }
    }

    async makeCall(destNumber, duration = 10) {
        if (!this.registered) {
            throw new Error('Cannot make call: Not registered');
        }

        return new Promise((resolve, reject) => {
            try {
                console.log(`Making call to ${destNumber}`);

                const callId = uuidv4().replace(/-/g, '');
                const branch = `z9hG4bK${uuidv4().replace(/-/g, '').substring(0, 16)}`;
                const tag = uuidv4().replace(/-/g, '').substring(0, 8);

                const inviteMsg = this.buildInviteMessage(destNumber, callId, branch, tag);

                let callEstablished = false;
                let callEnded = false;

                const transactionTimeout = 64 * this.sipTimers.T1;
                const timeout = Math.max(transactionTimeout + 5000, 40000);
                const timeoutId = setTimeout(() => {
                    if (!callEstablished) {
                        console.error('Call establishment timeout - terminating transaction');
                        this.terminateTransaction(branch);
                        this.stats.callFailures++;
                        reject(new Error('Call establishment timeout'));
                    }
                }, timeout);

                const messageHandler = (msg, rinfo) => {
                    try {
                        const message = typeof msg === 'string' ? msg : msg.toString();

                        if (!message.includes(`Call-ID: ${callId}`)) {
                            return;
                        }

                        const sipMatch = message.match(/^SIP\/2\.0\s+(\d+)/);
                        if (sipMatch) {
                            const responseCode = parseInt(sipMatch[1]);
                            this.handleTransactionResponse(branch, responseCode);
                        }

                        if (message.includes('SIP/2.0 200 OK') && message.includes('INVITE')) {
                            if (!callEstablished) {
                                callEstablished = true;
                                clearTimeout(timeoutId);
                                console.log('Call answered (200 OK)');

                                const sdpStart = message.indexOf('\r\n\r\n');
                                if (sdpStart !== -1) {
                                    const sdpContent = message.substring(sdpStart + 4);
                                    console.log(`Received SDP in 200 OK response:`);
                                    console.log(`SDP Content:\n${sdpContent}`);

                                    if (this.parseSDPForRTP(sdpContent)) {
                                        console.log(`✅ Successfully parsed remote RTP endpoint: ${this.remoteRtpAddress}:${this.remoteRtpPort}`);
                                        this.startRTPStream();
                                    } else {
                                        console.error(`❌ Failed to parse remote RTP endpoint from SDP`);
                                    }
                                } else {
                                    console.warn(`No SDP content found in 200 OK response`);
                                }

                                this.sendACK(destNumber, callId, tag, message);

                                console.log(`Call established, keeping active for ${duration} seconds`);
                                setTimeout(() => {
                                    if (!callEnded) {
                                        this.stopRTPStream();
                                        this.stats.callSuccesses++;
                                        this.stats.lastSuccessfulCall = new Date();
                                        console.log('Call completed successfully');
                                        resolve(true);
                                    }
                                }, duration * 1000);
                            }

                        } else if (message.includes('SIP/2.0 180') || message.includes('SIP/2.0 183')) {
                            console.log('Call ringing...');

                        } else if (message.includes('SIP/2.0 486') || message.includes('SIP/2.0 603') ||
                                  message.includes('SIP/2.0 404') || message.includes('SIP/2.0 480')) {
                            clearTimeout(timeoutId);
                            const statusLine = message.split('\r\n')[0];
                            console.log(`Call rejected: ${statusLine}`);
                            this.stats.callFailures++;
                            reject(new Error(`Call rejected: ${statusLine}`));

                        } else if (message.startsWith('BYE sip:')) {
                            if (callEstablished && !callEnded) {
                                callEnded = true;
                                console.log('Received BYE request from remote party');
                                this.stopRTPStream();
                                this.sendByeOK(message, rinfo);
                                this.stats.callSuccesses++;
                                this.stats.lastSuccessfulCall = new Date();
                                console.log('Call ended by remote party');
                                resolve(true);
                            }
                        }

                    } catch (error) {
                        console.error(`Error handling call response: ${error.message}`);
                    }
                };

                const transaction = this.createTransaction(branch, 'INVITE', inviteMsg, messageHandler);
                transaction.errorCallback = (error) => {
                    clearTimeout(timeoutId);
                    this.stats.callFailures++;
                    reject(error);
                };

                this.sendWithRetransmission(transaction, (err) => {
                    if (err) {
                        clearTimeout(timeoutId);
                        this.stats.callFailures++;
                        reject(err);
                    }
                });

            } catch (error) {
                console.error(`Call error: ${error.message}`);
                this.stats.callFailures++;
                reject(error);
            }
        });
    }

    buildInviteMessage(destNumber, callId, branch, tag) {
        const sessionId = Math.floor(Math.random() * 900000000) + 100000000;
        const version = Math.floor(Math.random() * 9) + 1;

        const rtpPort = this.rtpPort || 10000;

        const sdpContent = [
            `v=0`,
            `o=${this.username} ${sessionId} ${version} IN IP4 ${this.localIP}`,
            `s=-`,
            `c=IN IP4 ${this.localIP}`,
            `t=0 0`,
            `m=audio ${rtpPort} RTP/AVP 0 8 101`,
            `a=rtpmap:0 PCMU/8000`,
            `a=rtpmap:8 PCMA/8000`,
            `a=rtpmap:101 telephone-event/8000`,
            `a=fmtp:101 0-15`,
            `a=sendrecv`,
            ``
        ].join('\r\n');

        console.log(`Generated SDP for INVITE:`);
        console.log(`  - Our RTP socket: ${this.localIP}:${rtpPort}`);
        console.log(`  - SDP connection line: c=IN IP4 ${this.localIP}`);
        console.log(`  - SDP media line: m=audio ${rtpPort} RTP/AVP 0 8 101`);

        const contentLength = Buffer.byteLength(sdpContent, 'utf8');

        return [
            `INVITE sip:${destNumber}@${this.server} SIP/2.0`,
            `Via: SIP/2.0/UDP ${this.localIP}:${this.actualLocalPort};rport;branch=${branch}`,
            `Max-Forwards: 70`,
            `Contact: <sip:${this.username}@${this.localIP}:${this.actualLocalPort}>`,
            `To: <sip:${destNumber}@${this.server}>`,
            `From: <sip:${this.username}@${this.localIP}>;tag=${tag}`,
            `Call-ID: ${callId}@${this.localIP}`,
            `CSeq: 1 INVITE`,
            `Allow: INVITE, ACK, BYE, CANCEL`,
            `Content-Type: application/sdp`,
            `User-Agent: NodeJS-UDP-SIP-Client 1.0`,
            `Content-Length: ${contentLength}`,
            ``,
            sdpContent
        ].join('\r\n');
    }

    sendACK(destNumber, callId, tag, response200) {
        try {
            let toTag = '';
            const lines = response200.split('\r\n');
            for (const line of lines) {
                if (line.startsWith('To:') && line.includes('tag=')) {
                    const match = line.match(/tag=([^;>\s]+)/);
                    if (match) {
                        toTag = match[1];
                        break;
                    }
                }
            }

            const branch = `z9hG4bK${uuidv4().replace(/-/g, '').substring(0, 16)}`;

            const ackMsg = [
                `ACK sip:${destNumber}@${this.server} SIP/2.0`,
                `Via: SIP/2.0/UDP ${this.localIP}:${this.actualLocalPort};rport;branch=${branch}`,
                `Max-Forwards: 70`,
                `To: <sip:${destNumber}@${this.server}>;tag=${toTag}`,
                `From: <sip:${this.username}@${this.localIP}>;tag=${tag}`,
                `Call-ID: ${callId}@${this.localIP}`,
                `CSeq: 1 ACK`,
                `Content-Length: 0`,
                ``,
                ``
            ].join('\r\n');

            const msgBuffer = Buffer.from(ackMsg);
            this.socket.send(msgBuffer, this.port, this.server, (err) => {
                if (err) {
                    console.warn(`Failed to send ACK: ${err.message}`);
                } else {
                    console.log('ACK sent successfully');
                }
            });

        } catch (error) {
            console.warn(`Failed to send ACK: ${error.message}`);
        }
    }

    sendByeOK(byeMessage, rinfo) {
        try {
            const lines = byeMessage.split('\r\n');
            let cseq = '';
            let fromHeader = '';
            let toHeader = '';
            let callIdHeader = '';
            const viaHeaders = [];

            for (const line of lines) {
                if (line.startsWith('CSeq:')) {
                    cseq = line;
                } else if (line.startsWith('From:')) {
                    fromHeader = line;
                } else if (line.startsWith('To:')) {
                    toHeader = line;
                } else if (line.startsWith('Via:')) {
                    viaHeaders.push(line);
                } else if (line.startsWith('Call-ID:')) {
                    callIdHeader = line;
                }
            }

            // 构建BYE 200 OK响应
            const responseLines = [
                `SIP/2.0 200 OK`
            ];

            // 添加所有Via头（必须按原顺序）
            viaHeaders.forEach(via => responseLines.push(via));

            // 添加其他必要头
            responseLines.push(
                fromHeader,
                toHeader,
                callIdHeader,
                cseq,
                `User-Agent: NodeJS-UDP-SIP-Client 1.0`,
                `Content-Length: 0`,
                ``,
                ``
            );

            const byeOK = responseLines.join('\r\n');

            console.log('发送BYE 200 OK响应:');
            console.log(byeOK);

            const msgBuffer = Buffer.from(byeOK);
            this.socket.send(msgBuffer, rinfo.port, rinfo.address, (err) => {
                if (err) {
                    console.warn(`Failed to send BYE 200 OK: ${err.message}`);
                } else {
                    console.log('BYE 200 OK sent successfully');
                }
            });

        } catch (error) {
            console.error(`Failed to send BYE 200 OK: ${error.message}`);
        }
    }

    handleSIPMessage(message, rinfo) {
        try {
            console.log(`Received SIP message from ${rinfo.address}:${rinfo.port}`);

            if (message.startsWith('INVITE sip:')) {
                console.log(`Incoming call from ${rinfo.address}:${rinfo.port}`);
                this.handleIncomingCall(message, rinfo);
            } else if (message.startsWith('ACK sip:')) {
                console.log(`Received ACK from ${rinfo.address}:${rinfo.port}`);
                this.handleACK(message, rinfo);
            } else if (message.startsWith('BYE sip:')) {
                console.log(`Received BYE from ${rinfo.address}:${rinfo.port}`);
                this.handleBYE(message, rinfo);
            }
        } catch (error) {
            console.error(`Error handling SIP message: ${error.message}`);
        }
    }

    handleIncomingCall(inviteMessage, rinfo) {
        try {
            // 解析来电信息
            const callInfo = this.parseInviteMessage(inviteMessage, rinfo);

            if (this.currentCall) {
                console.log('已有通话进行中，拒绝来电');
                this.rejectIncomingCall(inviteMessage, rinfo);
                return;
            }

            // 如果已有来电等待处理，先拒绝旧的来电
            if (this.incomingCall) {
                console.log('已有来电等待处理，拒绝新来电');
                this.rejectIncomingCall(inviteMessage, rinfo);
                return;
            }

            // 存储来电信息
            this.incomingCall = callInfo;
            console.log(`来电等待应答，来自: ${callInfo.fromUser}`);

            // 这里可以触发事件或回调通知应用层有来电

        } catch (error) {
            console.error(`处理来电失败: ${error.message}`);
            this.rejectIncomingCall(inviteMessage, rinfo);
        }
    }

    parseInviteMessage(inviteMessage, rinfo) {
        const lines = inviteMessage.split('\r\n');
        const callInfo = {
            message: inviteMessage,
            rinfo: rinfo,
            timestamp: Date.now()
        };

        for (const line of lines) {
            if (line.startsWith('CSeq:')) {
                callInfo.cseq = line;
            } else if (line.startsWith('From:')) {
                callInfo.fromHeader = line;
                // 提取用户名
                const match = line.match(/sip:([^@]+)/);
                if (match) {
                    callInfo.fromUser = match[1];
                }
            } else if (line.startsWith('To:')) {
                callInfo.toHeader = line;
            } else if (line.startsWith('Via:')) {
                callInfo.viaHeader = line;
            } else if (line.startsWith('Call-ID:')) {
                callInfo.callIdHeader = line;
            } else if (line.startsWith('Contact:')) {
                callInfo.contactHeader = line;
            } else if (line.startsWith('m=audio')) {
                // 解析RTP端口
                const portMatch = line.match(/m=audio (\d+)/);
                if (portMatch) {
                    callInfo.remoteRtpPort = parseInt(portMatch[1]);
                }
            } else if (line.startsWith('c=IN IP4')) {
                // 解析RTP地址
                const ipMatch = line.match(/c=IN IP4 (.+)/);
                if (ipMatch) {
                    callInfo.remoteRtpAddress = ipMatch[1];
                }
            }
        }

        return callInfo;
    }

    async answerCall() {
        if (!this.incomingCall) {
            throw new Error('没有来电需要应答');
        }

        try {
            const callInfo = this.incomingCall;

            // 设置当前通话信息
            this.currentCall = {
                ...callInfo,
                answered: true,
                startTime: Date.now()
            };

            // 设置RTP参数
            if (callInfo.remoteRtpAddress && callInfo.remoteRtpPort) {
                this.remoteRtpAddress = callInfo.remoteRtpAddress;
                this.remoteRtpPort = callInfo.remoteRtpPort;
            }

            // 发送200 OK响应
            const okResponse = this.createOKResponse(callInfo);

            await new Promise((resolve, reject) => {
                const msgBuffer = Buffer.from(okResponse);
                this.socket.send(msgBuffer, callInfo.rinfo.port, callInfo.rinfo.address, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('已发送200 OK，通话已接听');
                        resolve();
                    }
                });
            });

            // 开始RTP流
            this.startRTPStream();

            // 清除来电状态
            this.incomingCall = null;

            return true;

        } catch (error) {
            console.error(`应答来电失败: ${error.message}`);
            this.incomingCall = null;
            throw error;
        }
    }

    createOKResponse(callInfo) {
        // 为To头添加tag（如果没有的话）
        let toHeader = callInfo.toHeader;
        if (!toHeader.includes('tag=')) {
            toHeader += `;tag=${this.generateTag()}`;
        }

        // 获取本地IP
        const localIP = this.localIP || this.getLocalIP();
        const rtpPort = this.rtpPort || 5004;

        // 创建正确格式的SDP
        const sdpContent = [
            `v=0`,
            `o=- ${Date.now()} ${Date.now()} IN IP4 ${localIP}`,
            `s=SIP Call`,
            `c=IN IP4 ${localIP}`,
            `t=0 0`,
            `m=audio ${rtpPort} RTP/AVP 0 8`,
            `a=rtpmap:0 PCMU/8000`,
            `a=rtpmap:8 PCMA/8000`,
            `a=sendrecv`,
            ``
        ].join('\r\n');

        // 计算正确的Content-Length
        const contentLength = Buffer.byteLength(sdpContent, 'utf8');

        // 解析Via头，确保正确复制所有Via头
        const lines = callInfo.message.split('\r\n');
        const viaHeaders = [];
        const recordRouteHeaders = [];
        
        for (const line of lines) {
            if (line.startsWith('Via:')) {
                viaHeaders.push(line);
            } else if (line.startsWith('Record-Route:')) {
                recordRouteHeaders.push(line);
            }
        }

        // 构建200 OK响应
        const responseLines = [
            `SIP/2.0 200 OK`
        ];

        // 添加所有Via头（必须按原顺序）
        viaHeaders.forEach(via => responseLines.push(via));

        // 添加Record-Route头（如果存在）
        recordRouteHeaders.forEach(rr => responseLines.push(rr));

        // 添加其他必要头
        responseLines.push(
            callInfo.fromHeader,
            toHeader,
            callInfo.callIdHeader,
            callInfo.cseq,
            `Contact: <sip:${this.username}@${localIP}:${this.actualLocalPort}>`,
            `Allow: INVITE, ACK, BYE, CANCEL, OPTIONS`,
            `User-Agent: NodeJS-UDP-SIP-Client 1.0`,
            `Content-Type: application/sdp`,
            `Content-Length: ${contentLength}`,
            ``,
            sdpContent
        );

        const okResponse = responseLines.join('\r\n');
        
        console.log('生成的200 OK响应:');
        console.log(okResponse);
        
        return okResponse;
    }

    generateTag() {
        return Math.random().toString(36).substr(2, 9);
    }

    rejectIncomingCall(inviteMessage, rinfo) {
        try {
            const lines = inviteMessage.split('\r\n');
            let cseq = '';
            let fromHeader = '';
            let toHeader = '';
            let viaHeader = '';
            let callIdHeader = '';

            for (const line of lines) {
                if (line.startsWith('CSeq:')) {
                    cseq = line;
                } else if (line.startsWith('From:')) {
                    fromHeader = line;
                } else if (line.startsWith('To:')) {
                    toHeader = line;
                } else if (line.startsWith('Via:')) {
                    viaHeader = line;
                } else if (line.startsWith('Call-ID:')) {
                    callIdHeader = line;
                }
            }

            const rejectResponse = [
                `SIP/2.0 486 Busy Here`,
                viaHeader,
                fromHeader,
                toHeader,
                callIdHeader,
                cseq,
                `User-Agent: NodeJS-UDP-SIP-Client 1.0`,
                `Content-Length: 0`,
                ``,
                ``
            ].join('\r\n');

            const msgBuffer = Buffer.from(rejectResponse);
            this.socket.send(msgBuffer, rinfo.port, rinfo.address, (err) => {
                if (err) {
                    console.warn(`Failed to reject incoming call: ${err.message}`);
                } else {
                    console.log('Incoming call rejected (monitoring mode)');
                }
            });

        } catch (error) {
            console.error(`Error rejecting incoming call: ${error.message}`);
        }
    }

    hasIncomingCall() {
        return !!this.incomingCall;
    }

    getIncomingCallInfo() {
        if (this.incomingCall) {
            return {
                fromUser: this.incomingCall.fromUser,
                timestamp: this.incomingCall.timestamp
            };
        }
        return null;
    }

    handleACK(ackMessage, rinfo) {
        try {
            console.log(`处理ACK消息，来自: ${rinfo.address}:${rinfo.port}`);
            
            // ACK确认了200 OK响应，通话正式建立
            if (this.currentCall && !this.currentCall.ackReceived) {
                this.currentCall.ackReceived = true;
                this.currentCall.establishedTime = Date.now();
                console.log('通话已正式建立（收到ACK确认）');
                
                // 如果还没有开始RTP流，现在开始
                if (!this.rtpSendInterval && this.remoteRtpAddress && this.remoteRtpPort) {
                    console.log('ACK收到，开始RTP流传输');
                    this.startRTPStream();
                }
            }
        } catch (error) {
            console.error(`处理ACK失败: ${error.message}`);
        }
    }

    handleBYE(byeMessage, rinfo) {
        try {
            console.log(`处理BYE消息，来自: ${rinfo.address}:${rinfo.port}`);
            console.log(`BYE消息内容:\n${byeMessage}`);
            
            // 发送200 OK响应
            this.sendByeOK(byeMessage, rinfo);
            
            // 立即结束当前通话并清理所有状态
            if (this.currentCall) {
                console.log('远程方挂断通话，立即清理通话状态');
                this.stopRTPStream();
                this.currentCall = null;
                console.log('通话状态已清理，可以接受新的来电');
            } else {
                console.log('收到BYE但没有活跃通话');
            }
            
            // 确保清理来电状态
            if (this.incomingCall) {
                console.log('清理来电状态');
                this.incomingCall = null;
            }
            
        } catch (error) {
            console.error(`处理BYE失败: ${error.message}`);
        }
    }

    rejectCurrentIncomingCall() {
        if (this.incomingCall) {
            this.rejectIncomingCall(this.incomingCall.message, this.incomingCall.rinfo);
            this.incomingCall = null;
            return true;
        }
        return false;
    }

    isRegistered() {
        return this.registered;
    }

    getStats() {
        return { ...this.stats };
    }

    async close() {
        try {
            this.registered = false;
            this.currentCall = null;

            this.stopRTPStream();

            if (this.rtpSocket) {
                this.rtpSocket.close();
                console.log('RTP socket closed');
            }

            if (this.socket) {
                this.socket.close();
                console.log('SIP socket closed');
            }

            console.log('SIP client closed and cleaned up');

        } catch (error) {
            console.error(`Error closing SIP client: ${error.message}`);
        }
    }
}

// Test function
async function testUDPSIPClient() {
    console.log('='.repeat(60));
    console.log('Enhanced UDP SIP Client Test');
    console.log('='.repeat(60));

    const client = new UDPSIPClient({
        username: "62200051906030",
        password: "9ea68973",
        server: "rtcdev1.sinupaas.com",
        port: 10060
    });

    try {
        // Test registration
        console.log('\n📝 Testing SIP Registration...');
        const registered = await client.register();
        console.log(`Registration result: ${registered}`);

        if (registered) {
            // Test call
            console.log('\n📞 Testing SIP Call...');
            const callResult = await client.makeCall("62200051906022", 5);
            console.log(`Call result: ${callResult}`);

            // Show statistics
            console.log('\n📊 Final Statistics:');
            const stats = client.getStats();
            console.log(JSON.stringify(stats, null, 2));
        }

    } catch (error) {
        console.error(`Test failed: ${error.message}`);
    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await client.close();
        console.log('Test completed');
    }
}

// Export for use as module
export { UDPSIPClient, testUDPSIPClient };

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testUDPSIPClient().catch(console.error);
}
