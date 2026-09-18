import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getModelMetadataById } from '@agiworkforce/types';
import { ComposerFooter } from './ComposerFooter';
import { contextBudgetTokens } from './model-compatibility';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

interface Catalogued {
  model: AIModel;
  contextWindow: number;
  budget: number;
}

function catalogued(model: AIModel): Catalogued | null {
  const meta = getModelMetadataById(model.id);
  if (!meta?.contextWindow) return null;
  return {
    model,
    contextWindow: meta.contextWindow,
    budget: contextBudgetTokens(meta.contextWindow, meta.maxOutputTokens ?? 0),
  };
}

function seedConversation(messages: unknown[]): void {
  useChatStore.setState({
    activeConversationId: 'conv-1',
    conversations: [
      { id: 'conv-1', title: 'T', createdAt: '', updatedAt: '', model: null },
    ] as never,
    messages: messages as never,
  });
}

function renderFooter() {
  return render(<ComposerFooter showModelSelector />);
}

async function openPicker(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  await screen.findByRole('button', { name: /All models/ });
}

function pickerRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button[data-picker-row]'));
}

/** Rows carry their capability chips before the name, so match on containment. */
function rowFor(name: string): HTMLElement {
  const row = pickerRows().find((element) => (element.textContent ?? '').includes(name));
  if (!row) throw new Error(`no picker row for ${name}`);
  return row;
}

/** Models the short list actually offers, so the test drives the real control. */
let anchor: Catalogued;
let target: Catalogued;

beforeAll(async () => {
  useBillingStore.setState({ subscription: null, unauthenticated: true });
  useModelStore.setState({ selectedModelId: AVAILABLE_MODELS[0]!.id });
  seedConversation([]);
  const user = userEvent.setup();
  renderFooter();
  await openPicker(user);
  const rows = pickerRows().map((element) => element.textContent ?? '');
  const offered = AVAILABLE_MODELS.filter((model) => rows.some((text) => text.includes(model.name)))
    .map(catalogued)
    .filter((entry): entry is Catalogued => entry !== null)
    .sort((a, b) => a.contextWindow - b.contextWindow);
  cleanup();
  expect(offered.length).toBeGreaterThan(1);
  target = offered[0]!;
  anchor = offered[offered.length - 1]!;
});

/** Long enough that the smallest offered window cannot hold it. */
function overflowingTurn(): Record<string, unknown> {
  return { id: 'm1', role: 'user', content: 'x'.repeat(target.budget * 6), createdAt: '' };
}

beforeEach(() => {
  useBillingStore.setState({ subscription: null, unauthenticated: true });
  useModelStore.setState({ selectedModelId: anchor.model.id });
  seedConversation([]);
});

describe('ComposerFooter model switch compatibility', () => {
  it('gates a switch whose context window cannot hold the conversation', async () => {
    const user = userEvent.setup();
    seedConversation([overflowingTurn()]);
    renderFooter();
    await openPicker(user);

    await user.click(rowFor(target.model.name));

    const finding = await screen.findByText(/Older messages will be left out/i);
    expect(finding.getAttribute('data-compatibility-code')).toBe('context_overflow');
    expect(finding.textContent).toContain(target.model.name);
    expect(useModelStore.getState().selectedModelId).toBe(anchor.model.id);
  });

  it('commits the switch only after the warning is acknowledged', async () => {
    const user = userEvent.setup();
    seedConversation([overflowingTurn()]);
    renderFooter();
    await openPicker(user);
    await user.click(rowFor(target.model.name));
    await screen.findByText(/Older messages will be left out/i);

    await user.click(screen.getByRole('button', { name: 'Switch anyway' }));

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe(target.model.id);
    });
  });

  it('keeps the current model when the warning is declined', async () => {
    const user = userEvent.setup();
    seedConversation([overflowingTurn()]);
    renderFooter();
    await openPicker(user);
    await user.click(rowFor(target.model.name));
    await user.click(await screen.findByRole('button', { name: `Keep ${anchor.model.name}` }));

    expect(useModelStore.getState().selectedModelId).toBe(anchor.model.id);
    expect(screen.queryByText(/Older messages will be left out/i)).toBeNull();
  });

  it('switches without a gate when the conversation fits the target window', async () => {
    const user = userEvent.setup();
    seedConversation([{ id: 'm1', role: 'user', content: 'hi', createdAt: '' }]);
    renderFooter();
    await openPicker(user);

    await user.click(rowFor(target.model.name));

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe(target.model.id);
    });
    expect(screen.queryByRole('button', { name: 'Switch anyway' })).toBeNull();
  });

  it('repeats the server substitution disclosure in the picker', async () => {
    const user = userEvent.setup();
    seedConversation([
      { id: 'm1', role: 'user', content: 'hi', createdAt: '' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'hello',
        createdAt: '',
        model: target.model.id,
        fallbackReason: 'managed_failover',
      },
    ]);
    renderFooter();
    await openPicker(user);

    const notice = await screen.findByRole('status', { name: 'Model compatibility' });
    expect(notice.textContent).toContain(target.model.name);
    expect(notice.textContent).toMatch(/unavailable/i);
  });

  it('shows no compatibility notice when the conversation fits and asks for nothing extra', async () => {
    const user = userEvent.setup();
    seedConversation([{ id: 'm1', role: 'user', content: 'hi', createdAt: '' }]);
    renderFooter();
    await openPicker(user);

    expect(screen.queryByRole('status', { name: 'Model compatibility' })).toBeNull();
  });
});
