// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const ast = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
let callback: ts.Node | undefined;
function visit(node: ts.Node): void {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'linkForm.addEventListener' &&
    node.arguments[0]?.getText(ast) === "'submit'"
  )
    callback = node.arguments[1];
  ts.forEachChild(node, visit);
}
visit(ast);
if (!callback) throw new Error('Production link submit handler not found');
const handler = callback.getText(ast);

function setup() {
  let live = true;
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const readLinkedPage = vi.fn(async () => pending);
  const requestSiteAccess = vi.fn(() => {
    throw new Error('Unexpected browser-site permission request');
  });
  const attachPageCapture = vi.fn();
  const finishComposerAttachmentIntake = vi.fn();
  const linkInput = document.createElement('input');
  linkInput.value = 'https://example.com/';
  const linkSubmit = document.createElement('button');
  const linkError = document.createElement('div');
  const closeLinkForm = vi.fn();
  const owner = { accountId: 'owner-a', authIncarnation: 'session-a' };
  const dependencies = {
    linkInput,
    linkSubmit,
    linkError,
    closeLinkForm,
    attachPageCapture,
    readLinkedPage,
    normalizeApprovedSiteOrigin: () => 'https://example.com',
    beginComposerAttachmentIntake: () => ({ owner }),
    composerAttachmentIntakeCurrent: () => live,
    finishComposerAttachmentIntake,
    approveSiteForReading: requestSiteAccess,
    t: (key: string) => key,
    pageChipLabel: () => 'example.com',
    AbortController,
  };
  const compiled = ts.transpileModule(
    `let linkRead = null; let tabContextIntakeAbort = null; return {submit: ${handler},cancel:()=>linkRead?.abort()};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes the repository-owned submit callback in an isolated DOM fixture.
  const runtime = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as { submit: (event: Event) => void; cancel: () => void };
  runtime.submit(new Event('submit', { cancelable: true }));
  return {
    readLinkedPage,
    requestSiteAccess,
    attachPageCapture,
    finishComposerAttachmentIntake,
    linkInput,
    linkSubmit,
    linkError,
    closeLinkForm,
    resolve,
    cancel: runtime.cancel,
    retire: () => {
      live = false;
    },
  };
}
const capture = { ok: true, text: 'Fetched public text', source: { url: 'https://example.com/' } };
describe('production link intake lifetime', () => {
  it('attaches a completed public read without requesting browser-site access', async () => {
    const h = setup();
    await vi.waitFor(() => expect(h.readLinkedPage).toHaveBeenCalledOnce());
    h.resolve(capture);
    await vi.waitFor(() => expect(h.attachPageCapture).toHaveBeenCalledWith(capture));
    expect(h.requestSiteAccess).not.toHaveBeenCalled();
    expect(h.closeLinkForm).toHaveBeenCalledOnce();
  });
  it('suppresses a result after cancellation', async () => {
    const h = setup();
    await vi.waitFor(() => expect(h.readLinkedPage).toHaveBeenCalledOnce());
    h.cancel();
    h.resolve(capture);
    await vi.waitFor(() => expect(h.finishComposerAttachmentIntake).toHaveBeenCalledOnce());
    expect(h.attachPageCapture).not.toHaveBeenCalled();
    expect(h.requestSiteAccess).not.toHaveBeenCalled();
    expect(h.linkSubmit.disabled).toBe(false);
    expect(h.linkError.textContent).toBe('');
  });
  it('suppresses another conversation or account even without transport cancellation', async () => {
    const h = setup();
    await vi.waitFor(() => expect(h.readLinkedPage).toHaveBeenCalledOnce());
    h.retire();
    h.resolve(capture);
    await vi.waitFor(() => expect(h.finishComposerAttachmentIntake).toHaveBeenCalledOnce());
    expect(h.attachPageCapture).not.toHaveBeenCalled();
    expect(h.requestSiteAccess).not.toHaveBeenCalled();
  });
});
