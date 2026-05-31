# R27-PARITY Phase B — Lane L-DESKTOP Per-Image Audit

**Date:** 2026-05-23  
**Auditor:** Desktop Engineer (claude-sonnet-4-6)  
**Benchmark:** Claude desktop (production, Max 20x plan, 2026-05-15)  
**Image corpus:** 210 reference images across 6 directories  
**Source tree:** `apps/desktop/src/` (React + Vite + TypeScript + Tailwind, Tauri v2)

---

## Critical Pre-Note: Boot-Hang P0 Blocker

**Every image in this report describes features behind a boot blocker.** The installed binary (Apr 29, 2026) awaits `localhost:11434` (Ollama) and `localhost:9999` with no timeout before React paints. Users see a blank screen until Ollama is running. This must be fixed before any other gap matters. Source: `apps/desktop/src-tauri/src/server/` — no timeout guard on local service probe. This is the first P0 item in Section 4.

---

## Section 1: Per-Image Scorecard

Verdict symbols:

- ✅ At parity with Claude
- 🟡 Partial — feature exists but with gaps
- ❌ Missing — feature absent in AGI desktop
- 🔄 Different by design (lock cited)
- 🚧 v2-deferred — cloud-only; **NO InviteCodeModal component exists in source** so all cloud-only items score ❌

### Group A — claude-artifacts (27 images)

| #   | Image                                                                        | Description                                                      | Source path:line                                                                   | Verdict | Gap                                                                  | Tag |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- | --- |
| A01 | `claude-artifacts/01_chat-response_comparison-options-ab.png`                | A/B response comparison pills below AI response                  | `ActiveChat.tsx:49-138` — no comparison UI                                         | ❌      | No A/B comparison pills rendered anywhere in AGI                     | v1  |
| A02 | `claude-artifacts/02_inline-tool-use_filesystem-results-summary.png`         | Inline tool use card — filesystem results summary with file list | `ActiveChat.tsx:115` — `InlineArtifactChip` exists but no tool-result summary card | 🟡      | Chip exists, but no expanded tool-result summary card with file list | v1  |
| A03 | `claude-artifacts/03_inline-tool-expanded-detail_json-request-response.png`  | Expanded inline tool detail showing JSON request/response        | `ActiveChat.tsx:115` — chip only; no expandable JSON detail view                   | ❌      | No expandable request/response detail panel                          | v1  |
| A04 | `claude-artifacts/04_chat-layout_scroll-to-bottom-floating-button.png`       | Floating scroll-to-bottom button in chat                         | `ActiveChat.tsx` — no scroll button found                                          | ❌      | No scroll-to-bottom floating button                                  | v1  |
| A05 | `claude-artifacts/05_chat-response_thumbnail-artifact-preview.png`           | Thumbnail artifact preview chip in response                      | `ActiveChat.tsx:115` — `InlineArtifactChip` exists                                 | ✅      | —                                                                    | v1  |
| A06 | `claude-artifacts/06_inline-web-search-results_with-favicons.png`            | Inline web search results with favicon badges                    | `ActiveChat.tsx:49-138` — no web search result cards                               | ❌      | No inline web search result rendering                                | v1  |
| A07 | `claude-artifacts/07_inline-tool-steps_file-creation-sequence.png`           | Inline tool steps for file creation sequence                     | `ActiveChat.tsx:115` — chip only, no step sequence                                 | ❌      | No multi-step tool progress display                                  | v1  |
| A08 | `claude-artifacts/08_stacked-tool-status-messages_compact.png`               | Stacked compact tool status messages                             | `ActiveChat.tsx:115` — no stacked tool status                                      | ❌      | No stacked tool status message rendering                             | v1  |
| A09 | `claude-artifacts/09_chat-context_relevant-chats-list.png`                   | Relevant chats context panel in chat                             | `Sidebar.tsx` — no relevant-chats context panel                                    | ❌      | No contextual related-chats panel                                    | v1  |
| A10 | `claude-artifacts/10_inline-tool-steps_file-operations-html.png`             | Inline tool steps for file operations (HTML generation)          | `ActiveChat.tsx:115` — chip only                                                   | ❌      | No tool step sequence display                                        | v1  |
| A11 | `claude-artifacts/11_inline-reasoning-steps_thinking-blocks-clock-icons.png` | Inline reasoning steps with clock icon per thought block         | `ThinkingPill.tsx` — has "Reasoned for X sec" but no clock icon                    | 🟡      | ThinkingPill exists; missing clock icon next to thought count        | v1  |
| A12 | `claude-artifacts/12_artifact-sidebar_html-resume-preview.png`               | Artifact sidebar — HTML resume live preview                      | `ArtifactPanel.tsx:70` — Preview tab exists                                        | ✅      | —                                                                    | v1  |
| A13 | `claude-artifacts/13_artifact-viewer_toolbar-copy-refresh-close.png`         | Artifact viewer toolbar: Copy, Refresh, Close buttons            | `ArtifactPanel.tsx:224` — Copy and Download exist; no Refresh                      | 🟡      | Missing Refresh button in artifact toolbar                           | v1  |
| A14 | `claude-artifacts/14_chat-user-message_pasted-tag-reasoning-steps.png`       | User message with pasted-content tag and reasoning steps         | `ActiveChat.tsx:16-45` — plain `message.content` div, no tag                       | ❌      | No pasted-content tag rendering in user bubble                       | v1  |
| A15 | `claude-artifacts/15_inline-reasoning-flow_multiple-thought-blocks.png`      | Multiple thought blocks in inline reasoning flow                 | `ThinkingPill.tsx` — single ThinkingPill, no multi-block flow                      | 🟡      | Single pill only; no multi-block collapsible thought flow            | v1  |
| A16 | `claude-artifacts/16_artifact-editor_html-code-source-view.png`              | Artifact editor — HTML code source view with syntax highlight    | `ArtifactPanel.tsx:70` — Code tab exists                                           | ✅      | —                                                                    | v1  |
| A17 | `claude-artifacts/17_chat-response_multiple-artifact-cards-download-all.png` | Multiple artifact chips with "Download all" button               | `ArtifactPanel.tsx:224` — single download only                                     | 🟡      | No "Download all" button when multiple artifacts present             | v1  |
| A18 | `claude-artifacts/18_artifact-sidebar_markdown-preview-split-view.png`       | Artifact sidebar — markdown preview in split-pane view           | `ArtifactPanel.tsx:70` — Preview tab present                                       | ✅      | —                                                                    | v1  |
| A19 | `claude-artifacts/19_artifact-sidebar_markdown-source-code-view.png`         | Artifact sidebar — markdown source / code view                   | `ArtifactPanel.tsx:70` — Code tab present                                          | ✅      | —                                                                    | v1  |
| A20 | `claude-artifacts/20_artifact-sidebar_rich-text-document-preview.png`        | Artifact sidebar — rich text document preview                    | `ArtifactPanel.tsx:70` — Preview tab present                                       | ✅      | —                                                                    | v1  |
| A21 | `claude-artifacts/21_artifact-sidebar_pdf-preview-dark-mode.png`             | Artifact sidebar — PDF preview in dark mode                      | `ArtifactPanel.tsx` — no PDF renderer                                              | ❌      | No PDF preview renderer in ArtifactPanel                             | v1  |
| A22 | `claude-artifacts/22_inline-reasoning_pdf-generation-library-install.png`    | Inline reasoning during PDF generation (library install step)    | `ThinkingPill.tsx` — reasoning pill exists                                         | 🟡      | Reasoning pill exists; no library-install step display               | v1  |
| A23 | `claude-artifacts/23_inline-tool-iterative-fixes_python-pdf-script.png`      | Iterative tool use: Python PDF script with fix loop display      | `ActiveChat.tsx:115` — chip only                                                   | ❌      | No iterative fix loop visualization                                  | v1  |
| A24 | `claude-artifacts/24_artifact-viewer_tabbed-content-with-print-button.png`   | Artifact viewer with Print button in tab toolbar                 | `ArtifactPanel.tsx` — no Print button                                              | ❌      | No Print button in artifact toolbar                                  | v1  |
| A25 | `claude-artifacts/25_inline-reasoning_design-skill-tool-use.png`             | Inline reasoning with design skill tool use                      | `ThinkingPill.tsx` — reasoning pill exists                                         | 🟡      | Pill exists; no skill-tool-use inline step cards                     | v1  |
| A26 | `claude-artifacts/26_inline-reasoning_multiple-markdown-artifacts.png`       | Inline reasoning with multiple markdown artifact generation      | `ThinkingPill.tsx` + `InlineArtifactChip.tsx` — both present                       | 🟡      | Chip + pill exist; no grouped multi-artifact display                 | v1  |
| A27 | `claude-artifacts/27_inline-tool_sequential-pdf-generation.png`              | Sequential inline tool use for PDF generation                    | `ActiveChat.tsx:115` — chip only                                                   | ❌      | No sequential tool step rendering                                    | v1  |

### Group B — claude-connectors (19 connector directory pages)

| #   | Image                                                                                       | Description                                                              | Source path:line                             | Verdict | Gap                                                                        | Tag |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- | ------- | -------------------------------------------------------------------------- | --- |
| B01 | `claude-connectors/01_directory_modal-page-01-gmail-canva-google-calendar-notion-slack.png` | Connector directory page 1: Gmail, Canva, Google Calendar, Notion, Slack | `ConnectorGallery.tsx` — 64 connectors total | 🟡      | Claude shows 250+ connectors across 19 pages; AGI has 64 (~49 coming-soon) | v1  |
| B02 | `claude-connectors/02_directory_modal-page-02-vercel-granola-sentry-asana-stripe.png`       | Connector directory page 2: Vercel, Granola, Sentry, Asana, Stripe       | `ConnectorGallery.tsx` — partial coverage    | 🟡      | Vercel present; Granola/Sentry/Asana absent                                | v1  |
| B03 | `claude-connectors/03_directory_modal-page-03-hugging-face-clay-ahrefs-pitchbook.png`       | Connector directory page 3: Hugging Face, Clay, Ahrefs, Pitchbook        | `ConnectorGallery.tsx` — not in definitions  | ❌      | None of these 4 connectors in AGI catalog                                  | v1  |
| B04 | `claude-connectors/04_directory_modal-page-04-scholar-make-snowflake-zapier.png`            | Connector directory page 4: Scholar, Make, Snowflake, Zapier             | `ConnectorGallery.tsx` — partial             | 🟡      | Zapier present as coming-soon; others absent                               | v1  |
| B05 | `claude-connectors/05_directory_modal-page-05-posthog-databricks-klaviyo-pendo.png`         | Connector directory page 5: PostHog, Databricks, Klaviyo, Pendo          | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present in AGI catalog                                                | v1  |
| B06 | `claude-connectors/06_directory_modal-page-06-similarweb-paypal-crypto-biorender.png`       | Connector directory page 6: SimilarWeb, PayPal, Crypto, BioRender        | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B07 | `claude-connectors/07_directory_modal-page-07-outreach-fellow-bitly-calendly.png`           | Connector directory page 7: Outreach, Fellow, Bitly, Calendly            | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B08 | `claude-connectors/08_directory_modal-page-08-mt-newswires-lseg-customer-io.png`            | Connector directory page 8: MT Newswires, LSEG, Customer.io              | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B09 | `claude-connectors/09_directory_modal-page-09-airops-cloudinary-lunarcrush-pagerduty.png`   | Connector directory page 9: AirOps, Cloudinary, LunarCrush, PagerDuty    | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B10 | `claude-connectors/10_directory_modal-page-10-craft-motherduck-mem-metaview.png`            | Connector directory page 10: Craft, MotherDuck, Mem, Metaview            | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B11 | `claude-connectors/11_directory_modal-page-11-owkin-yardi-google-compute-clarify.png`       | Connector directory page 11: Owkin, Yardi, Google Compute, Clarify       | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B12 | `claude-connectors/12_directory_modal-page-12-benevity-port-io-quartr-planetscale.png`      | Connector directory page 12: Benevity, Port.io, Quartr, PlanetScale      | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B13 | `claude-connectors/13_directory_modal-page-13-q2-clarity-ai-quickbooks-amplitude.png`       | Connector directory page 13: Q2, Clarity AI, QuickBooks, Amplitude       | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B14 | `claude-connectors/14_directory_modal-page-14-alayyn-cb-insights-clinical-trials.png`       | Connector directory page 14: Alayyn, CB Insights, Clinical Trials        | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B15 | `claude-connectors/15_directory_modal-page-15-zoho-filesystem-pdf-figma-tableau.png`        | Connector directory page 15: Zoho, Filesystem, PDF, Figma, Tableau       | `ConnectorGallery.tsx` — Filesystem present  | 🟡      | Filesystem present; Zoho/PDF/Figma/Tableau absent                          | v1  |
| B16 | `claude-connectors/16_directory_modal-page-16-apple-notes-control-mac-spotify.png`          | Connector directory page 16: Apple Notes, Control Mac, Spotify           | `ConnectorGallery.tsx` — partial             | 🟡      | Apple Notes + Control Mac present; Spotify absent                          | v1  |
| B17 | `claude-connectors/17_directory_modal-page-17-b12-elevenlabs-shadcn-grafana.png`            | Connector directory page 17: B12, ElevenLabs, Shadcn, Grafana            | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B18 | `claude-connectors/18_directory_modal-page-18-sapus-tomtom-fantastical-vendr.png`           | Connector directory page 18: Sapus, TomTom, Fantastical, Vendr           | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |
| B19 | `claude-connectors/19_directory_modal-page-19-meeting-memory-pathmode-jaz-comviso.png`      | Connector directory page 19: Meeting Memory, Pathmode, Jaz, Comviso      | `ConnectorGallery.tsx` — not in definitions  | ❌      | None present                                                               | v1  |

### Group C — claude-free (7 images — Claude Free plan view)

| #   | Image                                                                            | Description                                             | Source path:line                                        | Verdict | Gap                                                                                  | Tag |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ | --- |
| C01 | `claude-free/01_main_empty-state-lets-build-agiworkforce-sidebar.png`            | Empty state home with sidebar                           | `EmptyChat.tsx` — empty state present                   | 🟡      | AGI has greeting; Claude home has skill-chip shortcuts (Code/Write/Learn/From Gmail) | v1  |
| C02 | `claude-free/02_composer_attachment-menu-photos-plan-mode-speed.png`             | Attachment menu with Photos, Plan mode, Speed options   | `PlusMenu.tsx:20-43` — basic add menu exists            | 🟡      | Missing: Photos attachment, Plan mode toggle, Speed selector in + menu               | v1  |
| C03 | `claude-free/03_composer_local-status-dropdown-worktree-connect-cloud.png`       | Composer local status dropdown: worktree, connect cloud | `Composer.tsx` — no local/cloud status dropdown         | ❌      | No git-worktree or connect-cloud status in composer bar                              | v1  |
| C04 | `claude-free/04_composer_permissions-dropdown-default-vs-full-access.png`        | Composer permissions dropdown: Default vs Full Access   | `Composer.tsx` — no permissions dropdown                | ❌      | No permissions mode selector in composer                                             | v1  |
| C05 | `claude-free/05_composer_model-selector-dropdown-gpt-5-codex-options.png`        | Composer model selector with multi-provider options     | `ModelPopover.tsx:15-37` — model selector exists        | 🟡      | Model selector present; missing effort/speed toggle and multi-provider quick-switch  | v1  |
| C06 | `claude-free/06_sidebar-expanded_thread-history-user-popover.png`                | Expanded sidebar with thread history + user popover     | `Sidebar.tsx` + `AccountMenu.tsx` — both exist          | ✅      | —                                                                                    | v1  |
| C07 | `claude-free/07_settings_general-default-destination-language-notifications.png` | Settings General: language, notifications               | `settings/tabs/General/index.tsx` — general tab present | 🟡      | General tab present; lacks language selector + notification settings                 | v1  |

### Group D — claude-max20x (76 images)

| #   | Image                                                                                    | Description                                                                      | Source path:line                                           | Verdict | Gap                                                                                     | Tag |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------- | --- |
| D01 | `claude-max20x/2026-05-15/100_claude-max20x_home_composer.png`                           | Home — composer, "Good evening" greeting, Chat/Cowork/Code tabs, skill shortcuts | `EmptyChat.tsx` + `DesktopShellV3.tsx` — tabs exist        | 🟡      | AGI has tabs; missing personalized greeting, skill shortcut chips                       | v1  |
| D02 | `claude-max20x/2026-05-15/101_claude-max20x_model-selector_opus-enabled.png`             | Model selector dropdown — Opus 4.7 enabled                                       | `ModelPopover.tsx:15-37` — uses catalog helpers            | ✅      | —                                                                                       | v1  |
| D03 | `claude-max20x/2026-05-15/102_claude-max20x_model-selector_more-models.png`              | Model selector — expanded "More models" list                                     | `ModelPopover.tsx` — "More models" section present         | 🟡      | More models section exists; Claude shows 6 distinct choices with descriptions           | v1  |
| D04 | `claude-max20x/2026-05-15/103_claude-max20x_add-menu_tools-connectors.png`               | + menu — Add files, Skills, Connectors, Plugins                                  | `PlusMenu.tsx:20-43` — static SKILLS_LIST + CONNECTORS     | 🟡      | Menu structure present; items exist                                                     | v1  |
| D05 | `claude-max20x/2026-05-15/104_claude-max20x_connectors-submenu_connected.png`            | Connectors submenu with live connected connectors + toggles                      | `PlusMenu.tsx:30-43` — hardcoded 3 connectors              | ❌      | Hardcoded static list (gdrive/github/notion); not dynamic from runtime state            | v1  |
| D06 | `claude-max20x/2026-05-15/105_claude-max20x_skills-submenu_installed.png`                | Skills submenu showing installed skills                                          | `PlusMenu.tsx:20-29` — hardcoded 4 skills                  | ❌      | Hardcoded static list (translate/summarize/proofread/explain); not dynamic              | v1  |
| D07 | `claude-max20x/2026-05-15/106_claude-max20x_design_research-preview.png`                 | Claude Design product (separate Anthropic surface)                               | N/A — separate product                                     | 🔄      | Different product entirely; AGI has no "Design" tab by design                           | v2  |
| D08 | `claude-max20x/2026-05-15/108_claude-max20x_code_home.png`                               | Code mode home — sessions list, worktrees, model selector                        | `CodeModeHome.tsx` — Code mode home exists                 | 🟡      | Code mode home present; Claude shows sessions/routines/customize with "Mark all read"   | v1  |
| D09 | `claude-max20x/2026-05-15/109_claude-max20x_code_sidebar-more-menu.png`                  | Code mode sidebar "Customize sidebar" popup                                      | `Sidebar.tsx` — no customize popup                         | ❌      | No "Customize sidebar" popup in Code mode                                               | v1  |
| D10 | `claude-max20x/2026-05-15/110_claude-max20x_code_permission-mode-menu.png`               | Code mode permission mode selector                                               | `Composer.tsx` — no permission mode selector               | ❌      | No permission mode dropdown (Default/Full access) in Code mode                          | v1  |
| D11 | `claude-max20x/2026-05-15/111_claude-max20x_code_model-effort-menu.png`                  | Code mode model + effort picker                                                  | `ModelPopover.tsx` — model selector only; no effort picker | 🟡      | Model selector present; no effort level picker (Normal/High/Max)                        | v1  |
| D12 | `claude-max20x/2026-05-15/112_claude-max20x_code_usage-popover.png`                      | Code mode usage popover — token counts, session metrics                          | `CodeModeHome.tsx` — usage dashboard                       | 🟡      | Usage view present; Claude's shows per-session metrics + streak                         | v1  |
| D13 | `claude-max20x/2026-05-15/113_claude-max20x_code_repo-selector.png`                      | Code mode repo selector dropdown                                                 | `CodeModeHome.tsx` — no repo selector                      | ❌      | No git repository selector in Code mode                                                 | v1  |
| D14 | `claude-max20x/2026-05-15/114_claude-max20x_code_add-menu.png`                           | Code mode + menu (add files/connectors)                                          | `Composer.tsx` — composer + menu exists                    | 🟡      | + menu exists; Code mode lacks local-files/connector sub-items                          | v1  |
| D15 | `claude-max20x/2026-05-15/115_claude-max20x_code_connectors-submenu.png`                 | Code mode connectors submenu with live state                                     | `PlusMenu.tsx:30-43` — same hardcoded bug                  | ❌      | Same static connectors bug in Code mode                                                 | v1  |
| D16 | `claude-max20x/2026-05-15/116_claude-max20x_customize_home.png`                          | Customize home: Connect apps / Create skills / Browse plugins                    | `CustomizeHub.tsx` — customize hub exists                  | ✅      | —                                                                                       | v1  |
| D17 | `claude-max20x/2026-05-15/117_claude-max20x_customize_skills_detail.png`                 | Customize skills — skill detail panel with description, tools, examples          | `SkillsView.tsx` — skills view exists                      | 🟡      | Skills view present; detail panel less rich (no "Allowed tools" section)                | v1  |
| D18 | `claude-max20x/2026-05-15/118_claude-max20x_customize_skills_code-view.png`              | Customize skills — skill code/source view                                        | `SkillsView.tsx` — skills view                             | 🟡      | Skills view present; code-source tab presence not confirmed                             | v1  |
| D19 | `claude-max20x/2026-05-15/119_claude-max20x_customize_skills_add-menu.png`               | Customize skills — add skill menu                                                | `SkillsView.tsx` — add button present                      | 🟡      | Add button exists; no "import from marketplace" option                                  | v1  |
| D20 | `claude-max20x/2026-05-15/120_claude-max20x_directory_skills.png`                        | Directory modal — Skills tab with search and skill cards                         | `PluginMarketplace.tsx` — marketplace exists               | 🟡      | Marketplace present; Claude's shows richer skill cards with install counts              | v1  |
| D21 | `claude-max20x/2026-05-15/121_claude-max20x_directory_connectors.png`                    | Directory modal — Connectors tab                                                 | `ConnectorGallery.tsx` — gallery exists                    | 🟡      | Gallery present; Claude 250+ vs AGI 64 connectors                                       | v1  |
| D22 | `claude-max20x/2026-05-15/122_claude-max20x_directory_plugins.png`                       | Directory modal — Plugins tab with Anthropic & Partners plugins                  | `PluginMarketplace.tsx` — plugin marketplace               | 🟡      | Plugin marketplace present; Claude shows usage stats on cards                           | v1  |
| D23 | `claude-max20x/2026-05-15/123_claude-max20x_customize_connectors_github-detail.png`      | Connector detail — GitHub with Chat/Projects/Claude Code context tabs            | `ConnectorsView.tsx` — connector detail exists             | 🟡      | Connector detail present; Claude shows multi-tab context                                | v1  |
| D24 | `claude-max20x/2026-05-15/124_claude-max20x_customize_connectors_gmail-permissions.png`  | Connector detail — Gmail tool permissions with Always allow/Needs approval       | `ConnectorsView.tsx` — permissions UI exists               | ✅      | —                                                                                       | v1  |
| D25 | `claude-max20x/2026-05-15/125_claude-max20x_customize_connectors_vercel-permissions.png` | Connector detail — Vercel tool permissions                                       | `ConnectorsView.tsx` — permissions UI                      | ✅      | —                                                                                       | v1  |
| D26 | `claude-max20x/2026-05-15/126_claude-max20x_customize_connectors_add-menu.png`           | Customize connectors — add menu (Browse plugins / Create plugin)                 | `ConnectorsView.tsx` — add connector button                | 🟡      | Add button exists; no "Browse plugins" / "Create plugin" sub-items                      | v1  |
| D27 | `claude-max20x/2026-05-15/127_claude-max20x_custom-remote-mcp-connector-modal.png`       | Custom remote MCP connector modal (URL + auth config)                            | `ConnectorsView.tsx` — no remote MCP modal                 | ❌      | No custom remote MCP URL connector modal                                                | v1  |
| D28 | `claude-max20x/2026-05-15/128_claude-max20x_account-menu.png`                            | Account menu: Settings, Language, Upgrade, Get apps/extensions, Gift, Log out    | `AccountMenu.tsx` — account menu exists                    | 🟡      | Menu exists; missing "Gift Claude" and "Get apps and extensions" items                  | v1  |
| D29 | `claude-max20x/2026-05-15/141_claude-max20x_artifact_prompt-ready.png`                   | Artifact creation — prompt ready state                                           | `ArtifactPanel.tsx` — artifact panel                       | ✅      | —                                                                                       | v1  |
| D30 | `claude-max20x/2026-05-15/142_claude-max20x_artifact_generating.png`                     | Artifact generating — loading state                                              | `ArtifactPanel.tsx` — loading state exists                 | ✅      | —                                                                                       | v1  |
| D31 | `claude-max20x/2026-05-15/143_claude-max20x_artifact_result-inline-widget.png`           | Artifact result as inline interactive widget                                     | `InlineArtifactChip.tsx` — chip present                    | 🟡      | Inline chip present; Claude shows full interactive widget inline                        | v1  |
| D32 | `claude-max20x/2026-05-15/144_claude-max20x_artifact_widget-interacted-last-month.png`   | Artifact widget with "interacted last month" recency label                       | `ArtifactPanel.tsx` — no recency label                     | ❌      | No recency/last-interacted label on artifacts                                           | v1  |
| D33 | `claude-max20x/2026-05-15/145_claude-max20x_downloads_apps_top.png`                      | Downloads page — apps download section                                           | N/A — web page                                             | 🔄      | Web download page; not applicable to desktop surface                                    | v1  |
| D34 | `claude-max20x/2026-05-15/146_claude-max20x_downloads_mobile-chrome.png`                 | Downloads page — mobile and Chrome extension download                            | N/A — web page                                             | 🔄      | Web download page; not applicable to desktop                                            | v1  |
| D35 | `claude-max20x/2026-05-15/147_claude-max20x_upgrade-plans_individual.png`                | Upgrade plans — individual plans (Free/Pro/Max) with pricing                     | `PlansModal.tsx` — plans modal exists                      | 🔄      | Plans modal present; AGI tier names differ by design (lock: pricing-billing-decisions)  | v1  |
| D36 | `claude-max20x/2026-05-15/148_claude-max20x_upgrade-plans_team-enterprise.png`           | Upgrade plans — Team/Enterprise plans                                            | `PlansModal.tsx` — team/enterprise present                 | ❌      | No invite-code modal gate; cloud team features absent without `InviteCodeModal`         | v2  |
| D37 | `claude-max20x/2026-05-15/149_claude-max20x_artifacts_my-empty-or-loading.png`           | My Artifacts — empty or loading state                                            | `CoworkArtifacts.tsx` — artifacts tab exists               | 🟡      | Artifacts tab present; empty state copy differs                                         | v1  |
| D38 | `claude-max20x/2026-05-15/149b_claude-max20x_artifacts_grid-loaded.png`                  | My Artifacts — grid view with cards loaded                                       | `CoworkArtifacts.tsx` — grid present                       | ✅      | —                                                                                       | v1  |
| D39 | `claude-max20x/2026-05-15/150_claude-max20x_chats_recents.png`                           | Chats index — recent chats list with "Select chats" + "New chat"                 | `Sidebar.tsx` — chat history                               | 🟡      | Chat history in sidebar; no dedicated Chats index page with search + bulk-select        | v1  |
| D40 | `claude-max20x/2026-05-15/151_claude-max20x_global-search-modal.png`                     | Global search modal (Cmd+K)                                                      | `SearchModalCmdK.tsx` — global search exists               | ✅      | —                                                                                       | v1  |
| D41 | `claude-max20x/2026-05-15/152_claude-max20x_sidebar-more-menu.png`                       | Sidebar "..." more menu                                                          | `Sidebar.tsx` — ellipsis menu exists                       | 🟡      | Menu present; Claude includes additional Cowork-specific items                          | v1  |
| D42 | `claude-max20x/2026-05-15/153_claude-max20x_chats_bulk-select-mode.png`                  | Chats bulk-select mode with checkboxes                                           | `Sidebar.tsx` — no bulk select                             | ❌      | No bulk-select mode for chats                                                           | v1  |
| D43 | `claude-max20x/2026-05-15/154_claude-max20x_new-artifact_category-picker.png`            | New artifact category picker                                                     | `ArtifactPanel.tsx` — no category picker                   | ❌      | No artifact category picker / "start from scratch" flow                                 | v1  |
| D44 | `claude-max20x/2026-05-15/155_claude-max20x_new-artifact_start-from-scratch-chat.png`    | New artifact — start-from-scratch chat mode                                      | `ArtifactPanel.tsx` — no such flow                         | ❌      | No "start from scratch" artifact creation chat flow                                     | v1  |
| D45 | `claude-max20x/2026-05-15/156_claude-max20x_artifact_viewer_split-pane.png`              | Artifact viewer in split-pane (chat + artifact side-by-side)                     | `ArtifactWorkspace.tsx` — split pane exists                | ✅      | —                                                                                       | v1  |
| D46 | `claude-max20x/2026-05-15/157_claude-max20x_artifact_copy-export-menu.png`               | Artifact copy/export menu with format options                                    | `ArtifactPanel.tsx:224` — copy/download                    | 🟡      | Copy + download present; no format-options export menu                                  | v1  |
| D47 | `claude-max20x/2026-05-15/158_claude-max20x_research-panel_sources-trace.png`            | Research panel with sources trace                                                | `CoworkHome.tsx` — no research panel                       | ❌      | No research-panel / sources-trace feature                                               | v2  |
| D48 | `claude-max20x/2026-05-15/159_claude-max20x_project-create-form.png`                     | Project creation form (name, description, files)                                 | `CoworkProjects.tsx` — project create exists               | ✅      | —                                                                                       | v1  |
| D49 | `claude-max20x/2026-05-15/160_claude-max20x_example-project_overview.png`                | Example project overview with composer + knowledge panel                         | `CoworkProjects.tsx` — project overview exists             | 🟡      | Project overview present; Claude shows loading skeleton + file cards in knowledge panel | v1  |
| D50 | `claude-max20x/2026-05-15/161_claude-max20x_project-file-preview-modal.png`              | Project — file preview modal                                                     | `CoworkProjects.tsx` — file preview exists                 | ✅      | —                                                                                       | v1  |
| D51 | `claude-max20x/2026-05-15/162_claude-max20x_project-options-menu.png`                    | Project options menu (rename, share, delete)                                     | `CoworkProjects.tsx` — options menu exists                 | 🟡      | Options menu present; Claude has "Favorite" star + share                                | v1  |
| D52 | `claude-max20x/2026-05-15/163_claude-max20x_project-edit-details-modal.png`              | Project edit details modal                                                       | `CoworkProjects.tsx` — edit modal                          | ✅      | —                                                                                       | v1  |
| D53 | `claude-max20x/2026-05-15/164_claude-max20x_project-composer-add-menu.png`               | Project composer + menu (files/connectors/skills)                                | `PlusMenu.tsx` — same static bug                           | ❌      | Static connectors/skills bug applies in project context                                 | v1  |
| D54 | `claude-max20x/2026-05-15/165_claude-max20x_project-connectors-submenu.png`              | Project connectors submenu with live state                                       | `PlusMenu.tsx:30-43` — hardcoded                           | ❌      | Static hardcoded connectors bug                                                         | v1  |
| D55 | `claude-max20x/2026-05-15/166_claude-max20x_project-model-selector.png`                  | Project model selector                                                           | `ModelPopover.tsx` — model selector                        | ✅      | —                                                                                       | v1  |
| D56 | `claude-max20x/2026-05-15/167_claude-max20x_project-chat-composer-ready.png`             | Project chat — composer ready state                                              | `CoworkProjects.tsx` — chat composer                       | ✅      | —                                                                                       | v1  |
| D57 | `claude-max20x/2026-05-15/168_claude-max20x_project-chat_response-loading.png`           | Project chat — response loading state with streaming indicator                   | `ActiveChat.tsx` — loading state                           | ✅      | —                                                                                       | v1  |
| D58 | `claude-max20x/2026-05-15/169_claude-max20x_project-chat_completed-response.png`         | Project chat — completed response with action buttons                            | `ActiveChat.tsx:49-138` — response row with actions        | ✅      | —                                                                                       | v1  |
| D59 | `claude-max20x/2026-05-15/170_claude-max20x_project-chat_reasoning-expanded.png`         | Project chat — reasoning expanded (thinking pill open)                           | `ThinkingPill.tsx` — expandable                            | 🟡      | ThinkingPill present; Claude's expanded view shows full thought text                    | v1  |
| D60 | `claude-max20x/2026-05-15/171_claude-max20x_project-return-loading-skeleton.png`         | Project return — loading skeleton state                                          | `CoworkProjects.tsx` — skeleton loading                    | ✅      | —                                                                                       | v1  |
| D61 | `claude-max20x/2026-05-15/172_claude-max20x_project-after-chat-no-chat-list.png`         | Project view after chat — chat list not visible                                  | `CoworkProjects.tsx` — post-chat view                      | ✅      | —                                                                                       | v1  |
| D62 | `claude-max20x/2026-05-15/173_claude-max20x_chats-index_recent-project-chat.png`         | Chats index — recent project chat with project breadcrumb                        | `Sidebar.tsx` — chat history                               | 🟡      | Chat list in sidebar; dedicated chats index with project breadcrumb absent              | v1  |
| D63 | `claude-max20x/2026-05-15/174_claude-max20x_projects-index_cards-sort-search.png`        | Projects index — card grid with sort and search                                  | `CoworkProjects.tsx` — projects list                       | 🟡      | Projects list present; Claude shows card grid with sort + search                        | v1  |
| D64 | `claude-max20x/2026-05-15/175_claude-max20x_projects-sort-menu.png`                      | Projects sort menu (Recent/Created/Alphabetical)                                 | `CoworkProjects.tsx` — no sort menu                        | ❌      | No sort dropdown on projects index                                                      | v1  |
| D65 | `claude-max20x/2026-05-15/176_claude-max20x_expanded-sidebar_projects.png`               | Expanded sidebar — Projects section with recents                                 | `Sidebar.tsx` — expanded sidebar                           | 🟡      | Sidebar expands; no recents nested under Projects section                               | v1  |

### Group E — claude/2026-03-28 (19 images)

| #   | Image                                                                     | Description                                                           | Source path:line                              | Verdict | Gap                                                                                | Tag |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | ------- | ---------------------------------------------------------------------------------- | --- |
| E01 | `claude/2026-03-28/01_empty-state_new-chat-collapsed-sidebar.png`         | Empty state — new chat, dark mode, collapsed sidebar, Free plan label | `EmptyChat.tsx` + `Sidebar.tsx`               | 🟡      | Dark mode present; Claude Free shows plan badge + "Upgrade" link in greeting       | v1  |
| E02 | `claude/2026-03-28/02_sidebar-expanded_chat-history.png`                  | Expanded sidebar with full chat history + profile at bottom           | `Sidebar.tsx` — expanded sidebar              | ✅      | —                                                                                  | v1  |
| E03 | `claude/2026-03-28/03_projects-gallery-view.png`                          | Projects gallery — card grid with sort dropdown                       | `CoworkProjects.tsx` — projects page          | 🟡      | Projects page present; sort menu absent                                            | v1  |
| E04 | `claude/2026-03-28/04_project-detail_knowledge-panel_error-banner.png`    | Project detail — knowledge panel with 326% capacity error banner      | `CoworkProjects.tsx` — knowledge panel        | 🟡      | Knowledge panel present; no capacity percentage error banner                       | v1  |
| E05 | `claude/2026-03-28/05_three-pane-layout_sidebar-chat-project.png`         | Three-pane layout: sidebar + chat + project knowledge                 | `DesktopShellV3.tsx` — three-pane possible    | 🟡      | Shell supports pane layout; knowledge panel not pinned persistently                | v1  |
| E06 | `claude/2026-03-28/06_chats-history-management-view.png`                  | Chats history management — full-page list with search + Select        | `Sidebar.tsx` — no full-page chats management | ❌      | No dedicated full-page chat history management with search + Select button         | v1  |
| E07 | `claude/2026-03-28/20_profile-popover-menu.png`                           | Profile popover: email, Settings, Language, Upgrade, Gift, Log out    | `AccountMenu.tsx` — account popover           | 🟡      | Account menu present; missing "Gift Claude" item                                   | v1  |
| E08 | `claude/2026-03-28/21_customize-claude-landing-page.png`                  | Customize landing: Connect apps / Create skills / Browse plugins      | `CustomizeHub.tsx` — customize hub            | ✅      | —                                                                                  | v1  |
| E09 | `claude/2026-03-28/22_skill-detail-view_humanizer.png`                    | Skill detail — Humanizer with description, tools, examples, code      | `SkillsView.tsx` — skill detail               | 🟡      | Skill detail present; Claude shows "Allowed tools" section + example prompts panel | v1  |
| E10 | `claude/2026-03-28/23_connector-permissions-dropdown_airtable.png`        | Connector permissions — Airtable with Always allow dropdown           | `ConnectorsView.tsx` — permissions            | ✅      | —                                                                                  | v1  |
| E11 | `claude/2026-03-28/24_connector-detail_gmail-tool-permissions.png`        | Connector detail — Gmail with read-only / write-delete tool groups    | `ConnectorsView.tsx` — tool groups            | ✅      | —                                                                                  | v1  |
| E12 | `claude/2026-03-28/25_connector-detail_github-integration-info.png`       | Connector detail — GitHub with multi-surface usage context            | `ConnectorsView.tsx` — GitHub detail          | 🟡      | Detail present; Claude shows three separate usage context tabs                     | v1  |
| E13 | `claude/2026-03-28/26_connector-detail_vercel-tool-permissions.png`       | Connector detail — Vercel with read-only tool list                    | `ConnectorsView.tsx` — permissions            | ✅      | —                                                                                  | v1  |
| E14 | `claude/2026-03-28/27_connector-detail_control-your-mac.png`              | Connector detail — Control Your Mac with Enable/Uninstall             | `ConnectorsView.tsx` — desktop connector      | ✅      | —                                                                                  | v1  |
| E15 | `claude/2026-03-28/28_connector-detail_desktop-commander-permissions.png` | Connector detail — Desktop Commander with tool list                   | `ConnectorsView.tsx` — tool list              | ✅      | —                                                                                  | v1  |
| E16 | `claude/2026-03-28/29_connector-detail_excel-blocked-permissions.png`     | Connector detail — Excel with Blocked permission groups               | `ConnectorsView.tsx` — Blocked state          | ✅      | —                                                                                  | v1  |
| E17 | `claude/2026-03-28/30_connector-detail_filesystem-settings.png`           | Connector detail — Filesystem with allowed directories config         | `ConnectorsView.tsx` — filesystem settings    | ✅      | —                                                                                  | v1  |
| E18 | `claude/2026-03-28/31_connectors-list_filesystem-selected.png`            | Connectors list — Filesystem selected, full tool list                 | `ConnectorsView.tsx` — connector list         | ✅      | —                                                                                  | v1  |
| E19 | `claude/2026-03-28/32_connectors-list_apple-notes-selected.png`           | Connectors list — Apple Notes (Blocked all tools)                     | `ConnectorsView.tsx` — Apple Notes            | ✅      | —                                                                                  | v1  |

### Group F — claude/2026-03-28 continued (OAuth + plans + showcase)

| #   | Image                                                                    | Description                                                      | Source path:line                        | Verdict | Gap                                                                             | Tag |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------- | ------- | ------------------------------------------------------------------------------- | --- |
| F01 | `claude/2026-03-28/33_connector-oauth-flow_slack-grant-access-modal.png` | OAuth flow — Slack "Grant access" modal with browser redirect    | `ConnectorsView.tsx` — OAuth flow modal | 🟡      | OAuth flow present; Claude's shows Slack branding + "Developed by Slack" badge  | v1  |
| F02 | `claude/2026-03-28/34_connector-overview_slack-details.png`              | Connector overview — Slack with full tool list chips             | `ConnectorsView.tsx` — tool chips       | ✅      | —                                                                               | v1  |
| F03 | `claude/2026-03-28/35_plans-pricing_individual-plans.png`                | Plans page — Free/Pro/Max individual with yearly toggle          | `PlansModal.tsx` — plans modal          | 🔄      | Plans modal present; AGI tier names differ by lock (pricing-billing-decisions)  | v1  |
| F04 | `claude/2026-03-28/36_plans-pricing_team-enterprise-plans.png`           | Plans page — Team $20/seat + Enterprise                          | `PlansModal.tsx` — team/enterprise      | ❌      | No invite-code modal gate; cloud team features absent without `InviteCodeModal` | v2  |
| F05 | `claude/2026-03-28/37_feature-showcase_integrations-top.png`             | Feature showcase — Microsoft Office + Cowork integration demo    | N/A — web marketing page                | 🔄      | Web marketing page; not desktop UI                                              | v1  |
| F06 | `claude/2026-03-28/38_feature-showcase_integrations-middle.png`          | Feature showcase — Cowork/Claude Code/Mobile/Chrome integrations | N/A — web marketing page                | 🔄      | Web marketing page                                                              | v1  |
| F07 | `claude/2026-03-28/39_feature-showcase_integrations-platforms.png`       | Feature showcase — Mobile iOS/Android + Chrome nav               | N/A — web marketing page                | 🔄      | Web marketing page                                                              | v1  |

### Group G — claude/2026-05-13 (9 root + 20 extended)

| #   | Image                                                                   | Description                                                                  | Source path:line                                                           | Verdict | Gap                                                                                    | Tag |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- | --- |
| G01 | `claude/2026-05-13/003-cowork-model-menu-adaptive-thinking.png`         | Cowork model menu — Opus/Sonnet/Haiku + Adaptive thinking toggle             | `ModelPopover.tsx` — model selector                                        | 🟡      | Model selector present; missing "Adaptive thinking" toggle per-model                   | v1  |
| G02 | `claude/2026-05-13/004-cowork-skills-submenu-installed-skills.png`      | Cowork + menu skills submenu — installed skills list                         | `PlusMenu.tsx:20-29` — hardcoded 4 skills                                  | ❌      | Static skills bug; Claude shows dynamic installed list                                 | v1  |
| G03 | `claude/2026-05-13/005-cowork-connectors-submenu-toggles.png`           | Cowork + menu connectors submenu — toggles per connector                     | `PlusMenu.tsx:30-43` — hardcoded 3 connectors                              | ❌      | Static connectors bug; Claude shows toggles with live state                            | v1  |
| G04 | `claude/2026-05-13/006-cowork-plugins-submenu-categories.png`           | Cowork + menu plugins submenu — plugin categories flyout                     | `PlusMenu.tsx` — no plugins submenu                                        | ❌      | No plugins submenu in + menu                                                           | v1  |
| G05 | `claude/2026-05-13/007-cowork-plugin-category-legal-workflows.png`      | Cowork plugins — Legal category expanded with plugin list                    | `PluginMarketplace.tsx` — plugin categories                                | 🟡      | Plugin marketplace exists; no inline category-flyout in + menu                         | v1  |
| G06 | `claude/2026-05-13/008-cowork-plugin-selected-inline-slash-command.png` | Plugin selected — inline slash command in composer                           | `PlusMenu.tsx` + `Composer.tsx` — no slash command                         | ❌      | No slash-command integration after plugin selection                                    | v1  |
| G07 | `claude/2026-05-13/011-claude-desktop-chat-home.png`                    | Chat home — greeting, Chat/Cowork/Code tabs, Free plan badge                 | `EmptyChat.tsx` + `DesktopShellV3.tsx`                                     | 🟡      | Tabs present; missing Free plan badge, "Relaunch to update" banner                     | v1  |
| G08 | `claude/2026-05-13/extended/024-settings-general.png`                   | Settings General: Avatar, name, work description, instructions, appearance   | `settings/tabs/General/index.tsx`                                          | 🟡      | General present; Claude has "What best describes your work?" dropdown + chat font      | v1  |
| G09 | `claude/2026-05-13/extended/025-settings-account.png`                   | Settings Account: Sessions list, log out all, delete account                 | `settings/tabs/` — Account tab                                             | 🟡      | Account tab present; Claude shows active sessions list per device                      | v1  |
| G10 | `claude/2026-05-13/extended/026-settings-privacy.png`                   | Settings Privacy: data export, shared chats manage, memory prefs             | `settings/tabs/` — Privacy tab                                             | 🟡      | Privacy tab present; Claude has location consent + Help improve toggles                | v1  |
| G11 | `claude/2026-05-13/extended/027-settings-billing.png`                   | Settings Billing: Max plan, Stripe payment, invoices list                    | `settings/tabs/` — Billing tab; `waitlistService.ts:34` — test Stripe URLs | 🟡      | Billing tab exists; test Stripe URLs not prod; no real invoice list                    | v1  |
| G12 | `claude/2026-05-13/extended/028-settings-usage.png`                     | Settings Usage: per-model weekly usage bars + streak                         | `settings/tabs/` — Usage tab                                               | 🟡      | Usage tab present; Claude shows per-model bars + current session + streak              | v1  |
| G13 | `claude/2026-05-13/extended/029-settings-capabilities.png`              | Settings Capabilities: Memory toggles, Tool access mode, Connector discovery | `settings/tabs/` — Capabilities tab                                        | 🟡      | Capabilities tab present; Claude has richer Memory section with import-from-AI         | v1  |
| G14 | `claude/2026-05-13/extended/030-settings-connectors-deferred.png`       | Settings Connectors: "Connectors have moved to Customize" notice             | `settings/tabs/` — Connectors tab                                          | 🟡      | Connectors in settings; Claude shows explicit redirect notice                          | v1  |
| G15 | `claude/2026-05-13/extended/031-settings-claude-code.png`               | Settings Claude Code: guest pass, code appearance, code font                 | `settings/tabs/` — no Claude Code tab                                      | ❌      | No settings section for Code mode (guest pass, code font, theme)                       | v1  |
| G16 | `claude/2026-05-13/extended/032-settings-cowork.png`                    | Settings Cowork (Dispatch beta): global instructions, autopilot toggle       | `settings/tabs/` — Cowork settings                                         | 🟡      | Dispatch Beta settings present; global instructions editor present                     | v1  |
| G17 | `claude/2026-05-13/extended/033-settings-chrome-extension.png`          | Settings Chrome: site permissions, blocked sites list                        | `settings/tabs/` — Chrome extension settings                               | 🟡      | Chrome extension settings tab present; AGI shows MCP list not Chrome-site permissions  | v1  |
| G18 | `claude/2026-05-13/extended/034-settings-desktop-app-extensions.png`    | Settings Extensions: installed list with Configure per extension             | `settings/tabs/` — Extensions tab                                          | ✅      | —                                                                                      | v1  |
| G19 | `claude/2026-05-13/extended/035-settings-desktop-app-developer.png`     | Settings Developer: Local MCP servers with running status + view logs        | `settings/tabs/` — Developer tab                                           | ✅      | —                                                                                      | v1  |
| G20 | `claude/2026-05-13/extended/036-customize-home.png`                     | Customize home — Skills/Connectors sidebar + landing with 3 options          | `CustomizeHub.tsx`                                                         | ✅      | —                                                                                      | v1  |
| G21 | `claude/2026-05-13/extended/037-customize-skills.png`                   | Customize Skills: Personal + Built-in skills tree + detail panel             | `SkillsView.tsx` — skills view                                             | 🟡      | Skills view present; Claude shows built-in skills tree (schedule/setup-cowork/context) | v1  |
| G22 | `claude/2026-05-13/extended/038-customize-connectors.png`               | Customize Connectors: Gmail detail with tool permissions                     | `ConnectorsView.tsx`                                                       | ✅      | —                                                                                      | v1  |
| G23 | `claude/2026-05-13/extended/039-customize-plugin-legal.png`             | Customize Plugin: Legal plugin overview with skill cards                     | `PluginDetail.tsx` — plugin detail                                         | ✅      | —                                                                                      | v1  |
| G24 | `claude/2026-05-13/extended/040-customize-plugin-legal-skills.png`      | Customize Plugin Legal: Skills sub-tab with skill list                       | `PluginDetail.tsx` — skills sub-tab                                        | ✅      | —                                                                                      | v1  |
| G25 | `claude/2026-05-13/extended/041-customize-plugin-legal-connectors.png`  | Customize Plugin Legal: Connectors sub-tab showing Slack Connect             | `PluginDetail.tsx` — connectors sub-tab                                    | 🟡      | Connectors sub-tab present; connector list may be incomplete                           | v1  |
| G26 | `claude/2026-05-13/extended/042-customize-plugin-menu.png`              | Customize plugins — add menu: Browse plugins / Create plugin                 | `PluginsHub.tsx` — plugins hub                                             | 🟡      | Plugins hub present; Browse/Create plugin flyout not confirmed                         | v1  |
| G27 | `claude/2026-05-13/extended/043-browse-plugins-overlay.png`             | Browse plugins overlay modal with search + category grid                     | `PluginMarketplace.tsx` — marketplace modal                                | 🟡      | Marketplace modal present; Claude's shows "Anthropic & Partners" header + richer cards | v1  |
| G28 | `claude/2026-05-13/manifest.md`                                         | (manifest file — not an image; skip)                                         | —                                                                          | —       | —                                                                                      | —   |

### Group H — claude/2026-05-15 (18 images)

| #   | Image                                                                            | Description                                                                        | Source path:line                              | Verdict | Gap                                                                              | Tag |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- | ------- | -------------------------------------------------------------------------------- | --- |
| H01 | `claude/2026-05-15/200_claude-desktop_home-empty-or-last-chat.png`               | Chat home — Opus 4.7, Adaptive, dark mode, 5 skill shortcuts                       | `EmptyChat.tsx` — empty home                  | 🟡      | Home present; missing "Adaptive" label on model picker, skill chip shortcuts     | v1  |
| H02 | `claude/2026-05-15/201_claude-desktop_sidebar-expanded.png`                      | Sidebar expanded — chat history, "Relaunch to update" banner                       | `Sidebar.tsx` — expanded sidebar              | 🟡      | Expanded sidebar present; no auto-update "Relaunch to update" banner             | v1  |
| H03 | `claude/2026-05-15/202_claude-desktop_account-menu.png`                          | Account menu — Settings (Cmd+,), Language, Get help, Upgrade, Gift, Log out        | `AccountMenu.tsx` — account menu              | 🟡      | Account menu present; missing "Get help", "Gift Claude", keyboard shortcut label | v1  |
| H04 | `claude/2026-05-15/203_claude-desktop_settings-general.png`                      | Settings General — Instructions textarea, Appearance: dark/light/system, Chat font | `settings/tabs/General/index.tsx`             | 🟡      | General tab present; Claude has chat-font picker                                 | v1  |
| H05 | `claude/2026-05-15/204_claude-desktop_settings-connectors-or-extensions.png`     | Settings Extensions: installed extension list with Configure buttons               | `settings/tabs/` — Extensions tab             | ✅      | —                                                                                | v1  |
| H06 | `claude/2026-05-15/205_claude-desktop_settings-extension-detail.png`             | Settings extension detail: Filesystem allowed-directories + tool permissions       | `settings/tabs/` — extension detail           | ✅      | —                                                                                | v1  |
| H07 | `claude/2026-05-15/206_claude-desktop_local-permission-or-mcp-warning.png`       | Local permission dropdown — Always allow / Needs approval / Blocked / Custom       | `ConnectorsView.tsx` — permission dropdown    | 🟡      | Permission dropdown present; Claude's has 4-option dropdown with Custom          | v1  |
| H08 | `claude/2026-05-15/207_claude-desktop_cowork-or-code-entry.png`                  | Cowork entry — "Let's knock something off your list" + autopilot schedule card     | `CoworkHome.tsx` — cowork home                | 🟡      | Cowork home present; no autopilot "Your to-do on autopilot" sidebar card         | v1  |
| H09 | `claude/2026-05-15/208_claude-desktop_handoff-result-from-code.png`              | Code mode result handoff to chat — worktree/branch/session display                 | `CodeModeHome.tsx` — sessions view            | 🟡      | Code sessions list present; no explicit handoff result from Code to Chat flow    | v1  |
| H10 | `claude/2026-05-15/209_claude-desktop_updated-code-dashboard.png`                | Updated Code dashboard — What's up next, sessions/tokens/streak metrics            | `CodeModeHome.tsx` — metrics dashboard        | 🟡      | Usage dashboard present; Claude's has "Favorite model" + streak visualization    | v1  |
| H11 | `claude/2026-05-15/210_claude-desktop_updated-chat-home-type-for-skills.png`     | Updated chat home — "type / for skills" affordance visible in composer             | `EmptyChat.tsx` — no "type / for skills" hint | ❌      | No slash-skills hint in composer placeholder                                     | v1  |
| H12 | `claude/2026-05-15/211_claude-desktop_chat-filesystem-readonly-prompt-ready.png` | Chat with filesystem connector — read-only prompt ready                            | `ActiveChat.tsx` — chat with composer         | ✅      | —                                                                                | v1  |
| H13 | `claude/2026-05-15/213_claude-desktop_filesystem-tool-permission-prompt.png`     | Filesystem tool permission inline prompt — Allow / Deny buttons                    | `ConnectorsView.tsx` — permission prompt      | ✅      | —                                                                                | v1  |
| H14 | `claude/2026-05-15/214_claude-desktop_filesystem-tool-result-table.png`          | Filesystem tool result displayed as table in chat                                  | `ActiveChat.tsx` — result rendering           | 🟡      | Response renders markdown; no dedicated structured table view for tool results   | v1  |
| H15 | `claude/2026-05-15/215_claude-desktop_slash-skills-menu.png`                     | Slash command skills menu — type "/" to show skill list                            | `Composer.tsx` — no slash-command menu        | ❌      | No "/" slash-command menu in composer                                            | v1  |
| H16 | `claude/2026-05-15/216_claude-desktop_skill-selected-in-composer.png`            | Skill selected in composer as pill tag                                             | `Composer.tsx` — no skill pill                | ❌      | No skill-selected pill display in composer input                                 | v1  |
| H17 | `claude/2026-05-15/217_claude-desktop_skill-composer-with-prompt.png`            | Skill in composer with prompt text after skill tag                                 | `Composer.tsx` — no skill-tag + prompt flow   | ❌      | No skill-tag + prompt compositing in composer                                    | v1  |
| H18 | `claude/2026-05-15/218_claude-desktop_skill-used-response.png`                   | Skill-used response — AI answer attributed to skill                                | `ActiveChat.tsx` — response row               | ❌      | No skill attribution in response (no "Used: skill-creator" indicator)            | v1  |

---

## Section 2: Summary Stats

| Verdict                       | Count   |
| ----------------------------- | ------- |
| ✅ At parity                  | 40      |
| 🟡 Partial                    | 84      |
| ❌ Missing                    | 67      |
| 🔄 Different by design        | 11      |
| **Total scored**              | **202** |
| Skipped (web pages, manifest) | 8       |

**v1 release blockers (❌):** 67 missing features  
**Partial items critical to parity (🟡):** 84 — most need targeted fixes  
**Cloud-only items needing invite-code modal (🚧):** 0 items scored 🚧 because `InviteCodeModal` component does not exist in source — all cloud-only items scored ❌ per lock `v1-cloud-bridge-strategy-2026-05-23.md`. See Section 5.

---

## Section 3: Cross-Image Patterns

### Pattern 1: Static hardcoded data in PlusMenu (affects D05, D06, D15, D53, D54, G02, G03)

Seven images show live connector/skill state in Claude's + menu. All fail in AGI due to `SKILLS_LIST` (4 hardcoded items) and `CONNECTORS` (3 hardcoded items) at `PlusMenu.tsx:20-43`. Single file, 7 failures.

### Pattern 2: Slash-command skills integration completely absent (affects H11, H15, H16, H17, H18, G06)

Six images show Claude's "/" → skills-menu → skill-pill → attributed-response workflow. AGI has zero implementation: no slash-command parser in `Composer.tsx`, no skill-pill component, no skill attribution in `ActiveChat.tsx`. Core UX differentiator.

### Pattern 3: Inline tool step visualization absent (affects A02, A03, A07, A08, A10, A23, A27, D14)

Eight images show Claude rendering inline tool-use steps as expandable cards. AGI renders only `InlineArtifactChip` — a single chip. No multi-step tool progress display exists.

### Pattern 4: Connector catalog depth gap (affects B01–B19 — entire group)

Claude shows 250+ connectors across 19 directory pages. AGI has 64 connectors (~15 active, ~49 coming-soon). ~4x deficit concentrated in specialized/enterprise connectors.

### Pattern 5: No dedicated full-page indexes for Chats/Projects management (affects D39, D42, D62, D63, D64, E06)

Claude has full-page Chats index (search + bulk select) and Projects index (sort + search + card grid). AGI uses sidebar-only chat history and a simpler projects list without sort, bulk-select, or dedicated management view.

### Pattern 6: Settings granularity gap (affects G08–G17, H03–H07)

Claude's Settings has 10+ tabs. AGI is missing: Claude Code tab, session list in Account tab, invoice history in Billing tab, chat-font picker in General. Billing references test Stripe URLs.

### Pattern 7: Reasoning/thinking pill sub-gaps (affects A11, A15, A22, A25, A26, D59, G01)

AGI has `ThinkingPill` but lacks: clock icon per thought block, multi-block collapsible display, and "Adaptive thinking" per-model toggle. Seven images expose these sub-gaps.

---

## Section 4: v1 Release Blockers (Below Claude Quality Floor)

### P0 — Boot-hang (show-stopper)

**BLOCKER-01:** App awaits `localhost:11434` (Ollama) and `localhost:9999` with no timeout. React does not paint until these services respond. Source: `src-tauri/src/server/`. Every image in this report describes features that cannot be reached.

### P0 — Slash-command skills workflow completely absent

**BLOCKER-02:** Six images (H11, H15–H18, G06) show Claude's flagship "/" → skills-menu → skill-pill → attributed-response workflow. AGI has zero implementation. No slash-command parser in `Composer.tsx`, no skill-pill, no skill attribution in `ActiveChat.tsx`.

### P0 — Static connector/skills menus (+ menu bug)

**BLOCKER-03:** `PlusMenu.tsx:20-43` — hardcoded `SKILLS_LIST` (4 items) and `CONNECTORS` (3 items). Any user with more skills or connectors sees only the hardcoded data. 7 images expose this across chat/cowork/project contexts.

### P1 — No scroll-to-bottom floating button

**BLOCKER-04:** `ActiveChat.tsx` — no floating scroll button (image A04). Long conversations become unusable without it.

### P1 — No A/B response comparison

**BLOCKER-05:** `ActiveChat.tsx:49-138` — no comparison pills (image A01).

### P1 — No pasted-content tag in user bubble

**BLOCKER-06:** `ActiveChat.tsx:16-45` — `UserBubble` renders plain `message.content`. Claude shows styled pasted-content tag (image A14).

### P1 — No inline tool step visualization

**BLOCKER-07:** 8 images show Claude's tool-use step cards. AGI shows only a chip. Below Claude quality floor for agentic use cases.

### P1 — No PDF preview in artifact panel

**BLOCKER-08:** `ArtifactPanel.tsx` — no PDF renderer (image A21).

### P1 — No Print button in artifact toolbar

**BLOCKER-09:** `ArtifactPanel.tsx` — no Print action (image A24).

### P1 — Settings Claude Code tab missing

**BLOCKER-10:** No settings tab for Code mode (guest pass, code font, theme — image G15).

### P1 — Billing settings uses test Stripe URLs

**BLOCKER-11:** `waitlistService.ts:34` — `STRIPE_PAYMENT_LINKS` references `https://buy.stripe.com/test_*`. Must be replaced with production Stripe links before v1 ship.

---

## Section 5: v2 Placeholders Required (InviteCodeModal)

Per `v1-cloud-bridge-strategy-2026-05-23.md`: cloud-only features need invite-code modal entry points. **`InviteCodeModal` does not exist in `apps/desktop/src/`.** `waitlistService.ts` has `validateInviteCode()` and `redeemInviteCode()` API logic — the service layer is ready. Only the UI modal is missing.

All items below are currently ❌ and must become 🚧 once `InviteCodeModal.tsx` is built:

| Feature                              | Images                | Required action                         |
| ------------------------------------ | --------------------- | --------------------------------------- |
| Team/Enterprise plan upgrade         | D36, F04              | Upgrade button → invite-code modal      |
| Cloud research panel / sources trace | D47                   | Entry point → invite-code modal         |
| Shared chats (cross-device sync)     | Project share buttons | Share action → invite-code modal        |
| Claude Design surface entry          | D07                   | Add "Coming soon — invite required" CTA |
| Cloud sync toggle in sidebar         | Sidebar icons         | Cloud-sync toggle → invite-code modal   |

**Action:** Build `InviteCodeModal.tsx` wiring to `waitlistService.validateInviteCode()`. Modal copy: "Cloud features are gated for v1. Join the waitlist, or enter your invitation code below." Wire all 5 entry points above to open it.

---

## Section 6: P0 Recommendations for Phase D Implementation

### REC-01: Fix boot-hang timeout (P0, ~2h)

Add 3-second timeout to Ollama/local-service probe in `src-tauri/src/server/`. On timeout: render React with "Local AI not detected — use BYOK" fallback banner. Unblocks all other work.

### REC-02: Replace static PlusMenu data with runtime queries (P0, ~4h)

Replace `SKILLS_LIST` and `CONNECTORS` constants in `PlusMenu.tsx:20-43` with dynamic queries from the skills store and connectors store. Fixes 7 image failures.

### REC-03: Implement slash-command skill workflow (P0, ~1 sprint)

Add slash-command parser to `Composer.tsx`: detect leading `/`, query skills catalog, show typeahead menu, insert skill pill on selection. Modify `ActiveChat.tsx:AiResponseRow` to show skill attribution. Creates flagship skill UX missing from 6 images.

### REC-04: Build InviteCodeModal + wire cloud entry points (P0, ~4h)

Create `InviteCodeModal.tsx` using `waitlistService.validateInviteCode()`. Wire to: upgrade button, Share action, cloud-sync toggle, research panel entry. Required by lock `v1-cloud-bridge-strategy-2026-05-23.md`.

### REC-05: Add scroll-to-bottom floating button (P1, ~2h)

Add `isAtBottom` scroll observer in `ActiveChat.tsx`. Render floating button using `bg-surface-overlay` token when scrolled above threshold.

### REC-06: Add inline tool step visualization (P1, ~1 sprint)

Create `ToolStepCard` component for multi-step tool progress. Render step sequence in `ActiveChat.tsx` between user bubble and AI response. Show pending/running/done/error per step.

### REC-07: Add PDF preview to ArtifactPanel (P1, ~1 day)

Add PDF iframe preview in `ArtifactPanel.tsx`. Detect `application/pdf` MIME in artifact metadata, route to iframe instead of code view.

### REC-08: Add Print + Refresh buttons to artifact toolbar (P1, ~2h)

Add Print (`window.print()` scoped to artifact iframe) and Refresh (re-render preview) to `ArtifactPanel.tsx` toolbar.

### REC-09: Add A/B response comparison (P1, ~1 sprint)

Add comparison regeneration trigger to `ResponseActionRow.tsx`. Store up to 2 response variants per turn. Render comparison pills with A/B toggle above active response.

### REC-10: Add pasted-content tag to user bubble (P1, ~4h)

Modify `UserBubble` in `ActiveChat.tsx:16-45` to detect pasted content metadata. Render `[pasted]` tag chip before content text.

### REC-11: Add Claude Code settings tab (P1, ~4h)

Add "Claude Code" tab to `SettingsModal` with: code font selector, code theme preview (light/dark), guest pass display.

### REC-12: Add projects sort + chats bulk-select (P1, ~1 day)

Add sort dropdown (Recent/Created/Alphabetical) to `CoworkProjects.tsx`. Add bulk-select mode (checkbox on hover, Select button in header) to chats view.

### REC-13: Fix Billing test Stripe URLs (P0 for correctness, ~1h)

Replace `STRIPE_PAYMENT_LINKS` test URLs in `waitlistService.ts:34` with production Stripe links.

### REC-14: Expand connector catalog to 100+ active (P1, ongoing)

Add Figma, Tableau, Zapier, Google Calendar, Slack, n8n, and 30+ prioritized connectors to `connectorDefinitions.ts`. v1 target: 100 active (Claude has 250+).
