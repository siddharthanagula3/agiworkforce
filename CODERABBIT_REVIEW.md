# CodeRabbit CLI Review — Fix Log

Generated: 2026-02-24
Source: `coderabbit review --plain`

All 9 findings fixed. Tests: PASS (820/821). Lint: PASS (3 pre-existing warnings). Type-check: PASS.

---

## Fixed Issues

| #   | File                                                                    | Finding                                                                                            | Fix Applied                                                                                                                                                 |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | `apps/web/__tests__/api/checkout.test.ts:105`                           | Dynamic import uses relative path instead of `@/` alias                                            | Changed to `import('@/services/supabase-server')`                                                                                                           |
| 2   | `apps/web/app/api/credit-topup/route.ts:87`                             | Non-null assertion `user.email!` — may be undefined for SSO/phone/anon auth                        | Added explicit guard: throw validation error if no email                                                                                                    |
| 3   | `apps/desktop/src-tauri/tauri.appstore.conf.json:36`                    | `img-src https:` too broad in CSP                                                                  | Replaced with specific allowlist: `'self' data: blob: https://api.agiworkforce.com https://agiworkforce.com https://*.supabase.co https://*.googleapis.com` |
| 4   | `packages/utils/src/validation.ts:140`                                  | Case-sensitive `path === blocked` check for Unix paths                                             | Changed to `path.toLowerCase() === blocked.toLowerCase()`                                                                                                   |
| 5   | `packages/utils/src/validation.ts:311`                                  | Incomplete shell metacharacter denylist (missing `!~\{}*?[]`)                                      | Extended regex to `/[                                                                                                                                       | &;<>\`$()\n\r!~\\{}\*?[\]]/g` |
| 6   | `apps/web/lib/cors.ts:79`                                               | `tauriSchemePattern` allows dots — `tauri://evil.example.com` passes                               | Removed `.` from character class: `/^tauri:\/\/[a-zA-Z0-9_-]+$/`                                                                                            |
| 7   | `apps/desktop/src/components/UnifiedAgenticChat/CommandPalette.tsx:125` | FTS5 rank (negative float) and Fuse score (0–1) stored in same `score` field — incompatible scales | Normalized FTS5 rank to [0,1] via `1 / (1 - r.rank)` to match Fuse convention                                                                               |
| 8   | `apps/desktop/src-tauri/src/sys/commands/master_password.rs:254`        | `gitleaks:allow` comment on preceding line — scanners only check inline                            | Moved to inline: `"..." // gitleaks:allow`                                                                                                                  |
| 9   | `apps/desktop/src/components/UnifiedAgenticChat/CommandPalette.tsx:83`  | `String(c.id).endsWith(convIdStr)` too permissive (ID suffix match)                                | Replaced with exact match: `c.id === convIdStr`                                                                                                             |

**Bonus fix:** `apps/web/app/api/admin/sso/route.ts` — return type annotations changed from `Promise<NextResponse>` to `Promise<Response>` to resolve TypeScript errors caused by `requireCsrfToken` returning `Response | null`.

---

## Final Verification

- **Tests**: 820 passed, 1 skipped (pre-existing) ✅
- **Lint**: 3 warnings (pre-existing, all in desktop audio components) ✅
- **Type-check**: 0 errors ✅
