# Signaling Server

> WebSocket server for real-time device sync and pairing

Handles device pairing via 6-digit codes and real-time state synchronization.

## Quick Start

```bash
# From repository root
pnpm --filter @agiworkforce/signaling-server dev
```

Runs on port 4000.

## Technology Stack

| Component | Technology     |
| --------- | -------------- |
| Framework | ws (WebSocket) |
| Auth      | Supabase       |
| Language  | TypeScript     |

## Project Structure

```
services/signaling-server/
├── src/
│   ├── index.ts            # WebSocket server
│   ├── handlers/           # Message handlers
│   └── pairing.ts          # Pairing protocol
├── package.json
└── tsconfig.json
```

## Configuration

Create `.env` from `.env.example`:

```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SIGNALING_PAIRING_TTL=300
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
```

## Protocol

### Device Pairing

1. Desktop generates 6-digit code
2. Mobile/web enters code
3. Devices connected via WebSocket
4. Code expires after 5 minutes (TTL)

### Message Types

| Type           | Direction       | Description      |
| -------------- | --------------- | ---------------- |
| `pair-device`  | Client → Server | Start pairing    |
| `pair-success` | Server → Client | Pairing complete |
| `sync-state`   | Client ↔ Server | State sync       |

## Commands

```bash
# Development
pnpm dev

# Build
pnpm build

# Start production
pnpm start
```

## Related

- [API Gateway](../api-gateway/README.md)
- [Desktop App](../../apps/desktop/README.md)
