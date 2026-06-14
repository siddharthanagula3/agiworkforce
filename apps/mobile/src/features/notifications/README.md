# Mobile Notifications

Status: Current
Owner: Mobile lead

Purpose: Shared helpers for visible Mobile notification-center UI.

Rules:

- Keep formatting deterministic and safe for malformed local or push payloads.
- Do not add Cloud routing, notification permissions, or delivery side effects here.
- User-visible notification copy must fail closed and remain readable in Local Mode.
