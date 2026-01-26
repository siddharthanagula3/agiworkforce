# Deployment Documentation

Build and deployment guides for AGI Workforce.

## Documents

| Document                                              | Description                                       |
| ----------------------------------------------------- | ------------------------------------------------- |
| [Desktop Builds](desktop-builds.md)                   | Platform-specific installers (DMG, EXE, AppImage) |
| [Web Deployment](web-deployment.md)                   | Vercel deployment guide                           |
| [Production Verification](production-verification.md) | Production readiness checklist                    |

## Quick Commands

```bash
# Build Desktop
pnpm build:desktop   # Creates platform installer

# Build Web
pnpm --filter @agiworkforce/web build
```

## Deployment Targets

| Platform          | Technology | Target        |
| ----------------- | ---------- | ------------- |
| Desktop (macOS)   | Tauri      | DMG installer |
| Desktop (Windows) | Tauri      | EXE installer |
| Desktop (Linux)   | Tauri      | AppImage      |
| Web               | Next.js    | Vercel        |

## See Also

- [CLAUDE.md Deployment Section](../../CLAUDE.md)
