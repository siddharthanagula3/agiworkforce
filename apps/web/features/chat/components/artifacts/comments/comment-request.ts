import { artifactReplyFormat } from '../artifact-edit-request';
import type { ArtifactCommentAnchor, ArtifactCommentThread } from './artifact-comments-client';

export function describeAnchor(anchor: ArtifactCommentAnchor): string {
  switch (anchor.kind) {
    case 'text':
      return anchor.slide !== undefined
        ? `On slide ${anchor.slide + 1}, the passage "${anchor.quote}"`
        : `On the passage "${anchor.quote}"`;
    case 'slide':
      return `On slide ${anchor.slide + 1}`;
    case 'element':
      return `On the element at ${anchor.selector}${anchor.text ? ` ("${anchor.text}")` : ''}`;
    default:
      return 'On the whole artifact';
  }
}

export function buildCommentsEditRequest(
  title: string,
  threads: readonly ArtifactCommentThread[],
  type?: string,
): string {
  const lines = [
    `Edit the artifact "${title}" to address these comments. Change only what each comment asks for and keep everything else as it is, including the title.`,
    '',
  ];
  threads.forEach((thread, index) => {
    lines.push(`${index + 1}. ${describeAnchor(thread.root.anchor)}: ${thread.root.body}`);
    for (const reply of thread.replies) lines.push(`   Reply: ${reply.body}`);
  });
  lines.push('', artifactReplyFormat(type));
  return lines.join('\n');
}
