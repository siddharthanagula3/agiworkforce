---
id: "PLAN-chrome-087"
type: "test-plan"
title: "Chrome · 87. Enterprise administration screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "87"
---
# Chrome · 87. Enterprise administration screens

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S87.27 Device-management integration.

- **Expected:** An organisation can deploy and configure the product through its device-management system (MDM or managed policy), and the app honours that managed configuration.
- **Code:** done. Evidence present: apps/extension/manifest.json:37; apps/extension/managed-schema.json:5; apps/extension/src/features/site-policy/store.ts:32; apps/extension/src/background.ts:4217; apps/extension/src/background/policy.ts:527
- **Where to find it:** no screen of its own. The managed key is read from chrome.storage.managed (apps/extension/src/features/site-policy/store.ts:64) and declared in apps/extension/manifest.json:37 via apps/extension/managed-schema.json. The admin policy has no visible screen for the person; the withdrawal message only appears when a run is stopped. The Expected line covers deployment through MDM, which is an IT action outside the app UI, and the Code line names apps/extension/src/background/policy.ts:527 (a page-to-page transfer check) that is inner behaviour, not a visible control. The item's 'Where to find it' field in the plan says 'not written yet'. Searched for the 'AGI site policy' and 'managed' wording across apps/extension/src; no visible admin-policy screen was found.
- **Needs:** An administrator who can deploy Chrome managed policy (MDM or managed policy file) for the extension, plus a Chrome profile enrolled in that policy. Not testable with a normal user account alone.
- **Steps:**
  1. Have an administrator install the managed policy for the extension, with agi_admin_site_policy set to a blocklist entry for a site (for example https://example.com).
  2. Sign in to the AGI extension, approve that site for Computer use, and start a Computer use task on it.
  3. Look for the message that says access was withdrawn and the run was stopped, and check that the blocked site cannot be acted on.
  4. Remove the managed policy and check that the site works again after a reload.
