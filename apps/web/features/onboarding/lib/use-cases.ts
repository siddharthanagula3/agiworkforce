export interface OnboardingUseCase {
  value: string;
  label: string;
  description: string;
  starterPrompts: readonly string[];
}

export const ONBOARDING_USE_CASES: readonly OnboardingUseCase[] = [
  {
    value: 'code',
    label: 'Write and debug code',
    description: 'Build features, fix bugs, and review pull requests.',
    starterPrompts: [
      'Review this function for bugs and edge cases',
      'Help me debug a failing test',
      'Write unit tests for a module I paste in',
    ],
  },
  {
    value: 'write',
    label: 'Write and edit',
    description: 'Draft, edit, and polish documents and messages.',
    starterPrompts: [
      'Tighten this paragraph without losing its meaning',
      'Draft an email declining a meeting politely',
      'Give me three headline options for this post',
    ],
  },
  {
    value: 'research',
    label: 'Research and analyze',
    description: 'Summarize sources, compare options, and find answers.',
    starterPrompts: [
      'Summarize the tradeoffs between two approaches',
      'Find the key risks in this plan',
      'Explain a concept in plain language',
    ],
  },
  {
    value: 'work',
    label: 'Get things done at work',
    description: 'Plan projects, write updates, and prep for meetings.',
    starterPrompts: [
      'Turn these notes into a status update',
      'Draft an agenda for a kickoff meeting',
      'Help me prioritize this list of tasks',
    ],
  },
  {
    value: 'learn',
    label: 'Learn something new',
    description: 'Explore a topic and build understanding step by step.',
    starterPrompts: [
      'Explain this to me like I am new to the topic',
      'Quiz me on what I just read',
      'Give me a beginner project idea',
    ],
  },
] as const;

export const DEFAULT_STARTER_PROMPTS: readonly string[] = [
  'Help me think through a decision',
  'Summarize a long document for me',
  'Draft something for me to edit',
];

export function findOnboardingUseCase(value: string | null | undefined): OnboardingUseCase | null {
  if (!value) return null;
  return ONBOARDING_USE_CASES.find((useCase) => useCase.value === value) ?? null;
}

export function starterPromptsFor(value: string | null | undefined): readonly string[] {
  return findOnboardingUseCase(value)?.starterPrompts ?? DEFAULT_STARTER_PROMPTS;
}
