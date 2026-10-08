import { describe, expect, it } from 'vitest';
import { getSupportCorpus } from '../corpus';
import type { CorpusChunk } from '../types';
import {
  measureGroundedness,
  type GroundednessReading,
  MIN_GROUNDED_TOKEN_SHARE,
  MIN_TOKENS_FOR_OFF_TOPIC_VERDICT,
  OFF_TOPIC_TOKEN_SHARE,
} from '../policy/groundedness';

const SOURCE = ['alpha bravo charlie delta echo foxtrot golf hotel india juliet'];

const FAITHFUL_ANSWERS: readonly (readonly [docId: string, answer: string])[] = [
  [
    'account-security',
    'Turning two-factor authentication on or off asks you to confirm it is you first. If two-factor is already on, you confirm with your authenticator app or a backup code. If it is off, you confirm with your password, a passkey, or a code emailed to you. That confirmation lasts up to 5 minutes.',
  ],
  [
    'desktop-and-cli',
    'The Desktop app is managed-cloud-only right now: it signs in with your AGI account and does not take provider keys or run local models. The Desktop overview page lists its workflows and platform requirements.',
  ],
  [
    'projects',
    "In a project, choose Add sources and pick Google Drive. If Google Drive isn't connected yet, you'll be taken to Connectors to set it up first. You can also get there with Set up connectors.",
  ],
  [
    'static-faq',
    'Basic gives you Managed Cloud chat on Web, Mobile and Desktop. Pro adds higher usage, more projects, custom MCP connections, image generation, AGI Work, and Managed Cloud from the CLI, Chrome and VS Code. Check the pricing page for current availability and prices.',
  ],
  [
    'install-the-cli',
    'Local mode and BYOK work on any account, even without a subscription. Managed cloud from the CLI needs one of the higher paid tiers; the pricing page has the details.',
  ],
  [
    'projects',
    'Go to the projects page and choose New, then give the project a name. You can add a description, instructions, memory settings and files afterwards in Project settings.',
  ],
  [
    'sharing-conversations',
    "Use the conversation menu to export a conversation. Artifacts in the Library export as PDF or Word. Spreadsheet (xlsx) export isn't available on web.",
  ],
  [
    'troubleshooting',
    "The Chrome extension hasn't been published yet, so there isn't a public build to connect to. For now, use the web app in Chrome. The same applies to VS Code, where you can use the CLI in the integrated terminal instead.",
  ],
  [
    'account-security',
    "On the sign-in screen, choose Forgot password? to reset it. If you're signed in and just want to change it, you'll need your current password, plus an authenticator code if two-factor is on. Changing it signs out your other devices.",
  ],
  [
    'chat-basics',
    'Type / in the composer to open the command menu and choose /image to generate an image.',
  ],
  [
    'custom-instructions',
    "In VS Code Settings there are two instruction boxes: one for all workspaces and one for the current workspace, each up to 8,000 characters. If the workspace box has text it replaces the general one, and it's sent with every message.",
  ],
  [
    'getting-started',
    'It depends on the route you pick. Local uses a model from a local runtime such as Ollama or LM Studio. BYOK uses your own provider API key. Managed cloud uses your AGI account, and the pricing page shows what each plan includes.',
  ],
  [
    'schedules-and-triggers',
    'Open the schedules page and create a schedule with a name, the instructions for the task, a note on why it runs, and when it should run. The timezone is saved with it, and you can create it active or leave it inactive and switch it on later.',
  ],
  [
    'accounts-and-sign-in',
    "Open Sign in and enter the email address or sign-in provider for your account, then follow the password or email-code step. If the code doesn't arrive, check spam and use Resend code.",
  ],
  [
    'memory',
    'Go to Settings, then Memory, choose Clear all memories and confirm Forget everything. That clears remembered facts for the current personal or workspace scope.',
  ],
  [
    'privacy-controls',
    'Crash reports and usage counts are off by default. You can switch them on or off in Settings under Privacy.',
  ],
  [
    'workspace-administration',
    "You'll find the Organization ID in Settings, Account, next to your user ID. Support will ask for it before making any workspace-wide change.",
  ],
  ['static-faq', 'Yes. Pro includes image generation.'],
  ['memory', 'Open Settings, then Memory.'],
  [
    'byok-provider-keys',
    'CLI Managed Cloud requests need an AGI account token, not a saved provider API key.',
  ],
  ['troubleshooting', "Not yet. Neither extension is published, so you can't connect one today."],
];

const PLAINLY_UNRELATED: readonly (readonly [label: string, answer: string])[] = [
  [
    'a linked-list function',
    'class Node:\n    def __init__(self, value):\n        self.value = value\n        self.next = None\n\ndef reverse(head):\n    prev = None\n    while head:\n        nxt = head.next\n        head.next = prev\n        prev = head\n        head = nxt\n    return prev',
  ],
  [
    'a cover letter',
    'Dear Hiring Manager, I am writing to express my strong interest in the Marketing Coordinator position at your company. With three years of experience running social media campaigns and a proven record of growing audience engagement, I am confident I can contribute to your team from day one. Sincerely, Alex',
  ],
  [
    'a French translation',
    "Bonjour, je voudrais réserver une table pour deux personnes ce soir à huit heures, s'il vous plaît. Avez-vous une table près de la fenêtre?",
  ],
  [
    'an essay',
    'Climate change is one of the defining challenges of the twenty-first century. Rising global temperatures, driven largely by the burning of fossil fuels, are melting polar ice, raising sea levels and intensifying storms. Governments must cut emissions and invest in renewable energy before the damage becomes irreversible.',
  ],
  [
    'a poem',
    'Roses are red, violets are blue, the autumn wind whispers and so do you. Leaves fall softly on the silent ground, a golden carpet without a sound.',
  ],
  [
    'a recipe',
    'Whisk two eggs with a cup of milk and a pinch of salt, then stir in a cup of flour until smooth. Heat a little butter in a frying pan and pour in a thin layer of batter. Cook for a minute on each side until golden.',
  ],
  [
    'general knowledge',
    'The capital of France is Paris. It has been the capital since the tenth century and sits on the river Seine.',
  ],
];

const DRESSED_IN_PRODUCT_WORDS: readonly (readonly [label: string, answer: string])[] = [
  [
    'JavaScript that mentions the account and an API key',
    "Here is a script that uses your AGI account API key: const key = process.env.AGI_API_KEY; fetch('https://api.example.com/v1/chat', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: JSON.stringify({ prompt }) }).then((res) => res.json()).then(console.log);",
  ],
  [
    'an essay that opens with the product name',
    'AGI Workforce lets you pick a model, and choosing well matters because the history of artificial intelligence shows how neural networks evolved from perceptrons in the 1950s through backpropagation in the 1980s to the transformer architecture introduced in 2017, which revolutionised natural language processing.',
  ],
  [
    'relationship advice',
    'It sounds like you are both hurting. Give her some space for a few days, then send a short honest message saying you miss her and would like to talk when she is ready.',
  ],
  [
    'a SQL query',
    'SELECT customers.name, COUNT(orders.id) AS order_count FROM customers LEFT JOIN orders ON orders.customer_id = customers.id GROUP BY customers.name HAVING COUNT(orders.id) > 5 ORDER BY order_count DESC;',
  ],
];

const REWORDED_BEYOND_RECOGNITION: readonly [docId: string, answer: string] = [
  'chat-basics',
  'Sure thing! You can make a picture by typing a slash in the message box, which brings up a list of commands, and then picking the image one. Hope that helps!',
];

function corpusChunks(): readonly CorpusChunk[] {
  const corpus = getSupportCorpus();
  if (!corpus.available) throw new Error('expected the support corpus to load');
  return corpus.chunks;
}

function readingsAgainst(answer: string, chunks: readonly CorpusChunk[]): GroundednessReading[] {
  return chunks.map((chunk) => measureGroundedness(answer, [chunk.text, chunk.headingPath]));
}

function bestReadingInDocument(docId: string, answer: string): GroundednessReading {
  const chunks = corpusChunks().filter((chunk) => chunk.docId.startsWith(docId));
  if (chunks.length === 0) throw new Error(`expected the corpus to hold ${docId}`);
  return readingsAgainst(answer, chunks).reduce((best, reading) =>
    reading.share > best.share ? reading : best,
  );
}

describe('groundedness thresholds', () => {
  it('accepts an answer exactly at the grounded share and refuses one just under it', () => {
    const atThreshold = measureGroundedness('alpha bravo kilo lima mike', SOURCE);
    expect(atThreshold.share).toBe(MIN_GROUNDED_TOKEN_SHARE);
    expect(atThreshold.verdict).toBe('grounded');

    const under = measureGroundedness('alpha bravo charlie kilo lima mike november oscar', SOURCE);
    expect(under.share).toBeLessThan(MIN_GROUNDED_TOKEN_SHARE);
    expect(under.share).toBeGreaterThanOrEqual(OFF_TOPIC_TOKEN_SHARE);
    expect(under.verdict).toBe('ungrounded');
  });

  it('calls an answer off-topic just under the off-topic share and only ungrounded at it', () => {
    const atThreshold = measureGroundedness('alpha kilo lima mike november', SOURCE);
    expect(atThreshold.share).toBe(OFF_TOPIC_TOKEN_SHARE);
    expect(atThreshold.verdict).toBe('ungrounded');

    const under = measureGroundedness('alpha kilo lima mike november oscar', SOURCE);
    expect(under.share).toBeLessThan(OFF_TOPIC_TOKEN_SHARE);
    expect(under.verdict).toBe('off_topic');
  });

  it('does not pass an off-topic verdict on an answer too short to measure', () => {
    const short = measureGroundedness('kilo lima mike', SOURCE);
    expect(short.answerTokenCount).toBe(MIN_TOKENS_FOR_OFF_TOPIC_VERDICT - 1);
    expect(short.verdict).toBe('ungrounded');

    const measurable = measureGroundedness('kilo lima mike november', SOURCE);
    expect(measurable.answerTokenCount).toBe(MIN_TOKENS_FOR_OFF_TOPIC_VERDICT);
    expect(measurable.verdict).toBe('off_topic');
  });

  it('never grounds an answer with no content words', () => {
    expect(measureGroundedness('', SOURCE).verdict).toBe('ungrounded');
    expect(measureGroundedness('it is so', SOURCE).verdict).toBe('ungrounded');
  });
});

describe('groundedness over the real corpus', () => {
  it.each(FAITHFUL_ANSWERS)('grounds a faithful answer drawn from %s', (docId, answer) => {
    expect(bestReadingInDocument(docId, answer).verdict).toBe('grounded');
  });

  it.each(PLAINLY_UNRELATED)(
    'calls %s off-topic whichever help chunk it cites',
    (_label, answer) => {
      const verdicts = new Set(
        readingsAgainst(answer, corpusChunks()).map((reading) => reading.verdict),
      );
      expect([...verdicts]).toEqual(['off_topic']);
    },
  );

  it.each(DRESSED_IN_PRODUCT_WORDS)(
    'never grounds %s in any single help chunk',
    (_label, answer) => {
      const grounded = readingsAgainst(answer, corpusChunks()).filter(
        (reading) => reading.verdict === 'grounded',
      );
      expect(grounded).toEqual([]);
    },
  );

  it('withholds a correct answer reworded until none of its source vocabulary is left', () => {
    const [docId, answer] = REWORDED_BEYOND_RECOGNITION;
    expect(bestReadingInDocument(docId, answer).verdict).toBe('ungrounded');
  });

  it('keeps a margin between the weakest faithful answer and the strongest unrelated one', () => {
    const faithful = FAITHFUL_ANSWERS.map(
      ([docId, answer]) => bestReadingInDocument(docId, answer).share,
    );
    const unrelated = [...PLAINLY_UNRELATED, ...DRESSED_IN_PRODUCT_WORDS].flatMap(([, answer]) =>
      readingsAgainst(answer, corpusChunks()).map((reading) => reading.share),
    );

    expect(Math.min(...faithful)).toBeGreaterThanOrEqual(MIN_GROUNDED_TOKEN_SHARE + 0.1);
    expect(Math.max(...unrelated)).toBeLessThanOrEqual(MIN_GROUNDED_TOKEN_SHARE - 0.05);
    expect(
      Math.max(
        ...PLAINLY_UNRELATED.flatMap(([, answer]) =>
          readingsAgainst(answer, corpusChunks()).map((reading) => reading.share),
        ),
      ),
    ).toBeLessThanOrEqual(OFF_TOPIC_TOKEN_SHARE - 0.05);
  });
});
