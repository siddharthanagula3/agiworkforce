---
id: "PLAN-mobile-002"
type: "test-plan"
title: "Mobile · 2. Public website and acquisition screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "2"
---
# Mobile · 2. Public website and acquisition screens

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S2.34 About and company information.

- **Expected:** An About view gives product and company information.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/about.tsx:333; apps/mobile/src/features/settings/index.tsx:623 (quoted code not found in the file now)
- **Where to find it:** Open the side menu, tap Settings, scroll to the Support section, tap About (shows v + version) (labels found in the code)
- **Steps:**
  1. From the first screen after signing in, open the side menu (the button at the top left, labelled 'Open menu' in the code; the drawer has a Settings row).
  2. Tap Settings, then scroll down to the Support section.
  3. Tap the About row (it shows the app version on the right).
  4. Look for: the AGI Mobile name, the version, the line 'Private Local Mode and AGI Cloud, on your device.', a Build Info card (Build, Platform, Runtime), a Resources card (Privacy Policy, Terms of Service, Acceptable Use Policy, Open Source Licenses, EU AI Act Transparency) and 'AGI Automation LLC · USA' at the bottom. Compare with Expected: product and company information is shown.

## S2.35 Contact and support page.

- **Expected:** A contact / support page lets a visitor reach the company.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/about.tsx:283 (quoted code not found in the file now); apps/mobile/app/(app)/about.tsx:135
- **Where to find it:** Settings > Support > About > Support section: Email Support (always), Contact Support (only when signed in and in Cloud mode), Help Center and Service Status (web pages) (labels found in the code)
- **Needs:** Email Support needs a mail app on the device; Contact Support needs a signed-in AGI Cloud account in Cloud mode
- **Steps:**
  1. From the side menu, tap Settings, scroll to Support, tap About.
  2. Scroll to the Support card in the About screen.
  3. Tap Email Support: the mail app should open addressed to contact@agiworkforce.com. If no mail app is set up, an alert should appear instead.
  4. If signed in with an AGI Cloud account in Cloud mode, tap Contact Support and check that a support tickets screen opens. Also tap Help Center or Service Status and check that a web page opens. Compare with Expected: a visitor can reach the company.
