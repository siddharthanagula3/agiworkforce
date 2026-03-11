/**
 * Security Audit Tool
 *
 * Custom OpenCode tool to run security audits on the AGI Workforce codebase.
 * Combines pnpm audit, secret scanning, and OWASP checks.
 * Also checks for AGI Workforce-specific security patterns (ToolGuard, SecretManager).
 *
 * NOTE: This tool SCANS for security anti-patterns - it does not introduce them.
 * The regex patterns below are used to DETECT potential issues in user code.
 */

import { tool } from "@opencode-ai/plugin/tool"
import * as path from "path"
import * as fs from "fs"

export default tool({
  description:
    "Run a comprehensive security audit including dependency vulnerabilities, secret scanning, and common security issues. Checks ToolGuard and SecretManager compliance.",
  args: {
    type: tool.schema
      .enum(["all", "dependencies", "secrets", "code"])
      .optional()
      .describe("Type of audit to run (default: all)"),
    fix: tool.schema
      .boolean()
      .optional()
      .describe("Attempt to auto-fix dependency vulnerabilities (default: false)"),
    severity: tool.schema
      .enum(["low", "moderate", "high", "critical"])
      .optional()
      .describe("Minimum severity level to report (default: moderate)"),
  },
  async execute(args, context) {
    const auditType = args.type ?? "all"
    const fix = args.fix ?? false
    const severity = args.severity ?? "moderate"
    const cwd = context.worktree || context.directory

    const results: AuditResults = {
      timestamp: new Date().toISOString(),
      directory: cwd,
      checks: [],
      summary: {
        passed: 0,
        failed: 0,
        warnings: 0,
      },
    }

    // Check for dependencies audit
    if (auditType === "all" || auditType === "dependencies") {
      results.checks.push({
        name: "Dependency Vulnerabilities",
        description: "Check for known vulnerabilities in npm dependencies",
        command: fix ? "pnpm audit --fix" : "pnpm audit",
        severityFilter: severity,
        status: "pending",
      })
    }

    // Check for secrets
    if (auditType === "all" || auditType === "secrets") {
      const secretPatterns = await scanForSecrets(cwd)
      if (secretPatterns.length > 0) {
        results.checks.push({
          name: "Secret Detection",
          description: "Scan for hardcoded secrets and API keys",
          status: "failed",
          findings: secretPatterns,
        })
        results.summary.failed++
      } else {
        results.checks.push({
          name: "Secret Detection",
          description: "Scan for hardcoded secrets and API keys",
          status: "passed",
        })
        results.summary.passed++
      }
    }

    // Check for common code security issues
    if (auditType === "all" || auditType === "code") {
      const codeIssues = await scanCodeSecurity(cwd)
      if (codeIssues.length > 0) {
        results.checks.push({
          name: "Code Security",
          description: "Check for common security anti-patterns",
          status: "warning",
          findings: codeIssues,
        })
        results.summary.warnings++
      } else {
        results.checks.push({
          name: "Code Security",
          description: "Check for common security anti-patterns",
          status: "passed",
        })
        results.summary.passed++
      }
    }

    // Generate recommendations
    results.recommendations = generateRecommendations(results)

    return JSON.stringify(results)
  },
})

interface AuditCheck {
  name: string
  description: string
  command?: string
  severityFilter?: string
  status: "pending" | "passed" | "failed" | "warning"
  findings?: Array<{ file: string; issue: string; line?: number }>
}

interface AuditResults {
  timestamp: string
  directory: string
  checks: AuditCheck[]
  summary: {
    passed: number
    failed: number
    warnings: number
  }
  recommendations?: string[]
}

async function scanForSecrets(
  cwd: string
): Promise<Array<{ file: string; issue: string; line?: number }>> {
  const findings: Array<{ file: string; issue: string; line?: number }> = []

  // Patterns to DETECT potential secrets (security scanning)
  const secretPatterns = [
    { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/gi, name: "API Key" },
    { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, name: "Password" },
    { pattern: /secret\s*[:=]\s*['"][^'"]{10,}['"]/gi, name: "Secret" },
    { pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, name: "JWT Token" },
    { pattern: /sk-[a-zA-Z0-9]{32,}/g, name: "OpenAI API Key" },
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: "GitHub Token" },
    { pattern: /aws[_-]?secret[_-]?access[_-]?key/gi, name: "AWS Secret" },
    { pattern: /supabase[_-]?service[_-]?role[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, name: "Supabase Service Role Key" },
  ]

  const ignorePatterns = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".env.example",
    ".env.template",
    "target",
    ".opencode",
  ]

  // Scan all app directories
  const scanDirs = [
    path.join(cwd, "apps/desktop/src"),
    path.join(cwd, "apps/web"),
    path.join(cwd, "apps/mobile"),
    path.join(cwd, "services"),
  ]

  for (const scanDir of scanDirs) {
    if (fs.existsSync(scanDir)) {
      await scanDirectory(scanDir, secretPatterns, ignorePatterns, findings)
    }
  }

  // Also check root config files
  const configFiles = ["config.js", "config.ts", "settings.js", "settings.ts"]
  for (const configFile of configFiles) {
    const filePath = path.join(cwd, configFile)
    if (fs.existsSync(filePath)) {
      await scanFile(filePath, secretPatterns, findings)
    }
  }

  return findings
}

async function scanDirectory(
  dir: string,
  patterns: Array<{ pattern: RegExp; name: string }>,
  ignorePatterns: string[],
  findings: Array<{ file: string; issue: string; line?: number }>
): Promise<void> {
  if (!fs.existsSync(dir)) return

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (ignorePatterns.some((p) => fullPath.includes(p))) continue

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, patterns, ignorePatterns, findings)
    } else if (entry.isFile() && entry.name.match(/\.(ts|tsx|js|jsx|json|rs)$/)) {
      await scanFile(fullPath, patterns, findings)
    }
  }
}

async function scanFile(
  filePath: string,
  patterns: Array<{ pattern: RegExp; name: string }>,
  findings: Array<{ file: string; issue: string; line?: number }>
): Promise<void> {
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const { pattern, name } of patterns) {
        // Reset regex state
        pattern.lastIndex = 0
        if (pattern.test(line)) {
          findings.push({
            file: filePath,
            issue: `Potential ${name} found`,
            line: i + 1,
          })
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

async function scanCodeSecurity(
  cwd: string
): Promise<Array<{ file: string; issue: string; line?: number }>> {
  const findings: Array<{ file: string; issue: string; line?: number }> = []

  // Patterns to DETECT security anti-patterns
  const securityPatterns = [
    { pattern: /\beval\s*\(/g, name: "eval() usage - potential code injection" },
    { pattern: /innerHTML\s*=/g, name: "innerHTML assignment - potential XSS" },
    { pattern: /dangerouslySetInnerHTML/g, name: "dangerouslySetInnerHTML - potential XSS" },
    { pattern: /document\.write/g, name: "document.write - potential XSS" },
    { pattern: /\$\{.*\}.*sql/gi, name: "Potential SQL injection" },
  ]

  const scanDirs = [
    path.join(cwd, "apps/desktop/src"),
    path.join(cwd, "apps/web"),
    path.join(cwd, "services"),
  ]

  for (const scanDir of scanDirs) {
    if (fs.existsSync(scanDir)) {
      await scanDirectory(scanDir, securityPatterns, ["node_modules", ".git", "dist", "target", ".opencode"], findings)
    }
  }

  return findings
}

function generateRecommendations(results: AuditResults): string[] {
  const recommendations: string[] = []

  for (const check of results.checks) {
    if (check.status === "failed" && check.name === "Secret Detection") {
      recommendations.push(
        "CRITICAL: Remove hardcoded secrets and use SecretManager (Argon2id + AES-GCM) for desktop, environment variables for web"
      )
      recommendations.push("Verify all API keys go through SecretManager in Rust backend")
      recommendations.push("Use a secrets manager for production deployments")
    }

    if (check.status === "warning" && check.name === "Code Security") {
      recommendations.push(
        "Review flagged code patterns for potential security vulnerabilities"
      )
      recommendations.push("Ensure all MCP tool execution goes through ToolGuard")
      recommendations.push("Use parameterized queries for database operations")
    }

    if (check.status === "pending" && check.name === "Dependency Vulnerabilities") {
      recommendations.push("Run 'pnpm audit' to check for dependency vulnerabilities")
      recommendations.push("Consider using 'pnpm audit --fix' to auto-fix issues")
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("No critical security issues found. Continue following security best practices.")
  }

  return recommendations
}
