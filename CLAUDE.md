# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a complete SIP (Session Initiation Protocol) call server implementation using Node.js and the Model Context Protocol (MCP). The project implements a WebRTC-based VoIP calling system that can both make outbound calls and receive/answer incoming calls through SIP protocol.

## Installation

Install dependencies using npm:

```bash
npm install
```

Or manually install required packages:
```bash
npm install @modelcontextprotocol/server-node sip.js node-alsa speaker microphone
```

## Architecture

The codebase consists of a single main file `sipcall.js` that implements:

- **SipCallServer Class**: Main server class that handles both outbound and inbound SIP call functionality
- **MCP Server Integration**: Complete Model Context Protocol server with defined tools for SIP operations
- **SIP Client Management**: Manages SIP user agent connections, authentication, and registration
- **Call Handling**: Implements call initiation, answering, management, and audio stream processing
- **Incoming Call Support**: Handles incoming SIP invitations and call state management

### Available MCP Tools

The server exposes the following tools through the MCP protocol:

1. **sip_configure**: Configure SIP client connection parameters (server, username, password, domain)
2. **sip_call**: Make outbound calls to specified phone numbers
3. **sip_answer**: Answer incoming SIP calls
4. **sip_hangup**: Terminate active calls or reject incoming calls
5. **sip_status**: Get current connection and call status information

### Key Components

- **Tool Registration**: Complete MCP tool definitions with input schemas
- **SIP Authentication**: WebSocket Secure (WSS) connection to SIP server with user registration
- **Bidirectional Call Management**: Support for both outgoing and incoming calls
- **Call State Handling**: Proper state management for call lifecycle (initial, established, terminated)
- **Audio Processing**: WebRTC peer connection for bidirectional audio streams
- **Error Handling**: Comprehensive error handling with Chinese language support

## Key Methods

- `handleConfigureRequest(args)`: Configure and initialize SIP client connection
- `initializeSipClient(config)`: Initialize SIP user agent with registration
- `handleCallRequest(args)`: Initiate outbound calls
- `handleIncomingCall(invitation)`: Process incoming SIP invitations
- `handleAnswerRequest(args)`: Accept incoming calls
- `handleHangupRequest(args)`: Terminate calls or reject invitations
- `handleStatusRequest(args)`: Get current system status
- `setupAudioStreams()`: Configure WebRTC audio stream handling

## Development Notes

- The server uses WebSocket Secure (WSS) on port 5061 for SIP connections
- Audio is constrained to audio-only (no video) calls
- Single call limitation - prevents multiple concurrent calls
- Full Chinese language support in console messages and error handling
- ICE gathering timeout set to 5 seconds for WebRTC connections
- Proper call state management for incoming and outgoing calls
- Automatic incoming call detection and handling

## Running the Application

Start the MCP server:
```bash
npm start
```

Or run with debugging:
```bash
npm run dev
```

The server will start and listen for MCP tool requests for SIP operations. The server must be configured with SIP credentials before making or receiving calls.

## Usage Example

1. First configure the SIP client with the `sip_configure` tool
2. Use `sip_call` to make outbound calls
3. Incoming calls are automatically detected and can be answered with `sip_answer`
4. Use `sip_hangup` to terminate calls
5. Check status anytime with `sip_status`