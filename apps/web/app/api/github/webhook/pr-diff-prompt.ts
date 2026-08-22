export function escapeUntrustedPrDiff(diff: string): string {
  return diff
    .replace(/<tool_use>/gi, '&lt;tool_use&gt;')
    .replace(/<\/tool_use>/gi, '&lt;/tool_use&gt;')
    .replace(/<function_call>/gi, '&lt;function_call&gt;')
    .replace(/<\/function_call>/gi, '&lt;/function_call&gt;')
    .replace(/<(\/?untrusted_pr_diff)\b/gi, '&lt;$1');
}
