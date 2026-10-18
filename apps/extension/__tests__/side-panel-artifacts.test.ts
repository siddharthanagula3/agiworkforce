import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import {
  artifactDownload,
  artifactFileName,
  ARTIFACT_PANEL_CSS,
  artifactProse,
  createArtifactOutputs,
  messageArtifactView,
  type ArtifactOutputsAPI,
} from '../src/features/side-panel/artifactPanel';
import { buildBubbleWithTools } from '../src/features/side-panel/bubbles';
import type { SidePanelChatMessage } from '../src/features/side-panel/chat-state';
import type { AnswerFileAccess } from '../src/features/side-panel/generatedFiles';

const catalog = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '_locales', 'en', 'messages.json'),
    'utf8',
  ),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

const CONVERSATION_ID = 'conversation-1';

const HTML_ARTIFACT = [
  '<!-- @artifact -->',
  '<!doctype html>',
  '<html><head><title>Desk calculator</title></head>',
  '<body><script>window.ran = true;</script></body></html>',
].join('\n');

const SVG_ARTIFACT = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
  '<!-- @artifact -->',
  '<title>Badge</title>',
  '<circle cx="5" cy="5" r="4"/>',
  '</svg>',
].join('\n');

function reply(body: string, overrides: Partial<SidePanelChatMessage> = {}): SidePanelChatMessage {
  return {
    id: 'stream-1',
    role: 'assistant',
    content: body,
    timestamp: 0,
    runtime: 'managed-cloud',
    ...overrides,
  };
}

const finished = (overrides: Partial<SidePanelChatMessage> = {}) =>
  reply(`Here it is.\n\n\`\`\`html\n${HTML_ARTIFACT}\n\`\`\`\n\nOpen it to try.`, overrides);

const access: AnswerFileAccess = {
  resolveUrl: (uri) => (uri.startsWith('/') ? `https://agiworkforce.com${uri}` : null),
  fetchFile: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  openUrl: vi.fn(),
};

let outputs: ArtifactOutputsAPI;
let saveFile: ReturnType<typeof vi.fn>;
let openUrl: ReturnType<typeof vi.fn>;
let writeClipboard: ReturnType<typeof vi.fn>;
let webUrl: string | null;

function mount(): void {
  document.body.replaceChildren();
  const header = document.createElement('div');
  header.appendChild(outputs.outputsEl);
  const messages = document.createElement('div');
  messages.id = 'sp-messages';
  document.body.append(header, outputs.panelEl, messages);
}

function renderReply(msg: SidePanelChatMessage): HTMLElement {
  const view = outputs.viewFor(msg);
  const bubble = buildBubbleWithTools(msg, {
    artifacts: { prose: (text) => artifactProse(text, view), cards: outputs.buildCards(msg) },
  });
  document.getElementById('sp-messages')!.replaceChildren(bubble);
  outputs.sync([msg]);
  return bubble;
}

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: () => 'en' },
    tabs: { create: vi.fn() },
  };
  saveFile = vi.fn();
  openUrl = vi.fn();
  writeClipboard = vi.fn(async () => undefined);
  webUrl = null;
  outputs = createArtifactOutputs({
    fileAccess: access,
    conversationId: () => CONVERSATION_ID,
    webConversationUrl: () => webUrl,
    openUrl,
    writeClipboard,
    saveFile,
  });
  mount();
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.replaceChildren();
});

describe('deriving artifacts from a side-panel reply', () => {
  it('takes only blocks the model marked as artifacts, as the managed turn persists them', () => {
    const view = messageArtifactView(
      reply(`\`\`\`html\n${HTML_ARTIFACT}\n\`\`\`\n\n\`\`\`html\n<div>plain snippet</div>\n\`\`\``),
      CONVERSATION_ID,
    );
    expect(view.artifacts).toHaveLength(1);
    expect(view.artifacts[0]).toMatchObject({ type: 'html', title: 'Desk calculator' });
    expect(view.artifacts[0]!.id).toBe(computeDerivedArtifactId(CONVERSATION_ID, 'stream-1', 0));
  });

  it('keeps a user message and an artifact-free answer out of it', () => {
    expect(messageArtifactView(reply('no code here'), CONVERSATION_ID).artifacts).toEqual([]);
    expect(
      messageArtifactView({ ...finished(), role: 'user' } as SidePanelChatMessage, CONVERSATION_ID)
        .artifacts,
    ).toEqual([]);
  });

  it('removes the artifact source from the prose and keeps the words around it', () => {
    const msg = finished();
    const prose = artifactProse(msg.content, messageArtifactView(msg, CONVERSATION_ID));
    expect(prose).toContain('Here it is.');
    expect(prose).toContain('Open it to try.');
    expect(prose).not.toContain('@artifact');
  });

  it('names the half-written block with the id the finished artifact will carry', () => {
    const partial = reply(
      `Building it.\n\n\`\`\`html\n${HTML_ARTIFACT.split('\n').slice(0, 3).join('\n')}`,
      {
        streaming: true,
      },
    );
    const view = messageArtifactView(partial, CONVERSATION_ID);
    expect(view.creating).toMatchObject({ streaming: true, title: 'Desk calculator' });
    expect(artifactProse(partial.content, view)).toBe('Building it.');
    const done = messageArtifactView(finished(), CONVERSATION_ID);
    expect(done.artifacts[0]!.id).toBe(view.creating!.id);
  });
});

describe('artifact downloads', () => {
  it('names the file from the title and the artifact type', () => {
    expect(artifactFileName({ title: 'Desk calculator', type: 'html', language: 'html' })).toBe(
      'desk-calculator.html',
    );
    expect(artifactFileName({ title: '???', type: 'react', language: 'jsx' })).toBe('artifact.jsx');
  });

  it('saves the artifact source, not the rendered page', async () => {
    const [artifact] = messageArtifactView(finished(), CONVERSATION_ID).artifacts;
    const { name, blob } = artifactDownload(artifact!);
    expect(name).toBe('desk-calculator.html');
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toBe(HTML_ARTIFACT);
  });
});

describe('artifact card in the message', () => {
  it('shows a card with Open and a download instead of the raw block', () => {
    const bubble = renderReply(finished());
    expect(bubble.querySelector('.sp-bubble')?.textContent).not.toContain('@artifact');
    const card = bubble.querySelector<HTMLElement>('.sp-artifact-card')!;
    expect(card.querySelector('.sp-artifact-card__name')?.textContent).toBe('Desk calculator');
    expect(card.querySelector('.sp-artifact-card__meta')?.textContent).toBe('Artifact · HTML');
    const toggle = card.querySelector<HTMLButtonElement>('.sp-artifact-card__toggle')!;
    expect(toggle.textContent).toBe('Open');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    card.querySelector<HTMLButtonElement>('[aria-label="Download Desk calculator"]')!.click();
    expect(saveFile).toHaveBeenCalledWith('desk-calculator.html', expect.any(Blob));
  });

  it('opens the panel from the card and turns the button into Hide', () => {
    const bubble = renderReply(finished());
    const toggle = bubble.querySelector<HTMLButtonElement>('.sp-artifact-card__toggle')!;
    toggle.click();
    expect(outputs.panelEl.hidden).toBe(false);
    expect(toggle.textContent).toBe('Hide');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide artifact: Desk calculator');

    toggle.click();
    expect(outputs.panelEl.hidden).toBe(true);
    expect(toggle.textContent).toBe('Open');
  });

  it('hides an empty answer bubble when the reply is only an artifact', () => {
    const bubble = renderReply(reply(`\`\`\`html\n${HTML_ARTIFACT}\n\`\`\``));
    expect(bubble.querySelector<HTMLElement>('.sp-bubble')!.hidden).toBe(true);
    expect(bubble.querySelector('.sp-artifact-card')).not.toBeNull();
  });
});

describe('artifact panel', () => {
  it('opens by itself while a reply writes an artifact, without taking focus', () => {
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    input.focus();
    renderReply(
      reply(`\`\`\`html\n${HTML_ARTIFACT.split('\n').slice(0, 3).join('\n')}`, { streaming: true }),
    );

    expect(outputs.panelEl.hidden).toBe(false);
    expect(outputs.panelEl.querySelector('.sp-artifact-panel__title')?.textContent).toBe(
      'Creating Desk calculator',
    );
    expect(outputs.panelEl.querySelector('.sp-artifact-panel__meta')?.textContent).toBe('3 lines');
    expect(document.activeElement).toBe(input);

    renderReply(finished());
    expect(outputs.panelEl.hidden).toBe(false);
    expect(outputs.panelEl.querySelector('.sp-artifact-panel__title')?.textContent).toBe(
      'Desk calculator',
    );
  });

  it('does not open for a restored chat', () => {
    renderReply(finished());
    expect(outputs.panelEl.hidden).toBe(true);
  });

  it('stays closed for the rest of a reply once the reader closes it', () => {
    const first = `\`\`\`html\n${HTML_ARTIFACT.split('\n').slice(0, 2).join('\n')}`;
    renderReply(reply(first, { streaming: true }));
    expect(outputs.panelEl.hidden).toBe(false);
    outputs.panelEl.querySelector<HTMLButtonElement>('[aria-label="Close artifact"]')!.click();
    expect(outputs.panelEl.hidden).toBe(true);

    renderReply(reply(`${first}\n<body></body>`, { streaming: true }));
    expect(outputs.panelEl.hidden).toBe(true);
  });

  it('shows HTML as inert source text rather than running it', () => {
    renderReply(finished());
    outputs.open(outputs.viewFor(finished()).artifacts[0]!.id);
    const body = outputs.panelEl.querySelector('.sp-artifact-panel__body')!;
    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('code')?.textContent).toBe(HTML_ARTIFACT);
    expect((window as { ran?: boolean }).ran).toBeUndefined();
  });

  it('previews an SVG as an image', () => {
    const msg = reply(`\`\`\`svg\n${SVG_ARTIFACT}\n\`\`\``);
    renderReply(msg);
    outputs.open(outputs.viewFor(msg).artifacts[0]!.id);
    const image = outputs.panelEl.querySelector<HTMLImageElement>('.sp-artifact-panel__image')!;
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(image.alt).toBe('Badge');
  });

  it('copies and downloads the open artifact, and runs it on the web only when the chat is there', async () => {
    renderReply(finished());
    const id = outputs.viewFor(finished()).artifacts[0]!.id;
    outputs.open(id);
    const webButton = outputs.panelEl.querySelector<HTMLButtonElement>(
      '[aria-label="Run Desk calculator in this chat on the web"]',
    )!;
    expect(webButton.hidden).toBe(true);

    outputs.panelEl
      .querySelector<HTMLButtonElement>('[aria-label="Copy the source of Desk calculator"]')!
      .click();
    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(HTML_ARTIFACT));
    await vi.waitFor(() =>
      expect(outputs.panelEl.querySelector('.sp-artifact-panel__status')?.textContent).toBe(
        'Copied.',
      ),
    );

    outputs.close();
    webUrl = 'https://agiworkforce.com/chat/0f8fad5b-d9cb-469f-a165-70867728950e';
    outputs.open(id);
    expect(webButton.hidden).toBe(false);
    webButton.click();
    expect(openUrl).toHaveBeenCalledWith(webUrl);
  });

  it('closes on Escape and when the chat no longer holds the artifact', () => {
    const bubble = renderReply(finished());
    const toggle = bubble.querySelector<HTMLButtonElement>('.sp-artifact-card__toggle')!;
    toggle.click();
    const close = outputs.panelEl.querySelector<HTMLButtonElement>(
      '[aria-label="Close artifact"]',
    )!;
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(outputs.panelEl.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);

    toggle.click();
    outputs.sync([]);
    expect(outputs.panelEl.hidden).toBe(true);
    expect(outputs.selectedId()).toBeNull();
  });
});

describe('Outputs popover', () => {
  const withImage = () =>
    finished({
      generatedFiles: [
        {
          id: 'file-1',
          file_name: 'sunset.png',
          mime_type: 'image/png',
          uri: '/api/files/file-1',
          byte_count: 2048,
          kind: 'image',
          surface: 'file',
          previewable: true,
        },
      ],
    } as Partial<SidePanelChatMessage>);

  it('stays out of the header until the chat has made something', () => {
    renderReply(reply('Just words.'));
    expect(outputs.outputsEl.hidden).toBe(true);
  });

  it('counts artifacts and produced files and lists them', () => {
    renderReply(withImage());
    expect(outputs.outputsEl.hidden).toBe(false);
    const trigger = outputs.outputsEl.querySelector<HTMLButtonElement>('#sp-outputs-btn')!;
    expect(trigger.getAttribute('aria-label')).toBe('Outputs, 2');

    trigger.click();
    const popover = outputs.outputsEl.querySelector<HTMLElement>('#sp-outputs-popover')!;
    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const names = [...popover.querySelectorAll('.sp-artifact-card__name')].map(
      (node) => node.textContent,
    );
    expect(names).toEqual(['Desk calculator', 'sunset.png']);
    expect(document.activeElement).toBe(popover.querySelector('button'));
  });

  it('opens an artifact in the panel and a file in a tab', () => {
    renderReply(withImage());
    const trigger = outputs.outputsEl.querySelector<HTMLButtonElement>('#sp-outputs-btn')!;
    trigger.click();
    outputs.outputsEl
      .querySelector<HTMLButtonElement>('[aria-label="Open Desk calculator"]')!
      .click();
    expect(outputs.panelEl.hidden).toBe(false);
    expect(outputs.outputsEl.querySelector<HTMLElement>('#sp-outputs-popover')!.hidden).toBe(true);

    trigger.click();
    outputs.outputsEl.querySelector<HTMLButtonElement>('[aria-label="Open sunset.png"]')!.click();
    expect(access.openUrl).toHaveBeenCalledWith('https://agiworkforce.com/api/files/file-1');
  });

  it('downloads a produced file through the authenticated fetch', async () => {
    renderReply(withImage());
    outputs.outputsEl.querySelector<HTMLButtonElement>('#sp-outputs-btn')!.click();
    const createObjectURL = vi.fn(() => 'blob:sunset');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    outputs.outputsEl
      .querySelector<HTMLButtonElement>('[aria-label="Download sunset.png"]')!
      .click();
    await vi.waitFor(() =>
      expect(access.fetchFile).toHaveBeenCalledWith('https://agiworkforce.com/api/files/file-1'),
    );
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it('closes on Escape and gives focus back to the button', () => {
    renderReply(withImage());
    const trigger = outputs.outputsEl.querySelector<HTMLButtonElement>('#sp-outputs-btn')!;
    trigger.click();
    const popover = outputs.outputsEl.querySelector<HTMLElement>('#sp-outputs-popover')!;
    popover
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('live preview through the artifact sandbox', () => {
  const SANDBOX = 'https://sandbox.agiworkforce.com';
  let live: ArtifactOutputsAPI;

  beforeEach(() => {
    live = createArtifactOutputs({
      fileAccess: access,
      conversationId: () => CONVERSATION_ID,
      webConversationUrl: () => null,
      openUrl,
      writeClipboard,
      saveFile,
      sandboxOrigin: SANDBOX,
    });
    document.body.replaceChildren(live.panelEl);
    const msg = finished();
    live.sync([msg]);
    live.open(live.viewFor(msg).artifacts[0]!.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function frame(): HTMLIFrameElement {
    return live.panelEl.querySelector<HTMLIFrameElement>('iframe')!;
  }

  function fromSandbox(data: unknown, source: Window | null = frame().contentWindow): void {
    window.dispatchEvent(new MessageEvent('message', { data, origin: SANDBOX, source }));
  }

  it('frames the shared renderer origin, never a document of its own', () => {
    expect(frame().getAttribute('src')).toBe(`${SANDBOX}/`);
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame().hasAttribute('srcdoc')).toBe(false);
    expect(live.panelEl.querySelector('[aria-pressed="true"]')?.textContent).toBe('Preview');
  });

  it('posts the artifact once the renderer says it is ready, to its origin only', () => {
    const post = vi.spyOn(frame().contentWindow!, 'postMessage');
    fromSandbox({ type: 'sandbox-ready' });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'render', kind: 'html', runScripts: true }),
      SANDBOX,
    );
    const payload = post.mock.calls[0]![0] as { html: string };
    expect(payload.html).toContain('Content-Security-Policy');
    expect(payload.html).toContain('Desk calculator');
  });

  it('ignores a message that did not come from the frame it opened', () => {
    const post = vi.spyOn(frame().contentWindow!, 'postMessage');
    fromSandbox({ type: 'sandbox-ready' }, window);
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses AI and saved-data requests, which the side panel cannot serve', () => {
    const post = vi.spyOn(frame().contentWindow!, 'postMessage');
    fromSandbox({ type: 'runtime-request', id: 'runtime-1', request: { op: 'complete' } });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'runtime-response', id: 'runtime-1', ok: false }),
      SANDBOX,
    );
    fromSandbox({ type: 'runtime-request', id: '../evil', request: {} });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('says when the preview failed and lets the reader switch to the code', () => {
    fromSandbox({ type: 'render-error', error: 'boom' });
    expect(live.panelEl.querySelector('.sp-artifact-panel__status')?.textContent).toBe(
      'The preview could not start. Review the source or try again.',
    );
    [...live.panelEl.querySelectorAll<HTMLButtonElement>('.sp-artifact-view')]
      .find((button) => button.textContent === 'Code')!
      .click();
    expect(live.panelEl.querySelector('iframe')).toBeNull();
    expect(live.panelEl.querySelector('code')?.textContent).toBe(HTML_ARTIFACT);
  });

  it('falls back to the source when the renderer never answers', () => {
    vi.useFakeTimers();
    const msg = finished();
    live.close();
    live.open(live.viewFor(msg).artifacts[0]!.id);
    frame().dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(3_000);
    expect(live.panelEl.querySelector('iframe')).toBeNull();
    expect(live.panelEl.querySelector('code')?.textContent).toBe(HTML_ARTIFACT);
    expect(live.panelEl.querySelector('.sp-artifact-panel__note')?.textContent).toBe(
      'The live preview is not available right now, so the panel shows the source.',
    );
  });

  it('falls back when the renderer says ready but never renders, as it does for a parent it refuses', () => {
    vi.useFakeTimers();
    const msg = finished();
    live.close();
    live.open(live.viewFor(msg).artifacts[0]!.id);
    fromSandbox({ type: 'sandbox-ready' });
    frame().dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(14_000);
    expect(live.panelEl.querySelector('iframe')).not.toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(live.panelEl.querySelector('iframe')).toBeNull();
    expect(live.panelEl.querySelector('code')?.textContent).toBe(HTML_ARTIFACT);
  });

  it('keeps the preview once the renderer reports it rendered', () => {
    vi.useFakeTimers();
    fromSandbox({ type: 'sandbox-ready' });
    fromSandbox({ type: 'render-complete', kind: 'html' });
    vi.advanceTimersByTime(30_000);
    expect(live.panelEl.querySelector('iframe')).not.toBeNull();
    expect(live.panelEl.querySelector('.sp-artifact-panel__status')?.textContent).toBe('');
  });
});

describe('outputs popover placement', () => {
  it('anchors to the header edge so it stays inside a narrow panel', () => {
    expect(ARTIFACT_PANEL_CSS).toMatch(/#sp-header \{ position: relative; \}/);
    expect(ARTIFACT_PANEL_CSS).not.toMatch(/\.sp-outputs \{[^}]*position: relative/);
    expect(ARTIFACT_PANEL_CSS).toMatch(/\.sp-outputs__popover \{[^}]*right: 12px;/);
  });
});
