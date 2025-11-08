# IMPLEMENTATION PLAN

## AGI Workforce Desktop - Critical Fixes

**Date:** January 2025  
**Based On:** COMPREHENSIVE_AUDIT_REPORT.md  
**Goal:** Make application **production-ready** with working function calling and tool execution

---

## 🎯 OBJECTIVE

**Transform the application from 75% complete to 100% production-ready** by:

1. Implementing Router Tool Executor (0% → 100%)
2. Enabling Chat Function Calling (Disabled → Enabled)
3. Adding Anthropic/Google Function Calling (OpenAI only → All 4 providers)
4. Consolidating tool executors (2 disconnected → 1 unified)
5. Implementing LLM sub-reasoning (Stub → Working)
6. Adding real resource monitoring (Placeholder → Real)

**Timeline:** 3-4 weeks for critical features  
**Success Metric:** User can chat with AGI and it will read files, automate UI, browse web, execute code using function calling across all LLM providers.

---

## 📋 PHASE 1: CRITICAL FIXES (Week 1) 🔴

**Goal:** Make function calling work end-to-end

### Task 1.1: Implement Router Tool Executor (Day 1-2) 🔴

**Priority:** CRITICAL  
**Estimated Time:** 12-16 hours  
**Complexity:** High

**Current State:**

- `router/tool_executor.rs` has 15 tools, all return "not yet implemented"
- `agi/executor.rs` has 10 tools, all **fully working**

**Plan:**

1. **Add `app_handle` to ToolExecutor struct** (1 hour)

   ```rust
   pub struct ToolExecutor {
       tool_registry: Arc<ToolRegistry>,
       app_handle: Option<tauri::AppHandle>, // Add this
   }

   impl ToolExecutor {
       pub fn new(tool_registry: Arc<ToolRegistry>, app_handle: Option<tauri::AppHandle>) -> Self {
           Self { tool_registry, app_handle }
       }
   }
   ```

2. **Implement `file_read` tool** (1 hour)

   ```rust
   "file_read" => {
       let path = args.get("path").and_then(|v| v.as_str())
           .ok_or_else(|| anyhow!("Missing path parameter"))?;
       let content = std::fs::read_to_string(path)?;
       Ok(ToolResult {
           success: true,
           data: json!({ "content": content, "path": path }),
           error: None,
           metadata: HashMap::new(),
       })
   }
   ```

3. **Implement `file_write` tool** (1 hour)

   ```rust
   "file_write" => {
       let path = args.get("path").and_then(|v| v.as_str())
           .ok_or_else(|| anyhow!("Missing path parameter"))?;
       let content = args.get("content").and_then(|v| v.as_str())
           .ok_or_else(|| anyhow!("Missing content parameter"))?;
       std::fs::write(path, content)?;
       Ok(ToolResult {
           success: true,
           data: json!({ "success": true, "path": path }),
           error: None,
           metadata: HashMap::new(),
       })
   }
   ```

4. **Implement UI automation tools** (2-3 hours)
   - Get `AutomationService` from `app_handle.state::<Arc<AutomationService>>()`
   - Copy logic from `agi/executor.rs` for:
     - `ui_screenshot` - call `automation.screen.capture_primary_screen()`
     - `ui_click` - call `automation.mouse.click()` or `automation.uia.invoke()`
     - `ui_type` - call `automation.keyboard.send_text()`

5. **Implement browser tools** (2-3 hours)
   - Get `BrowserStateWrapper` from `app_handle.state::<BrowserStateWrapper>()`
   - Copy logic from `agi/executor.rs` for:
     - `browser_navigate` - tab_manager.navigate()
     - `browser_click` - DomOperations::click_with_cdp()
     - `browser_extract` - DomOperations::get_text()

6. **Implement terminal tool** (1-2 hours)
   - Get `SessionManager` from `app_handle.state::<SessionManager>()`
   - Copy logic from `agi/executor.rs` for:
     - `code_execute` - session_manager.create_session() + send_input()

7. **Implement database tool** (1-2 hours)
   - Get `DatabaseState` from `app_handle.state::<DatabaseState>()`
   - Copy logic from `agi/executor.rs` for:
     - `db_query` - database_state.execute_query()

8. **Implement API tool** (1-2 hours)
   - Get `ApiState` from `app_handle.state::<ApiState>()`
   - Copy logic from `agi/executor.rs` for:
     - `api_call` - api_state.execute_request()

9. **Implement remaining tools** (2-3 hours)
   - `image_ocr` - call `automation::screen::perform_ocr()`
   - `code_analyze` - basic implementation or delegate to LLM
   - `llm_reason` - **defer to Task 2.3**
   - `email_send`, `calendar_create_event`, `cloud_upload`, `productivity_create_task`, `document_read` - basic implementations or stubs with error messages

**Files to Edit:**

- `apps/desktop/src-tauri/src/router/tool_executor.rs` (main implementation)

**Testing:**

```rust
#[cfg(test)]
mod tests {
    // Test each tool with mock parameters
    // Verify success/failure cases
    // Check error handling
}
```

**Success Criteria:**

- ✅ All 15 tools return real results (not "not yet implemented")
- ✅ At least 10 critical tools fully working (file, UI, browser, terminal, db, api)
- ✅ Tests pass for all implemented tools
- ✅ No compilation errors

---

### Task 1.2: Enable Chat Function Calling (Day 2-3) 🔴

**Priority:** CRITICAL  
**Estimated Time:** 8-10 hours  
**Complexity:** Medium

**Current State:**

- Tool definitions commented out in `chat.rs`
- Tool execution commented out in response handler
- `tools: None` in LLM request

**Plan:**

1. **Uncomment and fix tool definition code** (2 hours)

   ```rust
   // Get ToolRegistry from AGI state or create new one
   let tool_registry = Arc::new(ToolRegistry::new());

   // Create ToolExecutor with app_handle
   let tool_executor = ToolExecutor::new(
       tool_registry.clone(),
       Some(app_handle.clone())
   );

   // Get tool definitions (with optional filtering)
   let tool_definitions = tool_executor.get_tool_definitions(None);

   let llm_request = LLMRequest {
       messages: router_messages,
       model: request.model.clone(),
       stream: stream_mode,
       tools: Some(tool_definitions), // ✅ Enable tools
       tool_choice: Some(ToolChoice::Auto), // ✅ Let LLM decide
   };
   ```

2. **Implement tool execution loop** (4-5 hours)

   ```rust
   // After getting LLM response
   if let Some(tool_calls) = &route_outcome.response.tool_calls {
       tracing::info!("[Chat] LLM requested {} tool calls", tool_calls.len());

       // Execute each tool
       let mut tool_results = Vec::new();
       for tool_call in tool_calls {
           let result = tool_executor.execute_by_id(
               &tool_call.function.name,
               &tool_call.function.arguments
           ).await?;

           tool_results.push((tool_call.id.clone(), result));
       }

       // Add tool results to messages
       router_messages.push(RouterChatMessage {
           role: "assistant".to_string(),
           content: route_outcome.response.content.clone(),
           tool_calls: Some(tool_calls.clone()),
           tool_call_id: None,
       });

       for (tool_call_id, result) in tool_results {
           router_messages.push(RouterChatMessage {
               role: "tool".to_string(),
               content: serde_json::to_string(&result.data)?,
               tool_calls: None,
               tool_call_id: Some(tool_call_id),
           });
       }

       // Send follow-up request to LLM with tool results
       let follow_up_request = LLMRequest {
           messages: router_messages.clone(),
           model: request.model.clone(),
           stream: false, // Don't stream follow-up
           tools: Some(tool_definitions.clone()),
           tool_choice: Some(ToolChoice::Auto),
       };

       // Get final response after tool execution
       let final_outcome = router.invoke_candidate(&candidate, &follow_up_request).await?;

       // Use final_outcome as the response
       route_outcome = final_outcome;
   }
   ```

3. **Handle multi-turn tool conversations** (2 hours)
   - Support multiple rounds of tool calls (loop until finish_reason != "tool_calls")
   - Add max iteration limit (e.g., 5 turns) to prevent infinite loops
   - Store all tool calls and results in database

4. **Update database schema if needed** (1 hour)
   - Add `tool_calls` column to messages table (if not exists)
   - Store tool execution metadata

**Files to Edit:**

- `apps/desktop/src-tauri/src/commands/chat.rs` (main implementation)
- `apps/desktop/src-tauri/src/db/migrations.rs` (if schema update needed)

**Testing:**

- Manual test: Send "Read the file at C:\test.txt" and verify LLM calls `file_read` tool
- Manual test: Send "Click the Start button" and verify UI automation tool is called
- Manual test: Complex request requiring multiple tools

**Success Criteria:**

- ✅ Chat sends tool definitions to LLM
- ✅ Tool calls are executed and results returned
- ✅ Multi-turn conversations work (LLM → Tool → LLM → Response)
- ✅ Tool execution logged in database
- ✅ User sees final response after tool execution

---

### Task 1.3: Implement Anthropic Function Calling (Day 3-4) 🔴

**Priority:** HIGH  
**Estimated Time:** 8-10 hours  
**Complexity:** Medium-High

**Current State:**

- Anthropic provider has TODO comment for tool use
- Only OpenAI function calling implemented

**Plan:**

1. **Add tool definitions to Anthropic request** (2 hours)

   ```rust
   #[derive(Debug, Clone, Serialize)]
   struct AnthropicTool {
       name: String,
       description: String,
       input_schema: serde_json::Value, // JSON Schema
   }

   #[derive(Debug, Clone, Serialize)]
   struct AnthropicRequest {
       model: String,
       messages: Vec<AnthropicMessage>,
       max_tokens: Option<u32>,
       temperature: Option<f32>,
       stream: Option<bool>,
       tools: Option<Vec<AnthropicTool>>, // ✅ Add this
   }

   // In send_message()
   let anthropic_tools = request.tools.as_ref().map(|tools| {
       tools.iter().map(|tool| AnthropicTool {
           name: tool.function.name.clone(),
           description: tool.function.description.clone(),
           input_schema: tool.function.parameters.clone(),
       }).collect()
   });

   let anthropic_request = AnthropicRequest {
       // ... existing fields ...
       tools: anthropic_tools,
   };
   ```

2. **Parse tool_use blocks from response** (3-4 hours)

   ```rust
   #[derive(Debug, Clone, Deserialize)]
   struct AnthropicContent {
       #[serde(rename = "type")]
       content_type: String, // "text" or "tool_use"
       #[serde(skip_serializing_if = "Option::is_none")]
       text: Option<String>,
       #[serde(skip_serializing_if = "Option::is_none")]
       id: Option<String>, // tool_use block ID
       #[serde(skip_serializing_if = "Option::is_none")]
       name: Option<String>, // tool name
       #[serde(skip_serializing_if = "Option::is_none")]
       input: Option<serde_json::Value>, // tool parameters
   }

   // Parse response content array
   let mut text_content = String::new();
   let mut tool_calls = Vec::new();

   for block in anthropic_response.content {
       match block.content_type.as_str() {
           "text" => {
               if let Some(text) = block.text {
                   text_content.push_str(&text);
               }
           }
           "tool_use" => {
               tool_calls.push(ToolCall {
                   id: block.id.unwrap_or_default(),
                   call_type: "function".to_string(),
                   function: FunctionCall {
                       name: block.name.unwrap_or_default(),
                       arguments: serde_json::to_string(&block.input.unwrap_or(json!({})))?,
                   },
               });
           }
           _ => {}
       }
   }

   // Set finish_reason based on stop_reason
   let finish_reason = if !tool_calls.is_empty() {
       Some("tool_calls".to_string())
   } else {
       None
   };

   Ok(LLMResponse {
       content: text_content,
       tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
       finish_reason,
       // ... other fields ...
   })
   ```

3. **Handle tool_result blocks in follow-up messages** (2-3 hours)

   ```rust
   // Convert router messages with tool results to Anthropic format
   #[derive(Debug, Clone, Serialize)]
   struct AnthropicMessage {
       role: String,
       content: serde_json::Value, // Can be string or array of content blocks
   }

   let anthropic_messages = request.messages.iter().map(|msg| {
       if msg.role == "tool" {
           // Convert tool result to tool_result block
           AnthropicMessage {
               role: "user".to_string(), // Anthropic expects tool results from user
               content: json!([{
                   "type": "tool_result",
                   "tool_use_id": msg.tool_call_id.clone().unwrap_or_default(),
                   "content": msg.content.clone(),
               }]),
           }
       } else if msg.tool_calls.is_some() {
           // Convert assistant message with tool calls
           AnthropicMessage {
               role: "assistant".to_string(),
               content: json!(/* convert tool_calls to tool_use blocks */),
           }
       } else {
           // Regular message
           AnthropicMessage {
               role: msg.role.clone(),
               content: json!(msg.content.clone()),
           }
       }
   }).collect();
   ```

4. **Test with Anthropic API** (1-2 hours)
   - Verify tool definitions sent correctly
   - Verify tool_use blocks parsed correctly
   - Verify multi-turn conversations work

**Files to Edit:**

- `apps/desktop/src-tauri/src/router/providers/anthropic.rs`

**Success Criteria:**

- ✅ Anthropic accepts tool definitions in request
- ✅ Tool_use blocks parsed into ToolCall format
- ✅ Tool results sent back as tool_result blocks
- ✅ Multi-turn tool conversations work with Anthropic
- ✅ Feature parity with OpenAI function calling

---

### Task 1.4: Implement Google Function Calling (Day 4) 🟠

**Priority:** MEDIUM-HIGH  
**Estimated Time:** 6-8 hours  
**Complexity:** Medium

**Plan:** (Similar to Anthropic but with Google's function calling format)

1. Add `functionDeclarations` to Google request
2. Parse `functionCall` from response
3. Handle `functionResponse` in follow-up messages
4. Test with Google Gemini API

**Files to Edit:**

- `apps/desktop/src-tauri/src/router/providers/google.rs`

---

## 📋 PHASE 2: CONSOLIDATION (Week 2) 🟠

**Goal:** Unify architecture and reduce code duplication

### Task 2.1: Consolidate Tool Executors (Day 1-2) 🟡

**Priority:** HIGH  
**Estimated Time:** 12-16 hours  
**Complexity:** High

**Problem:**

- `agi/executor.rs` has 10 working tools
- `router/tool_executor.rs` now has 15 working tools (after Phase 1)
- Duplication of logic, maintenance burden

**Solution Options:**

**Option A: Make Router Tool Executor Primary** (Recommended)

- Move AGI Executor to use Router Tool Executor
- AGI calls `ToolExecutor::execute()` instead of its own `execute_tool()`
- Router Tool Executor becomes single source of truth

**Option B: Make AGI Executor Primary**

- Move Router Tool Executor logic to AGI Executor
- Router calls AGI Executor
- AGI Executor becomes single source of truth

**Option C: Create Shared Tool Implementation Layer**

- Extract tool implementations to `tools/implementations/`
- Both executors delegate to shared implementations
- More modular but more complex

**Recommended: Option A**

**Plan:**

1. **Update AGI Executor to use Router Tool Executor** (4 hours)

   ```rust
   // In agi/executor.rs
   pub struct AGIExecutor {
       tool_registry: Arc<ToolRegistry>,
       tool_executor: Arc<ToolExecutor>, // ✅ Add this
       _resource_manager: Arc<ResourceManager>,
       automation: Arc<AutomationService>,
       app_handle: Option<tauri::AppHandle>,
   }

   impl AGIExecutor {
       pub fn new(/* ... */) -> Result<Self> {
           let tool_executor = Arc::new(ToolExecutor::new(
               tool_registry.clone(),
               app_handle.clone(),
           ));

           Ok(Self {
               tool_registry,
               tool_executor, // ✅ Use Router Tool Executor
               // ...
           })
       }

       async fn execute_tool(/* ... */) -> Result<serde_json::Value> {
           // Delegate to Router Tool Executor
           let result = self.tool_executor.execute(tool, parameters).await?;

           if result.success {
               Ok(result.data)
           } else {
               Err(anyhow!("{}", result.error.unwrap_or_default()))
           }
       }
   }
   ```

2. **Remove duplicate tool implementations from AGI Executor** (2 hours)
   - Delete tool match arms (file*read, file_write, ui*_, browser\__, etc.)
   - Keep only delegation to Router Tool Executor

3. **Update AGI Executor tests** (2-3 hours)
   - Ensure tests still pass after consolidation
   - Mock Router Tool Executor if needed

4. **Verify AGI Core still works** (2-3 hours)
   - Test goal submission
   - Test tool execution
   - Test multi-step plans

**Files to Edit:**

- `apps/desktop/src-tauri/src/agi/executor.rs`
- `apps/desktop/src-tauri/src/agi/tests/executor_tests.rs`

**Success Criteria:**

- ✅ No code duplication between executors
- ✅ AGI Core uses Router Tool Executor
- ✅ All AGI tests pass
- ✅ Single source of truth for tool implementations

---

### Task 2.2: Implement LLM Sub-Reasoning (Day 3) 🟡

**Priority:** HIGH  
**Estimated Time:** 6-8 hours  
**Complexity:** Medium

**Plan:**

1. **Implement `llm_reason` tool in Router Tool Executor** (3-4 hours)

   ```rust
   "llm_reason" => {
       let prompt = args.get("prompt").and_then(|v| v.as_str())
           .ok_or_else(|| anyhow!("Missing prompt parameter"))?;
       let model = args.get("model").and_then(|v| v.as_str());
       let max_tokens = args.get("max_tokens").and_then(|v| v.as_u64()).map(|v| v as u32);

       if let Some(ref app) = self.app_handle {
           use tauri::Manager;
           let llm_state = app.state::<LLMState>();

           let llm_request = LLMRequest {
               messages: vec![RouterChatMessage {
                   role: "user".to_string(),
                   content: prompt.to_string(),
                   tool_calls: None,
                   tool_call_id: None,
               }],
               model: model.unwrap_or("gpt-4o-mini").to_string(),
               temperature: Some(0.7),
               max_tokens,
               stream: false,
               tools: None, // Don't allow recursive tool calling
               tool_choice: None,
           };

           let preferences = RouterPreferences::default();

           let router = llm_state.router.lock().await;
           let response = router.send_message(&llm_request, &preferences).await?;

           Ok(ToolResult {
               success: true,
               data: json!({
                   "reasoning": response.content,
                   "model": response.model,
                   "tokens": response.tokens,
               }),
               error: None,
               metadata: HashMap::new(),
           })
       } else {
           Err(anyhow!("App handle not available for llm_reason"))
       }
   }
   ```

2. **Add depth limit to prevent infinite recursion** (1 hour)
   - Add `depth` parameter to tool
   - Check depth < MAX_DEPTH (e.g., 3)
   - Return error if too deep

3. **Test recursive LLM calls** (2-3 hours)
   - Test single-level sub-reasoning
   - Test multi-level recursion
   - Test depth limit enforcement

**Files to Edit:**

- `apps/desktop/src-tauri/src/router/tool_executor.rs`

**Success Criteria:**

- ✅ `llm_reason` tool makes actual LLM calls
- ✅ Recursive depth limited to prevent infinite loops
- ✅ Chain-of-thought workflows possible

---

### Task 2.3: Real Resource Monitoring (Day 4) 🟡

**Priority:** MEDIUM-HIGH  
**Estimated Time:** 6-8 hours  
**Complexity:** Low-Medium

**Plan:**

1. **Use existing ResourceManager in Autonomous Agent** (2-3 hours)

   ```rust
   // In agent/autonomous.rs
   use crate::agi::ResourceManager;

   pub struct AutonomousAgent {
       config: AgentConfig,
       resource_manager: Arc<ResourceManager>, // ✅ Add this
       // ...
   }

   impl AutonomousAgent {
       pub fn new(/* ... */, resource_manager: Arc<ResourceManager>) -> Result<Self> {
           Ok(Self {
               config,
               resource_manager, // ✅ Use real resource manager
               // ...
           })
       }

       async fn check_resources(&self) -> bool {
           // Get current resource usage
           let current = self.resource_manager.current();

           // Check against limits
           let limits = &self.config.resource_limits;

           if current.cpu_percent > limits.cpu_percent {
               tracing::warn!("[Agent] CPU usage {:.1}% exceeds limit {:.1}%",
                   current.cpu_percent, limits.cpu_percent);
               return false;
           }

           if current.memory_mb > limits.memory_mb {
               tracing::warn!("[Agent] Memory usage {} MB exceeds limit {} MB",
                   current.memory_mb, limits.memory_mb);
               return false;
           }

           true // Resources available
       }
   }
   ```

2. **Add backpressure when resources exhausted** (2 hours)
   - Pause task processing if resources exceeded
   - Wait for resources to free up
   - Resume when resources available

3. **Test resource limits** (2-3 hours)
   - Test CPU limit enforcement
   - Test memory limit enforcement
   - Test backpressure behavior

**Files to Edit:**

- `apps/desktop/src-tauri/src/agent/autonomous.rs`
- `apps/desktop/src-tauri/src/commands/agent.rs` (pass ResourceManager)

**Success Criteria:**

- ✅ Real CPU/memory monitoring (not placeholder)
- ✅ Tasks paused when resources exhausted
- ✅ Backpressure prevents system overload

---

## 📋 PHASE 3: POLISH (Week 3-4) 🟢

**Goal:** Address remaining TODOs and improve quality

### Task 3.1: Address High-Priority TODOs (Week 3) 🟢

**Plan:**

- Review all 258 TODOs
- Prioritize by impact and fix top 50
- Document "wontfix" items

### Task 3.2: Complete MCP Implementations (Week 3-4) 🟢

**Plan:**

- Complete contacts module (20 TODOs)
- Complete productivity tools (18 TODOs)
- Fill document processing gaps

### Task 3.3: Comprehensive Testing (Week 4) 🟢

**Plan:**

- Integration tests for each tool
- End-to-end AGI workflows
- Multi-provider function calling tests
- Re-enable disabled tests

---

## ✅ SUCCESS CRITERIA

### Phase 1 Complete When:

- [ ] Router Tool Executor: 15/15 tools implemented ✅
- [ ] Chat function calling enabled and working ✅
- [ ] Anthropic function calling implemented ✅
- [ ] Google function calling implemented ✅
- [ ] User can send "Read file X" and LLM calls tool ✅

### Phase 2 Complete When:

- [ ] Tool executors consolidated (no duplication) ✅
- [ ] `llm_reason` tool works (recursive LLM calls) ✅
- [ ] Real resource monitoring (not placeholder) ✅
- [ ] AGI system works end-to-end ✅

### Phase 3 Complete When:

- [ ] < 50 critical TODOs remaining ✅
- [ ] All integration tests passing ✅
- [ ] Documentation updated ✅
- [ ] Application production-ready ✅

---

## 📊 PROGRESS TRACKING

| Phase                                | Tasks | Status         | ETA      |
| ------------------------------------ | ----- | -------------- | -------- |
| **Phase 1: Critical Fixes**          | 4     | ⏳ Not Started | Week 1   |
| Task 1.1: Router Tool Executor       | 1     | ⏳ Not Started | Day 1-2  |
| Task 1.2: Chat Function Calling      | 1     | ⏳ Not Started | Day 2-3  |
| Task 1.3: Anthropic Function Calling | 1     | ⏳ Not Started | Day 3-4  |
| Task 1.4: Google Function Calling    | 1     | ⏳ Not Started | Day 4    |
| **Phase 2: Consolidation**           | 3     | ⏳ Not Started | Week 2   |
| Task 2.1: Consolidate Executors      | 1     | ⏳ Not Started | Day 1-2  |
| Task 2.2: LLM Sub-Reasoning          | 1     | ⏳ Not Started | Day 3    |
| Task 2.3: Real Resource Monitoring   | 1     | ⏳ Not Started | Day 4    |
| **Phase 3: Polish**                  | 3     | ⏳ Not Started | Week 3-4 |
| Task 3.1: High-Priority TODOs        | 1     | ⏳ Not Started | Week 3   |
| Task 3.2: Complete MCPs              | 1     | ⏳ Not Started | Week 3-4 |
| Task 3.3: Comprehensive Testing      | 1     | ⏳ Not Started | Week 4   |

---

**Next Steps:**

1. Review and approve this implementation plan
2. Begin Phase 1, Task 1.1 (Implement Router Tool Executor)
3. Track progress daily
4. Update this document as tasks complete

**End Goal:** A production-ready AGI desktop application where users can chat with the AI and it autonomously executes tasks using function calling across all LLM providers.
