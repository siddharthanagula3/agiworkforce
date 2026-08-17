# Verification of the 71 `Done` claims in `audit/ui-gaps.csv`

**Method.** Every row in `audit/ui-gaps.csv` with `status=Done` (71 rows) was
re-verified against code at `e15df56e3`, working tree clean. Nine sonnet agents
each took a batch, opened every file named in the row's `evidence` prose, and
traced the full `UI → state → API/IPC → runtime → persistence → UI` path rather
than accepting the presence of a component as proof.

**Adversarial stage.** Every verdict _other than_ `CONFIRMED_DONE` was then sent
to an independent skeptic agent instructed to **refute** it — to search for the
allegedly-missing piece under a different name, in a shared package, on another
surface, behind an index re-export, in a Rust command, or registered
dynamically. This guards against the audit's own false positives.

**Result: 0 of 9 challenges were refuted.** Every failure finding survived.

Machine-readable output: `done-claim-verification.json`.

## Tally

| Verdict        |  Count |
| -------------- | -----: |
| CONFIRMED_DONE | **62** |
| PARTIALLY_DONE |      4 |
| REGRESSED      |      3 |
| NOT_DONE       |      2 |
| **Total**      | **71** |

**87% of the prior audit's completion claims hold up under adversarial
verification.** That is a genuinely good result and it should be said plainly:
the existing tracker is largely trustworthy, and the desktop consent /
folder-access / archived-chat / sandbox-confirmation work in particular is real,
deeply wired, and covered by tests that assert actual behaviour.

The nine exceptions follow. They matter disproportionately because a false
`Done` removes an item from the queue entirely.

---

## NOT_DONE (2)

### GAP-014 — mobile restore-purchases outcomes · **the cited evidence does not exist**

The row claims a typed terminal-outcome model for App Store restore
(`restored` / `none` / `failed` / `account-changed`) with Alert + retry UI, and
cites `useIapPurchaseFlow.ts` plus `use-iap-purchase-flow.test.tsx`.

**Neither file exists anywhere in the repository.** Independently confirmed:

```
$ find apps/mobile -name "useIapPurchaseFlow*" -o -name "use-iap-purchase-flow*"
(no output)
```

The real hook, `apps/mobile/src/features/billing/useMobileIap.ts:299-318`, has
no typed outcome at all — `restore()` toggles a `restoring` boolean and reuses
the same generic `error`/`lastResult` state as ordinary purchases.
`apps/mobile/__tests__/cloud-billing-page.test.tsx` contains no occurrence of
the string `restore`.

This is the most serious category of finding in this document: **the evidence
prose describes work that was never written.** Any row whose evidence cites a
non-existent file should be treated as unverified regardless of its status.

### GAP-083 — MCP workspace placement · **claimed on the wrong tab**

The row says `MCPWorkspace` is mounted from the Desktop **Connections** settings
tab. `apps/desktop/src/features/settings/tabs/Connections/index.tsx:1-38`
renders only `MobileCompanionPanel` — zero MCP content. `MCPWorkspace` is
actually mounted from a _different, separately-registered_ tab:
`apps/desktop/src/features/settings/tabs/Connectors/index.tsx:23,62-69`.

**Secondary finding this exposes:** Desktop settings ships two adjacent tabs
named **"Connections"** and **"Connectors"** with different contents. That
near-homograph pairing is an information-architecture defect in its own right —
it is exactly the kind of naming collision the audit brief asks us to catch, and
it is what misled the original claim.

---

## REGRESSED (3)

### GAP-001 — mobile Skills catalog · **fully built and completely unreachable**

The Skills screen is real and complete: `apps/mobile/src/features/skills/SkillsScreen.tsx`
(655 lines) implements search, source badges, the Cloud-mode gate, and
loading/error/empty states, and `apps/mobile/app/(app)/skills/index.tsx`
registers the route.

**Nothing in the app navigates to it.** A later commit (`1e858a7f1`, an ancestor
of HEAD) removed the Skills row from the drawer's `PRIMARY_ITEMS`, and the
current test now _asserts its absence_. Independently confirmed — `/(app)/skills`
appears in only two places repo-wide:

```
apps/mobile/src/features/drawer/components/DrawerContent.tsx:43   ← an unused RoutePath type union member
apps/mobile/app/(app)/skills/index.tsx:2                          ← the route wrapper itself
```

A 655-line screen with no entry point is **dead code that costs maintenance and
delivers nothing**. Either restore the drawer entry or delete the feature — the
current state is the worst of both.

### GAP-051 and GAP-205 — QuickChips · **the ledger is stale, not the code**

Both rows describe a shared `QuickChips` component with capability filtering.
Commit `2a37d81da` (an ancestor of HEAD) deleted quick-start suggestion chips
**from every surface** on an explicit founder decision dated 2026-08-06.
`packages/ui/unified-chat/src/components/ChatInterface.tsx:964-967` now carries
only a comment recording the removal.

**This is not a defect.** It is ledger drift: two rows still describe a
mechanism the product deliberately removed. They should be retired as
`Superseded`, not reopened. Flagging them matters because leaving them as `Done`
implies a feature exists that a reader will look for and not find.

---

## PARTIALLY_DONE (4)

### GAP-086 — send-shortcut preference · **wired end-to-end except for the control**

The consumption chain is genuinely complete: `settingsStore.ts` persists
`chatPreferences.sendShortcut` with migration/hydration, `DesktopShellV3.tsx`
reads it, `ChatInterface` forwards it, and `ChatInput.tsx`'s `handleKeyDown` and
send-button label correctly branch on `enter` vs `mod-enter`.

**No UI anywhere lets a user change it.** Independently confirmed —
`setSendShortcut` appears in exactly three places, all inside the store that
defines it:

```
apps/desktop/src/stores/settingsStore.ts:267    ← type declaration
apps/desktop/src/stores/settingsStore.ts:1252   ← implementation
apps/desktop/src/stores/settingsStore.ts:1258   ← its own telemetry string
```

Zero call sites. This is precisely the failure mode `CLAUDE.md` names — _"a
validated parameter no caller can send"_. The setting is real, enforced, and
permanently stuck at its default.

### GAP-064 — AGI Work switch · **the cited test suite is entirely red**

The production wiring is real (tier-gating via `canUseDesktopCloudAgiWork` /
`getAgiTaskModelEligibility`, not hardcoded). But the test file cited as proof,
`apps/desktop/src/features/v3/__tests__/DesktopShellV3.test.tsx`, **fails every
test at render time.** Verified by running it:

```
$ pnpm --filter @agiworkforce/desktop test DesktopShellV3.test.tsx
 Test Files  1 failed (1)
      Tests  29 failed (29)
TypeError: state.getSelectedModel is not a function
  ❯ useChatModelStore src/features/v3/__tests__/DesktopShellV3.test.tsx:154:5
  ❯ DesktopShellV3 src/features/v3/DesktopShellV3.tsx:259:25
```

A stale mock of `useChatModelStore` is missing `getSelectedModel`. **29 tests
covering the desktop shell — tier gating, folder scoping, tool confirmation —
currently assert nothing.** This is an actionable, self-contained fix and it
silently voids the evidence for several other rows that cite the same file.

### GAP-101 — tool-approval keyboard shortcuts · **half the shortcut is absent**

`McpToolConfirmationPrompt.tsx` contains no keyboard handling of any kind — no
`useEffect`, no `onKeyDown`, no reference to `Enter`, `Return`, or `Escape`.
Escape-to-deny works only _incidentally_, via the Radix Dialog primitive's
default `onOpenChange(false)`. Return-to-approve does not exist, though the Deny
button advertises an `Esc` hint. An approval dialog that shows a keyboard hint
for one action and silently lacks the other is worse than showing neither.

### GAP-210 — pairing instructions · **cross-surface copy drift breaks the flow**

Desktop's `QRPairingCard.tsx:113-117` instructs the user to navigate to
**"AGI Workforce → Desktop Companion"**. Mobile has no such destination: the
drawer entry is labelled **"Remote"** (`DrawerContent.tsx:94-99`, route
`/(app)/companion`) and the settings entry point is **"Desktop control"**.

Two of the row's three copy claims do check out. But a user following the
printed instructions literally **cannot find the screen**, which defeats the
purpose of the instructions. This is a good example of a class the prior
tracker's per-surface structure cannot see: the defect exists only in the
relationship _between_ two surfaces, so neither surface's own audit catches it.

---

## What this implies for the rest of the audit

1. **Evidence prose citing files must be spot-checked, not trusted.** GAP-014
   shows fabricated citations survive in the ledger. Any status in
   `ui-gaps.csv` inherits this risk, including the 197 `Open` rows.
2. **`Done` needs to mean "reachable by a user."** GAP-001 and GAP-086 both
   describe complete, correct, tested implementations that no user can reach.
   The tracker has no state for "built but unreachable", so both were filed as
   done.
3. **Cross-surface defects need their own category.** GAP-210 and the
   Connections/Connectors collision (GAP-083) are invisible to a per-surface
   audit by construction. `SurfaceParityMatrix.md` must carry them.
4. **A red test suite quietly invalidates its rows.** The 29 failing
   `DesktopShellV3` tests are cited by more than one row. Test-suite health is
   an audit input, not a separate concern.
