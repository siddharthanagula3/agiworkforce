import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_MODEL_TYPES,
  PROVIDERS_IN_ORDER,
  getDefaultAutoRoutingProfile,
  getModelReasoning,
  getModelsForTierAndSurface,
  getProviderDisplayLabel,
  isAutoModeModelId,
} from '@agiworkforce/types';
import {
  buildManagedModelPickerMenu,
  canUseManagedQuickRouting,
  filterManagedModelOptions,
  type ManagedModelPickerOption,
} from '../src/features/cloud-bridge/managedModelPicker';
import { el } from '../src/features/side-panel/dom';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
let renderer: ts.FunctionDeclaration | undefined;
let outsideClick: ts.CallExpression | undefined;
function findMountedPicker(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'renderModelDropdown') renderer = node;
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(program) === 'document.addEventListener' &&
    ts.isStringLiteral(node.arguments[0]!) &&
    node.arguments[0].text === 'click' &&
    node.arguments[1]?.getText(program).includes('modelSelectorWrap')
  )
    outsideClick = node;
  ts.forEachChild(node, findMountedPicker);
}
findMountedPicker(program);
if (!renderer || !outsideClick)
  throw new Error('Production model picker event handlers were not found');
const rendererSource = renderer.getText(program);
const outsideClickSource = outsideClick.getText(program);
const cleanup: Array<() => void> = [];

function harness() {
  const wrap = el('div');
  const trigger = el('button', { 'aria-expanded': 'true', class: 'open' });
  const dropdown = el('div', { class: 'open' });
  wrap.append(trigger, dropdown);
  document.body.append(wrap);
  const profile = getDefaultAutoRoutingProfile();
  const access = {
    subscriptionTier: 'max',
    allowedAutoModes: [profile.id],
    modelIds: getModelsForTierAndSurface('max', 'chrome/managed-chat', {
      modelTypes: [...CHAT_MODEL_TYPES],
    }).map((model) => model.id),
  };
  const makeRow = (option: ManagedModelPickerOption): HTMLElement =>
    el('button', { class: 'sp-model-option', 'data-model': option.value }, option.label);
  const doc = {
    addEventListener: (type: string, listener: EventListener) => {
      document.addEventListener(type, listener);
      cleanup.push(() => document.removeEventListener(type, listener));
    },
  };
  const dependencies = {
    _ctx: { selectedModel: profile.id, quickMode: false, thinkingEnabled: false },
    modelSelectorWrap: wrap,
    modelSelectorBtn: trigger,
    modelDropdownEl: dropdown,
    managedModelAccess: access,
    buildManagedModelPickerMenu,
    filterManagedModelOptions,
    canUseManagedQuickRouting,
    getModelReasoning,
    isAutoModeModelId,
    PROVIDERS_IN_ORDER,
    UNKNOWN_PROVIDER_KEY: 'unknown-provider',
    modelGroupHeading: getProviderDisplayLabel,
    buildModelOptionRow: makeRow,
    appendModelRows: (rows: ManagedModelPickerOption[]) =>
      rows.forEach((row) => dropdown.append(makeRow(row))),
    clearChildren: (element: HTMLElement) => element.replaceChildren(),
    appendEffortSection: vi.fn(),
    appendToggleRow: vi.fn(),
    applyQuickMode: vi.fn(),
    el,
    renderIcon: () => el('span'),
    ChevronRight: null,
    t: (key: string, substitutions: string[] = []) =>
      key === 'spAllModels' ? `All models (${substitutions[0]})` : key,
    chrome: { storage: { local: { set: async () => {} } } },
    document: doc,
  };
  const compiled = ts.transpileModule(
    `let modelCatalogueOpen = false;
    let modelSearchQuery = ''; let modelCapabilityFilter = null;
    ${rendererSource}\n${outsideClickSource};
    renderModelDropdown(); return { getAll: () => modelCatalogueOpen };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as { getAll(): boolean };
  const all = () =>
    Array.from(dropdown.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('All models'),
    )!;
  return { wrap, trigger, dropdown, all, api };
}

afterEach(() => {
  for (const remove of cleanup.splice(0)) remove();
  document.body.replaceChildren();
});

describe('mounted model picker rebuild events', () => {
  it('keeps All models open when its original button is removed before the outside-click listener runs', () => {
    const test = harness();
    const original = test.all();
    let targetWasDetached = false;
    const observer = (event: MouseEvent): void => {
      if (event.target === original) targetWasDetached = !original.isConnected;
    };
    document.addEventListener('click', observer);
    original.click();
    document.removeEventListener('click', observer);

    expect(targetWasDetached).toBe(true);
    expect(test.api.getAll()).toBe(true);
    expect(test.dropdown.classList.contains('open')).toBe(true);
    expect(test.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(test.dropdown.querySelector('#sp-model-search')).not.toBeNull();
  });

  it('keeps search and capability results open through rebuilding controls', () => {
    const test = harness();
    test.all().click();
    const search = test.dropdown.querySelector<HTMLInputElement>('#sp-model-search')!;
    search.value = 'Anthropic';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(search.isConnected).toBe(false);
    expect(test.dropdown.classList.contains('open')).toBe(true);
    const replacement = test.dropdown.querySelector<HTMLInputElement>('#sp-model-search')!;
    expect(replacement.value).toBe('Anthropic');
    expect(document.activeElement).toBe(replacement);

    const capability = test.dropdown.querySelector<HTMLSelectElement>('select')!;
    capability.addEventListener('click', () => {
      capability.value = 'tools';
      capability.dispatchEvent(new Event('change', { bubbles: true }));
    });
    capability.click();
    expect(capability.isConnected).toBe(false);
    expect(test.dropdown.classList.contains('open')).toBe(true);
    expect(test.dropdown.querySelector<HTMLSelectElement>('select')?.value).toBe('tools');
    expect(test.dropdown.querySelector<HTMLInputElement>('#sp-model-search')?.value).toBe(
      'Anthropic',
    );
  });

  it('still closes the picker when a click starts outside the original menu path', () => {
    const test = harness();
    const outside = el('button');
    document.body.append(outside);
    outside.click();
    expect(test.dropdown.classList.contains('open')).toBe(false);
    expect(test.trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
