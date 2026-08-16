const ACTION_VERBS = [
  'add',
  'analyze',
  'analyse',
  'audit',
  'build',
  'clean up',
  'compare',
  'compile',
  'configure',
  'convert',
  'create',
  'debug',
  'deploy',
  'design',
  'document',
  'draft',
  'fix',
  'generate',
  'implement',
  'improve',
  'index',
  'install',
  'integrate',
  'investigate',
  'migrate',
  'optimize',
  'optimise',
  'organize',
  'organise',
  'plan',
  'prepare',
  'refactor',
  'research',
  'review',
  'rewrite',
  'scaffold',
  'set up',
  'summarize',
  'summarise',
  'test',
  'translate',
  'update',
  'write',
];

const QUESTION_OPENERS = [
  'what',
  'why',
  'how',
  'when',
  'where',
  'who',
  'which',
  'is',
  'are',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'would',
  'will',
];

const MIN_WORDS = 4;

export interface GoalIntent {
  isGoal: boolean;
  verb?: string;
}

export function detectGoalIntent(text: string): GoalIntent {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return { isGoal: false };

  const words = trimmed.split(/\s+/);
  if (words.length < MIN_WORDS) return { isGoal: false };

  if (trimmed.endsWith('?')) return { isGoal: false };
  if (QUESTION_OPENERS.includes(words[0] ?? '')) return { isGoal: false };

  const opener = words.slice(0, 3).join(' ');
  const verb = ACTION_VERBS.find(
    (candidate) => opener === candidate || opener.startsWith(`${candidate} `),
  );
  if (!verb) return { isGoal: false };

  return { isGoal: true, verb };
}
