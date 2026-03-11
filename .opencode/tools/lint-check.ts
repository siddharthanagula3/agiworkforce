/**
 * AGI Workforce Custom Tool: Lint Check
 *
 * Detects the appropriate linter and returns a runnable lint command.
 * Supports ESLint (TS/JS), Biome, and cargo clippy (Rust).
 */

import { tool } from "@opencode-ai/plugin/tool"
import * as path from "path"
import * as fs from "fs"

type Linter = "biome" | "eslint" | "clippy"

export default tool({
  description:
    "Detect linter for a target path and return command for check/fix runs. Supports ESLint, Biome, and cargo clippy.",
  args: {
    target: tool.schema
      .string()
      .optional()
      .describe("File or directory to lint (default: current directory)"),
    fix: tool.schema
      .boolean()
      .optional()
      .describe("Enable auto-fix mode"),
    linter: tool.schema
      .enum(["biome", "eslint", "clippy"])
      .optional()
      .describe("Optional linter override"),
  },
  async execute(args, context) {
    const cwd = context.worktree || context.directory
    const target = args.target || "."
    const fix = args.fix ?? false

    // Auto-detect: if target is a .rs file, use clippy
    const isRust = target.endsWith(".rs") || target.includes("src-tauri")
    const detected = args.linter || (isRust ? "clippy" : detectLinter(cwd))

    const command = buildLintCommand(detected, target, fix)
    return JSON.stringify({
      success: true,
      linter: detected,
      command,
      instructions: `Run this command:\n\n${command}`,
    })
  },
})

function detectLinter(cwd: string): Linter {
  if (fs.existsSync(path.join(cwd, "biome.json")) || fs.existsSync(path.join(cwd, "biome.jsonc"))) {
    return "biome"
  }

  const eslintConfigs = [
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    "eslint.config.js",
    "eslint.config.mjs",
  ]
  if (eslintConfigs.some((name) => fs.existsSync(path.join(cwd, name)))) {
    return "eslint"
  }

  return "eslint"
}

function buildLintCommand(linter: Linter, target: string, fix: boolean): string {
  if (linter === "biome") return `pnpm exec biome lint${fix ? " --write" : ""} ${target}`
  if (linter === "eslint") return `pnpm lint${fix ? " --fix" : ""}`
  // clippy
  return `cargo clippy${fix ? " --fix --allow-dirty" : ""} -- -D warnings`
}
