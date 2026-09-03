export interface ThinkingSegmentLike {
  id: string;
  content: string;
  isStreaming: boolean;
  startedAt: string;
  completedAt: string | null;
  durationSeconds?: number;
}

export interface MergedThinkingGroup<Tool> {
  segment: ThinkingSegmentLike;
  toolAfter?: Tool;
}

export function mergeAdjacentThinkingSegments<Tool>(
  segments: readonly ThinkingSegmentLike[],
  tools: readonly Tool[],
): MergedThinkingGroup<Tool>[] {
  const groups: MergedThinkingGroup<Tool>[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg) continue;
    const toolBefore = i > 0 ? tools[i - 1] : undefined;
    const previous = groups[groups.length - 1];

    if (previous && !toolBefore) {
      previous.segment = {
        ...previous.segment,
        content: previous.segment.content
          ? `${previous.segment.content}\n\n${seg.content}`
          : seg.content,
        isStreaming: seg.isStreaming,
        completedAt: seg.completedAt,
        durationSeconds:
          previous.segment.durationSeconds !== undefined && seg.durationSeconds !== undefined
            ? previous.segment.durationSeconds + seg.durationSeconds
            : undefined,
      };
      previous.toolAfter = tools[i];
    } else {
      groups.push({ segment: { ...seg }, toolAfter: tools[i] });
    }
  }

  return groups;
}
