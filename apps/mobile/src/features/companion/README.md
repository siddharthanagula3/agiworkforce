# apps/mobile/src/features/companion

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile-to-desktop companion pairing, connection state, approval flow, agent dashboard, execution stream UI, and capability-boundary disclosures.

## Rules

- Import companion UI through `@/src/features/companion`.
- Pairing and realtime transport logic belongs in companion services/stores, not in UI-only components.
- Remote filesystem UI must not imply that pairing grants path access. Desktop remains authoritative
  for allowed directories until the signed companion contract supports bounded workspace handles.
- Approval UI shared across features should stay in `src/shared/components`.
