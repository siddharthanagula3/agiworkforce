import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  getDefaultModelFor,
  getProviderOfferings,
  providerOfferingLabel,
} from '@agiworkforce/types';
import { ComposerFooter } from './ComposerFooter';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';
import { freeQuotaSelection } from '@features/chat/lib/free-quota-selection';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const longestModel = [...AVAILABLE_MODELS].sort((a, b) => b.name.length - a.name.length)[0]!;
const routerModel = AVAILABLE_MODELS.find(
  (model) => model.id === getDefaultModelFor('free', 'chat'),
)!;
const ROUTER_MODEL_NAME = routerModel.name;
const freeQuotaKey = Object.keys(getProviderOfferings()).find(
  (key) => freeQuotaSelection(key)?.quotaProbeProtocol === 'chat',
)!;

const TAB_STOP_LIMIT = 10;

async function tabTo(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  for (let stop = 0; stop < TAB_STOP_LIMIT && document.activeElement !== target; stop += 1) {
    await user.tab();
  }
  expect(document.activeElement).toBe(target);
}

function renderFooter() {
  return render(
    <div style={{ width: 320 }}>
      <ComposerFooter inline showModelSelector />
    </div>,
  );
}

describe('ComposerFooter inline, bottom row stays a single usable line', () => {
  beforeEach(() => {
    useModelStore.setState({ selectedModelId: longestModel.id });
  });

  it('keeps an unbroken min-w-0 shrink chain from the footer root to the model trigger', () => {
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement | null;
    expect(trigger).toBeTruthy();

    const root = container.firstElementChild as HTMLElement;
    let el: HTMLElement | null = trigger;
    while (el && el !== root) {
      if (el.classList.contains('flex')) {
        expect(
          el.className.includes('min-w-0'),
          `flex ancestor missing min-w-0 (breaks the shrink chain): "${el.className}"`,
        ).toBe(true);
      }
      el = el.parentElement;
    }
  });

  it('floors the model name width so it can never collapse to 0px, but still truncates', () => {
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement | null;
    expect(trigger).toBeTruthy();

    const nameSpan = trigger!.querySelector('span.truncate') as HTMLElement | null;
    expect(nameSpan).toBeTruthy();
    expect(nameSpan!.className).toContain('min-w-[3.5rem]');
    expect(nameSpan!.className).toContain('truncate');
    expect(nameSpan!.className).toContain('max-w-[8.5rem]');
    expect(nameSpan!.className).toContain('sm:max-w-[11rem]');
    expect(nameSpan!.className).not.toContain('min-w-0');
  });

  it('does NOT render the persistent "Cmd+Enter to send" keyboard hint', () => {
    const { container } = renderFooter();
    expect(container.textContent).not.toContain('Cmd+Enter');
    expect(container.textContent?.toLowerCase()).not.toContain('to send');
  });

  it('hides the response-style selector below sm so the control row stays one line', () => {
    const { container } = renderFooter();
    const styleBtn = container.querySelector(
      'button[aria-label="Response style"]',
    ) as HTMLElement | null;
    expect(styleBtn).toBeTruthy();
    const wrapper = styleBtn!.closest('.hidden') as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain('sm:block');
  });

  it('names the trigger with its visible label first and keeps the full name in its text', () => {
    useModelStore.setState({ selectedModelId: routerModel.id });
    renderFooter();

    const trigger = screen.getByRole('button', { name: `${ROUTER_MODEL_NAME}, change model` });
    expect(trigger).toHaveAttribute('id', 'model-selector');
    expect(trigger).toHaveTextContent(ROUTER_MODEL_NAME);
    expect(trigger).not.toHaveAttribute('title');
  });

  it('includes the visible Free badge in the name of a free-quota selection', () => {
    useModelStore.setState({ selectedModelId: freeQuotaKey });
    renderFooter();

    const visibleName = providerOfferingLabel(freeQuotaKey)!.displayName;
    const trigger = screen.getByRole('button', { name: /, change model$/ });
    expect(trigger).toHaveAccessibleName(`${visibleName} Free, change model`);
    expect(trigger).toHaveTextContent(visibleName);
    expect(trigger).toHaveTextContent('Free');
  });

  it('describes the trigger with the provider and shows the full name on keyboard focus', async () => {
    useModelStore.setState({ selectedModelId: routerModel.id });
    const user = userEvent.setup();
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement;

    const receipt = document.getElementById(trigger.getAttribute('aria-describedby')!);
    expect(receipt).toHaveTextContent(routerModel.provider);
    expect(trigger.contains(receipt)).toBe(false);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await tabTo(user, trigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(ROUTER_MODEL_NAME);
    expect(tooltip).toHaveTextContent(routerModel.provider);
    expect(trigger).toHaveAttribute('aria-describedby', receipt!.id);
  });

  it('hides the name tooltip while the picker is open', async () => {
    useModelStore.setState({ selectedModelId: routerModel.id });
    const user = userEvent.setup();
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement;

    await tabTo(user, trigger);
    await screen.findByRole('tooltip');

    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Models' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => trigger.focus());

    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
