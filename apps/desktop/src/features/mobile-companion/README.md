# apps/desktop/src/features/mobile-companion

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-21
Purpose: Desktop companion pairing, QR setup, and mobile remote approval UI.

## Rules

- Keep mobile-companion presentation here.
- Pairing protocol and native transport code belongs in services, stores, or Tauri integration boundaries.
- Do not silently enable cloud sync from this feature; mobile handoff must preserve explicit privacy labels.
