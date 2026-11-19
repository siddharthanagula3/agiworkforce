const drafts = new Map<string, string>();

export function toolApprovalGuidanceDraft(toolCallId: string): string | undefined {
  return drafts.get(toolCallId);
}

export function setToolApprovalGuidanceDraft(toolCallId: string, text: string): void {
  if (text.length === 0) drafts.delete(toolCallId);
  else drafts.set(toolCallId, text);
}

export function clearToolApprovalGuidanceDraft(toolCallId: string): void {
  drafts.delete(toolCallId);
}
