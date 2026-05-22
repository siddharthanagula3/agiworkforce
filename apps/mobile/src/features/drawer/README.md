# apps/mobile/src/features/drawer

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile app drawer composition, navigation shortcuts, and drawer-adjacent account/status UI.

## Rules

- Import drawer UI through `@/src/features/drawer`.
- Drawer content may compose other feature domains but must not own their business state.
- Keep navigation labels and route wiring close to the drawer component.
