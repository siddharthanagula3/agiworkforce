# AGI Workforce Extension - Desktop App Integration Guide

This guide explains how to integrate the browser extension with the AGI Workforce desktop application.

## Overview

The extension communicates with the Tauri desktop app via HTTP requests. The desktop app exposes endpoints that receive page context and task requests from the extension, then sends back instructions for page automation.

## Desktop App Integration Points

### 1. Health Check Endpoint

**Purpose:** Verify desktop app is running

**Endpoint:** `GET /health`

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.9",
  "timestamp": "2026-02-01T12:34:56Z"
}
```

**Implementation (Tauri):**

```rust
#[tauri::command]
pub async fn health_check() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}
```

### 2. Page Context Endpoint

**Purpose:** Send current page state to desktop app

**Endpoint:** `POST /api/extension/page-context`

**Request Body:**

```typescript
interface PageContext {
  url: string;
  title: string;
  html: string; // Limited to first 100KB
  selectedText?: string;
  tabId: number;
  timestamp: number;
}
```

**Response:**

```typescript
interface PageContextResponse {
  success: boolean;
  taskId?: string;
  actions?: PageAction[];
  error?: string;
}
```

**Example Request:**

```javascript
const context = {
  url: 'https://example.com/login',
  title: 'Login - Example',
  html: '...',
  selectedText: 'example@email.com',
  tabId: 1,
  timestamp: Date.now(),
};

const response = await fetch('http://localhost:3001/api/extension/page-context', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(context),
});
```

### 3. Form Detection Endpoint

**Purpose:** Send detected forms for analysis

**Endpoint:** `POST /api/extension/forms`

**Request Body:**

```typescript
interface FormData {
  url: string;
  tabId: number;
  forms: Array<{
    id?: string;
    name?: string;
    method: string;
    action?: string;
    fields: Array<{
      name: string;
      type: string;
      value?: string;
      required: boolean;
      options?: string[];
    }>;
  }>;
}
```

**Response:**

```typescript
interface FormAnalysisResponse {
  success: boolean;
  analysis?: {
    formTypes: string[];
    recommendedFields: string[];
    suggestedActions: string[];
  };
  error?: string;
}
```

### 4. Task Result Endpoint

**Purpose:** Report task completion and results

**Endpoint:** `POST /api/extension/task-result`

**Request Body:**

```typescript
interface TaskResult {
  taskId: string;
  success: boolean;
  screenshot?: string; // Base64 PNG
  result?: any;
  error?: string;
  actionsPerformed: number;
  duration: number; // milliseconds
}
```

**Response:**

```typescript
interface TaskResultResponse {
  success: boolean;
  nextAction?: any;
  shouldContinue?: boolean;
}
```

## Implementation in Tauri

### Add Routes to API Gateway

**File:** `apps/desktop/src-tauri/src/sys/commands/extension.rs`

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContext {
    pub url: String,
    pub title: String,
    pub html: String,
    pub selected_text: Option<String>,
    pub tab_id: u32,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContextResponse {
    pub success: bool,
    pub task_id: Option<String>,
    pub actions: Option<Vec<serde_json::Value>>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn extension_page_context(
    context: PageContext,
    state: State<'_, AgentState>,
) -> Result<PageContextResponse, String> {
    // Process page context
    // Send to AGI engine
    // Return actions to perform

    Ok(PageContextResponse {
        success: true,
        task_id: Some(uuid::Uuid::new_v4().to_string()),
        actions: None,
        error: None,
    })
}

#[tauri::command]
pub async fn extension_forms(
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Analyze forms
    // Return recommendations

    Ok(serde_json::json!({
        "success": true,
        "analysis": {
            "formTypes": ["login"],
            "recommendedFields": ["username", "password"],
            "suggestedActions": ["fill_form", "submit"]
        }
    }))
}

#[tauri::command]
pub async fn extension_task_result(
    result: serde_json::Value,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    // Process task result
    // Update conversation
    // Store screenshots

    Ok(serde_json::json!({
        "success": true,
        "nextAction": null,
        "shouldContinue": false
    }))
}
```

### Register Commands in lib.rs

```rust
// In lib.rs setup()
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    crate::sys::commands::extension::extension_page_context,
    crate::sys::commands::extension::extension_forms,
    crate::sys::commands::extension::extension_task_result,
])
```

### Add WebSocket Support (Optional)

For real-time updates, use WebSocket instead of polling:

```rust
use tauri_plugin_websocket::{Client, Event};

#[tauri::command]
pub async fn extension_websocket_connect(
    client: tauri::State<'_, WebSocketClient>,
) -> Result<String, String> {
    let ws_url = "ws://localhost:4000/extension";

    client.connect(ws_url).await
        .map_err(|e| e.to_string())
}
```

## Extension Usage

### Sending Page Context on Demand

In `content.ts`, add a function to send page context:

```typescript
export async function sendPageContextToDesktop(): Promise<void> {
  try {
    const pageInfo = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_INFO',
    });

    const response = await fetch('http://localhost:3001/api/extension/page-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...pageInfo,
        tabId: chrome.tabs.getCurrent().id,
        timestamp: Date.now(),
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    logger.error('Failed to send page context', error);
  }
}
```

### Performing Actions from Desktop

When desktop app sends actions back:

```typescript
export interface PageAction {
  id: string;
  type: 'CLICK' | 'TYPE' | 'SUBMIT' | 'WAIT' | 'SCREENSHOT';
  selector?: string;
  value?: string;
  delay?: number;
}

export async function performActions(actions: PageAction[]): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'CLICK':
        await chrome.runtime.sendMessage({
          type: 'CLICK',
          selector: action.selector,
        });
        break;

      case 'TYPE':
        await chrome.runtime.sendMessage({
          type: 'TYPE',
          selector: action.selector,
          text: action.value,
        });
        break;

      case 'SUBMIT':
        await chrome.runtime.sendMessage({
          type: 'SUBMIT_FORM',
          formSelector: action.selector,
        });
        break;

      case 'SCREENSHOT':
        const screenshot = await chrome.runtime.sendMessage({
          type: 'CAPTURE_SCREENSHOT',
        });
        // Send back to desktop
        break;

      case 'WAIT':
        await sleep(action.delay ?? 1000);
        break;
    }
  }
}
```

## API Gateway Integration

### Express Route Handler

**File:** `services/api-gateway/src/routes/extension.ts`

```typescript
import { Router, Request, Response } from 'express';

const router = Router();

router.post('/page-context', async (req: Request, res: Response) => {
  try {
    const { url, title, html, tabId } = req.body;

    // Validate request
    if (!url || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    // Process with AGI engine
    const taskId = await processPageContext({
      url,
      title,
      html,
      tabId,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      taskId,
      actions: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/forms', async (req: Request, res: Response) => {
  try {
    const { url, forms } = req.body;

    // Analyze forms for patterns
    const analysis = analyzeFormPatterns(forms);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### Register in Main App

```typescript
import extensionRoutes from './routes/extension';

app.use('/api/extension', extensionRoutes);
```

## Security Considerations

### 1. CORS

**Extension requests** come from `chrome-extension://` origin.

**Desktop app CORS headers:**

```rust
// In Tauri app
use tauri::http::{ResponseBuilder};

// Allow extension origin
let response = ResponseBuilder::new()
    .header("Access-Control-Allow-Origin", "chrome-extension://*")
    .header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    .header("Access-Control-Allow-Headers", "Content-Type")
    .body(json.into());
```

### 2. Authentication

**Extension should include user token:**

```typescript
const token = await chrome.storage.local.get('authToken');

const response = await fetch('http://localhost:3001/api/extension/page-context', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.authToken}`,
  },
  body: JSON.stringify(context),
});
```

### 3. Rate Limiting

**Desktop app should enforce rate limits:**

```rust
use std::collections::HashMap;
use std::time::{Instant, Duration};

struct RateLimiter {
    limits: HashMap<String, (u32, Instant)>,
}

impl RateLimiter {
    fn is_limited(&mut self, key: &str, max_requests: u32, window: Duration) -> bool {
        let now = Instant::now();

        if let Some((count, start)) = self.limits.get_mut(key) {
            if now.duration_since(*start) > window {
                self.limits.remove(key);
                return false;
            }

            if *count >= max_requests {
                return true;
            }

            *count += 1;
        } else {
            self.limits.insert(key.to_string(), (1, now));
        }

        false
    }
}
```

### 4. Input Validation

**Validate HTML before storing:**

```rust
fn validate_html(html: &str) -> Result<(), String> {
    // Check size limit
    if html.len() > 100 * 1024 {
        return Err("HTML too large".to_string());
    }

    // Basic XSS check
    if html.contains("<script>") || html.contains("javascript:") {
        return Err("HTML contains scripts".to_string());
    }

    Ok(())
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│         Chrome Browser Extension                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │   Content    │  │ Background   │  │  Popup   │  │
│  │   Script     │──│   Service    │──│   UI     │  │
│  │              │  │   Worker     │  │          │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│         │                  │                        │
└─────────┼──────────────────┼────────────────────────┘
          │                  │
          │ Page Context     │ Health Check
          │ Forms            │ Task Results
          ▼                  ▼
      ┌─────────────────────────────────┐
      │   Tauri Desktop App             │
      │  ┌─────────────────────────────┐│
      │  │  HTTP Server (Port 3001)    ││
      │  │  ├─ /health                 ││
      │  │  ├─ /api/extension/*        ││
      │  └─────────────────────────────┘│
      │  ┌─────────────────────────────┐│
      │  │  AGI Engine                 ││
      │  │  ├─ Page Analysis           ││
      │  │  ├─ Form Understanding      ││
      │  │  └─ Action Planning         ││
      │  └─────────────────────────────┘│
      └─────────────────────────────────┘
```

## Testing the Integration

### 1. Manual Test

```bash
# Terminal 1: Start desktop app
pnpm dev:desktop

# Terminal 2: Build and load extension in Chrome
cd apps/extension
pnpm build
# Load dist/ folder in chrome://extensions

# Terminal 3: Open DevTools and test
chrome://extensions
# Click background page inspector to see logs
```

### 2. Test Page Context Submission

```javascript
// In extension popup console
const context = {
  url: window.location.href,
  title: document.title,
  html: document.documentElement.outerHTML,
  tabId: 1,
  timestamp: Date.now(),
};

fetch('http://localhost:3001/api/extension/page-context', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(context),
})
  .then((r) => r.json())
  .then(console.log);
```

### 3. Test Form Detection

```javascript
// In content script console
const forms = document.querySelectorAll('form');
const formData = Array.from(forms).map((form) => ({
  id: form.id,
  method: form.method,
  fields: Array.from(form.querySelectorAll('input, select, textarea')).map((f) => ({
    name: f.name,
    type: f.type,
    required: f.required,
  })),
}));

fetch('http://localhost:3001/api/extension/forms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: location.href, tabId: 1, forms: formData }),
})
  .then((r) => r.json())
  .then(console.log);
```

## Troubleshooting

### Extension can't reach desktop app

1. Verify desktop app is running: `curl http://localhost:3001/health`
2. Check firewall allows localhost connections
3. Verify correct port in extension config

### CORS errors

1. Add proper headers in Tauri response
2. Verify `Access-Control-Allow-Origin` includes `chrome-extension://*`
3. Check manifest allows localhost communication

### Forms not detected

1. Verify form elements have `name` attributes
2. Check console for JavaScript errors
3. Inspect form structure with DevTools

## Next Steps

1. Implement page context analysis in AGI engine
2. Add form pattern recognition
3. Integrate with conversation history
4. Add WebSocket support for real-time updates
5. Implement screenshot storage and versioning
6. Add undo support for automation actions
