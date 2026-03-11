---
description: Update codemaps for codebase navigation
agent: doc-updater
subtask: true
---

# Update Codemaps Command

Update codemaps to reflect current codebase structure: $ARGUMENTS

## Your Task

Generate or update codemaps for the AGI Workforce monorepo:

1. **Analyze codebase structure** across all workspaces
2. **Generate component maps**
3. **Document relationships** (Rust backend <-> TS frontend IPC)
4. **Update navigation guides**

## Codemap Areas

### Desktop App
- `apps/desktop/src-tauri/src/` - Rust backend modules
- `apps/desktop/src/` - React/TS frontend
- IPC boundary: Tauri commands + event channels

### Web App
- `apps/web/app/` - Next.js App Router pages and API routes
- `apps/web/features/` - Feature modules
- `apps/web/lib/` - Shared libraries

### Mobile App
- `apps/mobile/` - React Native + Expo

### Services
- `services/api-gateway/` - Express API
- `services/signaling-server/` - WebSocket signaling

## Codemap Format

### [Module Name]

**Purpose**: [Brief description]
**Location**: `path/`
**Key Files**:
- `file1.ts` - [purpose]
- `file2.rs` - [purpose]

**Dependencies**: [Module A], [Module B]

---

**TIP**: Keep codemaps updated when adding new modules or significant refactoring.
