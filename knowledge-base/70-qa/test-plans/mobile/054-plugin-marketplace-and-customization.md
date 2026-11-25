---
id: "PLAN-mobile-054"
type: "test-plan"
title: "Mobile · 54. Plugin marketplace and customization"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "54"
---
# Mobile · 54. Plugin marketplace and customization

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S54.03 Skills tab.

- **Expected:** A Skills section sits beside plugins in the customization area.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:115 (quoted code not found in the file now); apps/mobile/src/features/skills/service.ts:19 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Customize > Skills (labels found in the code)
- **Needs:** a signed-in AGI Cloud account (without sign-in the Cloud rows show the tag Sign in)
- **Steps:**
  1. Open the bottom bar item labelled Settings.
  2. Under the section headed Cloud, tap Customize.
  3. On the Customize screen, look for the card titled Skills, placed directly below the card titled Plugins.
  4. Tap Skills and confirm the Skills screen opens. Compare with Expected: the Skills card sits beside Plugins in the customization area.

## S54.04 Connectors tab.

- **Expected:** A Connectors section sits in the customization area.
- **Code:** done. Evidence present: apps/mobile/app/(app)/connectors/index.tsx:4; apps/mobile/services/connectors.ts:141
- **Where to find it:** Settings > Cloud > Customize > Connectors (labels found in the code)
- **Needs:** a signed-in AGI Cloud account (without sign-in the Cloud rows show the tag Sign in)
- **Steps:**
  1. Open the bottom bar item labelled Settings.
  2. Under the section headed Cloud, tap Customize.
  3. On the Customize screen, look for the card titled Connectors, below the Skills card.
  4. Tap Connectors and confirm the Connectors screen opens. Compare with Expected: a Connectors section sits in the customization area.
