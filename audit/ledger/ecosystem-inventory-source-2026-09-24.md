# Ecosystem inventory (source)

The 3,435-item target inventory supplied on 2026-09-24 that `ecosystem-capability-ledger.jsonl` audits, verbatim apart from punctuation. Competitor statements in it are unverified context.

# AI chat ecosystem: product, component, and technology inventory

**Reference target: the combined product surface of ChatGPT, Claude, Perplexity, Gemini, and Grok through September 24, 2026.** The inventory below separates user-facing products, interface components, model capabilities, execution systems, platform integrations, and commercial infrastructure. An unchecked entry is a **candidate capability or component**, not a finding that your implementation lacks it or a claim that every competitor offers it.

The detailed component breakdown is a planning synthesis. Competitor-specific facts and disclosed technologies are cited; proposed implementation components are not presented as discoveries about proprietary code.

## 1. What is publicly established about competitor technology

Similar interfaces do not establish identical implementations. These are **specific disclosed parts of their stacks**, not complete manifests of their private applications.

| Product or subsystem                   | Publicly documented technology or architecture                                                                                                                                                                       | What this establishes                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI Codex runtime**               | Rust-defined protocol; a shared agent core; App Server communication using a bidirectional JSON-RPC-style protocol; local process integration and hosted HTTP/event-stream arrangements.                             | A concrete precedent for sharing an agent runtime across different interfaces. It does not establish that every interface has the same frontend implementation. :chatgpt-content-reference{index="0"} |
| **ChatGPT/OpenAI data infrastructure** | PostgreSQL, Azure PostgreSQL Flexible Server, PgBouncer, Kubernetes deployments around connection pooling, and Azure Cosmos DB for selected sharded workloads.                                                       | First-party evidence about production data infrastructure, not a requirement to reproduce OpenAI’s scale or topology. :chatgpt-content-reference{index="1"}                                           |
| **ChatGPT interactive app/plugin UI**  | Sandboxed embedded UI connected to an MCP server; structured messaging between the embedded UI and its host.                                                                                                         | An implementation pattern for interactive third-party experiences within conversations. This is distinct from the main ChatGPT website’s private frontend. :chatgpt-content-reference{index="2"}      |
| **Claude Code**                        | Bun is part of the infrastructure underpinning Claude Code.                                                                                                                                                          | Evidence about its runtime infrastructure, not proof that all Claude applications and services use Bun. :chatgpt-content-reference{index="3"}                                                         |
| **Claude Cowork execution**            | Cloud sessions use isolated sandboxes and externally enforced egress. Existing local desktop execution separates the native agent loop from Linux-VM code execution using Apple Virtualization.framework or Hyper-V. | A useful separation between the agent loop, host tools, isolated code execution, and cloud services. :chatgpt-content-reference{index="4"}                                                            |
| **Gemini CLI**                         | The public package identifies TypeScript/Node tooling, React, Ink, model and MCP SDKs, schema validation, terminal highlighting, Git integration, and test dependencies.                                             | Direct evidence for the CLI package. It does not establish the consumer Gemini website’s complete stack. :chatgpt-content-reference{index="5"}                                                        |
| **Grok Build**                         | Public Rust CLI/TUI and agent runtime; separate crates for terminal UI, agent execution, tools, workspace/VCS/checkpoints, configuration, MCP, Markdown, and sandboxing; editor integration through ACP.             | Direct evidence for a modular coding-agent implementation. :chatgpt-content-reference{index="6"}                                                                                                      |
| **Perplexity Computer execution**      | Perplexity describes its SPACE execution infrastructure using Firecracker-based microVMs and controlled execution boundaries.                                                                                        | First-party reported sandbox architecture, not an independently inspected security guarantee or a complete Perplexity stack. :chatgpt-content-reference{index="7"}                                    |

**Not established by the sources reviewed:** complete private React/Angular/Next.js usage across every website; exact state-management libraries; all database assignments; all internal services; exact editor packages; every queue, vector database, cloud dependency, or CSS measurement. The uploaded captures themselves explicitly leave these implementation details unverified. :chatgpt-content-reference{index="8"}

---

# A. Product surfaces and screen inventory

## 2. Public website and acquisition screens

- [ ] Product homepage.
- [ ] General assistant product page.
- [ ] Research product page.
- [ ] Agentic work product page.
- [ ] Coding-agent product page.
- [ ] Image-generation product page.
- [ ] Video-generation product page.
- [ ] Voice product page.
- [ ] Desktop application page.
- [ ] Mobile application page.
- [ ] CLI installation page.
- [ ] IDE extension page.
- [ ] Browser extension page.
- [ ] Integration directory.
- [ ] Plugin marketplace.
- [ ] Skill directory.
- [ ] Template gallery.
- [ ] Custom-assistant directory.
- [ ] Individual integration detail pages.
- [ ] Individual plugin detail pages.
- [ ] Individual template preview pages.
- [ ] Consumer pricing page.
- [ ] Team pricing page.
- [ ] Enterprise product page.
- [ ] Plan-comparison table.
- [ ] Usage and credit explanations.
- [ ] Download center with platform selection.
- [ ] Changelog and release notes.
- [ ] Product announcement pages.
- [ ] Documentation portal.
- [ ] Help center.
- [ ] Service-status page.
- [ ] Trust and security center.
- [ ] About and company information.
- [ ] Contact and support page.
- [ ] Enterprise contact form.
- [ ] Partner and developer submission forms.
- [ ] Privacy, terms, cookies, and accessibility pages.
- [ ] Regional and language selectors.
- [ ] Logged-out previews of shareable content.

## 3. Authentication and onboarding screens

- [ ] Sign-in screen.
- [ ] Create-account screen.
- [ ] Email verification screen.
- [ ] Verification-code input.
- [ ] Magic-link confirmation.
- [ ] Password-reset request.
- [ ] Password-reset completion.
- [ ] Social-provider sign-in choices.
- [ ] Enterprise SSO entry.
- [ ] Organization-domain discovery.
- [ ] Passkey enrollment.
- [ ] Passkey sign-in.
- [ ] Multifactor authentication setup.
- [ ] Multifactor challenge.
- [ ] Recovery-code display and download.
- [ ] Account-recovery flow.
- [ ] Account-linking flow.
- [ ] Conflicting-account resolution.
- [ ] Terms-acceptance screen.
- [ ] Age or eligibility verification where applicable.
- [ ] Profile setup.
- [ ] Language and timezone setup.
- [ ] Role or use-case selection.
- [ ] Personalization setup.
- [ ] Memory setup.
- [ ] Import-from-another-assistant flow.
- [ ] Recommended-app connection flow.
- [ ] Recommended-plugin installation flow.
- [ ] Desktop permission setup.
- [ ] Browser-extension pairing.
- [ ] Mobile device pairing.
- [ ] Optional notification setup.
- [ ] Plan selection.
- [ ] Trial activation.
- [ ] First-conversation introduction.
- [ ] Resumable onboarding checklist.
- [ ] Guest experience and guest-to-account conversion.

## 4. Signed-in application destinations

- [ ] New-chat home.
- [ ] Existing conversation.
- [ ] Conversation search.
- [ ] Archived conversations.
- [ ] Pinned conversations.
- [ ] Projects index.
- [ ] Project overview.
- [ ] Project conversations.
- [ ] Project files and sources.
- [ ] Project instructions.
- [ ] Project members.
- [ ] Project Memory.
- [ ] Work-task home.
- [ ] Active-task dashboard.
- [ ] Task details and transcript.
- [ ] Approvals inbox.
- [ ] Scheduled-task manager.
- [ ] Routine details.
- [ ] Coding-session home.
- [ ] Coding-session workspace.
- [ ] Remote devices.
- [ ] Remote-session viewer.
- [ ] Library.
- [ ] Shared-with-me resources.
- [ ] Artifact gallery.
- [ ] Artifact editor.
- [ ] Image studio.
- [ ] Image collection.
- [ ] Video studio.
- [ ] Media job history.
- [ ] Notebook workspace.
- [ ] Research report reader.
- [ ] Custom-assistant manager.
- [ ] Custom-assistant builder.
- [ ] Skills manager.
- [ ] Plugins manager.
- [ ] Connected accounts.
- [ ] Model catalog.
- [ ] Usage dashboard.
- [ ] Billing settings.
- [ ] Personal settings.
- [ ] Workspace administration.
- [ ] Developer console.
- [ ] Help and feedback.

## 5. Application shell and navigation components

- [ ] Application header.
- [ ] Product or mode switcher.
- [ ] Account switcher.
- [ ] Workspace switcher.
- [ ] Sidebar expand/collapse control.
- [ ] Sidebar resize handle.
- [ ] Sidebar search input.
- [ ] New-chat action.
- [ ] Pinned-item section.
- [ ] Recent-item section.
- [ ] Project-grouped recents.
- [ ] Date-grouped recents.
- [ ] Conversation row.
- [ ] Project row.
- [ ] Task row.
- [ ] Resource-type icon.
- [ ] Running-task indicator.
- [ ] Needs-input indicator.
- [ ] Unread-result indicator.
- [ ] Item overflow menu.
- [ ] Inline rename field.
- [ ] Drag-to-reorder interaction.
- [ ] Drag-to-move-into-Project interaction.
- [ ] Breadcrumb navigation.
- [ ] Back and forward navigation.
- [ ] Global command palette.
- [ ] Keyboard-shortcut help.
- [ ] Notification center.
- [ ] User/profile menu.
- [ ] Help menu.
- [ ] Upgrade entry.
- [ ] Connection-status indicator.
- [ ] Offline indicator.
- [ ] Release/update indicator.
- [ ] Mobile navigation drawer.
- [ ] Mobile bottom navigation.
- [ ] Tablet split-navigation layout.
- [ ] Resource deep links.
- [ ] Route-level loading and unavailable-resource screens.

---

# B. Design system, layouts, and reusable UI

## 6. Visual foundations and spacing conventions

These are design decisions to define explicitly, not undocumented pixel values attributed to competitors.

- [ ] Semantic background colors.
- [ ] Surface and elevated-surface colors.
- [ ] Text and muted-text colors.
- [ ] Border and divider colors.
- [ ] Accent and selection colors.
- [ ] Success, warning, error, and information colors.
- [ ] Typography families.
- [ ] Heading scale.
- [ ] Body-text scale.
- [ ] Caption and metadata scale.
- [ ] Monospace typography.
- [ ] Line-height rules.
- [ ] Paragraph spacing.
- [ ] List indentation.
- [ ] Code-block padding.
- [ ] Table-cell padding.
- [ ] Conversation-turn spacing.
- [ ] Message-to-toolbar spacing.
- [ ] Composer internal padding.
- [ ] Page-edge gutters.
- [ ] Sidebar row height.
- [ ] Menu-item height.
- [ ] Dialog padding.
- [ ] Form-field spacing.
- [ ] Icon sizes and stroke conventions.
- [ ] Button sizes and density variants.
- [ ] Border-radius scale.
- [ ] Shadow and elevation scale.
- [ ] Layering and z-index rules.
- [ ] Motion durations and easing.
- [ ] Reduced-motion alternatives.
- [ ] Light, dark, and system themes.
- [ ] High-contrast treatment.
- [ ] Selected, focused, hovered, pressed, and disabled states.
- [ ] Brand assets and application icons.

## 7. Layout systems

- [ ] Centered new-chat layout.
- [ ] Reading-width conversation layout.
- [ ] Full-width data-analysis layout.
- [ ] Conversation plus artifact split view.
- [ ] Conversation plus source-inspector split view.
- [ ] Conversation plus browser split view.
- [ ] Conversation plus code workspace.
- [ ] Multi-session tiled layout.
- [ ] Stacked-session layout.
- [ ] Resizable left sidebar.
- [ ] Resizable right inspector.
- [ ] Collapsible secondary navigation.
- [ ] Dockable panels.
- [ ] Detachable desktop panels.
- [ ] Full-screen editor.
- [ ] Full-screen report reader.
- [ ] Full-screen media viewer.
- [ ] Floating companion window.
- [ ] Compact companion mode.
- [ ] Persistent bottom composer.
- [ ] Composer expansion for long prompts.
- [ ] Scrollable transcript independent from side panels.
- [ ] Sticky artifact toolbar.
- [ ] Sticky table headers.
- [ ] Responsive panel stacking.
- [ ] Mobile bottom-sheet adaptation.
- [ ] Tablet two-column adaptation.
- [ ] Safe-area and virtual-keyboard accommodation.
- [ ] Minimum and maximum panel widths.
- [ ] Layout restoration between visits.
- [ ] Window-size and monitor-change restoration.
- [ ] Print-specific layouts.

## 8. Basic interactive elements

- [ ] Primary buttons.
- [ ] Secondary buttons.
- [ ] Destructive buttons.
- [ ] Icon-only buttons.
- [ ] Split buttons.
- [ ] Toggle buttons.
- [ ] Button groups.
- [ ] Text links.
- [ ] Text inputs.
- [ ] Multiline inputs.
- [ ] Search fields.
- [ ] Password fields.
- [ ] One-time-code fields.
- [ ] Checkboxes.
- [ ] Radio groups.
- [ ] Switches.
- [ ] Segmented controls.
- [ ] Single-select menus.
- [ ] Searchable comboboxes.
- [ ] Multiselect controls.
- [ ] Token/chip inputs.
- [ ] Numeric steppers.
- [ ] Sliders.
- [ ] Range sliders.
- [ ] Date pickers.
- [ ] Time pickers.
- [ ] Timezone pickers.
- [ ] Color pickers.
- [ ] File inputs.
- [ ] Upload dropzones.
- [ ] Tabs.
- [ ] Accordions.
- [ ] Disclosure controls.
- [ ] Dropdown menus.
- [ ] Context menus.
- [ ] Nested menus.
- [ ] Tooltips.
- [ ] Popovers.
- [ ] Hover cards.
- [ ] Badges.
- [ ] Tags.
- [ ] Avatars.
- [ ] Progress indicators.
- [ ] Skeleton loaders.
- [ ] Toasts.
- [ ] Inline alerts.
- [ ] Banners.
- [ ] Pagination controls.
- [ ] Empty states.
- [ ] Error states.

## 9. Compound interface components

- [ ] Searchable resource picker.
- [ ] Model picker.
- [ ] Source picker.
- [ ] Connected-account picker.
- [ ] Workspace picker.
- [ ] Project picker.
- [ ] Repository picker.
- [ ] Branch picker.
- [ ] Device picker.
- [ ] Permission-scope picker.
- [ ] Member and recipient picker.
- [ ] Recurrence editor.
- [ ] File browser.
- [ ] Folder tree.
- [ ] Data table.
- [ ] Resource grid.
- [ ] Media gallery.
- [ ] Image comparison slider.
- [ ] Timeline.
- [ ] Activity feed.
- [ ] Task board.
- [ ] Stepper.
- [ ] Multi-step setup wizard.
- [ ] Split-pane container.
- [ ] Docking layout manager.
- [ ] Version-history panel.
- [ ] Diff viewer.
- [ ] Source inspector.
- [ ] Usage meter.
- [ ] Credit-balance card.
- [ ] Permission summary.
- [ ] Approval card.
- [ ] Integration connection card.
- [ ] Capability-warning card.
- [ ] Task-progress card.
- [ ] Interactive result widget.
- [ ] Notification inbox.
- [ ] Keyboard-command palette.

## 10. Modal and dialog inventory

- [ ] Create Project.
- [ ] Rename conversation.
- [ ] Move conversation.
- [ ] Duplicate resource.
- [ ] Archive confirmation.
- [ ] Delete confirmation.
- [ ] Permanent-delete confirmation.
- [ ] Share conversation.
- [ ] Share file or folder.
- [ ] Share artifact.
- [ ] Publish generated application.
- [ ] Manage link access.
- [ ] Invite member.
- [ ] Change member role.
- [ ] Transfer ownership.
- [ ] Select sources.
- [ ] Upload from device.
- [ ] Connect external account.
- [ ] Reauthorize connection.
- [ ] Select among connected accounts.
- [ ] Install Plugin.
- [ ] Review Plugin permissions.
- [ ] Update Plugin.
- [ ] Skill import.
- [ ] Skill edit.
- [ ] Model incompatibility warning.
- [ ] Context-limit warning.
- [ ] Usage-limit notice.
- [ ] Credit-purchase dialog.
- [ ] Upgrade comparison.
- [ ] Cancel subscription.
- [ ] Payment-method update.
- [ ] Reauthentication challenge.
- [ ] Microphone permission explanation.
- [ ] Screen-sharing source selection.
- [ ] Computer-control permission.
- [ ] Folder-access permission.
- [ ] Tool-action approval.
- [ ] Sensitive-data transfer approval.
- [ ] Remote-device pairing.
- [ ] Unsaved-changes warning.
- [ ] Edit-conflict resolution.
- [ ] Export options.
- [ ] Report-content dialog.
- [ ] Feedback submission.
- [ ] Diagnostic-sharing consent.
- [ ] Data-export request.
- [ ] Account-deletion request.

## 11. Accessibility and localization components

- [ ] Accessible control labels.
- [ ] Semantic heading hierarchy.
- [ ] Keyboard navigation.
- [ ] Visible focus indicators.
- [ ] Focus management across dialogs.
- [ ] Focus restoration after panel closure.
- [ ] Screen-reader announcements for completed events.
- [ ] Non-spammy streaming announcements.
- [ ] Accessible tool and approval status.
- [ ] Touch equivalents for hover interactions.
- [ ] Alternatives to drag-only operations.
- [ ] Text resizing.
- [ ] Browser-zoom reflow.
- [ ] Reduced motion.
- [ ] Captions.
- [ ] Transcripts.
- [ ] Chart descriptions.
- [ ] Data-table alternatives for charts.
- [ ] Right-to-left layouts.
- [ ] Mixed-direction text handling.
- [ ] Input-method composition support.
- [ ] Locale-aware dates and numbers.
- [ ] Currency formatting.
- [ ] Pluralization.
- [ ] Translated error messages.
- [ ] Platform-specific shortcut notation.
- [ ] Long-label and translated-copy layouts.
- [ ] Accessible terminal output mode.

---

# C. Chat, composer, messages, and rendering

## 12. New-chat experience

- [ ] Empty conversation canvas.
- [ ] Personalized greeting where appropriate.
- [ ] Neutral greeting when personalization is disabled.
- [ ] Suggested prompts.
- [ ] Task-category shortcuts.
- [ ] Recent Project shortcuts.
- [ ] Recent-file suggestions.
- [ ] Recommended Skills.
- [ ] Recommended connected apps.
- [ ] Search entry.
- [ ] Research entry.
- [ ] Image-creation entry.
- [ ] Video-creation entry.
- [ ] Voice entry.
- [ ] Agentic-work entry.
- [ ] Coding entry.
- [ ] Temporary-chat control.
- [ ] Default-model display.
- [ ] Default-workspace display.
- [ ] Default-Project selection.
- [ ] Mode explanation and examples.
- [ ] First-use feature education.
- [ ] Resumption of an unsent draft.
- [ ] Guest limitations and sign-in conversion.

## 13. Composer text interaction

- [ ] Plain-text entry.
- [ ] Multiline entry.
- [ ] Automatic height growth.
- [ ] Manual expansion.
- [ ] Full-screen prompt editing.
- [ ] Send button.
- [ ] Stop button.
- [ ] Enter-to-send preference.
- [ ] Newline shortcut.
- [ ] Undo and redo.
- [ ] Clipboard paste.
- [ ] Rich-text paste normalization.
- [ ] Code-paste formatting.
- [ ] Long-prompt handling.
- [ ] Character or token indicators where useful.
- [ ] Draft autosave.
- [ ] Draft recovery.
- [ ] Draft isolation by conversation.
- [ ] Prompt history in terminal interfaces.
- [ ] Prompt suggestions.
- [ ] Prompt-template insertion.
- [ ] Slash-command autocomplete.
- [ ] Skill invocation.
- [ ] Agent or assistant mention.
- [ ] Project mention.
- [ ] File mention.
- [ ] Folder mention.
- [ ] Repository mention.
- [ ] Browser-tab mention.
- [ ] Connected-app mention.
- [ ] Context chips.
- [ ] Selected-source chips.
- [ ] Selected-tool chips.
- [ ] Output-format selection.
- [ ] Attachment menu.
- [ ] Dictation control.
- [ ] Voice-conversation control.
- [ ] Queued next prompt.
- [ ] Edit or cancel queued prompt.
- [ ] Mid-task steering input.
- [ ] Separate side question that does not modify the main task.

Perplexity’s September 21 update explicitly documents a read-only Side Chat using a snapshot of the main task context. That is a separate interaction from steering the running task or branching it. :chatgpt-content-reference{index="9"}

## 14. Attachment intake components

- [ ] Device file picker.
- [ ] Drag-and-drop intake.
- [ ] Paste-image intake.
- [ ] Camera capture.
- [ ] Photo-library selection.
- [ ] Screenshot capture.
- [ ] Window capture.
- [ ] URL attachment.
- [ ] Cloud-file picker.
- [ ] Library-file picker.
- [ ] Repository attachment.
- [ ] Folder attachment.
- [ ] Audio attachment.
- [ ] Video attachment.
- [ ] Multiple-file selection.
- [ ] Attachment thumbnail.
- [ ] File-type icon.
- [ ] Filename and file-size metadata.
- [ ] Upload progress.
- [ ] Parsing progress.
- [ ] Indexing progress.
- [ ] Ready-to-use state.
- [ ] Partial-extraction notice.
- [ ] Unsupported-file notice.
- [ ] Password-protected-file notice.
- [ ] Upload retry.
- [ ] Upload cancellation.
- [ ] Attachment removal.
- [ ] Attachment replacement.
- [ ] Attachment preview.
- [ ] Duplicate-file treatment.
- [ ] Per-file error display.
- [ ] Batch-upload summary.
- [ ] File-retention explanation.
- [ ] Selected-model compatibility warning.
- [ ] Alternative processing-path explanation.

## 15. Model-selector interface

- [ ] Current-model label.
- [ ] Provider label.
- [ ] Model-family grouping.
- [ ] Searchable model list.
- [ ] Favorite models.
- [ ] Recently used models.
- [ ] Recommended models.
- [ ] Automatic-selection option.
- [ ] Default-profile option.
- [ ] Explicit model selection.
- [ ] Model description.
- [ ] Input-modality badges.
- [ ] Output-modality badges.
- [ ] Tool-support badge.
- [ ] Context-capacity information.
- [ ] Relative speed information.
- [ ] Relative usage or cost information.
- [ ] Plan-eligibility information.
- [ ] Preview or experimental badge.
- [ ] Deprecated-model notice.
- [ ] Temporary-unavailability state.
- [ ] Reasoning-effort selector.
- [ ] Fast-serving option where supported.
- [ ] Response-length preference.
- [ ] Advanced sampling controls where exposed.
- [ ] Provider-route selection where exposed.
- [ ] Local-model selection.
- [ ] BYOK route selection.
- [ ] Sticky model preference.
- [ ] Conversation-specific override.
- [ ] Per-turn model override.
- [ ] Actual-serving-model disclosure.
- [ ] Fallback disclosure.
- [ ] Model-switch incompatibility dialog.
- [ ] Preserve-or-remove incompatible attachments choice.

## 16. User-message components

- [ ] User identity/avatar.
- [ ] Message text.
- [ ] Attachment group.
- [ ] Source and context chips.
- [ ] Timestamp.
- [ ] Edited-message indicator.
- [ ] Copy action.
- [ ] Edit action.
- [ ] Resend action.
- [ ] Branch-from-message action.
- [ ] Message-version navigation.
- [ ] Expand long message.
- [ ] Collapse long message.
- [ ] Delivery-pending state.
- [ ] Delivery-failed state.
- [ ] Retry-send action.
- [ ] Queued-message state.
- [ ] Draft versus submitted distinction.
- [ ] Voice-transcript attribution.
- [ ] Imported-message attribution.
- [ ] Group-conversation author identity.
- [ ] Message-level deep link.

## 17. Assistant-message components

- [ ] Assistant/model identity.
- [ ] Streaming answer body.
- [ ] Working indicator.
- [ ] Reasoning-summary or activity-summary disclosure.
- [ ] Tool-activity section.
- [ ] Source citations.
- [ ] Sources footer.
- [ ] Generated-file cards.
- [ ] Artifact launch cards.
- [ ] Image results.
- [ ] Audio results.
- [ ] Video results.
- [ ] Interactive widgets.
- [ ] Follow-up suggestions.
- [ ] Copy plain text.
- [ ] Copy formatted answer.
- [ ] Read aloud.
- [ ] Stop read-aloud playback.
- [ ] Regenerate answer.
- [ ] Retry failed answer.
- [ ] Continue truncated answer.
- [ ] Rewrite with another model.
- [ ] Shorten answer.
- [ ] Expand answer.
- [ ] Change tone.
- [ ] Revise selected text.
- [ ] Branch from answer.
- [ ] Navigate answer variants.
- [ ] Positive feedback.
- [ ] Negative feedback.
- [ ] Report answer.
- [ ] Share answer or conversation.
- [ ] Save answer to Project knowledge.
- [ ] Save answer as a document.
- [ ] Export answer.
- [ ] Actual-model and usage details.
- [ ] Partial-result state.
- [ ] Refusal state.
- [ ] Interrupted state.
- [ ] Empty-output error state.

## 18. Conversation-level controls

- [ ] Automatic title.
- [ ] Manual rename.
- [ ] Pin and unpin.
- [ ] Archive and restore.
- [ ] Delete.
- [ ] Duplicate.
- [ ] Move to Project.
- [ ] Copy into Project.
- [ ] Change conversation mode.
- [ ] Change privacy mode through an explicit flow.
- [ ] Conversation search.
- [ ] Jump between search matches.
- [ ] Conversation outline.
- [ ] Jump to a turn.
- [ ] Jump to latest.
- [ ] Scroll-position restoration.
- [ ] Branch-tree navigation.
- [ ] Conversation export.
- [ ] Conversation sharing.
- [ ] Shared-link management.
- [ ] Conversation details inspector.
- [ ] Context and source inspector.
- [ ] Usage summary.
- [ ] Conversation-level instructions.
- [ ] Conversation-level enabled tools.
- [ ] Conversation-level connected accounts.
- [ ] Active tasks associated with the conversation.
- [ ] Continuation on another device.

## 19. Streaming and response-presentation states

- [ ] Request accepted.
- [ ] Waiting in queue.
- [ ] Preparing context.
- [ ] Searching sources.
- [ ] Running code.
- [ ] Calling a connected service.
- [ ] Waiting for approval.
- [ ] Waiting for user input.
- [ ] Receiving first output.
- [ ] Streaming text.
- [ ] Streaming structured output.
- [ ] Building an artifact.
- [ ] Generating media.
- [ ] Saving results.
- [ ] Completed.
- [ ] Partially completed.
- [ ] Cancel requested.
- [ ] Cancelled.
- [ ] Reconnecting.
- [ ] Resuming existing work.
- [ ] Rate-limited.
- [ ] Budget exhausted.
- [ ] Authentication expired.
- [ ] Required device unavailable.
- [ ] Provider unavailable.
- [ ] Failed with recoverable input.
- [ ] Failed after useful partial output.
- [ ] Session restored after app restart.
- [ ] Background work continuing after UI closure.

## 20. Markdown and text rendering

- [ ] Paragraphs.
- [ ] Headings.
- [ ] Bold, italic, and strikethrough.
- [ ] Ordered lists.
- [ ] Unordered lists.
- [ ] Nested lists.
- [ ] Task lists.
- [ ] Blockquotes.
- [ ] Horizontal rules.
- [ ] Inline code.
- [ ] Fenced code blocks.
- [ ] Links.
- [ ] Autolinks.
- [ ] Footnotes where supported.
- [ ] Tables.
- [ ] Wide-table scrolling.
- [ ] Copy-table action.
- [ ] Download-table action.
- [ ] Inline mathematical notation.
- [ ] Block mathematical notation.
- [ ] Escaped delimiters.
- [ ] Partially streamed Markdown.
- [ ] Incomplete code-fence handling.
- [ ] Sanitized embedded markup.
- [ ] Safe external-link handling.
- [ ] Text selection across rendered blocks.
- [ ] Find-in-answer highlighting.
- [ ] Print and export rendering.
- [ ] Right-to-left content.
- [ ] Fallback rendering for unsupported blocks.

## 21. Code blocks and executable code presentation

- [ ] Language label.
- [ ] Syntax highlighting.
- [ ] Copy code.
- [ ] Download source file.
- [ ] Line numbers.
- [ ] Line wrapping.
- [ ] Expand/collapse.
- [ ] Full-screen code view.
- [ ] Highlighted changed lines.
- [ ] Diff formatting.
- [ ] Error-line highlighting.
- [ ] Run-code action.
- [ ] Runtime/language selection where offered.
- [ ] Input parameters or stdin panel.
- [ ] Output panel.
- [ ] Standard-error panel.
- [ ] Execution-duration display.
- [ ] Exit-status display.
- [ ] Generated-file output.
- [ ] Plot output.
- [ ] Retry execution.
- [ ] Stop execution.
- [ ] Reset runtime.
- [ ] Explain code.
- [ ] Edit in Canvas.
- [ ] Open in coding workspace.
- [ ] Apply to repository.
- [ ] Dependency-installation status.
- [ ] Execution-permission explanation.
- [ ] Unsupported-runtime state.

## 22. Rich answers and structured result widgets

- [ ] Citation chips.
- [ ] Source-preview cards.
- [ ] Search-result lists.
- [ ] News cards.
- [ ] Image carousels.
- [ ] Video result cards.
- [ ] Audio players.
- [ ] Interactive charts.
- [ ] Inspectable chart data.
- [ ] Geographic maps.
- [ ] Place and business cards.
- [ ] Weather cards.
- [ ] Sports schedules.
- [ ] Sports scores and standings.
- [ ] Market-price charts.
- [ ] Company and financial-summary cards.
- [ ] Product comparison cards.
- [ ] Price and availability displays.
- [ ] Travel itinerary cards.
- [ ] Flight-status cards.
- [ ] Package-tracking cards.
- [ ] Reservation choices.
- [ ] Calendar availability grids.
- [ ] Contact cards.
- [ ] Email draft widgets.
- [ ] Message draft widgets.
- [ ] Task and issue cards.
- [ ] Approval forms.
- [ ] Interactive questionnaires.
- [ ] Decision/comparison tables.
- [ ] Mind maps.
- [ ] Flowcharts.
- [ ] Timelines.
- [ ] Flashcards.
- [ ] Quizzes.
- [ ] Interactive demonstrations.
- [ ] Embedded third-party app panels.
- [ ] Generated application previews.

Grok’s own design discussion explicitly treats prose, structured widgets, actionable objects, and system events as different content types within one conversation timeline. :chatgpt-content-reference{index="10"}

---

# D. Files, Projects, Library, and artifacts

## 23. Project workspace

- [ ] Project creation.
- [ ] Project name and description.
- [ ] Project icon and color.
- [ ] Project cover or identity treatment.
- [ ] Project overview.
- [ ] Project conversations.
- [ ] Project files.
- [ ] Project sources.
- [ ] Project instructions.
- [ ] Project notes.
- [ ] Project Memory.
- [ ] Project artifacts.
- [ ] Project coding sessions.
- [ ] Project work tasks.
- [ ] Project routines.
- [ ] Default model/profile.
- [ ] Default tools and Skills.
- [ ] Local-folder association.
- [ ] Repository association.
- [ ] Project search.
- [ ] Project members.
- [ ] Member roles.
- [ ] Invite and remove members.
- [ ] Shared Project links.
- [ ] Project-level access requests.
- [ ] Move or copy conversations.
- [ ] Add an answer to Project knowledge.
- [ ] Import an existing Project.
- [ ] Duplicate a Project.
- [ ] Archive and restore.
- [ ] Export.
- [ ] Delete.
- [ ] Project-only context mode.
- [ ] Shared versus personal-context explanation.
- [ ] Project activity history.
- [ ] Coordinating conversation for parallel work, where offered.
- [ ] Overview of child threads and blocked work.
- [ ] Thread-specific steering without changing unrelated work.

The source inventories describe both ordinary Project containers and coordinating Project conversations. These should remain separate capability variants rather than one generic “Projects” entry. :chatgpt-content-reference{index="11"}

## 24. Library and file-management experience

- [ ] All-files view.
- [ ] Uploaded-files view.
- [ ] Generated-files view.
- [ ] Artifact view.
- [ ] Image collection.
- [ ] Video collection.
- [ ] Audio collection.
- [ ] Recent-files view.
- [ ] Favorites.
- [ ] Shared-with-me view.
- [ ] Folder hierarchy.
- [ ] Grid/list toggle.
- [ ] Search.
- [ ] File-type filters.
- [ ] Source-provider filters.
- [ ] Owner filters.
- [ ] Project filters.
- [ ] Created/modified date filters.
- [ ] Sort by name, date, size, or type.
- [ ] Multi-selection.
- [ ] Batch download.
- [ ] Batch move.
- [ ] Batch delete.
- [ ] Rename.
- [ ] Duplicate.
- [ ] Move to folder.
- [ ] Add to Project.
- [ ] Attach to conversation.
- [ ] Open originating conversation.
- [ ] Open external original.
- [ ] File-details panel.
- [ ] Version history.
- [ ] Storage-consumption display.
- [ ] Trash and restore.
- [ ] Expired-resource display.
- [ ] Processing-status display.
- [ ] Connected-file browsing.
- [ ] Refresh external metadata.
- [ ] Save external content as a copy.
- [ ] Distinguish external references from owned files.

## 25. File previews and readers

- [ ] PDF reader.
- [ ] Text-file reader.
- [ ] Markdown reader.
- [ ] Source-code reader.
- [ ] Image viewer.
- [ ] Audio player.
- [ ] Video player.
- [ ] Spreadsheet preview.
- [ ] Presentation preview.
- [ ] Document preview.
- [ ] Archive-content preview.
- [ ] Page thumbnails.
- [ ] Page navigation.
- [ ] Zoom controls.
- [ ] Fit-to-width.
- [ ] Fit-to-page.
- [ ] Rotate view.
- [ ] Search within file.
- [ ] Highlight search matches.
- [ ] Select text for a question.
- [ ] Ask about selected page or range.
- [ ] Citation-linked highlighting.
- [ ] Transcript panel for audio/video.
- [ ] Timestamp navigation.
- [ ] Full-screen mode.
- [ ] Download original.
- [ ] Download converted representation.
- [ ] Copy selected content.
- [ ] Open in native application.
- [ ] Unsupported-preview fallback.
- [ ] Partial-extraction warning.

## 26. Artifact container and panel

- [ ] Artifact launch card inside chat.
- [ ] Artifact title.
- [ ] Artifact type.
- [ ] Artifact status.
- [ ] Open artifact.
- [ ] Close artifact without deleting it.
- [ ] Reopen artifact.
- [ ] Docked side panel.
- [ ] Resizable panel.
- [ ] Full-screen artifact.
- [ ] Detached artifact window where supported.
- [ ] Multiple-artifact switching.
- [ ] Artifact tabs.
- [ ] Source/preview toggle.
- [ ] Direct-edit mode.
- [ ] Read-only mode.
- [ ] Selection-based edit request.
- [ ] Inline comments.
- [ ] Pending edit-request collection.
- [ ] Version selector.
- [ ] Previous/next version.
- [ ] Compare versions.
- [ ] Restore version.
- [ ] Duplicate artifact.
- [ ] Rename artifact.
- [ ] Save to Library.
- [ ] Associate with Project.
- [ ] Continue from another chat.
- [ ] Export menu.
- [ ] Copy content.
- [ ] Share controls.
- [ ] Public/private state.
- [ ] Connected-data status.
- [ ] Refresh connected data.
- [ ] Runtime error panel.
- [ ] Dependency-loading state.
- [ ] Artifact-specific usage information.
- [ ] Open originating session.
- [ ] Live updates from ongoing work.
- [ ] Mobile reader adaptation.

Claude’s current artifact documentation describes a side-by-side work surface, direct and conversational editing, templates, exports, and separate mobile limitations. Its artifact family also includes documents, decks, designs, dashboards, and small interactive tools. :chatgpt-content-reference{index="12"}

## 27. Document and writing editor

- [ ] Document title.
- [ ] Structured rich-text editor.
- [ ] Markdown editing mode.
- [ ] Heading controls.
- [ ] Paragraph formatting.
- [ ] Bold, italic, underline, and links.
- [ ] Lists and checklists.
- [ ] Tables.
- [ ] Images.
- [ ] Callouts.
- [ ] Code and equation blocks.
- [ ] Outline panel.
- [ ] Find and replace.
- [ ] Word count.
- [ ] Selection toolbar.
- [ ] Rewrite selection.
- [ ] Shorten selection.
- [ ] Expand selection.
- [ ] Change tone.
- [ ] Adjust audience.
- [ ] Translate selection.
- [ ] Suggest edits.
- [ ] Accept/reject suggestions.
- [ ] Tracked changes.
- [ ] Comments and replies.
- [ ] Collaborative presence.
- [ ] Autosave indicator.
- [ ] Undo and redo.
- [ ] Revision history.
- [ ] Page-layout view.
- [ ] Print view.
- [ ] Template selection.
- [ ] Brand/style application.
- [ ] Citation management.
- [ ] Export to document formats.
- [ ] Export to PDF.
- [ ] Export to Markdown.
- [ ] Save into a connected document service.
- [ ] Email draft presentation.
- [ ] Recipient, subject, and attachment fields.
- [ ] Send-email review step.

## 28. Code Canvas and application preview

- [ ] Editable code source.
- [ ] Multi-file project tree.
- [ ] File creation and deletion.
- [ ] File rename.
- [ ] Language-aware editing.
- [ ] Syntax diagnostics.
- [ ] Code completion where offered.
- [ ] Search across generated files.
- [ ] Source/preview split view.
- [ ] HTML preview.
- [ ] React or supported framework preview.
- [ ] Responsive preview sizes.
- [ ] Preview theme selection.
- [ ] Element-selection editing.
- [ ] Console panel.
- [ ] Runtime-error overlay.
- [ ] Dependency-installation panel.
- [ ] Preview reload.
- [ ] Restart runtime.
- [ ] Network-permission controls.
- [ ] Secret/configuration placeholders.
- [ ] AI-backed app behavior through a brokered API.
- [ ] App-local storage or database configuration.
- [ ] Download source.
- [ ] Export project archive.
- [ ] Open in coding workspace.
- [ ] Publish preview.
- [ ] Publish production version.
- [ ] Version comparison.
- [ ] Rollback.
- [ ] Fork/copy another shared creation.
- [ ] Viewer-specific authentication for connected apps.

## 29. Spreadsheet and data-analysis workspace

- [ ] Workbook title and metadata.
- [ ] Sheet tabs.
- [ ] Add, rename, duplicate, and delete sheets.
- [ ] Grid selection.
- [ ] Cell editing.
- [ ] Formula bar.
- [ ] Formula explanations.
- [ ] Named ranges.
- [ ] Tables.
- [ ] Sort and filter.
- [ ] Freeze rows and columns.
- [ ] Row and column resizing.
- [ ] Number, date, and currency formats.
- [ ] Conditional formatting.
- [ ] Data validation.
- [ ] Protected cells and ranges.
- [ ] Chart insertion.
- [ ] Chart-type selector.
- [ ] Chart data-range editor.
- [ ] Pivot or aggregate views where supported.
- [ ] Data-cleaning preview.
- [ ] Missing-value summary.
- [ ] Duplicate-row summary.
- [ ] Type-inference summary.
- [ ] Transformation history.
- [ ] SQL query panel.
- [ ] Python analysis panel.
- [ ] Query-result table.
- [ ] Data-source details.
- [ ] Refresh connected data.
- [ ] Proposed-change preview.
- [ ] Accept/reject range changes.
- [ ] Formula-error display.
- [ ] Export workbook.
- [ ] Export CSV.
- [ ] Export chart.
- [ ] Explain analytical assumptions.
- [ ] Generate a report from analysis.
- [ ] Generate slides from analysis.
- [ ] Reusable analysis template.

## 30. Presentation workspace

- [ ] Presentation title.
- [ ] Slide thumbnail rail.
- [ ] Add slide.
- [ ] Duplicate slide.
- [ ] Delete slide.
- [ ] Reorder slides.
- [ ] Slide layout selection.
- [ ] Theme selection.
- [ ] Brand/design-system selection.
- [ ] Direct text editing.
- [ ] Image placement.
- [ ] Chart placement.
- [ ] Table placement.
- [ ] Shape and diagram elements.
- [ ] Element alignment.
- [ ] Element grouping.
- [ ] Layer ordering.
- [ ] Slide notes.
- [ ] Presenter notes.
- [ ] Selection-based AI edits.
- [ ] Rewrite an individual slide.
- [ ] Regenerate one slide without replacing the deck.
- [ ] Whole-deck restructuring.
- [ ] Comments.
- [ ] Version history.
- [ ] Presentation mode.
- [ ] Speaker view where offered.
- [ ] Export to PPTX.
- [ ] Export to PDF.
- [ ] Export selected slides.
- [ ] Connected-document and spreadsheet references.
- [ ] Reusable presentation templates.
- [ ] Shareable presentation viewer.

## 31. PDF and document-transformation products

- [ ] Text-document to PDF conversion.
- [ ] Spreadsheet to PDF conversion.
- [ ] Presentation to PDF conversion.
- [ ] PDF summarization.
- [ ] PDF question answering.
- [ ] Page-specific questions.
- [ ] PDF text extraction.
- [ ] Scanned-document OCR.
- [ ] Table extraction.
- [ ] Document comparison.
- [ ] PDF annotation.
- [ ] Highlighting and comments.
- [ ] Native form-field filling where supported.
- [ ] Visual form completion as a separate capability.
- [ ] Page insertion/removal where offered.
- [ ] Page reordering.
- [ ] Merge and split.
- [ ] Compression.
- [ ] Redaction.
- [ ] Metadata editing.
- [ ] Searchable-PDF generation.
- [ ] Accessible/tagged-PDF generation where promised.
- [ ] Signature-service integration.
- [ ] Export fidelity preview.
- [ ] Original-versus-transformed comparison.

## 32. Design workspace

- [ ] Design brief.
- [ ] Artboard canvas.
- [ ] Multiple design alternatives.
- [ ] Page or frame list.
- [ ] Element selection.
- [ ] Direct text editing.
- [ ] Position and size controls.
- [ ] Alignment and distribution.
- [ ] Layers.
- [ ] Grouping.
- [ ] Color controls.
- [ ] Typography controls.
- [ ] Spacing controls.
- [ ] Image replacement.
- [ ] Component replacement.
- [ ] Custom adjustment sliders.
- [ ] Inline design comments.
- [ ] Selection-based change requests.
- [ ] Desktop/tablet/mobile breakpoints.
- [ ] Light/dark previews.
- [ ] Design-system import.
- [ ] Brand asset library.
- [ ] Reusable component library.
- [ ] Design-token mapping.
- [ ] Design-system conformance feedback.
- [ ] Prototype navigation.
- [ ] Interactive-state previews.
- [ ] Design-to-code handoff.
- [ ] Code-to-design synchronization.
- [ ] Figma import/export integration.
- [ ] Export to HTML.
- [ ] Export to PDF.
- [ ] Export to image or archive.
- [ ] Version comparison and restoration.

## 33. Generated Sites and published applications

- [ ] Generated-site dashboard.
- [ ] Application name and description.
- [ ] Template-based creation.
- [ ] Prompt-based creation.
- [ ] Source-code workspace.
- [ ] Build status.
- [ ] Preview deployment.
- [ ] Production deployment.
- [ ] Deployment history.
- [ ] Public URL.
- [ ] Named-viewer access.
- [ ] Workspace-only access.
- [ ] Password or authentication options where offered.
- [ ] Custom domain setup.
- [ ] Domain verification.
- [ ] Environment-variable management.
- [ ] Connected-service configuration.
- [ ] Application database setup.
- [ ] Usage and hosting limits.
- [ ] Model-call allowance for generated apps.
- [ ] Logs and error inspection.
- [ ] Preview-to-production promotion.
- [ ] Rollback.
- [ ] Unpublish.
- [ ] Duplicate/fork.
- [ ] Download source.
- [ ] App analytics.
- [ ] Abuse reporting.
- [ ] Content moderation.
- [ ] Deletion of app and associated data.

---

# E. Search, Research, notebooks, Memory, and learning

## 34. Search experiences

- [ ] Search inside the current conversation.
- [ ] Search conversation history.
- [ ] Search Projects.
- [ ] Search Library.
- [ ] Search artifacts.
- [ ] Search connected company sources.
- [ ] Public web search.
- [ ] Search within specified websites.
- [ ] Search by source type.
- [ ] Academic search.
- [ ] News search.
- [ ] Video search.
- [ ] Image search.
- [ ] Social/X search where the provider supports it.
- [ ] Date-range filters.
- [ ] Language filters.
- [ ] Geography filters.
- [ ] Include/exclude domains.
- [ ] User-selected source collections.
- [ ] Search suggestions.
- [ ] Follow-up query refinement.
- [ ] Query clarification choices.
- [ ] Result previews.
- [ ] Source cards.
- [ ] Citation hover/tap preview.
- [ ] Source list expansion.
- [ ] Open original source.
- [ ] Add source to answer.
- [ ] Remove source from answer.
- [ ] Save source to Project or notebook.
- [ ] Search-result freshness information.
- [ ] Empty-results and unavailable-source states.

## 35. Research workspace

- [ ] Research-task creation.
- [ ] Objective and deliverable selection.
- [ ] Clarifying-question flow.
- [ ] Editable research plan.
- [ ] Source-selection panel.
- [ ] Website restrictions.
- [ ] Uploaded source intake.
- [ ] Connected source intake.
- [ ] Research-progress view.
- [ ] Search activity timeline.
- [ ] Visited-source list.
- [ ] Evidence collection.
- [ ] Findings grouped by question.
- [ ] Contradictory-evidence display.
- [ ] Research steering.
- [ ] Add sources while running.
- [ ] Pause and resume.
- [ ] Cancel research.
- [ ] Partial report.
- [ ] Full report reader.
- [ ] Report outline.
- [ ] Linked citations.
- [ ] Tables and charts.
- [ ] Supporting attachments.
- [ ] Research-history list.
- [ ] Refresh or rerun research.
- [ ] Compare report revisions.
- [ ] Export report.
- [ ] Convert report to slides.
- [ ] Convert report to audio overview.
- [ ] Convert report to interactive page.
- [ ] Schedule recurring research.
- [ ] Notify on completion.
- [ ] Remaining research allowance.

## 36. Sources and grounding interface

- [ ] Citation marker.
- [ ] Source title.
- [ ] Publisher or provider.
- [ ] Source URL or resource identifier.
- [ ] Publication date.
- [ ] Retrieval date.
- [ ] Source-type icon.
- [ ] Quoted supporting excerpt.
- [ ] Page-number locator.
- [ ] Line-range locator.
- [ ] Spreadsheet-cell locator.
- [ ] Slide locator.
- [ ] Audio/video timestamp locator.
- [ ] Message/thread locator.
- [ ] Highlighted passage in source viewer.
- [ ] Claim-to-source relationship.
- [ ] Multiple sources per claim.
- [ ] Conflicting-source presentation.
- [ ] Unavailable-source notice.
- [ ] Restricted-source notice.
- [ ] Stale-source notice.
- [ ] Source correction.
- [ ] Source replacement.
- [ ] User-controlled evidence set.
- [ ] Citation-preserving export.

## 37. Notebook and knowledge-workspace product

- [ ] Notebook index.
- [ ] Notebook creation.
- [ ] Notebook title and description.
- [ ] Source rail.
- [ ] Source checkboxes.
- [ ] Add files.
- [ ] Add website.
- [ ] Add video transcript.
- [ ] Add audio.
- [ ] Add connected document.
- [ ] Add written note.
- [ ] Source guide or summary.
- [ ] Source search.
- [ ] Source-grounded chat.
- [ ] Notebook instructions.
- [ ] Saved chat responses.
- [ ] Notebook notes.
- [ ] Editable notes beside sources.
- [ ] Citation-linked navigation.
- [ ] Studio/output panel.
- [ ] Audio overview.
- [ ] Video overview.
- [ ] Briefing document.
- [ ] Study guide.
- [ ] Frequently asked questions.
- [ ] Timeline.
- [ ] Mind map.
- [ ] Data table.
- [ ] Infographic.
- [ ] Slide deck.
- [ ] Quiz.
- [ ] Flashcard set.
- [ ] Interactive learning overview.
- [ ] Notebook sharing.
- [ ] Notebook export.
- [ ] Source refresh.
- [ ] Notebook-to-main-chat context handoff.
- [ ] Cross-application notebook synchronization.
- [ ] Notebook-specific compute and generation allowance.

Google’s July announcement identifies Gemini Notebook as the renamed standalone NotebookLM product, with source organization shared across its ecosystem and cloud-compute-backed analysis. Its September learning announcement adds or previews further study and recording interactions; those rollout states should not be flattened into universal availability. :chatgpt-content-reference{index="13"}

## 38. Learning and study products

- [ ] Study-mode entry.
- [ ] Learning-goal setup.
- [ ] Subject selection.
- [ ] Level or background selection.
- [ ] Course-material intake.
- [ ] Initial diagnostic quiz.
- [ ] Personalized study plan.
- [ ] Lesson sequence.
- [ ] Socratic question flow.
- [ ] Hint progression.
- [ ] Worked examples.
- [ ] Interactive explanations.
- [ ] Visual demonstrations.
- [ ] Practice questions.
- [ ] Multiple-choice questions.
- [ ] Multiple-select questions.
- [ ] Short-answer questions.
- [ ] Fill-in-the-blank questions.
- [ ] Answer explanations.
- [ ] Per-question feedback.
- [ ] Quiz editing.
- [ ] Flashcard generation.
- [ ] Flashcard editing.
- [ ] Flip-card interaction.
- [ ] Known/practice classification.
- [ ] Shuffle.
- [ ] Progress dashboard.
- [ ] Weak-topic recommendations.
- [ ] Spoken-explanation feedback.
- [ ] Language-learning exercises.
- [ ] Pronunciation practice.
- [ ] Narrated storybooks.
- [ ] Illustrated stories.
- [ ] Print and share study materials.
- [ ] Source-based follow-up after completing a quiz.

## 39. Memory product

- [ ] Memory onboarding.
- [ ] Memory enable/disable control.
- [ ] Separate past-chat-reference control.
- [ ] Saved-Memory list.
- [ ] Memory search.
- [ ] Topic grouping.
- [ ] Profile summary.
- [ ] Preference summary.
- [ ] Ongoing-work summary.
- [ ] Add Memory manually.
- [ ] Explicit “remember this” action.
- [ ] Automatic Memory update.
- [ ] Edit Memory.
- [ ] Delete individual Memory.
- [ ] Delete all Memory.
- [ ] Prioritize Memory.
- [ ] Memory source/provenance.
- [ ] Last-updated information.
- [ ] Correction of stale information.
- [ ] Conflicting-Memory resolution.
- [ ] Memory import.
- [ ] Memory export.
- [ ] Memory-capacity display where relevant.
- [ ] Project-scoped Memory.
- [ ] Agent-specific Memory.
- [ ] Organization knowledge distinct from personal Memory.
- [ ] Memory-used indication.
- [ ] Temporary-chat exclusions.
- [ ] Sensitive-Memory controls.
- [ ] Memory reset independent from chat deletion.
- [ ] Cross-model personalization.
- [ ] Cross-surface Memory continuity.

## 40. Instructions, preferences, and personal style

- [ ] Preferred name or form of address.
- [ ] Background information.
- [ ] Role or profession.
- [ ] Goals and interests.
- [ ] Desired response style.
- [ ] Response-length preference.
- [ ] Formality preference.
- [ ] Tone presets.
- [ ] Warmth preference.
- [ ] Enthusiasm preference.
- [ ] Heading/list preference.
- [ ] Emoji preference.
- [ ] Technical-depth preference.
- [ ] Language preference.
- [ ] Units and formatting preferences.
- [ ] Persistent custom instructions.
- [ ] Project instructions.
- [ ] Agent instructions.
- [ ] Conversation overrides.
- [ ] Writing-style examples.
- [ ] Connected-writing-source setup.
- [ ] Learned writing-style summary.
- [ ] Style reset.
- [ ] Explanatory output style.
- [ ] Learning-oriented output style.
- [ ] Concise output style.
- [ ] Custom output-style creation.
- [ ] Effective-instruction explanation where useful.
- [ ] Import preferences from another assistant.
- [ ] Selective sharing of preferences with a Project.

## 41. Temporary and private experiences

- [ ] Temporary-chat entry.
- [ ] Visible temporary-mode banner.
- [ ] History-persistence explanation.
- [ ] Memory-read choice where offered.
- [ ] Memory-write exclusion.
- [ ] Custom-instruction choice.
- [ ] Plugin availability in temporary mode.
- [ ] File-retention explanation.
- [ ] Generated-output saving choice.
- [ ] Save temporary conversation explicitly.
- [ ] Temporary-to-normal conversion review.
- [ ] Incognito search.
- [ ] Private browser session.
- [ ] Local-only conversation.
- [ ] Local-only file collection.
- [ ] Local-only Memory.
- [ ] Clear local data.
- [ ] Separate history, training, and retention controls.
- [ ] Privacy-setting education.
- [ ] Per-feature processing-location disclosure.

## 42. Proactive assistance, briefings, and reflection

- [ ] Daily briefing setup.
- [ ] Briefing topics.
- [ ] Selected connected sources.
- [ ] Delivery time and timezone.
- [ ] Briefing home.
- [ ] Briefing cards.
- [ ] Calendar overview.
- [ ] Email or work summary.
- [ ] Suggested next actions.
- [ ] Follow-up questions on a briefing item.
- [ ] Listen-to-briefing mode.
- [ ] Mark helpful/not helpful.
- [ ] Dismiss topic.
- [ ] Add topic.
- [ ] Pause briefings.
- [ ] Quiet hours.
- [ ] Work-completion notifications.
- [ ] Important-change alerts.
- [ ] Personal usage reflection.
- [ ] Periodic recap.
- [ ] Annual recap.
- [ ] Break reminders.
- [ ] Time-and-focus settings.
- [ ] Clear end-of-digest state.
- [ ] Proactive-feature history and saved editions.

---

# F. Multimodal understanding, generation, and voice

## 43. Image and visual understanding

- [ ] Single-image questions.
- [ ] Multiple-image comparison.
- [ ] Screenshot interpretation.
- [ ] Document-image interpretation.
- [ ] Chart interpretation.
- [ ] Diagram interpretation.
- [ ] Handwriting recognition.
- [ ] Visual text extraction.
- [ ] Image-region selection.
- [ ] Crop-and-zoom inspection.
- [ ] Annotated visual answers.
- [ ] Object counting.
- [ ] Scene comparison.
- [ ] Visual troubleshooting.
- [ ] Image-to-structured-data extraction.
- [ ] Image-to-table workflow.
- [ ] Reference-image selection for another task.
- [ ] High-resolution versus reduced-resolution handling.
- [ ] Image input-quality warning.
- [ ] Visual uncertainty presentation.

## 44. Image-generation studio

- [ ] Text-to-image composer.
- [ ] Image-model picker.
- [ ] Style presets.
- [ ] Reference-image slots.
- [ ] Prompt suggestions.
- [ ] Prompt enhancement with user control.
- [ ] Aspect-ratio selector.
- [ ] Size/resolution selector.
- [ ] Quality selector.
- [ ] Output-count selector.
- [ ] Background transparency option.
- [ ] Supported seed control.
- [ ] Supported negative-prompt control.
- [ ] Generation-cost indication.
- [ ] Remaining-generation allowance.
- [ ] Generation queue.
- [ ] In-progress previews where supported.
- [ ] Cancel generation.
- [ ] Retry generation.
- [ ] Variation generation.
- [ ] Image grid.
- [ ] Full-screen image viewer.
- [ ] Prompt and settings inspection.
- [ ] Reuse prompt.
- [ ] Reuse settings.
- [ ] Favorite image.
- [ ] Save to Library.
- [ ] Add to Project.
- [ ] Download full-quality image.
- [ ] Copy image.
- [ ] Share image.
- [ ] Share prompt.
- [ ] Edit image.
- [ ] Animate image into video.
- [ ] Report generated output.
- [ ] Content/provenance labeling.

## 45. Image editor

- [ ] Upload an existing image.
- [ ] Open a previously generated image.
- [ ] Conversational edit instruction.
- [ ] Click-to-comment editing.
- [ ] Region-selection tool.
- [ ] Brush selection.
- [ ] Eraser.
- [ ] Brush-size control.
- [ ] Selection overlay.
- [ ] Clear selection.
- [ ] Invert selection where offered.
- [ ] Object addition.
- [ ] Object removal.
- [ ] Background replacement.
- [ ] Background removal.
- [ ] Outpainting.
- [ ] Crop.
- [ ] Resize.
- [ ] Reframe.
- [ ] Lighting adjustment.
- [ ] Color/style transformation.
- [ ] Reference-based composition.
- [ ] Multi-image combination.
- [ ] Pose/reference guidance.
- [ ] Text-bearing image generation.
- [ ] Photo restoration.
- [ ] Colorization.
- [ ] Before/after comparison.
- [ ] Version history.
- [ ] Undo and redo.
- [ ] Preserve-original action.
- [ ] Export format.
- [ ] Alpha-channel preservation.
- [ ] Brand-reference reuse.
- [ ] Avatar-reference reuse.
- [ ] Sticker-pack creation.
- [ ] Messaging-app sticker export.

## 46. Video-generation studio

- [ ] Text-to-video composer.
- [ ] Image-to-video input.
- [ ] Video-to-video input.
- [ ] Multiple reference slots.
- [ ] Video-model picker.
- [ ] Duration selector.
- [ ] Aspect-ratio selector.
- [ ] Resolution selector.
- [ ] Supported frame-rate selector.
- [ ] Camera-motion instructions.
- [ ] Scene/action instructions.
- [ ] Dialogue instructions.
- [ ] Generated-audio option.
- [ ] Reference-audio option where supported.
- [ ] Style presets.
- [ ] Template gallery.
- [ ] Character/reference selection.
- [ ] Storyboard creation.
- [ ] Shot cards.
- [ ] Shot ordering.
- [ ] Shot duplication.
- [ ] Shot deletion.
- [ ] Per-shot duration.
- [ ] Per-shot references.
- [ ] Generation queue.
- [ ] Progress display.
- [ ] Estimated or actual credit use.
- [ ] Cancel request.
- [ ] Retry failed job.
- [ ] Completed clip gallery.
- [ ] Playback controls.
- [ ] Download.
- [ ] Share.
- [ ] Save to Project.
- [ ] Remix.
- [ ] Extend.
- [ ] Regenerate a selected segment where supported.

## 47. Video editing and media continuity

- [ ] Clip trimming.
- [ ] Scene extension.
- [ ] Conversational revision.
- [ ] Style transfer.
- [ ] Object or background changes where supported.
- [ ] Reference-consistent characters.
- [ ] Shot-to-shot continuity.
- [ ] First-frame/last-frame guidance where supported.
- [ ] Clip concatenation.
- [ ] Audio replacement.
- [ ] Generated sound effects.
- [ ] Dialogue regeneration.
- [ ] Caption generation.
- [ ] Caption editing.
- [ ] Thumbnail selection.
- [ ] Cover image.
- [ ] Before/after comparison.
- [ ] Parent-clip lineage.
- [ ] Version history.
- [ ] Export/transcode options.
- [ ] Reusable avatar or cameo management.
- [ ] Likeness consent controls.
- [ ] Likeness reuse permissions.
- [ ] Likeness revocation.
- [ ] Public versus private media collection.
- [ ] Remix-permission settings.
- [ ] Generated-media discovery feed where offered.

## 48. Voice conversation interface

- [ ] Voice entry from an existing chat.
- [ ] Start a new voice conversation.
- [ ] Integrated voice-and-text layout.
- [ ] Separate full-screen voice layout.
- [ ] Listening indicator.
- [ ] Speaking indicator.
- [ ] Thinking/working indicator.
- [ ] Waveform or amplitude visualization.
- [ ] Microphone mute.
- [ ] End conversation.
- [ ] Pause/resume.
- [ ] Push-to-talk.
- [ ] Hands-free mode.
- [ ] Interruption/barge-in.
- [ ] Voice picker.
- [ ] Voice preview.
- [ ] Language selection.
- [ ] Input-device selection.
- [ ] Output-device selection.
- [ ] Speaker/Bluetooth routing.
- [ ] Captions.
- [ ] Transcript display.
- [ ] Transcript editing where appropriate.
- [ ] Type while speaking.
- [ ] View images and maps during Voice.
- [ ] View tool results during Voice.
- [ ] Approve an action during Voice.
- [ ] Open a generated document from Voice.
- [ ] Attach image during Voice.
- [ ] Camera sharing.
- [ ] Screen sharing.
- [ ] Camera switching.
- [ ] Picture-in-picture.
- [ ] Background-conversation preference.
- [ ] Lock-screen controls.
- [ ] Reconnection state.
- [ ] Usage-limit notice.
- [ ] Continue unfinished work in text.
- [ ] Resume a previous voice conversation.
- [ ] Remote coding-session voice control.
- [ ] Separate spoken-response cancellation from task cancellation.

Gemini’s current Live page explicitly describes switching between talking and typing in the same thread, visual cards, connected apps, and feature-specific exclusions. Voice therefore needs its own capability matrix rather than inheriting every text-chat feature automatically. :chatgpt-content-reference{index="14"}

## 49. Dictation, transcription, and recording

- [ ] Composer dictation.
- [ ] Editable transcription before send.
- [ ] Dictation language selection.
- [ ] Interim transcript.
- [ ] Final transcript.
- [ ] Retry failed transcription.
- [ ] Discard recording.
- [ ] Audio-file upload.
- [ ] Batch transcription.
- [ ] Streaming transcription.
- [ ] Timestamped transcript.
- [ ] Speaker labels.
- [ ] Speaker-name correction.
- [ ] Transcript search.
- [ ] Click transcript to seek audio.
- [ ] Meeting recording.
- [ ] Recording notice and consent interface.
- [ ] Pause and resume recording.
- [ ] Recording-duration display.
- [ ] Meeting summary.
- [ ] Action-item extraction.
- [ ] Decisions summary.
- [ ] Follow-up email draft.
- [ ] Recording-to-Project association.
- [ ] Transcript export.
- [ ] Audio download.
- [ ] Retention and deletion controls.
- [ ] Desktop dictation into another application.
- [ ] Spoken rewriting of selected text.
- [ ] Undo inserted text.

## 50. Audio overviews, speech generation, and music

- [ ] Text-to-speech playback.
- [ ] Voice and language selection.
- [ ] Speaking-rate control where supported.
- [ ] Download generated speech.
- [ ] Source-to-audio overview.
- [ ] Single-narrator overview.
- [ ] Multi-host overview.
- [ ] Brief versus detailed overview.
- [ ] Source-selection controls.
- [ ] Overview instructions.
- [ ] Audio transcript.
- [ ] Source-linked transcript references.
- [ ] Regenerate overview.
- [ ] Interactive interruption where offered.
- [ ] Original music generation.
- [ ] Vocal/instrumental choice.
- [ ] Genre controls.
- [ ] Mood controls.
- [ ] Instrumentation controls.
- [ ] Tempo guidance.
- [ ] Lyrics input.
- [ ] Song-structure guidance.
- [ ] Short/long generation modes.
- [ ] Music templates.
- [ ] Remix starters.
- [ ] Cover-art generation.
- [ ] Track title and metadata.
- [ ] Playback and seek controls.
- [ ] Download and sharing.
- [ ] Music-service playback integration as a separate capability.
- [ ] Custom-voice creation as a separately governed product.
- [ ] Voice-consent and deletion management.

## 51. Voice-agent builder and telephony extensions

- [ ] Voice-agent creation wizard.
- [ ] Agent name and role.
- [ ] System instructions.
- [ ] Voice selection.
- [ ] Knowledge-source setup.
- [ ] Tool and MCP setup.
- [ ] Conversation goals.
- [ ] Guardrail configuration.
- [ ] Human-transfer action.
- [ ] Test-call interface.
- [ ] Web voice widget.
- [ ] Phone-number provisioning.
- [ ] Bring-your-own-number setup.
- [ ] SIP connection setup.
- [ ] Inbound call routing.
- [ ] Outbound calling, only where offered and authorized.
- [ ] Call transcripts.
- [ ] Call recordings and consent controls.
- [ ] Call outcome labels.
- [ ] Latency and failure dashboards.
- [ ] Usage and billing.
- [ ] Agent versioning.
- [ ] Publish and rollback.
- [ ] Business-hours configuration.
- [ ] Escalation and fallback behavior.

This is a distinct ecosystem extension, not simply “Voice mode.” xAI’s Voice Agent Builder combines telephony, retrieval, tools, MCP, guardrails, and observability in one configuration product. :chatgpt-content-reference{index="15"}

---

# G. Custom assistants, Skills, Plugins, connectors, and tools

## 52. Custom-assistant builder

- [ ] Assistant manager.
- [ ] Create assistant.
- [ ] Guided conversational builder.
- [ ] Direct configuration editor.
- [ ] Live test/preview pane.
- [ ] Assistant name.
- [ ] Avatar or icon.
- [ ] Short description.
- [ ] Long description.
- [ ] Instructions.
- [ ] Conversation starters.
- [ ] Suggested use cases.
- [ ] Reference-file upload.
- [ ] Connected reference sources.
- [ ] Source-refresh behavior.
- [ ] Model preference.
- [ ] Tool selection.
- [ ] Web-search enablement.
- [ ] Code-execution enablement.
- [ ] Media-generation enablement.
- [ ] Connector selection.
- [ ] Custom-action schema.
- [ ] Authentication configuration for actions.
- [ ] Tool testing.
- [ ] Sample prompts.
- [ ] Output-format examples.
- [ ] Draft save.
- [ ] Publish.
- [ ] Version history.
- [ ] Revert published version.
- [ ] Private access.
- [ ] Named-user access.
- [ ] Workspace access.
- [ ] Public listing.
- [ ] Creator profile.
- [ ] Verified publisher information.
- [ ] Usage analytics.
- [ ] Duplicate/fork.
- [ ] Export or migration.
- [ ] Deprecation notice.
- [ ] Replacement-assistant link.

**Lifecycle distinction:** OpenAI currently documents a planned custom-GPT-to-Plugin migration. Existing GPTs remain a relevant product pattern, but treating their builder as a timeless, unchanged strategic destination would miss the migration product itself. :chatgpt-content-reference{index="16"}

## 53. Skill creation and management

- [ ] Skill directory.
- [ ] Installed Skills.
- [ ] Personal Skills.
- [ ] Project Skills.
- [ ] Organization Skills.
- [ ] Skill detail page.
- [ ] Skill name and description.
- [ ] Invocation guidance.
- [ ] Instruction editor.
- [ ] Reference-file bundle.
- [ ] Script bundle.
- [ ] Input parameters.
- [ ] Expected outputs.
- [ ] Required tools.
- [ ] Required connections.
- [ ] Supported surfaces.
- [ ] Manual invocation.
- [ ] Automatic relevance-based invocation.
- [ ] Skill composition.
- [ ] Enable/disable.
- [ ] Upload/import.
- [ ] Export.
- [ ] Version selection.
- [ ] Update notification.
- [ ] Organization sharing.
- [ ] Skill duplication/customization.
- [ ] Recorded-demonstration creation.
- [ ] Screen-and-voice teaching flow.
- [ ] Replay configuration.
- [ ] Example-based template creation.
- [ ] Test cases.
- [ ] Test results.
- [ ] With-versus-without comparison.
- [ ] Cost estimate.
- [ ] Performance history.
- [ ] Permission and provenance summary.

## 54. Plugin marketplace and customization

- [ ] Unified Customize destination.
- [ ] Plugins tab.
- [ ] Skills tab.
- [ ] Connectors tab.
- [ ] Public marketplace.
- [ ] Private organization marketplace.
- [ ] Repository-backed marketplace.
- [ ] Search and filters.
- [ ] Role/use-case categories.
- [ ] Featured plugins.
- [ ] Recommended plugins.
- [ ] Publisher detail.
- [ ] Plugin detail.
- [ ] Included Skills.
- [ ] Included connectors.
- [ ] Included agents.
- [ ] Included commands.
- [ ] Included hooks.
- [ ] Required permissions.
- [ ] Supported surfaces.
- [ ] Install.
- [ ] Configure.
- [ ] Authenticate bundled connections.
- [ ] Enable/disable.
- [ ] Update.
- [ ] Pin version.
- [ ] Customize installed plugin.
- [ ] Fork plugin.
- [ ] Uninstall.
- [ ] Organization assignment.
- [ ] Installation approval request.
- [ ] Security-scan result.
- [ ] Compatibility warning.
- [ ] Missing-dependency repair.
- [ ] Plugin-creation assistant.
- [ ] Submission and review workflow.
- [ ] Listing moderation.
- [ ] Report plugin.
- [ ] Publisher analytics.
- [ ] Commercial procurement where offered.

Claude’s documentation makes the distinction concrete: Skills can work in chat, while hook and subagent functionality can be restricted to execution-capable surfaces. A Plugin can therefore be installed but only partially usable on a particular client. :chatgpt-content-reference{index="17"}

## 55. Connector setup and account management

- [ ] Connector directory.
- [ ] Connector search.
- [ ] Connector categories.
- [ ] Connector detail page.
- [ ] Supported-operation list.
- [ ] Read/write capability explanation.
- [ ] Connect action.
- [ ] OAuth authorization.
- [ ] API-key authorization.
- [ ] Service-account authorization.
- [ ] Organization-managed authorization.
- [ ] Multiple accounts per connector.
- [ ] Account display name.
- [ ] Account identity and domain.
- [ ] Default-account selection.
- [ ] Per-task account selection.
- [ ] Granted-scope display.
- [ ] Connection health.
- [ ] Last synchronization time.
- [ ] Reconnect/reauthorize.
- [ ] Test connection.
- [ ] Disconnect.
- [ ] Revoke permission.
- [ ] Sync-source selection.
- [ ] Folder or repository selection.
- [ ] Read-only mode.
- [ ] Write-action settings.
- [ ] Data-retention explanation.
- [ ] Source-provider attribution.
- [ ] Missing-scope request.
- [ ] Organization approval flow.
- [ ] Private-network setup where offered.

## 56. Concrete integration families

- [ ] Email search.
- [ ] Email reading.
- [ ] Email drafting.
- [ ] Email sending.
- [ ] Email attachments.
- [ ] Email labels and folders.
- [ ] Calendar search.
- [ ] Free/busy inspection.
- [ ] Event creation.
- [ ] Event editing and cancellation.
- [ ] Meeting invitations.
- [ ] Contacts and recipient lookup.
- [ ] Cloud-file search.
- [ ] Cloud-file download.
- [ ] Cloud-file creation.
- [ ] Cloud-file editing.
- [ ] Folder and sharing management.
- [ ] Document editing.
- [ ] Spreadsheet editing.
- [ ] Presentation editing.
- [ ] Team-message search.
- [ ] Team-message drafting and posting.
- [ ] Knowledge-base search.
- [ ] Wiki/page editing.
- [ ] Issue and task creation.
- [ ] Issue status updates.
- [ ] Project-management boards.
- [ ] CRM account/contact lookup.
- [ ] CRM opportunity updates.
- [ ] Support-ticket workflows.
- [ ] Repository search.
- [ ] Pull-request workflows.
- [ ] CI status and logs.
- [ ] Design-file inspection.
- [ ] Design-to-code references.
- [ ] Database querying.
- [ ] Warehouse analysis.
- [ ] Dashboard creation.
- [ ] Deployment management.
- [ ] Licensed research retrieval.
- [ ] Shopping/product lookup.
- [ ] Reservations and bookings.
- [ ] Media playback.
- [ ] Native messaging applications.
- [ ] Local notes and calendars.
- [ ] Health-record connections.
- [ ] Financial-account connections.

## 57. Tool catalog and invocation experience

- [ ] Search tool.
- [ ] Fetch-page tool.
- [ ] Source-reader tool.
- [ ] File-search tool.
- [ ] File-read tool.
- [ ] File-write tool.
- [ ] Spreadsheet tool.
- [ ] Document tool.
- [ ] Presentation tool.
- [ ] Code-execution tool.
- [ ] Shell tool.
- [ ] Patch/edit tool.
- [ ] Browser-navigation tool.
- [ ] Browser-action tool.
- [ ] Computer-action tool.
- [ ] Image-generation tool.
- [ ] Image-editing tool.
- [ ] Video-generation tool.
- [ ] Transcription tool.
- [ ] Speech-generation tool.
- [ ] Memory tool.
- [ ] Calendar tool.
- [ ] Messaging tool.
- [ ] Scheduling tool.
- [ ] Agent-delegation tool.
- [ ] Clarification/input tool.
- [ ] Approval-request tool.
- [ ] Tool discovery.
- [ ] Tool search.
- [ ] Tool descriptions and schemas.
- [ ] Tool argument preview.
- [ ] Tool-call progress.
- [ ] Tool result preview.
- [ ] Tool result expansion.
- [ ] Tool error and retry.
- [ ] Large-result references.
- [ ] Tool receipt.
- [ ] Per-tool cost and usage where exposed.

## 58. MCP and interactive extension products

- [ ] MCP server list.
- [ ] Add local server.
- [ ] Add remote server.
- [ ] Server configuration editor.
- [ ] Environment-variable configuration.
- [ ] Credential configuration.
- [ ] Connection test.
- [ ] Tool discovery.
- [ ] Resource discovery.
- [ ] Prompt discovery where supported.
- [ ] Server capability inspector.
- [ ] Server health and logs.
- [ ] Enable/disable server.
- [ ] Per-Project server configuration.
- [ ] Organization-approved server catalog.
- [ ] Private-network connector route.
- [ ] Interactive MCP app panel.
- [ ] Embedded app initialization.
- [ ] Host-to-widget state.
- [ ] Widget-to-host actions.
- [ ] Widget resizing.
- [ ] Widget authentication.
- [ ] Viewer-specific authorization.
- [ ] Site-provided tools such as WebMCP as a distinct category.
- [ ] Tool availability changing with site state.
- [ ] Extension debugging console.
- [ ] Developer-mode connection flow.
- [ ] Schema/version compatibility diagnostics.

## 59. Approvals and human-in-the-loop UI

- [ ] One-action approval.
- [ ] Batch approval.
- [ ] Per-session approval.
- [ ] Per-application permission.
- [ ] Per-folder permission.
- [ ] Per-domain permission.
- [ ] Persistent permission settings.
- [ ] Permission-mode selector.
- [ ] Read-only mode.
- [ ] Ask-before-writing mode.
- [ ] Automatic low-risk approval mode.
- [ ] Approval summary.
- [ ] Exact recipients.
- [ ] Exact destination.
- [ ] Exact amount or purchase.
- [ ] Exact command.
- [ ] Exact files or records affected.
- [ ] Proposed-diff preview.
- [ ] Allow action.
- [ ] Deny action.
- [ ] Edit proposed action.
- [ ] Ask for an alternative.
- [ ] Approval expiration.
- [ ] Approval history.
- [ ] Revoke saved permission.
- [ ] Approval from another device.
- [ ] Approval via notification.
- [ ] Stronger confirmation for sensitive operations.
- [ ] User takeover.
- [ ] Resume after user intervention.
- [ ] Action receipt and outcome display.

---

# H. Agents, tasks, browser operation, and coding

## 60. Agentic work product

- [ ] Work-task composer.
- [ ] Task title.
- [ ] Objective.
- [ ] Deliverable selection.
- [ ] Source selection.
- [ ] Tool selection.
- [ ] Execution-location selection.
- [ ] Model/profile selection.
- [ ] Effort selection.
- [ ] Spend budget.
- [ ] Time budget.
- [ ] Completion condition.
- [ ] Reviewable task plan.
- [ ] Step list.
- [ ] Dependency display.
- [ ] Running-step indicator.
- [ ] Parallel-work indicator.
- [ ] Clarification request.
- [ ] Approval request.
- [ ] Task steering.
- [ ] Pause.
- [ ] Resume.
- [ ] Cancel.
- [ ] Retry failed step.
- [ ] Restart task.
- [ ] Duplicate task.
- [ ] Save as routine.
- [ ] Save as Skill.
- [ ] Results summary.
- [ ] Generated deliverables.
- [ ] Partial-outcome summary.
- [ ] Task history.
- [ ] Task sharing.
- [ ] Cross-device task continuation.

## 61. Persistent agents and agent rosters

- [ ] Agent roster.
- [ ] Create persistent agent.
- [ ] Agent name and avatar.
- [ ] Role description.
- [ ] Agent-specific instructions.
- [ ] Agent-specific Memory.
- [ ] Agent-specific routines.
- [ ] Shared account-level tools.
- [ ] Shared account-level Skills.
- [ ] Agent workspace/computer.
- [ ] Presence/activity indicator.
- [ ] Active responsibility list.
- [ ] Agent conversation.
- [ ] Agent group conversation.
- [ ] Chief-of-staff/coordinator pattern.
- [ ] Specialist-agent delegation.
- [ ] Inter-agent messages.
- [ ] Human escalation.
- [ ] Agent pause/disable.
- [ ] Resource-budget controls.
- [ ] Agent configuration versioning.
- [ ] Agent activity history.
- [ ] Agent duplication.
- [ ] Agent retirement and ownership transfer.

Grok Bot’s documented design separates shared capabilities from agent-specific Memory and Routines, and introduces status, preview, and takeover levels for an agent’s computer. Those are additional product components beyond ordinary chat history. :chatgpt-content-reference{index="18"}

## 62. Multi-agent and multi-model interfaces

- [ ] Parent task.
- [ ] Child-agent list.
- [ ] Role labels.
- [ ] Model labels.
- [ ] Per-agent status.
- [ ] Per-agent transcript.
- [ ] Per-agent result.
- [ ] Per-agent usage.
- [ ] Concurrent task view.
- [ ] Needs-input prioritization.
- [ ] Inline unblock response.
- [ ] Full-transcript drill-down.
- [ ] Shared-workspace versus isolated-workspace indicator.
- [ ] Agent handoff.
- [ ] Summary-only handoff.
- [ ] Background fork.
- [ ] Interactive branch.
- [ ] Advisor consultation.
- [ ] Model-comparison view.
- [ ] Independent parallel answers.
- [ ] Synthesis answer.
- [ ] Agreement and disagreement display.
- [ ] Unique findings per model.
- [ ] Combined-source inspection.
- [ ] Comparison-cost estimate.
- [ ] Selected model set.
- [ ] Rerun one participant.
- [ ] Save comparison.

Perplexity’s Model Council is a documented example of parallel answers followed by a separate synthesis stage. It should not be reduced to ordinary routing or fallback. :chatgpt-content-reference{index="19"}

## 63. Routines, schedules, and triggers

- [ ] Routine gallery.
- [ ] Create routine from a prompt.
- [ ] Create routine from a completed task.
- [ ] Routine name and description.
- [ ] Prompt editor.
- [ ] Source selection.
- [ ] Repository selection.
- [ ] Connector selection.
- [ ] Agent selection.
- [ ] Model/effort selection.
- [ ] One-time schedule.
- [ ] Recurring schedule.
- [ ] Timezone control.
- [ ] Advanced recurrence.
- [ ] Event-trigger selection.
- [ ] Event filters.
- [ ] Webhook trigger.
- [ ] API trigger.
- [ ] Manual run.
- [ ] Next-run display.
- [ ] Last-run display.
- [ ] Run-history list.
- [ ] Per-run results.
- [ ] Enable/disable.
- [ ] Pause until date.
- [ ] Edit schedule.
- [ ] Delete routine.
- [ ] Duplicate routine.
- [ ] Share routine template.
- [ ] Notification preferences.
- [ ] Budget controls.
- [ ] Required-approval behavior.
- [ ] Missed-run explanation.
- [ ] Deferred execution after allowance reset.
- [ ] Connection-expiry repair flow.

## 64. Browser-assistant experience

- [ ] Current-page context.
- [ ] Selected-text context.
- [ ] Open-tab picker.
- [ ] Multi-tab comparison.
- [ ] Page summary.
- [ ] Question about page.
- [ ] Question about video/transcript.
- [ ] Browser side conversation.
- [ ] Browser history context where explicitly enabled.
- [ ] Open URL.
- [ ] Back/forward/reload.
- [ ] Create or close tab.
- [ ] Organize tabs.
- [ ] Website search.
- [ ] Form filling.
- [ ] Multi-step website task.
- [ ] Structured site-tool invocation.
- [ ] Visible action timeline.
- [ ] Live browser preview.
- [ ] Active-tab indicator.
- [ ] Login handoff.
- [ ] Human verification handoff.
- [ ] Take over.
- [ ] Return control to agent.
- [ ] Pause/stop.
- [ ] Download review.
- [ ] Upload review.
- [ ] Website permission controls.
- [ ] Browser-session persistence setting.
- [ ] Clear website data.
- [ ] Isolated agent browser versus user browser choice.
- [ ] Browser-task result summary.

## 65. Computer-use experience

- [ ] Computer-access setup.
- [ ] Operating-system permission explanation.
- [ ] Application allowlist.
- [ ] Application blocklist.
- [ ] Window selection.
- [ ] Monitor selection.
- [ ] Screen preview.
- [ ] Cursor/action visualization.
- [ ] Current-application indicator.
- [ ] Current-window indicator.
- [ ] Clipboard permission.
- [ ] Local-folder permission.
- [ ] Application launch.
- [ ] Clicking and typing.
- [ ] Scrolling.
- [ ] Drag-and-drop actions.
- [ ] Native file-dialog interaction.
- [ ] Background application operation where supported.
- [ ] User-input arbitration.
- [ ] Emergency stop.
- [ ] Pause and takeover.
- [ ] Return control.
- [ ] Sensitive-action review.
- [ ] Authentication handoff.
- [ ] Action outcome/receipt.
- [ ] Unsupported-application explanation.
- [ ] Device-offline state.
- [ ] Permission-revoked state.
- [ ] Remote access to a permitted local computer.

## 66. Coding-workspace frontend

- [ ] Repository picker.
- [ ] Branch picker.
- [ ] Worktree picker.
- [ ] Local/cloud execution selector.
- [ ] Coding-session list.
- [ ] Coding-session title.
- [ ] Session status.
- [ ] File tree.
- [ ] File search.
- [ ] Symbol search.
- [ ] Code editor.
- [ ] Editor tabs.
- [ ] Selected-code context.
- [ ] Diagnostics panel.
- [ ] Integrated terminal.
- [ ] Terminal tabs.
- [ ] Command-history view.
- [ ] Diff viewer.
- [ ] File-change summary.
- [ ] Inline review comments.
- [ ] Hunk acceptance/rejection.
- [ ] Checkpoint list.
- [ ] Restore checkpoint.
- [ ] Plan mode.
- [ ] Edit/agent mode.
- [ ] Permission-mode control.
- [ ] Context-usage indicator.
- [ ] Usage/cost indicator.
- [ ] Background task list.
- [ ] Subagent panel.
- [ ] Browser preview.
- [ ] Console-log panel.
- [ ] Running-server list.
- [ ] Port/preview URL.
- [ ] Simulator panel where offered.
- [ ] Pull-request panel.
- [ ] CI-status panel.
- [ ] Test-results panel.
- [ ] Session recap.
- [ ] Share session.
- [ ] Continue in another client.

## 67. Coding capabilities and developer workflows

- [ ] Explain repository structure.
- [ ] Find implementations.
- [ ] Find references.
- [ ] Trace call paths.
- [ ] Answer repository questions.
- [ ] Implement a feature.
- [ ] Fix a defect.
- [ ] Refactor code.
- [ ] Generate tests.
- [ ] Run tests.
- [ ] Interpret test failures.
- [ ] Run type checking.
- [ ] Run linting.
- [ ] Build applications.
- [ ] Start development servers.
- [ ] Inspect browser behavior.
- [ ] Inspect console errors.
- [ ] Inspect network failures.
- [ ] Interact with a simulator.
- [ ] Review code changes.
- [ ] Review pull requests.
- [ ] Scan for security problems.
- [ ] Explain findings.
- [ ] Propose patches.
- [ ] Apply selected patches.
- [ ] Generate documentation.
- [ ] Perform migrations.
- [ ] Upgrade dependencies.
- [ ] Create commits.
- [ ] Create branches.
- [ ] Create pull requests.
- [ ] Respond to review feedback.
- [ ] Investigate CI failures.
- [ ] Work from issues or team mentions.
- [ ] Produce repository-grounded reports, slides, and designs.
- [ ] Run bounded goal/completion loops.
- [ ] Persist useful repository-specific Memory.
- [ ] Load repository instruction files.
- [ ] Use project-specific Skills and Plugins.

## 68. Session continuity and remote-session product

- [ ] Shared session identifier across supported clients.
- [ ] Same conversation history.
- [ ] Same active branch.
- [ ] Same repository association.
- [ ] Same worktree association.
- [ ] Same model and instruction configuration.
- [ ] Same task plan and checkpoints.
- [ ] Same pending approvals.
- [ ] Same tool activity.
- [ ] Read-only session attachment.
- [ ] Active-control attachment.
- [ ] Execution-owner indicator.
- [ ] Transfer control between clients.
- [ ] Continue local execution from mobile.
- [ ] Continue cloud execution from desktop.
- [ ] Move work to cloud through an explicit handoff.
- [ ] Bring cloud results back to local workspace.
- [ ] File/environment transfer review.
- [ ] Remote-machine discovery.
- [ ] Remote-machine card.
- [ ] Host capabilities.
- [ ] Device pairing.
- [ ] Pairing revocation.
- [ ] Start a session in an allowed remote folder.
- [ ] Device-offline explanation.
- [ ] Resume after reconnect.
- [ ] Session export.
- [ ] Summary-only transfer as a separate option.
- [ ] Transcript branch as a separate option.
- [ ] Cross-client activity notifications.

---

# I. Platform-specific product surfaces

## 69. Web application

- [ ] Browser-based chat and work.
- [ ] Responsive desktop/tablet/mobile layouts.
- [ ] URL-addressable conversations and resources.
- [ ] Browser history integration.
- [ ] Browser refresh restoration.
- [ ] Drag-and-drop uploads.
- [ ] Clipboard integration.
- [ ] Camera and microphone permissions.
- [ ] Screen/tab sharing.
- [ ] Cloud code execution.
- [ ] Cloud browser execution.
- [ ] Remote desktop-host control.
- [ ] Web notifications where supported.
- [ ] Installable web application where offered.
- [ ] Offline/read-only fallback.
- [ ] Multi-tab coordination.
- [ ] Downloads and export.
- [ ] Browser capability detection.
- [ ] Unsupported-browser explanation.
- [ ] Public share and preview experiences.

## 70. Desktop application

- [ ] Native application shell.
- [ ] System menu integration.
- [ ] Tray/menu-bar integration.
- [ ] Dock/taskbar behavior.
- [ ] Global shortcut.
- [ ] Quick composer.
- [ ] Companion window.
- [ ] Always-on-top option.
- [ ] Multiple windows.
- [ ] Detachable panels.
- [ ] Native file picker.
- [ ] Persistent folder access.
- [ ] Local filesystem search.
- [ ] Local filesystem editing.
- [ ] Local shell execution.
- [ ] Local agent daemon.
- [ ] Local MCP servers.
- [ ] Native application context.
- [ ] Screen/window capture.
- [ ] Cross-application dictation.
- [ ] Computer use.
- [ ] Remote-host service.
- [ ] Local model management where offered.
- [ ] Launch at login.
- [ ] Background-runtime controls.
- [ ] Automatic updates.
- [ ] Update-channel selection.
- [ ] Diagnostic export.
- [ ] Local cache/storage management.
- [ ] Native deep links.
- [ ] OS-specific privacy settings.
- [ ] Sleep/wake and lock-state behavior.

## 71. Mobile application

- [ ] Native navigation.
- [ ] Compact composer.
- [ ] Keyboard-aware layout.
- [ ] Touch message actions.
- [ ] Long-press menus.
- [ ] Camera intake.
- [ ] Photo-picker intake.
- [ ] File-provider intake.
- [ ] Share-sheet intake.
- [ ] Voice conversation.
- [ ] Audio-route controls.
- [ ] Push notifications.
- [ ] Notification deep links.
- [ ] Quick reply to agent questions.
- [ ] Remote action approval.
- [ ] Remote coding review.
- [ ] Cloud-task initiation.
- [ ] Background upload recovery.
- [ ] Conversation restoration after process death.
- [ ] Home-screen widgets.
- [ ] Lock-screen widgets where supported.
- [ ] Live activity where supported.
- [ ] System shortcuts/App Intents.
- [ ] Default-assistant integration where supported.
- [ ] Tablet layout.
- [ ] Foldable adaptation.
- [ ] Landscape adaptation.
- [ ] Offline data management.
- [ ] Cellular-data preferences.
- [ ] Local inference where intentionally implemented.
- [ ] App-store purchase and restoration.
- [ ] Mobile-specific privacy controls.

## 72. CLI and terminal application

- [ ] Interactive terminal UI.
- [ ] Linear accessible output mode.
- [ ] Headless/noninteractive mode.
- [ ] Standard input support.
- [ ] Piped input.
- [ ] Plain-text output.
- [ ] Structured JSON output.
- [ ] Streaming JSON events.
- [ ] Exit-code contract.
- [ ] Authentication commands.
- [ ] Session list.
- [ ] Resume command.
- [ ] Branch command.
- [ ] Model command.
- [ ] Effort command.
- [ ] Permission command.
- [ ] Context command.
- [ ] Usage command.
- [ ] Compact-context command.
- [ ] Tool/MCP commands.
- [ ] Skill/Plugin commands.
- [ ] Repository/folder selection.
- [ ] File mentions.
- [ ] Prompt history.
- [ ] Keyboard shortcuts.
- [ ] Shell completion.
- [ ] Theme selection.
- [ ] No-color mode.
- [ ] Terminal resize handling.
- [ ] Remote-session attachment.
- [ ] Background-task management.
- [ ] Export transcript.
- [ ] Configuration-file support.
- [ ] Environment-variable support.
- [ ] Installer and updater.
- [ ] Diagnostics command.
- [ ] CI/scripting integration.

## 73. VS Code and IDE extension

- [ ] Sidebar chat view.
- [ ] Editor-adjacent chat.
- [ ] Session picker.
- [ ] Repository/workspace association.
- [ ] Active-file context.
- [ ] Selected-code context.
- [ ] Unsaved-buffer context.
- [ ] File mentions.
- [ ] Symbol mentions.
- [ ] Diagnostics context.
- [ ] Inline suggestions.
- [ ] Inline edits.
- [ ] Native diff review.
- [ ] Hunk acceptance.
- [ ] Apply patch.
- [ ] Terminal integration.
- [ ] Command-palette actions.
- [ ] Keyboard bindings.
- [ ] Status-bar indicators.
- [ ] Model and permission controls.
- [ ] Task and approval notifications.
- [ ] Project instructions.
- [ ] MCP/Skill/Plugin settings.
- [ ] Shared session with CLI/desktop.
- [ ] Remote workspace support.
- [ ] Container/WSL support where offered.
- [ ] Workspace-trust experience.
- [ ] Webview error and loading states.
- [ ] Extension update flow.
- [ ] IDE-version compatibility messaging.

## 74. Browser extension

- [ ] Toolbar action.
- [ ] Popup interface.
- [ ] Side panel.
- [ ] Selection context menu.
- [ ] Ask about selected text.
- [ ] Ask about current page.
- [ ] Summarize current page.
- [ ] Ask about a video.
- [ ] Tab context picker.
- [ ] Multi-tab comparison.
- [ ] Multiple side conversations.
- [ ] Page-context chips.
- [ ] Explicit site-access request.
- [ ] Per-site permission settings.
- [ ] Agent action indicator.
- [ ] Browser-control mode.
- [ ] Stop/takeover control.
- [ ] Desktop-app pairing.
- [ ] Native-host connection status.
- [ ] Account/workspace switching.
- [ ] Voice entry where supported.
- [ ] Page-to-Project saving.
- [ ] Page-to-Library saving.
- [ ] Extension update notice.
- [ ] Unsupported-page explanation.
- [ ] Private/incognito controls.
- [ ] Browser-specific feature differences.
- [ ] Recovery after background-worker suspension.

## 75. Platform capability differences to represent explicitly

| Capability            | Web                                                    | Desktop                                                           | Mobile                                                                 | CLI/IDE                                               | Browser extension                                                 |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| **Local file access** | User-selected browser access or upload.                | Broader granted folders and filesystem operations.                | System pickers and application sandbox.                                | Workspace/filesystem access under execution policy.   | Page context; local files usually require a bridge.               |
| **Shell execution**   | Hosted sandbox or paired host.                         | Local or isolated runtime.                                        | Usually cloud or paired host.                                          | Local, remote, container, or cloud runtime.           | Usually a paired runtime, not direct unrestricted shell access.   |
| **Background work**   | Durable server work can continue after the tab closes. | Depends on whether the UI, daemon, host, or cloud owns execution. | Cloud work can continue; native background activity is OS-constrained. | Process/daemon/cloud ownership determines continuity. | Service-worker lifetime is not a durable task runtime.            |
| **Computer control**  | Cloud computer or authorized paired host.              | Native host integrations where implemented.                       | Remote control or limited approved device integrations.                | Tool/daemon integrations.                             | Browser actions, with separate native-host access if implemented. |
| **Artifact editing**  | Usually the broadest browser editing surface.          | Similar plus native file/app integration.                         | Often adapted to touch and smaller screens.                            | Source-oriented manipulation and external preview.    | Narrow embedded preview or full-app handoff.                      |
| **Voice**             | Browser media permissions and realtime transport.      | Native audio integration and global invocation.                   | Strong native voice/camera integration.                                | Optional companion or remote voice surface.           | Optional browser media capture and side-panel experience.         |

This is a **design capability matrix**, not a statement that every named competitor ships every cell.

---

# J. Model capabilities and feature gating

## 76. Model-capability registry

- [ ] Text input.
- [ ] Text output.
- [ ] Image understanding.
- [ ] Multiple-image input.
- [ ] High-resolution image inspection.
- [ ] Native PDF/document input.
- [ ] Audio understanding.
- [ ] Audio transcription.
- [ ] Realtime audio input.
- [ ] Speech output.
- [ ] Realtime speech-to-speech.
- [ ] Video understanding.
- [ ] Timestamped video processing.
- [ ] Image generation.
- [ ] Image editing.
- [ ] Multi-reference image editing.
- [ ] Video generation.
- [ ] Video editing.
- [ ] Generated video audio.
- [ ] Music generation.
- [ ] Function/tool calling.
- [ ] Parallel tool calls.
- [ ] Multi-round tool use.
- [ ] Structured JSON output.
- [ ] Schema-constrained output.
- [ ] Reasoning-effort controls.
- [ ] Supported sampling parameters.
- [ ] Context-window limit.
- [ ] Output-token limit.
- [ ] Maximum file/image/audio/video sizes.
- [ ] Streaming capabilities.
- [ ] Cache capabilities.
- [ ] Batch/deferred processing.
- [ ] Regional route availability.
- [ ] Retention/data-use constraints.
- [ ] Serving-speed options.
- [ ] Model lifecycle and retirement.
- [ ] Route-specific differences.

## 77. Feature capability is not always native model capability

The gating decision should ask **whether an eligible implementation path exists**, not merely whether one selected language model has every required modality.

| Feature                | Possible implementation paths                                                  | UI consequence                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Ask about a PDF**    | Native document input; text extraction; OCR; page-image analysis; RAG.         | A text-only model can still answer from extracted text. Hide upload only when no permitted path can handle the file. |
| **Ask about an image** | Native vision model; separate vision tool; explicit model switch.              | Show image understanding only through a real supported path; describe an explicit switch or limitation.              |
| **Dictation**          | Speech-to-text followed by ordinary text inference.                            | Dictation need not disappear when the selected language model lacks audio input.                                     |
| **Live Voice**         | Native speech-to-speech or a composed transcription/text/speech pipeline.      | Available controls and latency depend on the chosen voice architecture.                                              |
| **Image generation**   | Native multimodal generation or a separate image-generation tool.              | A text model can coordinate image creation without producing image pixels itself.                                    |
| **Image editing**      | An editing-capable model/tool plus an actual source image.                     | Generation support alone is insufficient for an Edit button.                                                         |
| **Code execution**     | Model produces code; an authorized runtime executes it.                        | Execution is gated by the runtime, tool interface, permissions, and tier-not simply “coding intelligence.”           |
| **Web search**         | Native hosted search or external search/fetch tools.                           | Search may remain available across several models through an orchestration layer.                                    |
| **Research**           | Planning model, search/retrieval tools, evidence store, and report generation. | Research is a product workflow, not synonymous with a “Thinking” model.                                              |
| **Video generation**   | Separate asynchronous media service, possibly coordinated by a text model.     | Video settings come from the video route, not the chat model.                                                        |
| **Local shell**        | Local executor, remote host, or cloud sandbox.                                 | Show execution location and required permission.                                                                     |
| **Long context**       | Native context capacity, retrieval, summarization, or compaction.              | A paid tier cannot make an unsupported native context window larger; alternative handling must be explicit.          |

## 78. UI gating and adaptation components

- [ ] Feature-availability resolver.
- [ ] Model-dependent composer controls.
- [ ] Model-dependent accepted-file types.
- [ ] Model-dependent reasoning options.
- [ ] Model-dependent sampling options.
- [ ] Model-dependent media settings.
- [ ] Tier-dependent entitlement checks.
- [ ] Tier-dependent remaining allowance.
- [ ] Workspace-policy restrictions.
- [ ] Role restrictions.
- [ ] Regional restrictions.
- [ ] Age or account eligibility restrictions.
- [ ] Required-connection detection.
- [ ] Required-device detection.
- [ ] Required-runtime detection.
- [ ] Unsupported versus temporarily unavailable distinction.
- [ ] Hidden irrelevant controls.
- [ ] Disabled but discoverable restricted controls.
- [ ] Upgrade explanation.
- [ ] Connect-account explanation.
- [ ] Grant-permission explanation.
- [ ] Use-another-model explanation.
- [ ] Continue-on-another-device action.
- [ ] Explicit processing-path selection.
- [ ] Attachment-preservation choice after model change.
- [ ] Unsupported-parameter removal or correction.
- [ ] Effective-capability inspector.
- [ ] Live updates after a plan, policy, connection, or device change.

## 79. Routing and model-neutral orchestration

- [ ] Automatic model selection.
- [ ] User-selected model.
- [ ] Project default model.
- [ ] Task-specific model profile.
- [ ] Speed-first profile.
- [ ] Quality-first profile.
- [ ] Cost-first profile.
- [ ] Privacy-first profile.
- [ ] Classification of task intent.
- [ ] Classification of required tools.
- [ ] Classification of required modalities.
- [ ] Complexity/effort classification.
- [ ] Source-freshness classification.
- [ ] Model eligibility filtering.
- [ ] Provider-route selection.
- [ ] Exact-model lock.
- [ ] Provider lock.
- [ ] Route lock.
- [ ] Quota-aware selection.
- [ ] Health-aware fallback.
- [ ] Explicit model-switch offer.
- [ ] Advisor escalation.
- [ ] Specialist worker selection.
- [ ] Multi-model comparison.
- [ ] Confidence-based abstention.
- [ ] User-visible routing explanation.
- [ ] Actual-model attribution.
- [ ] Routing-policy versioning.
- [ ] Classification adapter, including Jev if chosen.
- [ ] Classification failure fallback.
- [ ] Routing evaluation dashboard.

Jev belongs here as an optional implementation choice; it should not be presented as a verified component used by these competitors.

---

# K. Subscription, usage, billing, and commercial product

## 80. What can vary by tier

These are **independent commercial dimensions**, not a rule that every limit increases together.

| Dimension             | Examples of tier differentiation                                                             |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Model access**      | Available families, specialist models, premium reasoning models, preview access.             |
| **Overall allowance** | Message counts, weighted compute, credits, or a combination.                                 |
| **Reasoning**         | Available effort levels, maximum per-task spend, premium serving modes.                      |
| **Context handling**  | Allowed request budget, attached-source count, retrieval scope, compaction features.         |
| **Uploads**           | Per-file size, files per prompt, cumulative uploads, processing allowance.                   |
| **Storage**           | Total storage, Project storage, generated-media retention, version retention.                |
| **Images**            | Generation allowance, quality, resolution, batch count, editing access.                      |
| **Video**             | Generation allowance, duration, resolution, priority, simultaneous jobs.                     |
| **Voice**             | Minutes or compute allowance, premium voices, background use, visual context.                |
| **Research**          | Research allowance, depth, concurrency, source integrations, export options.                 |
| **Code execution**    | Compute time, memory, persistent environments, simultaneous sandboxes.                       |
| **Agent work**        | Task budget, duration, concurrency, schedules, parallel agents.                              |
| **Integrations**      | Available connectors, custom connections, private-network access, organizational management. |
| **Customization**     | Skill creation, Plugin creation, private marketplaces, custom assistants.                    |
| **Collaboration**     | Shared Projects, members, roles, guest access, publishing controls.                          |
| **Service quality**   | Queue priority, concurrency, capacity reservations, support level.                           |
| **Governance**        | SSO, provisioning, retention, residency, audit, customer-managed keys.                       |
| **Developer access**  | API entitlements, programmatic budgets, service accounts, admin APIs.                        |

Modern offerings do not all use simple message counts. For example, Grok documents a shared compute-based allowance across product areas, and Gemini Notebook describes compute-sensitive limits influenced by task and source complexity. :chatgpt-content-reference{index="20"}

## 81. Free / Basic / Pro / Max 5x / Max 15x planning structure

- [ ] Versioned plan catalog.
- [ ] Free-plan feature bundle.
- [ ] Basic-plan feature bundle.
- [ ] Pro-plan feature bundle.
- [ ] Max 5x feature bundle.
- [ ] Max 15x feature bundle.
- [ ] Explicit definition of the baseline behind “5x” and “15x.”
- [ ] Explicit identification of the allowance being multiplied.
- [ ] Separate feature-access differences.
- [ ] Separate upload-size limits.
- [ ] Separate storage limits.
- [ ] Separate context limits.
- [ ] Separate concurrency limits.
- [ ] Separate generation settings.
- [ ] Separate per-model caps.
- [ ] Shared versus dedicated usage pools.
- [ ] Monthly and annual billing choices.
- [ ] Trial entitlements.
- [ ] Promotional entitlements.
- [ ] Purchased credit balances.
- [ ] Optional overage.
- [ ] Grandfathered plan versions.
- [ ] Upgrade effective time.
- [ ] Downgrade effective time.
- [ ] Grace-period behavior.
- [ ] API/programmatic use treated explicitly.
- [ ] Cross-platform entitlement sharing.
- [ ] Plan-specific feature explanations.

## 82. Usage dashboard and limit UI

- [ ] Current plan.
- [ ] Billing period.
- [ ] Overall usage meter.
- [ ] Per-model usage.
- [ ] Per-feature usage.
- [ ] Voice usage.
- [ ] Image usage.
- [ ] Video usage.
- [ ] Research usage.
- [ ] Coding/work usage.
- [ ] Storage usage.
- [ ] Active-job count.
- [ ] Remaining credits.
- [ ] Purchased versus included credits.
- [ ] Promotional credits.
- [ ] Credit-expiry information.
- [ ] Reset countdown.
- [ ] Daily/weekly/monthly history.
- [ ] Usage by Project.
- [ ] Usage by task.
- [ ] Usage by device or surface where useful.
- [ ] Estimated task cost.
- [ ] Actual task cost.
- [ ] Budget warning.
- [ ] Budget-reached state.
- [ ] Alternative eligible model suggestion.
- [ ] Wait-until-reset option.
- [ ] Resume-after-reset preference.
- [ ] Extra-usage purchase.
- [ ] Auto-reload settings.
- [ ] Spending cap.
- [ ] Download usage report.
- [ ] Billing discrepancy report.

## 83. Billing and subscription screens

- [ ] Plan-comparison dialog.
- [ ] Monthly/annual toggle.
- [ ] Upgrade checkout.
- [ ] Downgrade review.
- [ ] Proration explanation.
- [ ] Tax and total-price display.
- [ ] Coupon entry.
- [ ] Trial terms.
- [ ] Payment-method entry.
- [ ] Payment-method management.
- [ ] Billing address.
- [ ] Tax identifier.
- [ ] Purchase confirmation.
- [ ] Payment failure.
- [ ] Retry payment.
- [ ] Billing-history list.
- [ ] Invoice download.
- [ ] Receipt download.
- [ ] Credit-note display.
- [ ] Refund status.
- [ ] Cancel subscription.
- [ ] Resume subscription.
- [ ] Scheduled cancellation.
- [ ] End-of-term access explanation.
- [ ] Mobile purchase restoration.
- [ ] Store-managed subscription instructions.
- [ ] Duplicate-subscription warning.
- [ ] Team seat purchase.
- [ ] Seat assignment.
- [ ] Enterprise billing contacts.
- [ ] Purchase-order and invoicing workflows.
- [ ] Credit-purchase history.
- [ ] Auto-reload history.

---

# L. Settings, account management, enterprise, and support

## 84. General and appearance settings

- [ ] Display language.
- [ ] Timezone.
- [ ] Theme.
- [ ] Accent color where offered.
- [ ] Text size.
- [ ] Interface density.
- [ ] Reduced motion.
- [ ] Code theme.
- [ ] Code line wrapping.
- [ ] Default model.
- [ ] Default effort.
- [ ] Default mode.
- [ ] Default workspace.
- [ ] Send-key behavior.
- [ ] Keyboard shortcuts.
- [ ] Sound effects.
- [ ] Haptics.
- [ ] Notification channels.
- [ ] Quiet hours.
- [ ] Startup destination.
- [ ] Launch-at-login preference.
- [ ] Companion-window preference.
- [ ] Sidebar behavior.
- [ ] Layout reset.
- [ ] Experimental-feature enrollment.
- [ ] Restore defaults.

## 85. Personalization and data settings

- [ ] Profile details.
- [ ] Custom instructions.
- [ ] Communication style.
- [ ] Writing-style personalization.
- [ ] Saved Memory.
- [ ] Past-chat reference.
- [ ] Project Memory preferences.
- [ ] Connected personalization sources.
- [ ] Location-use preference.
- [ ] Browsing-context preference.
- [ ] Activity-history preference.
- [ ] Training/improvement choice.
- [ ] Feedback-data choice.
- [ ] Diagnostic-sharing choice.
- [ ] Voice recording retention.
- [ ] Temporary-chat preferences.
- [ ] Archived-chat management.
- [ ] Delete all chats.
- [ ] Shared-link management.
- [ ] Data export.
- [ ] Import history.
- [ ] Import Memory.
- [ ] Clear local storage.
- [ ] Clear browser data.
- [ ] Reset personalization.
- [ ] Delete account.

## 86. Security and connected-access settings

- [ ] Authentication methods.
- [ ] Password management.
- [ ] Passkeys.
- [ ] Multifactor authentication.
- [ ] Recovery codes.
- [ ] Active sessions.
- [ ] Trusted devices.
- [ ] Remote paired devices.
- [ ] Sign out current device.
- [ ] Sign out all devices.
- [ ] Security notifications.
- [ ] Connected accounts.
- [ ] Granted connector scopes.
- [ ] API keys.
- [ ] Personal access tokens.
- [ ] Local folders.
- [ ] Browser sites.
- [ ] Computer applications.
- [ ] Clipboard access.
- [ ] Microphone access.
- [ ] Camera access.
- [ ] Screen-sharing preferences.
- [ ] Saved approvals.
- [ ] Default permission mode.
- [ ] Revoke all optional grants.
- [ ] Advanced/hardened account-security mode.

## 87. Enterprise administration screens

- [ ] Organization overview.
- [ ] Member directory.
- [ ] Invitations.
- [ ] Groups.
- [ ] Roles.
- [ ] Custom roles.
- [ ] Seat assignment.
- [ ] Owner transfer.
- [ ] Domain verification.
- [ ] SSO setup.
- [ ] Directory provisioning.
- [ ] Service accounts.
- [ ] Model-access policy.
- [ ] Feature-access policy.
- [ ] Tool policy.
- [ ] Connector policy.
- [ ] Skill and Plugin policy.
- [ ] Private marketplace.
- [ ] Shared Project administration.
- [ ] External-sharing controls.
- [ ] Public-publishing controls.
- [ ] Memory policy.
- [ ] Data-retention settings.
- [ ] Data-residency settings.
- [ ] Customer-managed-key setup where offered.
- [ ] Network/IP restrictions.
- [ ] Device-management integration.
- [ ] Audit-log viewer.
- [ ] Audit export.
- [ ] Usage analytics.
- [ ] Group spending limits.
- [ ] User spending limits.
- [ ] Organization budget.
- [ ] Billing administration.
- [ ] Support-access controls.
- [ ] Compliance export.
- [ ] Legal-hold administration where offered.
- [ ] Managed rollout and update settings.
- [ ] Policy diagnostics.
- [ ] Administrative API access.

## 88. Support, trust, and policy product

- [ ] Contextual help links.
- [ ] Searchable help center.
- [ ] Contact-support flow.
- [ ] Report-a-bug flow.
- [ ] Product feedback.
- [ ] Feature request.
- [ ] User-reviewable diagnostic bundle.
- [ ] Request/error identifier.
- [ ] Known-issue display.
- [ ] Service-status integration.
- [ ] Incident notices.
- [ ] Maintenance notices.
- [ ] Release-update education.
- [ ] Model-retirement notice.
- [ ] Feature-migration assistant.
- [ ] Privacy-rights request portal.
- [ ] Cookie preference center.
- [ ] Content-reporting flow.
- [ ] Copyright/impersonation reporting.
- [ ] Safety-warning appeal.
- [ ] Account-suspension appeal.
- [ ] Security vulnerability reporting.
- [ ] Accessibility feedback.
- [ ] Policy-version history.
- [ ] Subprocessor information.
- [ ] Security/compliance evidence portal.
- [ ] Jurisdiction-specific notices where applicable.

---

# M. Backend product components

The following are **logical components needed to support the product inventory**. They do not each need to become a separate microservice, and they are not claims about competitors’ unpublished service names.

## 89. Account and access components

- [ ] Account service.
- [ ] Authentication-provider adapters.
- [ ] Session service.
- [ ] Token refresh and revocation service.
- [ ] Device registry.
- [ ] Recovery service.
- [ ] Profile service.
- [ ] User-preference service.
- [ ] Consent and terms-version store.
- [ ] Organization service.
- [ ] Workspace service.
- [ ] Membership service.
- [ ] Invitation service.
- [ ] Group service.
- [ ] Role/permission service.
- [ ] Resource-authorization layer.
- [ ] SSO configuration.
- [ ] Directory-provisioning adapter.
- [ ] Service-account management.
- [ ] API-key management.
- [ ] Personal-access-token management.
- [ ] Remote-device pairing service.
- [ ] Account export/deletion coordinator.
- [ ] Administrative access service.

## 90. Conversation and synchronization components

- [ ] Conversation store.
- [ ] Turn/message store.
- [ ] Message-version store.
- [ ] Branch graph.
- [ ] Generation-attempt store.
- [ ] Conversation-title generator.
- [ ] Draft store.
- [ ] Pin/archive service.
- [ ] Conversation search index.
- [ ] Transcript export.
- [ ] Shared-conversation snapshot service.
- [ ] Conversation metadata service.
- [ ] Event-stream gateway.
- [ ] Streaming event codec.
- [ ] Stream cursor/replay store.
- [ ] Client-event reconciliation.
- [ ] Cross-device synchronization.
- [ ] Notification fan-out.
- [ ] Offline-change reconciliation.
- [ ] Conversation/resource deep-link resolver.
- [ ] Deletion tombstone propagation.
- [ ] Import and migration adapters.
- [ ] Client-version compatibility layer.

## 91. Model and inference components

- [ ] Model registry.
- [ ] Provider registry.
- [ ] Provider-route registry.
- [ ] Capability registry.
- [ ] Model alias resolution.
- [ ] Model lifecycle management.
- [ ] Inference request coordinator.
- [ ] Provider adapter interface.
- [ ] Provider credential broker.
- [ ] Request translation.
- [ ] Multimodal input translation.
- [ ] Tool-schema translation.
- [ ] Structured-output translation.
- [ ] Streaming normalization.
- [ ] Provider-error normalization.
- [ ] Usage extraction.
- [ ] Token estimation/counting.
- [ ] Context-budget resolver.
- [ ] Model router.
- [ ] Task classifier.
- [ ] Route health monitor.
- [ ] Fallback coordinator.
- [ ] Exact-selection enforcement.
- [ ] Cancellation propagation.
- [ ] Request deadline management.
- [ ] Retry management.
- [ ] Prompt/template registry.
- [ ] Prompt caching.
- [ ] Cache diagnostics.
- [ ] Batch/deferred inference coordinator.
- [ ] Inference telemetry.
- [ ] Model evaluation service.

## 92. Tool-calling and agent-loop components

- [ ] Tool registry.
- [ ] Tool discovery/search.
- [ ] Tool schema loader.
- [ ] Tool argument validator.
- [ ] Tool-call parser.
- [ ] Tool executor dispatcher.
- [ ] Tool result normalizer.
- [ ] Tool-result storage.
- [ ] Large-result reference service.
- [ ] Multi-round model/tool loop.
- [ ] Parallel tool scheduler.
- [ ] Dependency-aware execution.
- [ ] Approval-policy evaluator.
- [ ] Approval-request store.
- [ ] Approval-decision store.
- [ ] Action-binding validator.
- [ ] Action-receipt store.
- [ ] Idempotency manager.
- [ ] External-outcome reconciliation.
- [ ] Cancellation coordinator.
- [ ] Agent definition store.
- [ ] Agent runtime.
- [ ] Plan/step store.
- [ ] Subagent coordinator.
- [ ] Checkpoint store.
- [ ] Completion-condition evaluator.
- [ ] Human-input queue.
- [ ] Per-task budget manager.
- [ ] Durable task scheduler.
- [ ] Runtime recovery manager.

## 93. Search, retrieval, and context components

- [ ] Context-source registry.
- [ ] Context selection.
- [ ] Instruction resolver.
- [ ] Context manifest builder.
- [ ] Context compaction.
- [ ] Summary versioning.
- [ ] Conversation retrieval.
- [ ] Project retrieval.
- [ ] Public-search adapters.
- [ ] Web-fetch service.
- [ ] Safe URL resolver.
- [ ] Page-content extraction.
- [ ] Search-query planner.
- [ ] Search-result normalization.
- [ ] Result deduplication.
- [ ] Relevance ranking.
- [ ] Source freshness evaluation.
- [ ] Document chunking.
- [ ] Embedding generation.
- [ ] Vector index.
- [ ] Lexical index.
- [ ] Hybrid retrieval.
- [ ] Reranking.
- [ ] Permission-aware retrieval filters.
- [ ] Source locator registry.
- [ ] Citation resolver.
- [ ] Grounding checker.
- [ ] Research evidence store.
- [ ] Research orchestrator.
- [ ] Research report generator.
- [ ] Knowledge-graph or wiki projection where offered.

## 94. Memory and personalization components

- [ ] Memory candidate extraction.
- [ ] Explicit Memory write handler.
- [ ] Memory topic store.
- [ ] Memory provenance.
- [ ] Memory retrieval.
- [ ] Memory relevance ranking.
- [ ] Duplicate-Memory merger.
- [ ] Contradiction/correction handling.
- [ ] Memory prioritization.
- [ ] Memory expiry.
- [ ] Memory deletion.
- [ ] Memory import/export.
- [ ] Personal versus Project scope resolver.
- [ ] Agent-specific Memory store.
- [ ] Background Memory maintenance.
- [ ] Writing-style profile generator.
- [ ] Personalization-source selection.
- [ ] Personalization attribution.
- [ ] Sensitive-data exclusion rules.
- [ ] Temporary-conversation exclusions.
- [ ] Personal recap generator.
- [ ] Daily-brief context builder.

## 95. File and Library components

- [ ] Upload-session service.
- [ ] Multipart/resumable-upload service.
- [ ] File metadata store.
- [ ] Blob/object storage.
- [ ] MIME/content inspection.
- [ ] Malware/quarantine pipeline.
- [ ] Document parser workers.
- [ ] OCR worker.
- [ ] Image preprocessing.
- [ ] Audio transcription worker.
- [ ] Video frame/transcript processor.
- [ ] Preview generator.
- [ ] Thumbnail generator.
- [ ] Extraction-result store.
- [ ] File-version store.
- [ ] Library catalog.
- [ ] Folder hierarchy.
- [ ] External-resource reference store.
- [ ] Connected-file synchronization.
- [ ] Download authorization.
- [ ] Export packaging.
- [ ] File conversion.
- [ ] Storage-quota accounting.
- [ ] Trash/restore service.
- [ ] Retention cleanup.
- [ ] Derivative-resource cleanup.
- [ ] Resource-sharing service.
- [ ] Source-deletion propagation.

## 96. Artifact and generated-application components

- [ ] Artifact registry.
- [ ] Artifact-version store.
- [ ] Structured-document storage.
- [ ] Collaborative editing backend.
- [ ] Comment and suggestion service.
- [ ] Selection-to-edit translation.
- [ ] Document-generation worker.
- [ ] Spreadsheet-generation worker.
- [ ] Presentation-generation worker.
- [ ] PDF-generation worker.
- [ ] Export-format adapters.
- [ ] Artifact preview renderer.
- [ ] Generated-code build service.
- [ ] Dependency resolver.
- [ ] Preview sandbox.
- [ ] Preview-origin management.
- [ ] Artifact data store.
- [ ] Connected-data proxy.
- [ ] Viewer-authentication bridge.
- [ ] Generated-site deployment service.
- [ ] Deployment history.
- [ ] Custom-domain management.
- [ ] Published-app authorization.
- [ ] App-level metering.
- [ ] Publication moderation.
- [ ] Unpublish/rollback controller.
- [ ] Template registry.
- [ ] Design-system asset registry.

## 97. Media and realtime components

- [ ] Image-generation adapter.
- [ ] Image-editing adapter.
- [ ] Reference-asset manager.
- [ ] Mask-processing service.
- [ ] Media-job queue.
- [ ] Provider-job reconciliation.
- [ ] Polling/webhook completion handler.
- [ ] Generated-asset downloader.
- [ ] Media object storage.
- [ ] Image postprocessing.
- [ ] Video transcoding.
- [ ] Thumbnail/contact-sheet generation.
- [ ] Subtitle/transcript generation.
- [ ] Provenance metadata service.
- [ ] Likeness/voice-consent store.
- [ ] Audio transcription service.
- [ ] Text-to-speech service.
- [ ] Realtime session broker.
- [ ] Ephemeral credential service.
- [ ] Audio transport.
- [ ] Voice activity detection.
- [ ] Turn-detection coordinator.
- [ ] Playback/interruption coordinator.
- [ ] Voice-to-tool bridge.
- [ ] Voice-to-durable-task handoff.
- [ ] Visual-frame ingestion.
- [ ] Audio/video synchronization.
- [ ] Voice session persistence.
- [ ] Audio overview generator.
- [ ] Music-generation adapter.

## 98. Integration and extensibility components

- [ ] Connector registry.
- [ ] Connected-account store.
- [ ] OAuth callback service.
- [ ] Token vault.
- [ ] Token refresh coordinator.
- [ ] Scope/consent manager.
- [ ] Provider-specific connector adapters.
- [ ] Connector search/index worker.
- [ ] External webhook receiver.
- [ ] Connector health monitor.
- [ ] Multi-account selection.
- [ ] MCP client runtime.
- [ ] MCP server host.
- [ ] MCP gateway/proxy.
- [ ] Private-network bridge.
- [ ] Interactive-app host bridge.
- [ ] Plugin registry.
- [ ] Plugin package validator.
- [ ] Plugin dependency resolver.
- [ ] Plugin installer/updater.
- [ ] Skill registry.
- [ ] Skill resource loader.
- [ ] Hook dispatcher.
- [ ] Command registry.
- [ ] Marketplace catalog service.
- [ ] Publisher identity service.
- [ ] Organization distribution service.
- [ ] Package scanning.
- [ ] Extension evaluation service.

## 99. Coding and local-runtime components

- [ ] Shared coding-session service.
- [ ] App-server/session protocol.
- [ ] Local daemon.
- [ ] Runtime discovery.
- [ ] Repository registry.
- [ ] Workspace discovery.
- [ ] File search engine.
- [ ] Symbol index.
- [ ] Language-service adapters.
- [ ] Unsaved-buffer synchronization.
- [ ] Repository instruction loader.
- [ ] Patch engine.
- [ ] Diff engine.
- [ ] Checkpoint manager.
- [ ] Git adapter.
- [ ] Worktree manager.
- [ ] Terminal/PTY manager.
- [ ] Process manager.
- [ ] Environment manager.
- [ ] Development-server manager.
- [ ] Preview-port broker.
- [ ] Browser verification adapter.
- [ ] Simulator adapter.
- [ ] SCM provider integration.
- [ ] Code-review pipeline.
- [ ] Test-result parser.
- [ ] CI integration.
- [ ] Remote-host relay.
- [ ] Host capability manifest.
- [ ] Local-to-cloud handoff coordinator.

## 100. Commercial and administrative components

- [ ] Plan catalog.
- [ ] Price catalog.
- [ ] Entitlement resolver.
- [ ] Limit/quota resolver.
- [ ] Usage-event ingestion.
- [ ] Usage ledger.
- [ ] Credit reservation.
- [ ] Credit settlement.
- [ ] Credit refund/release.
- [ ] Cost attribution.
- [ ] Rate-limiting service.
- [ ] Concurrency-limiting service.
- [ ] Budget manager.
- [ ] Checkout adapter.
- [ ] Subscription synchronization.
- [ ] Payment webhook processor.
- [ ] Mobile receipt validation.
- [ ] Invoice service.
- [ ] Refund/dispute workflow.
- [ ] Tax calculation integration.
- [ ] Seat/license service.
- [ ] Promotion service.
- [ ] Referral service.
- [ ] Usage reporting.
- [ ] Enterprise billing integration.
- [ ] Administrative API.
- [ ] Support-case integration.
- [ ] Audit-event store.

---

# N. Shared packages, runtimes, and implementation choices

## 101. Shared package boundaries

These represent reusable responsibilities; package names are illustrative.

- [ ] Shared request/response contracts.
- [ ] Shared event schemas.
- [ ] Shared content-block schemas.
- [ ] Shared error definitions.
- [ ] Shared resource identifiers.
- [ ] Shared model metadata.
- [ ] Shared capability resolution.
- [ ] Shared entitlement resolution.
- [ ] Shared policy contracts.
- [ ] Shared authentication client.
- [ ] Shared API client.
- [ ] Shared streaming client.
- [ ] Shared conversation-state logic.
- [ ] Shared synchronization logic.
- [ ] Shared Project models.
- [ ] Shared file/Library models.
- [ ] Shared artifact models.
- [ ] Shared source/citation models.
- [ ] Shared Memory contracts.
- [ ] Shared tool definitions.
- [ ] Shared approval contracts.
- [ ] Shared connector interfaces.
- [ ] Shared Skill/Plugin manifests.
- [ ] Shared agent/task models.
- [ ] Shared coding-session protocol.
- [ ] Shared usage/billing models.
- [ ] Shared notifications.
- [ ] Shared localization.
- [ ] Shared design tokens.
- [ ] Shared web UI primitives.
- [ ] Platform-specific native UI primitives.
- [ ] Shared Markdown/content transformations.
- [ ] Platform-specific renderers.
- [ ] Shared telemetry conventions.
- [ ] Shared test data and schema conformance fixtures.
- [ ] Shared configuration validation.
- [ ] Shared security-sensitive utility code.
- [ ] Explicit browser-only, server-only, and native-only exports.

## 102. Runtime inventory

- [ ] Browser application runtime.
- [ ] Server-rendered web runtime.
- [ ] Backend API runtime.
- [ ] Streaming gateway runtime.
- [ ] Durable agent runtime.
- [ ] Research worker runtime.
- [ ] Document/media worker runtime.
- [ ] Cloud code sandbox.
- [ ] Cloud browser runtime.
- [ ] Cloud virtual-computer runtime.
- [ ] Desktop renderer.
- [ ] Desktop privileged host process.
- [ ] Desktop local daemon.
- [ ] Local shell/PTY runtime.
- [ ] Local code sandbox.
- [ ] Local MCP process host.
- [ ] Local model runtime.
- [ ] CLI interactive runtime.
- [ ] CLI headless runtime.
- [ ] IDE extension-host runtime.
- [ ] IDE webview runtime.
- [ ] Browser-extension background runtime.
- [ ] Browser content-script runtime.
- [ ] Mobile JavaScript/native runtime where applicable.
- [ ] Native audio/camera modules.
- [ ] Remote-device relay.
- [ ] Scheduler.
- [ ] Connector synchronization workers.
- [ ] Indexing workers.
- [ ] Realtime audio session service.
- [ ] Interactive artifact sandbox.
- [ ] Generated-application hosting runtime.

## 103. Data and persistence categories

- [ ] Accounts and authentication identities.
- [ ] Sessions and devices.
- [ ] Organizations and workspaces.
- [ ] Memberships and roles.
- [ ] Preferences and policy versions.
- [ ] Conversations and turns.
- [ ] Message versions and branches.
- [ ] Execution attempts.
- [ ] Context manifests.
- [ ] Memory items and provenance.
- [ ] Projects and notes.
- [ ] Files and versions.
- [ ] Folders and Library entries.
- [ ] External resource references.
- [ ] Extracted source content.
- [ ] Search and vector indexes.
- [ ] Citations and source locators.
- [ ] Artifacts and revisions.
- [ ] Generated applications and deployments.
- [ ] Media jobs and assets.
- [ ] Agents and task plans.
- [ ] Tool invocations and receipts.
- [ ] Approval requests and decisions.
- [ ] Checkpoints.
- [ ] Coding sessions and repository bindings.
- [ ] Connectors and connected accounts.
- [ ] Encrypted credential references.
- [ ] Skills and Plugins.
- [ ] Schedules and trigger definitions.
- [ ] Notifications.
- [ ] Plans and subscriptions.
- [ ] Usage and credit ledger entries.
- [ ] Invoices and payment references.
- [ ] Audit events.
- [ ] Feedback and support cases.
- [ ] Retention/deletion records.
- [ ] Consent and policy acceptance.
- [ ] Published-content access rules.

## 104. Named technology options-not claims about competitor internals

| Component problem                 | Concrete option to evaluate                                                     | Boundary                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web application framework         | **React with Next.js**.                                                         | A possible implementation choice for routing, rendering, server/client boundaries, and web delivery. :chatgpt-content-reference{index="21"}            |
| Reusable web components           | **shadcn/ui** and its underlying component primitives.                          | A customizable component foundation, not evidence that all competitors use it. :chatgpt-content-reference{index="22"}                                  |
| Rich document editor              | **Tiptap**.                                                                     | An editor foundation that still requires product-specific persistence, collaboration, export, and permissions. :chatgpt-content-reference{index="23"}  |
| Server-state fetching and caching | **TanStack Query**.                                                             | Client-side asynchronous state management, not a replacement for authoritative backend state. :chatgpt-content-reference{index="24"}                   |
| Collaborative editing             | **Yjs**.                                                                        | Shared-data synchronization building blocks; product authorization and business conflict rules remain separate. :chatgpt-content-reference{index="25"} |
| Diagrams                          | **Mermaid**.                                                                    | Text-defined diagram rendering. :chatgpt-content-reference{index="26"}                                                                                 |
| Mathematical typesetting          | **KaTeX**.                                                                      | Rendering mathematical notation, not verifying mathematical correctness. :chatgpt-content-reference{index="27"}                                        |
| PDF viewing                       | **PDF.js**.                                                                     | PDF display and navigation, not an entire document-generation or redaction system. :chatgpt-content-reference{index="28"}                              |
| Browser/desktop terminal UI       | **xterm.js**.                                                                   | Terminal presentation; command execution belongs in a separate process/runtime. :chatgpt-content-reference{index="29"}                                 |
| Terminal application architecture | **Rust TUI/runtime separation**, or **TypeScript/React/Ink-style composition**. | Both have direct coding-agent precedents in the public repositories above. :chatgpt-content-reference{index="30"}                                      |
| Relational application storage    | **PostgreSQL**.                                                                 | A viable authoritative-data option; OpenAI’s deployment is evidence of usage, not a topology to copy wholesale. :chatgpt-content-reference{index="31"} |
| Embedded conversational apps      | **MCP server plus isolated UI bridge**.                                         | Separates tool execution, identity, and interactive presentation. :chatgpt-content-reference{index="32"}                                               |

Additional technology **decision slots** should remain explicit even before selecting vendors:

- [ ] Code editor engine.
- [ ] Syntax highlighter.
- [ ] Markdown parser and sanitizer.
- [ ] Charting engine.
- [ ] Spreadsheet grid engine.
- [ ] Presentation editor/renderer.
- [ ] Image editor/canvas engine.
- [ ] Video playback and editing engine.
- [ ] Native desktop shell.
- [ ] Native mobile implementation strategy.
- [ ] Local database.
- [ ] Object storage.
- [ ] Search engine.
- [ ] Vector index.
- [ ] Queue/job system.
- [ ] Durable workflow engine.
- [ ] Realtime transport.
- [ ] WebRTC/media infrastructure.
- [ ] Secrets/KMS provider.
- [ ] Authentication provider.
- [ ] Payment provider.
- [ ] Observability platform.
- [ ] Feature-flag system.
- [ ] Sandbox provider.
- [ ] Browser automation engine.
- [ ] Local inference engine.
- [ ] CI/build/signing pipeline.

---

# O. Additional ecosystem products that are easy to miss

## 105. Developer platform and console

- [ ] Developer organization/project creation.
- [ ] API-key management.
- [ ] Service-account management.
- [ ] Model catalog.
- [ ] API playground.
- [ ] Request builder.
- [ ] Streaming event inspector.
- [ ] Tool-call inspector.
- [ ] Structured-output schema editor.
- [ ] File upload and reuse.
- [ ] Retrieval collection manager.
- [ ] Prompt templates.
- [ ] Prompt versions.
- [ ] Evaluation datasets.
- [ ] Evaluation runs.
- [ ] Per-case evaluation results.
- [ ] Trace explorer.
- [ ] Usage and cost dashboards.
- [ ] Rate-limit inspection.
- [ ] Budget controls.
- [ ] Webhook configuration.
- [ ] Webhook event history.
- [ ] SDK documentation.
- [ ] API reference.
- [ ] Integration examples.
- [ ] Migration guides.
- [ ] Deprecation notices.
- [ ] Developer support.
- [ ] Custom app/Plugin testing.
- [ ] Publishing workflow.

## 106. Office, collaboration-channel, and email surfaces

- [ ] Assistant inside Word.
- [ ] Assistant inside Excel.
- [ ] Assistant inside PowerPoint.
- [ ] Assistant inside Outlook.
- [ ] Assistant inside Google Docs.
- [ ] Assistant inside Google Sheets.
- [ ] Assistant inside Google Slides.
- [ ] Host-document selection context.
- [ ] Native tracked edits.
- [ ] Protected-range awareness.
- [ ] Cross-document references.
- [ ] Shared conversation context across supported host applications.
- [ ] Slack direct-message assistant.
- [ ] Slack channel agent.
- [ ] Teams assistant.
- [ ] Mention-to-task handoff.
- [ ] Email-to-task address.
- [ ] Forward-email-to-agent workflow.
- [ ] Task replies within an email thread.
- [ ] Channel-based approvals.
- [ ] Agent identity distinct from a human account.
- [ ] Channel-specific permissions.
- [ ] Conversation-to-session mapping.
- [ ] Results mirrored into the main application.
- [ ] Native-host and standalone-app handoff.

The uploaded inventories distinguish Office add-ins, embedded external-document views, and generated downloadable files. Those are three different product implementations, even when all involve “working on a spreadsheet.” :chatgpt-content-reference{index="33"}

## 107. Discovery, social, and public-content products

- [ ] Personalized discovery feed.
- [ ] Topic-following controls.
- [ ] News/research collections.
- [ ] Curated public pages.
- [ ] Public artifact gallery.
- [ ] Public generated-app gallery.
- [ ] Public image/video gallery.
- [ ] Creator profiles.
- [ ] Follow creator.
- [ ] Favorite/save.
- [ ] Remix/fork.
- [ ] Prompt reuse.
- [ ] Attribution and source lineage.
- [ ] Public comments where offered.
- [ ] Content reporting.
- [ ] Block/mute controls.
- [ ] Feed-personalization controls.
- [ ] Sponsored-content labeling where applicable.
- [ ] Organic versus paid ranking separation.
- [ ] Publisher participation.
- [ ] Licensed-content access.
- [ ] Merchant or partner participation.
- [ ] Public-content moderation dashboard.

## 108. Specialist workspaces

These are separate product candidates, not automatic requirements for the core assistant.

- [ ] Personal-finance dashboard.
- [ ] Connected accounts.
- [ ] Spending analysis.
- [ ] Budget planning.
- [ ] Net-worth view.
- [ ] Financial-document explanation.
- [ ] Credit-report view.
- [ ] Credit-score history.
- [ ] Financial research workspace.
- [ ] Company research.
- [ ] Earnings and filing analysis.
- [ ] Health-record workspace.
- [ ] Health timeline.
- [ ] Lab-result explanation.
- [ ] Wearable-data summaries.
- [ ] Appointment preparation.
- [ ] Legal research workspace.
- [ ] Matter/document organization.
- [ ] Contract review.
- [ ] Scientific research workspace.
- [ ] Literature/source management.
- [ ] Reproducible research environments.
- [ ] Education/teacher workspace.
- [ ] Curriculum and lesson generation.
- [ ] Business operations workspace.
- [ ] Sales and CRM workflows.
- [ ] Customer-support workflows.
- [ ] HR and recruiting workflows.
- [ ] Marketing and campaign workflows.
- [ ] Engineering/CAD connector workflows.
- [ ] Shopping comparisons.
- [ ] Virtual try-on.
- [ ] Travel planning and reservations.
- [ ] Commerce checkout.
- [ ] Customer-service voice agents.

## 109. Optional native and ambient extensions

- [ ] Home-screen widgets.
- [ ] Lock-screen widgets.
- [ ] Menu-bar quick actions.
- [ ] Desktop companion.
- [ ] Compact floating assistant.
- [ ] Optional animated companion/pet.
- [ ] Global dictation.
- [ ] Selected-text rewrite shortcut.
- [ ] Screenshot-to-chat shortcut.
- [ ] Window-to-chat shortcut.
- [ ] Hardware shortcut/macropad integration.
- [ ] Wearable voice access.
- [ ] Headset/earbud invocation.
- [ ] Automotive voice surface.
- [ ] Telephone access.
- [ ] Messaging-platform access.
- [ ] Spatial/XR interface.
- [ ] Local-model download manager.
- [ ] Local-model storage manager.
- [ ] Local hardware-capability panel.
- [ ] Model loading/unloading controls.
- [ ] Local runtime health.
- [ ] Hybrid local/cloud task mode.
- [ ] Explicit cloud-escalation approval.
- [ ] Local resource/compute dashboard.

## 110. Cross-product experiences to include in the product map

- [ ] Chat → editable document.
- [ ] Document → presentation.
- [ ] Spreadsheet → chart → report.
- [ ] Research → report → audio overview.
- [ ] Research → interactive page.
- [ ] Image → edited image → video.
- [ ] Voice → durable work task.
- [ ] Voice → generated document.
- [ ] Browser page → Project source.
- [ ] Email thread → agent task.
- [ ] Team mention → coding session.
- [ ] Design → implementation.
- [ ] Repository → review deck.
- [ ] Completed task → reusable Skill.
- [ ] Completed task → scheduled routine.
- [ ] Custom assistant → Plugin migration.
- [ ] Shared artifact → viewer-authorized connected app.
- [ ] Web conversation → mobile continuation.
- [ ] CLI session → desktop continuation.
- [ ] Desktop session → IDE continuation.
- [ ] Mobile request → authorized local-host execution.
- [ ] Local work → explicit cloud handoff.
- [ ] Cloud result → local repository application.
- [ ] Existing notebook → main assistant context.
- [ ] Main conversation → persistent notebook sources.
- [ ] Usage exhaustion → alternative eligible path.
- [ ] Disconnected integration → reconnect and resume.
- [ ] Published output → versioned update.
- [ ] Public creation → private fork.
- [ ] Personal resource → explicitly shared workspace resource.

**The product inventory is the union of these experiences and components-not a claim that all five competitors ship every item, use the same packages, or expose the same capabilities on every platform. The implementation unit should be the concrete capability and its interface: for example, an artifact version selector, a connected-source picker, a voice-to-task handoff, or a reusable Plugin builder-not merely “artifacts,” “integrations,” or “agents.”**
