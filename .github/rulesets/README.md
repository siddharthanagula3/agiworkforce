# Repository rulesets and environment protection

GitHub does not read configuration from the repository. `main.json` and
`environments.json` are the intended state; applying them is an API call by a
repository admin. Nothing in `.github/workflows/` enforces them.

On 2026-09-17 `gh api repos/:owner/:repo/rulesets` returned `[]` and every
environment except `production-web` returned `protection_rules: []`, so a direct
push, a force-push, and an unreviewed merge to `main` were all permitted, and any
branch could reach any deployment environment's secrets through a
`workflow_dispatch`.

## Apply the branch ruleset

```bash
gh api --method POST repos/:owner/:repo/rulesets --input .github/rulesets/main.json
```

### One maintainer

`main.json` requires one approving review. GitHub does not let the author of a
pull request approve it, so on a repository with a single maintainer that rule
blocks every merge and the only way out is the break-glass window below. Until a
second maintainer exists, apply the same ruleset with the count at zero: the pull
request, the green `CI complete`, the up-to-date branch, and the resolved review
threads are all still required, and nothing is bypassable.

```bash
jq '(.rules[] | select(.type == "pull_request") | .parameters.required_approving_review_count) = 0' \
  .github/rulesets/main.json \
  | gh api --method POST repos/:owner/:repo/rulesets --input -
```

Raise it to one the day a second maintainer can review:

```bash
RULESET_ID=$(gh api repos/:owner/:repo/rulesets --jq '.[] | select(.name=="main-protection") | .id')
gh api --method PUT "repos/:owner/:repo/rulesets/$RULESET_ID" --input .github/rulesets/main.json
```

## Apply environment protection

`environments.json` carries one entry per environment a workflow names. This
walks it: it creates the environment if it is absent, sets the protection rules,
resolves each reviewer login to the numeric id the API wants, and replaces the
deployment branch policies with the declared list.

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

jq -c '.environments[]' .github/rulesets/environments.json | while read -r env; do
  name=$(jq -r '.name' <<<"$env")

  reviewers=$(jq -r '.protection.reviewers[].login' <<<"$env" \
    | while read -r login; do gh api "users/$login" --jq '{type: "User", id: .id}'; done \
    | jq -sc '.')

  jq -n --argjson env "$env" --argjson reviewers "$reviewers" '{
    wait_timer: $env.protection.wait_timer,
    prevent_self_review: $env.protection.prevent_self_review,
    reviewers: $reviewers,
    deployment_branch_policy: $env.protection.deployment_branch_policy
  }' | gh api --method PUT "repos/$REPO/environments/$name" --input - --silent

  # 404s until the PUT above turns custom policies on, which is why it runs
  # after it and why a miss here is not fatal.
  gh api "repos/$REPO/environments/$name/deployment-branch-policies" \
    --jq '.branch_policies[].id' 2>/dev/null \
    | while read -r id; do
        gh api --method DELETE "repos/$REPO/environments/$name/deployment-branch-policies/$id" --silent
      done

  jq -c '.branch_policies[]' <<<"$env" | while read -r policy; do
    gh api --method POST "repos/$REPO/environments/$name/deployment-branch-policies" \
      --input - --silent <<<"$policy"
  done

  printf '%s protected\n' "$name"
done
```

Every reviewer in the file is a user; a team reviewer would need
`orgs/{org}/teams/{slug}` and `type: "Team"` instead.

The branch policies are custom (`main`, plus the release tag patterns) rather
than `protected_branches: true`, so they hold whether or not the ruleset above
has been applied yet and the two can be applied in either order.

## Verify

```bash
gh api repos/:owner/:repo/rulesets
gh api repos/:owner/:repo/environments \
  --jq '.environments[] | {name, rules: [.protection_rules[].type], policy: .deployment_branch_policy}'
```

An empty ruleset array means `main` has no protection. An environment with an
empty `deployment_branch_policy` can be deployed to from any branch, which means
its secrets are one `workflow_dispatch` away from any pushable ref.

## What the ruleset enforces

- Pull request required, review threads resolved, stale approvals dismissed on
  push.
- `CI complete` must pass and the branch must be up to date with `main` first.
  That check is the aggregate job in `.github/workflows/ci.yml`; it fails when
  any lane fails or is cancelled, so requiring it requires every lane. It is the
  only status check worth requiring: every other job is conditional on the change
  scope, and a required check that does not run leaves the pull request waiting
  forever.
- Force-push and branch deletion denied.

`.github/workflows/ci.yml` carries `paths-ignore` for `docs/**`, `*.md` and
`.github/ISSUE_TEMPLATE/**`. A pull request touching only those paths never
starts `CI`, so `CI complete` never reports and the merge button stays blocked.
Either that filter goes, or docs-only work merges through the break-glass window
below. Decide before applying, not after the first blocked documentation change.

## Break glass

`bypass_actors` is empty by design, so there is no actor who can quietly merge
past a red gate. To land an emergency fix, open the window, land the change,
close the window, and record it:

```bash
RULESET_ID=$(gh api repos/:owner/:repo/rulesets --jq '.[] | select(.name=="main-protection") | .id')
gh api --method PUT "repos/:owner/:repo/rulesets/$RULESET_ID" -f enforcement=evaluate
# land the change
gh api --method PUT "repos/:owner/:repo/rulesets/$RULESET_ID" -f enforcement=active
```

The reason is not optional and it is not on the honour system. `evaluate` keeps
evaluating every rule and records each violation it would have blocked, so every
change landed through a window is listed here with its actor and commit:

```bash
gh api "repos/:owner/:repo/rulesets/rule-suites?ref=refs/heads/main&rule_suite_result=bypass"
gh api "repos/:owner/:repo/rulesets/rule-suites?ref=refs/heads/main&rule_suite_result=fail"
```

A row in either list without a matching incident-log entry naming the reason and
the window is the thing to go and ask about.

## Signed tags

Tag signing is not enforced here. It needs a separate `tag`-target ruleset and a
signing key on every release machine; until that key exists, an enforced rule
would block releases rather than secure them. The release tag patterns are
instead constrained on the environment side, in `environments.json`: a
`v-desktop-*` tag can reach the macOS signing secrets, an arbitrary branch
cannot.
