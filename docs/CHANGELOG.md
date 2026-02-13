# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-01-28

### Security

- Fixed XSS vulnerability in HTML preview iframe (removed allow-same-origin)
- Updated Next.js from 16.1.1 to 16.1.6 (CVE-2026-23864, CVE-2025-59471, CVE-2025-59472)
- Added DOMPurify sanitization to LivePreview component

### Added

- Comprehensive test infrastructure for API Gateway service
  - Auth route tests with JWT validation
  - Middleware tests (authentication, rate limiting)
  - Health endpoint tests
  - Integration test examples
- Comprehensive test infrastructure for Signaling Server service
  - WebSocket message validation tests
  - Connection manager tests
  - HTTP endpoint tests (pairings, health, ready, live)

### Documentation

- Added comprehensive codebase audit report (docs/AUDIT_REPORT_2026-01-28.md)
  - Security findings and fixes
  - Architecture review results
  - Performance optimization recommendations
  - Technical debt migration guides

### Release

- Coordinated monorepo version bump for release readiness:
  - `@agiworkforce/desktop` → `1.1.2`
  - `@agiworkforce/web` → `0.1.1`
  - `@agiworkforce/types` → `0.0.1`
- Synchronized Tauri bundle versions:
  - `apps/desktop/src-tauri/tauri.conf.json` → `1.1.2`
  - `apps/desktop/src-tauri/tauri.appstore.conf.json` → `1.1.2`
- Aligned updater documentation with active production config:
  - Endpoint template: `https://agiworkforce.com/api/releases/{{target}}/{{current_version}}`
  - Public key fingerprint: `418034B749732381`
