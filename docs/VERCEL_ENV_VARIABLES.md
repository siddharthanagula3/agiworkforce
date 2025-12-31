# Vercel Environment Variables Guide

This document lists all LLM API keys you need to add to your Vercel environment variables for the application to work.

---

## 🔑 Required LLM API Keys (Based on Your Models)

### Core Providers (Most Important)

These are the **essential** API keys based on your model rankings and plan tiers:

```bash
# OpenAI - Required for GPT-5 models
OPENAI_API_KEY=sk-proj-...

# Anthropic - Required for Claude 4.5 models
ANTHROPIC_API_KEY=sk-ant-...

# Google - Required for Gemini 3 models (Best value!)
GOOGLE_API_KEY=AIza...
```

**Why These Are Required:**

- **OpenAI**: GPT-5 Nano, GPT-5.2, GPT-5.2 Pro, GPT-5.2 Codex (used across all plans)
- **Anthropic**: Claude Haiku 4.5, Claude Sonnet 4.5, Claude Opus 4.5 (best coding models)
- **Google**: Gemini 3 Flash (best value: 3,307 Elo/$), Gemini 3 Pro (best chat: 1500 Elo)

---

## 🎯 Configured Additional Keys

These are currently configured and enable more model options:

```bash
# DeepSeek - Best budget coding option ✅
DEEPSEEK_API_KEY=sk-...

# xAI - Grok models ✅
XAI_API_KEY=xai-...

# Qwen - Budget reasoning model (via MuleRouter) ✅
QWEN_API_KEY=...
QWEN_BASE_URL=https://api.mulerouter.ai

# Moonshot - Reasoning model (Chinese support) ✅
MOONSHOT_API_KEY=...
```

**Why These Are Configured:**

- **DeepSeek**: DeepSeek Chat/V3 ($0.42/1M) - Best coding value for budget plans
- **xAI**: Grok 3 Mini, Grok 4.1 - Additional budget and premium options
- **Qwen**: Qwen3-Max ($2.50/1M) - Budget reasoning via MuleRouter
- **Moonshot**: Kimi K2 Thinking ($1.50/1M) - Reasoning model with Chinese support

---

## 🏗️ Complete Vercel Environment Variables

### Required for Core Functionality

```bash
# ============================================
# LLM API KEYS (Required)
# ============================================
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# ============================================
# STRIPE (Payment Processing)
# ============================================
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# ============================================
# SUPABASE (Database & Auth)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ============================================
# WEB SEARCH (Optional but recommended)
# ============================================
BRAVE_API_KEY=BSA...
```

### Configured Additional Providers

```bash
# ============================================
# ADDITIONAL LLM PROVIDERS (Currently Configured)
# ============================================
DEEPSEEK_API_KEY=sk-...
XAI_API_KEY=xai-...
MOONSHOT_API_KEY=...
QWEN_API_KEY=...  # ✅ Configured via MuleRouter
QWEN_BASE_URL=https://api.mulerouter.ai  # ✅ MuleRouter endpoint
```

### Optional OAuth (For Calendar/Cloud Features)

```bash
# ============================================
# OAUTH (Optional - for Calendar/Cloud features)
# ============================================
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
MICROSOFT_CLIENT_ID=your-id
MICROSOFT_CLIENT_SECRET=your-secret
```

---

## 📊 Current Configuration by Plan Tier

### Your Current Setup ✅

**Core Providers (All Plans):**

- `OPENAI_API_KEY` ✅ - GPT-5 Nano, GPT-5.2, GPT-5.2 Pro, GPT-5.2 Codex
- `GOOGLE_API_KEY` ✅ - Gemini 3 Flash (best value), Gemini 3 Pro (best chat)
- `ANTHROPIC_API_KEY` ✅ - Claude Haiku 4.5, Claude Sonnet 4.5, Claude Opus 4.5

**Additional Providers (Configured):**

- `DEEPSEEK_API_KEY` ✅ - DeepSeek Chat/V3 (best coding value)
- `XAI_API_KEY` ✅ - Grok 3 Mini, Grok 4.1
- `MOONSHOT_API_KEY` ✅ - Kimi K2 Thinking (reasoning)
- `QWEN_API_KEY` ✅ + `QWEN_BASE_URL` ✅ - Qwen3-Max (via MuleRouter)

**Available Models:**

- ✅ All Hobby Plan models (Speed tier)
- ✅ All Pro Plan models (Balanced tier)
- ✅ All Max Plan models (Reasoning tier)
- ✅ All Enterprise Plan models (Premium tier)

---

## 🔐 How to Get API Keys

### OpenAI

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up/Login
3. Navigate to API Keys
4. Create new secret key
5. Copy the key (starts with `sk-proj-`)

### Anthropic

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up/Login
3. Navigate to API Keys
4. Create new key
5. Copy the key (starts with `sk-ant-`)

### Google (Gemini)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with Google account
3. Click "Get API Key"
4. Create API key in Google Cloud Console
5. Copy the key (starts with `AIza`)

### DeepSeek

1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Sign up/Login
3. Navigate to API Keys
4. Create new key
5. Copy the key (starts with `sk-`)

### xAI (Grok)

1. Go to [console.x.ai](https://console.x.ai)
2. Sign up/Login
3. Navigate to API Keys
4. Create new key
5. Copy the key (starts with `xai-`)

### Qwen (via MuleRouter) ✅

**Currently configured via MuleRouter:**
If you're using MuleRouter as a proxy for Qwen, you have two options:

**Option 1: Direct MuleRouter (Recommended)**

- `QWEN_API_KEY=your-mulerouter-api-key` (Get from [MuleRouter Console](https://www.mulerouter.ai) → API Keys)
- `QWEN_BASE_URL=https://api.mulerouter.ai` (MuleRouter base URL)

**Option 2: Route through your own domain**
If you want to proxy through your own backend (e.g., `https://api.agiworkforce.com/api/llm/qwen`), you'll need to:

1. Create a proxy endpoint on your backend that forwards to `https://api.mulerouter.ai/chat/completions`
2. Set `QWEN_BASE_URL=https://api.agiworkforce.com/api/llm/qwen` (your proxy endpoint)
3. Keep `QWEN_API_KEY=your-mulerouter-api-key` (your proxy will forward this to MuleRouter)

The provider will automatically detect a custom base URL and use OpenAI-compatible format (`/chat/completions`). See [MuleRouter API Reference](https://www.mulerouter.ai/docs/api-reference/quickstart) for details.

### Moonshot ✅

1. Go to [platform.moonshot.cn](https://platform.moonshot.cn)
2. Sign up/Login
3. Navigate to API Keys
4. Create new key

---

## 🚀 How to Add to Vercel

### Method 1: Vercel Dashboard

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Click **Add New**
4. Enter the variable name (e.g., `OPENAI_API_KEY`)
5. Enter the value
6. Select environments (Production, Preview, Development)
7. Click **Save**
8. Repeat for each variable

### Method 2: Vercel CLI

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Link your project
vercel link

# Add environment variables
vercel env add OPENAI_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add GOOGLE_API_KEY
vercel env add DEEPSEEK_API_KEY
vercel env add XAI_API_KEY

# After adding, redeploy
vercel --prod
```

### Method 3: Vercel Dashboard (Bulk Import)

1. Go to **Settings** → **Environment Variables**
2. Use the bulk import feature (if available)
3. Paste all variables in format:
   ```
   OPENAI_API_KEY=sk-proj-...
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_API_KEY=AIza...
   ```

---

## ✅ Verification Checklist

After adding environment variables, verify they're working:

### 1. Check Vercel Dashboard

- Go to **Settings** → **Environment Variables**
- Verify all keys are listed
- Check they're enabled for correct environments

### 2. Test API Endpoint

```bash
# Test if API keys are accessible
curl https://your-app.vercel.app/api/health
```

### 3. Check Application Logs

- Go to **Deployments** → **Functions** → **View Logs**
- Look for any API key errors
- Verify providers are initializing correctly

### 4. Test LLM Request

- Make a test request through the app
- Verify it routes to correct provider
- Check token usage is being tracked

---

## 🔒 Security Best Practices

### ✅ DO:

- ✅ Use **Production** keys only in Production environment
- ✅ Use **Test/Development** keys in Preview/Development
- ✅ Rotate keys regularly (every 90 days)
- ✅ Use separate keys for different environments
- ✅ Monitor API usage in provider dashboards
- ✅ Set usage limits in provider dashboards

### ❌ DON'T:

- ❌ Commit API keys to Git
- ❌ Share keys in chat/email
- ❌ Use same key across multiple projects
- ❌ Leave keys in code comments
- ❌ Use production keys in development

---

## 💰 Cost Management

### Set Usage Limits

**OpenAI:**

- Go to [platform.openai.com/usage](https://platform.openai.com/usage)
- Set hard limits per model
- Enable usage alerts

**Anthropic:**

- Go to [console.anthropic.com/settings/limits](https://console.anthropic.com/settings/limits)
- Set monthly spending limits
- Configure alerts

**Google:**

- Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
- Set quota limits
- Enable billing alerts

### Monitor Usage

Check provider dashboards regularly:

- **OpenAI**: [platform.openai.com/usage](https://platform.openai.com/usage)
- **Anthropic**: [console.anthropic.com/usage](https://console.anthropic.com/usage)
- **Google**: [console.cloud.google.com/billing](https://console.cloud.google.com/billing)

---

## 🎯 Quick Start (Minimum Setup)

For the fastest setup with best value models:

```bash
# Add these 3 keys to Vercel (minimum required)
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...

# Optional but recommended
DEEPSEEK_API_KEY=sk-...
```

This gives you access to:

- ✅ Gemini 3 Flash (best value: 3,307 Elo/$)
- ✅ GPT-5 Nano (fast responses)
- ✅ Claude Haiku 4.5 (quality/price)
- ✅ DeepSeek Chat/V3 (best coding value)
- ✅ Claude Sonnet 4.5 (best coding: 77.2% SWE-bench)
- ✅ Gemini 3 Pro (best chat: 1500 Elo)
- ✅ GPT-5.2 (fast inference)

---

## 📝 Notes

1. **ManagedCloud**: If you're using ManagedCloud (Pro/Max users), the backend handles API keys automatically. You still need these keys in Vercel for the backend to route requests.

2. **Local Models**: Ollama models don't require API keys - they run locally.

3. **Key Rotation**: Rotate keys every 90 days for security.

4. **Environment Separation**: Use different keys for Production vs Development.

5. **Cost Monitoring**: Set up billing alerts in each provider dashboard.

---

## 🆘 Troubleshooting

### "No API key found for provider"

- **Solution**: Check the environment variable name matches exactly (case-sensitive)
- **Solution**: Verify the key is added to the correct environment (Production/Preview/Development)
- **Solution**: Redeploy after adding new environment variables

### "Provider not available"

- **Solution**: Check if the API key is valid
- **Solution**: Verify the key has proper permissions
- **Solution**: Check provider status page for outages

### "Rate limit exceeded"

- **Solution**: Check usage limits in provider dashboard
- **Solution**: Upgrade API tier if needed
- **Solution**: Implement rate limiting in your app

---

_Last Updated: December 30, 2025_
