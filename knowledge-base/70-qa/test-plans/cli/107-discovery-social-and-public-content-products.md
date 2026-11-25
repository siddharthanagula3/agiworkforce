---
id: "PLAN-cli-107"
type: "test-plan"
title: "CLI · 107. Discovery, social, and public-content products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "107"
---
# CLI · 107. Discovery, social, and public-content products

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S107.13 Attribution and source lineage.

- **Expected:** Public and third-party content shows who made it and where it came from (publisher, author, source, versions, "copied from").
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The plan's Code line has no location. I searched apps/cli for attribution, lineage, provenance, 'copied from', 'copied_from' and publisher. The only hits were license text in apps/cli/assets/THIRD_PARTY_NOTICES.txt and Rust test code, so no product screen shows publisher, author, source or version lineage.
- **Needs:** external-service

## S107.20 Publisher participation.

- **Expected:** Third-party publishers can get their plugins or content in front of users: a submission path or a user-added publisher source, with the publisher named.
- **Code:** done. Evidence present: apps/cli/src/cloud/marketplaces.rs:51; apps/cli/src/lib.rs:3635
- **Where to find it:** Terminal: type `agi marketplace add <owner/repo>` (also in chat: `/marketplace add <owner/repo>`). To view: `agi marketplace sources`, or in chat `/plugin`, then switch to the Marketplaces tab with the right arrow key. (labels found in the code)
- **Needs:** a signed-in AGI account with the marketplace capability, a public GitHub repository with a marketplace manifest
- **Steps:**
  1. Sign in to the AGI CLI with an account that has the marketplace capability (canUseMarketplace). Without it the add step is refused.
  2. In a terminal, type `agi marketplace add owner/repo` for a public GitHub repository that has a marketplace manifest. Optionally add `--ref <branch or tag>` and `--name <name>`.
  3. Look for the line 'Added <name> to your account (<N> plugins).'
  4. Type `agi marketplace sources`. Look for the new row with its id, its name, its status, its plugin count and its repository URL under 'Marketplaces on your account'.
  5. In the chat, type `/plugin`, press the right arrow key until the Marketplaces tab shows, and look for the hint 'agi marketplace add <github url>'.
  6. Compare with Expected: the publisher's marketplace is named (name and repository URL) and its plugins become available.
