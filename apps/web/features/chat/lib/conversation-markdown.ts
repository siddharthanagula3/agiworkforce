export interface MarkdownMessage {
  role: string;
  content: string;
}

export function conversationAsMarkdown(
  title: string,
  messages: readonly MarkdownMessage[],
): string {
  const body = messages
    .map((message) => {
      const heading = message.role === 'user' ? 'You' : 'Assistant';
      return `## ${heading}\n\n${message.content}`;
    })
    .join('\n\n');
  return [`# ${title}`, '', body].join('\n').trim();
}

export async function copyConversationMarkdown(
  title: string,
  messages: readonly MarkdownMessage[],
  write: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
): Promise<void> {
  await write(conversationAsMarkdown(title, messages));
}
