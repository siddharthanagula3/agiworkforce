import assert from 'node:assert/strict';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ManagedCloudProjectUpdateRequestSchema,
  managedCloudProjectPath,
} from '@agiworkforce/cloud-contracts';
import { hasUnsavedChanges } from '@agiworkforce/ui';
import type { Project } from '@features/projects/stores/project-store';
import * as FeatureScenes from './FeatureScenes';
import { ProjectSettingsDialog } from '@/features/projects/components/ProjectSettingsDialog';

const transport = vi.hoisted(() => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const state: {
    allow: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
    unexpected: string[];
    restore: () => void;
  } = {
    allow: undefined,
    unexpected: [],
    restore: () => {
      if (descriptor) Object.defineProperty(globalThis, 'fetch', descriptor);
      else Reflect.deleteProperty(globalThis, 'fetch');
      expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')).toEqual(descriptor);
    },
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      if (state.allow) return state.allow(input, init);
      state.unexpected.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return Promise.reject(new Error('Unexpected fetch outside the native Project observation.'));
    },
  });
  return state;
});

const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();
  return {
    ...actual,
    toast: Object.assign(
      (...args: Parameters<typeof actual.toast>) => actual.toast(...args),
      actual.toast,
      notifications,
    ),
  };
});
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));
vi.mock('@/features/projects/components/KnowledgeFilesPanel', () => ({
  KnowledgeFilesPanel: () => null,
}));
vi.mock('@/features/projects/components/ProjectMemoryPanel', () => ({
  ProjectMemoryPanel: () => null,
}));
vi.mock('@/features/projects/components/ProjectDefaultModelField', () => ({
  ProjectDefaultModelField: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  transport.allow = undefined;
});

afterAll(() => {
  let primary: Error | undefined;
  try {
    expect(transport.unexpected).toEqual([]);
  } catch (error) {
    primary = observationError(error);
  }
  const failures: CleanupFailure[] = [];
  captureCleanup(failures, 'fetch-restore', transport.restore);
  finishObservation(primary, failures);
});

type Draft = { name: string; instructions: string };

type CleanupFailure = { phase: string; error: Error };

function observationError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Project observation threw a non-Error value', { cause: error });
}

function captureCleanup(failures: CleanupFailure[], phase: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    failures.push({ phase, error: observationError(error) });
  }
}

function disposeObservation(
  view: ReturnType<typeof render> | undefined,
  priorDirty: boolean,
): CleanupFailure[] {
  const failures: CleanupFailure[] = [];
  if (view) captureCleanup(failures, 'unmount', () => view.unmount());
  captureCleanup(failures, 'cleanup', cleanup);
  captureCleanup(failures, 'dirty-witness', () => expect(hasUnsavedChanges()).toBe(priorDirty));
  captureCleanup(failures, 'transport-reset', () => {
    transport.allow = undefined;
  });
  return failures;
}

function finishObservation(primary: Error | undefined, cleanupFailures: CleanupFailure[]): void {
  if (cleanupFailures.length) {
    const errors = cleanupFailures.map((failure) => failure.error);
    throw Object.assign(
      new AggregateError(
        primary ? [primary, ...errors] : errors,
        primary?.message ?? 'Project observation cleanup failed',
        { cause: primary ?? errors[0] },
      ),
      { cleanupFailures },
    );
  }
  if (primary) throw primary;
}

function readDraft(payload: unknown): Draft {
  const parsed = ManagedCloudProjectUpdateRequestSchema.safeParse(payload);
  assert.ok(parsed.success, 'The authored draft must satisfy the actual update schema');
  assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload));
  assert.deepEqual(
    Reflect.ownKeys(payload).sort(),
    ['instructions', 'name'],
    'The authored draft must contain only name and instructions',
  );
  const raw = payload as Record<string, unknown>;
  assert.equal(typeof raw['name'], 'string', 'The authored name must be a string');
  assert.equal(typeof raw['instructions'], 'string', 'The authored instructions must be a string');
  assert.deepEqual(
    parsed.data,
    payload,
    'The canonical schema must retain the entire authored draft unchanged',
  );
  const draft = payload as Draft;
  assert.equal(draft.name.trim(), draft.name, 'The authored name must already be trimmed');
  assert.equal(
    draft.instructions.trim(),
    draft.instructions,
    'The authored instructions must already be trimmed',
  );
  assert.ok(draft.instructions.length > 0, 'The authored instruction example must be meaningful');
  return draft;
}

function actualDraft(): Draft {
  assert.ok(
    Object.prototype.hasOwnProperty.call(FeatureScenes, 'PROJECT_SETTINGS_DRAFT_EXAMPLE'),
    'FeatureScenes must export its actual PROJECT_SETTINGS_DRAFT_EXAMPLE',
  );
  return readDraft(Reflect.get(FeatureScenes, 'PROJECT_SETTINGS_DRAFT_EXAMPLE'));
}

function one<T>(values: T[], label: string): T {
  assert.equal(values.length, 1, `Expected exactly one ${label}`);
  return values[0]!;
}

const project: Project = {
  id: 'native-project-correspondence-fixture',
  name: 'Existing native fixture name',
  instructions: 'Existing native fixture instructions',
  createdAt: 'fixture-only',
  updatedAt: 'fixture-only',
  usesGlobalMemory: false,
  usesAccountInstructions: false,
  usesAccountStyle: false,
  defaultModelId: null,
};

function nativeSettings() {
  const priorDirty = hasUnsavedChanges();
  let view: ReturnType<typeof render> | undefined;
  const dispose = () => disposeObservation(view, priorDirty);
  try {
    assert.equal(priorDirty, false, 'The native observation requires an isolated clean registry');
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();
    view = render(
      <ProjectSettingsDialog
        open
        project={project}
        onUpdate={onUpdate}
        onOpenChange={onOpenChange}
        onDelete={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Project settings' });
    const name = within(dialog).getByLabelText('Project name');
    const instructions = within(dialog).getByLabelText('Instructions');
    assert.ok(name instanceof HTMLInputElement);
    assert.ok(instructions instanceof HTMLTextAreaElement);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    assert.ok(save instanceof HTMLButtonElement);
    const label = (field: HTMLInputElement | HTMLTextAreaElement) =>
      one(
        Array.from(dialog.querySelectorAll(`label[for="${field.id}"]`)),
        'native field label',
      ).textContent!.trim();
    return {
      name,
      instructions,
      save,
      onUpdate,
      onOpenChange,
      title: within(dialog).getByRole('heading', { name: 'Project settings' }).textContent!.trim(),
      nameLabel: label(name),
      instructionsLabel: label(instructions),
      saveLabel: save.textContent!.trim(),
      dispose,
    };
  } catch (error) {
    const primary = observationError(error);
    finishObservation(primary, dispose());
    throw primary;
  }
}

type Native = Pick<
  ReturnType<typeof nativeSettings>,
  'title' | 'nameLabel' | 'instructionsLabel' | 'saveLabel'
> & { nameLimit: number; body: unknown };

async function observeNative(draft: Draft): Promise<Native> {
  const native = nativeSettings();
  const requests: Array<{
    path: string;
    method: string;
    body: unknown;
    contentType: string | null;
  }> = [];
  transport.allow = async (input, init) => {
    const path = String(input);
    if (path !== managedCloudProjectPath(project.id) || init?.method !== 'PUT') {
      transport.unexpected.push(`${init?.method ?? 'GET'} ${path}`);
      throw new Error('Unexpected native Project request');
    }
    requests.push({
      path,
      method: init.method,
      body: JSON.parse(String(init.body)),
      contentType: new Headers(init.headers).get('Content-Type'),
    });
    throw new Error('Controlled Project update rejection; no stored response');
  };
  let primary: Error | undefined;
  try {
    expect(requests).toEqual([]);
    assert.ok(native.name.maxLength > 0, 'The native name input must expose its actual limit');
    assert.ok(
      draft.name.length + 2 <= native.name.maxLength,
      'The authored name must fit the native editor',
    );
    fireEvent.change(native.name, { target: { value: ` ${draft.name} ` } });
    fireEvent.change(native.instructions, { target: { value: ` ${draft.instructions} ` } });
    expect(requests).toEqual([]);
    expect(hasUnsavedChanges()).toBe(true);
    expect(native.save.disabled).toBe(false);
    await userEvent.setup().click(native.save);
    await waitFor(() => {
      expect(requests).toHaveLength(1);
      expect(notifications.error).toHaveBeenCalledTimes(1);
      expect(native.save.disabled).toBe(false);
    });
    expect(requests[0]!.contentType).toBe('application/json');
    const body = ManagedCloudProjectUpdateRequestSchema.parse(requests[0]!.body);
    expect(body).toEqual(requests[0]!.body);
    expect(body).toEqual({
      ...draft,
      description: null,
      usesGlobalMemory: project.usesGlobalMemory !== false,
      usesAccountInstructions: project.usesAccountInstructions !== false,
      usesAccountStyle: project.usesAccountStyle !== false,
      defaultModelId: project.defaultModelId ?? null,
    });
    expect(native.name.value).toBe(` ${draft.name} `);
    expect(native.instructions.value).toBe(` ${draft.instructions} `);
    expect(native.onUpdate).not.toHaveBeenCalled();
    expect(native.onOpenChange).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
    expect(hasUnsavedChanges()).toBe(true);
    return {
      title: native.title,
      nameLabel: native.nameLabel,
      instructionsLabel: native.instructionsLabel,
      saveLabel: native.saveLabel,
      nameLimit: native.name.maxLength,
      body,
    };
  } catch (error) {
    primary = observationError(error);
    throw primary;
  } finally {
    finishObservation(primary, native.dispose());
  }
}

function markup(): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<FeatureScenes.ProjectWindow />);
  return root;
}

function requireScene(root: HTMLElement, payload: unknown, native: Native): void {
  const draft = readDraft(payload);
  assert.ok(draft.name.length <= native.nameLimit, 'The authored name must fit the native editor');
  const frame = one(Array.from(root.querySelectorAll('figure')), 'actual Project frame');
  assert.equal(
    frame.getAttribute('aria-label'),
    'Authored example of a current Web project settings draft',
  );
  const body = one(
    Array.from(frame.querySelectorAll('.agi-dev-body.agi-sc')),
    'actual AppWindow body',
  );
  assert.equal(body.getAttribute('aria-hidden'), 'true');
  const scene = one(
    Array.from(body.querySelectorAll('[data-project-illustration="draft"]')),
    'authored Project draft',
  );
  assert.equal(scene.parentElement, body);
  assert.equal(body.children.length, 1);
  const text = (selector: string) =>
    one(Array.from(scene.querySelectorAll(selector)), selector).textContent!.trim();
  assert.equal(
    text('[data-project-draft-value="name"]'),
    draft.name,
    'The visible name must equal the authored draft',
  );
  assert.equal(
    text('[data-project-draft-value="instructions"]'),
    draft.instructions,
    'The visible instructions must equal the authored draft',
  );
  assert.equal(text('[data-project-native-label="name"]'), native.nameLabel);
  assert.equal(text('[data-project-native-label="instructions"]'), native.instructionsLabel);
  assert.equal(text('[data-project-native-label="action"]'), native.saveLabel);
  assert.equal(text('[data-project-example-label]'), 'Authored example');
  assert.equal(text('[data-project-draft-caption]'), 'Current draft');
  assert.equal(text('[data-project-draft-status]'), 'No changes have been saved.');
  assert.equal(
    one(Array.from(frame.querySelectorAll('.agi-dev-title')), 'frame title').textContent,
    native.title,
  );
  assert.equal(
    one(Array.from(frame.querySelectorAll('.agi-dev-badge')), 'Web badge').textContent,
    'Web',
  );
  assert.equal(
    frame.querySelectorAll(
      'a,button,input,select,textarea,form,[tabindex],[role="button"],[role="link"],[role="textbox"],[contenteditable]',
    ).length,
    0,
    'The entire marketing frame must remain passive',
  );
  assert.equal(
    frame.querySelectorAll('.agi-mk-receipt,ul,ol,li,time').length,
    0,
    'The settings draft must not invent saved files, threads, dates or receipts',
  );
  const compact = (value: string) => value.replace(/\s+/gu, ' ').trim();
  const expected = [
    native.title,
    'Authored example',
    'Current draft',
    native.nameLabel,
    draft.name,
    native.instructionsLabel,
    draft.instructions,
    native.saveLabel,
    'No changes have been saved.',
  ];
  assert.equal(
    compact(scene.textContent ?? ''),
    compact(expected.join('')),
    'The draft must contain exactly its authored fields and unsaved labels',
  );
  assert.equal(
    compact(frame.textContent ?? ''),
    compact(native.title + 'Web' + expected.join('')),
    'The entire frame must not add a synthetic path, token total or saved outcome',
  );
  const wire = ManagedCloudProjectUpdateRequestSchema.parse(native.body);
  assert.equal(wire.name, draft.name, 'The authored name must equal the real native PUT name');
  assert.equal(
    wire.instructions,
    draft.instructions,
    'The authored instructions must equal the real native PUT instructions',
  );
}

describe('authored Project settings correspondence', () => {
  it('marks the initial actual frame as an unsaved authored draft independently of its export', () => {
    const root = markup();
    const frame = one(Array.from(root.querySelectorAll('figure')), 'actual Project frame');
    expect(frame.getAttribute('aria-label')).toBe(
      'Authored example of a current Web project settings draft',
    );
    expect(frame.querySelector('.agi-mk-receipt,ul,ol,li,time')).toBeNull();
    const scene = one(
      Array.from(frame.querySelectorAll('[data-project-illustration="draft"]')),
      'authored Project draft',
    );
    expect(
      one(Array.from(scene.querySelectorAll('[data-project-example-label]')), 'example label')
        .textContent,
    ).toBe('Authored example');
    expect(
      one(Array.from(scene.querySelectorAll('[data-project-draft-caption]')), 'draft caption')
        .textContent,
    ).toBe('Current draft');
    expect(
      one(Array.from(scene.querySelectorAll('[data-project-draft-status]')), 'unsaved status')
        .textContent,
    ).toBe('No changes have been saved.');
  });

  it('exports only the actual unsaved example fields without canonical projection', () => {
    actualDraft();
  });

  it('binds initial passive markup to native labels and the real rejected PUT without saved outcomes', async () => {
    const draft = actualDraft();
    const native = await observeNative(draft);
    requireScene(markup(), draft, native);
  });

  it('keeps the native blank-name guard active even through Enter', () => {
    const native = nativeSettings();
    let primary: Error | undefined;
    try {
      fireEvent.change(native.name, { target: { value: '   ' } });
      expect(native.save.disabled).toBe(true);
      fireEvent.keyDown(native.name, { key: 'Enter' });
      expect(notifications.error).toHaveBeenCalledWith('Project name is required');
      expect(native.onUpdate).not.toHaveBeenCalled();
      expect(native.onOpenChange).not.toHaveBeenCalled();
      expect(transport.unexpected).toEqual([]);
    } catch (error) {
      primary = observationError(error);
      throw primary;
    } finally {
      finishObservation(primary, native.dispose());
    }
  });

  it('keeps the mounted marketing Save span passive', async () => {
    const priorDirty = hasUnsavedChanges();
    let view: ReturnType<typeof render> | undefined;
    let primary: Error | undefined;
    try {
      assert.equal(
        priorDirty,
        false,
        'The marketing observation requires an isolated clean registry',
      );
      view = render(<FeatureScenes.ProjectWindow />);
      const save = one(
        Array.from(view.container.querySelectorAll('[data-project-native-label="action"]')),
        'marketing Save',
      );
      expect(save.tagName).toBe('SPAN');
      expect(save.textContent).toBe('Save');
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      const before = view.container.innerHTML;
      await userEvent.setup().click(save);
      expect(view.container.innerHTML).toBe(before);
      expect(transport.unexpected).toEqual([]);
      expect(notifications.success).not.toHaveBeenCalled();
    } catch (error) {
      primary = observationError(error);
      throw primary;
    } finally {
      finishObservation(primary, disposeObservation(view, priorDirty));
    }
  });
});

describe('Project correspondence negative controls', () => {
  it.each(['id', 'createdAt', 'updatedAt', 'files', 'threads', 'tokenCount', 'saved'])(
    'rejects projected saved-record or outcome field: %s',
    (field) => {
      const payload = { ...actualDraft(), [field]: 'invented-outcome' };
      expect(ManagedCloudProjectUpdateRequestSchema.safeParse(payload).success).toBe(true);
      expect(() => readDraft(payload)).toThrowError(
        'The authored draft must contain only name and instructions',
      );
    },
  );

  it('rejects nullable wire instructions as a visible authored instruction example', () => {
    const payload = { ...actualDraft(), instructions: null };
    expect(ManagedCloudProjectUpdateRequestSchema.safeParse(payload).success).toBe(true);
    expect(() => readDraft(payload)).toThrowError('The authored instructions must be a string');
  });

  it('rejects a name normalized by the wire schema', () => {
    const payload = { ...actualDraft(), name: ` ${actualDraft().name} ` };
    expect(ManagedCloudProjectUpdateRequestSchema.parse(payload).name).toBe(payload.name.trim());
    expect(() => readDraft(payload)).toThrowError(
      'The canonical schema must retain the entire authored draft unchanged',
    );
  });

  it('rejects instructions that native Save would change', () => {
    const payload = { ...actualDraft(), instructions: ` ${actualDraft().instructions} ` };
    expect(ManagedCloudProjectUpdateRequestSchema.parse(payload).instructions).toBe(
      payload.instructions,
    );
    expect(() => readDraft(payload)).toThrowError(
      'The authored instructions must already be trimmed',
    );
  });

  it.each(['name', 'instructions'] as const)('rejects a different visible %s', async (field) => {
    const draft = actualDraft();
    const native = await observeNative(draft);
    const root = markup();
    one(
      Array.from(root.querySelectorAll(`[data-project-draft-value="${field}"]`)),
      'actual visible field',
    ).textContent = 'A different authored value';
    expect(() => requireScene(root, draft, native)).toThrowError(
      `The visible ${field} must equal the authored draft`,
    );
  });

  it('rejects an interactive marketing Save even when its label is correct', async () => {
    const draft = actualDraft();
    const native = await observeNative(draft);
    const root = markup();
    const save = one(
      Array.from(root.querySelectorAll('[data-project-native-label="action"]')),
      'actual Save span',
    );
    const button = document.createElement('button');
    button.setAttribute('data-project-native-label', 'action');
    button.textContent = save.textContent;
    save.replaceWith(button);
    expect(() => requireScene(root, draft, native)).toThrowError(
      'The entire marketing frame must remain passive',
    );
  });

  it('rejects an extra token or saved-outcome statement outside the authored scene', async () => {
    const draft = actualDraft();
    const native = await observeNative(draft);
    const root = markup();
    const outcome = document.createElement('span');
    outcome.textContent = 'Every prompt contains 9.2k tokens of saved files';
    one(Array.from(root.querySelectorAll('figure')), 'actual frame').append(outcome);
    expect(() => requireScene(root, draft, native)).toThrowError(
      'The entire frame must not add a synthetic path, token total or saved outcome',
    );
  });

  it('rejects a wire-valid name beyond the actual native input limit', async () => {
    const draft = actualDraft();
    const native = await observeNative(draft);
    const payload = { ...draft, name: 'x'.repeat(native.nameLimit + 1) };
    expect(readDraft(payload)).toEqual(payload);
    expect(() => requireScene(markup(), payload, native)).toThrowError(
      'The authored name must fit the native editor',
    );
  });
});
