# Pricing Page & Features Audit Report

**Date:** 2026-02-04
**Status:** 🚨 **CRITICAL ISSUES FOUND**

---

## 🔴 Issue 1: Qwen Models - 404 Errors

**Problem:** Qwen integration is broken. Getting 404 errors when using Qwen models through MuleRouter.

**Root Cause:**
The current Qwen model IDs don't match the actual Qwen API or MuleRouter API model names.

**Current (WRONG) Model IDs:**

```typescript
// From factory.ts MODEL_ID_TO_API_ID
'qwen3-max': 'qwen3-max',
'qwen3-coder-plus': 'qwen-plus',
'qwen3-coder-flash': 'qwen-flash',
'qwen-turbo': 'qwen-flash',
'qwen-flash': 'qwen-flash',
```

**Actual Qwen Model Naming (from official docs):**
Qwen models follow this format: `Qwen3[-size][-type][-date]`

Examples from documentation:

- `Qwen/Qwen3-235B-A22B-Thinking-2507` (full model path)
- `Qwen/Qwen3-235B-A22B-Instruct-2507` (instruct version)
- `Qwen/Qwen3-32B` (dense model)
- `Qwen/Qwen3-30B-A3B` (MoE model)

**The Issue:**

- We're using simplified names like `qwen3-max` but the actual API expects full model paths like `Qwen/Qwen3-235B-A22B-Instruct-2507`
- MuleRouter might have its own simplified naming, but we need to verify what it actually supports

**Fix Required:**

1. Check MuleRouter documentation for supported Qwen model names
2. Update MODEL_ID_TO_API_ID mapping with correct model IDs
3. Test with actual API to confirm models work

---

## 🔴 Issue 2: Audio Generation - FALSE ADVERTISING

**Problem:** Pricing page claims "Speech: Text-to-speech & transcription" for Hobby tier, but we don't have **audio generation** implemented in the app.

**What We Actually Have:**

- ✅ Text-to-speech (TTS) models listed in `llm.ts` (`tts-1`, `tts-1-hd`)
- ✅ Speech-to-text (STT) model listed (`whisper-1`)
- ✅ Music generation models (`suno-v4`, `udio`)

**What's Missing:**

- ❌ No UI for audio generation
- ❌ No backend integration for TTS/music generation
- ❌ Models are defined but not wired up to actual functionality

**Current Pricing Page Claims (Line 319-323):**

```tsx
<li className="flex gap-2">
  <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
  <span>
    <strong>Speech:</strong> Text-to-speech & transcription
  </span>
</li>
```

**Fix Required:**
Either:

1. **Remove the claim** from pricing page until feature is implemented, OR
2. **Implement the feature** before making the claim

---

## 🔴 Issue 3: Terminal Feature - Incorrect Tier Assignment

**Problem:** Pricing page says Hobby tier has "Code Generation: Write code (no terminal)" but contradicts the comparison table.

**Pricing Page Claims:**

**Hobby Tier (Line 307-311):**

```tsx
<span>
  <strong>Code Generation:</strong> Write code (no terminal)
</span>
```

**Comparison Table (Line 543-547):**

```tsx
{
  feature: 'Code Execution',
  hobby: 'Generate Only',
  pro: 'Terminal',
  max: 'Terminal',
},
```

**What Actually Exists:**
Terminal feature DOES exist in the codebase:

- `apps/desktop/src-tauri/src/features/terminal/mod.rs`
- `apps/desktop/src-tauri/src/features/terminal/ai_assistant.rs`
- `apps/desktop/src-tauri/src/features/terminal/session_manager.rs`
- `apps/desktop/src-tauri/src/features/terminal/shells.rs`

**Question to Answer:**
Does Hobby tier have terminal access or not? The pricing page is inconsistent.

**Fix Required:**

1. Decide: Should Hobby have terminal access?
2. Update pricing page to be consistent
3. Ensure tier checks in backend match the pricing page

---

## 🔴 Issue 4: Missing Models in Pricing - Gemini Ultra

**Problem:** Pricing page advertises "Gemini Ultra" in Max tier, but we just removed it because it doesn't exist!

**Pricing Page Max Tier (Line 430-435):**

```tsx
<li className="flex gap-2">
  <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
  <span>
    <strong>Flagship Models:</strong> Claude Opus, GPT-5 Pro, Gemini Ultra
  </span>
</li>
```

**Reality:**

- ❌ `gemini-3-ultra` doesn't exist in Google's API
- ✅ Only `gemini-3-pro-preview` and `gemini-3-flash-preview` exist

**Fix Required:**
Change "Gemini Ultra" to "Gemini Pro" in pricing page

---

## 🟡 Issue 5: Music Generation Tier

**Problem:** Pricing page claims "Music Generation" for Pro and Max tiers.

**From Pricing Table (Line 560-565):**

```tsx
{
  feature: 'Music Generation',
  hobby: false,
  pro: 'Suno, Udio',
  max: 'Suno, Udio',
},
```

**Questions:**

1. Is music generation actually implemented in the app?
2. If yes, does it work? If no, remove from pricing page
3. Are Suno/Udio API integrations functional?

---

## 📋 Summary of Required Changes

### Immediate (Blocking)

1. **Fix Qwen 404 errors** - Verify correct model IDs with MuleRouter/Qwen API
2. **Remove "Speech: Text-to-speech"** from Hobby tier OR implement it
3. **Fix Terminal tier assignment** - Make pricing page consistent
4. **Remove "Gemini Ultra"** from Max tier pricing
5. **Verify Music Generation** works or remove it

### Non-Blocking

6. Check all advertised features actually work:
   - [ ] Image generation (DALL-E, Flux, Imagen)
   - [ ] Video generation (Runway, Veo 3, Sora)
   - [ ] Web Search (Perplexity)
   - [ ] Browser automation
   - [ ] Desktop automation (Computer Use)

---

## Recommended Next Steps

1. **Audit all pricing page claims** against actual implemented features
2. **Test each LLM provider** to ensure models work (especially Qwen)
3. **Create feature parity document** - what's advertised vs what works
4. **Update pricing page** to match reality
5. **Add automated tests** for pricing page accuracy

---

## Files Requiring Changes

### Pricing Page

- `apps/web/app/pricing/page.tsx` (lines 307-311, 430-435, 543-547, 560-565)

### Qwen Provider

- `apps/web/lib/llm-providers/factory.ts` (MODEL_ID_TO_API_ID for Qwen)
- `apps/web/lib/llm-providers/qwen.ts` (verify MuleRouter integration)
- `apps/desktop/src/constants/llm.ts` (Qwen model metadata)

### Documentation

- `docs/llm-provider-reference.md` (Qwen section needs update)

---

**Priority:** 🚨 **HIGH** - These are customer-facing claims that may not work
**Impact:** User trust, subscription churn, support tickets
**Effort:** Medium - Mostly configuration and text changes
