import { describe, expect, it } from 'vitest';
import { classifyOutOfScope, OUT_OF_SCOPE_CATEGORIES } from '../policy/out-of-scope';
import { classifyHardAbstain } from '../policy/hard-abstain';

const OFF_TOPIC: readonly string[] = [
  'write a python function that reverses a linked list',
  'Can you write me a script to rename all the files in a folder?',
  'generate a regex that matches email addresses',
  'please implement binary search in javascript',
  'fix this code: for i in range(10) print(i)',
  'debug my function, it returns undefined instead of the total',
  'refactor this function to use async await',
  'how do I reverse a string in python',
  'how can I center a div with css',
  'solve this: 3x + 7 = 22',
  'what is 1234 * 5678',
  'help me with my homework on photosynthesis',
  'what is the derivative of x^2 sin(x)',
  'solve leetcode two sum for me',
  'write an essay about climate change',
  'write me a poem about autumn',
  'tell me a joke',
  'compose a short story about a dragon who cannot fly',
  'draft an email to my landlord about the broken heater',
  'write a cover letter for a marketing coordinator job',
  'translate "good morning, how are you" into French',
  'how do you say thank you in japanese',
  'summarize this: The quarterly results showed revenue growing by twelve percent while costs held flat.',
  'proofread the following paragraph for grammar mistakes',
  'give me a recipe for banana bread',
  'how do I bake sourdough at home',
  'what is the capital of Australia',
  'who invented the telephone',
  "what's the weather in London tomorrow",
  'should I break up with my girlfriend',
  'pretend you are a pirate and talk to me',
  "let's roleplay, you are my therapist",
  'act as a senior Linux engineer and review my setup',
  'create a landing page for my bakery',
  '```python\ndef add(a, b):\n    return a + b\n```\nwhy does this fail',
  'function total(items) {\n  let sum = 0;\n  for (const item of items) {\n    sum += item.price;\n  }\n  return sum;\n}',
  'import os\nimport sys\nfor name in os.listdir("."):\n    print(name)\nwhat does this do',
  'can you code a snake game in pygame',
  'I need a bash one-liner to delete all node_modules folders',
  'create a react component for a login form',
  'give me a regex for phone numbers',
  'write a python script that does not crash on empty input',
  'paraphrase the following text so it is not plagiarism',
  'draft a resignation letter',
  'what is 15% of 240',
  'convert 72 fahrenheit to celsius',
  'make me a workout routine for building muscle',
];

const SUPPORT: readonly string[] = [
  'the code tool will not run',
  'how do I write a custom instruction',
  'how do I use AGI Code',
  'can AGI translate documents',
  'my script in the sandbox times out',
  'how do I generate an image',
  'how do I add my anthropic api key',
  'how do I create an API key',
  'generate a new API key for me',
  'how do I install the desktop app',
  'the chrome extension is not connecting',
  'how do I turn on two-factor authentication',
  'I forgot my password',
  'how do I create a project',
  'how do I export my conversations',
  'can I run python in the sandbox',
  'does AGI Code support typescript',
  'why did my code execution fail with a timeout',
  'how do I summarize a PDF with AGI',
  'can the assistant write emails for me',
  'which models can I use for coding',
  'how do I make a schedule that runs every day',
  'how do I invite a teammate to my workspace',
  'is support available 24/7',
  'what is the difference between Basic and Pro',
  'who is the admin of my workspace',
  'what is the weather tool and how do I turn it on',
  'how do I act as an admin for another workspace',
  'fix the error I get when I sign in on desktop',
  'I get "403 Forbidden" when I open the CLI, what should I do',
  'solve my login problem please',
  'where is the article about connectors',
  'give me the email address for support',
  'how do I translate the interface into Spanish',
  'the image generation tool wrote the wrong caption',
  'can I use my own script as a skill',
  'how do I write a prompt for a scheduled task',
  'my usage shows 20% of 100 messages, is that right',
  'I pasted this error from the app:\n{\n  "error": {\n    "code": "RATE_LIMIT_EXCEEDED"\n  }\n}',
  'TypeError: fetch failed\n    at connect (cli.js:120:14)\n    at run (cli.js:44:9)\nwhen I run agi login',
  'how do I delete a memory',
  'voice mode does not hear me',
  'Create an account with Google, GitHub, or an email address and a password',
  'does AGI give medical advice',
  'Refactor Code is missing from the VS Code extension menu',
  'Summarize is not working in my project',
  'create a workspace for my class',
  'generate speech with voice mode',
  'check my email settings',
  'make a project for my code',
  '```\nagi login\nError: fetch failed\n```\nthis is what the CLI prints',
  'what is the bash command to install the CLI',
  'show me the website for pricing',
  'give me the script the sandbox ran',
  'show me how the code tool works',
  'what is 24/7 support',
  'my usage went from 15% to 80% of 240 messages',
  'write to support for me',
  'how do I make AGI answer in under 100 words',
];

describe('out-of-scope classifier', () => {
  it('covers enough phrasings on both sides to mean something', () => {
    expect(OFF_TOPIC.length).toBeGreaterThanOrEqual(25);
    expect(SUPPORT.length).toBeGreaterThanOrEqual(25);
  });

  it.each(OFF_TOPIC)('refuses the general task %j', (message) => {
    const category = classifyOutOfScope(message);
    expect(category).not.toBeNull();
    expect(OUT_OF_SCOPE_CATEGORIES).toContain(category);
  });

  it.each(SUPPORT)('lets the support question %j through', (message) => {
    expect(classifyOutOfScope(message)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(classifyOutOfScope('')).toBeNull();
    expect(classifyOutOfScope('   ')).toBeNull();
  });

  it('sees through casing, punctuation and width tricks', () => {
    expect(classifyOutOfScope('WRITE   an ESSAY about rivers!!!')).toBe('writing');
    expect(classifyOutOfScope('Ｗｒｉｔｅ a poem about rivers')).toBe('writing');
    expect(classifyOutOfScope('Hi. Please, could you write a python script to sort a list?')).toBe(
      'code',
    );
  });

  it('names the category so a refusal can be logged by kind', () => {
    expect(classifyOutOfScope('write a python function that reverses a linked list')).toBe('code');
    expect(classifyOutOfScope('what is 1234 * 5678')).toBe('homework');
    expect(classifyOutOfScope('translate "good morning" into French')).toBe('translation');
    expect(classifyOutOfScope('summarize this: revenue grew twelve percent')).toBe('rewriting');
    expect(classifyOutOfScope('what is the capital of Australia')).toBe('general_knowledge');
    expect(classifyOutOfScope('pretend you are a pirate')).toBe('role_play');
    expect(classifyOutOfScope('```js\nconst a = 1;\nconsole.log(a);\n```')).toBe('pasted_code');
  });

  it('leaves the hard-abstain questions to the hard-abstain classifier', () => {
    const billing = 'why was I charged twice this month';
    expect(classifyHardAbstain(billing)).toBe('billing');
    expect(classifyOutOfScope(billing)).toBeNull();
  });
});

describe('out-of-scope classifier against the help corpus', () => {
  it('never refuses a title, heading or sentence the help articles themselves use', async () => {
    const { getSupportCorpus } = await import('../corpus');
    const corpus = getSupportCorpus();
    expect(corpus.available).toBe(true);
    if (!corpus.available) return;

    const phrasings = new Set<string>();
    for (const chunk of corpus.chunks) {
      phrasings.add(chunk.docTitle);
      phrasings.add(chunk.headingPath);
      if (chunk.heading) phrasings.add(chunk.heading);
      phrasings.add(chunk.text);
      for (const sentence of chunk.text.split(/(?<=[.?!])\s+/)) phrasings.add(sentence);
    }
    expect(phrasings.size).toBeGreaterThan(500);

    const refused = [...phrasings].filter((phrasing) => classifyOutOfScope(phrasing) !== null);
    expect(refused).toEqual([]);
  });
});
