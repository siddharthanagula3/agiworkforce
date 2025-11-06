# AGI Workforce – Monorepo Overview

AGI Workforce is an autonomous desktop automation platform built on **Tauri 2.0, React 18, TypeScript, and a Rust command layer**. The goal is to ship a secure, low-latency assistant that can orchestrate Windows automation, browser control, API workflows, and marketplace extensions while routing intelligently across multiple LLMs (including local models such as **Ollama**) to minimize cost.

This repository currently contains:

- `apps/desktop` – Tauri + React desktop shell (primary focus)
- `apps/mobile` – React Native / Expo companion (scaffolded, incomplete)
- `apps/extension` – Browser extension bridge (prototype)
- `services/*` – Node-based API gateway, signaling server
- `packages/*` – Shared TypeScript utilities and types
- `infrastructure/` – Docker, deployment scripts
- `docs/` – Product, engineering, and security documentation

## Current Status (November 2025)

- `pnpm install` succeeds, but `pnpm typecheck` still fails with ~1,200 strict-mode errors across desktop, mobile, and services. Build health must be restored before shipping.
- Desktop shell wiring, chat surfaces, and MCP backends are in various stages of implementation; several UIs remain disconnected from the Rust command layer.
- Multi-provider routing scaffolding exists (`OpenAI`, `Anthropic`, `Google`, `Ollama`), yet configuration, API key management, and error handling require fixes before production use.
- Local LLM execution is planned via **Ollama** on Windows; desktop UI and settings must distinguish between token-based cloud providers and on-device models.
- Documentation was previously overly optimistic. Every major `.md` file is being refreshed to reflect real progress, gaps, and the path to outcompeting subscription-first rivals (e.g., Cursor Desktop).

### Priority Gaps

1. Restore TypeScript build health and ensure `pnpm lint`, `pnpm typecheck`, and Tauri builds pass in CI.
2. Finish MCP wiring (filesystem, automation, API, productivity) into the desktop UI with robust error surfaces.
3. Harden multi-LLM router: deterministic provider selection, cost tracking, fallback paths, and local-model routing policies.
4. Flesh out onboarding, secrets storage, and guardrails so the desktop agent can run unattended automation safely.
5. Implement token-pack billing and quotas to monetize premium LLM usage while keeping the local Ollama tier free.

## Getting Started

### Prerequisites

#### Windows (Primary Development Target)

- **Node.js 20.11.0+** (enforced via `.nvmrc` and `package.json` engines)
  - Download from [nodejs.org](https://nodejs.org/) or use [nvm-windows](https://github.com/coreybutler/nvm-windows)
  - Verify: `node --version` should output `v20.11.0` or higher
- **pnpm 8.15.0+** (enforced via `package.json`)
  - Install globally: `npm install -g pnpm@8.15.0`
  - Verify: `pnpm --version`
- **Rust 1.90.0** (enforced via `rust-toolchain.toml`)
  - Install via rustup: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - rustup will automatically use the version specified in `rust-toolchain.toml`
  - Verify: `rustc --version` should output `rustc 1.90.0`
- **Visual Studio Build Tools 2022** with "Desktop development with C++" workload
  - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)
  - Required for linking Rust binaries on Windows
- **WebView2 Runtime** (pre-installed on Windows 11)
  - Required for Tauri applications
  - Download manually if needed: [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- **Optional: Ollama for Windows** for local model experimentation
  - Download from [ollama.com](https://ollama.com/download)

#### macOS (Secondary Target)

- **Node.js 20.11.0+**
  - Install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 20.11.0 && nvm use 20.11.0`
- **pnpm 8.15.0+**
  - Install: `npm install -g pnpm@8.15.0`
- **Rust 1.90.0**
  - Install via rustup: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Xcode Command Line Tools**
  - Install: `xcode-select --install`
  - Required for building native dependencies

#### Linux (Tertiary Target - Ubuntu/Debian)

- **Node.js 20.11.0+**
  - Install via [nvm](https://github.com/nvm-sh/nvm) or package manager
- **pnpm 8.15.0+**
  - Install: `npm install -g pnpm@8.15.0`
- **Rust 1.90.0**
  - Install via rustup: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Required system libraries**:
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/agiworkforce.git
   cd agiworkforce
   ```

2. **Install Node.js 20.11.0**
   - Using nvm (recommended): `nvm use` (reads from `.nvmrc`)
   - Or manually install from [nodejs.org](https://nodejs.org/)

3. **Install pnpm**

   ```bash
   npm install -g pnpm@8.15.0
   ```

4. **Install Rust 1.90.0**

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

   rustup will automatically use the version specified in `rust-toolchain.toml`

5. **Install dependencies**

   ```bash
   pnpm install
   ```

6. **Verify setup**
   ```bash
   node --version    # Should output v20.11.0+
   pnpm --version    # Should output 8.15.0+
   rustc --version   # Should output rustc 1.90.0
   ```

### Development

```powershell
# Run desktop app in development mode (Vite + Tauri hot reload)
pnpm --filter @agiworkforce/desktop dev

# Lint all code
pnpm lint

# Type-check TypeScript (expect failures until strict-mode errors are cleared)
pnpm typecheck

# Format code with Prettier
pnpm format

# Run all tests
pnpm test

# Run desktop app tests with UI
pnpm --filter @agiworkforce/desktop test:ui

# Run desktop app tests with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

During development, track type errors in `typecheck.log` and ensure every package exports its own `tsconfig.json` with proper references. The repo uses `moduleResolution: "bundler"`; dependencies like `react`, `lucide-react`, and `@tauri-apps/api` must be resolved through local package manifests.

### Building

```powershell
# Build desktop app for production
pnpm --filter @agiworkforce/desktop build
```

Build artifacts are located in `apps/desktop/src-tauri/target/release/`

### Troubleshooting

#### Windows LNK1318 Error (PDB Limit Exceeded)

**Status:** Already fixed via `Cargo.toml` profile settings (`debug = 0`)

If you still encounter `LINK : fatal error LNK1318: Unexpected PDB error; LIMIT (12)`:

```powershell
cd apps/desktop/src-tauri
cargo clean
cd ../..
pnpm --filter @agiworkforce/desktop dev
```

The workspace root `Cargo.toml` already contains:

```toml
[profile.dev]
debug = 0
incremental = false
opt-level = 0
```

#### TypeScript Errors

Run `pnpm typecheck` to see all type errors. The codebase currently has ~1,200 strict-mode errors across desktop, mobile, and services that are being addressed.

```powershell
pnpm typecheck 2>&1 | Out-File -FilePath typecheck.log
```

#### Missing Dependencies

If you encounter module resolution errors:

```powershell
# Install dependencies at root
pnpm install

# Install service dependencies
cd services/api-gateway && pnpm install
cd ../signaling-server && pnpm install
cd ../update-server && pnpm install
```

#### Tauri Build Failures

- Ensure Rust toolchain is up to date: `rustup update`
- Verify WebView2 runtime is installed (pre-installed on Windows 11)
- Check Tauri prerequisites: [Tauri Prerequisites Guide](https://tauri.app/v1/guides/getting-started/prerequisites)

#### Module Resolution Errors

- The repo uses `moduleResolution: "bundler"`
- All imports must resolve through package manifests
- Use workspace protocol in `package.json`: `"@agiworkforce/types": "workspace:*"`
- Verify dependencies are listed in the package's `package.json`, not just root

### Running Local LLMs with Ollama

1. Install [Ollama for Windows](https://ollama.com/download).
2. Pull a supported model, e.g. `ollama pull llama3`.
3. Start the Ollama service (`ollama serve`).
4. Configure the desktop app (once settings UI is repaired) to mark Ollama as a zero-cost provider; API keys are not required but model availability should be enumerated at runtime.

## Multi-LLM Strategy

- **Cloud Providers:** OpenAI, Anthropic, and Google (Gemini) remain available for premium tiers. Token packs will mirror the Cursor model, allowing power users to pay only when they need frontier-quality completions.
- **Local Tier:** Ollama-backed models provide offline, cost-free completions for default workflows. The router must bias toward local inference unless quality thresholds dictate otherwise.
- **Observability:** All executions funnel into the cost dashboard and automation history tables. Instrumentation should capture provider latency, cost per task, and retry paths.
- **Security:** Rust commands enforce permission prompts, sandboxing, and structured logging to prevent prompt-injection takeover. See `SECURITY.md` for threat modeling status and TODOs.

## Key Documents

- Product Requirements: `AGI_Workforce_PRD_v4_0.md`
- Development Plan (market leadership revision): `AGI_Workforce_Complete_Development_Plan.md`
- Status & QA: `PROJECT_STATUS_SUMMARY.md`, `IMPLEMENTATION_AUDIT_REPORT.md`, `MILESTONE_EXECUTION_PLAN.md`
- Automation Architecture: `docs/SYSTEM_AUTOMATION_ARCHITECTURE.md`

All documentation is being actively reconciled with the codebase. When contributing, update the relevant `.md` file in the same pull request that changes functionality.

## Contributing Workflow

1. Create a feature branch.
2. Fix or implement functionality with accompanying tests.
3. Update documentation (README, status reports, runbooks) to reflect the change.
4. Run lint, typecheck, and unit tests; attach logs to PRs until CI is re-enabled.
5. Request review; ensure security-sensitive changes include threat model notes.

The mission is to deliver a desktop agent that **outperforms market leaders on speed, cost, and security**. Reaching that bar requires disciplined engineering, truthful status reporting, and relentless focus on automation quality.
