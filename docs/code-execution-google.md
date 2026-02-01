# Google Gemini Code Execution Support

## Overview

This document describes the Python code execution capabilities added to the Google Gemini provider in AGI Workforce. Code execution allows Gemini models to run Python code in a secure sandbox environment with access to popular data science libraries.

## Features

### Sandbox Environment

- **Secure Execution**: Code runs in an isolated sandbox environment
- **No Cost**: Code execution is **FREE** - no additional charges
- **Libraries Available**:
  - NumPy (numerical computing)
  - Pandas (data analysis)
  - Matplotlib (data visualization)
  - PIL/Pillow (image processing)
  - Standard Python libraries

### Capabilities

1. **Data Analysis**: Perform complex calculations and data transformations
2. **Visualization**: Generate charts and graphs using Matplotlib
3. **Image Processing**: Manipulate images with PIL
4. **Text Output**: Capture stdout and stderr from execution
5. **Generated Images**: Return generated plots as base64-encoded images

## Implementation

### File Structure

```
apps/desktop/src-tauri/src/core/llm/providers/
├── google_code_execution.rs      # New module for code execution
├── google.rs                      # Updated with code execution support
└── mod.rs                         # Updated to export code execution types
```

### Core Types

#### `CodeExecutionConfig`

Configuration for enabling code execution in requests.

```rust
pub struct CodeExecutionConfig {
    pub enabled: bool,
}

impl CodeExecutionConfig {
    pub fn enabled() -> Self;
    pub fn disabled() -> Self;
}
```

#### `CodeExecutionResult`

Results from code execution containing output and metadata.

```rust
pub struct CodeExecutionResult {
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub output_images: Option<Vec<String>>,  // Base64 PNG images
    pub exit_code: Option<i32>,
    pub status: Option<String>,
}

impl CodeExecutionResult {
    pub fn is_success(&self) -> bool;
    pub fn has_output(&self) -> bool;
    pub fn formatted_output(&self) -> String;
    pub fn image_count(&self) -> usize;
}
```

#### `ExecutableCode`

Represents executable code blocks extracted from responses.

```rust
pub struct ExecutableCode {
    pub language: String,  // Typically "python"
    pub code: String,
}

impl ExecutableCode {
    pub fn new(language: String, code: String) -> Self;
    pub fn is_python(&self) -> bool;
}
```

### Request/Response Flow

#### 1. Enable Code Execution in Request

Add `code_execution: Some(true)` to `LLMRequest`:

```rust
let request = LLMRequest {
    messages: vec![
        ChatMessage {
            role: "user".to_string(),
            content: "Calculate the mean of [1, 2, 3, 4, 5]".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        },
    ],
    model: "gemini-3-pro".to_string(),
    code_execution: Some(true),  // Enable code execution
    temperature: Some(0.7),
    max_tokens: Some(2048),
    stream: false,
    // ... other fields
};
```

#### 2. Generation Config

The `code_execution` flag is added to the Google API request's generation config:

```json
{
  "generation_config": {
    "temperature": 0.7,
    "max_output_tokens": 2048,
    "codeExecution": {
      "enabled": true
    }
  }
}
```

#### 3. Response Parsing

Responses may contain:

- **Executable Code Parts**: Code that Gemini wants to execute

  ```json
  {
    "executableCode": {
      "language": "python",
      "code": "import numpy as np\nprint(np.mean([1, 2, 3, 4, 5]))"
    }
  }
  ```

- **Code Execution Results**: Output from executed code
  ```json
  {
    "codeExecutionResult": {
      "outcome": "OUTCOME_OK",
      "output": "3.0\n"
    }
  }
  ```

#### 4. Extracting Results

Use helper functions to extract code and results from response parts:

```rust
use crate::core::llm::providers::google_code_execution::{
    extract_executable_code,
    parse_code_execution_results,
};

// Parse response parts
let parts: Vec<serde_json::Value> = /* ... */;

// Extract executable code blocks
let code_blocks = extract_executable_code(&parts);
for code in code_blocks {
    println!("Language: {}", code.language);
    println!("Code: {}", code.code);
}

// Extract execution results
let results = parse_code_execution_results(&parts);
for result in results {
    if result.is_success() {
        println!("Output: {}", result.formatted_output());
        println!("Generated {} images", result.image_count());
    }
}
```

### Integration with LLM Module

#### Updated `LLMRequest`

Added new field to `core/llm/mod.rs`:

```rust
pub struct LLMRequest {
    // ... existing fields ...

    /// Enable Python code execution in sandboxed environment (Google Gemini)
    /// FREE - no additional cost for code execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_execution: Option<bool>,

    // ... other fields ...
}
```

#### Updated `LLMResponse`

Added field for code execution results:

```rust
pub struct LLMResponse {
    // ... existing fields ...

    /// Code execution results (Google Gemini)
    /// Contains stdout, stderr, and generated images from Python code execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_execution_results: Option<Vec<serde_json::Value>>,
}
```

## Usage Examples

### Example 1: Simple Calculation

```rust
let request = LLMRequest {
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "What is the factorial of 10?".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }],
    model: "gemini-3-flash".to_string(),
    code_execution: Some(true),
    temperature: Some(0.0),
    max_tokens: Some(1024),
    stream: false,
    // ... other fields set to None ...
};

let response = provider.send_message(&request).await?;

if let Some(results) = response.code_execution_results {
    for result_json in results {
        if let Ok(result) = serde_json::from_value::<CodeExecutionResult>(result_json) {
            println!("Execution output: {}", result.formatted_output());
        }
    }
}
```

### Example 2: Data Visualization

```rust
let request = LLMRequest {
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "Create a line plot of y = x^2 for x from 0 to 10".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }],
    model: "gemini-3-pro".to_string(),
    code_execution: Some(true),
    temperature: Some(0.7),
    max_tokens: Some(2048),
    stream: false,
    // ... other fields ...
};

let response = provider.send_message(&request).await?;

if let Some(results) = response.code_execution_results {
    for result_json in results {
        if let Ok(result) = serde_json::from_value::<CodeExecutionResult>(result_json) {
            if result.image_count() > 0 {
                println!("Generated {} visualization(s)", result.image_count());
                // Images are base64-encoded PNG data
                if let Some(images) = result.output_images {
                    for (i, img_base64) in images.iter().enumerate() {
                        println!("Image {}: {} bytes", i, img_base64.len());
                    }
                }
            }
        }
    }
}
```

### Example 3: Data Analysis with Pandas

```rust
let request = LLMRequest {
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "Analyze this data: [10, 20, 30, 40, 50]. Calculate mean, median, and std dev.".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }],
    model: "gemini-3-flash".to_string(),
    code_execution: Some(true),
    temperature: Some(0.0),
    max_tokens: Some(1024),
    stream: false,
    // ... other fields ...
};

let response = provider.send_message(&request).await?;
println!("Analysis: {}", response.content);
```

## API Details

### Request Format

When `code_execution: Some(true)` is set, the Google provider adds this to the generation config:

```json
{
  "generationConfig": {
    "codeExecution": {
      "enabled": true
    }
  }
}
```

### Response Format

Gemini may return multiple part types:

1. **Text Part**: Normal text response

   ```json
   {
     "text": "I'll calculate that for you."
   }
   ```

2. **Executable Code Part**: Code that will be executed

   ```json
   {
     "executableCode": {
       "language": "python",
       "code": "import numpy as np\nresult = np.factorial(10)\nprint(result)"
     }
   }
   ```

3. **Code Execution Result Part**: Output from execution
   ```json
   {
     "codeExecutionResult": {
       "outcome": "OUTCOME_OK",
       "output": "3628800\n"
     }
   }
   ```

### Outcome Values

- `OUTCOME_OK`: Execution succeeded
- `OUTCOME_FAILED`: Execution failed
- `OUTCOME_DEADLINE_EXCEEDED`: Execution timed out

## Pricing

**Code execution is completely FREE** when using Google Gemini models. There is no additional cost for executing Python code in the sandbox environment.

Standard token pricing applies:

- Input tokens: Charged at model's input rate
- Output tokens: Charged at model's output rate
- Code execution: **$0.00** (FREE)

## Security Considerations

1. **Sandboxed Environment**: Code runs in an isolated container
2. **Network Restrictions**: No external network access from code
3. **Resource Limits**: CPU, memory, and time limits enforced
4. **Library Restrictions**: Only approved libraries available
5. **File System**: Isolated temporary file system

## Testing

The module includes comprehensive unit tests:

```bash
cd apps/desktop/src-tauri
cargo test google_code_execution
```

Tests cover:

- Configuration creation
- Result parsing
- Success/failure detection
- Output formatting
- Image counting
- Executable code extraction
- Raw result conversion

## Future Enhancements

Potential future improvements:

1. **Custom Libraries**: Allow users to specify additional Python packages
2. **Execution Timeout Config**: Configurable timeout for long-running code
3. **Resource Monitoring**: Track CPU/memory usage
4. **Multi-language Support**: Add support for other languages (JavaScript, R)
5. **Persistent State**: Maintain execution state across multiple requests
6. **Error Recovery**: Better error handling and retry logic

## Related Documentation

- [Google Gemini API Documentation](https://ai.google.dev/docs/gemini_api_overview)
- [LLM Provider Architecture](./LLM_PROVIDER_API_REFERENCE.md)
- [Model Routing Guide](./MODEL_ROUTING_GUIDE.md)

## Support

For issues or questions:

- Check Gemini API status: https://status.cloud.google.com/
- Review error messages in `code_execution_results`
- Enable debug logging: `RUST_LOG=debug`

---

**Implementation Date**: February 1, 2026
**Version**: 1.0.0
**Status**: Production Ready
