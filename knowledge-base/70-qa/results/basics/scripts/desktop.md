---
id: "DOC-70-qa-results-basics-scripts-desktop"
type: "results"
title: "Desktop baseline"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Desktop baseline

Follow the shared capture and scoring rules in [Run protocol](../README.md). Use the scorecard to see which tasks apply to each platform and mode. Each row below is a separate recorded run.

| Task | User action | Expected and recovery checks |
|---|---|---|
| **D-1** Install the signed app, sign in through the browser, land back in the app | Install the owner-supplied signed release using the normal OS installer in a disposable profile. Start sign-in, complete it in the browser, then return to the desktop window; repeat after canceling a handoff. | Inspect signature in normal OS controls, version in About and authenticated desktop identity. Missing release, signature or callback is recorded separately. |
| **D-2** Everything in the Web list works inside the app window | Run W-1 through W-19 in the actual signed Electron window using the subscribed Cloud account. Record one outcome and evidence path for each W item, not one homepage screenshot. | Verify all nineteen outcomes in the window, reconnection and reopen, plus project and artifact persistence. D-2 inherits the weakest nested result. |
| **D-3** Quick-ask shortcut from any app; attach a screenshot; drag a file in | Invoke the advertised global quick-ask shortcut from a non-AGI window displaying the synthetic chart. Attach that window’s screenshot and drag the route PDF into AGI. | Verify quick window focus, correct previews, and answer referencing only the approved fixtures. Test declined screenshot permission. |
| **D-4** AGI Code: open a folder and ask what the project does | Open the disposable code-bench repository using the folder chooser in AGI Code. Ask what it does and how to run the tests. | Answer identifies parcel totals, sum.py and the actual unittest command; visible route matches the selected Local or BYOK mode. |
| **D-5** AGI Code: ask for a change, see the diff, approve it, files are edited | Ask to correct only add’s implementation. Inspect the diff, reject once, inspect the unchanged file, then repeat and approve. | Exactly the intended file changes from subtraction to addition following approval. Inspect the editor and OS file viewer. |
| **D-6** AGI Code: run the tests, read the failure, fix it | Using a fresh failing copy, ask to run the test suite and fix the failing test without changing tests. | Observe a red assertion, an edit to the implementation, another test execution and green result from the true runner. |
| **D-7** AGI Code: commit the change; reopen the session later and continue | Ask for a commit describing the sum fix, inspect its diff, close AGI Code, reopen the same folder and ask what was changed. | One intended local commit and a resumable session with correct context. No push to a remote. |
| **D-8** AGI Code on a local model: D-4 to D-7 with nothing sent to the cloud | Select a downloaded local model for AGI Code, turn off network after setup and repeat D-4 to D-7 from a fresh copy. | Check local attribution and full operation while offline; record visible network state and mode. Restore only the network state changed for the test. |
| **D-9** AGI Code on your own key: add the key, run D-4 to D-7, provider label visible | In a clean profile supply the test provider key via the native secret field, capture only after the field is masked, then repeat D-4 to D-7. | Visible provider label on turns, consent/approval behavior correct, no accidental managed fallback. Test with no key first; owner enters any missing credential. |
| **D-10** The app updates itself to a newer version | On the signed earlier version, use the app’s normal update UI to get an already-published newer signed build and relaunch. | About shows new version, existing chats/settings survive. If no authorized version pair exists, record blocked and defer publishing to the owner. |
