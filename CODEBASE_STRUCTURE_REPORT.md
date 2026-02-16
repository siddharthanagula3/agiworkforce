# AGI Workforce Codebase Structure Report

## Executive Summary

AGI Workforce is a sophisticated monorepo project combining TypeScript/React frontend applications with a Rust-based backend powered by Tauri. The project uses pnpm for workspace management and Cargo for Rust compilation, implementing a hybrid technology stack designed for cross-platform desktop and web applications with local automation and AI capabilities.

---

## 1. Project Overview

**Project Name:** agiworkforce  
**Version:** 0.1.1  
**Type:** Monorepo (Multi-workspace)  
**License:** MIT  
**Package Manager:** pnpm 9.15.3+  
**Node Version:** >=22.12.0  
**Build Framework:** Tauri 2.x + Vite + Rust Workspace

---

## 2. High-Level Architecture

The project follows a monorepo architecture with clear separation of concerns:

```
agiworkforce/
├── apps/                    # Frontend applications
│   ├── desktop/             # Main Tauri desktop app
│   ├── web/                 # Web application
│   └── extension/           # Browser extension
├── packages/                # Shared TypeScript packages
│   ├── types/               # Shared type definitions
│   └── utils/               # Shared utility functions
├── services/                # Backend services
│   ├── api-gateway/         # API Gateway service
│   └── signaling-server/    # WebRTC signaling server
├── Cargo.toml              # Rust workspace root
├── package.json            # Node.js workspace root
└── pnpm-workspace.yaml     # pnpm workspace configuration
```

---

## 3. Build System Architecture

### 3.1 TypeScript/JavaScript Build System (pnpm)

**Workspace Configuration:** `pnpm-workspace.yaml`

The monorepo includes four workspaces managed by pnpm:
- `apps/*` - Frontend applications
- `packages/*` - Shared TypeScript packages
- `services/*` - Backend Node.js services
- `tools/*` - Utility tools (if present)

**Key pnpm Scripts (Root package.json):**
- `pnpm build:all` - Builds all packages except desktop
- `pnpm build:desktop` - Builds the desktop application with Tauri
- `pnpm dev:desktop` - Starts development server for desktop app
- `pnpm lint` - Lints TypeScript/JavaScript code
- `pnpm typecheck` - Type checks desktop app
- `pnpm test` - Runs tests across all packages

**Package Manager Constraints:**
- Strict pnpm version requirement (9.15.3+)
- Node version requirement (22.12.0+)
- Overrides for baseline-browser-mapping, lodash-es, and diff packages

### 3.2 Rust/Cargo Build System

**Workspace Configuration:** `Cargo.toml` (root)

The Rust workspace contains a single member:
- `apps/desktop/src-tauri` - Tauri backend for desktop application

**Cargo Profile Optimization:**
- **Release Profile:** Aggressive optimization with LTO, single codegen unit, size optimization, and symbol stripping
- **Dev Profile:** Debug symbols disabled for reduced size

### 3.3 Build Orchestration

The desktop application uses a two-stage build process:
1. **Frontend Build:** `vite build` - Compiles React frontend
2. **Tauri Build:** `tauri build` - Packages frontend with Tauri/Rust backend

---

## 4. Detailed Directory Structure

### 4.1 `/apps` Directory

#### `/apps/desktop` - Main Tauri Desktop Application
**Size:** ~29 subdirectories  
**Key Components:**

**Frontend (TypeScript/React):**
- `src/` - React application source code
  - `components/` (71 subdirectories) - React component library
  - `hooks/` (45 subdirectories) - Custom React hooks
  - `stores/` (46 subdirectories) - Zustand state management
  - `services/` (18 subdirectories) - API and integration services
  - `lib/` (20 subdirectories) - Utility libraries and helpers
  - `api/` (27 subdirectories) - Backend API client definitions
  - `types/` (31 subdirectories) - TypeScript type definitions
  - `utils/` (22 subdirectories) - Utility functions
  - `__tests__/` (17 subdirectories) - Unit test suites
  - `App.tsx` - Root React component
  - `main.tsx` - Application entry point

**Backend (Rust/Tauri):**
- `src-tauri/` - Tauri desktop shell and Rust backend
  - `src/` - Rust source code
    - `automation/` (19 subdirs) - Automation engine
    - `core/` (19 subdirs) - Core functionality
    - `data/` (11 subdirs) - Data layer and database
    - `features/` (20 subdirs) - Feature implementations
    - `integrations/` (8 subdirs) - Third-party integrations
    - `sys/` (17 subdirs) - System-level operations
    - `ui/` (9 subdirs) - UI communication layer
    - `models/` - Data models
    - `bin/` - Binary entry points
    - `lib.rs` - Library root (~100KB main library file)
    - `main.rs` - Application entry point
    - `state.rs` - Application state management
  - `mcp/` - MCP (Model Context Protocol) support
  - `migrations/` - Database migrations
  - `Cargo.toml` - Rust dependencies (~281 lines, 100+ dependencies)
  - `tauri.conf.json` - Tauri configuration
  - `capabilities/` - Tauri capability definitions

**Configuration & Testing:**
- `vite.config.ts` - Vite build configuration
- `tsconfig.json` - TypeScript configuration
- `playwright.config.ts` - E2E testing configuration
- `e2e/` (24 subdirs) - Playwright end-to-end tests
- `playwright/` - Playwright test utilities
- `.env.local` - Environment variables

**Documentation:**
- `README.md` - Application documentation
- `COMPONENT_DOCUMENTATION.md` - Component guide
- `UI_COMPONENTS.md` - UI component reference
- `MEMORY_INTEGRATION_GUIDE.md` - Memory integration documentation
- `TIMEOUT_UI_INTEGRATION.md` - Timeout UI integration guide
- `DEVELOPER_GUIDE.md` - Developer reference (Tauri backend)

#### `/apps/web` - Web Application
**Size:** 38 subdirectories  
**Purpose:** Web-based version of the AGI Workforce platform

#### `/apps/extension` - Browser Extension
**Size:** 23 subdirectories  
**Purpose:** Browser extension for AGI Workforce integration

---

### 4.2 `/packages` Directory

#### `/packages/types`
**Purpose:** Shared TypeScript type definitions across the monorepo
- `package.json` - Package metadata
- `tsconfig.json` - TypeScript configuration

#### `/packages/utils`
**Purpose:** Shared utility functions and helpers
- `package.json` - Package metadata
- `tsconfig.json` - TypeScript configuration

---

### 4.3 `/services` Directory

#### `/services/api-gateway`
**Purpose:** API Gateway service for centralized request handling
- `package.json` - Node.js service configuration
- `tsconfig.json` - TypeScript configuration

#### `/services/signaling-server`
**Purpose:** WebRTC signaling server for real-time communication
- `package.json` - Node.js service configuration
- `tsconfig.json` - TypeScript configuration

---

### 4.4 Root Configuration Files

| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust workspace configuration with release/dev profiles |
| `Cargo.lock` | Rust dependency lock file (315KB) |
| `package.json` | Node.js root workspace, scripts, dev tools |
| `pnpm-workspace.yaml` | pnpm monorepo configuration |
| `.eslintrc.cjs` | ESLint configuration for code quality |
| `.prettierrc.json` | Code formatter configuration |
| `tsconfig.json` | Global TypeScript settings |
| `.gitignore` | Git ignore rules |
| `.npmrc` | npm registry configuration |

---

## 5. Build System Details

### 5.1 TypeScript Build Chain

**Tools & Configuration:**
- **Build Tool:** Vite 7.3.1
- **React:** 19.2.4
- **TypeScript:** 5.9.3
- **Tailwind CSS:** 4.1.18 (with Vite plugin)
- **CSS:** PostCSS 8.5.6

**Build Scripts:**
```bash
# Development
pnpm dev:desktop          # Starts hot-reload dev server

# Production
pnpm build:desktop        # Vite build + Tauri build
vite build               # Frontend only
tauri build              # Full desktop app
```

**Testing Framework:**
- Vitest 4.0.18 - Unit testing
- Playwright 1.58.0 - E2E testing
- Testing Library - React component testing

---

### 5.2 Rust Build Chain

**Tools & Configuration:**
- **Edition:** 2021
- **Profiles:**
  - Release: LTO enabled, optimized for size (opt-level = z)
  - Dev: Minimal debug info, incremental disabled

**Key Rust Dependencies (100+ total):**

**Core Frameworks:**
- Tauri 2.9.3 (with tray-icon, devtools, test features)
- Tauri plugins: fs, dialog, shell, process, updater, clipboard, window-state, global-shortcut, notification

**Async Runtime:**
- Tokio 1.37 (with full features)
- Futures 0.3, async-trait 0.1

**Data Handling:**
- Serde 1.0, Bincode 1.3, JSON serialization

**Database:**
- Rusqlite 0.31 (SQLite with bundled driver)
- Tokio-Rusqlite 0.5 (async SQLite)
- Tokio-Postgres 0.7 (PostgreSQL)
- MySQL_async 0.34 (MySQL)
- MongoDB 3.5 (MongoDB driver)
- Redis 0.32.7 (Redis client with async support)

**HTTP & Networking:**
- Reqwest 0.12 (HTTP client)
- Tungstenite 0.21 (WebSocket)
- Tokio-tungstenite 0.21 (Async WebSocket)
- WebRTC 0.14 (optional, for peer-to-peer)

**Security & Cryptography:**
- Keyring 3 (OS-level credential storage)
- Argon2, PBKDF2, AES-GCM (encryption)
- Ed25519-Dalek (digital signatures)
- Sha2, HMAC, Base64

**System Integration:**
- Enigo 0.6 (keyboard/mouse automation)
- Xcap 0.0.12 (screenshot capture)
- Arboard 3.4 (clipboard)
- Portable-pty 0.8 (terminal emulation)
- Windows crate (Windows-specific APIs)

**Audio & Speech:**
- Cpal 0.15 (audio capture)
- Webrtc-vad 0.4 (optional, voice activity detection)
- Whisper-rs 0.11 (optional, local speech-to-text)

**Document Processing:**
- PDF-extract 0.10 (PDF extraction)
- Calamine 0.21 (Excel reading)
- Docx-rs 0.4 (Word document generation)
- Rust_xlsxwriter 0.77 (Excel writing)
- Printpdf 0.7 (PDF writing)

**Machine Learning:**
- Tiktoken-rs 0.9.1 (tokenization)
- Llama-cpp-2 (optional, local LLM support)

**Logging & Diagnostics:**
- Tracing 0.1, Tracing-subscriber 0.3
- Sentry 0.33 (optional, error tracking)

**Optional Features:**
- `shell` - Shell command execution (disabled in App Store builds)
- `updater` - Application updates (disabled in App Store)
- `ocr` - Optical character recognition (requires Tesseract)
- `local-llm` - Local LLM support
- `webrtc-support` - WebRTC peer-to-peer
- `vad` - Voice activity detection
- `local-whisper` - Offline speech-to-text
- `pdf-extract` - PDF extraction
- `appstore` - App Store compatibility mode

---

### 5.3 Frontend Dependencies (Key Packages)

**UI Framework:**
- React 19.2.4 with React Router 7.13.0
- Framer Motion 12.29.2 (animations)
- Radix UI (comprehensive component primitives)

**Styling:**
- Tailwind CSS 4.1.18
- Tailwind-merge 3.4.0
- Class-variance-authority 0.7.1

**Code Editors & Preview:**
- Monaco Editor 0.55.1 with React integration
- React Syntax Highlighter 16.1.0

**Data Visualization:**
- Recharts 3.7.0
- Mermaid 11.12.2

**Terminal & CLI:**
- xterm 6.0.0 with addons (fit, search, webgl)
- Ansi-to-react 6.2.6

**Content Processing:**
- React-markdown 10.1.0
- KaTeX 0.16.28 (math rendering)
- Rehype plugins (syntax highlighting, math)
- DOMPurify 3.3.1 (XSS protection)

**State Management:**
- Zustand 5.0.10
- Immer 11.1.3

**Utilities:**
- Date-fns 4.1.0
- UUID 13.0.0
- Zod 4.3.6 (schema validation)
- Fuse.js 7.1.0 (fuzzy search)

**Integration:**
- Supabase JS 2.93.3
- Sentry React 10.38.0

---

## 6. Development Tools & Infrastructure

### 6.1 Linting & Formatting
- ESLint 9.39.2
- Prettier 3.8.1
- Husky 9.1.7 (Git hooks)
- Lint-staged 16.2.7 (staged file linting)
- TypeScript ESLint plugins

### 6.2 Version Control & CI/CD
- Git-based workflow
- GitHub Actions (`.github/` directory)
- Husky pre-commit hooks
- Commitlint (conventional commits)

### 6.3 Deployment & Hosting
- Vercel configuration (`.vercel/`)
- Playwright MCP integration (`.playwright-mcp/`)

### 6.4 Documentation & Development
- `/docs/` directory (18 subdirectories) - Project documentation
- `/examples/` directory - Example code
- `/scripts/` directory (9 subdirectories) - Development scripts
- `/dev-scripts/` directory - Development utilities
- `/audit/` directory (6 subdirs) - Code audit reports

---

## 7. Key Build Commands

### Development
```bash
# Start desktop dev server with hot reload
pnpm dev:desktop

# Type checking
pnpm typecheck
pnpm typecheck:all

# Linting and formatting
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

### Production Builds
```bash
# Build all packages except desktop
pnpm build:all

# Build desktop app (Vite + Tauri)
pnpm build:desktop

# Build docs
pnpm build:docs
```

### Testing
```bash
# Unit tests
pnpm test
pnpm --filter @agiworkforce/desktop test
pnpm --filter @agiworkforce/desktop test:coverage

# E2E tests
pnpm --filter @agiworkforce/desktop test:e2e
pnpm --filter @agiworkforce/desktop test:smoke

# Smoke tests
pnpm --filter @agiworkforce/desktop test:smoke
```

### Maintenance
```bash
# Clean builds and dependencies
pnpm clean
pnpm clean:build

# Full workspace cleanup
pnpm -r exec rm -rf dist node_modules && rm -rf node_modules
```

---

## 8. Technology Stack Summary

| Layer | Technologies |
|-------|--------------|
| **Desktop Frontend** | React 19, TypeScript 5.9, Tailwind CSS 4, Vite 7 |
| **Desktop Backend** | Rust, Tauri 2, Tokio async runtime |
| **Web Frontend** | React, TypeScript, Vite |
| **Browser Extension** | TypeScript, extension APIs |
| **Shared Packages** | TypeScript, pnpm workspaces |
| **Backend Services** | Node.js, TypeScript |
| **Database** | SQLite, PostgreSQL, MySQL, MongoDB, Redis |
| **Package Manager** | pnpm 9.15.3+ |
| **Build Tools** | Vite, Cargo, Tauri CLI |
| **Testing** | Vitest, Playwright, Testing Library |
| **Code Quality** | ESLint, Prettier, TypeScript, Husky |

---

## 9. Notable Features & Capabilities

### Desktop Application Features
- **Cross-Platform:** Tauri enables Windows, macOS, and Linux support
- **Automation:** Extensive automation engine with system integration
- **Local AI:** Optional LLM support via llama-cpp-2
- **Speech Processing:** Local speech-to-text with Whisper.cpp (offline)
- **OCR:** Optical character recognition support
- **Document Processing:** PDF, Excel, Word document handling
- **Terminal Integration:** Full terminal emulation with xterm
- **Real-time Communication:** WebRTC support for peer-to-peer
- **Database Support:** Multiple database backends
- **System Integration:** Keyboard/mouse automation, clipboard, screenshots
- **Code Editing:** Monaco editor integration
- **Visualization:** Mermaid diagrams, recharts data visualization
- **Security:** Credential storage, encryption, signature verification

### App Store Build Variant
- Special configuration for App Store compatibility
- Shell execution disabled (sandboxing)
- Auto-updater disabled (App Store handles updates)

---

## 10. Project Size and Complexity

| Metric | Count |
|--------|-------|
| Main apps | 3 (desktop, web, extension) |
| Shared packages | 2 (types, utils) |
| Backend services | 2 (api-gateway, signaling-server) |
| Rust dependencies | 100+ |
| Frontend dependencies | 50+ |
| Desktop src directories | 22 |
| Tauri src directories | 14 |
| Desktop components | 71 |
| Desktop hooks | 45 |
| Desktop stores | 46 |
| E2E test suites | 24 |
| Documentation files | Multiple comprehensive guides |

---

## 11. Build Configuration Highlights

### Rust Compilation
- **LTO Enabled** in release builds for optimal binary size
- **Single codegen unit** for better optimization
- **Symbol stripping** to reduce binary footprint
- **Panic abort** for smaller binaries
- **Dev mode optimizations** with disabled incremental compilation

### Frontend Compilation
- **Vite** for fast development and optimized production builds
- **Tailwind CSS** with Vite integration for JIT compilation
- **React Fast Refresh** for instant hot module replacement
- **SWC** option for faster TypeScript transpilation

### Monorepo Optimization
- **pnpm** for disk space efficiency (shared node_modules)
- **Workspace filters** for selective builds
- **Shared dependencies** across apps via @agiworkforce namespace

---

## Conclusion

AGI Workforce is a sophisticated, full-stack monorepo combining modern TypeScript/React frontend development with powerful Rust backend capabilities through Tauri. The dual build system (pnpm for JavaScript, Cargo for Rust) enables seamless integration of high-performance system-level operations with a responsive React UI. The architecture supports multiple deployment targets (desktop, web, browser extension) while maintaining code sharing through workspace packages.
