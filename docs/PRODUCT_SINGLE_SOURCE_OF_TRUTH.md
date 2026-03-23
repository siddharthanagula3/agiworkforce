# AGI Workforce — Product Single Source of Truth

> **Reference**: Claude.ai is the primary design reference. ChatGPT and Gemini are secondary references.
> **Principle**: Everything inline. Fewer elements that actually work. Match Claude.ai's simplicity, then add multi-model on top.
> **Last Updated**: March 21, 2026

---

## 1. SIDEBAR

### What Claude Does (PRIMARY REFERENCE)

- **Expanded**: "Claude" logo, PanelLeft toggle icon (top-right of sidebar), New chat (+, Shift+Cmd+O), Search (magnifying glass), Customize (briefcase), Chats (speech bubble), Projects (folder), Artifacts (grid), Code (</> icon), "Recents" label, conversation list, User profile at bottom (avatar + name + plan + download icon + chevron)
- **Collapsed**: Just icons — PanelLeft, +, Search, Customize, Chats, Projects, Artifacts, Code, user avatar at bottom
- **Total items**: 7 nav items + recents list

### What ChatGPT Does

- New chat, Search chats, Images, Apps, Deep research, Codex, GPTs section (Canva, Explore GPTs), Projects section (New project + list), More, User profile (bottom)
- **Total items**: 7 nav items + GPTs section + Projects section

### What Gemini Does

- **Collapsed** (default): Hamburger menu, new chat icon, settings gear at bottom — just 3 icons
- **Expanded**: Hamburger, "Gemini" text, new chat, recent conversations

### AGI Workforce SHOULD DO

- **Expanded sidebar**: PanelLeft toggle, New chat, Search, Chats, Projects, Skills (our differentiator), "Recents" label, conversation list, User profile at bottom (avatar + name + plan badge)
- **Collapsed sidebar**: PanelLeft icon, +, Search, Chats, Projects, Skills icons, user avatar
- **Total items**: 5-6 nav items maximum + recents list
- **Remove**: All 28+ current nav items. No Research, Terminal, Canvas, MCP Tools, Images, Schedules, or "More" popover in sidebar. These move to Command Palette (Cmd+K) or are accessible via chat
- **Collapse animation**: Smooth width transition like Claude (260px → 64px)

---

## 2. EMPTY STATE (New Chat)

### What Claude Does

- Centered greeting: Claude sparkle icon + playful text ("Moonlit chat?")
- Input box: "How can I help you today?" placeholder
- Bottom bar of input: + button (left), model selector "Opus 4.6 Extended v" (right), voice icon (right)
- Quick chips below input: </> Code, ✏ Write, 🎓 Learn, 📁 From Drive, 📧 From Gmail
- Dark warm background, clean, no clutter

### What ChatGPT Does

- "Hey, SIDDHARTHA. Ready to dive in?" / "Where should we begin?"
- Input: "Ask anything", + button, Extended thinking toggle (brain icon + "Extended thinking v"), mic, voice mode circle
- No quick chips on empty state

### What Gemini Does

- Gemini sparkle + "Hi Siddhartha" + "What should we do today?"
- Input: "Ask Gemini 3", + button, Tools (sliders icon), "Pro v" picker, mic
- Quick chips: For you, 🖼 Create image, 🎵 Create music, Create video, Help me learn, Write anything

### AGI Workforce SHOULD DO

- Centered greeting with app icon + warm text
- Input box: "How can I help you today?" or "Ask anything"
- Bottom bar of input: + button (attachments), model selector dropdown (provider + model + mode), voice icon
- Quick chips below: Web, Code, Write, Research, Skills (our differentiator)
- Clean, dark background, no sidebar features visible in main area

---

## 3. THINKING / REASONING BLOCKS

### What Claude Does

**In-progress (streaming)**:

- Orange asterisk spinner icon (Claude's brand icon)
- Then "Thinking" text appears

**In-progress (with tool calls)**:

- Collapsible header: dynamic summary text like "Synthesizing project architecture and crafting comprehensive master prompt >" — chevron `>` to expand
- Inside expanded block:
  - Clock icon ⏱ + thinking text in regular weight ("The user wants to know about...")
  - Tool call: Link/chain icon 🔗 + tool name ("read_multiple_files")
  - "Result" green pill badge (collapsible)
  - Vertical line connecting sequential steps on the left side
  - More clock icon + thinking text between tool calls
  - Checkmark ✅ + "Done" when complete
  - "Show more" link for truncated content

**Collapsed (finished)**:

- One-line summary: "Synthesized recent SpaceX Starship updates comprehensively `>`" — click to expand/collapse

### What ChatGPT Does

**In-progress (streaming)**:

- Thinking text streams directly in chat: "I'm checking the freshest Starship updates and prioritizing items..."
- "Thinking" label below the thinking text
- "Searching www.space.com" / "Searching www.spacex.com" — plain text, one site at a time

**Collapsed (finished)**:

- "Thought for 2m 11s >" — click opens RIGHT SIDE PANEL called "Activity"

**Activity Side Panel (RIGHT SIDE)**:

- Header: "Activity · 2m 11s" with X close button
- "Thinking" section header
- Each search: Globe icon 🌐 + "Searching for today's SpaceX Starship news updates"
- Source pills below each search: favicon + domain badges (www.spacex.com, www.reuters.com, "3 more")
- Bullet points with thinking paragraphs between searches
- Multiple search rounds with different query refinements
- Full thinking text visible, scrollable

### What Gemini Does

**In-progress**:

- Gemini sparkle icon ✦ + dynamic label ("Constructing the Interface") + `v` chevron
- Label changes to describe what it's currently doing
- Cursor blinking below

**Collapsed (finished)**:

- "Show thinking" + `v` chevron

**Expanded**:

- "Show thinking" + `^` chevron (flipped)
- Left vertical border line (subtle gray)
- **Bold italic section headers** ("Defining the Goal")
- Italic thinking text in regular paragraphs
- Content indented behind the left border

### AGI Workforce SHOULD DO

- **Follow Claude's pattern** (inline, not side panel like ChatGPT)
- In-progress: App icon spinner → collapsible header with dynamic summary
- Tool calls inline: icon + tool name + collapsible "Result" badge
- Vertical line connecting sequential steps
- Clock icon + thinking text between steps
- Checkmark + "Done" when complete
- Collapsed: one-line summary + `>` chevron
- Expanded: full thinking + tool calls + results
- **NO side panel for thinking** — keep it inline like Claude

---

## 4. WEB SEARCH (Inline)

### What Claude Does

- Globe icon 🌐 + search query text ("SpaceX Starship news today 2026") + "10 results" badge (right-aligned)
- Expandable results card below: rows of favicon + article title + domain
- Multiple searches stack vertically
- Search results disappear into collapsed thinking block when done

### What ChatGPT Does

- "Searching www.space.com" — plain text, one site at a time during streaming
- In Activity panel: globe icon + query + source pills with favicons
- Citations in final response: small pills like "Space +1", "Reuters +1"

### What Gemini Does

- Search happens inside thinking block, not separately visible
- No explicit search UI in the main chat stream

### AGI Workforce SHOULD DO

- Follow Claude: Globe icon + search query + result count badge
- Expandable card with results (favicon + title + domain per row)
- Multiple searches stack vertically inline
- Citations in response as small source badges

---

## 5. INLINE CITATIONS

### What Claude Does

- Small rounded pills inline in text: "Space.com", "Gizmodo", "Teslarati"
- Light background, small font, subtle — don't break reading flow
- Click opens source

### What ChatGPT Does

- Small pills at end of sentences: "Space +1", "Reuters +1"
- "+1" indicates additional sources
- Click expands to show all sources

### What Gemini Does

- No visible inline citations in standard responses

### AGI Workforce SHOULD DO

- Follow Claude: Small rounded pills inline — source name, clickable
- Show after relevant sentences, not at the end of paragraphs

---

## 6. IMAGE GENERATION (Inline)

### What ChatGPT Does (PRIMARY REFERENCE for image gen)

**In-progress**:

- "Creating image • Sunset over mountain lake reflections" — status text (auto-generated description)
- Image progressively renders inline — starts blurry, sharpens gradually
- The image itself IS the progress indicator — no spinner

**Complete**:

- "Image created • Futuristic AI assistant interface in use" — status changes
- Full image inline, large
- Action icons below: Copy, Download, More (...)

### What Gemini Does

**In-progress**:

- "Show thinking" block above
- Image renders after thinking completes

**Complete**:

- Image inline, large
- Small Gemini sparkle watermark bottom-right
- Action icons: thumbs up, thumbs down, retry, share, more

### AGI Workforce SHOULD DO

- "Creating image • [auto-description]" status text inline
- Progressive image render (blur → sharp) if possible, or loading placeholder
- Complete: full image inline with action icons (copy, download, more)
- **NO separate images panel** — image lives in the chat stream
- NO artifacts panel opening for images

---

## 7. VIDEO GENERATION (Inline)

### What Gemini Does (PRIMARY REFERENCE)

**In-progress**:

- "Show thinking" collapsible above
- Text: "I'm generating your video. This could take a few minutes, so check back to see when your video is ready."
- Progress card: Film clapperboard icon 🎬 + "Generating your video..." + "This can take 1-2 mins"
- Input bar stays active — user can keep chatting

**Complete**:

- "Your video is ready!" text
- Inline video player with play button overlay
- Click plays inline — no modal, no new page
- Action icons below

### AGI Workforce SHOULD DO

- Status text: "Generating your video..."
- Progress card with icon + estimated time
- Complete: inline video player with play button
- Click plays inline — NO modal, NO new page, NO separate panel
- User can keep chatting while video generates

---

## 8. RESPONSE FORMAT & ACTIONS

### What Claude Does

- Rich markdown: headers (bold, large), body text, tables, bullet lists, numbered lists
- Tables render inline — full width, clean borders
- **End of response actions**: Copy (clipboard icon), Thumbs up, Thumbs down, Retry (4 icons in row)
- **Share button**: top-right corner during response
- **"Reply..."** placeholder in input bar during and after response
- Disclaimer: "Claude is AI and can make mistakes. Please double-check responses." (bottom center)

### What ChatGPT Does

- Rich markdown: headers, bold, body text, bullet lists
- **End of response actions**: Copy, Thumbs up, Thumbs down, Retry, Share, more (...)
- **"Ask anything"** placeholder changes to **"Follow up"** during conversation
- Disclaimer: "ChatGPT can make mistakes. Check important info." (bottom center)

### What Gemini Does

- Rich markdown: headers, body text, bold
- **End of response actions**: Thumbs up, Thumbs down, Retry, Share, More (...)
- Disclaimer: "Gemini is AI and can make mistakes." (bottom center)

### AGI Workforce SHOULD DO

- Rich markdown with proper rendering (headers, bold, tables, lists, code blocks)
- Tables render inline — no side panel
- End of response: Copy, Thumbs up, Thumbs down, Retry (4 icons minimum)
- Share button top-right
- Disclaimer at bottom
- Input placeholder: "Reply..." or "Ask anything"

---

## 9. INPUT BAR

### What Claude Does

- Textarea: "How can I help you today?" (new chat) / "Reply..." (in conversation)
- Bottom bar: + button (left) | model selector "Opus 4.6 Extended v" (right) | voice equalizer icon (right)
- During streaming: stop icon (eye icon) replaces voice icon

### What ChatGPT Does

- Textarea: "Ask anything" / "Follow up"
- Bottom bar: + button | Extended thinking toggle (brain icon + "Extended thinking v") | mic | voice mode (circle with waves)
- During streaming: black square stop button replaces voice

### What Gemini Does

- Textarea: "Ask Gemini 3"
- Bottom bar: + button | Tools (sliders) | "Pro v" model picker | mic
- During streaming: blue square stop button

### AGI Workforce SHOULD DO

- Textarea: "How can I help you?" (new chat) / "Reply..." (in conversation)
- Bottom bar: + button (attachments, left) | model selector "Provider Model v" (right) | voice icon (right)
- During streaming: stop button replaces voice icon
- Model selector shows: provider name + model name + mode (e.g., "OpenAI GPT-4o" or "Claude Opus 4.6 Extended")
- **This is our differentiator** — multi-model selector vs Claude's single model

---

## 10. HEADER BAR

### What Claude Does

- Left: (nothing, sidebar has the brand)
- Center: Auto-generated conversation title + `v` dropdown (rename, etc.)
- Right: Share button (appears after response starts)

### What ChatGPT Does

- Left: ChatGPT logo
- Center: "ChatGPT v" dropdown (model selector alternative)
- Right: Share + Upload + More (...)

### What Gemini Does

- Left: "Gemini" text
- Center: Conversation title (after first message)
- Right: Share + More + Avatar

### AGI Workforce SHOULD DO

- Left: (sidebar handles brand)
- Center: Auto-generated conversation title + dropdown
- Right: Share button (appears after first response)

---

## 11. USER PROFILE (Bottom of Sidebar)

### What Claude Does

- Avatar circle (initials "SN" with gradient) + Name "Siddhartha Nagula" + Plan "Max plan" + Download icon + Chevron up/down
- Clicking opens popover with: email, plan badge, appearance toggle (Light/Dark/System), language selector, Account, Preferences, Personalization, Shortcuts, Connectors, Help, Log Out

### What ChatGPT Does

- Avatar + "SIDDHARTHA NAGULA" + "Plus" plan

### What Gemini Does

- Settings gear icon (bottom-left), Google avatar (top-right)

### AGI Workforce SHOULD DO

- Avatar (initials or image) + Name + Plan badge
- Click opens popover: email, plan, appearance toggle, settings, shortcuts, connectors, help, log out
- Keep it clean — exactly like Claude's UserProfile component (which we already have)
- **Fix the overflow issue** (already done this session)

---

## 12. ARTIFACTS / DOCUMENTS

### What Claude Does

- Artifacts open in a **right-side panel** ONLY when explicitly generated (code, HTML, React, SVG, Mermaid)
- Normal responses do NOT open the artifacts panel
- Code blocks in regular responses stay inline
- 6 artifact types: Code, Markdown documents, HTML pages, SVG, Mermaid, React components

### What ChatGPT Does

- Code and canvas content open in right side panel (similar to Claude)
- Normal responses stay inline

### AGI Workforce SHOULD DO

- **NO artifacts panel by default** — everything inline
- Artifacts panel opens ONLY when user explicitly asks for a document, or when code/HTML needs a preview
- Code blocks in responses: render inline with syntax highlighting + copy button
- Tables: render inline, never in artifacts panel
- Images: inline, never in artifacts panel
- This is a MAJOR change from current behavior

---

## 13. WHAT TO KEEP vs REMOVE

### KEEP (in sidebar)

1. New Chat
2. Search
3. Chats (conversation list)
4. Projects
5. Skills (our differentiator)

### MOVE TO CMD+K (Command Palette)

- Terminal, Canvas, MCP Tools, Images gallery, Schedules, Git, Research, Database, Workflows, Documents, Calendar, Artifacts gallery, Tasks, Vision, Computer Use, Automation, Analytics, ROI Dashboard, Memory, Teams, Cloud, Connectors, Marketplace, Governance, Mobile Companion

### REMOVE ENTIRELY

- "More" popover with 20+ items
- 28+ sidebar nav items
- Any feature that's a SHELL (no real backend)

---

## 14. DIFFERENTIATORS TO HIGHLIGHT IN UI

These are things Claude/ChatGPT/Gemini DON'T have that we show prominently:

1. **Multi-model selector** in input bar — user can switch providers mid-conversation
2. **BYOK indicator** — show "Your API key" or similar when using BYOK
3. **Local model indicator** — "Local" badge when using Ollama
4. **Skills** in sidebar — 150+ non-coding skills, browsable
5. **Mobile agent oversight** — show connection status when phone is paired
6. **Cost tracking** — subtle token/cost indicator (Claude doesn't show this)

---

## 15. DESIGN TOKENS (Match Claude.ai)

### Colors (Dark Theme)

- Background: warm dark (#1a1915 or similar olive-dark)
- Card/Input: slightly lighter dark with subtle border
- Text: off-white (#e8e4db)
- Muted text: gray (#8b8680)
- Accent/Brand: warm tone (not cold blue)
- User message bubble: darker card color
- Thinking text: muted gray
- Citations: small pills with subtle background

### Typography

- Sans-serif system font stack
- Response text: ~15-16px, 1.6 line height
- Headers: bold, larger
- Code: monospace
- Thinking text: same size, muted color
- Tool names: regular weight, muted

### Spacing

- Chat messages: generous vertical spacing between messages
- Sidebar: compact but readable
- Input bar: fixed bottom, ~60px height with padding

---

## SUMMARY: THE 3 RULES

1. **Everything inline** — images, videos, tool results, search results, thinking blocks, tables. NO side panels unless user explicitly asks for a document preview.

2. **Collapsible everything** — thinking blocks, tool results, search results. Clean by default, expandable on demand. One-line summary when collapsed.

3. **5 sidebar items, not 28** — New Chat, Search, Chats, Projects, Skills. Everything else via Cmd+K.

---

---

## 16. DOCUMENT CREATION (Word/DOCX)

### What Claude Does (Live tested March 21, 2026)

**Flow**: Claude uses Cowork mode — multi-step tool calling to create actual .docx files.

**In-progress states captured**:

1. T+0s: Orange asterisk spinner only
2. T+2s: Thinking collapsed ("Orchestrated comprehensive business proposal framework...") + bold text + "Running command >" collapsible + spinner
3. T+5s: Two thinking blocks stacked — first collapsed, second showing tool calls with "Script" badges
4. Tool chain visible inside expanded thinking:
   - ⏱ "Let me read the docx skill first, then create the document"
   - 📄 "Reading the docx skill for best practices"
   - ⏱ "Let me also check the truncated portion"
   - 📄 "Reading truncated portion of docx skill"
   - ⏱ "Now I have the full skill. Let me create..."
   - ✅ "Done"
   - Bold: "Now let me build this proposal with real details"
   - Second thinking block:
   - 📦 "Ensure docx is installed" + **"Script"** badge
   - ⏱ "Good, docx is installed"
   - 📝 "Creating the AGI Workforce business proposal document" + **"proposal.js"** file badge
   - Live code streaming (syntax highlighted JS for docx-js)
   - 📦 "Generate the docx file" + **"Script"** badge
   - 📦 "Validate the generated document" + **"Script"** badge
   - ⏱ "Document validated. Let me copy to outputs and present."
   - 📦 "Running command" + **"Script"** badge

**Complete state**:

- Left (chat): Description of document sections + **file download card** (document icon + "Agi workforce business proposal" + "Document · DOCX" + Google Drive icon + "Download" button)
- Right (artifact panel): DOCX rendered as page preview — title page with company name, subtitle, author, date
- Action icons: Copy, Thumbs up, Thumbs down, Retry

### AGI Workforce SHOULD DO

- Multi-step tool calling inline with collapsible thinking blocks
- File badges showing file names (e.g., "proposal.js", "neon-calculator.html")
- Script badges for execution steps
- Download card inline in chat with file type label + Download button
- Document preview in right panel (like Claude)
- Vertical line connecting sequential tool-call steps

---

## 17. HTML ARTIFACT CREATION

### What Claude Does (Live tested)

**In-progress states**:

1. T+0s: Thinking + "Read frontend design skill for best practices"
2. T+5s: Thinking collapsed + tool chain: Read skill → HTML icon + "Creating an interactive neon calculator..." → live CSS/HTML code streaming inline
3. Near completion: File badge "neon-calculator.html" → "Presenting file(s)..."

**Complete state**:

- Left (chat): Thinking collapsed + feature description text + download card (`</>` icon + "Neon calculator" + "Code · HTML" + "Download" button)
- Right (artifact panel):
  - Header: Eye icon (preview toggle) + `</>` (code toggle) + "Neon calculator · HTML" + Copy + dropdown + retry + X
  - **LIVE interactive preview** — fully functional calculator in panel
  - Can toggle between preview and code view
  - Sidebar collapses to icons to make room

### AGI Workforce SHOULD DO

- HTML artifacts: live preview in right panel with toggle between preview/code
- Interactive — buttons, inputs, animations work in preview
- Download card inline in chat
- Code streams inline during generation
- Panel has: preview toggle, code toggle, copy, download, close

---

## 18. TOOL CALLING UI PATTERNS (Distilled from all tests)

### Icon Types Used by Claude

| Icon                | Meaning                               |
| ------------------- | ------------------------------------- |
| ✳ Orange asterisk   | Claude is thinking (spinner)          |
| ⏱ Clock             | Thinking/reasoning text between steps |
| 📄 Document         | Reading a file/skill                  |
| 📦 Package/terminal | Running a script/command              |
| 📝 Code/edit        | Creating/writing a file               |
| 🌐 Globe            | Web search                            |
| 🔗 Link/chain       | MCP tool call                         |
| ✅ Checkmark        | Step completed / "Done"               |
| `</>` HTML          | HTML artifact                         |

### Badge Types

| Badge           | Appearance                            | Meaning                   |
| --------------- | ------------------------------------- | ------------------------- |
| **"Script"**    | Small gray pill                       | A script was executed     |
| **"Result"**    | Small green pill                      | Tool result (collapsible) |
| **File name**   | Small gray pill (e.g., "proposal.js") | File was created/read     |
| **"X results"** | Right-aligned count                   | Search result count       |

### Connector

- **Vertical line** on left side connecting sequential steps within a thinking block
- Steps are visually chained — reads top to bottom like a timeline

---

## 19. ARTIFACT PANEL DETAILS (Claude.ai)

### Panel Header

- **Left**: Eye icon (preview mode) + `</>` icon (code mode) — toggle between views
- **Center**: Artifact title + type ("Neon calculator · HTML")
- **Right**: Copy button + dropdown chevron + Retry (circular arrow) + Close (X)

### Dropdown Options

- **Download** — saves the file locally
- **Publish artifact** — creates a public URL for sharing

### Preview Mode (Eye icon active)

- **Fully interactive sandboxed iframe** — buttons work, JS executes, animations play
- Calculator example: clicked 2 + 4 = and got 6 — real JavaScript execution
- Not a static image — a live running app

### Code Mode (`</>` icon active)

- Full source code with **line numbers** (gray, left-aligned)
- **Syntax highlighting** (HTML tags, CSS properties, JS keywords all colored)
- Scrollable — code can be hundreds of lines
- Monospace font, dark background

### Panel Behavior

- Opens on the **right side** of the screen
- Chat area **narrows** to make room (split view)
- Sidebar **collapses to icons** when panel opens
- Panel width: approximately 50% of screen
- Smooth open/close animation

### File Download Card (in chat, left side)

- Icon (varies: `</>` for code, document icon for docs) + artifact title + type label ("Code · HTML" or "Document · DOCX") + **"Download"** button
- Appears inline in chat below the response text
- Clicking the card also opens the artifact panel

### AGI Workforce SHOULD DO

- Match Claude's artifact panel exactly: preview/code toggle, copy, download, publish, retry, close
- Fully interactive HTML preview (sandboxed iframe)
- Code view with line numbers + syntax highlighting
- Panel opens right side, chat narrows, sidebar collapses
- Download card inline in chat
- Only open panel for artifacts (code, HTML, documents) — NOT for regular text responses

---

## 20. PERPLEXITY (Blocked — Manual Testing Required)

Perplexity blocks Chrome extension scripting via ExtensionsSettings CSP policy. Cannot automate or screenshot via Claude in Chrome. The user needs to test manually and share screenshots, or findings are from documentation research only.

### Perplexity UI Patterns (LIVE TESTED March 21, 2026)

**Sidebar**:

- Two mode tabs at top: **Search** (active) + **Computer**
- New thread, History, Discover, Spaces, Finance, More
- Recent threads list
- User profile at bottom (avatar + name + Pro badge + notification bell)
- **Total items**: 6 nav + recents

**Empty state**:

- "perplexity pro" heading centered
- Input: "Ask anything...", + button, Model dropdown, Computer button, mic, voice mode
- Feature cards below: "Select a model", "Try Computer", "Try Deep Research"

**Top tabs on results page**: Answer | Links | Images — three views of same query

**"Completed N steps" (thinking/search progress)**:

- Collapsible header: "Completed 3 steps `v`"
- Expanded shows multi-step search process:
  - Step 1: 🌐 "Identifying the most popular AI desktop applications in March 2026" `v`
    - 🔍 Search queries listed: "top AI desktop apps 2026", "best AI desktop applications March 2026"
    - Results: favicon + title + source domain
    - "+12 more" expandable link
  - Step 2: 🌐 "Searching the web for the latest AI desktop applications in March 2026" `v`
    - More refined queries: "Claude desktop app features 2026", "ChatGPT desktop app 2026"
    - Results with "+9 more"
  - Step 3: 🔄 "Retrieving relevant articles to compile..." `v`

**Response format**:

- Rich markdown: headers, bold, tables, bullet lists
- **Tables render inline** — comparison tables with columns
- **Inline citations** as small pill badges: "techspot +1", "YouTube", "o-mega", "timingapp +1"
- "+1" indicates additional sources behind that citation

**Action bar (below response)**:

- Share, Download, Copy, Rewrite icons (left)
- Source favicons + **"27 sources"** count (center)
- Thumbs up, Thumbs down, More (right)

**Follow-ups section**:

- "Follow-ups" header
- 5 clickable suggested follow-up questions with arrow icons
- Some have a **"Computer"** badge indicating they'd trigger the Computer agent
- These are AI-generated next-step suggestions

**Links tab**: Google-style search results — favicon + source + URL + blue title + description + thumbnail
**Images tab**: Masonry grid of web images with source labels below each

**Input bar (in conversation)**: "Ask a follow-up" placeholder, + button, Model dropdown, mic, send

### AGI Workforce SHOULD DO

- **Follow-up suggestions** below responses — AI-generated clickable next questions (Perplexity's best feature)
- **Source count** in action bar: "27 sources" with favicons
- Citation pills inline: "source +N" format
- Consider the Answer/Links/Images tabs for web search results (unique to Perplexity, may not be needed)
- **"Completed N steps"** collapsible is a great pattern — similar to Claude's thinking but more structured with explicit step numbering

---

### AGI Workforce SHOULD DO

- Implement the same icon vocabulary for tool calls
- Use badge pills for file names, script executions, and results
- Vertical line connecting steps
- Collapsible — one-line summary when collapsed, full timeline when expanded

---

_This document is the single source of truth for AGI Workforce product design. All UI decisions should reference this document. When in doubt, check how Claude.ai does it._

---

## 21. CONNECTORS ECOSYSTEM (Live tested March 21, 2026)

### What Claude Does

**Location**: Sidebar > Customize > Connectors

**Layout**: Three-panel — left (Customize nav: Skills, Connectors), middle (connector list with search + add), right (selected connector detail)

**Connected connectors (Web category):**

- GitHub (Octocat icon)
- Gmail (Gmail icon)
- Google Drive (Drive icon)
- Vercel (▲ icon)

**Not connected:**

- Google Calendar
- n8n

**Adding connectors — Two methods:**

1. **Browse connectors** — Opens marketplace modal
2. **Add custom connector** — Manual MCP server configuration

**Connector Marketplace Modal:**

- Header: "Connectors" + X close
- Subtitle: "Connect Claude to your apps, files, and services. Connectors are built by third parties and reviewed by Anthropic for safety. You can also add a custom connector."
- **Search bar** + **Sort** dropdown + **Type** dropdown + **Categories** dropdown
- Cards in 2-column grid with: icon + name + popularity rank badge + description + add/connected indicator

**Available connectors (sorted by popularity):**

1. Gmail — "Most popular" — Draft replies, summarize threads, & search your inbox
2. Google Calendar — #2 popular — Manage your schedule and coordinate meetings
3. (Google Drive — connected, not in marketplace)
4. Canva — #4 popular — Search, create, autofill, and export Canva designs
5. Notion — #5 popular — Connect your Notion workspace to search, update, and power workflows
6. Figma — #6 popular — Generate diagrams and better code from Figma context
7. Slack — #7 popular — Send messages, create canvases, and fetch Slack data
8. Atlassian — #8 popular — Access Jira & Confluence from Claude
9. HubSpot — Chat with your CRM data to get personalized insights
10. Linear — Manage issues, projects & team workflows in Linear
11. monday.com — ✧ Interactive badge — Manage projects, boards, and workflows
12. Intercom — Access to Intercom data for better...
13. Box — ✧ Interactive badge — Search, access and get insights on...
14. n8n — Access and run your n8n workflows
15. ClickUp — Project management & collaboration for teams & agents
16. Context7 — Up-to-date docs for LLMs and AI code editors
17. Microsoft Learn — Search trusted Microsoft docs to power your development
18. Stripe — Payment processing and financial infrastructure tools
19. Hugging Face — Access the Hugging Face Hub and thousands of Gradio Apps
20. Fireflies — Analyze and generate insights from meeting transcripts
21. Clay — ✧ Interactive — Find prospects. Research accounts. Personalize outreach
22. S&P Global — Query a range of S&P Global datasets
23. Mermaid Chart — Validates Mermaid syntax, renders diagrams as high-quality SVG
24. Ahrefs — SEO & AI search analytics
25. NetSuite — Connect Claude to NetSuite data for analysis & insights
26. Webflow — Manage Webflow CMS, pages, assets and sites
27. Apollo.io — Find buyers. Book more meetings. Close more deals
28. Cloudflare Developer Platform — Build applications with compute, storage, and AI
29. Clinical Trials — Access ClinicalTrials.gov data
30. PitchBook Premium — PitchBook data, embedded in the way you work
31. ZoomInfo — Enrich contacts & accounts with GTM intelligence
32. WordPress.com — Secure AI access to manage your WordPress.com sites
33. Smartsheet — Analyze and manage Smartsheet data with Claude
34. Semantic Discovery — Enhance responses with scholarly research and citations
35. Ramp — Search, access, and analyze your Ramp financial data

**Category filters (10 categories):**

- Code, Communication, Data, Design, Development, Financial services, Health, Life sciences, Productivity, Sales and marketing

**Type filters:**

- Interactive (New) — connectors with interactive UI elements
- PLATFORM section: Desktop, Web

**Connector Detail Panel (per-connector):**

- Header: icon + name + "Disconnect" button + "..." menu (+ "View details" for some)
- Description paragraph
- **Tool permissions** with 3-tier system:
  - **Read-only tools** — count badge — bulk dropdown (Auto/Ask/Blocked)
  - **Write/delete tools** — count badge — bulk dropdown
  - **Other tools** — count badge — bulk dropdown (for actions like deploy)
  - Each individual tool has 3 toggle icons: Auto-approve (circle check), Ask first (hand), Blocked (circle-slash)

**Example — Gmail connector tools:**

- Read-only (6): Get Gmail Profile, List Gmail Drafts, List Gmail Labels, Read Gmail Email, Read Gmail Thread, Search Gmail Emails
- Write/delete (1): Create Gmail Draft

**Example — Vercel connector tools:**

- Read-only (13): check_domain_availability_and_price, get_access_to_vercel_url, get_deployment, get_deployment_build_logs, get_project, get_runtime_logs, get_toolbar_thread, list_deployments, list_projects, list_teams, list_toolbar_threads, Search Vercel Documentation, web_fetch_vercel_url
- Write/delete (4): add_toolbar_reaction, change_toolbar_thread_resolve_status, edit_toolbar_message, reply_to_toolbar_thread
- Other (1): deploy_to_vercel

### AGI Workforce SHOULD DO

- **Call them "Connectors" not "MCP servers"** — user-friendly naming
- Marketplace modal with search, sort, type, categories filters
- Popularity ranking badges
- 3-tier permission system (auto/ask/blocked) per tool
- Bulk category-level permission toggles + individual tool toggles
- "Interactive" badge for connectors with rich UI
- Custom connector option for power users (MCP server URL)
- "Reviewed by [us] for safety" trust signal
- Start with: Gmail, Google Calendar, Google Drive, Slack, Notion, GitHub, Linear, Figma, Vercel (top priority integrations)

---

## 22. SKILLS SYSTEM (Live tested March 21, 2026)

### What Claude Does

**Location**: Sidebar > Customize > Skills

**Layout**: Three-panel — left (Customize nav), middle (skills list with search + add), right (skill detail/preview)

**Skill structure:**

- **My skills** section — user-created skills (e.g., "humanizer")
- **Examples** section — Anthropic-provided templates

**Example skills (Anthropic-provided):**

- algorithmic-art
- brand-guidelines
- canvas-design
- doc-coauthoring
- internal-comms
- mcp-builder
- skill-creator
- slack-gif-creator
- theme-factory
- web-artifacts-builder

**Skill detail panel:**

- Title + on/off toggle (blue) + ... menu
- Metadata: Added by (User or Anthropic), Last updated (date), Invoked by (User or Claude)
- Description with ℹ info icon — detailed trigger description
- Content preview card with eye (preview) / </> (source) toggle
- Allowed tools listed (e.g., Read, Write, Edit, Grep, Glob, AskUserQuestion)
- Multi-file support: SKILL.md + additional files (README.md, WARP.md) + folders (reference/, scripts/)

**Adding skills — Two methods (via + button):**

1. Browse/create new skills
2. Import existing skills

**Key insight**: Skills are markdown files with metadata frontmatter (description, allowed tools, invocation rules). They're auto-triggered when Claude determines the skill matches the user's request (based on description matching).

### AGI Workforce SHOULD DO

- Match Claude's skill structure: title, toggle, metadata, description, content preview
- Support multi-file skills with folders
- Eye/code toggle for preview vs source view
- "Allowed tools" — specify which tools the skill can access
- "Invoked by" — User only, Claude only, or both
- Example skills library as starting templates
- Search and add (+) functionality
- **Our differentiator**: 150+ pre-built professional skills vs Claude's ~10 examples

---

## 23. PROJECTS (Live tested March 21, 2026)

### What Claude Does

**Location**: Sidebar > Projects

**Projects list page:**

- Header: "Projects" + "+ New project" button
- Search bar: "Search projects..."
- Sort by: Activity dropdown
- Project cards in grid: name + description + "Updated X ago"
- "Example project" badge on Anthropic-provided template

**Project detail page:**

- Back navigation: "← All projects"
- Project name + ... menu + star (favorite) icon
- Input box with model selector (can start new chat within project)
- Conversation list: title + "Last message X ago"
- **Right sidebar with 3 sections:**
  1. **Memory** — auto-populated from conversations, privacy toggle ("Only you"), pencil edit icon, last updated timestamp
  2. **Instructions** — custom instructions to tailor Claude's responses, + button to add
  3. **Files** — upload PDFs, documents, or text to reference in project, + button to add

### AGI Workforce SHOULD DO

- Match project structure: name, description, favorite, conversation list
- Right sidebar: Memory (auto-populated), Instructions (custom), Files (reference docs)
- Memory privacy controls
- Project-specific model selection
- Conversation list within project context

---

## 24. ARTIFACTS GALLERY (Live tested March 21, 2026)

### What Claude Does

**Location**: Sidebar > Artifacts

**Two tabs:**

1. **Inspiration** — pre-built artifact templates in a grid
2. **Your artifacts** — user's created artifacts with previews

**Inspiration tab:**

- Category pills: All, Learn something, Life hacks, Play a game, Be creative, Touch grass
- Cards in 3-column grid with: preview thumbnail + title
- Pre-built templates: Writing editor, PRD To Prototype, Slack Project Insights, Raw Note Transformer, Brainstorm Idea Generator, Flashcards

**Your artifacts tab:**

- Grid of all user-created artifacts
- Each card: rendered preview of content + title + "Last edited X ago"
- Shows markdown/document previews with text visible in thumbnails

**"+ New artifact" button** in top right

### AGI Workforce SHOULD DO

- Artifacts gallery with Inspiration (templates) and Your artifacts tabs
- Category filtering for templates
- Preview thumbnails for artifacts
- "+ New artifact" button
- Our differentiator: professional skill-based templates (legal docs, business proposals, etc.)

---

## 25. MODEL SELECTOR (Live tested March 21, 2026)

### What Claude Does

**Dropdown from input bar** (right side):

- **Opus 4.6** — "Most capable for ambitious work"
- **Sonnet 4.6** — "Most efficient for everyday tasks" (default, checkmark)
- **Haiku 4.5** — "Fastest for quick answers"
- **Extended thinking** toggle (blue, on/off) — "Think longer for complex tasks"
- **More models** → submenu: Opus 4.5, Opus 3, Sonnet 4.5

**Display format in input bar**: "Sonnet 4.6 Extended v" (model name + "Extended" if thinking enabled + dropdown chevron)

### AGI Workforce SHOULD DO

- Model selector in input bar (right side) — **this is our key differentiator** (multi-provider)
- Show: Provider + Model + Mode (e.g., "OpenAI GPT-4o" or "Anthropic Opus 4.6 Extended")
- Group by tier: Flagship (most capable), Standard (efficient), Fast (quick)
- Extended thinking / reasoning toggle
- "More models" submenu for legacy/additional models
- **BYOK indicator** when using user's own API keys

---

## 26. USER PROFILE POPOVER (Live tested March 21, 2026)

### What Claude Does

**Bottom of sidebar**: Avatar (initials "SN" with gradient) + Name "Siddhartha Nagula" + "Max plan" + Download icon + Chevron

**Popover menu items:**

- Email address (siddharthanagula3@gmail.com)
- ⚙ Settings (⇧⌘,)
- 🌐 Language →
- ❓ Get help
- 📊 View all plans
- 📱 Get apps and extensions
- 🎁 Gift Claude
- ℹ Learn more →
- 🚪 Log out

**Note**: Simpler than previously documented. No inline appearance toggle, no Preferences/Personalization/Shortcuts/Connectors links in popover.

### AGI Workforce SHOULD DO

- Match simplified structure: email, settings, language, help, plans, apps, log out
- Add: Appearance toggle (Light/Dark/System) — inline in popover for quick access
- Add: Keyboard shortcuts link

---

## 27. SIDEBAR ITEMS (Confirmed March 21, 2026)

### What Claude Does

**Expanded sidebar (7 nav items + recents):**

1. - New chat (⇧⌘O shortcut)
2. 🔍 Search
3. 💼 Customize (briefcase icon)
4. 💬 Chats
5. 📁 Projects
6. 🔲 Artifacts (grid icon)
7. </> Code (external link icon ↗ — opens Claude Code)
8. "Recents" label + conversation list
9. User profile at bottom

**Collapsed sidebar:**

- Just icons for each item
- Smooth width transition (expanded ~260px → collapsed ~48px)

### AGI Workforce SHOULD DO

- 6 nav items max: New Chat, Search, Customize, Chats, Projects, Skills
- Skills replaces Artifacts as our differentiator
- Code as external link (optional)
- Recents list below nav items
- User profile at bottom with plan badge

---

## 28. CHANGELOG FEATURE MAP (August 2025 - March 2026)

### Features Claude Has Shipped (mapped to our product)

| Date         | Feature                                                          | Status in AGI Workforce                   | Priority |
| ------------ | ---------------------------------------------------------------- | ----------------------------------------- | -------- |
| Mar 17, 2026 | Cowork persistent thread from phone (Pro/Max)                    | Mobile companion app — our differentiator | HIGH     |
| Mar 12, 2026 | Inline charts, diagrams, visualizations                          | Need to implement — inline, not panel     | HIGH     |
| Mar 11, 2026 | Cross-app context (Excel + PowerPoint)                           | N/A (desktop-native, not Office add-ins)  | LOW      |
| Mar 2, 2026  | Memory for free users                                            | Memory system exists — needs polish       | MEDIUM   |
| Feb 25, 2026 | Scheduled tasks in Cowork                                        | Scheduler exists in Rust — needs wiring   | HIGH     |
| Feb 25, 2026 | Customize section (skills + plugins + connectors)                | Need to implement Customize hub           | HIGH     |
| Feb 24, 2026 | Plugin marketplace + admin controls                              | MCP marketplace — high priority           | HIGH     |
| Feb 17, 2026 | Sonnet 4.6 (1M context)                                          | Already supported via LLM router          | DONE     |
| Feb 12, 2026 | Self-serve Enterprise plans                                      | Stripe billing exists                     | MEDIUM   |
| Feb 5, 2026  | Opus 4.6                                                         | Already supported via LLM router          | DONE     |
| Jan 16, 2026 | Cowork expanded to Pro plans                                     | N/A (our agent always available)          | N/A      |
| Jan 12, 2026 | Cowork research preview (macOS VM)                               | Agent runs natively — no VM needed        | DONE     |
| Jan 12, 2026 | Health & fitness data on mobile                                  | Consider for mobile companion             | LOW      |
| Dec 18, 2025 | Skills for orgs + partner directory + Agent Skills standard      | Skill system needed — 150+ skills         | HIGH     |
| Dec 18, 2025 | Claude in Chrome updates (console, record workflow, admin)       | Chrome extension exists                   | MEDIUM   |
| Nov 24, 2025 | Claude in Chrome (scheduled tasks, follow plan, model selection) | Chrome extension exists                   | MEDIUM   |
| Oct 23, 2025 | Memory on Max/Pro plans                                          | Memory system — needs import/export       | MEDIUM   |
| Sep 29, 2025 | File creation/editing (XLSX, PPTX, DOCX, PDF)                    | Need to implement                         | HIGH     |
| Sep 9, 2025  | Creating and editing files                                       | Artifact system needed                    | HIGH     |
| Sep 3, 2025  | Location, maps, calendar on mobile                               | Mobile companion feature                  | LOW      |
| Aug 27, 2025 | Code Execution Tool (API)                                        | code_execute command exists               | DONE     |
| Aug 26, 2025 | Claude in Chrome launch                                          | Chrome extension exists                   | DONE     |
| Aug 11, 2025 | Search past conversations                                        | Search exists but needs enhancement       | MEDIUM   |

### Key Competitive Gaps to Close (Priority Order)

1. **Customize hub** (Skills + Connectors in one place) — Claude's Feb 25 launch
2. **Connector marketplace** with 35+ integrations — Claude has 35, we need top 10
3. **Skill system** with user-created + examples + auto-trigger — our 150+ is the moat
4. **Inline charts/visualizations** — Claude's Mar 12 launch
5. **File creation** (DOCX, XLSX, PPTX) — Claude's Sep 2025 launch
6. **Scheduled tasks** — Claude's Feb 25 launch, we have Rust backend ready
7. **Artifacts gallery** with templates — inspiration tab with pre-built templates
8. **Memory import/export** — Claude has this since Mar 2, 2026
9. **Project memory** — auto-populated from conversations with privacy controls

---

## 29. QUICK CHIPS (Below Input Bar)

### What Claude Does (Confirmed March 21, 2026)

- 5 chips in a row below the input bar on empty state:
  1. `</>` **Code** — starts a coding conversation
  2. ✏ **Write** — starts a writing conversation
  3. 🎓 **Learn** — starts a learning conversation
  4. 📁 **From Drive** (Google Drive icon) — imports from connected Drive
  5. 📧 **From Gmail** (Gmail icon) — imports from connected Gmail
- Chips disappear once typing or during active conversation
- Last two chips are connector-powered (Drive, Gmail) — only show when connected

### AGI Workforce SHOULD DO

- 5 chips: Code, Write, Research, Skills (our differentiator), Web
- Last chip could be connector-powered if user has connected apps
- Chips disappear during conversation

---

## 30. CONVERSATION HEADER (Confirmed March 21, 2026)

### What Claude Does

- **Left**: (sidebar handles brand)
- **Center**: Auto-generated conversation title + `v` dropdown chevron (rename, delete, etc.)
- **Right**: Share button (copy icon + "Share" text) — appears after first response
- **Top right corner**: Small icon (appears to be Cowork/agent indicator)

### AGI Workforce SHOULD DO

- Center: auto-generated title + dropdown
- Right: Share button
- Match clean, minimal header

---

## 31. DISCLAIMER TEXT (Confirmed March 21, 2026)

### What Claude Does

- **Standard**: "Claude is AI and can make mistakes. Please double-check responses."
- **With web search/citations**: "Claude is AI and can make mistakes. Please double-check cited sources."
- Centered at very bottom, small muted text

### AGI Workforce SHOULD DO

- Context-aware disclaimer: changes text when sources are cited
- Small, muted, centered at bottom

---

---

## 32. + BUTTON MENU (Live tested March 21, 2026)

### What Claude Does

The **+** button (left side of input bar) opens a comprehensive action menu:

**Attachment actions:**

- 📎 Add files or photos
- 📷 Take a screenshot
- 📁 Add to project → (submenu)
- 🔶 Add from Google Drive → (submenu)
- 🐙 Add from GitHub

**Feature toggles:**

- 📋 Skills → (submenu lists all skills + "Manage skills")
- 🔌 Connectors → (submenu with per-connector toggles + "Add from Vercel →" + "Manage connectors" + "Tool access")
- 🔍 Research (triggers deep research mode)
- 🌐 Web search ✓ (green checkmark = enabled, toggleable)
- ✏️ Use style → (submenu)

**Input placeholder**: "Type / for skills" — skills triggered via slash commands

**Connectors submenu detail:**

- Each connected connector has an **on/off toggle** per conversation
- Drive search — toggle
- Gmail — toggle
- Vercel — toggle
- Add from Vercel → (submenu for importing from specific connector)
- Manage connectors (link to settings)
- Tool access — "Load tools when needed" (configurable)

**Skills submenu detail:**

- Lists all available skills by name (humanizer, algorithmic-art, brand-guidelines, etc.)
- "Manage skills" link at bottom

### AGI Workforce SHOULD DO

- Match this + menu structure exactly: attachments, skills, connectors, research, web search, style
- Per-connector toggles in the submenu (enable/disable per conversation)
- "Type / for skills" placeholder — slash command pattern
- Web search as a toggleable feature (not always-on)
- Research as a dedicated mode (separate from regular chat)
- "Use style" for writing style presets

---

## 33. SETTINGS PAGE (Live tested March 21, 2026)

### What Claude Does

**Settings sidebar (8 tabs):**

1. **General** — Profile (name, preferred name, work type, personal preferences), Notifications (completions toggle, Claude Code on web toggle)
2. **Account** — account management
3. **Privacy** — Export data, Shared chats manage, Memory preferences, Location metadata toggle (off), Help improve Claude toggle (off)
4. **Billing** — payment management
5. **Usage** — usage tracking
6. **Capabilities** — Memory, Tool access, Visuals, Code execution, Skills
7. **Connectors** — connector management (migrating to Customize)
8. **Claude Code** — Claude Code settings
9. **Claude in Chrome** — Beta badge — Chrome extension settings

**General > Profile:**

- Avatar + Full name
- "What should Claude call you?" (separate field)
- "What best describes your work?" — dropdown (e.g., "Product management")
- "What personal preferences should Claude consider in responses?" — freeform text area
- Placeholder: "e.g. keep explanations brief and to the point"

**General > Notifications:**

- Completions — "when Claude has finished a response. Most useful for long-running tasks like tool calls, Research, and Claude Code" — toggle (on)
- Claude Code on the web — "when Claude Code on the web has finished building or needs your response." — toggle (on)

**General > Language:**

- 11 languages: English (US) ✓, Français, Deutsch, हिन्दी, Indonesia, Italiano, 日本語, 한국어, Português (Brasil), Español (Latinoamérica), Español (España)

**Privacy settings:**

- Export data — button
- Shared chats — Manage button
- Memory preferences — Manage ↗ (external link)
- Location metadata — toggle (off by default) — "Allow Claude to use coarse location metadata (city/region)"
- Help improve Claude — toggle (off by default) — "Allow the use of your chats and coding sessions to train and improve Anthropic AI models"

### AGI Workforce SHOULD DO

- Match settings structure: General, Account, Privacy, Billing, Usage, Capabilities, Connectors
- Profile: name, preferred name, work type selector, personal preferences text
- Privacy: data export, memory preferences, location toggle, training opt-out
- Language support (start with English, add top languages)
- Notification toggles for long-running tasks

---

## 34. CAPABILITIES SETTINGS (Live tested March 21, 2026)

### What Claude Does

**Memory section:**

- "Search and reference chats" — toggle (on) — search past chats for context
- "Generate memory from chat history" — toggle (on) — remember context across chats/projects
- Memory preview card: thumbnail + "Memory from your chats" + "Updated X ago"
- **"Import memory from other AI providers"** — "Start import" button — generates a prompt to fetch memory from other accounts

**Tool access section:**

- "Tool access mode" — controls how connector tools load in new conversations
- Radio buttons:
  - ● "Load tools when needed" — "Chats compact less since tools aren't pre-loaded" (default)
  - ○ "Tools already loaded" — "Chats compact more often since tools are always there"

**Visuals section:**

- "Artifacts" — toggle (on) — dedicated window for code/docs/designs
- "AI-powered artifacts" — toggle (on) — apps/prototypes using Claude API inside artifacts
- "Inline visualizations" — toggle (on) — charts, diagrams directly in conversation

**Code execution and file creation:**

- Toggle (on) — "execute code and create/edit docs, spreadsheets, presentations, PDFs, data reports"
- Sub-settings:
  - "Allow network egress" — toggle (on) — install packages, advanced data analysis, security warning
  - "Domain allowlist" — dropdown ("All domains") — sandbox network access control

**Skills section** (partially visible at bottom)

### AGI Workforce SHOULD DO

- **Import memory from other AI providers** — competitive migration feature (HUGE for acquisition)
- Tool access mode (lazy vs eager loading) — smart context window management
- Separate toggles for: Artifacts, AI-powered artifacts, Inline visualizations
- Code execution with network egress control and domain allowlisting
- Memory from chat history with preview card

---

## 35. RESEARCH MODE (Live tested March 21, 2026)

### What Claude Does

**Trigger**: + button → Research, or ask Claude to research something

**Research card (inline in chat):**

- Title: "Trillionaire wealth-building research"
- Status line: Source icons (🔴📧🌐) + "Research complete · 438 sources · 13m 8s"
- Expandable with > chevron
- Long-running task (13+ minutes) — user can keep chatting while research runs

**Research output:**

- "Here is your research result"
- Research Report card: "Research Report" + "Document" label + document thumbnail preview
- Opens as a Document artifact

**Key observations:**

- Research is a separate, long-running agent mode
- Can process 438+ sources across the web
- Takes minutes (not seconds)
- Produces a structured Document artifact as output
- Source type icons show variety (web, email, etc.)
- Thinking block: "Assessed wealth-building query and commenced research task >"

### AGI Workforce SHOULD DO

- Deep research mode as a dedicated feature (not just web search)
- Research card with: title, source count, time elapsed, source type icons
- Produce structured Research Report as downloadable document
- Allow continued chatting while research runs in background
- **This maps directly to our existing Research feature in Rust** — needs frontend wiring

---

## 36. CUSTOM CONNECTOR / MCP SERVER (Live tested March 21, 2026)

### What Claude Does

**"Add custom connector" modal (BETA):**

- Title: "Add custom connector" with BETA badge
- Subtitle: "Connect Claude to your data and tools. Learn more about connectors or get started with pre-built ones."
- Two input fields:
  1. **Name** — text input
  2. **Remote MCP server URL** — text input
- "Advanced settings" — expandable section
- Trust warning: "Only use connectors from developers you trust. Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change."
- "Building an MCP server? Report issues and subscribe to updates here" — developer link
- Cancel / Add buttons

**Key insight**: Custom connectors = remote MCP servers. Just a name + URL. Claude handles discovery/invocation automatically.

### AGI Workforce SHOULD DO

- Match this exact flow: Name + MCP server URL + Advanced settings
- BETA badge (signals experimental)
- Trust warning for custom connectors
- Developer documentation link
- **Our advantage**: We already support stdio + SSE + streamable HTTP MCP. Claude only shows "Remote MCP server URL" (streamable HTTP only for web)

---

## 37. ADDITIONAL CONNECTORS DISCOVERED (March 21, 2026)

Beyond the connectors already documented in section 21, these were found:

| Connector  | Description                                               | Badge         |
| ---------- | --------------------------------------------------------- | ------------- |
| Gamma      | Create presentations, docs, socials, and sites with AI    | ✧ Interactive |
| Miro       | Access and create new content on Miro boards              | —             |
| Grammarly  | (icon visible, description not captured)                  | —             |
| Asana      | Connect to Asana to coordinate tasks, projects, and goals | ✧ Interactive |
| Excalidraw | MCP for creating interactive hand-drawn diagrams          | ✧ Interactive |
| Sentry     | Search, query, and debug errors intelligently             | —             |
| Supabase   | Manage databases, authentication, and storage             | —             |
| Indeed     | Search for jobs on Indeed                                 | —             |
| PubMed     | Search biomedical literature from PubMed                  | —             |

**Total connector count**: ~40+ connectors in the marketplace

---

## 38. MOBILE APP PATTERNS (Live screenshots March 22, 2026)

> Competitive mobile analysis from live iOS screenshots of ChatGPT Plus and Perplexity Pro.
> These patterns define what AGI Workforce mobile must match or beat.

### Claude iOS (Max tier, March 2026) — PRIMARY REFERENCE

**Model selector (dropdown from header):**

- Opus 4.6 (selected) — "Most capable for ambitious work"
- Sonnet 4.6 — "Most efficient for everyday tasks"
- Haiku 4.5 — "Fastest for quick answers"
- Extended thinking (selected) — "Think longer for complex tasks"
- More models > (submenu for legacy)
- Header: "Opus 4.6 Extended v"
- Usage warning: "Opus consumes usage limits faster than other models" (dismissible)

**Navigation (sidebar):**

- Slide-out sidebar with "Claude" heading
- 5 nav items: Chats, Projects, Artifacts, Code, **Dispatch** (NEW badge)
- Recents list below
- User profile at bottom: "SN" avatar + name + orange `+` new chat button
- NO bottom tab bar

**Empty state:**

- Dark warm theme (olive/brown, matching web)
- Claude sparkle icon + time-aware greeting: "How can I help you this evening?"
- NO quick chips (cleanest of all competitors)
- Input: "Chat with Claude" + bottom bar: `+` | mic | voice waveform
- Splash: Claude logo + "BY ANTHROPIC"

**Capabilities page:**

- Artifacts toggle, Code execution toggle, Web search toggle
- Memory: Search chats (ON), Generate from history (ON), "View your memory — Updated 2d ago"
- Tool access: Auto (Claude chooses) / On demand / Always available — 3 radio options

**Permissions:**

- Location (Read only), Calendar (Read & write), Reminders (Read & write), Health (Never)
- Granular per-permission access levels

**Profile:**

- Full Name, Nickname, Personal Preferences text area
- Preferences example: "When learning new concepts, I find analogies particularly helpful."
- Update Profile / Save Preferences buttons, Delete account (red)

**Projects:**

- List: name + relative date (6 days ago, 1 month ago, etc.)
- Filter + sort icons, search bar, + new project button

**Code (Claude Code sessions):**

- Mobile companion to desktop Claude Code
- Archived session list with repo links
- Context menu: Copy branch, Share, Rename, Archive
- Input: "Add feedback..." + Code label

**Dispatch (NEW — not in competitors):**

- Scheduled agent tasks from mobile
- New badge indicates recent launch

**Cowork (desktop bridge):**

- Separate page: phone + squiggly line + laptop illustration
- "Looking for your desktop..." with spinner
- Requires Claude Desktop installed, open, and signed in
- This is the Max-tier remote control feature

**Code sessions (Claude Code companion):**

- Session list with Idle / Archived sections
- Session detail: chat-style output with bash commands, agent status
- Mode selector: **Plan** ("explore first") vs **Code** ("direct edits") — bottom sheet
- Attachments: Take Photo / Choose Photo (send screenshots to code sessions)
- Context menu: Copy branch, Share, Rename, Archive
- "Add feedback..." input + `</>` Code label

**Artifacts gallery:**

- "Get inspired" banner with thumbnails
- 2-column grid of cards with markdown preview + title + date
- Full browsable gallery of all user artifacts

**Connectors (on mobile):**

- Drive search toggle (OFF) + Gmail (connected) + Vercel (connected)
- Google Calendar + n8n (available to connect)
- Connected vs available-to-connect states clearly shown

**Settings (13 items in 4 groups):**

- Account: email, Profile, Billing (Max plan), Usage
- Features: Capabilities, Connectors, Permissions
- Preferences: Appearance (Dark), Speech language (EN), Notifications, Privacy, Shared links
- Device: Haptic feedback toggle

**Usage tracking:**

- Current session: 2% used, resets in 4 hr 58 min
- Weekly limits: All models — 25% used, resets Thu 10:00 PM
- Progress bars with % and reset countdown

**Notifications (3 categories):**

- Research complete, Chat responses, Code updates — all toggleable

**Design:**

- Dark warm theme (matching web — NOT pure black)
- Orange/coral accent (Claude brand)
- Toggle switches: blue when ON
- Section labels: muted pink/coral

### ChatGPT iOS (Plus tier, March 2026)

**Model selector:**

- Only 2 models exposed: **Instant 5.3** ("For everyday chats") and **Thinking 5.4** ("For complex questions")
- Tap model name at top-left (e.g., "Thinking >") to open dropdown
- Dropdown: Latest header, Instant, Thinking (checkmark), Configure
- **Thinking effort**: Standard dropdown (Standard / Extended)
- "Done" button at bottom of Intelligence modal
- Much simpler than web (which also shows 5.2, 5.0, o3)

**Navigation:**

- Slide-out sidebar (hamburger), NOT persistent — standard mobile pattern
- Sidebar items: Search + compose, ChatGPT, Images, Apps, GPTs, Projects (list), chat history, user profile
- NO bottom tab bar

**Empty chat:**

- Model name top-left (tappable), add-person + sync icons top-right
- Suggestion chips: "Create an image for my presentation", "Summarize a long document..."
- Input bar: `+` | "Ask ChatGPT" | mic | voice mode (black circle waveform)

**Projects on mobile:**

- Full project support (not desktop-only)
- Folder icon + project name as header
- Two tabs: **Chats** | **Sources**
- Contextual input: "Message hackathon" (scoped to project)
- Chat list: title + preview text

**Images tab:**

- Dedicated page accessible from sidebar
- "Try a style on an image" carousel: Caricature Trend, Flower petals, Gold, Crayon
- "Discover something new" section: creative prompts ("Me as an emperor", "Reimagine my pet as a human")
- "My images" gallery grid
- Input: image icon + "Describe an image" + mic + send

**Personalization:**

- Base style and tone selector
- 4 characteristics with adjustable levels: Warm, Enthusiastic, Headers & Lists, Emoji
- Custom instructions text field
- Nickname + occupation fields
- Save button

**Settings:**

- Profile card: avatar, name, username, email, phone
- ChatGPT Plus subscription badge + "Upgrade to ChatGPT Pro" upsell
- Orders (commerce), Personalization, Notifications, Apps, Parental controls

**Design (iOS-specific):**

- **Light theme** default (opposite of dark web)
- Standard iOS list styling with chevron disclosure
- Rounded corners on all cards
- Minimal color — grayscale + blue accents for selections
- No custom navigation patterns — feels native iOS

### Gemini iOS (Pro tier, March 2026)

**Model selector (bottom sheet):**

- 3 tiers under "Gemini 3" header: Fast ("Answers quickly"), Thinking ("Solves complex problems"), Pro ("Advanced math and code with 3.1 Pro")
- Tap "Pro" pill in input bar to open
- Middle ground between ChatGPT's 2 and Perplexity's 7

**Navigation:**

- Hamburger sidebar (slide-out, not persistent)
- Sidebar: Search, New chat + scan icon, My stuff, Gems (user-created), Chats (with pin icons)
- NO bottom tab bar (same as ChatGPT)

**Empty state:**

- "Hi Siddhartha / What's new today?"
- 5 VERTICAL stacked quick chips (unique — not horizontal like ChatGPT/Claude):
  - For you, Create image, Create music, Write anything, Create video
- Input bar: `+` | tools (sliders) | "Pro" pill | mic | Gemini Live (equalizer icon)

**+ menu (attachments):**

- NotebookLM, Files, Photos, Camera
- Separate from tools — Gemini splits tools (capabilities) from attachments (files)

**Tools bottom sheet (from sliders icon):**

- Create image (New badge), Create video, Create music (New badge), Canvas, Deep research, Guided learning
- **Experimental features** section with Labs badge: Personal Intelligence toggle (ON)
- Tools = capabilities you can invoke; distinct concept from attachments

**Gems (on mobile):**

- Can USE gems created on desktop (CodeXmind-python, prompt creator for claude visible)
- Cannot create/manage gems on mobile

**Account/profile menu:**

- Google account card with avatar + email
- Switch account (5 accounts)
- "More from Gemini": Manage subscription (PRO), Upgrade to AI Ultra, Gemini Apps Activity, Personal Intelligence, Scheduled actions, NotebookLM, Updates, Privacy Help Hub, Settings

**Settings (minimal on iOS):**

- Your public links, About, Gemini's voice, Interrupt Live responses toggle (ON), Google Usage ID
- Location data notice
- Much simpler than web — no device controls (Android-only)

**Design:**

- Light theme, Material Design 3 adapted for iOS
- Bottom-sheet modals for everything (model, tools, attachments)
- "New" blue badges on recently added features
- Gemini Live button always visible in input bar

### Perplexity iOS (Pro tier, v26.11.1, March 2026)

**Model selector:**

- 7 models: Best (auto-route), Sonar, GPT-5.4 (New), Gemini 3.1 Pro, Claude Sonnet 4.6, Claude Opus 4.6 (max), Nemotron 3 Super
- Per-model "With thinking" toggle
- Much more choice than ChatGPT's 2 models

**Navigation:**

- Bottom tab bar: Threads (history) | Spaces (shared knowledge)
- Different from ChatGPT's sidebar-only approach

**Connectors (15+):**

- Sources panel: Web, Academic, Social, Org files
- Cloud: Google Drive, OneDrive, SharePoint, Dropbox, Box
- Productivity: Notion, Outlook, Linear, GitHub, Asana, Slack, Jira, Confluence, Teams

**Three modes:**

1. Search (default)
2. Deep research — "In-depth reports and analysis"
3. Create files and apps — "Generate docs, slides, and apps"

**Attachments:** Image, Camera, File, Sources — 50 uploads/month (Pro cap)

**Commerce:** Orders + Reservations sections in settings

**Comet Browser:** Separate browser product with task automation + voice mode

**Design:**

- Ultra-minimal centered branding ("perplexity pro" large text)
- Bottom-sheet modals for models, sources, options
- Input bar: + | Model pill | [spacer] | Sources icon | Mic | Voice/Audio
- Muted color palette

### AGI Workforce Mobile SHOULD DO

**Navigation:**

- Bottom tab bar with 4-5 items (match Perplexity, not ChatGPT's sidebar)
- Tabs: Chat, Skills, Projects, Agent Dashboard, Settings
- Agent Dashboard is our unique differentiator (live agent monitoring)

**Model selector:**

- Show 3-5 models by default (not ChatGPT's 2, not Perplexity's 7 — balanced)
- Group by provider: OpenAI, Anthropic, Google, Local
- BYOK indicator when using user's own API keys
- "Local" badge for Ollama models
- Extended thinking / reasoning toggle

**Empty state:**

- Warm greeting + app icon
- Quick chips: Web, Code, Write, Research, Skills
- Input: + | "Ask anything" | model pill | mic | voice mode

**Projects:**

- Full project support on mobile (match ChatGPT)
- Chats + Sources + Instructions tabs
- Contextual input scoped to project

**Agent dashboard (UNIQUE — no competitor has this):**

- Live agent activity stream
- Approve/deny tool calls from phone
- QR-pair with desktop
- Real-time execution status

**Personalization:**

- Match ChatGPT's depth: base style, characteristics, custom instructions, occupation
- Add: preferred programming languages, industry, skill preferences

**Settings:**

- Profile, subscription, BYOK key management, connected models
- Privacy controls (local-first, data sovereignty)
- Theme (light/dark/system)
- NO parental controls initially (lower priority)

**Design principles:**

- Light theme default (match iOS conventions like ChatGPT)
- Bottom tab bar (match Perplexity — more discoverable than sidebar)
- Bottom-sheet modals for model/source selection
- Native iOS feel — rounded corners, system fonts, standard navigation
- Voice mode with prominent button (both competitors prioritize this)

---

## 39. MOBILE COMPETITIVE MATRIX (March 2026)

| Feature         | Claude iOS                                | ChatGPT iOS                     | Gemini iOS                   | Perplexity iOS     | AGI Workforce (Target)               |
| --------------- | ----------------------------------------- | ------------------------------- | ---------------------------- | ------------------ | ------------------------------------ |
| Models          | 3 + thinking + more                       | 2 (Instant, Thinking)           | 3 (Fast, Thinking, Pro)      | 7 (multi-provider) | 5+ (multi-provider + local)          |
| BYOK            | No                                        | No                              | No                           | No                 | **Yes (differentiator)**             |
| Local LLMs      | No                                        | No                              | No                           | No                 | **Yes (Ollama)**                     |
| Navigation      | Sidebar                                   | Sidebar                         | Sidebar                      | Bottom tabs        | Bottom tabs                          |
| Projects        | Yes (list + search)                       | Yes (Chats + Sources)           | Gems (use only)              | Spaces (shared)    | Yes (Chats + Sources + Instructions) |
| Image gen       | Via chat                                  | Dedicated tab + styles          | Quick chip + tool            | No dedicated tab   | Inline in chat                       |
| Video gen       | No                                        | No (Sora web only)              | Create video tool            | No                 | Via desktop bridge                   |
| Music gen       | No                                        | No                              | Create music (New)           | No                 | No (v2)                              |
| Connectors      | Web search toggle                         | Apps (16+)                      | Google ecosystem             | Sources (15+)      | MCP tools (unlimited)                |
| Voice           | Always visible                            | Prominent                       | Gemini Live (always visible) | Prominent          | Prominent                            |
| Agent oversight | No                                        | No                              | No                           | No                 | **Yes (approve/deny)**               |
| Code sessions   | Claude Code companion                     | No                              | No                           | No                 | Agent dashboard                      |
| Scheduled tasks | **Dispatch (NEW)**                        | No                              | Scheduled actions            | No                 | Scheduler (Rust backend)             |
| Capabilities    | 3 toggles + memory + tool access          | No equivalent                   | Tools sheet + Labs           | Sources panel      | Skills + MCP tools                   |
| Permissions     | 4 (Location, Calendar, Reminders, Health) | No                              | No                           | No                 | Desktop control perms                |
| Personalization | Name + nickname + preferences text        | 4 sliders + custom + occupation | Personal Intelligence toggle | Basic              | Preferences + occupation             |
| Thinking        | Extended thinking toggle                  | Standard/Extended               | 3 tiers                      | Per-model toggle   | Per-model + effort                   |
| Desktop control | Code (Max only)                           | No                              | No                           | Comet browser      | **Native desktop agent**             |
| Quick chips     | None (cleanest)                           | 2 horizontal                    | 5 vertical                   | None               | 5 horizontal                         |
| Deep research   | Via chat                                  | Yes                             | Yes (tool)                   | Yes (mode)         | Yes (via desktop)                    |
| Theme           | Dark (warm)                               | Light                           | Light                        | Light              | Dark default + light + system        |
| Profile         | Name + nickname + prefs                   | Name + 4 sliders + occupation   | Google account               | Basic              | Name + nickname + prefs + occupation |

### Key Takeaways

1. **Claude is cleanest** (no quick chips, dark theme, 5 nav items). **ChatGPT simplifies models** (2 tiers). **Gemini maximizes tools** (image/video/music gen). **Perplexity maximizes model choice** (7 models). AGI Workforce should be in the middle — Claude's cleanliness + multi-model choice.

2. **ALL four competitors lack BYOK, local LLMs, and agent oversight** — these remain our strongest mobile differentiators across the board.

3. **3 of 4 use sidebar** (Claude, ChatGPT, Gemini). Only Perplexity uses bottom tabs. Bottom tabs are more discoverable on mobile — use them, but acknowledge we're diverging from Claude's pattern here.

4. **Voice mode is table stakes** — all four competitors make it prominent and always visible. We must match.

5. **Claude's Dispatch is new** — scheduled agent tasks from mobile. Maps directly to our existing Rust scheduler. Must wire this.

6. **Claude's Code section** — mobile companion to Claude Code sessions. Our equivalent is the Agent Dashboard with live oversight + approve/deny.

7. **Capabilities/Permissions pattern** (Claude) — granular toggles for features, memory, tool access, and system permissions. Best model for our settings.

8. **Projects on mobile** is standard (Claude + ChatGPT have it). Must support from day one.

9. **Theme divergence** — Claude is the ONLY dark-theme-default mobile app. ChatGPT, Gemini, Perplexity all default light. Consider offering both with system-follow default.

---

## 38. PRICING (Live tested March 21, 2026)

### Claude Plans

**Individual:**
| Plan | Price | Key Features |
|------|-------|-------------|
| Max | From $100/mo | Up to 20x more usage, early access, higher output limits, priority access, Claude in PowerPoint |
| Pro | $20/mo | Claude Code, Cowork, higher usage, deep research, memory across conversations |
| Free | $0 | Basic access |

**Team and Enterprise:**
| Plan | Price | Users | Key Features |
|------|-------|-------|-------------|
| Team Standard | $20/mo/seat | 5-150 | 200K context, Claude Code, Cowork, SSO, admin controls, connector management |
| Team Premium | $100/mo/seat | 5-150 | 5x more usage than standard |
| Enterprise | $20/seat + usage at API rates | 20+ | 500K context, RBAC, SCIM, audit logs, compliance API, network controls, custom retention, IP allowlisting |

### AGI Workforce SHOULD DO

- **BYOK eliminates subscription anxiety** — users pay API costs directly, no $20-$100/mo markup
- Position against Claude's pricing: "Stop paying for multiple AI subscriptions"
- Free tier with BYOK, Pro features for a lower price point
- Enterprise features we already have: local execution, no data leaving device

---

---

## 39. CHATGPT DEEP DIVE (Live tested March 21, 2026)

### ChatGPT Empty State

- Greeting: "What are you working on?" (no user name, unlike Claude's personalized greeting)
- Input: "Ask anything" placeholder
- Bottom bar: + button (left) | "Extended thinking v" with brain icon (center-left) | mic icon | voice mode circle (right)
- No quick chips below input
- Sidebar collapsed: 5 icons only (ChatGPT logo, new chat pencil, search, GPTs, agents)

### ChatGPT Sidebar (Expanded)

- ChatGPT v (model selector dropdown at top)
- New chat
- Search chats
- Images
- Apps
- Deep research
- Codex
- **GPTs section**: Canva + "Explore GPTs"
- **Projects section**: New project + project list + "More"
- **Your chats section**: recent conversations
- User profile at bottom: name + "Plus" plan

### ChatGPT Create Project Modal

- "Create project" heading + gear icon + X
- **Project name**: emoji picker button + text input (e.g., "Copenhagen Trip")
- **Quick-start category chips**: 💰 Investing, 📚 Homework, ✏️ Writing, ✈️ Travel
- Description: "Projects keep chats, files, and custom instructions in one place."
- "Create project" button

### ChatGPT Project Detail

- Header: project icon + project name
- Input: "New chat in [project name]" placeholder
- **Two tabs**: Chats | Sources
- Chats tab: conversation list with title + preview text + date
- Sources tab: uploaded files/references

### ChatGPT Activity Panel (Thinking + Search)

- **RIGHT-SIDE PANEL** (not inline like Claude)
- Header: "Activity · 2m 11s" + X close
- "Thinking" section header
- Multiple search rounds with:
  - 🌐 Globe icon + search description text
  - Source favicon pills below each search (www.spacex.com, www.reuters.com, apnews.com, "+3 more")
  - Thinking text paragraphs between search rounds
  - Multiple refined search queries (iterative)
- Chat response (left): inline citation pills "Space +1", "Reuters +1"
- "Thought for 2m 11s >" clickable link to open Activity panel

### ChatGPT Settings (9 tabs)

**General:**

- MFA setup banner
- Appearance: System/Light/Dark dropdown
- **Accent color**: Default dropdown (customizable!)
- Language: Auto-detect
- Spoken language: Auto-detect
- **Voice**: Play preview + voice name selector (e.g., "Spruce")

**Notifications:**
| Category | Options | Description |
|----------|---------|-------------|
| Responses | Push | Long-running tasks (research, image gen) |
| Group chats | Push | New messages from group chats |
| Tasks | Push, Email | Task updates + "Manage tasks" link |
| Projects | Email | Shared project invitations |
| Recommendations | Push, Email | New tools, tips, features |
| Usage | Push, Email | Limit resets for image creation etc. |

**Personalization:**

- **Base style and tone**: Default dropdown — "Set the style and tone of how ChatGPT responds"
- **Characteristics** (granular style controls):
  - Warm: Default v
  - Enthusiastic: Default v
  - Headers & Lists: Default v
  - Emoji: Default v
- Custom instructions: freeform text area
- **About you**:
  - Nickname: "What should ChatGPT call you?"
  - Occupation: text input (placeholder: "Small-batch home sourdough baker")
  - More about you: "Interests, values, or preferences to keep in mind"
- **Memory**:
  - Reference saved memories: toggle (on) — save and use memories
  - Reference chat history: toggle (on) — reference all previous conversations
  - Note: "ChatGPT may use Memory to personalize queries to search providers, such as Bing."
- **Record mode**:
  - Reference record history: toggle (on) — reference recording transcripts and notes
- Advanced section (expandable)

**Schedules:**

- "ChatGPT can be scheduled to run again after it completes a task. Choose ⏱ Schedule from the ··· menu in a conversation to set up future runs."
- Manage button

**Data controls:**

- Improve the model for everyone: On >
- Remote browser data: On >
- Shared links: Manage
- Archived chats: Manage
- Archive all chats: Archive all
- Delete all chats: Delete all (red button)
- Export data: Export

**Security:**

- Password: **\*\*** >
- Passkeys: Add >
- MFA section: Authenticator app toggle, Push notifications toggle, Text message (SMS/WhatsApp) toggle
- Trusted Devices: count >
- Log out of this device / Log out of all devices (red)
- "Secure sign in with ChatGPT" — sign in to websites/apps with ChatGPT identity
- Codex CLI: Disconnect (red) — "Allow Codex CLI to use models from the API"
- Enable device code authorization for Codex: toggle

**Account:**

- Name, Email
- Plan management: "Manage v" dropdown
- Plan features list with icons: Solve complex problems, Long chats, Create images faster, Remember goals, Agent mode for travel/tasks, Organize projects/GPTs, Videos on Sora, Code/apps with Codex
- Payment: Manage
- Delete account: Delete (red)
- **GPT builder profile**: Name toggle, Domain link, LinkedIn: Add, GitHub: Add, Email, Receive feedback emails checkbox
- Preview card: "PlaceholderGPT by [name]"

### ChatGPT + Button Menu

**Primary actions:**

- 📎 Add photos & files
- 🎨 Create image
- 🔬 Deep research
- 🛒 Shopping research
- 🌐 Web search
- ··· More →

**More submenu:**

- 📚 Study and learn
- 🤖 Agent mode
- 📁 Add sources
- ✏️ Canvas
- 📋 Quizzes

### ChatGPT Temporary Chat

- URL: chatgpt.com/?temporary-chat=true
- "Temporary Chat" heading
- "This chat won't appear in your chat history, and won't be used to train our models."
- Disclaimer: "For safety, we may keep a copy of this chat for up to 30 days."
- Same input bar, no sidebar changes

### AGI Workforce SHOULD DO (from ChatGPT analysis)

- **Personalization style controls** — Warm/Enthusiastic/Headers & Lists/Emoji sliders (ChatGPT differentiator we should match)
- **Project category chips** — quick-start templates when creating projects
- **Sources tab** in projects (separate from Chats) — dedicated file/reference view
- **Accent color** customization — simple personalization win
- **Voice selection** with preview playback
- **Notification granularity** — per-category Push/Email/None controls
- **Record mode** — reference past voice transcripts (for our speech/voice feature)
- **Group chats** — multi-user chat (ChatGPT has this, we don't yet)
- **Activity panel pattern** — we follow Claude's inline approach (better for single-focus), but note ChatGPT users may expect side panel
- **"Manage tasks"** link in notification settings — scheduled/recurring tasks
- **Scheduled tasks** — re-run conversations on a schedule (via ··· menu → Schedule)
- **Shopping research** — dedicated shopping mode (we should consider for skills)
- **Study and learn + Quizzes** — education-focused modes
- **Agent mode** — explicit agent toggle in + menu
- **Canvas** — collaborative editing mode
- **Temporary Chat** — private/incognito mode (no history, no training) — we need this for privacy
- **GPT builder profile** — creator ecosystem with LinkedIn/GitHub links
- **Secure sign-in with ChatGPT** — identity provider for third-party apps (ambitious)
- **Data export** — GDPR compliance must-have
- **Accent color** — low-effort personalization that users love

---

## 40. CLAUDE INCOGNITO MODE (Live tested March 21, 2026)

### What Claude Does

- URL: `claude.ai/new?incognito`
- Header bar: 🔒 lock icon + "Incognito chat" + X close button
- **Dashed border** around entire chat area (visual indicator — distinct from normal mode)
- Orange asterisk + **"You're incognito"** heading (centered)
- Input: "How can I help you today?" + model selector (same as normal)
- No sidebar visible in incognito mode
- Disclaimer: "Incognito chats aren't saved, added to memory, or used to train models. Learn more about how your data is used."
- No quick chips below input

### AGI Workforce SHOULD DO

- Match incognito pattern: dashed border visual, lock icon header, clear disclaimer
- **Privacy-first positioning**: "Your data never leaves your device" + incognito for extra privacy
- URL parameter approach: `?incognito` or `?private`
- No memory, no history, no training — clear messaging

---

## 41. ACTIVE FEATURE BADGES IN INPUT BAR (Live tested March 21, 2026)

### What Claude Does

When features are activated from the + menu (Research, Use style, Web search, etc.), they appear as **blue icon badges** next to the + button in the input bar:

**Layout**: `[ + ] [ 🔍 ] [ ✏️ ]  ···  [ Sonnet 4.6 Extended v ] [ 🎤 ]`

- Each active feature = small blue rounded-square icon
- Icons match the feature (magnifying glass for Research, pen for Use style)
- Blue color = active/enabled
- Clicking a badge presumably deactivates it
- Multiple badges can stack horizontally

**Key insight**: This solves the "what modes are active?" problem. Users can see at a glance which features are enabled for their current message without opening menus.

### AGI Workforce SHOULD DO

- Match this pattern exactly: blue icon badges for active features next to + button
- Active features visible at a glance: Web search, Research, Skills, Connectors
- Clickable to toggle off
- Our differentiator: also show **active model provider** as a badge/indicator

---

---

## 42. PERPLEXITY DEEP DIVE (Live tested March 21, 2026)

### Sidebar

- Two mode tabs at top: **Search** (active) | **Computer**
- - New thread
- History
- Discover
- Spaces
- Finance
- ··· More
- Recent threads list
- User profile at bottom (avatar + name + "Pro" badge + notification bell)

### Empty State

- "perplexity pro" heading centered
- Input: "Ask anything..." (or "Type / for search modes and shortcuts")
- Bottom bar: + button, Model v dropdown, Computer button, mic, voice mode circle
- Feature cards below: "Select a model", "Try Computer", "Try Deep Research"

### Model Selector (Multi-model like us!)

- **Best** ✓ (default) — "Selects the best available model"
- **Sonar** (Perplexity's own)
- **GPT-5.4** (OpenAI)
- **Gemini 3.1 Pro** (Google)
- **Claude Sonnet 4.6** (Anthropic)
- **Claude Opus 4.6** — "Max" badge + 🔒 lock (premium only)
- **Nemotron 3 Super** — "New" badge (NVIDIA)

### + Button Menu

- Upload files or images
- Add files from cloud →
- **Connectors and sources** → (source filter submenu)
- Deep research
- **Model council** — Max badge + 🔒 (multi-model consensus)
- More →

### Connectors and Sources (Source Filters)

Search bar + checkboxes:

- 🌐 Web ✅ (default on)
- 🏛 Academic
- 📧 Gmail with Calendar
- 🔶 Google Drive (↗ external link)
- 👤 Social
- 🏗 Blockscout
- 🌐 GoDaddy
- 🏥 ICD-10 Codes
- ✈️ Trivago
- Asana (↗), Bitly (↗), Box (↗), Circleback (↗), Cloudinary (↗)
- "Manage Connectors" link at bottom

**Key insight**: Perplexity treats connectors as **search source filters** — you choose WHERE to search, not which tools to use. Very different from Claude's connector model.

### Search Results Page (Answer tab)

- **Top tabs**: Answer | Links | Images (3 views of same query)
- **"Completed N steps" collapsible**:
  - Each step: 🌐 globe icon + description + ˅ chevron
  - Expanded shows: 🔍 search queries listed, then results with favicon + title + source name
  - "+N more" expandable link per step
- **Response with inline citations**: "source +N" pill badges (e.g., "timingapp +2", "techspot +1", YouTube icon)
- **Tables render inline** — comparison tables with columns
- **Action bar**: Share, Download, Copy, Rewrite icons (left) | Source favicons + "27 sources" count (center) | Thumbs up, Thumbs down, More (right)
- **Follow-ups section**: AI-generated clickable next questions, some with "Computer" badge

### Links Tab

- Google-style results: favicon + source name + URL + blue title link + description + thumbnail image
- Full list of all sources used in the answer

### Images Tab

- Masonry grid of web images with source labels (loading state observed)

### Spaces (= Projects)

- "Spaces" heading + "Templates" button + "+ New Space" button
- **My Spaces**: user-created spaces with date + "Shared" badge
- **Examples**: Pre-built template spaces (Perplexity Support, What would Buffet say?, LLM Research)

### Finance Page (Full Financial Terminal!)

- Header: "Perplexity Finance" + Search "stocks, crypto, and more..." + Price Alert + Share
- **Tabs**: US Markets v, Crypto, Earnings, Predictions, Politicians, Screener, Watchlist, Portfolio
- **Top Assets**: S&P, NASDAQ, Dow, VIX with sparkline charts + % change
- **Portfolio**: "Connect your brokerage account" for AI-powered insights
- **Watchlist**: Individual stocks with prices + % change + star to favorite
- **Market Summary**: AI-generated expandable news items with 56 sources
- **Prediction Markets**: Polymarket integration (NVIDIA 99.0%, Apple 1.0%)
- **Input**: "Ask anything about US markets"

### Discover Page (AI News Feed)

- **Tabs**: For You | Top | Topics v
- **Personalization**: "Make it yours" — select topics (Tech & Science, Business, Arts & Culture, Sports, Entertainment)
- **News cards**: Hero image + title + published time + source favicons + source count + heart + ···
- **Three-column layout** for smaller cards below hero
- **Market Outlook widget** (right sidebar): Live market sparklines
- AI-summarized articles with multi-source attribution

### AGI Workforce SHOULD DO (from Perplexity)

- **Follow-up suggestions** below every response — AI-generated clickable next questions (Perplexity's best UX feature)
- **Source count in action bar** — "27 sources" with favicons
- **"Completed N steps" collapsible** — structured step-by-step search process display
- **Answer | Links | Images tabs** for search results — consider for our web search feature
- **Source filters** (Web, Academic, Social, etc.) — different from Claude's connector approach but compelling for search-first queries
- **Model council** — query multiple models and synthesize (our multi-model advantage!)
- **Finance page** — NOT for v1, but shows vertical-specific AI pages are a differentiator (we have 150+ skills as our answer)
- **Discover/News feed** — AI-curated news is a retention feature, consider for dashboard
- **Space templates** — pre-built project templates for common use cases

---

## COMPETITIVE SUMMARY (All 4 platforms compared)

| Feature            | Claude             | ChatGPT               | Perplexity        | AGI Workforce                |
| ------------------ | ------------------ | --------------------- | ----------------- | ---------------------------- |
| Multi-model        | No                 | No                    | Yes (7 models)    | **Yes (9+ providers)**       |
| BYOK               | No                 | No                    | No                | **Yes**                      |
| Local LLMs         | No                 | No                    | No                | **Yes**                      |
| Connectors         | 40+ marketplace    | GPTs                  | Source filters    | MCP unlimited                |
| Skills             | 10 examples        | GPTs                  | —                 | **150+**                     |
| Research           | Yes (13min)        | Deep research         | Deep research     | Yes (needs polish)           |
| Finance            | No                 | No                    | **Full terminal** | Skill-based                  |
| News feed          | No                 | No                    | **Discover**      | —                            |
| Desktop automation | Cowork (VM)        | No                    | Computer          | **Native**                   |
| Mobile companion   | iOS/Android        | iOS/Android           | iOS/Android       | **QR pair + live dashboard** |
| Incognito          | Yes                | Temporary chat        | —                 | **Yes**                      |
| Thinking blocks    | Inline collapsible | Side panel            | Steps collapsible | Inline (needs polish)        |
| Citations          | Inline pills       | "+N" pills            | "+N" pills        | Needs implementation         |
| Follow-ups         | No                 | No                    | **Yes**           | Needs implementation         |
| Voice              | Voice mode         | Voice mode + personas | Voice mode        | **Full persona system**      |
| Pricing            | $20-$100/mo        | $20-$200/mo           | $20/mo Pro        | **BYOK = API costs only**    |

---

_This document is the single source of truth for AGI Workforce product design. All UI decisions should reference this document. When in doubt, check how Claude.ai does it. Last verified via live browser testing: March 21, 2026._
