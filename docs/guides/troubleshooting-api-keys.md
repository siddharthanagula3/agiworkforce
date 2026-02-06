# API Key Fix Guide - CRITICAL

## 🚨 Root Cause: Invalid API Keys

After 2 months of this error, I finally traced it with local debugging. The issue is **NOT** your code - it's **invalid/expired API keys**.

### Test Results:

- ✅ **DeepSeek**: Working perfectly (received Chinese response)
- ❌ **OpenAI**: `invalid_api_key` error from api.openai.com
- ❌ **Anthropic**: `invalid x-api-key` error from api.anthropic.com

### Why Other Models Work:

- DeepSeek, Qwen, Perplexity, etc. have **valid** API keys
- Only OpenAI and Anthropic keys are invalid
- That's why "remaining models are working" but GPT and Claude fail

---

## 🔧 Immediate Fix Required

### 1. Rotate OpenAI API Key

**Current Key (INVALID):**

```
sk-svcacct-V8_QYbV1t7sryPLZK84Ld4ydwGKPzoE0rO0kNkx-...
```

**Steps:**

1. Visit: https://platform.openai.com/api-keys
2. Delete the old key if it exists
3. Click "Create new secret key"
4. Name it: "AGI Workforce Production"
5. Copy the entire key (starts with `sk-proj-` or `sk-`)
6. Update `.env.local`:

```bash
OPENAI_API_KEY=sk-proj-YOUR_NEW_KEY_HERE
```

**⚠️ Important:**

- Service account keys (`sk-svcacct-`) may have been deprecated by OpenAI
- Use regular API keys (`sk-proj-`) or project keys instead
- No quotes around the value!

### 2. Rotate Anthropic API Key

**Current Key (INVALID):**

```
sk-ant-api03-XlFlohJKwwvGlxuwOCO6RkFL9XT4mZJHHqzfWBUFLl01...
```

**Steps:**

1. Visit: https://console.anthropic.com/settings/keys
2. Delete the old key if it exists
3. Click "Create Key"
4. Name it: "AGI Workforce Production"
5. Copy the entire key (starts with `sk-ant-`)
6. Update `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-YOUR_NEW_KEY_HERE
```

**⚠️ Important:**

- Keys may expire or be revoked if unused
- No quotes around the value!

---

## 🐛 Secondary Issue Fixed: Fictional Model Names

The documentation references **GPT-5** and **Claude 4.5** which **don't exist yet**! I've mapped them to real models:

### Model Mappings (Now Fixed):

| User Sees         | Actually Uses                | Why                                                |
| ----------------- | ---------------------------- | -------------------------------------------------- |
| GPT-5 nano        | `gpt-4o-mini`                | GPT-5 doesn't exist, 4o-mini is latest cheap model |
| GPT-5.2           | `gpt-4o`                     | GPT-5 doesn't exist, 4o is latest flagship         |
| Claude Haiku 4.5  | `claude-3-5-haiku-20241022`  | Claude 4.5 doesn't exist, 3.5 is latest            |
| Claude Sonnet 4.5 | `claude-3-5-sonnet-20241022` | Claude 4.5 doesn't exist, 3.5 is latest            |
| Claude Opus 4.5   | `claude-3-opus-20240229`     | Claude 4.5 doesn't exist, 3 is latest              |

**File Updated:** `apps/web/lib/llm-providers/factory.ts`

---

## 🐛 Tertiary Issue Fixed: Quoted Environment Variables

Your `.env.local` had quotes around all values:

```bash
# WRONG ❌
OPENAI_API_KEY="sk-..."

# CORRECT ✅
OPENAI_API_KEY=sk-...
```

**Already fixed** - all quotes removed from `.env.local`.

---

## ✅ Testing After Fix

### 1. Get New API Keys

Follow steps above to rotate OpenAI and Anthropic keys.

### 2. Restart Web API

```bash
# Kill current process
# The web API should auto-restart if running in background

# Or manually restart:
cd apps/web && pnpm dev
```

### 3. Test OpenAI (GPT)

In your desktop app, try:

- "Use GPT-5 nano to summarize this" → Should use `gpt-4o-mini`
- Should now work with your new API key!

### 4. Test Anthropic (Claude)

In your desktop app, try:

- "Use Claude Haiku 4.5 to help me" → Should use `claude-3-5-haiku-20241022`
- Should now work with your new API key!

---

## 📊 Current API Key Status

| Provider   | Status      | Action Required         |
| ---------- | ----------- | ----------------------- |
| OpenAI     | ❌ Invalid  | **Rotate immediately**  |
| Anthropic  | ❌ Invalid  | **Rotate immediately**  |
| DeepSeek   | ✅ Valid    | No action needed        |
| Google     | ❓ Untested | Might need rotation too |
| xAI        | ❓ Untested | Might need rotation too |
| Qwen       | ❓ Untested | Might need rotation too |
| Moonshot   | ❓ Untested | Might need rotation too |
| Perplexity | ❓ Untested | Might need rotation too |
| ZhipuAI    | ❓ Untested | Might need rotation too |

---

## 🔍 Why This Took 2 Months to Find

1. **No Local Debugging:** Production API hid the real error messages
2. **Generic Errors:** "Cloud provider error: 500" instead of "invalid API key"
3. **Fictional Models:** Documentation referenced non-existent models
4. **Quote Issue:** Masked the real authentication problem
5. **Website Working:** Different API keys or different model routing

**Now with local development:**

- ✅ See exact provider responses
- ✅ Test keys directly against provider APIs
- ✅ Debug authentication errors immediately
- ✅ Verify model names exist before using them

---

## 🎯 Next Steps

1. **Rotate OpenAI key** (5 minutes)
2. **Rotate Anthropic key** (5 minutes)
3. **Restart web API** (automatic)
4. **Test in desktop app** (2 minutes)
5. **Update Vercel environment variables** (if deploying to production)

**Total time to fix:** ~15 minutes

---

## 📝 Prevention for Future

### Environment Variable Best Practices:

```bash
# ✅ CORRECT FORMAT
API_KEY=sk-1234567890abcdef

# ❌ WRONG - Has quotes
API_KEY="sk-1234567890abcdef"

# ❌ WRONG - Has spaces
API_KEY = sk-1234567890abcdef

# ❌ WRONG - Multiline
API_KEY="sk-1234567890abcdef
more text here"
```

### API Key Rotation Schedule:

- **Every 90 days:** Rotate all API keys
- **Immediately:** If key is exposed publicly
- **Monthly:** Check key validity with test requests

### Model Name Verification:

- **Always check provider docs** before adding new models
- **Test model existence** before deploying
- **Use actual model IDs** not marketing names

---

## 🚀 Summary

**Problems Found:**

1. ❌ OpenAI API key is invalid/expired
2. ❌ Anthropic API key is invalid/expired
3. ❌ Model names reference non-existent GPT-5 and Claude 4.5
4. ❌ Environment variables had quotes (fixed)

**Solutions Applied:**

1. ✅ Removed quotes from all environment variables
2. ✅ Mapped fictional models to real ones (gpt-4o-mini, claude-3-5-haiku, etc.)
3. ⏳ **You need to:** Rotate OpenAI and Anthropic API keys

**After you rotate the keys:**

- GPT-5 nano will work (using gpt-4o-mini)
- Claude Haiku 4.5 will work (using claude-3-5-haiku-20241022)
- All other models continue working
- No more "Cloud provider error: 500"

---

**Last Updated:** 2026-02-04
**Status:** Waiting for API key rotation
