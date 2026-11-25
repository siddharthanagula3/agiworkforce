---
id: "PLAN-cli-082"
type: "test-plan"
title: "CLI · 82. Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "82"
---
# CLI · 82. Usage dashboard and limit UI

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S82.01 Current plan.

- **Expected:** Every signed-in surface shows the account's current plan, read from the server.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:564; apps/cli/src/usage_summary.rs:358; apps/cli/src/lib.rs:7680
- **Where to find it:** Type `agi usage` in Terminal, or `/usage` inside an agi chat session. The first line is "Account usage", then "Plan:". (labels found in the code)
- **Needs:** a signed-in AGI account (BYOK or local-only sessions show Unavailable instead)
- **Steps:**
  1. Make sure you are signed in: run `agi login` if `agi usage` says no AGI credential.
  2. Run `agi usage`.
  3. Find the "Plan:" line under "Account usage".
  4. Compare the plan name with the plan on your account (the plan names come from the tier labels, such as Free, Premium, Max, Ultra).

## S82.02 Billing period.

- **Expected:** Users can see the current billing period: when it renews or ends.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:564; apps/cli/src/usage_summary.rs:708; apps/cli/src/usage_summary.rs:358
- **Where to find it:** Type `agi usage` in Terminal. Look for the "Monthly" line and the "Subscription:" line under "Account usage". (labels found in the code)
- **Needs:** a signed-in AGI account with a subscription
- **Steps:**
  1. Run `agi usage`.
  2. Read the "Monthly:" line for its reset countdown ("resets in ...").
  3. Read the "Subscription:" line for the status, such as active, trial, paused or ended.
  4. Compare with your billing period on the account.

## S82.03 Overall usage meter.

- **Expected:** An overall usage meter shows how much of the plan allowance is used.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:564; apps/cli/src/usage_summary.rs:673; apps/cli/src/usage_summary.rs:358
- **Where to find it:** Type `agi usage` in Terminal. Look at the window lines under "Account usage": "5-hour window", "Weekly", "Monthly". (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Run `agi usage`.
  2. Read each window line, which shows "credits used" out of the allowance and "left", or a "% used" figure when the server sends percentages.
  3. Compare the used amount with the plan allowance you expect.

## S82.04 Per-model usage.

- **Expected:** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:802
- **Where to find it:** Type `agi usage` in Terminal. Look for the "By model:" section and the "Flagship weekly" line. (labels found in the code)
- **Needs:** a signed-in AGI account that has used more than one model
- **Steps:**
  1. Run `agi usage`.
  2. Find the "Flagship weekly" line, which appears when the flagship weekly window has usage.
  3. Find the "By model:" heading and read the rows (up to 8), each with credits and request count.
  4. In an agi chat session, `/usage` also shows "By model:" for the current session only.

## S82.10 Coding/work usage.

- **Expected:** Users can see how much of their usage went to coding and agentic work.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:789
- **Where to find it:** Type `agi usage` in Terminal. Look for the "By product area:" section. (labels found in the code)
- **Needs:** a signed-in AGI account that has run coding or work tasks
- **Steps:**
  1. Run `agi usage`.
  2. Find the heading "By product area:".
  3. Read the rows "AGI Code" and "AGI Work" (with "Chat", "Deep Research", "Browser" and "Not attributed" too), each with credits and request count.
  4. Compare the "AGI Code" and "AGI Work" amounts with the work you did.

## S82.13 Remaining credits.

- **Expected:** Users can see how many credits remain (plan windows and purchased balance).
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:673; apps/cli/src/usage_summary.rs:695; apps/cli/src/usage_summary.rs:358
- **Where to find it:** Type `agi usage` in Terminal. Look at the window lines and the "Purchased credits:" line under "Account usage". (labels found in the code)
- **Needs:** a signed-in AGI account (a purchased balance needs credits bought)
- **Steps:**
  1. Run `agi usage`.
  2. Read each window line for "credits used" and "left", such as "Weekly" or "Monthly".
  3. Read the "Purchased credits:" line for the purchased balance.
  4. Compare the "left" numbers with what the account shows.

## S82.14 Purchased versus included credits.

- **Expected:** Users can tell purchased credits apart from the plan's included allowance.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:695; apps/cli/src/usage_summary.rs:564; apps/cli/src/usage_summary.rs:358
- **Where to find it:** Type `agi usage` in Terminal. Compare the window lines with the "Purchased credits:" line. (labels found in the code)
- **Needs:** a signed-in AGI account; a purchased balance needs credits bought
- **Steps:**
  1. Run `agi usage`.
  2. Read the plan window lines ("5-hour window", "Weekly", "Monthly", "Flagship weekly") which come from the plan allowance.
  3. Read the separate "Purchased credits:" line, which shows the balance and "overage on" or "overage off".
  4. Check that the purchased balance is listed apart from the plan allowance.

## S82.17 Reset countdown.

- **Expected:** Each usage window shows how long until it resets.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:708; apps/cli/src/usage_summary.rs:673; apps/cli/src/usage_summary.rs:358
- **Where to find it:** Type `agi usage` in Terminal. Look at the reset text on each window line. (labels found in the code)
- **Needs:** a signed-in AGI account with a window that has a reset time
- **Steps:**
  1. Run `agi usage`.
  2. Read the window lines for ", resets in ..." (for example "resets in 3h 0m").
  3. If the reset time has passed, the line shows "resetting now".
  4. Compare the countdown with a clock after a minute.

## S82.20 Usage by task.

- **Expected:** Users can see usage per task (agent run / work session).
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. No per-task usage view found. I searched apps/cli/src for "task" with usage and cost words (for example per-task, by task, task cost) and found nothing in the usage or cost code. The usage view is per window, per model and per product area only.

## S82.23 Actual task cost.

- **Expected:** After a task finishes, the user sees what it actually cost.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:401; apps/cli/src/output.rs:833
- **Where to find it:** Start an agi chat session by typing `agi`, send a message, and look after the answer for the "billed:" line. (labels found in the code)
- **Needs:** a signed-in AGI account on the managed route (a BYOK or local session shows a "cost:" line instead)
- **Steps:**
  1. Sign in with `agi login` and start a chat with `agi`.
  2. Send one short message and wait for the answer to finish.
  3. Look for a line starting with "billed:" below the answer (it may take a few seconds to settle).
  4. Compare the amount with `agi usage` afterward.

## S82.24 Budget warning.

- **Expected:** Users are warned before they hit a usage limit.
- **Code:** done. Evidence present: apps/cli/src/models/streaming.rs:260
- **Where to find it:** Shown as a notice in an agi chat session when the server reports a window at a high usage level: "You have used N% of your 5-hour window." (labels found in the code)
- **Needs:** a signed-in AGI account near a usage limit (hard to reach in a test)
- **Steps:**
  1. Sign in and use `agi` chat until a usage window reaches a warning level.
  2. Look for the notice "You have used N% of your ..." with the window name.
  3. The notice appears once per window and level.
  4. Run `agi usage` and compare the percentage.

## S82.25 Budget-reached state.

- **Expected:** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- **Code:** done. Evidence moved: apps/cli/src/errors.rs:373 (quoted code not found in the file now); crates/agiworkforce-llm/src/error.rs:368
- **Where to find it:** Shown as the error text in an agi chat when a limit blocks a message, after the "It resets in ..." sentence, then the recovery link sentence. (labels found in the code)
- **Needs:** a signed-in AGI account at a usage limit (hard to reach in a test)
- **Steps:**
  1. Use an account that has reached a limit (for example a flagship weekly limit).
  2. Send a message in `agi` chat that the limit blocks.
  3. Read the error text: it names the limit, the "It resets in" time and the recovery link ("Add credits or fix billing at" or "See every usage window at").
  4. Compare with `agi usage`.

## S82.26 Alternative eligible model suggestion.

- **Expected:** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- **Code:** done. Evidence present: apps/cli/src/models/provider_dispatch.rs:293; apps/cli/src/errors.rs:687
- **Where to find it:** Shown in the error text of an agi chat when the flagship weekly limit blocks a message: "Your plan also includes ..., switch with `/model ...`". (labels found in the code)
- **Needs:** a signed-in AGI account at the flagship weekly limit (hard to reach in a test)
- **Steps:**
  1. Use an account at the flagship weekly limit with a model from that limit.
  2. Send a message in `agi` chat.
  3. Read the error text for "Your plan also includes" with a standard model name.
  4. Type the suggested `/model <name>` and send a message to check it runs.

## S82.27 Wait-until-reset option.

- **Expected:** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:214
- **Where to find it:** not found in the code. No wait-until-reset option found. I searched apps/cli/src for "wait until", "until the reset" and "Wait": the limit text only says "It resets in ..." and "Run `agi usage` to see when it resets." in apps/cli/src/errors.rs.
