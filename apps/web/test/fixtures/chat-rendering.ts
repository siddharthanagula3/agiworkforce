import { LUNA_QA_MATH_MARKDOWN } from './luna-math';

const fence = (language: string, source: string) => `\`\`\`${language}\n${source}\n\`\`\``;
const sales = [120, 190, 155, 280, 310, 260];
const months = ['January', 'February', 'March', 'April', 'May', 'June'];
const rows = months.map((name, index) => ({ name, sales: sales[index] }));
const chart = (type: string, title: string, data: unknown = rows) =>
  fence(
    'chart',
    JSON.stringify({
      type,
      title,
      xKey: 'name',
      xLabel: 'Month',
      yLabel: 'Sales',
      data,
      series: [{ dataKey: 'sales', name: 'Sales' }],
    }),
  );

export const QA_EMAIL_SOURCE = `Subject: Northstar launch on Friday

Hi team,

Our fictional Northstar launch is ready for Friday.

- Review the release checklist.
- Confirm support coverage.

Thank you for your work.

Best,
Sam`;

export const QA_WRITING_SOURCES = [
  ['message', 'Team, the Northstar release is ready for review.'],
  ['post', 'A new chapter for Northstar. Built with the project team.'],
  ['document', '# Project report\n\nThe release checklist is complete.'],
  ['document', '# Meeting summary\n\nReview the launch checklist on Thursday.'],
  ['prompt', 'Review the supplied project brief. List assumptions and open questions.'],
  ['document', '# Business proposal\n\nDeliver the launch in two reviewable phases.'],
  ['document', '# Product requirements\n\nUsers can configure and review a project.'],
] as const;

export const QA_FORM_SOURCE = `title: Project configuration
text: Project name* |
select: Fictional model* | *Atlas | Nova | Comet
radio: Response style | *Concise | Detailed
checks: Tools | Web search | Code generation
slider: Monthly budget | 0 | 100 | 25 | credits
date: Target date | 2026-11-15
submit: Apply`;

export const QA_DIAGRAMS = [
  'flowchart LR\n  U[User] --> M[Model] --> P[Parser] --> R[Renderer]',
  'sequenceDiagram\n  actor User\n  participant Frontend\n  participant Backend\n  participant Provider as AI Provider\n  User->>Frontend: Send request\n  Frontend->>Backend: POST request\n  Backend->>Provider: Generate response\n  Provider-->>Backend: Stream\n  Backend-->>Frontend: Events\n  Frontend-->>User: Render answer',
  'timeline\n  title Software deployment\n  Review : Approve source\n  Build : Validate package\n  Release : Publish reviewed build',
] as const;

export const QA_CALCULATOR_SOURCE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Calculator</title></head><body>
<label>First number <input id="first" type="number" step="any"></label>
<label>Second number <input id="second" type="number" step="any"></label>
<button id="add" type="button">Add</button><button id="multiply" type="button">Multiply</button>
<output id="result" aria-live="polite">Enter two numbers</output>
<script>
function calculate(operation) {
 const first = document.getElementById('first'); const second = document.getElementById('second');
 const result = document.getElementById('result');
 if (!first.value.trim() || !second.value.trim()) { result.textContent = 'Please enter both numbers.'; return; }
 const a = Number(first.value); const b = Number(second.value);
 if (!Number.isFinite(a) || !Number.isFinite(b)) { result.textContent = 'Please enter valid numbers.'; return; }
 result.textContent = String(operation === 'add' ? a + b : a * b);
}
document.getElementById('add').addEventListener('click', () => calculate('add'));
document.getElementById('multiply').addEventListener('click', () => calculate('multiply'));
</script></body></html>`;

export const QA_CODE_SOURCES = [
  ['python', 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("team"))'],
  ['javascript', 'const greet = (name) => `Hello, ${name}!`;\nconsole.log(greet("team"));'],
  ['typescript', 'const greet = (name: string): string => `Hello, ${name}!`;'],
  [
    'html',
    '<!doctype html><html lang="en"><title>Greeting</title><body><h1>Hello, team!</h1></body></html>',
  ],
  ['css', '.greeting { display: grid; gap: 1rem; }'],
  ['sql', 'SELECT id, name FROM projects ORDER BY name;'],
  ['json', '{"message":"Hello, team!","active":true}'],
  ['yaml', 'message: Hello, team!\nactive: true'],
  ['bash', '#!/usr/bin/env bash\nprintf \'Hello, %s!\\n\' "team"'],
  ['diff', '--- a/greeting.txt\n+++ b/greeting.txt\n@@ -1 +1 @@\n-Hello!\n+Hello, team!'],
] as const;

export const CHAT_RENDERING_FIXTURES = [
  {
    id: 'markdown',
    title: 'Markdown',
    prompt:
      'Render a Markdown formatting showcase containing H1, H2, H3, bold, italic, underline, strikethrough, nested numbered and bullet lists, a blockquote, horizontal divider, inline code, hyperlink, task checklist, and a five-row table. Render everything visually rather than explaining Markdown syntax.',
    content:
      '# Formatting showcase\n\n## Text styles\n\n### Compact examples\n\n**Bold**, *italic*, <u>underlined</u>, ~~strikethrough~~ and `code`.\n\n1. First\n   1. Nested\n\n- Main\n  - Nested\n\n> Review this quote.\n\n---\n\n[Reference](https://example.com)\n\n- [x] Reviewed\n- [ ] Pending\n\n| Item | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |\n| C | 3 |\n| D | 4 |\n| E | 5 |',
  },
  {
    id: 'email',
    title: 'Email',
    prompt:
      'Write a professional email to a fictional project team about a product launch. Use a dedicated editable email writing block with subject, greeting, body paragraphs, bullet points, and sign-off. Render the actual email artifact with copy and edit controls, not an ordinary Markdown response.',
    content: fence('email', QA_EMAIL_SOURCE),
  },
  {
    id: 'writing',
    title: 'Seven writing blocks',
    prompt:
      'Create separate editable writing artifacts for a Slack message, social media post, project report, meeting summary, reusable AI prompt, business proposal, and product requirements document. Each artifact should have independent copy and editing controls where supported.',
    content: QA_WRITING_SOURCES.map(([language, source]) => fence(language, source)).join('\n\n'),
  },
  {
    id: 'code',
    title: 'Ten code languages',
    prompt:
      'Generate separate, valid code examples in Python, JavaScript, TypeScript, HTML, CSS, SQL, JSON, YAML, Bash, and a unified diff. Render each in its own language-aware code block with syntax highlighting and appropriate copy, edit, expand, preview, or run controls where supported.',
    content: QA_CODE_SOURCES.map(([language, source]) => fence(language, source)).join('\n\n'),
  },
  {
    id: 'python',
    title: 'Python execution',
    prompt:
      'Create and run a Python program using sample monthly sales data [120, 190, 155, 280, 310, 260]. Calculate total, average, and maximum sales, print the results, and generate bar and line charts. Show the editable Python code, actual execution output, and generated charts. Provide a Run or Rerun action if supported.',
    content:
      fence(
        'python',
        'sales = [120, 190, 155, 280, 310, 260]\nprint(sum(sales))\nprint(round(sum(sales) / len(sales), 2))\nprint(max(sales))',
      ) + '\n\nTotal: 1315. Average: 219.17. Maximum: 310.',
  },
  {
    id: 'calculator',
    title: 'Calculator',
    prompt:
      'Create a small interactive HTML or React calculator with two number inputs, Add and Multiply buttons, and a result display. Show the source code and a working visual preview if the application supports code previews.',
    content: fence('html', QA_CALCULATOR_SOURCE),
  },
  {
    id: 'snippets',
    title: 'Five copy blocks',
    prompt:
      'Create five independently copyable blocks: an AI agent prompt, Bash commands, a SQL query, a JSON API request, and a YAML configuration. Each block should have a separate copy action.',
    content: [
      fence('prompt', 'Summarize the supplied brief without inventing facts.'),
      ...QA_CODE_SOURCES.filter(([language]) =>
        ['bash', 'sql', 'json', 'yaml'].includes(language),
      ).map(([language, source]) => fence(language, source)),
    ].join('\n\n'),
  },
  {
    id: 'form',
    title: 'Project form',
    prompt:
      'Render a functional interactive project configuration form containing a project-name input, fictional model dropdown, response-style radio group, web-search checkbox, code-generation checkbox, monthly budget slider, target-date picker, and Apply button. Applying should display the selected values in a result panel.',
    content: fence('form', QA_FORM_SOURCE),
  },
  {
    id: 'cards',
    title: 'Cards and carousel',
    prompt:
      'Render two summary cards, a three-column feature grid, three fictional product recommendation cards, a responsive comparison layout, a navigable carousel, and an expandable details section. Use actual visual components rather than Markdown tables.',
    content: [
      fence(
        'stats',
        'title: Project summary\nReady | 5 | Features reviewed\nRemaining | 2 | Reviews to complete',
      ),
      fence(
        'cards',
        'title: Features\ncolumns: 3\nConfigure | Set project values\nReview | Inspect the output\nExport | Copy the result',
      ),
      ...['Atlas', 'Nova', 'Comet'].map((name) =>
        fence(
          'card',
          `title: ${name}\nsubtitle: Fictional product\ntags: Example\n\nA reviewable ${name} recommendation.`,
        ),
      ),
      fence(
        'cards',
        'Basic workflow | Configure and review\nExtended workflow | Configure, review and export',
      ),
      fence(
        'carousel',
        'title: Product carousel\nAtlas | First recommendation\nNova | Second recommendation\nComet | Third recommendation',
      ),
      fence('details', 'More details\n\nAll product names in this example are fictional.'),
    ].join('\n\n'),
  },
  {
    id: 'charts',
    title: 'Native charts',
    prompt:
      'Using monthly values January 120, February 190, March 155, April 280, May 310, June 260, render a native bar chart, line chart, and data table. Also render a pie chart using Research 25, Coding 35, Writing 20, and Analysis 20. Include correct labels and interactive tooltips where supported.',
    content: [
      chart('bar', 'Monthly sales: bar'),
      chart('line', 'Monthly sales: line'),
      '| Month | Sales |\n| --- | ---: |\n' +
        rows.map((row) => `| ${row.name} | ${row.sales} |`).join('\n'),
      chart('pie', 'Work distribution', [
        { name: 'Research', sales: 25 },
        { name: 'Coding', sales: 35 },
        { name: 'Writing', sales: 20 },
        { name: 'Analysis', sales: 20 },
      ]),
    ].join('\n\n'),
  },
  {
    id: 'diagrams',
    title: 'Three diagrams',
    prompt:
      'Visually render three diagrams: an AI request flowchart from User to Model to Parser to Renderer, a sequence diagram between User, Frontend, Backend, and AI Provider, and a software deployment timeline. Use an actual diagram renderer rather than ASCII text.',
    content: QA_DIAGRAMS.map((source) => fence('mermaid', source)).join('\n\n'),
  },
  {
    id: 'gallery',
    title: 'Four images',
    prompt:
      'Generate or retrieve four distinct images representing an AI chat interface, analytics dashboard, mobile application, and developer workspace. Render them inline as a responsive image gallery with captions.',
    content: fence(
      'gallery',
      'AI chat interface | /qa-render-image-1.svg | Conversation view\nAnalytics dashboard | /qa-render-image-2.svg | Data overview\nMobile application | /qa-render-image-3.svg | Narrow screen\nDeveloper workspace | /qa-render-image-4.svg | Code workspace',
    ),
  },
  {
    id: 'math',
    title: 'Mathematics',
    prompt:
      "Render Einstein's equation, the quadratic formula, Bayes' theorem, a matrix, a definite integral, and a summation using proper mathematical typesetting. Include inline and block-level equations.",
    content: LUNA_QA_MATH_MARKDOWN,
  },
  {
    id: 'citations',
    title: 'Citations',
    prompt:
      'Explain the difference between client-side rendering and server-side rendering, using official documentation as sources. Display clickable citations near the relevant claims and provide a source reference section.',
    content:
      'Server-side rendering creates the initial HTML on the server. [1]\n\nClient components handle browser interactions. [2]\n\n### Sources\n\n1. [MDN: Server-side rendering](https://developer.mozilla.org/en-US/docs/Glossary/SSR)\n2. [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)',
  },
] as const;

export type ChatRenderingFixture = (typeof CHAT_RENDERING_FIXTURES)[number];

export const LONG_RENDERING_FIXTURE = `# ${'Release readiness and validation '.repeat(18)}

$$\\begin{bmatrix}${Array.from({ length: 4 }, (_, row) => Array.from({ length: 16 }, (_, column) => `a_{${row + 1},${column + 1}}`).join(' & ')).join('\\\\')}\\end{bmatrix}$$

${fence('python', `payload = "${'long_content_'.repeat(90)}"\nprint(payload)`)}
`;
