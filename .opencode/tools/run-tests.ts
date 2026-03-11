/**
 * Run Tests Tool
 *
 * Custom OpenCode tool to run test suites with various options.
 * Supports the AGI Workforce monorepo: pnpm workspaces + cargo test.
 */

import { tool } from "@opencode-ai/plugin/tool"
import * as path from "path"
import * as fs from "fs"

export default tool({
  description:
    "Run the test suite with optional coverage, watch mode, or specific test patterns. Supports pnpm workspaces (Vitest, Playwright) and cargo test for Rust.",
  args: {
    workspace: tool.schema
      .enum(["desktop", "web", "mobile", "api-gateway", "rust", "all"])
      .optional()
      .describe("Workspace to test (default: desktop)"),
    pattern: tool.schema
      .string()
      .optional()
      .describe("Test file pattern or specific test name to run"),
    coverage: tool.schema
      .boolean()
      .optional()
      .describe("Run with coverage reporting (default: false)"),
    watch: tool.schema
      .boolean()
      .optional()
      .describe("Run in watch mode for continuous testing (default: false)"),
    updateSnapshots: tool.schema
      .boolean()
      .optional()
      .describe("Update Vitest snapshots (default: false)"),
  },
  async execute(args, context) {
    const { pattern, coverage, watch, updateSnapshots } = args
    const workspace = args.workspace ?? "desktop"
    const cwd = context.worktree || context.directory

    if (workspace === "rust") {
      // Rust tests via cargo
      let cmd = "cargo test"
      if (pattern) {
        cmd += ` -- ${pattern}`
      }
      return JSON.stringify({
        command: cmd,
        packageManager: "cargo",
        testFramework: "cargo-test",
        workspace: "rust",
        options: {
          pattern: pattern || "all tests",
          coverage: false,
          watch: false,
          updateSnapshots: false,
        },
        instructions: `Run this command to execute Rust tests:\n\n${cmd}`,
      })
    }

    // Map workspace to directory
    const workspaceDirs: Record<string, string> = {
      desktop: "apps/desktop",
      web: "apps/web",
      mobile: "apps/mobile",
      "api-gateway": "services/api-gateway",
    }

    const workspaceDir = workspaceDirs[workspace] || "apps/desktop"

    // Build command
    const cmd: string[] = ["pnpm", "test"]

    // Add options
    const testArgs: string[] = []

    if (coverage) {
      testArgs.push("--coverage")
    }

    if (watch) {
      testArgs.push("--watch")
    }

    if (updateSnapshots) {
      testArgs.push("-u")
    }

    if (pattern) {
      testArgs.push(pattern)
    }

    if (testArgs.length > 0) {
      cmd.push(...testArgs)
    }

    const command = `cd ${workspaceDir} && ${cmd.join(" ")}`

    return JSON.stringify({
      command,
      packageManager: "pnpm",
      testFramework: workspace === "web" ? "next-test" : "vitest",
      workspace,
      options: {
        pattern: pattern || "all tests",
        coverage: coverage || false,
        watch: watch || false,
        updateSnapshots: updateSnapshots || false,
      },
      instructions: `Run this command to execute tests:\n\n${command}`,
    })
  },
})
