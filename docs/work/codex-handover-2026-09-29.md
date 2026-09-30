# iOS/mobile handover

Branch: `codex/ios-app-store-ready`. The final code commit before this handover is `a8d942f5be3f14e20c15515560f19237f19698d2`. The commit containing this note is the branch `HEAD`; use `git rev-parse HEAD` for its full hash. It cannot contain its own hash without another commit changing `HEAD`. Nothing was pushed.

## Commits made on this branch today

1. `528b29cd93` feat(contracts): align cloud mobile account and model contracts
2. `5d26a6b4a3` feat(web): support mobile cloud terms quota and account flows
3. `40c2e12c4f` feat(mobile): complete cloud auth and ecosystem surfaces
4. `79cbef90ef` test(mobile): verify cloud flows and native release behavior
5. `33ce898bc3` fix(guards): validate staged mobile and web launch changes
6. `a9a36fa988` docs(mobile): record store readiness and launch gaps
7. `326d3bbb49` ci(mobile): gate ios release on verified store artifacts
8. `a8d942f5be` chore(mobile): merge terms status and model retirement
9. This handover note's commit, identified by branch `HEAD`.

The merge includes all five commits from `codex/mobile-terms-status`: `7ebe6fce4b`, `208ec0fbf8`, `aaa3651baf`, `697d7bf44a`, and `019b9a3d9b`. That worktree was left alone. The only merge conflict was the import in `apps/mobile/__tests__/model-picker.test.tsx`; the resolution retained both branches' test coverage.

## Validation at handover

- After the merge, Mobile typecheck and lint passed. The full Mobile package test passed: 457 Jest suites, 4,383 tests, and 24 snapshots, plus its Node/Python release tests.
- The merged Mobile model-picker suite passed 47 tests. Focused Web model-retirement tests passed 13 tests, and shared model-catalog tests passed 88 tests.
- `pnpm check:llm-operability` passed on the fully staged tree before the branch merge. The first attempt failed only because the sandbox denied localhost listeners; the elevated retry passed. A second full run on the merged tree was stopped when the founder requested immediate handover, so the final merged SHA does not have a completed full guard run. Its individual commit hooks passed.
- No known failing test or Mobile type error remains from this checkout. These checks do not establish a signed-device or production Cloud pass. Jest's configured `--forceExit` does not prove all asynchronous handles close.

## Open work and next steps

- Production still served `GET /api/terms/accept` as 405 and `GET /api/models/free-quota` as 404 at the last live probe. Deploy a reviewed build containing the route changes through the protected production Web gate, then verify both endpoints return the expected unauthenticated 401 envelope and complete a signed-in Mobile Terms and Cloud handoff.
- QwenCloud `Free quota only` was reported enabled by the founder, but the local account-bound record is stale and covers only two offerings. Verify the current deployed key, remaining quota, hard stop per intended offering, commercialization/third-party serving terms, and tool charges. Then run a signed-in Qwen Free turn on a device. Do not advertise this route as live before those checks.
- The current-source 0.0.1 build 2 device archive is not an exported, uploaded, processed, or installed IPA. Restore Apple Distribution signing and an App Store Connect-capable Xcode/EAS account, obtain the app's numeric `ascAppId`, export/verify the 0.0.1 IPA, upload it, and run TestFlight/device checks.
- Complete App Store Connect iPhone/iPad screenshots, secure review account, Content Rights answer, EU trader contact verification, and live support/review mailboxes. `contact@`, `support@`, and `review@` can be aliases on one monitored mailbox; none should be represented as reachable until provisioned and tested. Paid Apps bank/tax agreement and StoreKit products/purchase/restore testing remain necessary before paid in-app purchases can launch. The upgrade waitlist gate remains intentional.
- Review `ACTIVE_ISSUES.md` for additional account-isolation, connector, signed-device, and deployment validation gaps. Keep the existing schedules store/service, deleted `ProjectHeader`, `termsAcceptanceStore`, and `useCloudProfilePhoto` changes for the integration team's reconciliation.

No database migration under `apps/web/db/neon/` was added or changed on this branch. No new npm or native dependency was added to `apps/mobile/package.json`; `expo-contacts` and its iOS source-build autolinking entry were removed. The Mobile package script changes split iOS and Android bundle exports and add the existing Python IPA verifier to `test:node`.
