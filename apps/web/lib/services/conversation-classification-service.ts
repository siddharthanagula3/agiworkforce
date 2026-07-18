import type { ManagedCloudConversationTopic } from '@agiworkforce/cloud-contracts';

interface ConversationTopicPresentation {
  label: string;
  description: string;
}

const TOPIC_PRESENTATION: Record<ManagedCloudConversationTopic, ConversationTopicPresentation> = {
  coding: {
    label: 'Coding',
    description: 'Implementation, APIs, programming, and refactoring.',
  },
  research: {
    label: 'Research',
    description: 'Questions, explanations, sources, and comparisons.',
  },
  writing: {
    label: 'Writing',
    description: 'Drafting, editing, and summarization.',
  },
  brainstorm: {
    label: 'Brainstorming',
    description: 'Ideas, alternatives, and new directions.',
  },
  analysis: {
    label: 'Analysis',
    description: 'Data, trends, reports, and structured evaluation.',
  },
  debug: {
    label: 'Debugging',
    description: 'Errors, failures, and broken behavior.',
  },
  creative: {
    label: 'Creative work',
    description: 'Design, images, stories, and visual exploration.',
  },
  general: {
    label: 'General',
    description: 'Conversations without a strong topic signal.',
  },
};

const KEYWORD_RULES: ReadonlyArray<{
  topic: ManagedCloudConversationTopic;
  patterns: readonly RegExp[];
}> = [
  {
    topic: 'debug',
    patterns: [
      /\bbug\b/i,
      /\berror\b/i,
      /\bfix\b/i,
      /\bdebug\b/i,
      /\bstack\s?trace\b/i,
      /\bcrash\b/i,
      /\bbroken\b/i,
      /\bnot\s+working\b/i,
      /\bfailing\b/i,
      /\bexception\b/i,
    ],
  },
  {
    topic: 'coding',
    patterns: [
      /```[\s\S]*?```/,
      /\bfunction\b/i,
      /\bclass\b/i,
      /\bimport\b/i,
      /\bconst\b/i,
      /\bpython\b/i,
      /\btypescript\b/i,
      /\bjavascript\b/i,
      /\breact\b/i,
      /\bapi\b/i,
      /\bcode\b/i,
      /\bprogram\b/i,
      /\bimplement\b/i,
      /\brefactor\b/i,
      /\balgorithm\b/i,
    ],
  },
  {
    topic: 'research',
    patterns: [
      /\bresearch\b/i,
      /\bstudy\b/i,
      /\bpaper\b/i,
      /\bjournal\b/i,
      /\bsource\b/i,
      /\bcitation\b/i,
      /\bfind\s+out\b/i,
      /\bcompare\b/i,
      /\bexplain\b/i,
      /\bwhat\s+is\b/i,
      /\bhow\s+does\b/i,
    ],
  },
  {
    topic: 'writing',
    patterns: [
      /\bwrite\b/i,
      /\bedit\b/i,
      /\bdraft\b/i,
      /\bessay\b/i,
      /\barticle\b/i,
      /\bblog\s+post\b/i,
      /\bcopy\b/i,
      /\bproofread\b/i,
      /\brewrite\b/i,
      /\bsummarize\b/i,
      /\btone\b/i,
    ],
  },
  {
    topic: 'brainstorm',
    patterns: [
      /\bbrainstorm\b/i,
      /\bideas?\b/i,
      /\bcreative\b/i,
      /\bwhat\s+if\b/i,
      /\bsuggest\b/i,
      /\bgenerate\b/i,
      /\bcome\s+up\s+with\b/i,
      /\blist\s+of\b/i,
      /\binnovate\b/i,
    ],
  },
  {
    topic: 'analysis',
    patterns: [
      /\banalyze\b/i,
      /\banalysis\b/i,
      /\bdata\b/i,
      /\bchart\b/i,
      /\bgraph\b/i,
      /\bmetric\b/i,
      /\bstatistic\b/i,
      /\btrend\b/i,
      /\binsight\b/i,
      /\breport\b/i,
      /\bspreadsheet\b/i,
    ],
  },
  {
    topic: 'creative',
    patterns: [
      /\bdesign\b/i,
      /\bart\b/i,
      /\bimage\b/i,
      /\billustrat/i,
      /\bstory\b/i,
      /\bpoem\b/i,
      /\bmusic\b/i,
      /\bcolor\b/i,
      /\bpalette\b/i,
      /\baesthetic\b/i,
      /\bvisual\b/i,
    ],
  },
];

export function classifyConversationText(text: string): ManagedCloudConversationTopic {
  const scores: Record<ManagedCloudConversationTopic, number> = {
    coding: 0,
    research: 0,
    writing: 0,
    brainstorm: 0,
    analysis: 0,
    debug: 0,
    creative: 0,
    general: 0,
  };

  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      scores[rule.topic] += text.match(new RegExp(pattern.source, 'gi'))?.length ?? 0;
    }
  }

  let bestTopic: ManagedCloudConversationTopic = 'general';
  let bestScore = 0;
  for (const [topic, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic as ManagedCloudConversationTopic;
    }
  }
  return bestTopic;
}

export function getConversationTopicPresentation(
  topic: ManagedCloudConversationTopic,
): ConversationTopicPresentation {
  return TOPIC_PRESENTATION[topic];
}
