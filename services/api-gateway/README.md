# API Gateway

> Express.js REST API for AGI Workforce

Backend service handling authentication, device sync, and API routing.

## Quick Start

```bash
# From repository root
pnpm --filter @agiworkforce/api-gateway dev
```

Runs on port 3000.

## Technology Stack

| Component | Technology     |
| --------- | -------------- |
| Framework | Express.js 5.2 |
| Auth      | JWT, Supabase  |
| Language  | TypeScript     |

## Project Structure

```
services/api-gateway/
├── src/
│   ├── index.ts            # Server entry point
│   ├── routes/             # API route handlers
│   │   ├── auth.ts         # Authentication
│   │   ├── sync.ts         # Desktop sync
│   │   └── mobile.ts       # Mobile endpoints
│   └── middleware/         # Express middleware
├── package.json
└── tsconfig.json
```

## Configuration

Create `.env` from `.env.example`:

```env
PORT=3000
JWT_SECRET=your-secure-random-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
SIGNALING_HTTP_URL=http://localhost:4000
```

## API Endpoints

| Endpoint        | Method | Description           |
| --------------- | ------ | --------------------- |
| `/health`       | GET    | Health check          |
| `/api/auth/*`   | \*     | Authentication routes |
| `/api/sync/*`   | \*     | Desktop sync          |
| `/api/mobile/*` | \*     | Mobile endpoints      |

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

- [Signaling Server](../signaling-server/README.md)
- [Web App](../../apps/web/README.md)
