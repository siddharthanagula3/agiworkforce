# AGI Workforce Mobile (Expo 55 + RN 0.84) — THINKING Display, Settings Architecture & CLOUD-vs-LOCAL Feature Spec

Status: Active plan
Owner: founder + platform
Last updated: 2026-05-31

## 1. THINKING / REASONING DISPLAY SPECIFICATION

### Current Leading Pattern (Claude iOS, ChatGPT iOS, Gemini iOS)

**Display Approach:**

- **Collapse-by-default**: Reasoning shown as summarized chip/badge above response message
- **Expandable**: Tap chip → bottom sheet modal reveals full reasoning text
- **No step-by-step streaming**: Reasoning displayed as linear prose, not token-by-token or phase-by-phase
- **Indicator**: Clock icon + truncated text preview ("The user is asking whether...")
- **Sheet interaction**: Full-height draggable modal with X dismiss button; scrollable prose content

**Exact References:**

- `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/24_chat_thread-reasoning-chip-reply-composer.png` — Clock icon chip, collapsible, inline with response
- `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/25_chat_thought-process-sheet-overview.png` — Expanded modal, title "Thought process", scrollable text
- `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/26_chat_thought-process-sheet-expanded.png` — Full reasoning content visible, multi-paragraph prose
- `/Users/siddhartha/Desktop/reference/ui/mobile/chatgpt-ios/11_apple-intelligence_chatgpt-extension-model-thinking-effort.png` — "Intelligence" modal with Thinking effort dropdown (Standard, implied higher levels)

### What AGI Mobile Builds

**Implementation Plan:**

| Component                      | Spec                                                                                                   | Status  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------- |
| **Thinking Toggle (Composer)** | Model dropdown or separate toggle in model picker (not in composer bar like Perplexity)                | Pending |
| **Thinking Indicator Chip**    | Clock icon + truncated reasoning preview (<60 chars) inline with first response message                | Pending |
| **Thinking Effort Control**    | Settings > Capabilities > Extended Thinking > dropdown (Standard / Advanced / Ultra) — NOT per-message | Pending |
| **Reasoning Sheet (Modal)**    | Title "Thought process", X dismiss, scrollable full reasoning text, no copy/share action initially     | Pending |
| **Thinking Display (API)**     | Use Claude API `display: 'summarized'` (default) or implement custom truncation for other models       | Pending |
| **Streaming Thinking**         | NOT implemented initially; thinking displayed after response complete (batch API response)             | Pending |
| **No step-by-step breakdown**  | Reasoning shown as continuous prose, not labeled phases (Phase 1, Phase 2, etc.)                       | Pending |

---

## 2. SETTINGS INFORMATION ARCHITECTURE (Full Map + Proposed AGI Mobile)

### Claude iOS Settings (Reference IA)

**Location:** Modal sheet, accessed via drawer > Settings icon

**Layout Order (Top to Bottom):**

| Row                      | Component          | Value/Control                                                              | Tag    |
| ------------------------ | ------------------ | -------------------------------------------------------------------------- | ------ |
| **ACCOUNT SECTION**      |
| —                        | User Email Display | `siddharthanagula3@gmail.com`                                              | LOCAL  |
| 1                        | Profile            | Chevron → nested screen                                                    | CLOUD  |
| 2                        | Billing            | Badge "Max plan" + chevron                                                 | CLOUD  |
| 3                        | Usage              | Chevron (token quota display)                                              | CLOUD  |
| **CAPABILITIES SECTION** |
| 4                        | Capabilities       | Chevron → nested toggles (Artifacts, Code, Web search, Memory, Tools)      | HYBRID |
| 5                        | Connectors         | Chevron → nested list (Drive, Gmail, Vercel, Calendar, n8n)                | CLOUD  |
| **DEVICE SECTION**       |
| 6                        | Permissions        | Chevron → nested OS permissions (Location, Calendar, Reminders, Health)    | LOCAL  |
| 7                        | Appearance         | Toggle "Dark" + dropdown (Dark/Light/System)                               | LOCAL  |
| 8                        | Speech language    | "EN" + chevron (language selector)                                         | LOCAL  |
| **NOTIFS & PRIVACY**     |
| 9                        | Notifications      | Chevron → nested toggles (Research complete, Chat responses, Code updates) | HYBRID |
| 10                       | Privacy            | Chevron (data policies, opt-outs)                                          | CLOUD  |
| 11                       | Shared links       | Chevron → view shared conversations                                        | CLOUD  |
| **ACCESSIBILITY**        |
| 12                       | Haptic feedback    | Toggle ON/OFF (green when enabled)                                         | LOCAL  |

**Nested Screens (accessed via chevron):**

#### Capabilities Sub-Screen

| Row | Component                             | Control                                                                                                                     | Tag   |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| —   | Header "Capabilities" with back arrow | Back navigation                                                                                                             | LOCAL |
| 1   | Artifacts                             | Toggle ON, description "Required for artifact execution"                                                                    | CLOUD |
| 2   | Code execution and file creation      | Toggle ON, description "Allow Claude to execute code and create/edit docs, spreadsheets, presentations, PDFs, data reports" | CLOUD |
| 3   | Web search                            | Toggle ON, description "Claude will automatically search the web when it determines it needs current information"           | CLOUD |
| —   | **MEMORY SECTION**                    | —                                                                                                                           | —     |
| 4   | Search and reference chats            | Toggle ON, description "Allow Claude to search for relevant details in past chats"                                          | CLOUD |
| 5   | Generate memory from chat history     | Toggle ON, description "Allow Claude to remember relevant context from your chats and projects"                             | CLOUD |
| 6   | View your memory                      | Link with chevron, note "Updated 2d ago from your chats"                                                                    | CLOUD |
| —   | **TOOL ACCESS SECTION**               | —                                                                                                                           | —     |
| 7   | Auto                                  | Radio button (selected), description "Claude chooses for you"                                                               | LOCAL |
| 8   | On demand                             | Radio button, description "Load when needed. More messages, lower accuracy"                                                 | LOCAL |
| 9   | Always available                      | Radio button, description (implied)                                                                                         | LOCAL |

#### Connectors Sub-Screen

| Row | Component                           | Control                                                                                                                        | Tag   |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| —   | Header "Connectors" with back arrow | Back navigation                                                                                                                | CLOUD |
| 1   | Drive search                        | Toggle ON (enabled), description "Claude will automatically search your connected Google Drive account for relevant documents" | CLOUD |
| 2   | Gmail                               | Chevron (detail view), disabled toggle                                                                                         | CLOUD |
| 3   | Vercel                              | Chevron (detail view), disabled toggle                                                                                         | CLOUD |
| 4   | Google Calendar                     | "Connect" button (external link icon)                                                                                          | CLOUD |
| 5   | n8n                                 | "Connect" button (external link icon)                                                                                          | CLOUD |

#### Permissions Sub-Screen

| Row | Component                            | Control                                                     | Tag   |
| --- | ------------------------------------ | ----------------------------------------------------------- | ----- |
| —   | Header "Permissions" with back arrow | Back navigation                                             | LOCAL |
| 1   | Location                             | Text "Read only", chevron → native iOS permission detail    | LOCAL |
| 2   | Calendar                             | Text "Read & write", chevron → native iOS permission detail | LOCAL |
| 3   | Reminders                            | Text "Read & write", chevron → native iOS permission detail | LOCAL |
| 4   | Health                               | Text "Never", chevron → native iOS permission detail        | LOCAL |

#### Profile Sub-Screen

| Row | Component                        | Control                                                                                      | Tag   |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| —   | Header "Profile" with back arrow | Back navigation                                                                              | LOCAL |
| 1   | Full Name                        | Text input (value: "Siddhartha Nagula")                                                      | CLOUD |
| 2   | Nickname                         | Text input (value: "Siddhartha Nagula")                                                      | CLOUD |
| 3   | Update Profile                   | Button (save changes)                                                                        | CLOUD |
| 4   | Personal Preferences             | Text area (placeholder: "When learning new concepts, I find analogies particularly helpful") | CLOUD |
| 5   | Save Preferences                 | Button (save custom instructions)                                                            | CLOUD |
| 6   | Delete account                   | Link (red, destructive)                                                                      | CLOUD |

#### Notifications Sub-Screen

| Row | Component                              | Control                                                               | Tag   |
| --- | -------------------------------------- | --------------------------------------------------------------------- | ----- |
| —   | Header "Notifications" with back arrow | Back navigation                                                       | LOCAL |
| 1   | Research complete                      | Toggle ON, description "Get notified when research completes"         | CLOUD |
| 2   | Chat responses                         | Toggle ON, description "Get notified when chat completes"             | CLOUD |
| 3   | Code updates                           | Toggle ON, description "Get notified when Code sessions have updates" | CLOUD |

---

### ChatGPT iOS Settings (Reference IA)

**Location:** Modal sheet via 3-dot menu > Settings

**Layout Order (Top to Bottom):**

| Section             | Row | Component                            | Value/Control                                                                                                                       | Tag   |
| ------------------- | --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **ACCOUNT**         | —   | Profile card (avatar + name + email) | "SIDDHARTHA NAGULA" + "nagulasiddhartha2@gmail.com"                                                                                 | CLOUD |
|                     | 1   | Edit profile                         | Link → nested form                                                                                                                  | CLOUD |
|                     | 2   | Email                                | Display value                                                                                                                       | CLOUD |
|                     | 3   | Phone number                         | Display value                                                                                                                       | CLOUD |
|                     | 4   | Subscription                         | Badge "ChatGPT Plus"                                                                                                                | CLOUD |
|                     | 5   | Upgrade to ChatGPT Pro               | Link (blue CTA)                                                                                                                     | CLOUD |
|                     | 6   | Restore purchases                    | Link                                                                                                                                | CLOUD |
|                     | 7   | Orders                               | Chevron → order history                                                                                                             | CLOUD |
| **PERSONALIZATION** | 8   | Personalization                      | Chevron → custom instructions, memory, tone, characteristics                                                                        | CLOUD |
| **APP**             | 9   | App language                         | "English" + chevron                                                                                                                 | LOCAL |
|                     | 10  | Appearance                           | "System" + chevron (Dark/Light/System radio)                                                                                        | LOCAL |
|                     | 11  | Accent color                         | Circle indicator "Default"                                                                                                          | LOCAL |
|                     | 12  | Haptic feedback                      | Toggle ON (green)                                                                                                                   | LOCAL |
|                     | 13  | Correct spelling automatically       | Toggle ON (green)                                                                                                                   | LOCAL |
| **SPEECH**          | 14  | Main language                        | Dropdown with note "For best results, speak the language..."                                                                        | LOCAL |
|                     | 15  | Voice                                | "Spruce" + chevron (TTS voice selector)                                                                                             | LOCAL |
| **VOICE MODE**      | 16  | Separate mode                        | Toggle OFF                                                                                                                          | LOCAL |
|                     | 17  | Background conversations             | Toggle OFF, description "Background conversations keeps the conversation going in other apps or while screen is locked. Learn more" | CLOUD |
| **SUGGESTIONS**     | 18  | Autocomplete                         | Toggle ON (green)                                                                                                                   | LOCAL |
|                     | 19  | Trending searches                    | Toggle ON                                                                                                                           | LOCAL |
|                     | 20  | Follow-up suggestions                | Toggle ON                                                                                                                           | LOCAL |
| **SUPPORT**         | 21  | Report bug                           | Chevron → bug report form                                                                                                           | LOCAL |
|                     | 22  | Help Center                          | Link (external)                                                                                                                     | CLOUD |
|                     | 23  | Terms of Use                         | Link (external)                                                                                                                     | CLOUD |
|                     | 24  | Privacy Policy                       | Link (external)                                                                                                                     | CLOUD |
|                     | 25  | Log out                              | Button (red, destructive)                                                                                                           | CLOUD |

#### Personalization Sub-Screen (ChatGPT)

| Row | Component                                        | Control                                                                                                     | Tag   |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----- |
| —   | Header "Personalization" with back + Save button | Navigation + save action                                                                                    | CLOUD |
| 1   | Base style and tone                              | Dropdown "Default", description about voice/tone not impacting capabilities                                 | CLOUD |
| 2   | Warm                                             | Dropdown "Default"                                                                                          | CLOUD |
| 3   | Enthusiastic                                     | Dropdown "Default"                                                                                          | CLOUD |
| 4   | Headers & Lists                                  | Dropdown "Default"                                                                                          | CLOUD |
| 5   | Emoji                                            | Dropdown "Default", description "Choose additional customizations on top of base style and tone"            | CLOUD |
| 6   | Custom instructions                              | Text area (placeholder: "Share anything else you'd like ChatGPT to...")                                     | CLOUD |
| 7   | Your nickname                                    | Text input (value: "Name" placeholder)                                                                      | CLOUD |
| 8   | Your occupation                                  | Text input (placeholder: "Engineer, student, etc.")                                                         | CLOUD |
| 9   | More about you                                   | Text area (placeholder: "Interests, values, or preferences to keep in...")                                  | CLOUD |
| 10  | Manage memories                                  | Link + description "ChatGPT may add details from your recent queries to search prompts...", Learn more link | CLOUD |
| 11  | Reference saved memories                         | Toggle ON, description "Lets ChatGPT save and use memories when responding"                                 | CLOUD |
| 12  | Reference chat history                           | Toggle ON, description "Lets ChatGPT reference recent conversations when responding"                        | CLOUD |
| 13  | Advanced                                         | Expandable section with chevron                                                                             | CLOUD |

---

### **Proposed AGI Workforce Mobile Settings IA**

**Location:** Drawer nav item "Settings" → modal sheet (primary) or full-screen (iPad)

**Primary Settings Screen (Index):**

| Section                     | Row | Component                 | Control                                              | Tag    | Notes                                                      |
| --------------------------- | --- | ------------------------- | ---------------------------------------------------- | ------ | ---------------------------------------------------------- |
| **ACCOUNT**                 | —   | User Email Header         | `user@agiworkforce.com`                              | CLOUD  | Read-only display                                          |
|                             | 1   | Profile                   | Chevron → nested                                     | CLOUD  | Edit name, avatar, bio                                     |
|                             | 2   | Billing & Subscription    | Badge (e.g., "Max") + chevron                        | CLOUD  | Tier, usage, upgrade CTA                                   |
|                             | 3   | Usage & Limits            | Chevron → quota display                              | CLOUD  | Token/image/API calls per plan                             |
| **CAPABILITIES**            | 4   | Model & Thinking          | Chevron → model selector + effort dropdown           | HYBRID | Local model picker, cloud reasoning control                |
|                             | 5   | Capabilities              | Chevron → feature toggles                            | HYBRID | Artifacts, Code exec, Web search, Memory, Tools            |
|                             | 6   | Connectors / Integrations | Chevron → MCP list                                   | CLOUD  | Drive, Gmail, Slack, GitHub, custom MCP                    |
|                             | 7   | Voice & Language          | Chevron → TTS voice, input language, speech settings | HYBRID | Local: voice selection; Cloud: TTS synthesis               |
| **DEVICE**                  | 8   | Permissions               | Chevron → OS permissions map                         | LOCAL  | Camera, microphone, photos, location, calendar, health     |
|                             | 9   | Appearance                | Toggle "Dark" + dropdown (Dark/Light/System)         | LOCAL  | Theme selector                                             |
|                             | 10  | Downloads & Storage       | Chevron → installed model manager                    | LOCAL  | GGUF models, size, delete button                           |
|                             | 11  | Performance               | Chevron → advanced device settings                   | LOCAL  | Token/sec display, quantization level, GPU toggle (future) |
| **PRIVACY & NOTIFICATIONS** | 12  | Notifications             | Chevron → toggle by type                             | HYBRID | Research complete, message, reminder, device access        |
|                             | 13  | Privacy & Data            | Chevron → privacy policies, data export              | CLOUD  | CloudFlare, cross-device sync toggle, cache clear          |
|                             | 14  | Memory Import             | Chevron → custom instructions, previous chat import  | CLOUD  | Import Claude/ChatGPT memory format                        |
| **ADVANCED**                | 15  | Auto-Approve Mode         | Toggle ON/OFF                                        | CLOUD  | Auto-execute low-risk agent actions                        |
|                             | 16  | Experimental Features     | Chevron → labs, feature flags                        | HYBRID | Early access toggle for new features                       |
|                             | 17  | Shared Links & History    | Chevron → manage shared conversations                | CLOUD  | View, delete, export shared chats                          |
|                             | 18  | Feedback & Telemetry      | Chevron + Toggle "Send diagnostic data"              | CLOUD  | Report bug, telemetry opt-out                              |
| **APP**                     | 19  | About & Version           | Chevron → app version, credits, links                | LOCAL  | Build number, GitHub repo link, social                     |
|                             | 20  | Haptic Feedback           | Toggle ON/OFF                                        | LOCAL  | Device haptics for actions                                 |
|                             | 21  | Log Out                   | Button (red, destructive)                            | CLOUD  | Sign out + clear local cache                               |

**Nested Screens (Proposed):**

#### Model & Thinking Selection

| Row | Component                           | Control                                                                                                  | Tag    |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| —   | Header "Model & Thinking" with back | Navigation                                                                                               | HYBRID |
| 1   | **LOCAL MODELS** (section)          | —                                                                                                        | —      |
| 2a  | Llama 3.2 1B                        | Radio (selected), size "1.2 GB", tokens/sec "12-15"                                                      | LOCAL  |
| 2b  | Llama 3.2 3B                        | Radio, size "3.5 GB", tokens/sec "8-12"                                                                  | LOCAL  |
| 2c  | Phi-4 Mini                          | Radio, size "2.4 GB", tokens/sec "14-18"                                                                 | LOCAL  |
| 2d  | Gemma 4 E2B                         | Radio, size "2.1 GB", tokens/sec "13-16"                                                                 | LOCAL  |
| 2e  | Download Model                      | Link → Hugging Face registry                                                                             | LOCAL  |
| 2f  | Manage Downloads                    | Link → storage manager                                                                                   | LOCAL  |
| 3   | **CLOUD MODELS** (section)          | —                                                                                                        | —      |
| 3a  | Claude 3.5 Opus                     | Radio, badge "Pro+", chevron detail                                                                      | CLOUD  |
| 3b  | GPT-5                               | Radio, badge "Pro", chevron detail                                                                       | CLOUD  |
| 3c  | Gemini 3 Pro                        | Radio, badge "Free+"                                                                                     | CLOUD  |
| 4   | **THINKING MODE**                   | —                                                                                                        | —      |
| 4a  | Enable Extended Thinking            | Toggle ON, description "Enables advanced reasoning (slower, more tokens, cloud-only)"                    | CLOUD  |
| 4b  | Thinking Effort                     | Dropdown "Standard" (Standard/Advanced/Ultra), description "More effort = slower, more reasoning tokens" | CLOUD  |
| 4c  | Display Thinking                    | Toggle ON, description "Show reasoning chip + expandable modal"                                          | CLOUD  |

#### Capabilities

| Row | Component                       | Control                                                                        | Tag    |
| --- | ------------------------------- | ------------------------------------------------------------------------------ | ------ |
| —   | Header "Capabilities" with back | Navigation                                                                     | HYBRID |
| 1   | Artifacts                       | Toggle ON, description "Generate code, SVG, React components, docs"            | HYBRID |
| 2   | Code Execution                  | Toggle ON, description "Execute code in sandboxed environment (server-side)"   | CLOUD  |
| 3   | Web Search                      | Toggle ON, description "Search the web when needed (CLOUD)"                    | CLOUD  |
| 4   | Image Analysis                  | Toggle ON, description "Analyze photos, screenshots, charts"                   | HYBRID |
| 5   | Image Generation                | Toggle ON, description "Generate images (CLOUD, requires cloud model)"         | CLOUD  |
| 6   | Document Upload & RAG           | Toggle ON, description "Upload PDF, CSV, code files for context"               | HYBRID |
| 7   | **MEMORY SECTION**              | —                                                                              | —      |
| 8   | Search & Reference Chats        | Toggle ON, description "Allow model to search past chats for context"          | CLOUD  |
| 9   | Generate Memory                 | Toggle ON, description "Auto-generate summaries of important facts from chats" | CLOUD  |
| 10  | View Memories                   | Link → memory browser                                                          | CLOUD  |
| 11  | **TOOL ACCESS**                 | —                                                                              | —      |
| 12  | Auto                            | Radio (selected), description "Model decides when to use tools"                | LOCAL  |
| 13  | On Demand                       | Radio, description "Ask user before using tools"                               | LOCAL  |
| 14  | Always Available                | Radio, description "Tools always loaded (slower, higher accuracy)"             | LOCAL  |

#### Connectors / Integrations

| Row | Component                     | Control                                                                      | Tag   |
| --- | ----------------------------- | ---------------------------------------------------------------------------- | ----- |
| —   | Header "Connectors" with back | Navigation                                                                   | CLOUD |
| 1   | **ENABLED** (section)         | —                                                                            | —     |
| 1a  | Google Drive                  | Toggle ON, description "Search docs in Drive", icon (Google)                 | CLOUD |
| 1b  | Gmail                         | Toggle ON, description "Access emails for context", icon, "Disconnect" link  | CLOUD |
| 1c  | Slack                         | Toggle ON, description "Fetch messages from Slack channels", disconnect link | CLOUD |
| 2   | **AVAILABLE** (section)       | —                                                                            | —     |
| 2a  | GitHub                        | Button "Connect", chevron                                                    | CLOUD |
| 2b  | Google Calendar               | Button "Connect", description "Read events for scheduling"                   | CLOUD |
| 2c  | Notion                        | Button "Connect"                                                             | CLOUD |
| 2d  | Zapier / n8n                  | Button "Connect"                                                             | CLOUD |
| 3   | Custom MCP                    | Button "Add Custom MCP", link to registry                                    | CLOUD |

#### Voice & Language

| Row | Component                           | Control                                                                                                          | Tag    |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| —   | Header "Voice & Language" with back | Navigation                                                                                                       | HYBRID |
| 1   | Input Language                      | Dropdown "English", description "Language for speech-to-text"                                                    | LOCAL  |
| 2   | Voice Output                        | Dropdown "Buttery" (list: Buttery, Airy, Mellow, Glassy, Rounded), description "Voice for text-to-speech output" | HYBRID |
| 3   | TTS Engine                          | Radio "Local (Piper)" / Radio "Cloud (Google)"                                                                   | HYBRID |
| 4   | Whisper Model                       | Radio "Base" (300MB, faster) / Radio "Medium" (800MB, more accurate)                                             | LOCAL  |
| 5   | Real-Time Voice Mode                | Toggle ON, description "Stream voice input/output (cloud-only, requires Pro)"                                    | CLOUD  |
| 6   | Push-to-Talk                        | Toggle ON, description "Hold space bar to record (mobile only)"                                                  | LOCAL  |

#### Permissions

| Row | Component                      | Control                                                                                      | Tag   |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------- | ----- |
| —   | Header "Permissions" with back | Navigation                                                                                   | LOCAL |
| 1   | Microphone                     | Radio "Always allow" / "Ask each time" / "Never allow"                                       | LOCAL |
| 2   | Camera                         | Radio "Always allow" / "Ask each time" / "Never allow"                                       | LOCAL |
| 3   | Photos                         | Radio "All photos" / "Ask each time" / "Never allow"                                         | LOCAL |
| 4   | Location                       | Radio "Always allow" / "Ask each time" / "Never allow"                                       | LOCAL |
| 5   | Calendar                       | Radio "Allow" / "Never allow"                                                                | LOCAL |
| 6   | Reminders                      | Radio "Allow" / "Never allow"                                                                | LOCAL |
| 7   | Health Data                    | Radio "Allow" / "Never allow", note "Share fitness, sleep, activity with model for insights" | LOCAL |
| 8   | Bluetooth                      | Radio "Allow" / "Never allow"                                                                | LOCAL |

#### Downloads & Storage

| Row | Component                              | Control                                                               | Tag   |
| --- | -------------------------------------- | --------------------------------------------------------------------- | ----- |
| —   | Header "Downloads & Storage" with back | Navigation                                                            | LOCAL |
| 1   | Storage Usage                          | Progress bar "2.5 / 10 GB", text "App storage"                        | LOCAL |
| 2   | Installed Models                       | List section                                                          | —     |
| 2a  | Llama 3.2 1B                           | Card: name, size "1.2 GB", quantization "Q4_K_M", delete button (red) | LOCAL |
| 2b  | Gemma 4 E2B                            | Card: name, size "2.1 GB", quantization "Q4_K_M", delete button       | LOCAL |
| 3   | Download New Model                     | Button → model browser (Hugging Face registry filtered)               | LOCAL |
| 4   | Auto-Delete Old Models                 | Toggle ON, description "Delete least-used models when space low"      | LOCAL |

#### Performance

| Row | Component                      | Control                                                                      | Tag   |
| --- | ------------------------------ | ---------------------------------------------------------------------------- | ----- |
| —   | Header "Performance" with back | Navigation                                                                   | LOCAL |
| 1   | Display Tokens/sec             | Toggle ON, description "Show model speed in chat"                            | LOCAL |
| 2   | Quantization Level             | Dropdown "Q4_K_M" (Q4_K_M / Q5_K_M / Q8_0)                                   | LOCAL |
| 3   | Max Context Window             | Dropdown "4096" tokens (1024 / 2048 / 4096 / 8192)                           | LOCAL |
| 4   | Temperature                    | Slider 0.0 - 2.0, default 0.8, description "Higher = more creative"          | LOCAL |
| 5   | Top-K                          | Slider 1 - 100, default 40                                                   | LOCAL |
| 6   | Top-P                          | Slider 0.0 - 1.0, default 0.9                                                | LOCAL |
| 7   | Max Tokens / Response          | Slider 50 - 4096, default 512                                                | LOCAL |
| 8   | Batch Size                     | Dropdown "8" (auto / 1 / 4 / 8 / 16), note "Higher = faster but more memory" | LOCAL |
| 9   | GPU Acceleration               | Toggle (greyed if not supported), description "Use Metal GPU (iPhone 13+)"   | LOCAL |

#### Privacy & Data

| Row | Component                         | Control                                                                                 | Tag   |
| --- | --------------------------------- | --------------------------------------------------------------------------------------- | ----- |
| —   | Header "Privacy & Data" with back | Navigation                                                                              | CLOUD |
| 1   | Cross-Device Sync                 | Toggle ON, description "Sync chats, settings, memory across devices (requires account)" | CLOUD |
| 2   | Chat History Retention            | Dropdown "Forever" (Forever / 30 days / 7 days / 1 day)                                 | CLOUD |
| 3   | Clear Cache                       | Button "Clear All", description "Clears temporary files, not chat history"              | LOCAL |
| 4   | Data Export                       | Button "Export as JSON", description "Download all chats in JSON format"                | CLOUD |
| 5   | Delete All Data                   | Button (red, destructive), description "Permanently delete all chats, settings, models" | LOCAL |
| 6   | Privacy Policy                    | Link (external)                                                                         | CLOUD |
| 7   | Terms of Service                  | Link (external)                                                                         | CLOUD |

---

## 3. PER-SCREEN COMPONENT/LAYOUT BUILD CHECKLIST

### Chat Screen (Home Landing / Composer-First)

**Route:** `/(app)/(tabs)/chat`  
**Purpose:** Primary chat interface, empty state → message thread

**Components & Layout:**

| Element                             | Component                                 | Spec                                                                                                                                                    | Status     |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Header / Safe Area**              | SafeAreaView                              | Top safe area inset (notch/island)                                                                                                                      | ✅ Partial |
| **Header Bar**                      | HStack                                    | Menu icon (hamburger), center text ("Chat" or project name), right actions (settings gear, more menu)                                                   | ✅ Partial |
| **Menu Icon**                       | MenuIcon (lucide)                         | Opens drawer navigation                                                                                                                                 | ✅ Partial |
| **Project Selector**                | ProjectSelectorBar                        | Dropdown showing current project (if multi-project), sticky below header                                                                                | ❌ Missing |
| **Empty State**                     | VStack                                    | Centered greeting ("How can I help you this morning?"), optional suggestion chips (2-3 cards with icon + text + descriptor)                             | ❌ Missing |
| **Message Thread**                  | ScrollView                                | VStack of message bubbles (user on right, assistant on left); assistant bubbles include model badge, thinking chip (if applicable), streaming indicator | ✅ Partial |
| **Thinking Indicator Chip**         | HStack                                    | Clock icon + truncated reasoning text + ">" arrow, collapsible, tappable to expand sheet                                                                | ❌ Missing |
| **Message Actions**                 | Context menu (long-press)                 | Share, edit, copy, delete, mark helpful/unhelpful                                                                                                       | ❌ Missing |
| **Composer Bar (Bottom Safe Area)** | HStack (sticky)                           | Text input field, + icon (FAB menu), microphone icon (voice), attachment preview bar                                                                    | ✅ Partial |
| **Text Input**                      | TextInput                                 | Multiline, placeholder "Chat with Claude", grows up to 3 lines                                                                                          | ✅ Partial |
| **FAB Menu**                        | Plus icon                                 | Tap → "Add to Chat" bottom sheet (camera, photos, files, toggles for research/web/health, style picker, tool access, manage connectors)                 | ✅ Partial |
| **Voice Button**                    | Mic icon                                  | Tap → VoiceConversationScreen (full-screen modal with waveform, transcription, TTS response)                                                            | ❌ Missing |
| **Send Button**                     | Send icon (or Stop icon during streaming) | Sends message; becomes Stop button during response streaming                                                                                            | ✅ Partial |
| **Attachment Preview Bar**          | Horizontal scroll HStack                  | Shows selected attachments (image thumbnails, file icons with name/size); tappable to preview/remove                                                    | ❌ Missing |
| **Loading/Thinking Spinner**        | ActivityIndicator                         | Shows while waiting for first token; replaced by "Thinking..." text once streaming starts                                                               | ✅ Partial |
| **Error State**                     | Toast or banner                           | Red banner: "Unable to send. Retry?" with retry button                                                                                                  | ✅ Partial |
| **Keyboard Dismissal**              | Gesture                                   | Swipe down or tap outside input to dismiss keyboard                                                                                                     | ✅ Partial |

**Layout Tree:**

```
SafeAreaView
├── VStack (main content)
│   ├── HStack (header: menu, title, actions)
│   │   ├── MenuIcon (hamburger)
│   │   ├── Text ("Chat")
│   │   └── [Settings icon]
│   ├── ProjectSelectorBar (if multi-project)
│   ├── ScrollView (messages)
│   │   └── VStack
│   │       ├── Message (user)
│   │       ├── Message (assistant with thinking chip)
│   │       ├── ThinkingSheet (modal overlay)
│   │       └── ...more messages
│   └── VStack (composer safe area)
│       ├── AttachmentPreviewBar (horizontal scroll)
│       ├── HStack (composer)
│       │   ├── TextInput
│       │   ├── Plus (FAB menu → AddToChatSheet)
│       │   ├── Mic (voice → VoiceConversationScreen)
│       │   └── Send/Stop
│       └── Keyboard (if focused)
```

---

### Model Picker (Bottom Sheet)

**Route:** Triggered from chat header model dropdown or FAB menu  
**Purpose:** Select local or cloud model, configure thinking

**Components & Layout:**

| Element                                      | Component                      | Spec                                                                                                                                         | Status     |
| -------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Sheet Header**                             | HStack (sticky)                | Title "Select Model", X dismiss button (right)                                                                                               | ❌ Missing |
| **Search Input**                             | TextInput                      | Optional; filter models by name or provider                                                                                                  | ❌ Missing |
| **Section: Local Models**                    | Section header + list          | Heading "LOCAL MODELS", description "Run on device, no internet required"                                                                    | ❌ Missing |
| **Model Card (Local)**                       | HStack (full-width)            | Icon (CPU), name (Llama 3.2 1B), provider badge "Local", size "1.2 GB", tokens/sec "12-15 t/s", radio button (selected state), tap to select | ❌ Missing |
| **Model Card (Cloud)**                       | HStack (full-width)            | Icon (cloud), name (Claude 3.5 Opus), provider badge "Cloud", tier badge (Pro+), radio button, tap to select                                 | ❌ Missing |
| **Download Model Button**                    | Button                         | "Download New Model" link → Hugging Face registry filtered view                                                                              | ❌ Missing |
| **Thinking Mode Toggle (if model supports)** | Toggle switch                  | Label "Enable Extended Thinking", description, on/off state                                                                                  | ❌ Missing |
| **Thinking Effort Dropdown**                 | Dropdown (if thinking enabled) | Options: Standard, Advanced, Ultra; description about token/latency tradeoff                                                                 | ❌ Missing |
| **Scrollable Content**                       | ScrollView                     | Models list, sections for local/cloud, toggle for thinking                                                                                   | ❌ Missing |
| **Actions**                                  | —                              | Tap model → select + dismiss sheet; toggle thinking → persist setting                                                                        | ❌ Missing |

**Layout Tree:**

```
BottomSheetPresentation (50% height, expandable)
├── VStack
│   ├── HStack (header: title, X dismiss)
│   ├── SearchBar (optional)
│   ├── ScrollView
│   │   └── VStack
│   │       ├── Section ("LOCAL MODELS")
│   │       │   ├── ModelCard (Llama 3.2 1B, radio selected)
│   │       │   ├── ModelCard (Phi-4 Mini)
│   │       │   ├── ModelCard (Gemma 4)
│   │       │   └── Button "Download Model"
│   │       ├── Divider
│   │       ├── Section ("CLOUD MODELS")
│   │       │   ├── ModelCard (Claude Opus, radio)
│   │       │   ├── ModelCard (GPT-5)
│   │       │   └── ModelCard (Gemini 3)
│   │       ├── Divider
│   │       └── Section ("THINKING")
│   │           ├── Toggle "Extended Thinking"
│   │           └── Dropdown "Thinking Effort" (if enabled)
```

---

### Chat Detail / Message Thread (Full Screen)

**Route:** `/(app)/chat/[id]`  
**Purpose:** Display full conversation, continue chat, regenerate responses

**Components & Layout:**

| Element                      | Component                           | Spec                                                                                                                         | Status     |
| ---------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Header**                   | HStack                              | Model badge (e.g., "Opus 4.6"), title (conversation auto-title), more menu (three dots)                                      | ✅ Partial |
| **More Menu**                | Context menu (tap three dots)       | Share conversation, rename, archive, delete, export, clone                                                                   | ❌ Missing |
| **Message List**             | ScrollView + VStack                 | All messages in thread; user on right (blue bg), assistant on left (gray bg); last message is focus                          | ✅ Partial |
| **User Message Bubble**      | VStack                              | Avatar (initials), message text, timestamp (optional), reaction buttons (like/dislike if hoverable)                          | ✅ Partial |
| **Assistant Message Bubble** | VStack                              | Model icon, message text, thinking chip (if reasoning enabled), copy button, reference list (if citations), reaction buttons | ✅ Partial |
| **Thinking Chip**            | HStack                              | Clock icon, truncated reasoning preview, ">" arrow, tap → expand sheet                                                       | ❌ Missing |
| **Thinking Sheet (Modal)**   | Sheet                               | Title "Thought process", scrollable full reasoning text, X dismiss                                                           | ❌ Missing |
| **Citation List**            | Collapsible HStack                  | "Sources:" label, list of URLs/sources (expandable disclosure), each source is link                                          | ❌ Missing |
| **Copy Button**              | Button (overlay on bubble)          | Icon (two squares), tap → copy message to clipboard, show "Copied!" toast                                                    | ❌ Missing |
| **Regenerate Button**        | Button (bottom of assistant bubble) | "Regenerate" label, arrow icon, tap → re-query model                                                                         | ❌ Missing |
| **Edit Message Button**      | Button                              | Edit own message (user-side), resend thread from that point                                                                  | ❌ Missing |
| **Composer (Same as Chat)**  | HStack                              | Reply input, attachments, voice, send                                                                                        | ✅ Partial |
| **Empty State (New Chat)**   | VStack                              | Same as chat.tsx empty state                                                                                                 | ✅ Partial |

**Layout Tree:**

```
SafeAreaView
├── VStack
│   ├── HStack (header)
│   │   ├── BackButton
│   │   ├── Text (conversation title)
│   │   └── ThreeDotMenu
│   ├── ScrollView (messages)
│   │   └── VStack
│   │       ├── MessageBubble (user)
│   │       ├── MessageBubble (assistant + thinking chip)
│   │       │   ├── ThinkingSheet (if expanded)
│   │       ├── CopyButton
│   │       ├── RegenerateButton
│   │       ├── MessageBubble (user follow-up)
│   │       └── ...more messages
│   └── ComposerBar (bottom safe area)
```

---

### Artifacts / Code Gallery & Viewer

**Route:** `/(app)/artifacts` (gallery), `/(app)/artifacts/[id]` (detail)  
**Purpose:** Browse generated code/SVG/React components, preview/edit/export

**Components & Layout:**

| Element                 | Component                                      | Spec                                                                                                                           | Status     |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **Gallery (Index)**     | —                                              | —                                                                                                                              | —          |
| Header                  | HStack                                         | "Artifacts" title, filter icon (optional)                                                                                      | ❌ Missing |
| Section: "Get Inspired" | —                                              | Featured artifact card with preview image, title, "Try" button                                                                 | ❌ Missing |
| Grid                    | GridView (2 columns on iPhone, 3+ on iPad)     | Cards per artifact: thumbnail preview (dark bg), title, timestamp (relative: "4 days ago"), content-type icon (code/SVG/React) | ❌ Missing |
| Empty State             | VStack                                         | Icon (document), text "No artifacts yet. Generate one in chat."                                                                | ❌ Missing |
| **Artifact Detail**     | —                                              | —                                                                                                                              | —          |
| Header                  | HStack                                         | Back button, artifact title, action menu (share, export, delete)                                                               | ❌ Missing |
| Tabs                    | HStack (sticky)                                | "Preview" tab, "Code" tab                                                                                                      | ❌ Missing |
| Preview Pane            | WebView or React Native Web                    | Live preview of code/SVG/HTML; React components executed inline                                                                | ❌ Missing |
| Code Pane               | TextInput (read-only with syntax highlighting) | Full source code, copy button, monospace font                                                                                  | ❌ Missing |
| Copy Button             | Button                                         | "Copy code" label, tap → copy to clipboard                                                                                     | ❌ Missing |
| Export Button           | Button                                         | Export as file (download .html, .svg, .jsx)                                                                                    | ❌ Missing |
| Share Button            | Button                                         | Share URL (if available) or export file                                                                                        | ❌ Missing |

**Layout Tree:**

```
// Gallery
ScrollView
├── VStack
│   ├── HStack (header)
│   ├── ArtifactCard (Get Inspired)
│   ├── Section ("Recent Artifacts")
│   │   └── LazyVGrid (2 columns)
│   │       ├── ArtifactCard
│   │       ├── ArtifactCard
│   │       └── ...

// Detail
VStack
├── HStack (header: back, title, actions)
├── HStack (tabs: Preview | Code)
├── ZStack
│   ├── PreviewPane (WebView, if Preview tab selected)
│   ├── CodePane (TextInput, if Code tab selected)
│   └── CopyButton (floating)
└── Footer (export/share actions)
```

---

### Voice Conversation (Full Screen Modal)

**Route:** Triggered from voice button in composer  
**Purpose:** Real-time voice input/output interaction

**Components & Layout:**

| Element                     | Component                             | Spec                                                                                        | Status     |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| **Modal Header**            | HStack                                | Back/close button (X), title "Voice Conversation", status (Listening / Thinking / Speaking) | ❌ Missing |
| **Waveform Visualizer**     | Canvas view                           | Real-time audio input visualization (animated bars, blue/purple gradient), centered         | ❌ Missing |
| **Transcription Display**   | Text                                  | User's spoken input (gray text), updates real-time as Whisper processes                     | ❌ Missing |
| **Message Thread**          | ScrollView + VStack                   | Conversation history (user spoken → assistant spoken response), mini-bubbles                | ❌ Missing |
| **Audio Response Playback** | —                                     | TTS output text (italic), waveform animation while playing, stop button if interrupt        | ❌ Missing |
| **Push-to-Talk Button**     | Large circular button (center bottom) | "Hold to Talk" label, visual feedback (glow/scale) while recording                          | ❌ Missing |
| **Stop / End Voice**        | Button                                | End button (red), tap to stop recording/playback and return to text chat                    | ❌ Missing |
| **Keyboard Dismiss**        | Gesture                               | Voice mode disables keyboard input; swipe down to exit                                      | ❌ Missing |

**Layout Tree:**

```
FullScreenModal
├── VStack
│   ├── HStack (header: close, status)
│   ├── Spacer
│   ├── WaveformVisualizer (center)
│   ├── Text (transcription, real-time)
│   ├── Spacer
│   ├── ScrollView (message history)
│   │   └── VStack (mini-bubbles)
│   └── HStack (bottom safe area)
│       ├── Button "Hold to Talk" (center, large)
│       └── Button "End" (destructive red)
```

---

### Image Input & Generation

**Route:** `/(app)/image` (generation), triggered from FAB menu  
**Purpose:** Text-to-image prompt + style picker, display result

**Components & Layout:**

| Element                 | Component                       | Spec                                                                                                             | Status     |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| **Header**              | HStack                          | "Generate Image" or "Image Gallery", back button                                                                 | ❌ Missing |
| **Prompt Input**        | TextInput (multiline)           | Placeholder "Describe the image you want to generate..."                                                         | ❌ Missing |
| **Style Picker**        | Bottom sheet (tap "Style")      | Grid or list of presets (Photorealistic, Illustration, Oil Painting, etc.); tap to select; description per style | ❌ Missing |
| **Model Selector**      | Bottom sheet (tap "Model")      | Options: DALL-E 3 (CLOUD), Stable Diffusion API (CLOUD), local SD (if supported, LOCAL); provider badge          | ❌ Missing |
| **Generate Button**     | Button (prominent blue)         | "Generate", state: loading spinner while generating, disabled if empty prompt or offline                         | ❌ Missing |
| **Generated Image**     | Image view (fullscreen or card) | Displays result; tap to expand fullscreen preview                                                                | ❌ Missing |
| **Image Actions**       | HStack (floating over image)    | Share button, save to library, regenerate, download                                                              | ❌ Missing |
| **Generation Progress** | ProgressView                    | If cloud: show estimated time remaining; if local: show tokens/sec progress                                      | ❌ Missing |

**Layout Tree:**

```
SafeAreaView
├── VStack
│   ├── HStack (header)
│   ├── ScrollView
│   │   └── VStack
│   │       ├── TextInput (prompt)
│   │       ├── HStack (model + style pickers)
│   │       │   ├── Button "Model" (tap → ModelPickerSheet)
│   │       │   └── Button "Style" (tap → StylePickerSheet)
│   │       ├── ProgressView (if generating)
│   │       ├── Image (if generated)
│   │       └── HStack (actions: share, save, regenerate, download)
│   └── VStack (bottom safe area)
│       └── Button "Generate" (prominent)
```

---

### Projects Screen

**Route:** `/(app)/(tabs)/projects`  
**Purpose:** List user projects, create/archive/share

**Components & Layout:**

| Element                   | Component                                            | Spec                                                                                              | Status     |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| **Header**                | HStack                                               | "Projects" title, "+" FAB for create new                                                          | ❌ Missing |
| **Project List / Grid**   | GridView (2 columns on iPhone, 3+ on iPad) or VStack | Project cards: icon, name, member count (avatar pile), last update timestamp                      | ❌ Missing |
| **Project Card**          | VStack (card view)                                   | Title (text), member avatars (pile), timestamp (relative: "2d ago"), chevron → tap to open detail | ❌ Missing |
| **Empty State**           | VStack                                               | Icon (folder), text "No projects yet. Create one to organize your work.", "Create Project" button | ❌ Missing |
| **Create Project Button** | FAB                                                  | Blue circle with "+" icon; tap → ProjectCreateSheet (name, description, member invite)            | ❌ Missing |
| **Project More Menu**     | Context menu (long-press card)                       | Share, rename, archive, delete, settings                                                          | ❌ Missing |

**Layout Tree:**

```
SafeAreaView
├── VStack
│   ├── HStack (header: "Projects", FAB)
│   ├── ScrollView
│   │   └── LazyVGrid (2 columns)
│   │       ├── ProjectCard (tap → detail)
│   │       ├── ProjectCard
│   │       └── ...
│   └── FAB "+" (CreateProjectSheet)
```

---

### Agents / Skills Browser

**Route:** `/(app)/(tabs)/agents`, `/(app)/skills`  
**Purpose:** Gallery of available agents/skills, invoke agent, install skill

**Components & Layout:**

| Element              | Component               | Spec                                                                                                         | Status     |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| **Header**           | HStack                  | "Agents" / "Skills" title, search icon (optional)                                                            | ❌ Missing |
| **Agent/Skill Card** | VStack (card)           | Avatar/icon, name, description (2 lines), category badge (e.g., "Automation", "Data"), invoke/install button | ❌ Missing |
| **Card Grid**        | GridView                | 2 columns on iPhone, 3+ on iPad                                                                              | ❌ Missing |
| **Detail Sheet**     | Bottom sheet (tap card) | Full description, parameters (if agent/skill has inputs), last run status, invoke/install button             | ❌ Missing |
| **Invoke/Install**   | Button                  | "Invoke Agent" or "Install Skill", state: loading spinner during invocation                                  | ❌ Missing |
| **Search**           | TextInput (top)         | Filter agents/skills by name or category                                                                     | ❌ Missing |

**Layout Tree:**

```
SafeAreaView
├── VStack
│   ├── HStack (header: "Agents", search icon)
│   ├── SearchBar (optional)
│   ├── ScrollView
│   │   └── LazyVGrid
│   │       ├── AgentCard (tap → detail sheet)
│   │       ├── AgentCard
│   │       └── ...
└── AgentDetailSheet (modal)
    ├── Title
    ├── Description
    ├── Parameters
    └── InvokeButton
```

---

### Settings Screen (Root Index)

**Route:** `/(app)/settings`  
**Purpose:** Main settings landing, navigate to sub-screens

**Components & Layout:**

| Element                | Component           | Spec                                                                                                                                                                                                                 | Status     |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Header**             | HStack              | "Settings" title, X dismiss (modal) or back button                                                                                                                                                                   | ✅ Partial |
| **User Email Display** | Text                | Small text below header, `user@agiworkforce.com`                                                                                                                                                                     | ❌ Missing |
| **Settings List**      | ScrollView + VStack | Rows: Profile, Billing, Usage, Capabilities, Connectors, Permissions, Appearance, Voice, Downloads, Performance, Notifications, Privacy, Memory Import, Auto-Approve, Shared Links, Feedback, About, Haptic, Log Out | ❌ Missing |
| **Settings Row**       | HStack (full-width) | Icon (left), label (center), value/badge or chevron (right), tap → navigate or toggle                                                                                                                                | ❌ Missing |
| **Toggle Row**         | HStack              | Icon, label, toggle switch (right), description (optional)                                                                                                                                                           | ❌ Missing |
| **Divider**            | Divider             | Between sections                                                                                                                                                                                                     | ❌ Missing |
| **Destructive Action** | HStack              | Red text (Log Out), tap → confirmation dialog                                                                                                                                                                        | ❌ Missing |

**Layout Tree:**

```
ModalPresentation
├── VStack
│   ├── HStack (header: "Settings", X dismiss)
│   ├── Text (email)
│   ├── ScrollView
│   │   └── VStack
│   │       ├── Section ("ACCOUNT")
│   │       │   ├── SettingsRow (Profile)
│   │       │   ├── SettingsRow (Billing)
│   │       │   └── SettingsRow (Usage)
│   │       ├── Divider
│   │       ├── Section ("CAPABILITIES")
│   │       │   ├── SettingsRow (Model & Thinking)
│   │       │   ├── SettingsRow (Capabilities)
│   │       │   ├── SettingsRow (Connectors)
│   │       │   └── SettingsRow (Voice & Language)
│   │       ├── Divider
│   │       ├── Section ("DEVICE")
│   │       │   ├── SettingsRow (Permissions)
│   │       │   ├── SettingsRow (Appearance)
│   │       │   ├── SettingsRow (Downloads)
│   │       │   └── SettingsRow (Performance)
│   │       ├── Divider
│   │       ├── Section ("PRIVACY")
│   │       │   ├── SettingsRow (Notifications)
│   │       │   └── SettingsRow (Privacy & Data)
│   │       ├── Divider
│   │       ├── Section ("ADVANCED")
│   │       │   ├── ToggleRow (Auto-Approve)
│   │       │   ├── SettingsRow (Experimental)
│   │       │   ├── SettingsRow (Shared Links)
│   │       │   ├── SettingsRow (Feedback)
│   │       │   └── SettingsRow (About)
│   │       ├── Divider
│   │       └── Button "Log Out" (red)
```

---

### Authentication & Onboarding Screens

**Route:** `/(auth)/login`, `/(public)/onboarding`, `/(public)/age-gate`  
**Purpose:** User registration, permission requests, first-time setup

**Components & Layout:**

| Screen                | Elements                                                                                            | Status     |
| --------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| **Login**             | Email input, password input, "Sign In" button, "Forgot Password?" link, SSO buttons (Google, Apple) | ❌ Missing |
| **Onboarding Step 1** | Welcome heading, greeting, "Next" button                                                            | ❌ Missing |
| **Onboarding Step 2** | Microphone permission request, "Allow" / "Skip", description text                                   | ❌ Missing |
| **Onboarding Step 3** | Camera permission request, "Allow" / "Skip"                                                         | ❌ Missing |
| **Onboarding Step 4** | Theme selector (Dark/Light/System), language selector (English dropdown)                            | ❌ Missing |
| **Onboarding Step 5** | Summary, "Start Chatting" button, optional "Explore Features" link                                  | ❌ Missing |
| **Age Gate**          | Age verification prompt, "I'm 13+" button, "I'm under 13" link (to parental controls info)          | ❌ Missing |

---

## 4. CLOUD vs LOCAL FEATURE MATRIX & DEMOTE/DISABLE LIST

### Feature Classification Matrix

| Feature                                          | Execution                                 | Data Sync                           | API Required                      | Cloud-Only?                                  | AGI Mobile Local-Mode Status                          |
| ------------------------------------------------ | ----------------------------------------- | ----------------------------------- | --------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| **CHAT & MESSAGING**                             |
| Basic chat (text input/output)                   | Local (if 1-3B model) or Cloud            | Local history + optional cloud sync | Optional (cloud model inference)  | ❌ NO                                        | ✅ Enabled (local models)                             |
| Model selection / switching                      | Local                                     | Local settings                      | Optional                          | ❌ NO                                        | ✅ Enabled (both local/cloud)                         |
| Thinking mode / Extended reasoning               | Cloud (requires frontier models)          | Cloud backend                       | ✅ Required (Claude API, GPT API) | ✅ YES                                       | ⚠️ Demote: show "Cloud feature" badge                 |
| Thinking effort control                          | Cloud backend                             | Cloud                               | ✅ Required                       | ✅ YES                                       | ⚠️ Demote: greyed out in local mode                   |
| Message history / persistence                    | Local SQLite                              | Local + optional cloud sync         | Optional                          | ❌ NO                                        | ✅ Enabled (local storage)                            |
| Message editing / regeneration                   | Local or cloud (depends on model)         | Local                               | Optional                          | ❌ NO                                        | ✅ Enabled                                            |
| Copy/share message                               | Local                                     | Local                               | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| **VOICE & AUDIO**                                |
| Voice input (speech-to-text)                     | Local (Whisper) or Cloud                  | Local transcription buffer          | Optional (cloud TTS)              | ❌ NO                                        | ✅ Enabled (local Whisper)                            |
| Voice output (text-to-speech)                    | Local (Piper, Kokoro) or Cloud            | Local audio buffer                  | Optional (cloud TTS)              | ❌ NO                                        | ✅ Enabled (local TTS)                                |
| Real-time voice mode (streaming)                 | Cloud (speech-to-speech model)            | Cloud streaming buffer              | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Pro feature, requires cloud"             |
| Voice conversation history                       | Local                                     | Local                               | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| Push-to-talk (mobile)                            | Local (record on device)                  | Local                               | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| **IMAGE & VISION**                               |
| Image upload (camera/library)                    | Local capture                             | Local file system                   | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| Image analysis / vision                          | Local (if model supports) or Cloud        | Local analysis cache                | Optional (cloud vision)           | ❌ NO                                        | ✅ Enabled (Gemma SmolVLM, Qwen3-VL)                  |
| Image generation (text-to-image)                 | Cloud (DALL-E, Stable Diffusion API)      | Cloud generation output             | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Cloud feature, requires subscription"    |
| Document/PDF upload                              | Local extraction                          | Local parsed text                   | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| Document RAG / embedding                         | Local (if model supports) or Cloud        | Local embeddings or cloud vector DB | Optional                          | ❌ NO                                        | ⚠️ Partial: local with small models, cloud with large |
| OCR (document text extraction)                   | Local (PDFKit) or Cloud (cloud vision)    | Local cache                         | Optional                          | ❌ NO                                        | ✅ Enabled (local for basic; cloud for complex)       |
| **MEMORY & PERSONALIZATION**                     |
| Chat history search                              | Local (SQLite full-text) or Cloud         | Local or cloud                      | Optional                          | ❌ NO                                        | ✅ Enabled (local search)                             |
| Custom instructions / personality                | Local settings or Cloud                   | Local or cloud sync                 | Optional                          | ❌ NO                                        | ✅ Enabled (local storage)                            |
| Auto-generated memory from chats                 | Cloud (requires reasoning/summarization)  | Cloud storage                       | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Cloud feature for Premium users"         |
| Memory references (pull context)                 | Cloud or Local (depends on model)         | Cloud or local                      | Optional                          | ❌ NO                                        | ⚠️ Partial: local with small models                   |
| Cross-device memory sync                         | Cloud backend                             | Cloud sync database                 | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Requires account & cloud sync"           |
| **SEARCH & WEB**                                 |
| Web search integration                           | Cloud API (Bing, Google Custom Search)    | Cloud results cache                 | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Cloud-only feature"                      |
| Deep research / synthesis                        | Cloud (web scrape + summarize)            | Cloud report storage                | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Cloud-only, Pro feature"                 |
| **CONNECTORS & INTEGRATIONS**                    |
| Connector list (UI)                              | Local display                             | Local registry cache                | ❌ Optional                       | ❌ NO                                        | ✅ Enabled (display only)                             |
| Connector auth (OAuth)                           | Cloud OAuth flow                          | Cloud token storage                 | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Connect account in cloud mode"           |
| Connector data sync (Gmail, Slack, Drive, etc.)  | Cloud API calls                           | Cloud data storage                  | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Cloud-only feature"                      |
| Custom MCP server integration                    | Cloud or Local (if self-hosted)           | Local or cloud                      | Optional                          | ❌ NO (self-hosted) / ✅ YES (cloud)         | ⚠️ Partial: local MCP support if documented           |
| **PROJECTS & AGENTS**                            |
| Projects list / gallery                          | Cloud backend                             | Cloud database                      | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Requires account & cloud sync"           |
| Create/edit project                              | Cloud backend                             | Cloud database                      | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: in local mode                             |
| Agent definitions                                | Cloud registry                            | Cloud storage                       | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Agent library cloud-only"                |
| Agent execution (invoke)                         | Cloud or Local (depends on agent type)    | Cloud backend                       | Optional                          | ❌ NO (local agents) / ✅ YES (cloud agents) | ⚠️ Partial: support local agent scripts               |
| **ARTIFACTS & CODE**                             |
| Artifact preview (code, SVG, React)              | Local renderer (WebView)                  | Local storage                       | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| Artifact code execution (sandboxed)              | Cloud sandbox                             | Cloud output                        | ✅ Required                       | ✅ YES                                       | ⚠️ Demote: "Code execution requires cloud"            |
| Artifact generation (model output)               | Local or Cloud                            | Local storage                       | Optional                          | ❌ NO                                        | ✅ Enabled                                            |
| Artifact export / download                       | Local file system                         | Local files                         | ❌ Optional                       | ❌ NO                                        | ✅ Enabled                                            |
| Artifact sharing / link generation               | Cloud backend                             | Cloud URL storage                   | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Share requires cloud account"            |
| **SETTINGS & DEVICE**                            |
| Theme / appearance toggle                        | Local                                     | Local settings                      | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| Language selection                               | Local                                     | Local settings                      | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| Font size / accessibility                        | Local                                     | Local settings                      | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| Haptic feedback toggle                           | Local                                     | Local settings                      | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| Notifications (local)                            | Local push service                        | Local                               | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| OS permissions (camera, mic, location, calendar) | Local iOS API                             | Local                               | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| Model download / management                      | Local file system + Hugging Face registry | Local storage                       | ❌ Optional (registry lookup)     | ❌ NO                                        | ✅ Enabled                                            |
| Model parameters (temp, top-k, max-tokens)       | Local                                     | Local settings                      | ❌ NO                             | ❌ NO                                        | ✅ Enabled                                            |
| **ADVANCED**                                     |
| Auto-approve (low-risk agent actions)            | Cloud backend                             | Cloud execution log                 | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: in local mode                             |
| Scheduled tasks / reminders                      | Cloud task queue                          | Cloud storage                       | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Scheduling requires cloud"               |
| Cross-device sync                                | Cloud backend                             | Cloud database                      | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Cloud feature"                           |
| Desktop companion / Dispatch                     | Cloud signaling                           | Cloud state store                   | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Desktop pairing cloud-only"              |
| Billing / subscription management                | Cloud backend                             | Cloud database                      | ✅ Required                       | ✅ YES                                       | ⚠️ Disable: "Local mode = free, no billing"           |
| User telemetry / diagnostics                     | Cloud telemetry service                   | Cloud logs                          | ✅ Required                       | ✅ YES                                       | ⚠️ Optional toggle (off by default in local mode)     |

### Explicit CLOUD-ONLY Features to Demote/Disable in Local Mode

**Navigation Changes:**

- Drawer nav: Hide or grey out these items when offline or in local-only mode
  - ❌ `Projects` (requires cloud sync)
  - ❌ `Agents` (requires cloud registry)
  - ❌ `Connectors` (requires OAuth/cloud sync)
  - ❌ `Dispatch` (desktop companion)
  - ⚠️ Keep: `Chat`, `Artifacts`, `Skills` (read-only local-cached list)

**Settings: Demote/Disable**

- Settings > Capabilities
  - ❌ Code execution (cloud sandbox)
  - ❌ Web search (cloud API)
  - ❌ Memory generation (cloud reasoning)
  - ⚠️ Memory search (grey out, show "Upgrade to Pro for cloud memory")
  - ✅ Keep: Artifacts, Image analysis (if local model supports)
- Settings > Connectors
  - ❌ Hide entire section in local-only mode; show banner "Connect accounts in cloud mode"
- Settings > Voice & Language
  - ❌ Real-time voice mode (grey out, show "Pro feature, requires cloud")
  - ✅ Keep: Voice input (Whisper), Voice output (Piper), push-to-talk
- Settings > Downloads & Storage
  - ✅ Fully enabled (model management)

**Chat: Demote**

- Thinking indicator chip
  - ⚠️ Show greyed-out or disable if local model doesn't support extended thinking
  - Message: "Extended thinking requires cloud model (Claude Opus, GPT-5)"
- Model picker
  - Show local models first (checkmark on default local model)
  - Cloud models section with "Requires internet" indicator
  - "Upgrade to cloud for advanced reasoning" banner below cloud models

**FAB Menu: Demote**

- "Add to Chat" sheet
  - ❌ Disable: Research, Web search, Health toggles (show as greyed, "Cloud feature")
  - ✅ Keep: Camera, Photos, Files, Style, Tool access

**Image Screen: Demote**

- Image generation
  - ❌ Disable "Generate" button if offline or local-only mode
  - Show banner: "Image generation available in cloud mode (requires subscription)"
  - ✅ Keep: Image analysis (if local model supports vision)

**Status Indicator (SendPreview Component):**

- Current impl shows model + provider
- Enhance to show warning/demoted state:
  ```
  [Llama 3.2 1B] (Local)
  [Claude 3.5 Opus] (Cloud) ← Unavailable (offline)
  [GPT-5] (Cloud) ← Requires subscription
  ```

---

## 5. RECOMMENDED LOCAL FEATURE SET (On-Device LLM Mode)

### Guaranteed Local Features (No Cloud Required)

**Core Chat:**

- ✅ Multi-turn conversation with 1-3B GGUF models (Llama 3.2, Phi-4 Mini, Qwen3-VL, Gemma 4)
- ✅ Chat history persistence (SQLite)
- ✅ Message editing / regeneration
- ✅ Copy / paste messages
- ✅ Model selection (local model list)
- ✅ Model parameter tuning (temperature, top-k, top-p, max-tokens)

**Voice (Input & Output):**

- ✅ Speech-to-text (local Whisper Base/Medium)
- ✅ Text-to-speech (local Piper, Kokoro)
- ✅ Push-to-talk (record on device)
- ✅ Voice transcription history

**Vision & Images:**

- ✅ Image upload (camera, photo library)
- ✅ Image analysis (Qwen3-VL, Gemma SmolVLM for basic object detection)
- ✅ Document upload (PDF, CSV, code files)
- ✅ PDF text extraction (PDFKit)
- ✅ OCR for basic text extraction (PDFKit)
- ✅ Document RAG (if embedding model provided; basic token matching fallback)

**Artifacts:**

- ✅ Code preview (syntax-highlighted TextInput)
- ✅ SVG preview (WebView)
- ✅ Markdown rendering (TextInput styled)
- ✅ Copy code button
- ✅ Export artifact (download as file)

**Settings:**

- ✅ Theme (Dark/Light/System)
- ✅ Font size (Small/Medium/Large)
- ✅ Language selection
- ✅ Appearance & accessibility
- ✅ Haptic feedback toggle
- ✅ Microphone/camera/photos permissions
- ✅ Downloaded model management (install/delete)
- ✅ Model parameters (sliders)

**Model Management:**

- ✅ Display installed models (name, size, quantization level, tokens/sec)
- ✅ Download models from Hugging Face registry
- ✅ Delete models (free storage)
- ✅ Model info (description, recommended hardware, expected performance)
- ✅ Quantization level selector (Q4_K_M, Q5_K_M)
- ✅ Auto-delete old models (optional, when storage low)

**History & Search:**

- ✅ Chat history list (recents sidebar)
- ✅ Full-text search in chat history
- ✅ Conversation export (JSON, Markdown)
- ✅ Clear history option
- ✅ Archive conversations (separate storage)

**Local Display:**

- ✅ Performance metrics (tokens/sec, TTFT latency, memory usage)
- ✅ Model load time indicator
- ✅ Loading spinner during inference
- ✅ Error states (disk full, model missing, etc.)
- ✅ Empty states (first launch, no history)

---

### **NOT Guaranteed in Local Mode (CLOUD-ONLY)**

- ❌ Extended thinking / advanced reasoning
- ❌ Image generation (DALL-E, Midjourney, Stable Diffusion)
- ❌ Web search / deep research
- ❌ Connectors (Gmail, Slack, GitHub, Drive, Zapier)
- ❌ Custom instructions sync across devices
- ❌ Projects & Agents
- ❌ Real-time voice mode (streaming speech-to-speech)
- ❌ Memory auto-generation / advanced memory features
- ❌ Code execution in cloud sandbox
- ❌ Desktop companion / Dispatch
- ❌ Scheduled tasks
- ❌ Billing & subscription management
- ❌ Cross-device sync

---

### **Hardware Baselines & Performance Expectations**

| Device            | RAM   | Tokens/sec (1B) | Tokens/sec (3B) | TTFT (ms) | Recommended Model                    |
| ----------------- | ----- | --------------- | --------------- | --------- | ------------------------------------ |
| iPhone 14+        | 6GB   | 10-12           | 6-8             | 500-700   | Llama 3.2 1B Q4_K_M                  |
| iPhone 15         | 6GB   | 12-15           | 8-10            | 300-500   | Llama 3.2 3B Q4_K_M (with offload)   |
| iPhone 15 Pro     | 8GB   | 15-18           | 10-12           | 250-400   | Llama 3.2 3B Q4_K_M                  |
| iPhone 16 Pro Max | 12GB  | 18-22           | 12-15           | 200-350   | Llama 3.2 3B Q5_K_M                  |
| iPad Air (M2)     | 8GB   | 20-25           | 12-15           | 200-300   | Llama 3.2 3B Q5_K_M or Phi-4 Mini    |
| iPad Pro (M4)     | 12GB+ | 35-45           | 20-25           | 100-200   | Llama 3.2 7B Q4_K_M (with Metal GPU) |

**Model Format & Quantization:**

- Standard: GGUF format (holistic model package via llama.cpp)
- Default quantization: Q4_K_M (4-bit, good balance of quality & speed)
- Alternative: Q5_K_M (better reasoning, slower; ~1.5x model size)
- Storage per model: 1B=~1.2GB, 3B=~3.5GB, 7B=~8GB (all Q4_K_M)

---

## 6. AGI WORKFORCE MOBILE GAP LIST (Prioritized)

### **CRITICAL (Ship for MVP)**

| Priority | Component                             | Current Status | Gap                                                                                                        | Effort     | Notes                                                                                                          |
| -------- | ------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| P0       | **THINKING/REASONING DISPLAY**        | ❌ Missing     | Reasoning chip UI + modal sheet not implemented; API integration to display thinking pending               | Medium     | Add clock icon chip above response; tap → ThinkingSheet modal; parse Claude API `thinking` display field       |
| P0       | **MODEL PICKER (Local + Cloud)**      | ⚠️ Partial     | Visual selector incomplete; cloud model section missing; thinking effort dropdown not shown                | Medium     | Build ModelPickerSheet with sections (Local Models, Cloud Models, Thinking Mode toggle, effort dropdown)       |
| P0       | **THINKING EFFORT CONTROL**           | ❌ Missing     | Settings > Model & Thinking > effort dropdown not wired                                                    | Low-Medium | Add dropdown (Standard/Advanced/Ultra) in model picker or settings; persist to modelStore                      |
| P0       | **CHAT EMPTY STATE**                  | ❌ Missing     | Greeting text only; no suggestion chips or onboarding cues                                                 | Low        | Add 2-3 suggestion cards (e.g., "Ask about...", "Create...") with icons + descriptors                          |
| P0       | **VOICE CONVERSATION (Full-Screen)**  | ❌ Missing     | Voice button exists but VoiceConversationScreen not built                                                  | High       | Full-screen modal with waveform visualizer, transcription display, TTS output playback, push-to-talk UI        |
| P0       | **IMAGE UPLOAD & ANALYSIS**           | ⚠️ Partial     | Camera/photos picker exists; image analysis output not shown in chat                                       | Medium     | Display selected image in message bubble; show analysis results; add image preview bar                         |
| P0       | **ATTACHMENTS PREVIEW BAR**           | ❌ Missing     | Composer bar exists; preview of selected files (images, PDFs) not shown                                    | Low        | Add horizontal scrollable HStack below composer showing selected file thumbnails + remove button per item      |
| P0       | **BOTTOM SHEETS (Standard Patterns)** | ⚠️ Partial     | Some sheets implemented; not all follow consistent design (header, dismiss button, scrollable content)     | Low-Medium | Standardize: all sheets have X dismiss, title, scrollable content area, bottom safe area padding               |
| P0       | **SETTINGS MAIN SCREEN**              | ✅ Partial     | List exists; not all rows wired to sub-screens; missing sections (Model & Thinking, Connectors, Downloads) | Medium     | Complete IA: add all rows per spec above; wire chevrons to nested screens                                      |
| P0       | **SETTINGS: CAPABILITIES SUB-SCREEN** | ⚠️ Partial     | Some toggles exist; Web search, Memory toggles, Tool access radio buttons not shown                        | Medium     | Build Capabilities sheet per spec: feature toggles + descriptions + Tool access radio group                    |
| P0       | **SETTINGS: CONNECTORS SUB-SCREEN**   | ❌ Missing     | Nav item exists; UI not built; OAuth flow not integrated                                                   | High       | List connectors (Drive, Gmail, Slack, etc.) with toggle/Connect buttons; wire to auth flow                     |
| P0       | **SETTINGS: PERMISSIONS SUB-SCREEN**  | ⚠️ Partial     | Permissions store exists; UI not built; visual indicators (Read only, Read & write, Never) not shown       | Low-Medium | Show OS permission status + link to iOS Settings to grant/revoke                                               |
| P0       | **SETTINGS: MODEL & THINKING**        | ❌ Missing     | Nav item missing; sub-screen not built                                                                     | Medium     | Build per spec: Local Models list (download, install, delete), Cloud Models, Thinking toggle + effort dropdown |
| P0       | **SETTINGS: DOWNLOADS & STORAGE**     | ❌ Missing     | No UI for managing installed GGUF models                                                                   | Medium     | Display models (name, size, quantization, delete button); show storage usage meter; download new button        |

### **HIGH (Ship in v1.1)**

| Priority | Component                                  | Current Status | Gap                                                                                     | Effort      | Notes                                                                                                                |
| -------- | ------------------------------------------ | -------------- | --------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| P1       | **ARTIFACTS GALLERY**                      | ❌ Missing     | Artifacts nav item exists; grid view not built                                          | Medium      | 2-column grid of artifact cards (preview thumbnail, title, timestamp); tap → detail view                             |
| P1       | **ARTIFACTS DETAIL & EDITOR**              | ⚠️ Partial     | Code view exists; Preview tab not implemented; export/share buttons missing             | Medium      | Add Preview tab (WebView for HTML/React/SVG); copy button; export download button                                    |
| P1       | **IMAGE GENERATION SCREEN**                | ⚠️ Partial     | Route exists; UI incomplete; model selector + generate button missing                   | Medium      | Text input (prompt), style picker (bottom sheet), model selector (bottom sheet), generate button, result display     |
| P1       | **MESSAGE ACTIONS (Context Menu)**         | ⚠️ Partial     | Basic menu exists; options incomplete (share, edit, copy, delete, regenerate)           | Low         | Add: Share, Edit, Copy, Regenerate, Mark helpful/unhelpful actions                                                   |
| P1       | **PROJECT DETAIL SCREEN**                  | ⚠️ Partial     | Route exists; UI minimal; tabs (Chats/Sources), member list, settings missing           | Medium      | Show project name, members, chats in project, add chat to project button, project settings                           |
| P1       | **AGENTS & SKILLS SCREENS**                | ❌ Missing     | Nav items exist; no gallery UI                                                          | Medium      | Gallery cards per agent/skill; detail bottom sheet; invoke/install button                                            |
| P1       | **THINKING DISPLAY FOR NON-CLAUDE MODELS** | ⚠️ Partial     | Claude reasoning chip works; other models (Llama, Gemma) don't support thinking display | Low         | Add feature flag: only show thinking chip if model has thinking output; hide for local models                        |
| P1       | **ERROR HANDLING & STATES**                | ⚠️ Partial     | Basic error toast exists; loading states, empty states not comprehensive                | Low-Medium  | Skeleton loaders (message list), full error screens (network error, model missing, disk full), empty state microcopy |
| P1       | **VOICE OUTPUT (TTS PLAYBACK)**            | ⚠️ Partial     | Voice input (Whisper) implemented; TTS output not playing audio                         | High        | Integrate Piper/Kokoro TTS; play audio response in voice mode; add stop/pause controls                               |
| P1       | **CROSS-DEVICE SYNC**                      | ❌ Missing     | Cloud architecture not defined; local-only build in progress                            | High-effort | Tag as CLOUD-only; show banner "Upgrade for cloud sync" in local mode                                                |

### **MEDIUM (Ship in v1.2)**

| Priority | Component                          | Current Status | Gap                                                                             | Effort      | Notes                                                                                                     |
| -------- | ---------------------------------- | -------------- | ------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| P2       | **DOCUMENT RAG**                   | ❌ Missing     | File upload works; embedding/retrieval not integrated                           | Medium      | Parse PDF/CSV; embed chunks (if local embedding model available); retrieve + inject context               |
| P2       | **SEARCH CHAT HISTORY**            | ⚠️ Partial     | Chat list exists; full-text search not wired                                    | Low         | Add search bar at top of drawer recents; filter by keyword                                                |
| P2       | **CONVERSATION EXPORT**            | ❌ Missing     | Settings > Shared Links exists; export as JSON/Markdown not built               | Low         | Add export button in chat; generate .json or .md file; share via Files app                                |
| P2       | **LOCAL MCP / CUSTOM INTEGRATION** | ❌ Missing     | Connectors nav exists; local MCP support (if self-hosted) not planned           | High-effort | If target supports local MCP: wire skill registry to local server; fallback to UI-only in default config  |
| P2       | **PERFORMANCE METRICS DISPLAY**    | ⚠️ Partial     | Tokens/sec calculation exists (inferred from inference time); not shown to user | Low         | Add optional overlay (Settings > Performance > Display tokens/sec toggle) showing speed during generation |
| P2       | **PERSISTENT NOTIFICATIONS**       | ⚠️ Partial     | Local notification framework exists; filtering/management UI not built          | Low         | Settings > Notifications sub-screen per spec; toggle by category (research, message, reminder)            |
| P2       | **LANDING PAGE / ONBOARDING FLOW** | ❌ Missing     | Auth routes exist; onboarding screens (permissions, theme, language) not built  | Medium      | Multi-step wizard: welcome, mic/camera permission requests, theme/language picker, completion screen      |

### **LOW (Ship in v1.3+)**

| Priority | Component                          | Current Status | Gap                                                                  | Effort           | Notes                                                                                     |
| -------- | ---------------------------------- | -------------- | -------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| P3       | **IMAGE GENERATION (Cloud)**       | ❌ Missing     | Screen route exists; DALL-E/SD API integration not implemented       | Medium           | Integrate cloud provider SDK; show generation progress; handle rate limits; cache results |
| P3       | **AUTO-APPROVE MODE**              | ❌ Missing     | Settings row exists; feature not implemented                         | High-effort      | Cloud-only; requires agent execution + low-risk action classifier                         |
| P3       | **HEALTH DATA INTEGRATION**        | ❌ Missing     | Health permission exists; iOS Health framework integration not built | Medium           | Read activity/fitness data from Health app; pass to model for insights                    |
| P3       | **REMINDERS / SCHEDULED TASKS**    | ❌ Missing     | Schedules nav item exists; UI not built                              | High-effort      | Cloud-only; task queue + scheduling backend required                                      |
| P3       | **WIDGET & LOCK SCREEN SHORTCUTS** | ❌ Missing     | Not planned for initial release                                      | Medium           | Home screen widget for quick chat access; lock screen shortcuts (Claude Code)             |
| P3       | **DESKTOP COMPANION (Dispatch)**   | ❌ Missing     | Nav item exists; pairing, sync not implemented                       | Very high-effort | Cloud signaling; QR pairing; mirror code sessions; requires full backend                  |

---

## 7. SOURCES & REFERENCES

### **Reference Image Paths (Design Audit)**

All images located in `/Users/siddhartha/Desktop/reference/ui/mobile/` with subdirectories per app:

**Claude iOS (10 screens):**

- `01_app-shell_splash-opus-extended-faded-greeting.png`
- `02_empty-state_composer-keyboard-up.png`
- `03_sidebar_chats-projects-artifacts-code-dispatch-recents.png`
- `04_composer_model-selector-opus-sonnet-haiku-extended.png`
- `07_artifacts_gallery-loaded-card-grid.png`
- `10_settings_main-profile-billing-usage-capabilities-connectors.png`
- `11_settings_connectors-drive-gmail-vercel-calendar-n8n.png`
- `12_settings_capabilities-artifacts-code-web-memory-tools.png`
- `24_chat_thread-reasoning-chip-reply-composer.png`
- `25_chat_thought-process-sheet-overview.png`
- `26_chat_thought-process-sheet-expanded.png`
- `27_composer_add-to-chat-sheet-camera-photos-files-toggles.png`

**ChatGPT iOS (15 screens):**

- `01_composer_empty-thinking-mode-suggestion-chips.png`
- `02_composer_latest-model-sheet-instant-thinking-configure.png`
- `03_sidebar_chatgpt-images-apps-gpts-projects-recents.png`
- `05_images_home-styles-discover-my-images-empty.png`
- `06_images_home-with-my-images-grid.png`
- `07_chat_image-generation-result-thinking.png`
- `08_chat_image-generation-share-action-card.png`
- `09_chat_more-menu-share-add-rename-archive-delete.png`
- `11_apple-intelligence_chatgpt-extension-model-thinking-effort.png`
- `12_settings_main-account-section-top.png`
- `13_settings_account-orders-personalization-data-archived-security.png`
- `14_settings_app-language-appearance-accent-haptic-voice.png`
- `15_settings_about-report-bug-help-terms-privacy-logout.png`
- `16_settings_personalization-base-style-characteristics-custom-instructions.png`
- `17_settings_personalization-memory-references-advanced.png`
- `18_settings_security-mfa-authenticator-push-passkeys.png`
- `20_composer_plus-menu-camera-photos-create-deep-research-agent-mode-connectors.png`

**Gemini iOS (7 screens):**

- `01_home_empty-state-hi-siddhartha-suggestion-chips.png`
- `02_sidebar_search-new-chat-my-stuff-gems-chats.png`
- `03_composer_tools-sheet-image-video-music-canvas-deep-research-guided-learning.png`
- `04_composer_plus-menu-notebooklm-files-photos-camera.png`
- `05_composer_model-sheet-fast-thinking-pro.png`

**Perplexity iOS (4 screens):**

- `01_home_empty-state-comet-for-ios-banner.png`
- `02_composer_options-sheet-image-camera-file-sources-deep-research.png`
- `03_composer_models-sheet-best-sonar-gpt-gemini-claude-nemotron.png`
- `11_composer_models-sheet-gpt-with-thinking-toggle.png`

---

### **URL References**

**Official Docs & Release Notes:**

- https://help.openai.com/en/articles/6825453-chatgpt-release-notes (ChatGPT iOS updates, model selection, thinking mode)
- https://help.openai.com/en/articles/8400625-voice-mode-faq (Advanced Voice Mode spec)
- https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt (Projects feature)
- https://help.openai.com/en/articles/7885016-chatgpt-ios-app-faq (iOS-specific FAQs)
- https://help.openai.com/en/articles/8590148-memory-faq (Memory & chat history reference)
- https://help.openai.com/en/articles/11487775-connectors-in-chatgpt (Connectors/Apps integration)
- https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps (Claude iOS integrations, health data)
- https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them (Artifacts UI spec)
- https://support.claude.com/en/articles/12138966-release-notes (Claude latest features, extended thinking)
- https://platform.claude.com/docs/en/build-with-claude/extended-thinking (Claude API thinking display patterns)

**Mobile AI Patterns & Best Practices:**

- https://developer.apple.com/design/human-interface-guidelines/sheets (iOS HIG for sheets/modals)
- https://www.learnui.design/blog/ios-design-guidelines-templates.html (iOS 26 design patterns, inset tab bar)
- https://designfornative.com/bottom-sheets-vs-fullscreen-modals/ (Bottom sheet vs fullscreen modal)
- https://mobbin.com/glossary/bottom-sheet (Bottom sheet component spec)
- https://uiuxdesigning.com/ios-tab-bar/ (Tab navigation patterns)

**Local LLM Models & Runtimes:**

- https://github.com/google-ai-edge/gallery (Google AI Edge Gallery — on-device chat reference app)
- https://github.com/ggml-org/llama.cpp (llama.cpp — C++ inference engine for mobile)
- https://huggingface.co/blog/llm-inference-on-edge (Hugging Face: edge LLM deployment)
- https://www.promptquorum.com/local-llms/mobile-local-llms (2026 mobile local LLM overview: PocketPal, MLC Chat)
- https://dev.to/alichherawalla/how-to-run-llms-locally-on-your-iphone-in-2026-completely-offline-no-subscription-4b3a (Local LLM on iPhone tutorial)
- https://dev.to/alichherawalla/how-to-run-vision-ai-locally-on-your-iphone-in-2026-completely-offline-no-account-2c3f (Local vision models on iOS)
- https://medium.com/google-cloud/on-device-ai-with-the-google-ai-edge-gallery-and-gemma-4-1c31a220d3ee (Gemma 4 on-device patterns)
- https://ai.google.dev/edge/litert-lm/overview (Google LiteRT-LM — official mobile LLM runtime)

**Quantization & Model Format:**

- https://www.decodesfuture.com/articles/llama-cpp-gguf-quantization-guide-2026 (GGUF format & quantization levels)
- https://www.aithinkerlab.com/run-claude-ai-locally/ (Running Claude locally — workarounds & alternatives)

**Cloud Features & APIs:**

- https://openai.com/index/introducing-deep-research/ (ChatGPT Deep Research feature)
- https://aimultiple.com/ai-deep-research (Deep research comparison, ChatGPT vs Claude)
- https://felloai.com/ai-search-and-deep-research-comparison-2026/ (2026 deep research benchmarks)

**iOS 27 & Future Standards:**

- https://9to5mac.com/2026/05/05/ios-27-will-let-you-choose-between-gemini-claude-and-more-for-ai-features-report (iOS 27 AI picker system)
- https://9to5mac.com/2026/05/04/openai-releases-a-separate-chatgpt-ios-app/ (ChatGPT enterprise iOS app)
- https://fastmcp.me/Blog/apple-prepares-revolution-mcp-integration-in-macos-ios-ipads (MCP integration in iOS 27)

**Voice & Audio:**

- https://qcall.ai/chatgpt-voice-mode-review (ChatGPT voice mode user experience)
- https://technosports.co.in/claude-voice-mode-getting-biggest-upgrade/ (Claude voice redesign May 2026)
- https://support.claude.com/en/articles/11101966-use-voice-mode (Claude voice mode guide, languages, voices)

**Design Trends & UX Patterns:**

- https://www.groovyweb.co/blog/ui-ux-design-trends-ai-apps-2026 (2026 AI app design trends)
- https://blog.vibecoder.me/empty-states-loading-states-error-states (Empty/loading/error state UX)
- https://www.eleken.co/blog-posts/empty-state-ux (Empty state design best practices)
- https://figr.design/blog/error-state-design-patterns-bfd69 (Error state patterns)

**App Store References:**

- https://apps.apple.com/us/app/claude-by-anthropic/id6473753684 (Claude iOS app)
- https://apps.apple.com/us/app/pocketpal-ai/id6502579498 (PocketPal — leading on-device LLM iOS app)
- https://apps.apple.com/us/app/mlc-chat/id6448482937 (MLC Chat — on-device, cross-platform inference)

**Apple Foundation Models:**

- https://developer.apple.com/documentation/FoundationModels (Apple Foundation Models API docs)
- https://machinelearning.apple.com/research/introducing-apple-foundation-models (Apple Foundation Models research)
- https://dev.to/arshtechpro/apples-foundation-models-framework-run-ai-on-device-with-just-a-few-lines-of-swift-lbp (Apple Foundation Models tutorial)

**AGI Workforce Project (Local References):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/(app)/_layout.tsx` (Drawer navigation structure)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/(app)/(tabs)/chat.tsx` (Chat screen main component)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/stores/chatStore.ts` (Chat state management)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/stores/modelStore.ts` (Model selection state)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/stores/settingsStore.ts` (Settings persistence)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/storage/conversations.ts` (Chat history DB schema)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/storage/installedModels.ts` (GGUF model tracking)
- `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/components/ui/skeleton.tsx` (Loading skeleton component)

---

## APPENDIX: Feature Tagging Summary

| Feature Category    | Status           | CLOUD                   | LOCAL                 | AGI Mobile Action                      |
| ------------------- | ---------------- | ----------------------- | --------------------- | -------------------------------------- |
| Chat messaging      | ✅ Core          | ⚠️ Hybrid               | ✅ Yes                | Build out empty state, thinking chip   |
| Voice I/O           | ⚠️ Partial       | ⚠️ TTS cloud optional   | ✅ Whisper+Piper      | Complete VoiceConversationScreen       |
| Vision / Images     | ⚠️ Partial       | ✅ Image gen cloud-only | ✅ Local analysis     | Wire image preview bar                 |
| Thinking/reasoning  | ❌ Missing       | ✅ Cloud-only           | ❌ No                 | Implement UI chip + modal; tag cloud   |
| Memory              | ✅ History local | ✅ Memory gen cloud     | ✅ Local search       | Implement local search UI              |
| Settings            | ✅ Partial       | ✅ All cloud features   | ✅ Device settings    | Complete IA per spec above             |
| Connectors          | ❌ Missing       | ✅ Cloud-only           | ❌ No                 | Show disabled in local; link to cloud  |
| Projects/Agents     | ❌ Missing       | ✅ Cloud-only           | ❌ No                 | Hide nav items or show "cloud feature" |
| Downloads & storage | ❌ Missing       | —                       | ✅ Yes                | Build model manager UI                 |
| Audio TTS           | ⚠️ Framework     | ⚠️ Cloud available      | ✅ Local Piper/Kokoro | Wire Piper output to voice mode        |

---

**END OF SPEC**
