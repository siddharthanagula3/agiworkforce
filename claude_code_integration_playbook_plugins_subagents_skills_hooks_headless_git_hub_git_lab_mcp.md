# Claude Code Integration Playbook

Turn your references into a ready-to-run setup for day‑one adoption across repos and teams. Copy the files, run the commands, and ship.

---

## 0) Goals

- Deterministic agent behavior via hooks and scoped tool access.
- Reusable subagents and Skills for common tasks.
- CI bots that answer @mentions and ship code.
- Headless usage for cron and ops.
- MCP integrations for product, infra, and go‑to‑market tools.

---

## 1) Repo scaffold (drop‑in)

```
.your-repo/
├─ CLAUDE.md
├─ .mcp.json                           # project-scoped MCP servers
├─ .claude/
│  ├─ settings.json                    # shared project defaults
│  ├─ hooks/
│  │  ├─ hooks.json
│  │  └─ markdown_formatter.py
│  ├─ agents/
│  │  ├─ code-reviewer.md
│  │  └─ debugger.md
│  ├─ skills/
│  │  ├─ generating-commit-messages/
│  │  │  └─ SKILL.md
│  │  └─ pdf-processing/
│  │     ├─ SKILL.md
│  │     └─ REFERENCE.md
│  └─ output-styles/
│     └─ Explanatory.md
├─ .github/
│  └─ workflows/
│     └─ claude.yml
└─ .gitlab-ci.yml
```

> Add `~/.claude/skills/` and `~/.claude/output-styles/` at the user level if you want cross‑project availability.

---

## 2) Project defaults: `.claude/settings.json`

```json
{
  "outputStyle": "Default",
  "permissions": {
    "edit": "auto",
    "bash": "ask",
    "web": "ask"
  },
  "tools": {
    "enabled": ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
  },
  "memory": {
    "enabled": true
  }
}
```

---

## 3) Subagents

### `./.claude/agents/code-reviewer.md`

```markdown
---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: inherit
---

You are a senior code reviewer ensuring high standards of code quality and security.

When invoked:

1. Run `git diff --name-only HEAD~1..HEAD` to list recent changes.
2. Focus on modified files. Begin review immediately.

Checklist:

- Simplicity and readability
- Naming clarity
- No duplication
- Error handling
- No secrets or keys
- Input validation
- Test coverage
- Performance considerations

Output format:

- **Critical** (must fix)
- **Warnings** (should fix)
- **Suggestions** (nice to have)
```

### `./.claude/agents/debugger.md`

```markdown
---
name: debugger
description: Debugging specialist for errors, test failures, and unexpected behavior. Use proactively when encountering any issues.
tools: Read, Edit, Bash, Grep, Glob
---

You are an expert debugger.

Process:

1. Capture error/stack trace.
2. Reproduce.
3. Isolate failure.
4. Implement minimal fix.
5. Verify.

For each issue, provide:

- Root cause
- Evidence
- Patch
- Tests
- Prevention follow‑ups
```

---

## 4) Skills

### `./.claude/skills/generating-commit-messages/SKILL.md`

```markdown
---
name: generating-commit-messages
description: Generates clear commit messages from git diffs. Use when writing commit messages or reviewing staged changes.
allowed-tools: Read, Grep, Bash
---

# Generating Commit Messages

Instructions:

1. Run `git diff --staged`.
2. Produce:
   - Summary < 50 chars
   - Body with what/why
   - Affected components

Best practices:

- Present tense
- Explain motivation and impact
```

### `./.claude/skills/pdf-processing/SKILL.md`

```markdown
---
name: pdf-processing
description: Extract text, fill forms, merge PDFs. Use when working with PDF files or document extraction. Requires pypdf and pdfplumber packages.
---

# PDF Processing

Quick start:

- `pip install pypdf pdfplumber`
- See REFERENCE.md for examples.
```

### `./.claude/skills/pdf-processing/REFERENCE.md`

```markdown
Examples:

- Extract first page text with pdfplumber
- Merge two PDFs with pypdf
```

---

## 5) Hooks

### `./.claude/hooks/hooks.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '\"\\(.tool_input.command) - \\(.tool_input.description // \"No description\")\"' >> ~/.claude/bash-command-log.txt"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json,sys; d=json.load(sys.stdin); p=d.get('tool_input',{}).get('file_path',''); import sys as s; s.exit(2 if any(x in p for x in ['.env','package-lock.json','.git/']) else 0)\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/markdown_formatter.py"
          }
        ]
      }
    ]
  }
}
```

### `./.claude/hooks/markdown_formatter.py`

Paste the formatter from your reference. Ensure `chmod +x`.

---

## 6) Output Style (optional)

### `./.claude/output-styles/Explanatory.md`

```markdown
---
name: Explanatory
description: Adds brief Insights between actions.
---

# Custom Style Instructions

Provide short Insights on design choices, tradeoffs, and patterns while coding.
```

Activate with `/output-style explanatory`.

---

## 7) CLAUDE.md (project guardrails)

```markdown
# Standards

- Prefer pure functions, small modules, exhaustive tests.
- Error handling mandatory for I/O.
- Secrets via env only. No plaintext.

# Review Criteria

- API stability
- Performance
- Security checks (OWASP basics)
- Tests updated/added

# Conventions

- Commit: Conventional Commits
- Lint: project eslint/ruff configs
```

---

## 8) Headless patterns

Run non‑interactive jobs:

```bash
claude -p "Stage changes and write atomic commits" \
  --allowedTools "Bash,Read,Edit,Write" \
  --permission-mode acceptEdits

# Resume a session
claude --resume 550e8400-e29b-41d4-a716-446655440000 \
  -p "Fix remaining lint errors" --no-interactive

# JSON output for scripts
claude -p "Summarize data layer" --output-format json | jq .
```

---

## 9) GitHub Actions (v1 GA)

### `.github/workflows/claude.yml`

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  schedule:
    - cron: '0 9 * * *'
permissions:
  contents: write
  pull-requests: write
  issues: write
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # Respond to @claude mentions automatically
  daily:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "Generate a summary of yesterday's commits and open issues"
          claude_args: |
            --max-turns 5
            --system-prompt "Follow repository CLAUDE.md"
```

> Upgrade guide from beta: set `@v1`, remove `mode`, use `prompt`, move options into `claude_args`.

---

## 10) GitLab CI/CD (beta maintained by GitLab)

### `.gitlab-ci.yml`

```yaml
stages: [ai]

claude:
  stage: ai
  image: node:24-alpine3.21
  rules:
    - if: '$CI_PIPELINE_SOURCE == "web"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  variables:
    GIT_STRATEGY: fetch
  before_script:
    - apk update && apk add --no-cache git curl bash
    - npm install -g @anthropic-ai/claude-code
  script:
    - /bin/gitlab-mcp-server || true
    - >
      claude \
      -p "${AI_FLOW_INPUT:-'Review this MR and implement the requested changes'}" \
      --permission-mode acceptEdits \
      --allowedTools "Bash(*) Read(*) Edit(*) Write(*) mcp__gitlab" \
      --debug
```

For Bedrock/Vertex flows, add OIDC/WIF steps and pass model flags as needed.

---

## 11) MCP configuration (project scope)

### `./.mcp.json`

```json
{
  "mcpServers": {
    "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/" },
    "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp" },
    "notion": { "type": "http", "url": "https://mcp.notion.com/mcp" },
    "stripe": {
      "type": "http",
      "url": "https://mcp.stripe.com",
      "headers": { "Authorization": "Bearer ${STRIPE_TOKEN}" }
    },
    "airtable": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "airtable-mcp-server"],
      "env": { "AIRTABLE_API_KEY": "${AIRTABLE_API_KEY}" }
    }
  }
}
```

> Approvals: first load will prompt. Reset with `claude mcp reset-project-choices`.

### Add servers via CLI

```bash
# HTTP
claude mcp add --transport http notion https://mcp.notion.com/mcp

# SSE (deprecated transport)
claude mcp add --transport sse asana https://mcp.asana.com/sse

# stdio
claude mcp add --transport stdio airtable --env AIRTABLE_API_KEY=$AIRTABLE_API_KEY -- npx -y airtable-mcp-server
```

### OAuth auth in-app

Use `/mcp` → Authenticate. Tokens stored securely. Clear via `/mcp` menu.

---

## 12) Security and governance checklist

- **Secrets**: Only via CI secrets or env vars. Never commit keys.
- **Hooks**: Treat as code. Review diffs. Limit to read/edit where possible.
- **Tools**: Use `allowed-tools` in Skills. Restrict Bash in risky repos.
- **Branch protection**: Keep reviews required. CI must pass.
- **MCP**: Prefer HTTP from trusted vendors. Audit third‑party servers.
- **Rate/cost**: Cap `--max-turns` and set workflow timeouts.

---

## 13) First 60 minutes rollout

1. Copy this scaffold into a sample repo.
2. Add `ANTHROPIC_API_KEY` in GitHub/GitLab secrets.
3. Commit `.mcp.json` with at least GitHub and Sentry.
4. Push and open a PR.
5. Comment `@claude run /review` or use the workflow with `prompt: "/review"`.
6. Iterate on CLAUDE.md until outputs match your standards.
7. Enable hooks selectively in `hooks.json`.

---

## 14) Handy commands

```bash
# Inspect tools/servers
/mcp
/agents
/output-style
/hooks

# Headless scripted run
claude -p "/review" --output-format json --max-turns 5
```

---

Copy, adapt, and commit. This is production‑oriented and safe by default.
