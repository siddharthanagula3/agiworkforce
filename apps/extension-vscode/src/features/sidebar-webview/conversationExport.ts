export interface ExportableConversation {
  title: string;
  transcriptTruncated: boolean;
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; text: string }>;
}

export function conversationMarkdown(conversation: ExportableConversation): string {
  const sections = conversation.messages
    .filter((message) => message.text.trim() !== '')
    .map((message) => `## ${message.role === 'user' ? 'You' : 'AGI'}\n\n${message.text.trim()}`);
  const heading = `# ${conversation.title.trim() === '' ? 'AGI conversation' : conversation.title.trim()}`;
  const notice = conversation.transcriptTruncated
    ? ['_Only the newest messages of this session were available to export._']
    : [];
  return `${[heading, ...notice, ...sections].join('\n\n')}\n`;
}

export function exportFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
  return `${slug === '' ? 'agi-conversation' : slug}.md`;
}
