interface MessageMetadata {
  type?: string;
  [key: string]: unknown;
}

export function shouldShowClaudePlanningCard(
  userMessage: string,
  metadata?: MessageMetadata,
): boolean {
  if (metadata?.type === 'reasoning') {
    return true;
  }

  if (!userMessage || typeof userMessage !== 'string') {
    return false;
  }

  const lowerContent = userMessage.toLowerCase().trim();

  const simpleGreetings = [
    'hi',
    'hello',
    'hey',
    'thanks',
    'thank you',
    'ok',
    'okay',
    'yes',
    'no',
    'sure',
    'got it',
    'cool',
    'nice',
    'good',
    'bye',
    'goodbye',
    'see you',
    'how are you',
    "what's up",
    'sup',
    'yo',
    'help',
    'stop',
    'continue',
    'proceed',
  ];

  const strippedContent = lowerContent.replace(/[!?.]/g, '');
  if (simpleGreetings.some((greeting) => strippedContent === greeting)) {
    return false;
  }

  const documentKeywords = [
    'write',
    'draft',
    'create',
    'compose',
    'generate',

    'document',
    'specification',
    'spec',
    'report',
    'proposal',
    'prompt',
    'markdown',
    '.md',
    'readme',
    'deck',
    'docs',
    'documentation',
    'essay',
    'article',
    'email',
    'pitch',
    'plan',
    'outline',
    'template',
    'guide',
    'tutorial',
    'post',
    'blog',
    'letter',
    'memo',
    'brief',
    'summary',

    'yc application',
    'yc answer',
    'y combinator',

    'design a',
    'build a',
    'make a',
    'develop a',
    'contract',
    'agreement',
    'terms',
    'policy',
  ];

  const hasDocumentKeyword = documentKeywords.some((keyword) => lowerContent.includes(keyword));

  return hasDocumentKeyword;
}

export function getPreviousUserMessage(
  messages: Array<{ id: string; role: string; content: string }>,
  currentMessageId: string,
): string {
  const currentIndex = messages.findIndex((msg) => msg.id === currentMessageId);
  if (currentIndex === -1) return '';

  for (let i = currentIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === 'user') {
      return message.content;
    }
  }

  return '';
}
