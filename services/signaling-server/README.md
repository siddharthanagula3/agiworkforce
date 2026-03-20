# Signaling Server

WebSocket server for cross-device pairing and real-time streaming.

## Quick Start

```bash
cd services/signaling-server && pnpm dev   # ws://localhost:4000
```

## Architecture

- **WebSocket**: Real-time signaling for desktop-mobile pairing
- **Auth**: JWT verification with 30s timeout
- **Pairing**: 8-character uppercase alphanumeric codes
- **Streaming**: Execution events relayed from desktop to mobile
- **Rate limiting**: Per-connection message limits
