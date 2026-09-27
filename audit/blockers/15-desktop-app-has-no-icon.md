# The desktop app ships without an icon

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`apps/desktop/electron-builder.yml:18` points build resources at `electron/build`, which holds no app icon. Installers fall back to the default Electron icon. Only the tray icon ships.
