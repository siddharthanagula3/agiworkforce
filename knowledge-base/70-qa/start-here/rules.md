---
id: "DOC-70-qa-start-here-rules"
type: "qa-method"
title: "The owner's rules"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# The owner's rules

These come from the owner. They apply to every session that uses this folder.

## How work is judged

1. **Only a person-style run counts.** Something works when it has been done in the real app, by clicking, tapping, typing, dragging or swiping, and seen on screen. Tests, type checks and code reading are never offered as proof.
2. **It must look right too.** Nothing overlapping, cut off, unreadable or misaligned, in light and dark, at desktop and phone sizes.
3. **One thing at a time.** Fix or check one feature, see it working in the app, and only then move to the next. Do not stack up fixes ahead of the check.
4. **Say plainly what happened.** "Seen working" with the screenshot, or "not working" and what was on screen. Never report a guess as a result.
5. **Everything is tested on localhost.** Every app is pointed at the local web server (`http://localhost:3000`) and the local test accounts. Never test against production or any hosted address.
6. **One app at a time.** Test a single app until its run is finished or stopped, then move to the next. Never run tests on two apps at once. If an item is about two apps working together (for example a chat made on the phone appearing on Web), open the second app only to look at the result for that item, then close it.

## What a tester may do

- Only what a user can do: real clicks, real typing, real sign-in.
- Do what users do: stop an answer halfway, reload in the middle, go offline and back, switch apps, paste something long, press the wrong button and recover.
- Not allowed, because a user cannot: calling the service directly, changing stored data behind the scenes, setting cookies, skipping screens, editing files in the project to make a step pass.

## What nobody does without the owner saying so in that message

- Deploy, tag a release, publish to a store, apply a production database change, change a production setting.
- Sell anything. No subscription sales on any app before 2027-01-01.
- Delete code or documents.
- Push to GitHub. Commits carry only the owner's name, with no tool or AI lines.

## Decisions already made (these are not defects)

- An upgrade path ends at a waitlist or access-code screen until sales open.
- Free usage screens show only Upgrade, never meters.
- An 18-and-over step appears for a new account.
- Auto is the default model choice.
- Desktop sign-in happens in the browser. The public Desktop app shows the hosted web app in its window.
- Web sessions last 7 days.
- Mobile version 1 has no in-app purchase and hides Remote Control.

## Safety while testing

- Use only the local test accounts and made-up data. Never production accounts or real personal files.
- Never complete a real purchase, send a real message to a real person, or connect a real outside account, unless the owner provided it for that test.
- Keep Local mode offline while proving that nothing leaves the device.
- The project folder `~/Desktop/agiworkforce` has another agent working in it. A testing session does not edit files there.

## Owner decisions still open (asked 2026-11-24)

1. May view-only members chat in a project shared with them? The code on the fix branch allows it.
2. Should idle sign-out be off by default? The code on the fix branch sets it to Never.
3. Should a paid plan granted by hand never lapse by date? Today chat stops when its one-month period ends.
