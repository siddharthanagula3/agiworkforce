# Desktop Tool Calling Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own shared Desktop tool-call/result presentation, approval dialogs, tool execution timelines, and typed result visualizers used by chat and execution surfaces.

## Boundaries

- Keep tool-call/result UI in this folder.
- Keep generic file download/upload primitives in `apps/desktop/src/components/FileUpload` until that domain is migrated.
- Keep tool-calling data contracts in `apps/desktop/src/types` until promoted to a shared package.
