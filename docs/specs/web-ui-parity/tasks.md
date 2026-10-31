# Web chat rendering: tasks

Status: In progress
Owner: Web chat
Last updated: 2026-10-31

This existing checklist now reflects the October 30 local implementation.
Checked items describe the stated implementation or bounded verification, not
production deployment or complete surface parity. The [spec](spec.md) owns the
contract; the [live-check record](../../../audit/live-check/chat-rendering-2026-10-30.md)
owns evidence and current acceptance gaps.

## 1. Narrow chat layout

- [x] 1.1 Collapse composer labels by composer width, retaining icons/accessibility.
- [x] 1.2 Switch header layout by its width as the artifact panel narrows the chat.
- [x] 1.3 Permit a 320px chat column beside the artifact panel.
- [ ] 1.4 Finish consolidated narrow-panel/phone verification; individual probes
      are not an all-route sweep.

## 2. Tool choice and rendered output

- [x] 2.0 Preserve valid KaTeX source/layout and exact Copy; wrap code and scope
      compact headings. Individual math browser runs passed at 1440/1024/390/320px
      in both themes.
- [x] 2.1 Route by output purpose. Unknown/text/functional requests authorize no
      images; edits/continuations require source context. Withhold unnecessary
      search for self-contained requests and recheck execution.
- [x] 2.2 Document current syntax, host capabilities and honest fallbacks in the
      spec; keep writing artifacts independent with a scoped host save contract.
- [x] 2.3 Implement React card/stats/form/carousel/gallery behavior, native bar/
      line/pie/donut charts, timeline dates and separate safe diagram SVG/source.
      Exercise individual local workflows and deterministic failure/permissions.
- [x] 2.4 Register @15 internally with its digest and seven-block eval fixture;
      preserve published prompt text and pin @6.
- [x] 2.5 Use one image resource per call. Four ordered stubbed calls/cards and
      a gallery fence retain four distinct resources.
- [x] 2.6 Group matching Matplotlib exports by validated render identity; retain
      downloads and distinct data, labels and figures.
- [ ] 2.7 Finish per-command Copy, status notes, actions that send, semantic tag
      tones and other remaining catalog controls. Do not advertise them as built.
- [ ] 2.8 Verify Chrome/VS Code projections and mobile fallbacks in real hosts;
      verify retained Tauri controls and host persistence separately.
- [ ] 2.9 Measure @15 against @6 through prompt governance. Promote only on
      accepted quality evidence; offline replay is not that evidence.

## 3. Real conversation acceptance

- [x] 3.1 Add localhost-only authenticated conversation coverage with stubbed
      responses, image-generation interception and test-auth/local-database guards.
- [x] 3.2 Verify actual conversation creation, response persistence, fence-edit
      PATCH, Save and reopen in fourteen independent local chats. Two-tab late
      continuation acceptance also preserves the authoritative saved edit.
- [x] 3.3 Fresh consolidated browser run passed 29 checks; the additional
      two-tab conflict/reopen check passed separately. Exact evidence and
      remaining release boundaries are in the live-check record.

- [x] 3.4 Add a blocking development renderer lane and strict production/dev
      assignment; preserve the signed-out production and on-demand matrix gates.
- [x] 3.5 Validate the local production web build and actual HTTP 404/no-fixture
      boundary. Report current-head repository/remote outcomes with the commit
      and CI evidence, without treating a local pass as a deployment.

## 4. Earlier screenshot work still tracked

- [ ] 4.1 Verify literal user Markdown through authenticated conversations.
- [ ] 4.2 Waiting approvals: `WEB-CHAT-PAUSED-TURN-LOOKS-DONE-01`.
- [ ] 4.3 Concurrent Stopping/Preparing: `WEB-CHAT-STOP-SHOWS-PREPARING-01`.
- [ ] 4.4 Finish persisted/live acceptance for `WEB-CHAT-IMAGE-MODEL-CREDIT-01`;
      local stream identity and stubbed tool-loop checks are corrected.
- [ ] 4.5 Reproduce long-reply/artifact truncation at the output-budget boundary.
- [ ] 4.6 Keep unrelated sources, step icons, error details, follow-ups, ratings,
      badges, Recents, usage and duplicate Projects work in the existing
      `WEB-CHAT-UI-POLISH-2026-10-27` compound row.

## 5. Broader scope and owner decisions

- [ ] 5.1 Inventory every web route and run the original authenticated responsive
      sweep at 390/360/320px and 768/1024px; fix/recheck its findings.
- [ ] 5.2 Decide the earlier table styling preference.

## 6. Selected October 30 UX recommendations

The owner selected NEW-UX-01 through NEW-UX-04 from the supplied repair pack;
its other historical/public-site/SEO cards remain outside this pass. These
four are usability recommendations rather than newly established failures.

- [x] 6.1 Distinguish saved notification channels from this browser's permission
      and web-push support without prompting or subscribing on Settings view.
- [x] 6.2 Align all channel controls and retain essential details in disclosures;
      verify desktop and stacked narrow layouts.
- [x] 6.3 Search canonical skill titles, descriptions and IDs, with explicit
      inheritance/counts and preserved null/array semantics.
- [x] 6.4 Keep Create/Cancel reachable, retain the header action, guard unsaved
      navigation and preserve a failed-submit draft.
- [x] 6.5 Verify nine authenticated local browser cases using intercepted writes,
      then rerun three Agent cases with circular-radio/touch-target geometry.

The provider-denial continuation issue remains in
`WEB-CHAT-DENIED-TOOL-PROVIDER-400-01`, outside this rendering slice. Production
deployment and prompt promotion retain their existing release process; neither
has occurred in this task.

## 7. October 31 visual polish

- [x] 7.1 Apply shared chat typography, compact writing/form presentation,
      touch targets, safe notice placement and restrained transitions.
- [x] 7.2 Verify 43 local web cases, including real saved edits/reopening,
      cancellation/conflicts and eight viewport sizes through 3840px, both
      themes and fine/coarse input. Inference remains stubbed.
- [x] 7.3 Verify 23 retained desktop renderer cases, including 16 responsive
      combinations, workspace context, Send/Stop, keyboard menus and focus.
      This is Chromium with Cloud/IPC fixtures, not native host validation.
- [x] 7.4 Verify native mobile type/lint and bounded control/copy/accessibility
      regressions; inspect current JavaScript in the cached iOS Debug shell,
      including drawer and Settings in both themes.
- [x] 7.5 Verify public contrast, first-screen actions and narrow coded previews
      through the existing 33-case browser packet.
- [x] 7.6 Finish extension browser verification: 24 emitted VS Code viewport
      states, 12 Chrome renderer states, 12 unpacked Chrome states and the
      existing extension smoke runner. Keep the deployment hold and report
      repository/publication outcomes with the final candidate evidence.
- [ ] 7.7 Obtain fresh native-build, Android, native keyboard and assistive
      traversal proof. The current simulator instrument omits the composer
      text target, and its Debug overlay obstructs Close Settings.

The owner clarified that TV means the website on a large display. No native TV
application or remote-navigation behavior is claimed. Current source, evidence,
intentional fallbacks and validation limits remain in the existing live-check
record linked above.
