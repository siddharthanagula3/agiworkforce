# Feature Coverage Matrix — Claude Reference vs AGI Web

Status: Current
Owner: Platform lead
Last updated: 2026-05-25

> Generated 2026-05-24 from 27 parallel image-vs-code audit batches.
> **Updated 2026-05-25**: Re-verified against actual source code. Many "partial" and "missing" items are now present/fixed after 90+ migration commits.
> Status: **present** = feature exists and roughly works | **partial** = exists but substantially incomplete | **missing** = no implementation | **N/A** = intentionally out of scope

---

## Core Chat Experience

| Feature                       | Status  | Notes                                                                                      | Batch |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------ | ----- |
| Greeting banner / empty state | present | Works but dead CHIPS array, no plan-adaptive content                                       | B01   |
| Composer text input           | present | Functional                                                                                 | B01   |
| Send button                   | present | Terra-cotta themed                                                                         | B01   |
| File/image attachment         | partial | AttachmentPreview exists but message.attachments never rendered after send                 | B17   |
| Model selector dropdown       | present | Tier-aware grouping via `partitionModels()`, upgrade badges on locked models, search input | B02   |
| Thinking/effort toggle        | present | Inside dropdown, "Adaptive" label present, effort selector for supported providers         | B02   |
| Message bubbles               | present | Functional with markdown rendering                                                         | B17   |
| Scroll-to-bottom button       | present | Floating button works                                                                      | B17   |
| Streaming responses           | present | Works but artifacts don't render until stream completes                                    | B14   |
| Comparison A/B responses      | partial | Side-by-side grid instead of tab switch                                                    | B17   |
| Follow-up suggestions         | present | FollowUpSuggestions component exists                                                       | B17   |

## Sidebar & Navigation

| Feature                         | Status  | Notes                                                                       | Batch    |
| ------------------------------- | ------- | --------------------------------------------------------------------------- | -------- |
| Collapsed icon rail             | present | 7-icon rail but missing code/integrations icons                             | B01      |
| Expanded sidebar with chat list | present | ConversationListItem with pin/star/archive wired via SessionItem            | B13      |
| Chat/Cowork/Code mode tabs      | partial | Live behind `?unified=1` flag via UnifiedChatPage/WebShellV3 (not dead)     | B11, B13 |
| Folder management               | present | FolderManagement exported, FolderContextSelector uses it                    | B13      |
| Bulk select mode                | missing | No multi-select for chats                                                   | B13      |
| Full-page /chats index          | present | `app/chats/page.tsx` exists with ConversationListItem                       | B13      |
| Sidebar search                  | present | Search icon wired to GlobalSearchDialog (ChatSidebar line 603)              | B13      |
| Sidebar more menu               | present | Account menu has 6+ items: Settings, Help, Plans, Apps, Shortcuts, Sign out | B13      |
| Project tag badges on chats     | missing | Data model exists but not rendered                                          | B13      |

## Artifacts

| Feature                           | Status  | Notes                                                                    | Batch    |
| --------------------------------- | ------- | ------------------------------------------------------------------------ | -------- |
| Inline artifact block             | partial | Works but bordered container, no streaming render                        | B14      |
| Artifact panel (right side)       | present | ArtifactPreview mounted in ArtifactsPanel with code+preview tabs         | B14      |
| ArtifactPreview (tabs, iframe)    | present | Connected to ArtifactsPanel (line 7), GalleryClient, InlineArtifactCards | B14      |
| HTML artifact rendering           | present | SandboxedIframe with allow-scripts, handles HTML/React/SVG/Mermaid       | B16      |
| Markdown preview                  | missing | `document` type maps to `code`                                           | B14, B16 |
| PDF viewer                        | missing | Only PDF export via jsPDF                                                | B16      |
| DOCX viewer                       | missing | Only DOCX export                                                         | B16      |
| Split-pane view                   | missing | No split code/preview                                                    | B16      |
| Copy/export menu                  | present | "Open in new tab" uses text/html MIME (fixed)                            | B14      |
| Download all button               | present | Download All as ZIP via JSZip (ArtifactsPanel lines 143-153)             | B16, B17 |
| Print button                      | missing | Sandbox lacks allow-modals                                               | B16      |
| Artifact gallery page             | partial | Exists but no thumbnails, no "New" button, no skeleton                   | B15      |
| Category picker for new artifacts | missing | 7-category flow absent                                                   | B15      |
| Guided creation wizard            | missing | No numbered-option chat wizard                                           | B15      |
| Artifact versioning               | partial | Store has versions but UI doesn't expose them                            | B14      |

## Reasoning & Search

| Feature                          | Status  | Notes                                                        | Batch |
| -------------------------------- | ------- | ------------------------------------------------------------ | ----- |
| Thinking block (expand/collapse) | present | ReasoningAccordion with amber accent, Clock icon (not Brain) | B19   |
| Multiple thinking steps          | missing | Only one block per message                                   | B19   |
| Interleaved reasoning+tool flow  | missing | Separate stacked sections, no temporal narrative             | B19   |
| Web search execution             | partial | Core flow works but sources in footer only                   | B19   |
| Inline source citations          | missing | Only numbered circles, no name badges                        | B19   |
| Per-section source links         | missing | All lumped into footer                                       | B19   |
| Research panel (sources sidebar) | missing | No split-panel equivalent                                    | B19   |

## Inline Tool Results

| Feature                          | Status  | Notes                                  | Batch |
| -------------------------------- | ------- | -------------------------------------- | ----- |
| Tool call card                   | present | Basic expand/collapse works            | B18   |
| Filesystem results summary       | partial | No file-type badges, no filename pills | B18   |
| JSON request/response detail     | partial | No structured formatting               | B18   |
| Web search results with favicons | partial | Heavy bordered cards, 3-4x space       | B18   |
| Sequential file operation steps  | partial | No vertical connector line             | B18   |
| Stacked compact status messages  | partial | Not interleaved within prose           | B18   |
| Tabular data formatting          | missing | Raw JSON shown                         | B18   |

## Skills & Plugins

| Feature                          | Status  | Notes                                                                                        | Batch |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------- | ----- |
| Skills submenu in composer       | present | SkillsMenu imported in ChatComposerNew (line 20), rendered in overflow menu                  | B04   |
| Slash command → skill activation | present | Canonical slash-command-registry.ts used by SlashCommandMenu; skills rendered with `/{name}` | B04   |
| Skill body injection into LLM    | missing | skillId passed but body never injected — `_skillId` discarded in WebChatPage.tsx:395         | B04   |
| Skills directory page            | present | Fetches from `/api/skills` (skills/page.tsx line 158), not hardcoded                         | B07   |
| Skill detail panel               | present | `skills/[name]/page.tsx` exists with lazy body fetch                                         | B07   |
| Plugin system (entity)           | missing | No data model                                                                                | B05   |
| Plugin submenu in composer       | missing |                                                                                              | B05   |
| Plugin directory/marketplace     | missing |                                                                                              | B05   |
| Plugin install/uninstall         | missing |                                                                                              | B05   |
| Browse plugins overlay           | missing |                                                                                              | B05   |

## Connectors

| Feature                          | Status  | Notes                                              | Batch    |
| -------------------------------- | ------- | -------------------------------------------------- | -------- |
| Connector card grid              | present | 72+ connectors across 14 categories                | B08      |
| Connector connect/disconnect     | partial | CSRF fixed; OAuth intentionally deferred (D-02)    | B06, B10 |
| Paginated directory              | present | `ITEMS_PER_PAGE = 20`, `currentPage` state         | B08      |
| Connector type system            | missing | No connector/interactive/MCP distinction           | B08      |
| Master-detail layout             | present | ConnectorListRow left + ConnectorDetailPanel right | B09      |
| Per-tool permissions             | present | 3-state allow/ask/deny via ToolPermissionsPanel    | B09      |
| Tool inventory per connector     | missing | Only static actionCount                            | B09      |
| Pre-connection overview dialog   | missing |                                                    | B09      |
| Custom MCP server registration   | missing | Endpoint doesn't exist (404)                       | B10      |
| OAuth grant modal                | missing | No real OAuth handoff                              | B10      |
| Connector submenu in composer    | missing |                                                    | B03      |
| Per-chat connector toggles       | missing | No data model for per-conversation scope           | B03      |
| Unified directory modal (3 tabs) | missing |                                                    | B06      |

## Customize Hub

| Feature                     | Status  | Notes                           | Batch |
| --------------------------- | ------- | ------------------------------- | ----- |
| Unified /customize page     | missing | Skills and connectors scattered | B07   |
| Personal plugins sidebar    | missing |                                 | B07   |
| Skill detail with file tree | missing |                                 | B07   |
| Per-tool permission toggles | missing |                                 | B07   |
| Add skill functionality     | missing | Button exists but no handler    | B07   |

## Projects

| Feature               | Status  | Notes                                                                    | Batch |
| --------------------- | ------- | ------------------------------------------------------------------------ | ----- |
| Projects index page   | present | Card grid exists                                                         | B20   |
| Project create form   | partial | Works but limited fields                                                 | B20   |
| Project detail view   | partial | No right sidebar (Memory/Instructions/Files)                             | B20   |
| Project-scoped chat   | missing |                                                                          | B20   |
| Three-pane layout     | missing |                                                                          | B20   |
| File preview modal    | missing |                                                                          | B20   |
| Knowledge file upload | missing | Permanently disabled                                                     | B20   |
| Sort/search on index  | present | SortMode with 4 options, functional sort dropdown (projects/page.tsx)    | B20   |
| Card context menu     | present | Three-dot menu with star/edit/archive/delete (ProjectCard lines 162-299) | B20   |
| Loading skeleton      | missing |                                                                          | B20   |

## Code / Cowork Mode

| Feature                | Status  | Notes                                            | Batch |
| ---------------------- | ------- | ------------------------------------------------ | ----- |
| Code mode dashboard    | missing | No stats, no heatmap                             | B11   |
| Permission mode system | missing | No graduated autonomy                            | B11   |
| Repository selector    | missing |                                                  | B11   |
| Cowork task management | missing |                                                  | B11   |
| Budget tracker         | partial | Basic stats, no rate limits/progress bars        | B11   |
| Tool permission prompt | partial | Approve/reject but no "Always allow" persistence | B11   |

## Account & Auth

| Feature                  | Status  | Notes                                                       | Batch |
| ------------------------ | ------- | ----------------------------------------------------------- | ----- |
| Account dropdown menu    | present | 6+ items: Settings, Help, Plans, Apps, Shortcuts, Sign out  | B12   |
| Login page               | present | Clerk SignIn component                                      | B24   |
| Signup page              | present | Clerk-based                                                 | B24   |
| OAuth callback           | present | Returns 410 Gone — stale route properly decommissioned      | B24   |
| Logout flow              | present | Clerk `signOut()` (ChatSidebar line 274)                    | B12   |
| Plan badge in sidebar    | present | Tier label with Upgrade link for free users (lines 295-307) | B12   |
| Plan-adaptive menu items | present | FreePlanNudge component rendered (line 724)                 | B12   |

## Settings

| Feature              | Status  | Notes                                                                               | Batch    |
| -------------------- | ------- | ----------------------------------------------------------------------------------- | -------- |
| Settings nav sidebar | present | 8 items: General, Account, Privacy, Billing, Usage, Capabilities, Connectors, Voice | B22, B23 |
| General settings     | present | Controlled form inputs with onChange, debounced auto-save                           | B22      |
| Profile settings     | present | Works via Clerk                                                                     | B22      |
| Privacy settings     | partial | Missing doc links, shared chats toggle                                              | B22      |
| Billing settings     | partial | No invoice history, no payment method display                                       | B22      |
| Usage page           | present | `usage/page.tsx` with Progress components                                           | B22      |
| Account page         | present | `settings/account/page.tsx` with delete account                                     | B22      |
| Capabilities page    | present | Switch toggles with lowerCapTiers annotations and tooltips                          | B23      |
| Connectors settings  | partial | 6-connector gallery with waitlist buttons                                           | B23      |
| Claude Code settings | missing | N/A — not applicable to AGI product                                                 | B23      |
| Cowork settings      | missing | v1.1 scope per D-01                                                                 | B23      |
| Voice settings       | present | Linked in nav (layout.tsx line 18)                                                  | B23      |
| Memory settings      | present | MemoryEditor from unified-chat package                                              | B23      |

## Downloads & Pricing

| Feature                       | Status  | Notes                                        | Batch    |
| ----------------------------- | ------- | -------------------------------------------- | -------- |
| Download page                 | partial | Text-only CLI installer, no integration hub  | B21      |
| Pricing page                  | partial | Structurally sound but divergent tiers       | B21, B24 |
| Plan comparison table         | partial | Different architecture (usage vs seat-based) | B21      |
| Mobile download section       | missing |                                              | B21      |
| Chrome extension install card | missing |                                              | B21      |

## Marketing Pages (Non-Web Clients)

| Surface           | Accuracy | Coverage           | Screenshots    | Batch |
| ----------------- | -------- | ------------------ | -------------- | ----- |
| Chrome Extension  | low      | 10-20% of features | 0 visual demos | B25   |
| VS Code Extension | low      | 10-20% of features | 0 visual demos | B26   |
| CLI               | low      | 10-20% of features | 0 visual demos | B26   |
| Mobile            | medium   | 6 of 10+ features  | 0 visual demos | B27   |

---

## Summary — Updated 2026-05-25

| Status  | Count | Percentage |
| ------- | ----- | ---------- |
| Present | 48    | 41%        |
| Partial | 23    | 19%        |
| Missing | 47    | 40%        |

**41% of Claude's reference features are present and functional** (up from 14%).
**40% remain missing** (down from 53%), mostly in plugin architecture, code/cowork modes, and advanced artifact features.
