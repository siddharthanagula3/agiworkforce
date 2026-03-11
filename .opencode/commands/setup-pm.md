---
description: Configure package manager preference
agent: build
---

# Setup Package Manager Command

Configure your preferred package manager: $ARGUMENTS

## AGI Workforce Standard

This project uses **pnpm** as the standard package manager. The monorepo is configured with pnpm workspaces.

## Package Manager: pnpm

```bash
# Install dependencies
pnpm install

# Run workspace command
pnpm --filter apps/desktop dev

# Add dependency to workspace
pnpm --filter apps/desktop add package-name

# Run script in workspace
cd apps/desktop && pnpm test
```

## Lock File

The lock file is `pnpm-lock.yaml`. Do NOT use npm or yarn in this project.

## Verification

```bash
pnpm --version  # Should be >= 9.15.0
node --version   # Should be v22.x
```

---

**TIP**: For consistency, always use `pnpm` commands. The CI pipeline enforces pnpm.
