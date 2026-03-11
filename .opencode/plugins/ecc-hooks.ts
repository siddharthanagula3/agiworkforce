/**
 * AGI Workforce Plugin Hooks for OpenCode
 *
 * Adapted from Everything Claude Code (ECC) hooks for the AGI Workforce
 * Tauri v2 + React/TS + Rust monorepo.
 *
 * Hook Event Mapping:
 * - PreToolUse  -> tool.execute.before
 * - PostToolUse -> tool.execute.after
 * - Stop        -> session.idle / session.status
 * - SessionStart -> session.created
 * - SessionEnd   -> session.deleted
 */

import type { PluginInput } from "@opencode-ai/plugin"

export const AGIWorkforceHooksPlugin = async ({
  client,
  $,
  directory,
  worktree,
}: PluginInput) => {
  type HookProfile = "minimal" | "standard" | "strict"

  // Track files edited in current session for console.log audit
  const editedFiles = new Set<string>()

  // Helper to call the SDK's log API with correct signature
  const log = (level: "debug" | "info" | "warn" | "error", message: string) =>
    client.app.log({ body: { service: "agi-workforce", level, message } })

  const normalizeProfile = (value: string | undefined): HookProfile => {
    if (value === "minimal" || value === "strict") return value
    return "standard"
  }

  const currentProfile = normalizeProfile(process.env.ECC_HOOK_PROFILE)
  const disabledHooks = new Set(
    (process.env.ECC_DISABLED_HOOKS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )

  const profileOrder: Record<HookProfile, number> = {
    minimal: 0,
    standard: 1,
    strict: 2,
  }

  const profileAllowed = (required: HookProfile | HookProfile[]): boolean => {
    if (Array.isArray(required)) {
      return required.some((entry) => profileOrder[currentProfile] >= profileOrder[entry])
    }
    return profileOrder[currentProfile] >= profileOrder[required]
  }

  const hookEnabled = (
    hookId: string,
    requiredProfile: HookProfile | HookProfile[] = "standard"
  ): boolean => {
    if (disabledHooks.has(hookId)) return false
    return profileAllowed(requiredProfile)
  }

  return {
    /**
     * Prettier Auto-Format Hook
     * Triggers: After any JS/TS/JSX/TSX file is edited
     * Action: Runs prettier --write on the file
     */
    "file.edited": async (event: { path: string }) => {
      // Track edited files for console.log audit
      editedFiles.add(event.path)

      // Auto-format JS/TS files
      if (hookEnabled("post:edit:format", ["standard", "strict"]) && event.path.match(/\.(ts|tsx|js|jsx)$/)) {
        try {
          await $`prettier --write ${event.path} 2>/dev/null`
          log("info", `[AGI] Formatted: ${event.path}`)
        } catch {
          // Prettier not installed or failed - silently continue
        }
      }

      // Auto-format Rust files
      if (hookEnabled("post:edit:format", ["standard", "strict"]) && event.path.match(/\.rs$/)) {
        try {
          await $`rustfmt ${event.path} 2>/dev/null`
          log("info", `[AGI] Formatted (rustfmt): ${event.path}`)
        } catch {
          // rustfmt not installed or failed - silently continue
        }
      }

      // Console.log warning check
      if (hookEnabled("post:edit:console-warn", ["standard", "strict"]) && event.path.match(/\.(ts|tsx|js|jsx)$/)) {
        try {
          const result = await $`grep -n "console\\.log" ${event.path} 2>/dev/null`.text()
          if (result.trim()) {
            const lines = result.trim().split("\n").length
            log(
              "warn",
              `[AGI] console.log found in ${event.path} (${lines} occurrence${lines > 1 ? "s" : ""})`
            )
          }
        } catch {
          // No console.log found (grep returns non-zero) - this is good
        }
      }
    },

    /**
     * TypeScript / Rust Check Hook
     * Triggers: After edit tool completes on .ts/.tsx/.rs files
     * Action: Runs tsc --noEmit or cargo check
     */
    "tool.execute.after": async (
      input: { tool: string; args?: { filePath?: string } },
      output: unknown
    ) => {
      // Check if a TypeScript file was edited
      if (
        hookEnabled("post:edit:typecheck", ["standard", "strict"]) &&
        input.tool === "edit" &&
        input.args?.filePath?.match(/\.tsx?$/)
      ) {
        try {
          await $`pnpm typecheck 2>&1`
          log("info", "[AGI] TypeScript check passed")
        } catch (error: unknown) {
          const err = error as { stdout?: string }
          log("warn", "[AGI] TypeScript errors detected:")
          if (err.stdout) {
            const errors = err.stdout.split("\n").slice(0, 5)
            errors.forEach((line: string) => log("warn", `  ${line}`))
          }
        }
      }

      // Check if a Rust file was edited
      if (
        hookEnabled("post:edit:rustcheck", ["standard", "strict"]) &&
        input.tool === "edit" &&
        input.args?.filePath?.match(/\.rs$/)
      ) {
        try {
          await $`cargo check 2>&1`
          log("info", "[AGI] Rust check passed")
        } catch (error: unknown) {
          const err = error as { stdout?: string }
          log("warn", "[AGI] Rust compilation errors detected:")
          if (err.stdout) {
            const errors = err.stdout.split("\n").slice(0, 5)
            errors.forEach((line: string) => log("warn", `  ${line}`))
          }
        }
      }

      // PR creation logging
      if (
        hookEnabled("post:bash:pr-created", ["standard", "strict"]) &&
        input.tool === "bash" &&
        input.args?.toString().includes("gh pr create")
      ) {
        log("info", "[AGI] PR created - check GitHub Actions status")
      }
    },

    /**
     * Pre-Tool Security Check
     * Triggers: Before tool execution
     * Action: Warns about potential security issues
     */
    "tool.execute.before": async (
      input: { tool: string; args?: Record<string, unknown> }
    ) => {
      // Git push review reminder
      if (
        hookEnabled("pre:bash:git-push-reminder", "strict") &&
        input.tool === "bash" &&
        input.args?.toString().includes("git push")
      ) {
        log(
          "info",
          "[AGI] Remember to review changes before pushing: git diff origin/main...HEAD"
        )
      }

      // Block creation of unnecessary documentation files
      if (
        hookEnabled("pre:write:doc-file-warning", ["standard", "strict"]) &&
        input.tool === "write" &&
        input.args?.filePath &&
        typeof input.args.filePath === "string"
      ) {
        const filePath = input.args.filePath
        if (
          filePath.match(/\.(md|txt)$/i) &&
          !filePath.includes("README") &&
          !filePath.includes("CHANGELOG") &&
          !filePath.includes("LICENSE") &&
          !filePath.includes("CONTRIBUTING") &&
          !filePath.includes("CLAUDE.md")
        ) {
          log(
            "warn",
            `[AGI] Creating ${filePath} - consider if this documentation is necessary`
          )
        }
      }

      // Tauri IPC snake_case detection
      if (
        hookEnabled("pre:edit:tauri-ipc-check", ["standard", "strict"]) &&
        input.tool === "edit" &&
        input.args?.filePath &&
        typeof input.args.filePath === "string" &&
        input.args.filePath.match(/\.(ts|tsx)$/)
      ) {
        const content = String(input.args.content || input.args.new_string || "")
        if (content.includes("invoke(") && content.match(/[a-z]+_[a-z]+/)) {
          log(
            "warn",
            `[AGI] Potential snake_case in Tauri invoke() call - use camelCase for IPC params`
          )
        }
      }

      // Long-running command reminder
      if (hookEnabled("pre:bash:tmux-reminder", "strict") && input.tool === "bash") {
        const cmd = String(input.args?.command || input.args || "")
        if (
          cmd.match(/^(pnpm)\s+(install|build|test|run)/) ||
          cmd.match(/^cargo\s+(build|test|run)/)
        ) {
          log(
            "info",
            "[AGI] Long-running command detected - consider using background execution"
          )
        }
      }
    },

    /**
     * Session Created Hook
     * Triggers: When a new session starts
     * Action: Loads context and displays welcome message
     */
    "session.created": async () => {
      if (!hookEnabled("session:start", ["minimal", "standard", "strict"])) return

      log("info", `[AGI] Session started - profile=${currentProfile}`)

      // Check for project-specific context files
      try {
        const hasClaudeMd = await $`test -f ${worktree}/CLAUDE.md && echo "yes"`.text()
        if (hasClaudeMd.trim() === "yes") {
          log("info", "[AGI] Found CLAUDE.md - loading project context")
        }
      } catch {
        // No CLAUDE.md found
      }
    },

    /**
     * Session Idle Hook
     * Triggers: When session becomes idle (task completed)
     * Action: Runs console.log audit on all edited files
     */
    "session.idle": async () => {
      if (!hookEnabled("stop:check-console-log", ["minimal", "standard", "strict"])) return
      if (editedFiles.size === 0) return

      log("info", "[AGI] Session idle - running console.log audit")

      let totalConsoleLogCount = 0
      const filesWithConsoleLogs: string[] = []

      for (const file of editedFiles) {
        if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue

        try {
          const result = await $`grep -c "console\\.log" ${file} 2>/dev/null`.text()
          const count = parseInt(result.trim(), 10)
          if (count > 0) {
            totalConsoleLogCount += count
            filesWithConsoleLogs.push(file)
          }
        } catch {
          // No console.log found
        }
      }

      if (totalConsoleLogCount > 0) {
        log(
          "warn",
          `[AGI] Audit: ${totalConsoleLogCount} console.log statement(s) in ${filesWithConsoleLogs.length} file(s)`
        )
        filesWithConsoleLogs.forEach((f) =>
          log("warn", `  - ${f}`)
        )
        log("warn", "[AGI] Remove console.log statements before committing")
      } else {
        log("info", "[AGI] Audit passed: No console.log statements found")
      }

      // Desktop notification (macOS)
      try {
        await $`osascript -e 'display notification "Task completed!" with title "AGI Workforce OpenCode"' 2>/dev/null`
      } catch {
        // Notification not supported or failed
      }

      // Clear tracked files for next task
      editedFiles.clear()
    },

    /**
     * Session Deleted Hook
     * Triggers: When session ends
     * Action: Final cleanup and state saving
     */
    "session.deleted": async () => {
      if (!hookEnabled("session:end-marker", ["minimal", "standard", "strict"])) return
      log("info", "[AGI] Session ended - cleaning up")
      editedFiles.clear()
    },

    /**
     * File Watcher Hook (OpenCode-only)
     * Triggers: When file system changes are detected
     * Action: Updates tracking
     */
    "file.watcher.updated": async (event: { path: string; type: string }) => {
      if (event.type === "change" && event.path.match(/\.(ts|tsx|js|jsx|rs)$/)) {
        editedFiles.add(event.path)
      }
    },

    /**
     * Todo Updated Hook (OpenCode-only)
     * Triggers: When todo list is updated
     * Action: Logs progress
     */
    "todo.updated": async (event: { todos: Array<{ text: string; done: boolean }> }) => {
      const completed = event.todos.filter((t) => t.done).length
      const total = event.todos.length
      if (total > 0) {
        log("info", `[AGI] Progress: ${completed}/${total} tasks completed`)
      }
    },

    /**
     * Shell Environment Hook (OpenCode-specific)
     * Triggers: Before shell command execution
     * Action: Sets PROJECT_ROOT, PACKAGE_MANAGER, DETECTED_LANGUAGES
     */
    "shell.env": async () => {
      const env: Record<string, string> = {
        ECC_VERSION: "1.8.0",
        ECC_PLUGIN: "true",
        ECC_HOOK_PROFILE: currentProfile,
        ECC_DISABLED_HOOKS: process.env.ECC_DISABLED_HOOKS || "",
        PROJECT_ROOT: worktree || directory,
        PACKAGE_MANAGER: "pnpm",
        DETECTED_LANGUAGES: "typescript,rust",
        PRIMARY_LANGUAGE: "typescript",
      }

      return env
    },

    /**
     * Session Compacting Hook (OpenCode-specific)
     * Triggers: Before context compaction
     * Action: Push context block and custom compaction prompt
     */
    "experimental.session.compacting": async () => {
      const contextBlock = [
        "# AGI Workforce Context (preserve across compaction)",
        "",
        "## Active Plugin: AGI Workforce OpenCode v1.0.0",
        "- Stack: Tauri v2 (Rust) + React 19 (TypeScript) + Next.js 16 + React Native",
        "- Package manager: pnpm workspaces",
        "- Hooks: file.edited, tool.execute.before/after, session.created/idle/deleted, shell.env, compacting, permission.ask",
        "- Tools: run-tests, check-coverage, security-audit, format-code, lint-check, git-summary",
        "- Agents: 13 specialized (planner, architect, tdd-guide, code-reviewer, security-reviewer, build-error-resolver, e2e-runner, refactor-cleaner, doc-updater, rust-reviewer, rust-build-resolver, database-reviewer)",
        "",
        "## Key Principles",
        "- Security: ToolGuard + SecretManager (Argon2id + AES-GCM), never plaintext",
        "- Tauri IPC: camelCase params in invoke(), snake_case in Rust handlers",
        "- TDD: write tests first, 80%+ coverage",
        "- Immutability: never mutate, always return new copies",
        "- Commits: type(scope): lowercase subject, max 100 chars",
        "",
      ]

      // Include recently edited files
      if (editedFiles.size > 0) {
        contextBlock.push("## Recently Edited Files")
        for (const f of editedFiles) {
          contextBlock.push(`- ${f}`)
        }
        contextBlock.push("")
      }

      return {
        context: contextBlock.join("\n"),
        compaction_prompt: "Focus on preserving: 1) Current task status and progress, 2) Key decisions made, 3) Files created/modified, 4) Remaining work items, 5) Any security concerns flagged, 6) Tauri IPC correctness issues. Discard: verbose tool outputs, intermediate exploration, redundant file listings.",
      }
    },

    /**
     * Permission Auto-Approve Hook (OpenCode-specific)
     * Triggers: When permission is requested
     * Action: Auto-approve safe operations; log all for audit
     */
    "permission.ask": async (event: { tool: string; args: unknown }) => {
      log("info", `[AGI] Permission requested for: ${event.tool}`)

      const cmd = String((event.args as Record<string, unknown>)?.command || event.args || "")

      // Auto-approve: read/search tools
      if (["read", "glob", "grep", "search", "list"].includes(event.tool)) {
        return { approved: true, reason: "Read-only operation" }
      }

      // Auto-approve: formatters
      if (event.tool === "bash" && /^(pnpm |npx )?(prettier|biome|rustfmt)/.test(cmd)) {
        return { approved: true, reason: "Formatter execution" }
      }

      // Auto-approve: type checking and linting
      if (event.tool === "bash" && /^(pnpm typecheck|cargo check|cargo clippy|pnpm lint)/.test(cmd)) {
        return { approved: true, reason: "Type check / lint execution" }
      }

      // Auto-approve: test execution
      if (event.tool === "bash" && /^(pnpm test|npx vitest|cargo test)/.test(cmd)) {
        return { approved: true, reason: "Test execution" }
      }

      // Everything else: let user decide
      return { approved: undefined }
    },
  }
}

export default AGIWorkforceHooksPlugin
