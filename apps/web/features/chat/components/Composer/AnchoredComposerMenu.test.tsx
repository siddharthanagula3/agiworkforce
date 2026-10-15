import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnchoredComposerMenu } from './AnchoredComposerMenu';

const MENU_LABEL = 'Suggestions';
const FIRST_ITEM_LABEL = 'First item';
const SECOND_ITEM_LABEL = 'Second item';
const INPUT_LABEL = 'Message';

function Harness({
  autoFocusFirstItem,
  onRequestClose,
}: {
  autoFocusFirstItem?: boolean;
  onRequestClose?: () => void;
}) {
  const anchorRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div>
      <input
        ref={anchorRef}
        aria-label={INPUT_LABEL}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
      />
      <AnchoredComposerMenu
        anchorRef={anchorRef}
        open={open}
        label={MENU_LABEL}
        autoFocusFirstItem={autoFocusFirstItem}
        onRequestClose={onRequestClose}
      >
        <button type="button">{FIRST_ITEM_LABEL}</button>
        <button type="button">{SECOND_ITEM_LABEL}</button>
      </AnchoredComposerMenu>
    </div>
  );
}

function openByTyping(text: string) {
  const input = screen.getByLabelText(INPUT_LABEL);
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe('AnchoredComposerMenu focus on open', () => {
  it('focuses the first row when the host says nothing', async () => {
    render(<Harness />);
    openByTyping('@');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: FIRST_ITEM_LABEL })).toHaveFocus(),
    );
  });

  it('leaves focus in the input when the host opts out', async () => {
    render(<Harness autoFocusFirstItem={false} />);
    const input = openByTyping('@');

    await screen.findByRole('dialog', { name: MENU_LABEL });
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole('button', { name: FIRST_ITEM_LABEL })).not.toHaveFocus();
  });

  it('keeps typing into the input working while the menu is open', async () => {
    render(<Harness autoFocusFirstItem={false} />);
    const input = openByTyping('@');
    await screen.findByRole('dialog', { name: MENU_LABEL });

    fireEvent.change(input, { target: { value: '@do' } });

    expect(input).toHaveValue('@do');
    expect(input).toHaveFocus();
  });

  it('still closes on Escape and hands focus back when it never took it', async () => {
    const onRequestClose = vi.fn();
    render(<Harness autoFocusFirstItem={false} onRequestClose={onRequestClose} />);
    const input = openByTyping('@');
    await screen.findByRole('dialog', { name: MENU_LABEL });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
  });
});

describe('AnchoredComposerMenu tab out', () => {
  it('closes and hands focus back to the anchor when Tab leaves the panel', async () => {
    const onRequestClose = vi.fn();
    render(<Harness onRequestClose={onRequestClose} />);
    const input = openByTyping('@');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: FIRST_ITEM_LABEL })).toHaveFocus(),
    );

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
  });

  it('leaves Tab to the host when the menu never took focus', async () => {
    const onRequestClose = vi.fn();
    render(<Harness autoFocusFirstItem={false} onRequestClose={onRequestClose} />);
    const input = openByTyping('@');
    await screen.findByRole('dialog', { name: MENU_LABEL });

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(onRequestClose).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });
});

describe('AnchoredComposerMenu width', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spans its anchor when asked to, so a full-width list keeps the composer width', async () => {
    function WidthHarness() {
      const anchorRef = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div ref={anchorRef} data-testid="anchor" />
          <AnchoredComposerMenu anchorRef={anchorRef} open label={MENU_LABEL} matchAnchorWidth>
            <button type="button">{FIRST_ITEM_LABEL}</button>
          </AnchoredComposerMenu>
        </div>
      );
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset['testid'] === 'anchor'
        ? ({ top: 600, bottom: 660, left: 24, right: 744, width: 720, height: 60 } as DOMRect)
        : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect);
    });

    render(<WidthHarness />);

    const panel = await screen.findByRole('dialog', { name: MENU_LABEL });
    await waitFor(() => expect(panel.style.width).toBe('720px'));
    expect(panel.style.left).toBe('24px');
  });
});
