# Configuration Guide

Configure AGI Workforce for your environment.

## Environment Variables

### Desktop App (`apps/desktop/.env.local`)

```env
# Development Server
VITE_DEV_PORT=5173

# LLM API Keys (add the ones you want to use)
VITE_OPENAI_API_KEY=sk-...
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_GOOGLE_API_KEY=AIza...
VITE_DEEPSEEK_API_KEY=sk-...
VITE_XAI_API_KEY=xai-...

# Supabase (for cloud sync - optional)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Feature Flags
VITE_ENABLE_OLLAMA=true
VITE_ENABLE_TELEMETRY=false

# Error Tracking (optional)
VITE_SENTRY_DSN=https://...
VITE_SENTRY_ENVIRONMENT=development

# Billing (if using managed LLM proxy)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# App Info
VITE_APP_VERSION=1.0.6
```

### Web App (`apps/web/.env.local`)

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe (required for billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Stripe Price IDs
STRIPE_PRICE_HOBBY_MONTHLY=price_...
STRIPE_PRICE_HOBBY_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_MAX_MONTHLY=price_...
STRIPE_PRICE_MAX_YEARLY=price_...

# LLM Providers (for managed proxy)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Rate Limiting (optional - uses in-memory fallback)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### API Gateway (`services/api-gateway/.env`)

```env
PORT=3000
JWT_SECRET=your-secure-random-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
SIGNALING_HTTP_URL=http://localhost:4000
```

### Signaling Server (`services/signaling-server/.env`)

```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SIGNALING_PAIRING_TTL=300
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
```

## LLM Provider Setup

### OpenAI

1. Get API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Add to `VITE_OPENAI_API_KEY` in `.env.local`
3. Models available: GPT-4o, GPT-4o-mini, GPT-4-turbo, o1, o1-mini

### Anthropic

1. Get API key from [console.anthropic.com](https://console.anthropic.com/)
2. Add to `VITE_ANTHROPIC_API_KEY` in `.env.local`
3. Models available: Claude 4 Opus, Claude 3.5/4 Sonnet, Claude 3.5 Haiku

### Google (Gemini)

1. Get API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Add to `VITE_GOOGLE_API_KEY` in `.env.local`
3. Models available: Gemini 2.5 Pro, Gemini 2.5 Flash

### Ollama (Local Models)

1. Install Ollama: [ollama.com](https://ollama.com/)
2. Pull a model: `ollama pull llama3.3`
3. Ensure `VITE_ENABLE_OLLAMA=true` in `.env.local`
4. Models available: Llama 3.3, Mistral, CodeLlama, Phi-3, Qwen 2.5

## Application Settings

Settings are managed in-app through the Settings panel. Key configurations:

### Chat Settings

| Setting          | Description               | Default     |
| ---------------- | ------------------------- | ----------- |
| Default Model    | LLM model for new chats   | Auto-select |
| Temperature      | Response creativity (0-1) | 0.7         |
| Max Tokens       | Maximum response length   | 4096        |
| Stream Responses | Enable streaming          | true        |

### Agent Settings

| Setting               | Description               | Default |
| --------------------- | ------------------------- | ------- |
| Always Use Agent Mode | Auto-enable for all chats | false   |
| Max Iterations        | Goal execution limit      | 1000    |
| Timeout               | Goal timeout (seconds)    | 300     |

### UI Settings

| Setting          | Description         | Default |
| ---------------- | ------------------- | ------- |
| Theme            | Light/Dark/System   | System  |
| Dock Position    | Dock placement      | Left    |
| Show Token Count | Display token usage | true    |

## Database Configuration

### Local SQLite (Desktop)

Location: `~/.config/agiworkforce/agiworkforce.db`

Configured automatically with optimized settings:

- WAL mode for better concurrency
- 64MB cache
- Foreign keys enabled

### Supabase (Web/Cloud)

1. Create project at [supabase.com](https://supabase.com/)
2. Run migrations from `apps/web/supabase/migrations/`
3. Enable Row Level Security on all tables
4. Add connection details to environment files

## MCP Server Configuration

MCP servers extend AI capabilities with external tools. Configuration is automatic based on user intent, but you can manually configure servers in the app settings.

### Pre-configured Servers

- **Supabase**: Database operations
- **GitHub**: Repository management
- **Filesystem**: Local file access
- **Context7**: Documentation lookup
- **Vercel**: Deployment management

### Adding Custom Servers

1. Go to Settings > MCP Servers
2. Click "Add Server"
3. Enter server command and arguments
4. Configure credentials if required

## Security Configuration

### API Key Storage

API keys are stored securely:

- **Desktop**: OS keyring (macOS Keychain, Windows Credential Manager)
- **Web**: Environment variables (never committed)

### Content Security Policy

The desktop app enforces CSP to allow only trusted origins:

- LLM provider APIs (OpenAI, Anthropic, Google)
- Supabase
- Local development servers

### Rate Limiting

Web API endpoints have per-user rate limits:

- Authentication: 5/15min
- Checkout: 5/min
- LLM proxy: Based on plan tier

## Next Steps

- [Quick Start](quick-start.md) - Start using the app
- [Features Overview](../features/README.md) - Explore features
- [Development Setup](../development/setup.md) - Full dev environment
