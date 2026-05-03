# Wave 1 Handoff — Status as of 2026-05-03

> **Status: CLI v1.0 SHIPPED.** Run `./scripts/launch-readiness-check.sh` to verify. Below tracks what's still on you.

---

## ✅ Already done (autonomous, by Claude)

1. ~~Created `homebrew-tap` GitHub repo~~ ✅ done — at https://github.com/siddharthanagula3/homebrew-tap
2. ~~Tag `v-cli-1.0.0`~~ ✅ done — Release at https://github.com/siddharthanagula3/agiworkforce/releases/tag/v-cli-1.0.0
3. ~~Run release-cli.yml CI (3 iterations to fix linux/windows/openssl)~~ ✅ done
4. ~~Run `update-homebrew-tap.sh 1.0.0`~~ ✅ done — formula at https://github.com/siddharthanagula3/homebrew-tap/blob/main/Formula/agiworkforce.rb

## ⏳ Still on you (≈30 min)

1. **Set `NPM_TOKEN` GitHub secret** (≈3 min) — to unblock the 5th install path
2. **Re-trigger publish-npm job** after secret set (Actions tab → re-run failed jobs)
3. **Post the launch threads** (Show HN, r/LocalLLaMA, Twitter — drafts ready in `docs/launch/`)
4. **Monitor first 24 hours of issues** (`gh issue list --label bug`)

## What works RIGHT NOW (no action needed)

```bash
# All four of these install paths are LIVE:
brew install siddharthanagula3/tap/agiworkforce
curl -fsSL https://raw.githubusercontent.com/siddharthanagula3/agiworkforce/main/scripts/install.sh | bash
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli
# Direct: gh release download v-cli-1.0.0 --repo siddharthanagula3/agiworkforce
```

---

## What's already done (commits on `main`)

| Commit        | What                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `61ca9205`    | Removed 5 root debris files                                                                                       |
| `ac59e09e`    | Deleted 102 dead codex-rs port crates (-995K LOC)                                                                 |
| `9bed1b68`    | Created AGI_WORKFORCE.md SSOT + docs/ reorg                                                                       |
| `c45422f8`    | 10-phase CLI parity work (--dump-system-prompt, prompt cache, tool concurrency, hook transformers, memory typing) |
| `fe9162c9`    | apps/cli/ARCHITECTURE.md (subsystem map)                                                                          |
| `be78874f`    | Dead_code module reorg + test fixes (898/898 green)                                                               |
| (next commit) | Wave 1 prep: npm package + Homebrew formula + release-cli.yml workflow + CHANGELOG + launch drafts                |

---

## Detailed Step-by-Step

### Step 1 — Set NPM_TOKEN secret (≈3 min)

1. Go to <https://www.npmjs.com/settings/~/tokens>
2. Create new token → "Automation" type → save the token string
3. Go to <https://github.com/siddharthanagula3/agiworkforce/settings/secrets/actions>
4. Click "New repository secret"
5. Name: `NPM_TOKEN` Value: paste the token from step 2
6. Save

You also need to create the `@agiworkforce` npm scope if you haven't:

```bash
npm login
npm org create @agiworkforce --type=user
# OR if scope already exists, ensure your account has publish access
```

### Step 2 — Create the Homebrew tap repo (≈5 min)

```bash
# Create the repo on GitHub (web or gh):
gh repo create siddharthanagula3/homebrew-tap --public --description "Homebrew tap for AGI Workforce" --add-readme

# Clone locally (the update-homebrew-tap.sh expects this):
mkdir -p ~/code
git clone git@github.com:siddharthanagula3/homebrew-tap.git ~/code/homebrew-tap

# That's it. The repo just needs to exist with a Formula/ directory; the
# update-homebrew-tap.sh script will create the agiworkforce.rb on first
# release.
```

### Step 3 — Decide on launch date and tag

When you're ready to ship:

```bash
git pull origin main  # make sure you have the latest
git tag v-cli-1.0.0
git push origin v-cli-1.0.0
```

This triggers the new `release-cli.yml` workflow which will:

1. Build 6 platform binaries (~15 min)
2. Publish 7 npm packages (the wrapper + 6 platform-specific)
3. Create the GitHub release with .tar.gz / .zip archives

Watch progress:

```bash
gh run watch
```

When the workflow finishes, run:

```bash
./scripts/update-homebrew-tap.sh 1.0.0
```

This downloads the release archives, computes their sha256s, regenerates `~/code/homebrew-tap/Formula/agiworkforce.rb`, commits, and pushes. Users can immediately:

```bash
brew install siddharthanagula3/tap/agiworkforce
```

### Step 4 — Post the launch threads

Drafts are ready in `docs/launch/`:

- `docs/launch/show-hn.md` — Show HN copy + first comment
- `docs/launch/r-localllama.md` — Reddit r/LocalLLaMA post
- `docs/launch/twitter.md` — 8-tweet thread

Best time:

- **Show HN**: Tue–Thu, 7–9am Eastern
- **r/LocalLLaMA**: any time, evening US works well
- **Twitter**: 9am or 5pm ET, weekday

Sequence I'd recommend:

1. Twitter first thing in the morning (sets discovery)
2. Show HN ~30 min later (different audience, cross-pollinates)
3. r/LocalLLaMA ~2 hours later (after HN settles, before evening EU/US west)

### Step 5 — Monitor

For the first 24 hours, check:

```bash
# CI runs
gh run list --workflow=release-cli.yml --limit 5
# any failures get an email

# npm
npm view @agiworkforce/cli versions
npm install -g @agiworkforce/cli
agiworkforce --version

# Homebrew
brew install siddharthanagula3/tap/agiworkforce
which agiworkforce

# GitHub
gh issue list --label bug
```

Triage issues fast in the first 24 hours — that's when first-time-installer feedback comes in.

---

## What can ALSO go ready in parallel (not blockers)

While Wave 1 is launching, Wave 2 prep is on the shelf:

### Apple Developer + Google Play (mobile, Wave 3)

- Apple Developer Program: <https://developer.apple.com/programs/> ($99/yr) — needed for iOS App Store
- Google Play Developer Console: <https://play.google.com/console> ($25 one-time) — needed for Play Store
- Both take ~3 days for identity verification — start NOW so it's ready when Wave 3 lands.

### Windows EV cert (desktop, Wave 2)

- Sectigo / DigiCert EV Code Signing cert (~$300/yr) — needed to ship signed Windows installer
- AzureSignTool is the modern tooling; KMS-based signing avoids HSM shipping
- Without this, Windows users see "SmartScreen: unrecognized publisher" warnings
- Per FIX-010, the desktop release-desktop.yml will be updated to require this; until then Windows installer ships unsigned

### Stripe Hobby price (Wave 3)

- Already wired in `apps/web/app/api/stripe-webhook/`, `services/api-gateway/src/routes/credits.ts`, `scripts/create-account.js`, `scripts/create-hobby-price.js`
- Run `node scripts/create-hobby-price.js` to create the $5/mo Stripe price (verify amount)
- Update `apps/web/app/pricing/page.tsx` to surface tier
- Run `node scripts/test-hobby-plan.js` to verify end-to-end

---

## What's deferred to v1.1 (you don't need to act on these)

Per `CHANGELOG.md` Known limitations:

- CLI-5: auth.json plaintext (mitigated by 0o600). Substantial refactor — defer.
- 7 truly-parked Rust modules: a2a, tui_basic, history, memory_pipeline, models_cache, shell_snapshot, skill_learner
- DESK-5/8: desktop env vars in Rust process / in-RAM remembered choices
- WEB-4/5/11: Stripe webhook body-read fragility / CSRF Bearer / CSP unsafe-inline

These are tracked in `docs/audit/AUDIT_2026-05-03.md` and `docs/audit/FIX_QUEUE.md`.

---

## How to roll back if something goes wrong

Each commit was atomic. Roll back one at a time:

```bash
git revert <commit-sha>
git push origin main
```

If the npm publish goes wrong:

```bash
npm unpublish @agiworkforce/cli@1.0.0
# Caveat: 24h window only. After that, deprecate instead:
npm deprecate @agiworkforce/cli@1.0.0 "use 1.0.1+"
```

If the GitHub release goes wrong:

```bash
gh release delete v-cli-1.0.0 --cleanup-tag
git push --delete origin v-cli-1.0.0
```

If the Homebrew tap goes wrong:

```bash
cd ~/code/homebrew-tap
git revert HEAD
git push origin main
```

---

## Where everything lives

| Need                                 | File                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| The single source of truth           | [`AGI_WORKFORCE.md`](../AGI_WORKFORCE.md)                                    |
| Quick start for users                | [`README.md`](../README.md)                                                  |
| Build instructions                   | [`BUILD.md`](../BUILD.md)                                                    |
| PR conventions                       | [`CONTRIBUTING.md`](../CONTRIBUTING.md)                                      |
| Vision (ONE chat layout)             | [`docs/VISION.md`](VISION.md)                                                |
| Roadmap (3 waves)                    | [`docs/ROADMAP.md`](ROADMAP.md)                                              |
| UI design (Claude Desktop reference) | [`docs/DESIGN.md`](DESIGN.md)                                                |
| Pricing (Local/BYOK/Hobby/Pro/Max)   | [`docs/PRICING.md`](PRICING.md)                                              |
| Audit status (P0/P1)                 | [`docs/audit/AUDIT_2026-05-03.md`](audit/AUDIT_2026-05-03.md)                |
| All 47 fix prompts                   | [`docs/audit/FIX_QUEUE.md`](audit/FIX_QUEUE.md)                              |
| Master remediation plan              | [`docs/plans/master-remediation.md`](plans/master-remediation.md)            |
| CLI architecture                     | [`apps/cli/ARCHITECTURE.md`](../apps/cli/ARCHITECTURE.md)                    |
| Show HN draft                        | [`docs/launch/show-hn.md`](launch/show-hn.md)                                |
| Reddit draft                         | [`docs/launch/r-localllama.md`](launch/r-localllama.md)                      |
| Twitter thread draft                 | [`docs/launch/twitter.md`](launch/twitter.md)                                |
| npm publish script                   | [`scripts/publish-cli.sh`](../scripts/publish-cli.sh)                        |
| Homebrew tap update script           | [`scripts/update-homebrew-tap.sh`](../scripts/update-homebrew-tap.sh)        |
| Release CI workflow                  | [`.github/workflows/release-cli.yml`](../.github/workflows/release-cli.yml)  |
| Memory (durable knowledge)           | `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/MEMORY.md` |

---

## Final checklist (printable)

```
[ ] NPM_TOKEN GitHub secret set
[ ] @agiworkforce npm scope created (you have publish access)
[ ] siddharthanagula3/homebrew-tap repo created on GitHub
[ ] ~/code/homebrew-tap cloned locally
[ ] git pull origin main (latest cleanup + Wave 1 prep merged)
[ ] git tag v-cli-1.0.0 && git push origin v-cli-1.0.0
[ ] gh run watch (CI passes ~15 min)
[ ] ./scripts/update-homebrew-tap.sh 1.0.0
[ ] Verify npm install -g @agiworkforce/cli works on a fresh machine
[ ] Verify brew install siddharthanagula3/tap/agiworkforce works
[ ] Post Twitter thread (docs/launch/twitter.md)
[ ] Post Show HN (docs/launch/show-hn.md)
[ ] Post r/LocalLLaMA (docs/launch/r-localllama.md)
[ ] Triage gh issues for first 24h
[ ] Patch v-cli-1.0.1 if needed (re-run release-cli.yml)
```

---

You've got this. The code works. The workflows are wired. The launch posts are drafted. All you have to do is press the buttons.
