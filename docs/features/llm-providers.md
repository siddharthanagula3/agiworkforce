# LLM Provider API Reference

This document contains official API documentation for all LLM providers integrated with AGI Workforce. Use this as the source of truth for model IDs, endpoints, and implementation details.

> **Last Updated:** 2026-02-10

---

## IMPORTANT: Model Versioning Policy

**Always use the latest model version within each family. Never use outdated versions.**

### Model Family vs Model Version

**Different model TIERS are different FAMILIES** - keep all tiers, but only the latest version of each:

| Provider  | Model Families (keep all)    | Example Versions (keep latest only) |
| --------- | ---------------------------- | ----------------------------------- |
| Anthropic | Opus, Sonnet, Haiku          | ✅ `4.5` ❌ `4.0`, `3.5`            |
| OpenAI    | GPT-5 Pro, GPT-5, GPT-5 Nano | ✅ `5.2` ❌ `5.1`, `5.0`            |
| Google    | Gemini Pro, Gemini Flash     | ✅ `3.0` ❌ `2.0`, `1.5`            |

**Different tiers serve different purposes:**

- **Premium (Opus, GPT-5 Pro):** Complex reasoning, difficult tasks
- **Balanced (Sonnet, GPT-5):** Best cost/performance for most tasks
- **Fast/Cheap (Haiku, Nano, Flash):** High-volume, simple tasks, summarization

### Example Update Workflow:

When Anthropic releases `claude-sonnet-4-5`:

1. ✅ Update `claude-sonnet-4-0` → `claude-sonnet-4-5-YYYYMMDD`
2. ✅ Keep `claude-opus-4.5` and `claude-haiku-4.5` (different families)
3. ❌ Never fall back to `claude-sonnet-4-0`

### Why This Matters:

1. **Performance:** Newer versions have better capabilities, reasoning, and accuracy
2. **API Deprecation:** Providers deprecate old versions, causing API failures
3. **Consistency:** Users expect the latest and best model performance
4. **Cost Efficiency:** Newer models are often CHEAPER (e.g., Opus 4.5 significantly cheaper than Opus 4.1)

### When Updating Models:

1. Check the provider's official documentation for the exact model ID and date suffix
2. Update `MODEL_ID_TO_API_ID` in `apps/web/lib/llm-providers/factory.ts`
3. Update this documentation with the new model IDs
4. Test the new models before deploying to production

### Model ID Sources (Always Check Official Docs):

- **Anthropic:** https://docs.anthropic.com/en/docs/about-claude/models
- **OpenAI:** https://platform.openai.com/docs/models
- **Google:** https://ai.google.dev/gemini-api/docs/models
- **xAI:** https://docs.x.ai/docs/models
- **DeepSeek:** https://api-docs.deepseek.com/
- **Moonshot:** https://platform.moonshot.ai/docs
- **Qwen (MuleRouter):** https://www.mulerouter.ai/collections/qwen

---

## Table of Contents

1. [Anthropic Claude](#anthropic-claude)
2. [OpenAI GPT-5](#openai-gpt-5)
3. [Google Gemini 3](#google-gemini-3)
4. [xAI Grok](#xai-grok)
5. [DeepSeek](#deepseek)
6. [Qwen (via MuleRouter)](#qwen-via-mulerouter)
7. [Moonshot/Kimi](#moonshotkimi)
8. [Perplexity](#perplexity)
9. [Ollama (Local)](#ollama-local)
10. [Managed Cloud](#managed-cloud)

---

## Anthropic Claude

### Base URL

```
https://api.anthropic.com
```

### Available Models

| Model Name        | API Model ID                 | Description                                                             |
| ----------------- | ---------------------------- | ----------------------------------------------------------------------- |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | Smart model for complex agents and coding                               |
| Claude Haiku 4.5  | `claude-haiku-4-5-20251001`  | Fastest model with near-frontier intelligence                           |
| Claude Opus 4.5   | `claude-opus-4-5-20251101`   | Premium model combining maximum intelligence with practical performance |

### SDK Compatibility

- OpenAI SDK compatible: No (use Anthropic SDK)
- Anthropic SDK: Yes

---

## OpenAI GPT-5

### Base URL

```
https://api.openai.com/v1
```

### Available Models

| Model Name | API Model ID | Context Window | Description                                                            |
| ---------- | ------------ | -------------- | ---------------------------------------------------------------------- |
| GPT-5.2    | `gpt-5.2`    | -              | Flagship model for coding and agentic tasks                            |
| GPT-5 Pro  | `gpt-5-pro`  | -              | Smartest model for difficult questions (Responses API only)            |
| GPT-5 nano | `gpt-5-nano` | 400K           | Fastest, cheapest version - great for summarization and classification |

### GPT-5 nano Details

- **Input Price:** $0.05 per 1M tokens
- **Cached Input:** $0.005 per 1M tokens
- **Output Price:** $0.40 per 1M tokens
- **Max Output Tokens:** 128,000
- **Knowledge Cutoff:** May 31, 2024
- **Supported Features:** Streaming, Function calling, Structured outputs, Reasoning tokens

### Endpoints

- Chat Completions: `v1/chat/completions`
- Responses: `v1/responses`
- Realtime: `v1/realtime`
- Assistants: `v1/assistants`
- Batch: `v1/batch`

---

## Google Gemini 3

### Base URL

```
https://generativelanguage.googleapis.com/v1beta
```

### Available Models

| Model Name          | API Model ID                 | Context Window | Knowledge Cutoff | Pricing (Input/Output per 1M)       |
| ------------------- | ---------------------------- | -------------- | ---------------- | ----------------------------------- |
| Gemini 3 Pro        | `gemini-3-pro-preview`       | 2M / 64k       | Jan 2025         | $2/$8 (<200k), $4/$18 (>200k)       |
| Gemini 3 Flash      | `gemini-3-flash-preview`     | 1M / 64k       | Jan 2025         | $0.50 / $2                          |
| Gemini 3 Deep Think | `gemini-3-pro-image-preview` | 65k / 32k      | Jan 2025         | $2 (text) / $0.134 (image)          |
| Gemini 2.5 Pro      | `gemini-2.5-pro`             | 2M             | Oct 2024         | $1.25/$5 (<200k), $2.50/$10 (>200k) |
| Gemini 2.5 Flash    | `gemini-2.5-flash`           | 1M             | Oct 2024         | $0.075 / $0.30                      |

**Note:** All Gemini 3 models are currently in preview.

### Key Features

#### Thinking Level Parameter (Gemini 3)

Controls the maximum depth of internal reasoning. 5-level scale (0-4).

**Thinking Levels:**

- `0` (MINIMAL): Flash only - matches "no thinking" for most queries
- `1` (LOW): Minimizes latency and cost
- `2` (MEDIUM): Flash only - balanced thinking
- `3` (HIGH): Default - maximizes reasoning depth
- `4` (EXTREME): Pro only - deepest reasoning

**Model Support:**

- Gemini 3 Pro: Levels 0, 1, 3, 4
- Gemini 3 Flash: Levels 0, 1, 2
- Gemini 2.5: Thinking budget (token-based)

**Pricing (Thinking Tokens):**

- Gemini 3 Pro: $4.00 per 1M thinking tokens
- Gemini 3 Flash: $0.20 per 1M thinking tokens
- Gemini 2.5 Pro: $1.25 per 1M thinking tokens
- Gemini 2.5 Flash: $0.075 per 1M thinking tokens

```rust
use crate::core::llm::{LLMRequest, ThinkingParameter, ThinkingLevel};

let request = LLMRequest {
    model: "gemini-3-pro-preview".to_string(),
    thinking: Some(ThinkingParameter::Level(ThinkingLevel::Extreme)),
    ..Default::default()
};
```

#### Media Resolution Parameter (Gemini 3, v1alpha)

Controls multimodal vision processing quality and token usage.

**Resolution Levels:**

- `MEDIA_RESOLUTION_LOW`: 280 tokens per image
- `MEDIA_RESOLUTION_MEDIUM`: 560 tokens per image (default)
- `MEDIA_RESOLUTION_HIGH`: 1120 tokens per image
- `MEDIA_RESOLUTION_ULTRA_HIGH`: 2240 tokens per image

```rust
use crate::core::llm::providers::google_advanced::{
    GoogleAdvancedProvider, MediaResolution
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_media_resolution(MediaResolution::MediaResolutionHigh);
```

#### Multimodal Generation

**Image Generation:**

- Nano Banana (Gemini 3): $0.04 per image
- Imagen 4: $0.04 per image

**Video Generation:**

- Veo 3.1: $0.13 per 2s, $1.30 per 20s

**Text-to-Speech:**

- Gemini 2.5 TTS: $10 per 1M characters

```rust
use crate::core::llm::providers::google_multimodal::{
    GoogleMultimodalProvider, ImageGenConfig
};

let provider = GoogleMultimodalProvider::new(api_key)?;
let config = ImageGenConfig {
    prompt: "A serene mountain landscape".to_string(),
    model: "nano-banana".to_string(),
    aspect_ratio: Some("16:9".to_string()),
    ..Default::default()
};
let image = provider.generate_image(config).await?;
```

#### RAG Capabilities

**File Search:**

- Semantic search over uploaded files
- $0.039 per 1,000 queries

**URL Context:**

- Web grounding with citations
- Included in text pricing

**Long Context:**

- Automatic chunking for 1M+ tokens
- Context caching support

```rust
use crate::core::llm::providers::google_rag::FileSearchConfig;

let file_search = FileSearchConfig {
    files: vec![file_id],
    semantic_threshold: Some(0.7),
    max_results: Some(10),
    ..Default::default()
};

let request = LLMRequest {
    file_search: Some(file_search),
    ..Default::default()
};
```

#### Grounding

**Google Search:**

- $35 per 1,000 queries
- Real-time web search to prevent hallucinations

**Google Maps:**

- Included in text pricing
- Location-based contextual grounding

```rust
use crate::core::llm::providers::google_grounding::SearchGroundingConfig;

let search_grounding = SearchGroundingConfig {
    enabled: true,
    dynamic_retrieval_threshold: Some(0.5),
};

let request = LLMRequest {
    search_grounding: Some(search_grounding),
    ..Default::default()
};
```

#### Code Execution

**FREE** Python sandbox with NumPy, Pandas, Matplotlib, PIL.

```rust
use crate::core::llm::providers::google_code_execution::CodeExecutionConfig;

let request = LLMRequest {
    code_execution: Some(CodeExecutionConfig::enabled()),
    ..Default::default()
};
```

#### Computer Use (Preview)

Browser automation and screen control (Gemini 2.5+).

```rust
use crate::core::llm::providers::google_advanced::ComputerUseConfig;

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_computer_use(ComputerUseConfig::default());
```

#### Batch API

50% cost savings for large-volume async processing.

```rust
use crate::core::llm::providers::google_batch::GoogleBatchProvider;

let batch_provider = GoogleBatchProvider::new(api_key)?;
let job = batch_provider.create_batch_job(batch_request).await?;
```

#### Live API

Real-time bidirectional audio streaming (Gemini 2.5 Flash).

```rust
use crate::core::llm::providers::google_live_api::GoogleLiveApiProvider;

let provider = GoogleLiveApiProvider::new(api_key);
provider.connect(config).await?;
```

#### Context Caching

75% discount on cached tokens (minimum 4096 tokens).

```rust
let cached = provider.create_cache(
    vec![ContentPart::text(document)],
    Duration::from_secs(3600), // 1 hour TTL
).await?;

let request = LLMRequest {
    cached_content: Some(cached.name),
    ..Default::default()
};
```

#### Safety Settings

Configurable content filtering with 4 harm categories and 5 thresholds.

```rust
use crate::core::llm::providers::google_advanced::{
    SafetySettings, SafetySetting, HarmCategory, HarmBlockThreshold
};

let safety = SafetySettings {
    settings: vec![
        SafetySetting {
            category: HarmCategory::HarmCategoryHarassment,
            threshold: HarmBlockThreshold::BlockMediumAndAbove,
        },
        // ... other categories
    ],
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_safety_settings(safety);
```

#### Temperature

**Important:** Keep at default `1.0` for Gemini 3. Lower values may cause looping or degraded performance.

#### Thought Signatures

Required for maintaining reasoning context across API calls, especially for:

- Function calling (strict validation)
- Image generation/editing (strict validation)
- Multi-turn conversations

**Dummy signature for migration:** `"thoughtSignature": "context_engineering_is_the_way_to_go"`

### Request Parameters

| Parameter          | Type                  | Description                             |
| ------------------ | --------------------- | --------------------------------------- |
| `model`            | string                | Model ID (required)                     |
| `messages`         | array                 | Conversation history (required)         |
| `thinking`         | ThinkingParameter     | Thinking level (0-4) or budget          |
| `temperature`      | float                 | Randomness (default: 1.0, keep at 1.0!) |
| `max_tokens`       | int                   | Maximum output tokens                   |
| `top_p`            | float                 | Nucleus sampling                        |
| `top_k`            | int                   | Top-k sampling                          |
| `stop_sequences`   | array                 | Stop generation sequences               |
| `stream`           | bool                  | Enable streaming                        |
| `file_search`      | FileSearchConfig      | File search with embeddings             |
| `url_context`      | URLContextConfig      | Web grounding with citations            |
| `search_grounding` | SearchGroundingConfig | Google Search grounding                 |
| `maps_grounding`   | MapsGroundingConfig   | Google Maps grounding                   |
| `code_execution`   | CodeExecutionConfig   | Python sandbox execution                |
| `cached_content`   | string                | Cache ID for 75% discount               |

### Response Fields

| Field                   | Type   | Description                     |
| ----------------------- | ------ | ------------------------------- |
| `content`               | string | Generated text                  |
| `thinking_tokens`       | int    | Thinking tokens used (Gemini 3) |
| `thought_summary`       | string | Reasoning summary               |
| `generated_images`      | array  | Generated images (multimodal)   |
| `generated_video`       | object | Generated video (Veo 3.1)       |
| `audio_output`          | bytes  | TTS audio output                |
| `code_execution_result` | object | Python execution results        |
| `grounding_metadata`    | object | Search/Maps citations           |
| `input_tokens`          | int    | Total input tokens              |
| `output_tokens`         | int    | Total output tokens             |
| `cached_tokens`         | int    | Cached tokens (75% discount)    |
| `cost`                  | float  | Total cost in USD               |

### SDK Requirements

- Gen AI SDK for Python: version 1.51.0 or later
- Rust: 1.75+ (AGI Workforce)

### Example: Basic Request with Thinking

```rust
use crate::core::llm::{LLMRequest, ThinkingParameter, ThinkingLevel};

let request = LLMRequest {
    model: "gemini-3-pro-preview".to_string(),
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "Solve this complex problem: [problem]".to_string(),
        ..Default::default()
    }],
    thinking: Some(ThinkingParameter::Level(ThinkingLevel::Extreme)),
    temperature: Some(1.0), // Keep at 1.0!
    ..Default::default()
};

let response = provider.send_message(&request).await?;
println!("Reasoning: {}", response.thought_summary.unwrap_or_default());
println!("Answer: {}", response.content);
```

### Example: Multimodal with Grounding

```rust
let request = LLMRequest {
    model: "gemini-3-flash-preview".to_string(),
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "What's the latest news on AI regulation?".to_string(),
        ..Default::default()
    }],
    search_grounding: Some(SearchGroundingConfig {
        enabled: true,
        dynamic_retrieval_threshold: Some(0.5),
    }),
    ..Default::default()
};

let response = provider.send_message(&request).await?;

// Access grounding citations
if let Some(grounding) = response.grounding_metadata {
    for result in grounding.search_results {
        println!("Source: {} - {}", result.title, result.url);
    }
}
```

---

## xAI Grok

### Base URL

```
https://api.x.ai/v1
```

### Available Models (4.1 Series Only)

| Model Name                  | API Model ID                  | Context   | Rate Limits     | Pricing (Input/Output per 1M) |
| --------------------------- | ----------------------------- | --------- | --------------- | ----------------------------- |
| Grok 4.1 Fast Reasoning     | `grok-4-1-fast-reasoning`     | 2,000,000 | 4M tpm, 480 rpm | $0.20 / $0.50                 |
| Grok 4.1 Fast Non-Reasoning | `grok-4-1-fast-non-reasoning` | 2,000,000 | 4M tpm, 480 rpm | $0.20 / $0.50                 |
| Grok Code Fast 1            | `grok-code-fast-1`            | 256,000   | 2M tpm, 480 rpm | $0.20 / $1.50                 |

### SDK Compatibility

- OpenAI SDK: Yes (compatible)
- Anthropic SDK: Deprecated, migrate to Responses API

### Key Features

- Structured Outputs (all language models)
- Tool calling (Grok 4 family)
- Vision (text + image input)

### Example: Basic Request

```python
from openai import OpenAI

client = OpenAI(
    api_key="your_api_key",
    base_url="https://api.x.ai/v1"
)

response = client.chat.completions.create(
    model="grok-4-1-fast-reasoning",
    messages=[
        {"role": "system", "content": "You are Grok, a helpful AI assistant."},
        {"role": "user", "content": "What is the meaning of life?"}
    ]
)
```

### Example: Structured Output with Tools

```python
from openai import OpenAI
import json

client = OpenAI(api_key="your_api_key", base_url="https://api.x.ai/v1")

# Define tool
collatz_tool = {
    "type": "function",
    "function": {
        "name": "collatz_steps",
        "description": "Compute Collatz sequence steps",
        "parameters": {
            "type": "object",
            "properties": {
                "n": {"type": "integer", "description": "The starting number"}
            },
            "required": ["n"]
        }
    }
}

response = client.chat.completions.create(
    model="grok-4-1-fast-non-reasoning",
    messages=[{"role": "user", "content": "Use collatz_steps for 20250709"}],
    tools=[collatz_tool]
)
```

---

## DeepSeek

### Base URL

```
https://api.deepseek.com
```

### Available Models

| Model Name    | API Model ID        | Mode         | Context | Max Output               |
| ------------- | ------------------- | ------------ | ------- | ------------------------ |
| DeepSeek V3.2 | `deepseek-chat`     | Non-thinking | 128K    | 4K (default), 8K (max)   |
| DeepSeek V3.2 | `deepseek-reasoner` | Thinking     | 128K    | 32K (default), 64K (max) |

### Pricing

- **Cache Hit:** $0.028 per 1M tokens
- **Cache Miss:** $0.28 per 1M tokens
- **Output:** $0.42 per 1M tokens

### SDK Compatibility

- OpenAI SDK: Yes (compatible)

### Thinking Mode

Enable thinking mode using either method:

**Method 1: Use deepseek-reasoner model**

```python
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=messages
)
```

**Method 2: Use thinking parameter**

```python
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages,
    extra_body={"thinking": {"type": "enabled"}}
)
```

### Thinking Mode Response

```python
# Access reasoning content
reasoning_content = response.choices[0].message.reasoning_content
# Access final answer
content = response.choices[0].message.content
```

### Multi-turn Conversation with Thinking

In multi-turn conversations, the CoT (reasoning_content) from previous turns is NOT concatenated into the context. Only pass the `content` from previous turns.

### Tool Calls with Thinking Mode

When using tool calls in thinking mode, you MUST pass back `reasoning_content` to the API, or it will return a 400 error.

```python
# Append the full message including reasoning_content
messages.append(response.choices[0].message)

# Or explicitly:
messages.append({
    'role': 'assistant',
    'content': response.choices[0].message.content,
    'reasoning_content': response.choices[0].message.reasoning_content,
    'tool_calls': response.choices[0].message.tool_calls,
})
```

### Supported Features

- JSON Output
- Tool Calls
- Chat Completion
- Chat Prefix Completion (Beta)

### Not Supported (Thinking Mode)

- FIM (Beta)
- Parameters: temperature, top_p, presence_penalty, frequency_penalty, logprobs, top_logprobs

---

## Qwen (via MuleRouter)

### Base URL

```
https://api.mulerouter.ai/vendors/alibaba/v1
```

### Available Models

| Model Name  | API Model ID | Description                          |
| ----------- | ------------ | ------------------------------------ |
| Qwen3 Flash | `qwen-flash` | Latency-optimized for chat and tools |
| Qwen3 Plus  | `qwen-plus`  | Balanced reasoning with efficiency   |
| Qwen3 Max   | `qwen3-max`  | Flagship for expansive reasoning     |

### Pricing (Qwen Flash)

- **0-256K tokens:** $0.05 input / $0.4 output per 1M
- **256K-1M tokens:** $0.25 input / $2 output per 1M

### Thinking Mode

Qwen3 adds `<think>...</think>` for reasoning. Enable with:

```python
enable_thinking=True
```

### SDK Compatibility

- OpenAI SDK: Yes (compatible via MuleRouter)

---

## Moonshot/Kimi

### Base URL

```
https://api.moonshot.ai/v1
```

### Available Models

| Model Name             | API Model ID                   | Notes                                |
| ---------------------- | ------------------------------ | ------------------------------------ |
| Kimi K2.5              | `kimi-k2.5`                    | Latest model with thinking parameter |
| Kimi K2 Turbo          | `kimi-k2-turbo-preview`        | Fast inference                       |
| Kimi K2 Thinking Turbo | `kimi-k2-thinking-turbo`       | Thinking mode, turbo speed           |
| Kimi K2 Thinking       | `kimi-k2-thinking`             | Full thinking mode                   |
| Kimi K2 0905 Preview   | `kimi-k2-0905-preview`         | Preview version                      |
| Kimi K2 0711 Preview   | `kimi-k2-0711-preview`         | Preview version                      |
| Moonshot V1 8K         | `moonshot-v1-8k`               | 8K context                           |
| Moonshot V1 32K        | `moonshot-v1-32k`              | 32K context                          |
| Moonshot V1 128K       | `moonshot-v1-128k`             | 128K context                         |
| Moonshot V1 Auto       | `moonshot-v1-auto`             | Auto context selection               |
| Moonshot V1 Vision     | `moonshot-v1-*-vision-preview` | Vision models (8k/32k/128k)          |

### SDK Compatibility

- OpenAI SDK: Yes (fully compatible)
- Minimum versions: Python 3.7.1+, Node.js 18+, OpenAI SDK 1.0.0+

### Default Parameters

| Model              | Temperature   | top_p                |
| ------------------ | ------------- | -------------------- |
| moonshot-v1 series | 0.0           | 1.0                  |
| kimi-k2 models     | 0.6           | 1.0                  |
| kimi-k2-thinking   | 1.0           | -                    |
| kimi-k2.5          | Cannot modify | 0.95 (cannot modify) |

### Example: Basic Request

```python
from openai import OpenAI

client = OpenAI(
    api_key="$MOONSHOT_API_KEY",
    base_url="https://api.moonshot.ai/v1",
)

completion = client.chat.completions.create(
    model="kimi-k2-turbo-preview",
    messages=[
        {"role": "system", "content": "You are Kimi, an AI assistant."},
        {"role": "user", "content": "What is 1+1?"}
    ],
    temperature=0.6,
)
```

### Example: Streaming

```python
response = client.chat.completions.create(
    model="kimi-k2-turbo-preview",
    messages=[...],
    temperature=0.6,
    stream=True,
)

for chunk in response:
    chunk_message = chunk.choices[0].delta
    if chunk_message.content:
        print(chunk_message.content, end="")
```

### Thinking Mode (kimi-k2.5)

```python
completion = client.chat.completions.create(
    model="kimi-k2.5",
    messages=[...],
    # Default: {"type": "enabled"}
    # To disable: extra_body={"thinking": {"type": "disabled"}}
)
```

### Vision Input

```python
response = client.chat.completions.create(
    model="moonshot-v1-8k-vision-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{img_base}"
                    }
                },
                {
                    "type": "text",
                    "text": "What does this image show?"
                }
            ]
        }
    ]
)
```

---

## Ollama (Local)

Run open-source models locally on your machine with full privacy.

### Base URL

```
http://localhost:11434/v1 (Standard OpenAI-compatible API)
```

### Setup

1. [Download Ollama](https://ollama.com)
2. Pull a model: `ollama pull llama3`
3. AGI Workforce automatically detects available models.

### common Models

- `llama3`
- `mistral`
- `codellama`
- `phi3`

---

## Managed Cloud

The **Managed Cloud Provider** allows the desktop application to access premium LLMs (GPT-5, Claude Opus, Gemini) without requiring local API keys.

- **Zero-Trust**: No API keys stored on your device.
- **Enterprise Billing**: Usage billed to your organization's centralized account.
- **Auditable**: All requests logged centrally for compliance.

### Configuration

Selected by default in the Desktop app settings when "Managed Cloud" is chosen as the active provider.
"text": "Please describe this image."
}
]
}
]
)

````

### Tool Use / Function Calling

```python
completion = client.chat.completions.create(
    model="kimi-k2-turbo-preview",
    messages=[...],
    tools=[{
        "type": "function",
        "function": {
            "name": "CodeRunner",
            "description": "A code executor supporting Python and JavaScript",
            "parameters": {
                "properties": {
                    "language": {
                        "type": "string",
                        "enum": ["python", "javascript"]
                    },
                    "code": {
                        "type": "string",
                        "description": "The code to execute"
                    }
                },
                "type": "object"
            }
        }
    }],
    temperature=0.6,
)
````

### Partial Mode (JSON Mode / Role-Playing)

Add `"partial": True` to the last assistant message to prefill response:

```python
messages = [
    {"role": "system", "content": "Extract data as JSON."},
    {"role": "user", "content": "Product description..."},
    {"role": "assistant", "content": "{", "partial": True}
]
```

**Note:** Do not mix Partial Mode with `response_format=json_object`.

### File Upload

```python
# Upload file
file_object = client.files.create(file=Path("document.pdf"), purpose="file-extract")

# Get file content
file_content = client.files.content(file_id=file_object.id).text

# Use in messages
messages = [
    {"role": "system", "content": file_content},
    {"role": "user", "content": "Summarize this document"}
]
```

### Supported File Formats

.pdf, .txt, .csv, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .md, .jpeg, .png, .bmp, .gif, .svg, .webp, .html, .json, .epub, .go, .h, .c, .cpp, .java, .js, .css, .php, .py, .yaml, .yml, .ts, .tsx, etc.

### Token Estimation

```python
response = requests.post(
    "https://api.moonshot.ai/v1/tokenizers/estimate-token-count",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "model": "kimi-k2.5",
        "messages": [...]
    }
)
# Response: {"data": {"total_tokens": 80}}
```

### Check Balance

```bash
curl https://api.moonshot.ai/v1/users/me/balance -H "Authorization: Bearer $MOONSHOT_API_KEY"
```

### Error Codes

| HTTP Status | Error Type                   | Description              |
| ----------- | ---------------------------- | ------------------------ |
| 400         | content_filter               | Content review rejection |
| 400         | invalid_request_error        | Invalid request format   |
| 401         | invalid_authentication_error | Invalid API key          |
| 429         | exceeded_current_quota_error | Insufficient balance     |
| 429         | rate_limit_reached_error     | Rate limit exceeded      |
| 429         | engine_overloaded_error      | Server overloaded        |

---

## Perplexity

### Base URL

```
https://api.perplexity.ai
```

### Available Models

| Model Name          | API Model ID          | Description                      |
| ------------------- | --------------------- | -------------------------------- |
| Sonar               | `sonar`               | Standard search model            |
| Sonar Pro           | `sonar-pro`           | Deeper retrieval with follow-ups |
| Sonar Reasoning     | `sonar-reasoning`     | For reasoning tasks              |
| Sonar Deep Research | `sonar-deep-research` | Comprehensive research           |

### Notes

- Built on Llama 3.3 70B
- Powered by Cerebras inference (1200 tokens/second)
- Sonar Pro F-score: 0.858 on SimpleQA
- Sonar F-score: 0.773 on SimpleQA

---

## ZhipuAI GLM

### Base URL

```
https://open.bigmodel.cn/api/paas/v4
```

### Available Models

| Model Name     | API Model ID     | Description           |
| -------------- | ---------------- | --------------------- |
| GLM-4.7        | `glm-4.7`        | Latest flagship model |
| GLM-4.6v       | `glm-4.6v`       | Vision model          |
| GLM-4.6v Flash | `glm-4.6v-flash` | Fast vision model     |

**Note:** Documentation pending - model IDs may need verification.

---

## Model ID Mapping Reference

This is the mapping used in `apps/web/lib/llm-providers/factory.ts`:

```typescript
const MODEL_ID_TO_API_ID: Record<string, string> = {
  // OpenAI models
  'gpt-5.2': 'gpt-5.2',
  'gpt-5-pro': 'gpt-5-pro',
  'gpt-5-nano': 'gpt-5-nano',

  // Anthropic Claude models
  'claude-opus-4.5': 'claude-opus-4-5-20251101',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',

  // Google Gemini models
  'gemini-3-ultra': 'gemini-3-pro-preview',
  'gemini-3-pro': 'gemini-3-pro-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',

  // xAI Grok models (4.1 only)
  'grok-4.1': 'grok-4-1-fast-reasoning',
  'grok-4.1-fast': 'grok-4-1-fast-non-reasoning',
  'grok-4.1-fast-reasoning': 'grok-4-1-fast-reasoning',
  'grok-4.1-mini': 'grok-4-1-fast-non-reasoning',

  // DeepSeek models
  'deepseek-v3.2': 'deepseek-chat',
  'deepseek-r1': 'deepseek-reasoner',

  // Qwen models (via MuleRouter)
  'qwen3-max': 'qwen3-max',
  'qwen3-coder-plus': 'qwen-plus',
  'qwen3-coder-flash': 'qwen-flash',
  'qwen-turbo': 'qwen-flash',
  'qwen-flash': 'qwen-flash',

  // Moonshot/Kimi models
  'kimi-k2.5': 'kimi-k2.5',
  'kimi-k2.5-thinking': 'kimi-k2-thinking',
  'kimi-k2.5-turbo': 'kimi-k2-turbo-preview',

  // Perplexity models
  sonar: 'sonar',
  'sonar-pro': 'sonar-pro',
  'sonar-reasoning': 'sonar-reasoning',
  'sonar-deep-research': 'sonar-deep-research',

  // ZhipuAI GLM models
  'glm-4.7': 'glm-4.7',
  'glm-4.6v': 'glm-4.6v',
  'glm-4.6v-flash': 'glm-4.6v-flash',
};
```
