# Changelog

All notable changes to AGI Workforce are documented in this file.

## [Unreleased] - 2025-11-06

### Phase 1-8: Comprehensive Remediation Complete

**Summary:** Reduced ~1,200 TypeScript errors to zero, eliminated 133 Rust clippy warnings, established production-ready CI/CD pipelines, and achieved 100% test pass rate for TypeScript tests.

### Added

**Phase 1: Critical Fixes**

- Fixed critical Rust UB in screen capture (RGBQUAD initialization)
- Created missing tsconfig.json files for packages/types and packages/utils
- Installed missing API gateway dependencies

**Phase 2: Version Pinning**

- .nvmrc (Node 20.11.0), .npmrc (engine-strict), rust-toolchain.toml (1.90.0)
- engines field in package.json (Node >=20.11.0 <23, pnpm >=8.15.0)

**Phase 6: Testing Infrastructure**

- Playwright E2E config and smoke tests
- Test coverage baseline (11.47% statement coverage)
- Test scripts: test:e2e, test:e2e:ui, test:smoke, test:coverage

**Phase 7: CI/CD Pipelines**

- Enhanced ci.yml with Rust checks and concurrency control
- Created build-desktop.yml for multi-platform Tauri builds
- Created test.yml with 4 parallel jobs (TypeScript, Rust, Coverage, E2E)
- Added CI status badges to README

**Phase 8: Developer Experience**

- pre-push hook with typecheck and cargo fmt --check
- VSCode settings.json and extensions.json
- apps/desktop/.env.example with environment templates

### Changed

**Phase 3: Dependencies**

- Node engine constraint: <21 → <23 (supports v22.x)

**Phase 4: TypeScript**

- exactOptionalPropertyTypes: true → false (Zustand compatibility)
- All code formatted with Prettier

**Phase 5: Rust**

- Fixed 133 clippy warnings (redundant closures, manual APIs, type conversions)
- Created Tauri 2.0 capabilities file (80+ permissions)

### Fixed

- TypeScript errors: ~1,200 → 0
- Rust clippy warnings: 133 → 0
- TypeScript test failures: 3 tests in codeStore.test.ts
- Rust test compilation errors in automation/input/tests.rs
- Husky v10 deprecation warnings

### Security

- Tauri 2.0 IPC permissions for 217 registered commands
- CI permissions blocks (contents: read)
- Frozen lockfiles enforced

## Statistics

| Metric               | Before     | After           |
| -------------------- | ---------- | --------------- |
| TypeScript Errors    | ~1,200     | 0               |
| Rust Clippy Warnings | 133        | 0               |
| TypeScript Tests     | Unknown    | 73/73 passing   |
| Rust Tests           | Unknown    | 232/241 passing |
| CI Pipeline          | Incomplete | Complete        |
| Test Coverage        | None       | 11.47% baseline |

## Performance

- CI time: 3-5 min (cached), 8-12 min (first run)
- Full build: 10-15 min (cached), 18-25 min (first run)
- Cache hit ratio: 80-90% expected
