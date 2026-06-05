# Mobile UI Reference Audit - 2026-06-05

Status: Implemented, verification in progress
Owner: Mobile UI implementation

Purpose: track reference-backed Mobile UI work so the demo UI is based on current AGI code and visible references, not stale docs or memory.

## Reference Inventory

| Reference set           |     Count | Path                                                 | Primary use                                                                         |
| ----------------------- | --------: | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ChatGPT mobile main     |        15 | `/Users/siddhartha/Desktop/chatgpt mobile reference` | Neutral chat surface, drawer, search, settings overview shape                       |
| ChatGPT inside settings |        37 | `/Users/siddhartha/Desktop/chatgpt inside settings`  | Settings subpage grouping, light/dark row treatment, data and personalization flows |
| Claude mobile           |        30 | `/Users/siddhartha/Desktop/claude_mobile_images`     | Capabilities, connectors, permissions, artifacts gallery, settings grouping         |
| Perplexity mobile       |        32 | `/Users/siddhartha/Desktop/perplexity_mobile_images` | Model picker, options bottom sheet, account/settings grouping                       |
| Claude local reference  | On demand | `/Users/siddhartha/Desktop/claude_reference`         | Tool-use timeline, compact status rows, expandable request/response detail          |
| Local agent references  | On demand | `/Users/siddhartha/Desktop/reference`                | Codex/OpenAI/Gemini/opencode/Hermes parity checks where relevant                    |

## Locked Product Decisions

- Mobile is not a company-level local-only product. Local is the current demo-ready entry path.
- Cloud features are visible but invite/waitlist gated until unlock state and backend controls are proven.
- Mobile exposes no BYOK UI or selectable BYOK flow in this wave.
- Generic open-library icons are allowed. Proprietary screenshots, logos, copy, and assets are not copied into AGI.
- AGI-owned labels are used throughout visible UI.

## Surface Mapping

| AGI surface       | Reference influence               | Implementation target                                                                   | Status      |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------- | ----------- |
| Theme/tokens      | ChatGPT neutral light/dark        | Central Mobile palette, default `system`, reduced teal on touched screens               | Implemented |
| Drawer/sidebar    | ChatGPT drawer                    | AGI header, search/profile/new chat, Projects, Artifacts, AGI Agent cloud gate, Recents | Implemented |
| Settings overview | ChatGPT settings, Claude settings | Profile top row, local/demo rows, cloud/invite rows, support rows                       | Implemented |
| Model picker      | Perplexity picker                 | Bottom sheet, Best row, local model rows, locked cloud rows                             | Implemented |
| Tool usage UI     | Claude tool timeline references   | Compact rail, status nodes, tool icons, expandable details                              | Implemented |
| Artifacts         | Claude mobile artifacts           | Keep route visible only with real/polished gallery or empty state                       | In progress |

## Verification Ledger

| Check                         | Expected result                                                                    | Status                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mobile visible BYOK copy scan | No Mobile-facing BYOK copy in drawer/settings/model picker/capabilities/onboarding | Passed by source scan and tests                                                   |
| Default theme check           | New users default to `system`                                                      | Passed by store/theme tests                                                       |
| Cloud gate check              | AGI Agent and cloud settings rows open invite/waitlist when locked                 | Passed by drawer/settings tests                                                   |
| Model picker selection check  | Locked cloud models cannot be selected                                             | Passed by model-picker tests                                                      |
| Tool detail check             | Tool command/request/response/error details remain available                       | Passed by typecheck and component inspection                                      |
| Light/dark readability        | Drawer, settings, model picker, chat tools readable in both themes                 | Partially verified by code and snapshots; simulator visual pass still recommended |
