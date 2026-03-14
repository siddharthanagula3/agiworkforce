# Sub-Feature: Git

> Native Git version control and GitHub App integration -- local `git2` operations via Tauri IPC plus server-side GitHub webhook-driven AI code review.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust backend | `apps/desktop/src-tauri/src/sys/commands/git.rs` (1782 lines, 35 commands) |
| Rust backend | `apps/desktop/src-tauri/src/sys/commands/github.rs` (GitHub repo cloning/context) |
| Rust backend | `apps/desktop/src-tauri/src/core/agi/executors/` (PR workflow, conflict resolution) |
| Frontend hook | `apps/desktop/src/hooks/useGit.ts` (549 lines) |
| Frontend components | `apps/desktop/src/components/Git/` (4 components + barrel export) |
| Frontend sidecar | `apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx` (lazy-loads GitPanel) |
| MCP bundle | `apps/desktop/src-tauri/src/sys/commands/mcpb.rs` (built-in git MCP server definition) |
| MCP catalog | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` (git tools in featured servers) |
| Tool events | `apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs` (Git display labels) |
| Capabilities | `apps/desktop/src-tauri/src/sys/commands/capabilities.rs` (`git_clone` -> `gitIntegration`) |
| Security | `apps/desktop/src-tauri/src/sys/security/command_validator.rs` (confirmation rules) |
| Code editing | `apps/desktop/src-tauri/src/sys/commands/code_editing.rs` (`try_git_revert` fallback) |
| Web API | `apps/web/app/api/github/install/route.ts` (GitHub App install callback) |
| Web API | `apps/web/app/api/github/installations/route.ts` (list/delete installations) |
| Web API | `apps/web/app/api/github/webhook/route.ts` (webhook-driven PR review) |
| Web lib | `apps/web/lib/github-app.ts` (JWT auth, token mgmt, GitHub API helpers) |

## Architecture Overview

The Git feature spans two independent subsystems:

### 1. Desktop Native Git (via `git2` crate)

All local Git operations run through `libgit2` bindings (the `git2` Rust crate), not shell commands. This gives the desktop app full programmatic Git control without requiring `git` CLI on the system.

```
Frontend (useGit hook)
    |
    |  invoke('git_status', { path })
    v
Tauri IPC (#[tauri::command])
    |
    |  spawn_blocking(move || { ... })
    v
git2::Repository operations (blocking thread pool)
    |
    v
Result<T, String> -> serialized to frontend
```

Key design decisions:
- All git2 operations run inside `spawn_blocking` to avoid blocking the async runtime
- Credential handling uses a multi-tier fallback chain: SSH agent -> SSH key files (`~/.ssh/id_ed25519`, `id_rsa`, `id_ecdsa`) -> system credential helper
- Fallback committer identity: when `user.name`/`user.email` are not configured, uses `"AGI Agent" <agent@agiworkforce.com>` with a tracing warning
- Destructive operations (`git_push`, `git_delete_branch`, `git_reset`) enforce user confirmation via `tool_confirmation::request_confirmation_simple`

### 2. Web GitHub App Integration

The Next.js web app provides a GitHub App integration for AI-powered PR review:

```
GitHub Webhook (issue_comment event)
    |
    v
/api/github/webhook (HMAC-SHA256 verified)
    |
    |  Check: @agi-workforce mention? PR comment? Not bot?
    v
Fetch PR diff via GitHub API
    |
    v
Send to Claude (claude-haiku-4-5) for review
    |
    v
Post review comment back to PR
```

## Git Operations

### Core Operations (17 commands registered in lib.rs)

| Command | Description | Confirmation Required |
|---------|-------------|----------------------|
| `git_init` | Initialize a new repository | No |
| `git_status` | Get branch, staged/unstaged/untracked/conflicts | No |
| `git_add` | Stage files (supports "." for all) | No |
| `git_commit` | Create commit with message | No |
| `git_push` | Push to remote (supports force) | Yes |
| `git_pull` | Fetch + merge from remote | No |
| `git_clone` | Clone repository to destination | No |
| `git_diff` | Get file diffs (staged or unstaged) | No |
| `git_log` | Get commit history (default limit: 50) | No |
| `git_create_branch` | Create branch from HEAD | No |
| `git_checkout` | Switch to existing branch | No |
| `git_checkout_new_branch` | Create + switch to new branch | No |
| `git_list_branches` | List local branches with current indicator | No |
| `git_delete_branch` | Delete local branch | Yes |
| `git_stash` | Stash working changes | No |
| `git_stash_pop` | Apply and drop top stash entry | No |
| `git_reset` | Reset to commit (soft/mixed/hard) | Yes |

### Extended Operations (not registered in lib.rs -- internal/future use)

| Command | Description |
|---------|-------------|
| `git_fetch` | Fetch from remote without merging |
| `git_merge` | Merge branch (fast-forward or normal) |
| `git_list_remotes` | List configured remotes with URLs |
| `git_add_remote` | Add a new remote |
| `git_list_conflicts` | List files with merge conflicts |
| `git_get_conflict_details` | Parse conflict hunks from a file |
| `git_resolve_conflict` | Apply resolutions (keep_ours/theirs/both/manual/llm_suggested) |
| `git_mark_resolved` | Stage resolved file (validates no markers remain) |
| `git_get_conflict_suggestion_prompt` | Generate LLM prompt for conflict resolution |
| `git_has_conflicts` | Check if repo is in conflicted state |
| `git_abort_merge` | Abort in-progress merge (reset --hard to HEAD) |
| `git_complete_merge` | Finalize merge commit after conflict resolution |
| `git_get_branch_diff_summary` | Compare branches for PR preview |
| `git_generate_pr_description` | AI-generated PR title/description via LLMRouter |
| `git_create_pr` | Full PR creation workflow |
| `git_check_pr_readiness` | Validate branch is ready for PR |
| `git_current_branch` | Get current branch name (handles detached HEAD) |
| `git_default_branch` | Detect default branch (main/master/develop/remote HEAD) |

## Conflict Resolution System

The conflict resolution pipeline is a distinctive feature:

1. **Detection**: `git_list_conflicts` checks both `git2::Status::CONFLICTED` and file-level conflict marker scanning via `ConflictParser::has_conflicts()`
2. **Parsing**: `git_get_conflict_details` uses `ConflictParser::parse_conflicts()` to extract individual conflict hunks with "ours" and "theirs" content
3. **Resolution strategies**: `keep_ours`, `keep_theirs`, `keep_both`, `manual`, `llm_suggested`
4. **AI assist**: `git_get_conflict_suggestion_prompt` generates a prompt for the LLM router to suggest a merge resolution
5. **Validation**: `git_mark_resolved` refuses to stage if conflict markers remain
6. **Completion**: `git_complete_merge` creates the merge commit with all merge heads, then calls `cleanup_state()`

Resolution types are defined in `core/agi/executors/` (imported structs: `ConflictHunk`, `ConflictParser`, `ConflictResolver`, `HunkResolution`, `ResolutionStrategy`, `ResolutionResult`).

## PR Creation Workflow

The PR workflow uses `PrCreationWorkflow` from `core/agi/executors/`:

1. **Readiness check** (`git_check_pr_readiness`): validates base/head branches exist, commits ahead > 0, remote tracking branch status, uncommitted changes
2. **Diff summary** (`git_get_branch_diff_summary`): collects commits, files changed, diff stats between branches
3. **AI description** (`git_generate_pr_description`): sends diff summary to LLMRouter to generate conventional-commit-style title and structured PR body
4. **Creation** (`git_create_pr`): orchestrates the full workflow via `PrCreationWorkflow::create_pull_request_workflow()`

Note: actual GitHub PR creation requires GitHub API integration (via MCP or direct API). The desktop commands prepare content and return `PrCreationResult`.

## GitHub Integration (Desktop)

`github.rs` provides a separate GitHub repository management layer:

| Command | Description |
|---------|-------------|
| `github_clone_repo` | Clone and index a GitHub repo (builds RepoContext) |
| `github_get_repo_context` | Get cached repo metadata |
| `github_search_files` | Search files in a cloned repo by path/content |
| `github_read_file` | Read a file from a cloned repo |
| `github_get_file_tree` | Get directory tree (via `tree` command, falls back to `ls -R`) |
| `github_list_repos` | List all managed repos |

State is managed via `GitHubState` (stored in `Arc<Mutex<GitHubState>>`):
- `repos: HashMap<String, RepoContext>` -- in-memory cache of cloned repo metadata
- `workspace_dir: PathBuf` -- base directory for cloning

`RepoContext` includes: repo metadata, file list with content, directory tree, README, and language analysis (14 languages detected by extension).

These GitHub commands are registered in `lib.rs` and exposed via IPC.

## MCP Integration

Git operations are surfaced to AI agents through two MCP pathways:

### Built-in MCP Git Bundle (`mcpb.rs`)

A built-in MCP server definition with 12 tools that mirrors the `mcp-server-git` package:

| MCP Tool | Parameters |
|----------|-----------|
| `git_status` | `repo_path` |
| `git_diff_unstaged` | `repo_path`, `context_lines?` |
| `git_diff_staged` | `repo_path`, `context_lines?` |
| `git_diff` | `repo_path`, `target`, `context_lines?` |
| `git_commit` | `repo_path`, `message` |
| `git_add` | `repo_path`, `files` |
| `git_reset` | `repo_path` |
| `git_log` | `repo_path`, `max_count?`, `start_timestamp?`, `end_timestamp?` |
| `git_create_branch` | `repo_path`, `branch_name`, `base_branch?` |
| `git_checkout` | `repo_path`, `branch_name` |
| `git_show` | `repo_path`, `revision` |
| `git_branch` | `repo_path`, `branch_type`, `contains?`, `not_contains?` |

Config template: `uvx mcp-server-git` with `--repository` argument.

### Featured MCP Server (`mcp.rs`)

Git appears in the featured MCP server catalog as the `mcp-server-git` package (v0.6.2, category: "development", rating: 4.8, 142K installs), offering the same 12 tool names for external MCP server connection.

## Frontend Components

### `useGit` Hook (`hooks/useGit.ts`)

Central React hook managing all Git operations. Provides:

- **State**: `status` (GitStatus), `loading`, `error`, `repoPath`
- **Operations**: `stage`, `unstage`, `stageAll`, `unstageAll`, `discardChanges`, `commit`, `push`, `pull`, `getDiff`, `listBranches`, `checkout`, `createBranch`, `getLog`, `stash`, `stashPop`
- **Pattern**: Each operation sets loading state, invokes Tauri command, shows Sonner toast on success/error, auto-refreshes status after mutation

TypeScript interfaces mirror Rust structs: `GitStatus`, `GitCommit`, `GitBranch`, `GitDiff`.

### `GitPanel` (`components/Git/GitPanel.tsx`)

Top-level container with:
- Header: branch name badge, pull/push buttons with ahead/behind counts, commit button, refresh
- Tabbed content: "Changes" (GitStatusPanel), "Diff" (GitDiffViewer for selected file), "Staged" (GitDiffViewer for all staged)
- GitCommitDialog modal

Lazy-loaded in `DynamicSidecar.tsx` as a chat sidecar panel (triggered by `'git'` sidecar type).

### `GitStatusPanel` (`components/Git/GitStatusPanel.tsx`)

File status viewer with:
- Collapsible sections: Merge Conflicts (red), Staged Changes (green), Changed (amber), Untracked (blue)
- Per-file and bulk selection via checkboxes
- Stage/Unstage/Stage Selected/Unstage Selected action bar
- Click-to-diff file selection
- Footer with counts summary
- Error state with retry button

### `GitDiffViewer` (`components/Git/GitDiffViewer.tsx`)

Unified diff renderer:
- Parses diff content into typed lines (add/remove/context/header)
- Color-coded: green for additions, red for deletions, blue for hunk headers
- Line numbers extracted from `@@ ... +N` hunk headers
- Per-file and total addition/deletion statistics
- Sticky file headers for multi-file diffs

### `GitCommitDialog` (`components/Git/GitCommitDialog.tsx`)

Commit creation dialog:
- Subject line with 72-char limit indicator (turns red when exceeded)
- Optional body textarea (blank line separation guidance)
- Staged files preview list
- Warning when no files are staged
- Cmd/Ctrl+Enter keyboard shortcut to commit
- Combines subject + body into full message with blank line separator

## Tool Event Display

In `tool_events.rs`, git-related MCP tools are matched by prefix `"git_"` and displayed as:
- **Display name**: `"Git"`
- **Display args**: last segment of MCP tool name with underscores replaced by spaces (e.g., `mcp__git__git_status` -> `"git status"`)

## Web API Routes

### `POST /api/github/webhook`

GitHub webhook handler for AI PR review:
- HMAC-SHA256 signature verification (no CSRF -- webhook signature IS authentication)
- Rate-limited via Upstash Redis (`github-webhook` key)
- Handles `issue_comment` events where `@agi-workforce` is mentioned
- Skips bot's own comments (infinite loop prevention)
- Only processes PR comments (issues with `pull_request` key)
- Fetches PR diff (truncated at 50K chars), sends to Claude Haiku for review
- Posts review as issue comment with branded footer
- Async processing via `waitUntil` (Vercel) or fire-and-forget

### `GET /api/github/install`

GitHub App installation callback:
- Receives `installation_id`, `account_login`, `account_type` from GitHub
- Upserts to `github_installations` table (Supabase)
- Requires authenticated user (redirects to login if not)

### `GET /api/github/installations`

List user's GitHub App installations:
- Returns `id`, `installation_id`, `account_login`, `account_type`, `pr_review_enabled`, `review_model`, `created_at`
- Authenticated via Supabase auth

### `DELETE /api/github/installations`

Disconnect a GitHub App installation:
- Accepts `installationId` in request body
- Deletes from `github_installations` table (scoped to user)

## `github-app.ts` Library

Server-side GitHub App utilities:

| Function | Purpose |
|----------|---------|
| `verifyGitHubWebhookSignature` | HMAC-SHA256 timing-safe signature verification |
| `getGitHubAppJwt` | RS256 JWT generation using Node.js crypto (no jose dependency) |
| `getInstallationAccessToken` | Token fetch with encrypted caching (AES-256-GCM) in Supabase |
| `getPrDiff` | Fetch PR diff via GitHub API (50K char truncation) |
| `postPrReview` | Submit PR review (COMMENT/APPROVE/REQUEST_CHANGES) |
| `postIssueComment` | Post issue/PR comment |
| `encryptToken` / `decryptToken` | AES-256-GCM token encryption for Supabase storage |

Environment variables: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY`.

## Key Patterns

### Credential Chain (`make_git_credentials`)

Multi-platform credential fallback:
1. SSH agent (`Cred::ssh_key_from_agent`) -- works on macOS/Linux by default
2. SSH key files (`~/.ssh/id_ed25519`, `id_rsa`, `id_ecdsa`) -- probes standard locations
3. System credential helper (`Cred::credential_helper`) -- for HTTPS remotes, especially Windows
4. Error if none succeed

### Destructive Operation Confirmation

Three git commands require user confirmation via `command_validator::requires_confirmation`:
- `git_push` -- checks `"git push"` pattern
- `git_delete_branch` -- checks `"git branch -D"` pattern
- `git_reset` -- checks `"git reset"` pattern (matches `"git reset --hard"` in the dangerous commands list)

The confirmation is dispatched via `tool_confirmation::request_confirmation_simple(&app, tool_name, &args)` which emits a Tauri event to the frontend for user approval.

### Capability Gating

The `git_clone` command is gated by the `gitIntegration` capability toggle in `capabilities.rs`. When disabled in user settings, git clone operations are blocked.

### Error Handling

All git2 operations use `.map_err(|e| e.message().to_string())` to convert `git2::Error` to `String` for IPC serialization. No panics or unwraps in the git command handlers (AUDIT-003-004 fix).

### Code Editing Fallback

`code_editing.rs` uses `try_git_revert` as a fallback when no edit history exists for a file revert operation. This uses shell `git checkout HEAD -- <path>` (one of the rare shell-based git calls, since it targets a specific code-editing use case).

## Data Types

### Rust Structs (serialized to frontend)

```rust
GitStatus { branch, ahead, behind, staged, unstaged, untracked, conflicts }
GitCommit { hash, author, email, date, message }
GitBranch { name, is_current, last_commit }
GitDiff { file_path, additions, deletions, diff_content }
GitConflictDetails { file_path, full_content, hunks: Vec<ConflictHunk>, conflict_count }
ConflictResolutionRequest { hunk_index, strategy, manual_content? }
PrReadinessResult { ready, issues, commits_ahead, has_remote, remote_up_to_date }
GitHubRepo { owner, name, url, branch?, local_path? }
RepoContext { repo, files, structure, readme?, languages }
RepoFile { path, content?, file_type, size }
```

### TypeScript Interfaces (mirror Rust)

```typescript
GitStatus { branch, ahead, behind, staged, unstaged, untracked, conflicts }
GitCommit { hash, author, email, date, message }
GitBranch { name, is_current, last_commit }
GitDiff { file_path, additions, deletions, diff_content }
```

## Known Issues / Tech Debt

1. **Unregistered commands**: 18+ git commands defined in `git.rs` are NOT registered in `lib.rs` (conflict resolution, PR creation, merge, fetch, remotes, current/default branch). They exist as Rust code but cannot be invoked from the frontend. The `github.rs` commands are similarly unregistered.

2. **IPC param casing**: The `useGit` hook uses `file_path` (snake_case) in the `getDiff` invoke call (`file_path: filePath ?? null`), which may silently fail per the Tauri camelCase IPC rule. Should be `filePath`.

3. **Unstage limitation**: `useGit.unstage()` uses `git_reset` with `commit: 'HEAD', mode: 'mixed'` which resets ALL staged files, not just the specified ones. The `files` parameter is accepted but ignored -- the toast message incorrectly claims specific files were unstaged.

4. **Discard limitation**: `useGit.discardChanges()` similarly uses `git reset --hard HEAD` which resets the entire working tree, not just the specified files. Dangerous for partial operations.

5. **Missing `git_show`/`git_branch` IPC**: The MCP bundle defines `git_show` and `git_branch` tools, but no corresponding Tauri command exists in `git.rs` for direct IPC invocation.

6. **GitHub cloning credentials**: Fixed in the live runtime. `github.rs` now reuses the same `make_git_credentials` fallback chain as `git.rs`, so HTTPS remotes can use the system credential helper instead of failing on SSH-only auth.

7. **Pull merge commit message**: `git_pull` uses the hardcoded message `"Merge"` for non-fast-forward merges. Should use a more descriptive message.

8. **Fallback signature identity**: Three commands (`git_commit`, `git_merge`, `git_complete_merge`) fall back to `"AGI Agent" <agent@agiworkforce.com>` when git user config is missing. This is logged as a warning but could confuse users reviewing commit history.

9. **PR creation incomplete**: `git_create_pr` prepares PR content but cannot actually create GitHub PRs -- it requires external GitHub API integration (via MCP or direct API call). The result is a `PrCreationResult` that the caller must act on.

10. **GitDiffViewer import**: Uses `import { invoke } from '../../lib/tauri-mock'` directly instead of `@tauri-apps/api/core`, inconsistent with other components.

11. **No git store**: Git state is managed entirely in the `useGit` hook's local React state. There is no Zustand store for git operations, meaning git status is not shared across components without prop drilling through the hook.
