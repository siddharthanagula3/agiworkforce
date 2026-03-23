# Web Chat Test Cases — Full Parity with Claude.ai / ChatGPT / Gemini

## Test Environment

- URL: agiworkforce.com/chat
- Models to test: auto-economy (GPT-5.4 Nano), Claude Haiku 4.5, GPT-5.4 Mini, Gemini 3.1 Flash
- Browser: Chrome with Claude extension

---

## Category 1: Basic Chat

### TC-001: Send a simple message and get a response

- **Input**: "What is 2+2?"
- **Expected**: User message appears right-aligned, AI response appears left-aligned with "Four" or "4"
- **Verify**: Response renders, streaming cursor shows during generation, input clears after send

### TC-002: Multi-turn conversation

- **Input 1**: "My name is Sid"
- **Input 2**: "What is my name?"
- **Expected**: AI remembers "Sid" from the first message (conversation history sent)

### TC-003: Empty state greeting

- **Expected**: Time-appropriate greeting ("Good morning/afternoon/evening, Sid"), emoji, quick chips

### TC-004: Model selector shows and persists selection

- **Action**: Click model selector, choose a different model
- **Expected**: Dropdown shows 3 auto-tier models, selection persists in button text

---

## Category 2: Markdown Rendering

### TC-010: Headers

- **Input**: "Give me an example with h1, h2, h3 headers in markdown"
- **Expected**: Headers render with correct sizing (h1 large, h2 medium, h3 small)

### TC-011: Lists

- **Input**: "List 5 programming languages as a bulleted list and 5 as a numbered list"
- **Expected**: Unordered list with bullets, ordered list with numbers

### TC-012: Code blocks

- **Input**: "Write a Python hello world program"
- **Expected**: Fenced code block with syntax highlighting, language badge, copy button

### TC-013: Tables

- **Input**: "Create a table comparing Python, JavaScript, and Rust"
- **Expected**: Table renders with headers, rows, borders

### TC-014: Bold, italic, links

- **Input**: "Show me bold text, italic text, and a link to google.com"
- **Expected**: **bold** renders bold, _italic_ renders italic, [link](url) is clickable

### TC-015: Blockquotes

- **Input**: "Give me a famous quote in a blockquote"
- **Expected**: > blockquote renders with left border styling

---

## Category 3: Web Search

### TC-020: Web search toggle

- **Action**: Open + menu, toggle "Web search" on
- **Input**: "What happened in AI news today?"
- **Expected**: AI uses web search, response includes current information with citations

### TC-021: Web search results display

- **Expected**: Globe icon + search query + results badge inline, source citations as pills

### TC-022: Web search with citations

- **Expected**: Response text has inline citation badges linking to sources

---

## Category 4: Thinking/Reasoning

### TC-030: Extended thinking mode

- **Action**: Enable thinking in model selector (if toggle exists)
- **Input**: "Solve this step by step: If a train travels 120km in 2 hours, what is its speed in m/s?"
- **Expected**: Collapsible thinking block shows reasoning steps, then final answer

### TC-031: Thinking block collapse/expand

- **Expected**: Thinking block has chevron toggle, one-line summary when collapsed, full text when expanded

---

## Category 5: Code Execution

### TC-040: Code execution request

- **Input**: "Calculate the first 10 Fibonacci numbers using Python"
- **Expected**: AI writes and executes Python code, shows output inline

### TC-041: Code execution with output

- **Expected**: Code block + execution output rendered separately

---

## Category 6: Tool Calling

### TC-050: Tool call visualization

- **Expected**: Tool icon + tool name + status (running/completed) inline
- **Expected**: Vertical timeline connecting sequential tool calls
- **Expected**: "Done" checkmark when complete

### TC-051: Multiple tool calls in sequence

- **Input**: Complex query requiring multiple tools
- **Expected**: Each tool call shown with its result, connected by timeline

---

## Category 7: Conversation Management

### TC-060: New chat

- **Action**: Click "New Chat" in sidebar
- **Expected**: Creates new conversation, clears chat area, shows greeting

### TC-061: Conversation history in sidebar

- **Expected**: Previous conversations show in sidebar grouped by date

### TC-062: Switch between conversations

- **Action**: Click different conversation in sidebar
- **Expected**: Messages load from that conversation

### TC-063: Search conversations

- **Action**: Click Search in sidebar
- **Expected**: Search modal opens, filters conversations by title

---

## Category 8: UI Components

### TC-070: Sidebar collapse/expand

- **Expected**: Toggle works, icons-only in collapsed mode, persists

### TC-071: Settings modal (8 tabs)

- **Expected**: All 8 tabs accessible, no Models & Keys or Voice (web)

### TC-072: + menu items

- **Expected**: All items have handlers (files, screenshot, Drive, GitHub, Skills, etc.)

### TC-073: Quick chips

- **Expected**: Code, Write, Research, Web Search, Skills — each populates/navigates correctly

### TC-074: Copy/Retry/Thumbs on messages

- **Expected**: Action bar below assistant messages with copy, thumbs up/down, retry

### TC-075: User profile menu

- **Expected**: Settings, Language, Plans, Get apps, Keyboard shortcuts, Log out

---

## Category 9: Response Actions

### TC-080: Copy message

- **Action**: Click copy icon on assistant message
- **Expected**: Message content copied to clipboard, brief "Copied" feedback

### TC-081: Retry message

- **Action**: Click retry icon on assistant message
- **Expected**: Re-sends the last user message, gets new response

### TC-082: Thumbs up/down feedback

- **Action**: Click thumbs up/down on assistant message
- **Expected**: Icon toggles active state

---

## Category 10: Model-Specific Tests

### TC-090: GPT-5.4 Mini (OpenAI)

- **Model**: gpt-5.4-mini
- **Input**: "Hello, what model are you?"
- **Expected**: Response identifies as GPT model

### TC-091: Claude Haiku 4.5 (Anthropic)

- **Model**: claude-haiku-4-5
- **Input**: "Hello, what model are you?"
- **Expected**: Response identifies as Claude model

### TC-092: Gemini 3.1 Flash (Google)

- **Model**: gemini-3.1-flash
- **Input**: "Hello, what model are you?"
- **Expected**: Response identifies as Gemini model

### TC-093: Model switching mid-conversation

- **Action**: Send message with Model A, switch to Model B, send another
- **Expected**: Both responses render, different models used

---

## Category 11: Error Handling

### TC-100: Network error

- **Expected**: Toast notification with error message

### TC-101: Rate limit

- **Expected**: Clear error message about rate limit

### TC-102: Invalid model

- **Expected**: Graceful error, not a crash

---

## Competitor Testing Checklist

### Claude.ai

- [ ] Send a message and observe response rendering
- [ ] Test web search with citations
- [ ] Test thinking/reasoning display
- [ ] Test code execution
- [ ] Test markdown rendering (headers, lists, tables, code)
- [ ] Observe action bar (copy, retry, thumbs)
- [ ] Test sidebar navigation

### ChatGPT

- [ ] Send a message and observe response rendering
- [ ] Test web search
- [ ] Test code interpreter
- [ ] Test markdown rendering
- [ ] Observe response actions

### Gemini

- [ ] Send a message and observe response rendering
- [ ] Test grounding with Google Search
- [ ] Test code execution
- [ ] Test thinking display
- [ ] Observe response actions
