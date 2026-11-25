---
id: 'DOC-70-qa-setup-web'
type: 'setup'
title: 'Running the Web app locally'
last_reviewed: '2026-11-24'
revision: 'f51d16e747'
---

# Running the Web app locally

All testing is on localhost. This page starts the Web app from a compiled build, which behaves like the released app. Every other app is pointed at this server.

## What was actually run

| Build                                                                                                                  | Run by this session?                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The fix branch (the older commit `22649ece43` plus six fixes; merged into main on 2026-11-24 and since removed) | Yes. The 38 Web basics checks of 2026-11-24 ran against it or against its base |
| The project folder (`~/Desktop/agiworkforce`, main) | **No.** The steps below are the same scripts pointed at the project folder; they have not been run there yet |

Test the project folder. It holds the six fixes since 2026-11-24.

## What runs

| Piece                                                                       | Port |
| --------------------------------------------------------------------------- | ---- |
| Web app, compiled build                                                     | 3000 |
| Database (PostgreSQL, local, already running on this computer)              | 5432 |
| Database bridge (started by the script)                                     | 5433 |
| Artifact preview (started by the script)                                    | 3210 |
| Cache (Redis, local, already running on this computer)                      | 6379 |
| Schedule timer (optional; fires every 2 minutes, production fires every 15) |      |

Sign-in uses the development sign-in service with test emails; no mail is sent. Payments are in test mode.

## Commands

The scripts are in [web-local-kit/](web-local-kit/). They build and start the checkout named by `AGI_CHECKOUT`, which defaults to the project folder. Logs and process files go to `~/.cache/agi-audit/web-lane/`.

```bash
KIT=~/Desktop/agiworkforce/knowledge-base/70-qa/setup/web-local-kit

# Build (about 6 minutes). One heavy job at a time on this computer: always through heavy-job.sh.
cd ~/Desktop/agiworkforce
scripts/dev/heavy-job.sh bash $KIT/install-build.sh skip-install     # leave out skip-install on a first build

# Start, check, stop
bash $KIT/server.sh start 4        # the number loosens rate limits fourfold for testing
bash $KIT/server.sh status
bash $KIT/server.sh stop

# Schedule timer, only when testing scheduled tasks
bash $KIT/clock.sh start
bash $KIT/clock.sh stop
```

Then open `http://localhost:3000`.

- Stop the app before building. A build replaces the files the running app uses.
- The log of the current run is `~/.cache/agi-audit/web-lane/logs/server-current.log`. Read it to explain a failure, never to make a step pass.
- Another agent commits in the project folder. Do not build while it is in the middle of a change: check `git status` is clean first.

## What differs from production

- Uploaded files are not virus-scanned.
- Rate limits are four times looser when started with `4`.
- No GitHub App, no Slack app, no outside sign-in accounts, no real microphone.
- Provider keys come from the developer's local settings file.

A failure caused by one of these is a limit of this computer, not a product defect. Record it as `blocked` and say which one.

## Things an automated browser cannot do here

- The public sign-up form: its "verify you are human" step never completes. Use an account made in advance (see [accounts.md](accounts.md)).
- Voice: there is no microphone. `web-local-kit/voice.config.json` gives the terminal browser tool a fake one that plays "What is five plus six?".
- The Slack link page needs stand-in Slack settings on the server and a stand-in link (`web-local-kit/slack-fixture.sh`). The stand-in settings have not been tried on port 3000 yet.
