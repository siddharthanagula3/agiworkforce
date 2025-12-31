# Reasoning Models at Same Price (December 2025)

This document tracks API providers that offer both reasoning and non-reasoning model variants at the **same price**, allowing us to prioritize reasoning models without additional cost.

## ✅ Confirmed Same-Price Reasoning Variants

### xAI (Grok)

**Grok 4.1 Fast Reasoning vs Non-Reasoning**

- **Reasoning Variant**: `grok-4.1-fast-reasoning`
  - Price: $0.10 input + $0.40 output = **$0.50/1M tokens**
  - Capabilities: Enhanced reasoning, thinking mode, research capabilities
  - Benchmarks: ~65% SWE-bench, ~88% MMLU, ~1230 Elo
- **Non-Reasoning Variant**: `grok-4.1-fast`
  - Price: $0.10 input + $0.40 output = **$0.50/1M tokens**
  - Capabilities: Standard chat, tool-calling, 2M context
  - Benchmarks: ~58% SWE-bench, ~86% MMLU, ~1230 Elo

**Implementation Status**: ✅ **PRIORITIZED** - Reasoning variant is tried first in all auto modes

---

## 🔍 Other Providers Checked

### Qwen

**Qwen3-Max**

- **Status**: Always reasoning (thinking mode built-in)
- **Price**: $2.50 input + $10.00 output = $12.50/1M tokens
- **Note**: No separate non-reasoning variant exists - thinking mode is always enabled
- **Implementation**: Already using reasoning model

### OpenAI

**GPT-5.2 Series**

- **GPT-5.2**: $6.00 input + $18.00 output = $24.00/1M tokens (non-reasoning)
- **GPT-5.2 Pro**: $10.00 input + $30.00 output = $40.00/1M tokens (reasoning)
- **Status**: ❌ Different prices - Pro is more expensive
- **Note**: Web sources mention "thinking" mode for GPT-5.2, but separate model ID not confirmed at same price

**GPT-5.1 Series**

- **GPT-5.1 Chat Latest**: $4.00 input + $12.00 output = $16.00/1M tokens (non-reasoning)
- **GPT-5.1 Thinking**: $7.00 input + $21.00 output = $28.00/1M tokens (reasoning)
- **Status**: ❌ Different prices - Thinking is more expensive

### Anthropic

**Claude Series**

- **Claude Sonnet 4.5**: $3.00 input + $15.00 output = $18.00/1M tokens (non-reasoning)
- **Claude Opus 4.5**: $5.00 input + $25.00 output = $30.00/1M tokens (reasoning)
- **Status**: ❌ Different prices - Opus is more expensive

### Google

**Gemini 3 Series**

- **Gemini 3 Pro**: $1.50 input + $6.00 output = $7.50/1M tokens (non-reasoning)
- **Gemini 3 Deep Think**: $2.00 input + $8.00 output = $10.00/1M tokens (reasoning)
- **Status**: ❌ Different prices - Deep Think is more expensive

**Gemini 3 Flash**: $0.075 input + $0.30 output = $0.375/1M tokens

- **Note**: No separate reasoning variant at same price

### DeepSeek

**DeepSeek V3.2**

- **Current Model**: `deepseek-v3` = $0.14 input + $0.14 output = $0.28/1M tokens
- **Web Sources Mention**: DeepSeek V3.2-Exp Reasoner at $0.28/$0.42 = $0.70/1M tokens
- **Status**: ⚠️ Model ID not confirmed in current codebase
- **Note**: May need to add if API provider offers this variant

### Moonshot (Kimi)

**Kimi K2 Thinking**

- **Price**: $1.50 input + $6.00 output = $7.50/1M tokens
- **Status**: Always reasoning (no separate non-reasoning variant)
- **Implementation**: Already using reasoning model

---

## 📋 Implementation Guidelines

### When to Prioritize Reasoning Models

1. **Same Provider**: Both variants must be from the same API provider
2. **Same Price**: Total cost per 1M tokens must be identical
3. **Separate Model IDs**: Must have distinct model identifiers (not just a parameter)

### Current Implementation

The routing system automatically prioritizes reasoning models when:

- They're from the same provider
- They have the same total price per 1M tokens
- They appear in the same candidate list

### Example: Grok 4.1 Fast

```rust
// Auto Economy Mode - Simple Tasks
RouteCandidate {
    provider: Provider::XAI,
    model: "grok-4.1-fast-reasoning".to_string(), // ✅ Prioritized (same price)
    reason: "auto-economy-xai-reasoning",
},
RouteCandidate {
    provider: Provider::XAI,
    model: "grok-4.1-fast".to_string(), // Fallback (non-reasoning)
    reason: "auto-economy-xai",
},
```

---

## 🔄 Future Updates

As API providers release new models with reasoning variants at the same price, this document and the routing logic should be updated to prioritize them.

**Last Updated**: January 2, 2026
**Next Review**: When new model variants are released by API providers
