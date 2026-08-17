# Repository rulesets

GitHub does not read rulesets from the repository. `main.json` is the intended
configuration; applying it is a one-time API call by a repository admin.

## Apply

```bash
gh api --method POST repos/:owner/:repo/rulesets --input .github/rulesets/main.json
```

## Verify

```bash
gh api repos/:owner/:repo/rulesets
```

An empty array means `main` has no protection: force-push, branch deletion, and
merges with red CI are all permitted.

## What it enforces

- Pull request required, one approving review, review threads resolved.
- `CI complete` must pass, and the branch must be up to date with `main` first.
  That check is the aggregate job in `.github/workflows/ci.yml`; it fails when
  any lane fails or is cancelled, so requiring it requires every lane.
- Force-push and branch deletion denied.

## Break glass

`bypass_actors` is empty by design. To land an emergency fix, set the ruleset's
`enforcement` to `evaluate`, land the change, restore `active`, and record the
window and reason in the incident log:

```bash
RULESET_ID=$(gh api repos/:owner/:repo/rulesets --jq '.[] | select(.name=="main-protection") | .id')
gh api --method PUT "repos/:owner/:repo/rulesets/$RULESET_ID" -f enforcement=evaluate
gh api --method PUT "repos/:owner/:repo/rulesets/$RULESET_ID" -f enforcement=active
```

## Signed tags

Tag signing is not enforced here. It needs a separate `tag`-target ruleset and a
signing key on every release machine; until that key exists, an enforced rule
would block releases rather than secure them.
