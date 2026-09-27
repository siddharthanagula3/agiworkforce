# Contrast failures (accessibility)

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

- **Web and desktop.** Legacy `--success`/`--warning` tokens still colour 12px text at about 2.0:1 in light mode (`packages/ui/design-tokens/src/foundation.css:160-166`, e.g. the project capacity banner at `apps/web/app/chat/projects/[id]/page.tsx:1020-1026`). FormField success text is 3.1:1 (`packages/ui/ui/src/primitives/FormField.tsx:169`).
- **Chrome.** One accent value serves as fill and text: links and inline code measure 2.95:1, and white on the primary button 3.11:1 (`packages/ui/design-tokens/src/index.ts:490`, `apps/extension/src/side_panel.ts:1470`). The composer placeholder is 4.28:1.
- **Mobile.**
  - White on the Green accent is 4.05:1 (`apps/mobile/src/ui/theme/tokens.ts:223`).
  - Agent success and warning text is about 3.2:1, and destructive text 3.87-4.13:1.
  - The mobile palette isn't covered by the contrast test, despite the test's description.
- **CLI.** Syntax highlighting ignores `NO_COLOR` and measures 1.7:1 in the light theme.
