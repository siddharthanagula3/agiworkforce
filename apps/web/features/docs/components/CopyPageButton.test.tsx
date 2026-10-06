import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyPageButton, CopyTextButton } from './CopyPageButton';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('documentation clipboard feedback', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  let originalClipboard: PropertyDescriptor | undefined;

  function installClipboard() {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  }

  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    writeText.mockReset();
    installClipboard();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('copies the exact Markdown and announces success before resetting the label', async () => {
    vi.useFakeTimers();
    const markdown = '# A page\n\n```ts\n  const value = 1;\n```\n';
    writeText.mockResolvedValue();
    render(<CopyPageButton markdown={markdown} />);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy page' })));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(markdown);
    expect(screen.getByRole('button', { name: 'Copied' })).toHaveClass('dx-action');
    expect(screen.getByRole('status')).toHaveTextContent('Page copied');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Copy page' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('copies generic code source without trimming, escaping or reformatting it', async () => {
    const text = '\tconst template = `<p>${value}</p>`;\n\n  // trailing spaces  \n';
    writeText.mockResolvedValue();
    render(<CopyTextButton text={text} label="Copy code" copiedLabel="Code copied" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
    expect(screen.getByRole('status')).toHaveTextContent('Code copied');
  });

  it('keeps a repeated successful copy confirmed past the first operation timer', async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue();
    render(<CopyPageButton markdown="Copy this again" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy page' })));
    act(() => vi.advanceTimersByTime(1000));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copied' })));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Page copied');
    expect(writeText).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'Copy page' })).toBeInTheDocument();
  });

  it('keeps keyboard focus and prevents overlapping keyboard and click operations', async () => {
    const user = userEvent.setup();
    installClipboard();
    const request = deferred();
    writeText.mockReturnValue(request.promise);
    render(<CopyPageButton markdown="Unchanged Markdown" />);
    const button = screen.getByRole('button', { name: 'Copy page' });
    button.focus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledExactlyOnceWith('Unchanged Markdown');
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Copying…');
    expect(screen.getByRole('status')).toHaveTextContent('Copying to clipboard.');

    await act(async () => request.resolve());

    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveTextContent('Copied');
  });

  it('shows and announces a denied copy, then permits a successful retry', async () => {
    writeText.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce();
    render(<CopyPageButton markdown={'Retry this exact text\n'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy page' }));
    const retry = await screen.findByRole('button', { name: 'Copy failed' });
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed. Try again.');
    expect(retry).not.toHaveAttribute('aria-disabled');
    fireEvent.click(retry);

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenNthCalledWith(1, 'Retry this exact text\n');
    expect(writeText).toHaveBeenNthCalledWith(2, 'Retry this exact text\n');
    expect(screen.getByRole('status')).toHaveTextContent('Page copied');
  });

  it('reports an unavailable clipboard rather than claiming success', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<CopyPageButton markdown="No clipboard" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy page' }));

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed. Try again.');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not claim a changed code block was copied by a prior operation', async () => {
    const request = deferred();
    writeText.mockReturnValueOnce(request.promise).mockResolvedValueOnce();
    const { rerender } = render(
      <CopyTextButton text={'first source\n'} label="Copy code" copiedLabel="Code copied" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    rerender(
      <CopyTextButton text={'second source\n'} label="Copy code" copiedLabel="Code copied" />,
    );

    await act(async () => request.resolve());

    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenNthCalledWith(1, 'first source\n');
    expect(writeText).toHaveBeenNthCalledWith(2, 'second source\n');
  });

  it('expires an old confirmation while a different source is displayed', async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue();
    const { rerender } = render(
      <CopyTextButton text={'first source\n'} label="Copy code" copiedLabel="Code copied" />,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })));
    act(() => vi.advanceTimersByTime(1000));
    rerender(
      <CopyTextButton text={'second source\n'} label="Copy code" copiedLabel="Code copied" />,
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    act(() => vi.advanceTimersByTime(1000));
    rerender(
      <CopyTextButton text={'first source\n'} label="Copy code" copiedLabel="Code copied" />,
    );

    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(writeText).toHaveBeenCalledExactlyOnceWith('first source\n');
  });

  it('clears the confirmation timer when unmounted', async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue();
    const { unmount } = render(<CopyPageButton markdown="Copied before leaving" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy page' })));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.runAllTimers());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)(
    'handles a late %s after unmount without a confirmation timer or stale announcement',
    async (outcome) => {
      vi.useFakeTimers();
      const request = deferred();
      writeText.mockReturnValueOnce(request.promise);
      const { unmount } = render(<CopyPageButton markdown="A pending copy" />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy page' }));
      unmount();

      await act(async () => {
        if (outcome === 'resolve') request.resolve();
        else request.reject(new Error('Late clipboard denial'));
      });

      expect(writeText).toHaveBeenCalledExactlyOnceWith('A pending copy');
      expect(vi.getTimerCount()).toBe(0);
      expect(screen.queryByRole('status')).toBeNull();
    },
  );
});
