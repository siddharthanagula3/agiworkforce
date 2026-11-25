---
id: "DOC-70-qa-setup-web-local-kit-runkit"
type: "setup"
title: "Web run kit: how to test the AGI web app like a person"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Web run kit: how to test the AGI web app like a person

You are checking whether one basic capability of the AGI web app works for a real person. The owner's rule: a
capability counts as working only if a person-style run of the real app shows it working. Tests, type checks
and reading code are never proof.

## The app under test

- URL: http://localhost:3000 (a compiled build of the web app, local database, test sign-in, Stripe test mode).
- It is already running. Never start, stop, rebuild or reconfigure it. Never edit any file in a git checkout.
- Server log (read-only, to classify a failure after you have judged it): ~/.cache/agi-audit/web-lane/logs/server-current.log

## Your browser

Use `playwright-cli` from Bash with your own session name on every command: `playwright-cli -s=<session> <command>`.
The browser is headless Chromium; you see it through screenshots.

```bash
playwright-cli -s=<session> open http://localhost:3000/login      # start (once)
playwright-cli -s=<session> resize 1280 820                        # desktop width
playwright-cli -s=<session> video-start <evidence>/run.webm --size 1280x820
playwright-cli -s=<session> snapshot                               # element refs (e12 ...) for click/fill
playwright-cli -s=<session> find "Message input"                   # search the snapshot
playwright-cli -s=<session> click e12 ; fill e15 "text" ; type "text" ; press Enter
playwright-cli -s=<session> upload /abs/path/file.pdf              # after clicking the control that opens a file chooser
playwright-cli -s=<session> screenshot --filename <evidence>/03-settled.png
playwright-cli -s=<session> reload ; go-back ; tab-new <url> ; tab-select 1
playwright-cli -s=<session> network-state-set offline              # then online
playwright-cli -s=<session> resize 390 844                         # phone width
playwright-cli -s=<session> video-stop ; close                     # always, at the end
```

Look at the screen: after every meaningful step take a screenshot and open it with the Read tool. Large images
cost a lot; shrink first with `sips -Z 1100 in.png --out in.small.png` and Read the small copy. Use `snapshot` or
`find` to read text exactly. Wait for streaming to finish before judging (take two screenshots a few seconds
apart, or wait until the Stop control is gone).

## What you may and may not do

Only what a person can do in a browser: click, type, press keys, upload a file, scroll, reload, go back, open a
new tab, resize, switch light and dark in the app's own settings, go offline and online, wait.

Not allowed, because a person cannot: calling the API with curl or fetch, `eval` or `run-code` that changes page
or app state, setting cookies or local storage, mocking routes, writing to the database, editing files in a
checkout, changing server settings.

Allowed for observation only: `eval` or `run-code` that only reads or waits (for example waiting for text and
timing it), `console`, `requests`, and reading the server log. Use these to explain a failure, never to make a
step pass.

Do what people do: press Stop halfway through an answer, reload in the middle of a task, go offline and back,
paste something long, press the wrong button and recover. Try at least two of these where they apply.

## Accounts

Sign in at /login: dismiss the cookie banner with "Necessary only", type the email, press Continue. If a
password screen appears, press "Email me a code". Enter the code 424242 (test sign-in; no mail is sent).

Your account email is given in your prompt. Modes:

| Mode | Accounts used | Notes |
|---|---|---|
| free | a Free account | Free allows one running answer at a time |
| subscribed | a paid test account (Basic, Premium or Ultra, granted by hand) | the plan name shows at the bottom left |

First-time accounts: some Free accounts were created ahead of time and have never signed in (the sign-up form's
human check cannot be passed in this browser). Sign in at /login as above; you will meet the age step and any
first-run steps a new person sees. Answer as an adult (for example age 34). Do not use /signup.

Tag every chat, project, schedule or file you create with your session name so you can find it again. Never
open, rename or delete anything you did not create.

## Things this machine provides

- Scheduled tasks: a timer calls the schedule sweep every 2 minutes (production does it every 15 minutes).
- Voice: there is no real microphone. For a voice check, open your browser with
  `playwright-cli -s=<session> open --config=$HOME/.cache/agi-audit/web-lane/voice.config.json <url>`; the fake
  microphone then plays a recording of a person saying "What is five plus six?" in a loop.
- Office files: you cannot open Word or Excel here. Render a downloaded file to a picture with
  `qlmanage -t -s 1100 -o <evidence> <file>` and Read the picture; also check it is a real file with
  `unzip -l <file>`.
- Downloads from the browser land in the folder you run playwright-cli from; run it from your evidence folder.
- Outside accounts (Google, Slack, GitHub repositories) are not available. Go as far as a person can without
  one, then report `blocked` with what was missing.

## Files to use

~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline/fixtures/route-brief.pdf (station Cedar Bay, code
VELA-74, total five) and tiles.png (one red circle, one blue square, one green triangle).

## The bar for "pass"

1. It finishes with the right, complete result.
2. First words appear within a few seconds and the answer streams smoothly.
3. Nothing looks broken on the way: no error text, stuck spinner or dead button.
4. It is still there after a reload, and where it should sync.
5. Compared with how Claude or ChatGPT handle the same task (from your own knowledge of those products), it is
   not visibly worse. Say what you compared.
6. It looks right: nothing overlapping, cut off, unreadable or misaligned, in light and dark, at 1280 and 390 wide.
7. If the plan does not include it, the person sees a clear Upgrade or waitlist message, never an error.

Status values: `pass` (all applicable points verified), `partial` (works but one or more points fail; say which),
`fail` (the capability does not work), `blocked` (could not be attempted; say exactly what was missing, for
example a provider credential on this machine, a microphone, or an outside account). A failure caused by this
machine's setup, not the product, is `blocked` with the evidence; do not call it a product failure.

## Evidence

Save everything under the evidence folder named in your prompt: `NN-step-name.png` for each step, `run.webm`,
and `notes.md` with what you did, what you saw, and for each problem: the screen, the exact visible text, how to
reproduce it in numbered steps, and whether it looks like a product defect or a setup limit. Close your browser
session when done.
