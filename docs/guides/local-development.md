# Local Development Setup

## Current Configuration ✅

Your application is now configured to use **localhost** for all API calls, allowing you to use your local API keys directly.

### Architecture

```
Desktop App (localhost:5173)
         ↓
Local Web API (localhost:3000)
         ↓
LLM Providers (using your API keys)
```

**Instead of:**

```
Desktop App → Production API (api.agiworkforce.com) → LLM Providers
```

## Running Services

### 1. Web API Server (Port 3000)

**Status:** ✅ Running
**Command:** `cd apps/web && pnpm dev`
**URL:** http://localhost:3000
**Purpose:** Hosts the LLM proxy API with your API keys

**API Endpoints:**

- `POST /api/llm/v1/chat/completions` - LLM chat completions (OpenAI-compatible)
- `POST /api/stripe-webhook` - Stripe webhook handler
- `POST /api/checkout/create-session` - Checkout session creation

### 2. Desktop App (Port 5173)

**Status:** ✅ Running
**Command:** `pnpm dev:desktop`
**URL:** http://localhost:5173
**Purpose:** Desktop application UI (React + Vite)

### 3. Rust Backend

**Status:** ✅ Running
**Process:** Embedded in desktop app
**Purpose:** Tauri backend, MCP integration, AGI engine

## Environment Configuration

### Desktop App (apps/desktop/.env.local)

```bash
# API Endpoint - Local Development
AGI_API_URL=http://localhost:3000
VITE_API_BASE_URL=http://localhost:3000
```

### Web App (apps/web/.env.local)

Contains all LLM provider API keys:

- ✅ `OPENAI_API_KEY` - GPT models
- ✅ `ANTHROPIC_API_KEY` - Claude models
- ✅ `GOOGLE_API_KEY` - Gemini models
- ✅ `XAI_API_KEY` - Grok models
- ✅ `DEEPSEEK_API_KEY` - DeepSeek models
- ✅ `QWEN_API_KEY` - Qwen models
- ✅ `MOONSHOT_API_KEY` - Kimi models
- ✅ `PERPLEXITY_API_KEY` - Perplexity models
- ✅ `ZHIPU_API_KEY` - GLM models

## CORS Configuration ✅

The web API automatically allows localhost origins in development mode:

- ✅ `http://localhost:5173` (Desktop app)
- ✅ `http://localhost:3000` (Web API)
- ✅ `http://127.0.0.1:*` (Localhost IP)
- ✅ `tauri://localhost` (Tauri scheme)

**File:** `apps/web/lib/cors.ts`

## Starting Development

### Quick Start (All Services)

```bash
# Terminal 1: Start Web API
cd apps/web && pnpm dev

# Terminal 2: Start Desktop App
pnpm dev:desktop
```

### Individual Services

```bash
# Start Web API only
cd apps/web && pnpm dev

# Start Desktop App only
pnpm dev:desktop

# Start API Gateway (optional)
pnpm --filter @agiworkforce/api-gateway dev

# Start WebSocket Server (optional)
pnpm --filter @agiworkforce/signaling-server dev
```

## Testing LLM Integration

### Test via Desktop App

1. Open desktop app (should auto-open at http://localhost:5173)
2. Start a chat conversation
3. Send a message
4. Watch the terminal for API logs

### Test via API Directly

```bash
# Get your Supabase JWT token first (from desktop app or Supabase)
export TOKEN="your_supabase_jwt_token"

# Test OpenAI (GPT)
curl -X POST http://localhost:3000/api/llm/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'

# Test Anthropic (Claude)
curl -X POST http://localhost:3000/api/llm/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'

# Test Google (Gemini)
curl -X POST http://localhost:3000/api/llm/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "gemini-3-flash",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

## Troubleshooting

### Issue: "Cloud provider error: 500"

**Cause:** Web API not running or API keys missing
**Solution:**

1. Check if web API is running: `curl http://localhost:3000/api/health`
2. Verify API keys exist in `apps/web/.env.local`
3. Check web API logs for specific errors

### Issue: Desktop app can't connect to API

**Cause:** Desktop app pointing to wrong URL
**Solution:**

1. Verify `apps/desktop/.env.local` has `AGI_API_URL=http://localhost:3000`
2. Restart desktop app to pick up changes
3. Check browser console for CORS errors

### Issue: CORS errors in browser console

**Cause:** CORS not allowing localhost
**Solution:**

1. Verify `NODE_ENV=development` in web API
2. Check `apps/web/lib/cors.ts` includes localhost origins
3. Restart web API server

### Issue: API key not working

**Cause:** Invalid or expired API key
**Solution:**

1. Test the API key directly with provider's API
2. Check key format (should start with correct prefix)
3. Verify key has sufficient quota/credits
4. Rotate the key if necessary

### Issue: Streaming not working

**Cause:** Streaming response timeout or error
**Solution:**

1. Check web API logs for errors
2. Try non-streaming request first (`"stream": false`)
3. Verify provider API is accessible
4. Check network connectivity

## Monitoring API Calls

### Web API Logs

Watch the terminal where `cd apps/web && pnpm dev` is running:

- ✅ Request received
- ✅ Provider selected (openai, anthropic, google, etc.)
- ✅ Model used
- ✅ Token usage
- ✅ Cost calculation
- ❌ Error messages with details

### Provider-Specific Logs

```bash
# Check logs for specific provider
# Logs show provider, model, tokens, and errors
# Example output:
# [LLM] Sending request to openai with model gpt-4o
# [LLM] Request successful: 150 tokens (75 prompt + 75 completion)
# [LLM] Cost: 0.5 cents
```

## Switching Back to Production

To use the production API again:

```bash
# Edit apps/desktop/.env.local
AGI_API_URL=https://api.agiworkforce.com
VITE_API_BASE_URL=https://api.agiworkforce.com

# Restart desktop app
# Web API server can be stopped (Ctrl+C)
```

## Port Reference

| Service            | Port | URL                   | Purpose                |
| ------------------ | ---- | --------------------- | ---------------------- |
| Desktop App (Vite) | 5173 | http://localhost:5173 | React UI               |
| Web API (Next.js)  | 3000 | http://localhost:3000 | LLM proxy, billing API |
| API Gateway        | 3000 | http://localhost:3000 | Express REST API       |
| WebSocket Server   | 4000 | ws://localhost:4000   | Real-time sync         |

## Environment Files

| File                      | Purpose                        | Secured |
| ------------------------- | ------------------------------ | ------- |
| `apps/web/.env.local`     | LLM API keys, Stripe, Supabase | ✅ 600  |
| `apps/desktop/.env.local` | Desktop app configuration      | ✅ 600  |
| `.env.local`              | Root environment config        | ✅ 600  |
| `.env.production`         | Production environment config  | ✅ 600  |

## API Key Usage by Provider

### OpenAI (GPT Models)

- **API Key:** `OPENAI_API_KEY`
- **Models:** gpt-5.2, gpt-5-pro, gpt-5-nano, o3, gpt-4o, gpt-4o-mini
- **Endpoint:** `https://api.openai.com/v1/chat/completions`
- **Test:** Send request with `"model": "gpt-4o"`

### Anthropic (Claude Models)

- **API Key:** `ANTHROPIC_API_KEY`
- **Models:** claude-opus-4.5, claude-sonnet-4.5, claude-haiku-4.5
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Test:** Send request with `"model": "claude-sonnet-4.5"`

### Google (Gemini Models)

- **API Key:** `GOOGLE_API_KEY`
- **Models:** gemini-3-ultra, gemini-3-pro, gemini-3-flash
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/`
- **Test:** Send request with `"model": "gemini-3-flash"`

### xAI (Grok Models)

- **API Key:** `XAI_API_KEY`
- **Models:** grok-4.1, grok-4.1-fast-reasoning, grok-4.1-fast, grok-4.1-mini
- **Endpoint:** `https://api.x.ai/v1/chat/completions`
- **Test:** Send request with `"model": "grok-4.1"`

### DeepSeek

- **API Key:** `DEEPSEEK_API_KEY`
- **Models:** deepseek-v3.2, deepseek-r1
- **Endpoint:** `https://api.deepseek.com/v1/chat/completions`
- **Test:** Send request with `"model": "deepseek-chat"`

### Qwen (via MuleRouter)

- **API Key:** `QWEN_API_KEY`
- **Base URL:** `https://api.mulerouter.ai`
- **Models:** qwen3-max, qwen3-coder-plus, qwen-flash
- **Test:** Send request with `"model": "qwen-flash"`

### Moonshot (Kimi)

- **API Key:** `MOONSHOT_API_KEY`
- **Models:** kimi-k2.5, kimi-k2.5-thinking, kimi-k2.5-turbo
- **Endpoint:** `https://api.moonshot.cn/v1/chat/completions`
- **Test:** Send request with `"model": "kimi-k2.5"`

### Perplexity

- **API Key:** `PERPLEXITY_API_KEY`
- **Models:** sonar, sonar-pro, sonar-reasoning, sonar-deep-research
- **Endpoint:** `https://api.perplexity.ai/chat/completions`
- **Test:** Send request with `"model": "sonar"`

### ZhipuAI (GLM)

- **API Key:** `ZHIPU_API_KEY`
- **Models:** glm-4.7, glm-4.6v, glm-4.6v-flash
- **Endpoint:** `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- **Test:** Send request with `"model": "glm-4.7"`

## Development Checklist

Before starting development:

- [x] Web API running on port 3000
- [x] Desktop app running on port 5173
- [x] All API keys configured in `apps/web/.env.local`
- [x] Desktop app pointing to `http://localhost:3000`
- [x] CORS allowing localhost origins
- [x] File permissions secured (600)

## Success! ✅

Your local development environment is now configured to use your API keys directly:

1. ✅ **Web API** running on http://localhost:3000 with all 9 LLM provider API keys
2. ✅ **Desktop App** running on http://localhost:5173 and pointing to localhost
3. ✅ **CORS** configured to allow localhost connections
4. ✅ **Environment files** secured with proper permissions

You should no longer see the "Cloud provider error: 500" when using LLM features in the desktop app!

---

**Last Updated:** 2026-02-04
**Next Review:** Check API key quotas and rotate if needed
