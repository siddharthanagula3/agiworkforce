# Gemini & Perplexity Reference Analysis

**Image set covered**:

- `/reference/ui/gemini-chat/` — 13 files (home, import memory, image-gen with thinking, composer tools, attachment menu, video templates, flights, maps, YouTube)
- `/reference/ui/perplexity/` — 26 files (browser empty state, composer menus, connectors/skills, settings hierarchy, pricing)
- `/reference/ui/perplexity/perplexity-comet-browser-assistant/` — 4 files (Comet sidebar, model selector, YouTube floating panel)

**Total images read**: 43

---

## Mislabel report

None found. All filenames accurately describe content.

---

## Per-competitor pattern inventory

### Gemini

#### 1. APP SHELL

- Left sidebar (collapsed/expanded) with section headers: "New chat", "Chats", "Gems" (pinned conversations), "Settings & help"
- Top bar with "Gemini" logo, search, settings, upgrade badge (Pro), user avatar
- Persistent left navigation; no popout/mini mode observed

#### 3. EMPTY STATE

- Hero greeting: "Hi [Name]" + "What should we do today?"
- Primary suggestion layout: "Ask Gemini 3" button + "Tools" menu + quick-action chips ("For you", "Create image", "Create music", "Create video", "Write anything", "Boost my day")
- Tone: productivity-focused, capability showcase
- Secondary banner (top-right): "Bring your memories with you" (import flow) — not hero placement

#### 4. COMPOSER

- Text input field with placeholder "Ask Gemini 3"
- Attachment affordances: "+" button opens dropdown menu listing:
  - Upload files
  - Add from Drive
  - Photos
  - Import code
  - NotebookLM
- Tools menu (gear icon) with expandable submenu showing:
  - Create image
  - Canvases
  - Deep research (beta)
  - Create video
  - Create music (beta)
  - Guided learning
  - Experimental features (with Labs badge)
  - Personal intelligence (toggle)
- Mode selector: shows "Fast" → "Pro" dropdown + send button
- Voice: not observed in these images

#### 5. CHAT / MESSAGES

- User message rendering: simple text, no special styling
- Assistant message rendering: body text + generated artifacts (images, videos, cards)
- Thinking blocks: collapsible "Show thinking ▲" expandable text with structured reasoning stages ("Defining the search", "Refining the destination", "Analyzing flight options", etc.) — each stage on separate line with bullet
- Structured results: Google Flights card with flight options in table rows (airline, time, stops, duration, price)
- Inline embeds: Google Maps iframe embedded mid-conversation with place markers, info cards overlay. YouTube video embedded with play button, source citation below ("The science behind dramatically better conversations | Charles Duhigg | TED")
- Web search results: favicons + source attribution shown below embeds
- Copy/rate/regenerate buttons below each message

#### 6. ARTIFACTS / SIDEBAR

- Right-side image sidebar for generated images. Shows "Show thinking ▼" toggle at top of message
- No separate artifact panel visible in these images; images inline in chat

#### 11. MODEL / MODE FEATURES

- "Fast" vs "Pro" mode selector visible in composer. "Thinking" mode toggle observed in Flights images
- Reasoning effort display: "Show thinking" expandable section with stage-by-stage reasoning

#### 12. PRICING / UPGRADE

- Top-right "Upgrade" badge (blue, clickable CTA)
- Pricing modal (not in these images, inferred from badge)

### Perplexity

#### 1. APP SHELL

- Left sidebar: icon + label navigation. Sections: Search, Computer, New thread, History, Discover, Spaces, Finance, More (expandable)
- Footer: user avatar + name "Siddhartha Na..." + status indicator
- Sub-navigation under Computer section: "New task", "Tasks", "Files", "Connectors", "Skills", "Use cases"
- Top bar: breadcrumb "Perplexity / Perplexity Computer", scheduled toggle, add-credits button, settings (gear)
- No popout/mini mode; desktop surface

#### 3. EMPTY STATE

- Headline: "Computer works for you." (agentic framing)
- Hero prompt: "What should we work on next?"
- Quick-action chips below composer: "Upload files or images", "Add files from cloud" (with submenu arrow), "Connectors and sources" (with submenu arrow), "Computer", "Deep research", "Model custom" (with dropdown)
- Subheading for Computer mode: description of automation capability

#### 4. COMPOSER

- Text input: "Type / for connectors and sources" (slash command affordance)
- Attachment menu (+ button) shows:
  - Upload files or images
  - Add files from cloud (expands to: Google Drive, OneDrive, SharePoint, Dropbox, Box)
  - Connectors and sources (expands to: Web, Trivago, GitHub, GoDaddy, Gmail with Calendar, Blackduck, Social)
  - Computer
  - Deep research
  - Model custom (with dropdown) — "Web" radio button selected
  - More (expands further)
- Model selector shows: "Claude Sonnet 4.6 Thinking ▼" with option to change
- Thinking toggle (on/off) at model level
- Reasoning effort selector: toggle shown for "Thinking" mode (visible as on/off switch)
- Voice: microphone icon (push-to-talk) at bottom-right of composer

#### 5. CHAT / MESSAGES

- Assistant message rendering: markdown body text
- Inline tool-call cards: "Skills" submenu with search field + expandable skill categories (legal, data, marketing, sales, cx) + management actions ("Create skill", "Manage skills")
- Thinking blocks: not observed in detail but implied by "Thinking" toggle at model level
- Structured cards: "Computer works for you" card with inline action buttons ("Organize my life", "Help me learn", "Manage decisions", "Shuffle")

#### 6. ARTIFACTS / SIDEBAR

- No dedicated artifact sidebar observed in chat images. Skills gallery is grid-based (3-column layout with card titles, descriptions, subtags)

#### 8. CONNECTORS / TOOLS / SKILLS

- **Connectors grid**: dark-themed cards (3-column) with connector logos (Gmail, Drive, Notion, GitHub, Slack, Jira, Box, etc.). Each card shows name + brief description + icon. "All categories" dropdown + "Custom connector" button in top toolbar.
- **Skills library**: grid of skill cards with category filtering (All, My skills, Examples skills). Each card shows: icon + title + description + usage count. Visible categories: legal, data, marketing, sales, CX. "Create skill" button in top bar.
- **Skills creation modal** (from settings): form with fields:
  - Shortcut name (e.g., "/gpt-5-4")
  - Instructions text area
  - Advanced section (collapsed) with:
    - Mode dropdown (Search, Web, etc.)
    - Model dropdown (Best, Sonar, GPT-5.4, Gemini 3.1 Pro, Claude Sonnet 4.6, thinking toggle)
    - Sources dropdown (Web)

#### 9. SETTINGS

- **Left navigation structure**: Account, Preferences, Personalization, Assistant, Shortcuts, Notifications, Usage and credits, Connectors, Pro Perks, (expandable) Shopping, Travel, Upgrade to Enterprise, Learn more, API, API Platform
- **Account tab**: Account info (avatar, name, email), subscription status ("Pro" badge), full name change, username change, Your Subscription section (view details, upgrade plan button), Pro Discord link, System section (Support, Sign out options, Delete account)
- **Preferences tab**: Appearance (theme selector: Light/Dark/Serif), Language, Preferred response language, Autosuggest toggle, Artificial Intelligence section (image gen model dropdown, video gen model dropdown → "Upgrade to Max", AI data retention toggle)
- **Personalization tab**: Your occupation (text input), Custom instructions (text area with Clear/Save buttons), Location section (Share location toggle, Response preferences dropdown, Response Length dropdown, Headers and Lists dropdown), Memory section (Reference search history toggle, Reference saved memories toggle, "Manage your saved memories" link)
- **Personalization continuation**: Memory tab continued + Watchlists section + Finance section (Manage link)
- **Assistant tab**: "Save time on your inbox and calendar with Perplexity Assistant" + "Get Started" CTA
- **Shortcuts tab**: Create modal with: shortcut name field, instructions text area, advanced mode/model selectors. Shortcuts list showing saved shortcuts (e.g., "/claude-4-6-sonnet", "/teach-me-comet", "/trending-on-social", "/evaluate-this-deal", "/prep-next-meeting") with descriptions
- **Notifications tab**: Create Scheduled Search card + preset templates (News Digest, Market Forecast, Tech Insights, Science Explorer, Sports Roundup, Entertainment Weekly) + Scheduled Searches list (one example: "What are today's most important and widely-discussed news stories?") + Price Alerts section
- **Notifications (email) tab**: Email settings toggles (Deep research, Computer Tasks, Scheduled Tasks, Web push, Deep research)
- **Usage and credits tab**: Available usage-based credits section with "Add credits" button. Plan credits + purchased credits display. "Add credits to use Computer" call-out. Manage usage-based credits section with payment method dropdown, Auto-refill toggle. Credit usage breakdown: tabs for Text usage, Image usage, Video usage, Audio usage (all showing "0.00 credits this month")
- **Pro Perks tab**: Partner discounts grid: Samsung, Perplexity Travel, Headspace, Oura, Function Health, Viator, GoodRx, Caliber, Eight Sleep, Thumbtack. Each with "View" CTA.
- **Settings: Appearance preferences** — Theme selector with 3 visual options (light, dark, serif). Answer font dropdown. Preferences section (Language, Preferred response language, Autosuggest). AI section (Image generation model, Video generation model). Sidebar toggle visible.

#### 12. PRICING / UPGRADE

- **Enterprise pricing modal**: two-tier card layout ("enterprise pro" $34/month vs "enterprise max" $271/month). Each card shows: tier name, features list (checkmarks), annual savings callout (toggle), "Continue with [tier]" button. Features listed: research & model selection, complex queries, team seats, premium source discovery, etc.

#### 14. MOBILE / COMPACT MODE

- Not observed in these desktop images

#### 16. BROWSER EXTENSION UX (Comet)

- **Sidebar empty state**: large Perplexity "twirl" logo (grey), "Assistant" text label
- **Toolbar**: horizontal row of icon buttons: link (attachment), Perplexity logo, puzzle piece, hamburger menu, audio waveform, X (close), "Assistant" label
- **Composer bottom area**: "Type / for search modes and shortcuts" placeholder + "+" button + model selector dropdown ("Claude Sonnet 4.6" or "Claude Sonnet 4.6 Thinking") + microphone (voice) + speaker icon (output audio)
- **Attachment menu** (+ button opens):
  - Upload files or images (note: "Files attached to threads are retained for 7 days")
  - Add files from cloud (arrow to submenu)
  - Screenshot
  - Control browser (description: "Automate web tasks for you")
- **Model selector dropdown**: Shows "Best" (auto), "Sonar", "GPT-5.4", "Gemini 3.1 Pro", "Claude Sonnet 4.6", "Thinking" toggle
- **YouTube floating panel**: semi-transparent sidebar overlaid on YouTube page. Shows Perplexity logo + "Assistant" label in top-right. Buttons below video (summarize, extract, scroll actions implied by context)

---

## Standout patterns worth copying

1. **Perplexity's slash-command affordance in composer** ("Type / for connectors and sources") — provides instant discoverability of nested tools/modes without opening a menu first. Could elevate our Commander UX.

2. **Gemini's collapsible reasoning stages** ("Show thinking" expandable with structured sub-stages like "Defining the search", "Refining the destination") — cleaner than flat thinking blocks. Users can skim stages or expand for detail.

3. **Perplexity's settings left-nav structure** with icon + label consistently applied — information architecture is clear and scalable. Our SETTINGS currently lacks this level of sub-navigation clarity.

4. **Multi-source attachment menu architecture** (Perplexity) — nesting cloud providers (Google Drive → OneDrive → SharePoint → Dropbox → Box) under one "Add files from cloud" item reduces visual clutter. Same pattern for "Connectors and sources".

5. **Gemini's Tools submenu with beta/experimental badges** — signals feature maturity (Create music [beta], Experimental features [+ Labs badge]). Helps users understand what's stable vs in-flight.

6. **Perplexity Computer's "Computer works for you" value proposition + inline action chips** — positions agentic features (Organize my life, Help me learn) as concrete use cases, not abstract capabilities.

7. **Model selector with description text** (Perplexity Comet: "Claude Sonnet 4.6 Anthropic's fast model", "Gemini 3.1 Pro Google's latest model") — helps users distinguish between models at a glance, not just version numbers.

8. **Enterprise pricing two-card comparison layout** (Perplexity) — side-by-side feature checklists with annual savings toggle make tier differentiation obvious. Better than vertical table lists.

9. **Perplexity's Skills creation workflow** — modal form with name + instructions + advanced mode/model selectors. Skill library then lists created shortcuts with descriptions. Reusable pattern for custom workflows.

10. **YouTube floating panel in Comet** — in-page context-aware sidepanel (not full-screen modal) for browser-extension operations. Reduces context switch for video summarization/extraction.

---

## Anti-patterns or design choices to avoid

1. **Gemini's "Import memory to Gemini" banner in hero empty state** — top-of-page alert banner breaks the clean empty-state narrative. Better to surface this in onboarding or as a tertiary action, not as a prominent hero banner.

2. **Perplexity's "Trending on social" shortcut auto-created** — users may not realize they have custom shortcuts visible in their nav. Risk of list bloat if users create many. Could benefit from a "View all shortcuts" link or subcategory collapse.

3. **Comet's YouTube floating panel truncation of context** — panel obscures 30-40% of the video sidebar. Users can't simultaneously view video metadata AND AI analysis. Trade-off: either full-screen modal (interrupts context) or narrower side panel.

4. **Perplexity's "Manage your saved memories" link (Personalization > Memory)** — unclear interaction model. Link suggests a modal or sub-page, but no detail shown. Navigation friction.

5. **Gemini's Flights result with price-per-option but no date clarity** — user sees "$577", "$651", "$816" but no bold callout of "best price" or "fastest time". Requires careful reading; could confuse on mobile.

---

## Key observations

- **Composer UX divergence**: Gemini favors a Tools submenu with organized categories (Create image, Deep research, Create music, Guided learning). Perplexity favors slash-commands + contextual quick-action chips. Both strategies work; ours should pick one.
- **Thinking/Reasoning display**: Gemini makes it a toggle in composer with collapsible stages. Perplexity makes it a model-level feature. Different philosophies; Gemini's is more granular.
- **Settings organization**: Perplexity's left-nav with ~15 sections is more comprehensive than Gemini's (observed: Account, Preferences, Personalization, Notifications, Usage, Connectors, Pro Perks sections). Ours should match scope.
- **Empty state framing**: Gemini = "What should we do today?" (open-ended). Perplexity Computer = "Computer works for you. What should we work on next?" (agentic). Choose messaging based on user expectations for each surface.
- **Attachment/Connector discovery**: Both use dropdown menus, but Perplexity's nesting (Add files from cloud → [Google Drive, OneDrive, ...]) and Gemini's flat list (Upload files, Add from Drive, Photos, Import code, NotebookLM) are both defensible. Perplexity scales better if connector count grows.
