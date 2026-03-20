# API Gateway

Express server for mobile app + external integrations.

## Quick Start

```bash
cd services/api-gateway && pnpm dev   # http://localhost:3001
```

## Architecture

- **Auth**: JWT verification (HS256, issuer/audience validation)
- **Rate limiting**: Upstash Redis
- **Routes**: credits, models, cloud-chat, pair
- **Middleware**: auth, planGate, rateLimit, CORS

## Key Routes

- `POST /api/chat` — Cloud LLM proxy for mobile
- `GET /api/models` — Available model catalog
- `POST /api/pair` — QR pairing with signaling server
- `GET /api/credits/balance` — Credit balance check
