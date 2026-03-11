/**
 * AGI Workforce Plugins for OpenCode
 *
 * This module exports all AGI Workforce plugins for OpenCode integration.
 * Plugins provide hook-based automation that mirrors Claude Code's hook system
 * while taking advantage of OpenCode's more sophisticated 20+ event types.
 */

export { AGIWorkforceHooksPlugin, default } from "./ecc-hooks.js"

// Re-export for named imports
export * from "./ecc-hooks.js"
