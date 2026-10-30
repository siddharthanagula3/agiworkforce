import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownContent } from '../MarkdownContent';
import { applyAssistantFenceEdit, type AssistantFenceEdit } from '../assistantFenceEdits';
import {
  parseCardGrid,
  parseCarousel,
  parseForm,
  parseRichCard,
  parseStats,
} from '../answerSurfaces';
import { approvedImageKeys, GatedImage } from '../ImageTrust';
import { classifyAssistantFence } from '../assistantFence';

const writeText = vi.fn<(text: string) => Promise<void>>();
const fence = (language: string, source: string) => `\`\`\`${language}\n${source}\n\`\`\``;

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  approvedImageKeys.clear();
});
afterEach(cleanup);

describe('functional answer blocks', () => {
  it('recognizes an already loaded image without waiting for another load event', () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
    try {
      const { container } = render(<GatedImage src="/api/files/cached" alt="Cached image" />);
      expect(container.querySelector('[data-image-state="loaded"]')).toBeTruthy();
      expect(screen.queryByLabelText('Loading image')).toBeNull();
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it.each(['bar', 'line', 'pie', 'donut'])(
    'retains the chart content discriminant for a %s definition',
    (kind) => {
      expect(classifyAssistantFence('chart', `type: ${kind}\nJan | 10\nFeb | 20`)).toMatchObject({
        kind: 'chart',
        points: [
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 20 },
        ],
      });
    },
  );

  it('saves seven writing blocks independently, copies exact text and reopens saved content', async () => {
    const bodies = [
      'Hello team.',
      'A **new** release.',
      '# Report\n\nDetails.',
      'Summary\n  indented line',
      'Prompt with "quotes" & ${literal}',
      'Business proposal.',
      'Requirements\n- One\n- Two',
    ];
    const kinds = ['message', 'post', 'document', 'writing', 'prompt', 'document', 'snippet'];
    let persisted = bodies.map((body, index) => fence(kinds[index]!, body)).join('\n\n');
    const edits: AssistantFenceEdit[] = [];
    function Harness() {
      const [content, setContent] = useState(persisted);
      return (
        <MarkdownContent
          content={content}
          onFenceEdit={async (edit) => {
            edits.push(edit);
            const next = applyAssistantFenceEdit(persisted, edit);
            if (next === null) throw new Error('Stale edit');
            persisted = next;
            setContent(next);
          }}
        />
      );
    }
    const view = render(<Harness />);
    const blocks = Array.from(view.container.querySelectorAll<HTMLElement>('[data-rich-block]'));
    expect(blocks).toHaveLength(7);
    for (const [index, block] of blocks.entries()) {
      await act(async () =>
        fireEvent.click(
          within(block).getByRole('button', {
            name: kinds[index] === 'prompt' ? 'Copy full prompt' : 'Copy this text',
          }),
        ),
      );
      expect(writeText).toHaveBeenLastCalledWith(bodies[index]);
    }
    const target = within(blocks[3]!);
    fireEvent.click(target.getByRole('button', { name: 'Edit text' }));
    fireEvent.change(target.getByRole('textbox'), {
      target: { value: 'Meeting summary changed.\n  Keep spaces.' },
    });
    await act(async () => fireEvent.click(target.getByRole('button', { name: 'Save changes' })));
    expect(edits).toEqual([
      {
        index: 3,
        language: 'writing',
        source: bodies[3],
        content: 'Meeting summary changed.\n  Keep spaces.',
      },
    ]);
    view.unmount();
    const reopened = render(<MarkdownContent content={persisted} />);
    const nextBlocks = Array.from(
      reopened.container.querySelectorAll<HTMLElement>('[data-rich-block]'),
    );
    expect(nextBlocks).toHaveLength(7);
    for (const [index, block] of nextBlocks.entries()) {
      await act(async () =>
        fireEvent.click(
          within(block).getByRole('button', {
            name: kinds[index] === 'prompt' ? 'Copy full prompt' : 'Copy this text',
          }),
        ),
      );
      expect(writeText).toHaveBeenLastCalledWith(
        index === 3 ? 'Meeting summary changed.\n  Keep spaces.' : bodies[index],
      );
    }
  });

  it('persists an edited subject/body and exposes no email Send action', async () => {
    const onFenceEdit = vi.fn().mockResolvedValue(undefined);
    render(
      <MarkdownContent
        content={fence(
          'email',
          'Subject: Launch\n\nHello team,\n\n- Test the release\n\nThanks,\nSam',
        )}
        onFenceEdit={onFenceEdit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit email' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Subject'));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Launch review' } });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Hello,\n\nPlease review.\n\nThanks.' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(onFenceEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        language: 'email',
        content: 'Subject: Launch review\n\nHello,\n\nPlease review.\n\nThanks.',
      }),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy email' })));
    expect(writeText).toHaveBeenLastCalledWith(
      'Subject: Launch review\n\nHello,\n\nPlease review.\n\nThanks.',
    );
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull();
  });

  it('keeps a failed-save draft available for copying and retrying', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined);
    render(<MarkdownContent content={fence('writing', 'Original')} onFenceEdit={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(screen.getByRole('status').textContent).toContain('could not be saved');
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Keep this draft.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy this text' })));
    expect(writeText).toHaveBeenLastCalledWith('Keep this draft.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('labels edits temporary when this surface has no persistence handler', () => {
    render(<MarkdownContent content={fence('writing', 'Preview only')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Temporary draft' } });
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByText('Edits are temporary in this view.')).toBeTruthy();
  });

  it('focuses the editor on explicit Edit and confirms before discarding a draft', async () => {
    render(<MarkdownContent content={fence('writing', 'Original text')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('will be lost');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Unsaved text');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Discard changes' })));
    expect(screen.getByText('Original text')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('uses real labelled form controls, validates and applies locally without sending a chat message', async () => {
    const onFollowUp = vi.fn();
    const content = fence(
      'form',
      [
        'title: Project settings',
        'text: Project name* |',
        'select: Model* | *Fictional A | Fictional B',
        'radio: Response style | *Concise | Detailed',
        'checks: Tools | *Web search | Code generation',
        'slider: Monthly budget | 0 | 500 | 100 | USD',
        'date: Target date | 2026-11-01',
        'textarea: Notes | Start small.',
        'submit: Apply',
      ].join('\n'),
    );
    const view = render(<MarkdownContent content={content} onFollowUp={onFollowUp} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert').textContent).toContain('Project name');
    const name = screen.getByLabelText('Project name *');
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: 'Sample project' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Fictional B' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Detailed' }));
    expect(screen.getByRole('radio', { name: 'Concise' })).toHaveProperty('checked', false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Code generation' }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '275' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-11-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const result = screen.getByRole('status', { name: 'Applied values' });
    expect(result.textContent).toContain('Sample project');
    expect(result.textContent).toContain('Fictional B');
    expect(result.textContent).toContain('Detailed');
    expect(result.textContent).toContain('Web search, Code generation');
    expect(result.textContent).toContain('275 USD');
    expect(result.textContent).toContain('2026-11-15');
    expect(onFollowUp).not.toHaveBeenCalled();
    view.rerender(
      <MarkdownContent
        content={content}
        onFollowUp={onFollowUp}
        footnoteScope="unrelated-update"
      />,
    );
    expect(screen.getByLabelText('Project name *')).toHaveProperty('value', 'Sample project');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notes'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Apply' }));
    await user.keyboard('{Enter}');
    expect(onFollowUp).not.toHaveBeenCalled();
  });

  it('discloses a form send action and requires its host send capability', () => {
    const source = fence('form', 'title: Choices\ntext: Name | Sample\nsubmit: Continue | send');
    const onFollowUp = vi.fn();
    const view = render(<MarkdownContent content={source} />);
    expect(screen.getByRole('button', { name: 'Continue (send to chat)' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('Selected values will be sent as your next message.')).toBeTruthy();
    expect(screen.getByText('Submitting to chat is unavailable in this view.')).toBeTruthy();
    view.rerender(<MarkdownContent content={source} onFollowUp={onFollowUp} />);
    expect(onFollowUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue (send to chat)' }));
    expect(onFollowUp).toHaveBeenCalledWith('Choices\nName: Sample');
  });

  it('renders Markdown inside a card and navigates a real carousel from the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownContent
        content={[
          fence(
            'card',
            'title: Project\nsubtitle: Review\ntags: Planning, Draft\n\n**Summary**\n\n- First\n- Second',
          ),
          fence(
            'carousel',
            'title: Products\nFirst | First description\nSecond | Second description\nThird | Third description',
          ),
        ].join('\n\n')}
      />,
    );
    expect(container.querySelector('[data-answer-surface="card"] strong')?.textContent).toBe(
      'Summary',
    );
    expect(container.querySelectorAll('[data-answer-surface="card"] ul')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText('First description')).toBeNull();
    expect(screen.getByText('Second description')).toBeTruthy();
    await user.keyboard('{End}');
    expect(screen.getByText('Third description')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    await user.keyboard('{Home}');
    expect(screen.getByText('First description')).toBeTruthy();
  });

  it('uses validated one, two or three-column card grids which query their own container', () => {
    const { container } = render(
      <MarkdownContent
        content={fence(
          'cards',
          'title: Features\ncolumns: 3\nOne | First\nTwo | Second\nThree | Third',
        )}
      />,
    );
    expect(container.querySelector('[data-card-grid-columns="3"]')?.className).toContain(
      '@2xl:grid-cols-3',
    );
    expect(container.querySelector('[data-answer-surface="cards"]')?.className).toContain(
      '@container',
    );
    expect(container.querySelectorAll('article')).toHaveLength(3);
    expect(parseCardGrid('columns: 12\nA | B')).toBeNull();
  });

  it('keeps four resources in order through loading, a failed image and retry', async () => {
    const content = fence(
      'gallery',
      'Chat interface | /api/files/chat | Chat workspace\nAnalytics | /api/files/analytics\nMobile app | /api/files/mobile\nDeveloper workspace | /api/files/developer',
    );
    const { container } = render(<MarkdownContent content={content} />);
    const resources = () =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-gallery-resource]'));
    expect(resources()).toHaveLength(4);
    expect(container.querySelectorAll('[data-image-state="loading"]')).toHaveLength(4);
    const images = screen.getAllByRole('img');
    fireEvent.load(images[0]!);
    fireEvent.error(images[1]!);
    fireEvent.load(images[2]!);
    fireEvent.load(images[3]!);
    expect(container.querySelectorAll('[data-image-state="loaded"]')).toHaveLength(3);
    expect(resources().map((entry) => entry.querySelector('figcaption')?.textContent)).toEqual([
      'Chat interfaceChat workspace',
      'Analytics',
      'Mobile app',
      'Developer workspace',
    ]);
    expect(within(resources()[1]!).getByText('Image unavailable: Analytics')).toBeTruthy();
    fireEvent.click(within(resources()[1]!).getByRole('button', { name: 'Retry image' }));
    expect(within(resources()[1]!).getByRole('img', { name: 'Analytics' })).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy image URL: Mobile app' })),
    );
    expect(writeText).toHaveBeenLastCalledWith('/api/files/mobile');
    expect(screen.getAllByRole('link', { name: /Open image:/ })).toHaveLength(4);
  });

  it('rejects malformed structured blocks with source still visible', async () => {
    expect(parseForm('text: Name | A\nscript: steal()')).toBeNull();
    expect(parseForm('slider: Budget | 5 | 1 | 3')).toBeNull();
    expect(parseForm('select: Model | Same | Same')).toBeNull();
    expect(parseForm('text: Name\ntext: Name')).toBeNull();
    expect(parseCarousel('Only a title')).toBeNull();
    expect(parseRichCard('title: Empty')).toBeNull();
    expect(parseStats('title: Empty')).toBeNull();
    const { container } = render(
      <MarkdownContent content={fence('form', 'text: Name | A\nscript: steal()')} />,
    );
    expect(container.querySelector('[data-answer-fallback="invalid"]')?.textContent).toContain(
      'script: steal()',
    );
    await waitFor(() => expect(container.querySelector('script')).toBeNull());
  });
});
