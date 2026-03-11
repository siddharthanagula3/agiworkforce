/**
 * AGI Workforce OpenCode Plugin
 *
 * This package provides the AGI Workforce OpenCode plugin module:
 * - Plugin hooks (auto-format, TypeScript/Rust check, console.log warning, env injection, etc.)
 * - Custom tools (run-tests, check-coverage, security-audit, format-code, lint-check, git-summary)
 * - Bundled reference config/assets for the AGI Workforce OpenCode setup
 *
 * @packageDocumentation
 */

// Export the main plugin
export { AGIWorkforceHooksPlugin, default } from "./plugins/index.js"

// Export individual components for selective use
export * from "./plugins/index.js"

// Version export
export const VERSION = "1.0.0"

// Plugin metadata
export const metadata = {
  name: "agi-workforce-opencode",
  version: VERSION,
  description: "AGI Workforce OpenCode plugin (Tauri v2 + React/TS + Rust monorepo)",
  features: {
    agents: 13,
    commands: 29,
    configAssets: true,
    hookEvents: [
      "file.edited",
      "tool.execute.before",
      "tool.execute.after",
      "session.created",
      "session.idle",
      "session.deleted",
      "file.watcher.updated",
      "permission.ask",
      "todo.updated",
      "shell.env",
      "experimental.session.compacting",
    ],
    customTools: [
      "run-tests",
      "check-coverage",
      "security-audit",
      "format-code",
      "lint-check",
      "git-summary",
    ],
  },
}
