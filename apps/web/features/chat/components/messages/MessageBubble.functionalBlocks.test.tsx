import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MessageBubble } from './MessageBubble';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  GENERATE_IMAGE_TOOL_NAME,
  IMAGE_CARD_KIND,
  getModels,
  isModelLive,
} from '@agiworkforce/types';
import {
  applyAssistantFenceEdit,
  type AssistantFenceEdit,
} from '@agiworkforce/unified-chat/assistant-fence-edits';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    mermaidAPI: { getDiagramFromText: async () => ({ db: {} }) },
    render: async (id: string, source: string) => {
      if (source.includes('INVALID')) throw new Error('Invalid diagram source');
      return {
        svg: `<svg id="${id}" viewBox="0 0 240 100"><text>${source.split('\n')[0]}</text></svg>`,
      };
    },
  },
}));

const fence = (language: string, content: string) => `\`\`\`${language}\n${content}\n\`\`\``;
const timestamp = new Date('2026-10-30T15:40:36Z');
const writeText = vi.fn<(text: string) => Promise<void>>();
const recordedImageEnvelope = process.env['QA_RENDER_IMAGE_ENVELOPE'];

beforeEach(() => {
  useArtifactsStore.getState().clearArtifacts();
  useChatStore.getState().setActiveConversation('functional-output-fixture');
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('functional outputs through the actual message dispatch', () => {
  // llm-guardrail-allow: requires QA_RENDER_IMAGE_ENVELOPE captured from the stubbed tool loop; verified in local acceptance.
  it.skipIf(!recordedImageEnvelope)(
    'renders the actual four-call tool SSE envelope once with captions, actions and partial failure state',
    async () => {
      const record = JSON.parse(readFileSync(recordedImageEnvelope!, 'utf8')) as {
        source: string;
        assistantText: string;
        cardEnvelopes: unknown[];
        requests: { n: number }[];
      };
      expect(record.source).toContain('runToolLoop');
      expect(record.requests).toHaveLength(4);
      expect(record.requests.every((request) => request.n === 1)).toBe(true);
      const cards = record.cardEnvelopes.map((raw) => {
        const card = parseInteractiveCardDelta(raw);
        if (!card?.recognized || card.kind !== IMAGE_CARD_KIND)
          throw new Error('Recorded image card failed validation');
        return card;
      });
      const { container } = render(
        <MessageBubble
          message={{
            id: 'recorded-tool-image-gallery',
            role: 'assistant',
            content: record.assistantText,
            timestamp,
            metadata: { interactiveCards: cards },
          }}
        />,
      );
      await waitFor(() =>
        expect(container.querySelectorAll('[data-gallery-resource]')).toHaveLength(4),
      );
      expect(container.querySelectorAll('img')).toHaveLength(4);
      expect(
        Array.from(container.querySelectorAll('[data-image-tool-card]')).map((slot) =>
          slot.getAttribute('data-image-tool-card'),
        ),
      ).toEqual(cards.map((card) => card.producedBy?.toolCallId));
      expect(screen.getAllByRole('button', { name: 'Copy image' })).toHaveLength(4);
      expect(screen.getAllByRole('button', { name: 'Share image' })).toHaveLength(4);
      expect(screen.getAllByText(/Generated with/)).toHaveLength(4);
      const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-gallery-resource]'));
      const captions = slots.map((slot) => slot.querySelector('figcaption')?.textContent);
      expect(captions).toEqual([
        'AI chat interfaceConcept 1',
        'analytics dashboardConcept 2',
        'mobile applicationConcept 3',
        'developer workspaceConcept 4',
      ]);
      expect(container.querySelectorAll('[data-generated-image-state="loading"]')).toHaveLength(4);
      const images = Array.from(container.querySelectorAll('img'));
      [0, 2, 3].forEach((index) => fireEvent.load(images[index]!));
      fireEvent.error(images[1]!);
      expect(container.querySelectorAll('[data-generated-image-state="loaded"]')).toHaveLength(3);
      expect(container.querySelectorAll('[data-generated-image-state="failed"]')).toHaveLength(1);
      expect(slots.map((slot) => slot.querySelector('figcaption')?.textContent)).toEqual(captions);
      fireEvent.click(within(slots[1]!).getByRole('button', { name: 'Retry' }));
      fireEvent.load(within(slots[1]!).getByRole('img'));
      expect(container.querySelectorAll('[data-generated-image-state="loaded"]')).toHaveLength(4);
      fireEvent.click(within(slots[0]!).getByRole('button', { name: 'More actions' }));
      expect(within(slots[0]!).getByRole('menuitem', { name: 'Download' })).toBeTruthy();
      expect(cards.every((card) => card.body.images.length === 1)).toBe(true);
    },
  );

  it('retains three separate diagram renderers and charts around an HTML artifact without duplicate diagram cards', async () => {
    const diagrams = [
      'flowchart TD\nA[User] --> B[Model]\nB --> C[Parser]\nC --> D[Renderer]',
      'sequenceDiagram\nUser->>Frontend: Request\nFrontend->>Backend: Forward\nBackend->>Provider: Run',
      'timeline\ntitle Deployment\nBuild : Compile\nTest : Verify\nRelease : Publish',
    ];
    const content = [
      'Before the diagrams.',
      fence('mermaid', diagrams[0]!),
      fence('html', '<!DOCTYPE html><html><body><button>Artifact action</button></body></html>'),
      'After the artifact.',
      fence('mermaid', diagrams[1]!),
      fence('mermaid', diagrams[2]!),
      ...['bar', 'line', 'pie'].map((kind) =>
        fence('chart', `type: ${kind}\ntitle: ${kind} values\nJanuary | 120\nFebruary | 190`),
      ),
      'After the charts.',
    ].join('\n\n');
    const view = render(
      <MessageBubble
        message={{
          id: 'diagrams-through-bubble',
          sessionId: 'functional-output-fixture',
          role: 'assistant',
          content,
          timestamp,
        }}
      />,
    );
    await waitFor(() =>
      expect(view.container.querySelectorAll('[data-mermaid="ready"] svg')).toHaveLength(3),
    );
    expect(view.container.querySelectorAll('[data-testid="chart-artifact"]')).toHaveLength(3);
    expect(view.container.querySelectorAll('[data-chart-kind="bar"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-chart-kind="line"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-chart-kind="pie"]')).toHaveLength(1);
    expect(screen.getByText('Before the diagrams.')).toBeTruthy();
    expect(screen.getByText('After the artifact.')).toBeTruthy();
    expect(screen.getByText('After the charts.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /open artifact: mermaid/i })).toBeNull();
    expect(
      useArtifactsStore
        .getState()
        .getMessageArtifacts('diagrams-through-bubble')
        .filter((artifact) => artifact.type === 'mermaid'),
    ).toHaveLength(3);
    const sourceButtons = screen.getAllByRole('button', { name: 'Show source' });
    expect(sourceButtons).toHaveLength(3);
    sourceButtons.forEach((button) => fireEvent.click(button));
    expect(
      Array.from(view.container.querySelectorAll('.mermaid-source')).map(
        (source) => source.textContent,
      ),
    ).toEqual(diagrams);
  });

  it('keeps invalid diagram source visible in the real message path', async () => {
    const { container } = render(
      <MessageBubble
        message={{
          id: 'invalid-diagram-through-bubble',
          role: 'assistant',
          content: fence('mermaid', 'flowchart TD\nINVALID'),
          timestamp,
        }}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-mermaid="failed"]')).toBeTruthy());
    expect(screen.getByRole('status').textContent).toContain('Invalid diagram source');
    expect(container.querySelector('.mermaid-source')?.textContent).toBe('flowchart TD\nINVALID');
  });

  it('saves an exact indexed fence through prose split around an artifact and reopens it', async () => {
    let persisted = [
      fence('writing', 'First independent block.'),
      fence('html', '<div>Artifact</div>'),
      fence('prompt', 'Original prompt.'),
    ].join('\n\n');
    const edits: AssistantFenceEdit[] = [];
    const onFenceEdit = vi.fn(async (_messageId: string, edit: AssistantFenceEdit) => {
      edits.push(edit);
      const next = applyAssistantFenceEdit(persisted, edit);
      if (next === null) throw new Error('Stale source');
      persisted = next;
    });
    const view = render(
      <MessageBubble
        message={{ id: 'fence-through-bubble', role: 'assistant', content: persisted, timestamp }}
        onFenceEdit={onFenceEdit}
      />,
    );
    const prompt = view.container.querySelector<HTMLElement>('[data-rich-block="prompt"]');
    if (!prompt) throw new Error('Prompt renderer missing');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Edit text' }));
    fireEvent.change(within(prompt).getByRole('textbox'), {
      target: { value: 'Edited prompt only.' },
    });
    await act(async () =>
      fireEvent.click(within(prompt).getByRole('button', { name: 'Save changes' })),
    );
    expect(edits).toEqual([
      { index: 1, language: 'prompt', source: 'Original prompt.', content: 'Edited prompt only.' },
    ]);
    view.unmount();
    render(
      <MessageBubble
        message={{ id: 'fence-through-bubble', role: 'assistant', content: persisted, timestamp }}
      />,
    );
    expect(screen.getByText('Edited prompt only.')).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy full prompt' })),
    );
    expect(writeText).toHaveBeenLastCalledWith('Edited prompt only.');
  });

  it('presents image-tool cards inside their matching gallery resources without losing image actions or provenance', async () => {
    const subjects = [
      'AI chat interface',
      'Analytics dashboard',
      'Mobile application',
      'Developer workspace',
    ];
    const model = getModels({
      modelTypes: ['image'],
      requireCapabilities: { imageGen: true },
    }).find(isModelLive);
    if (!model) throw new Error('Image fixture requires a live registry model');
    const cards = subjects.map((subject, index) => {
      const assetId = `00000000-0000-4000-8000-00000000000${index + 1}`;
      const cardId = `fixture-gallery-${index}`;
      const card = parseInteractiveCardDelta({
        card: {
          schemaVersion: 1,
          kind: IMAGE_CARD_KIND,
          cardId,
          createdAt: timestamp.toISOString(),
          fallback: { headline: 'Generated image', text: subject },
          producedBy: { toolCallId: cardId, toolName: GENERATE_IMAGE_TOOL_NAME },
          body: {
            operation: 'generate',
            prompt: `One conceptual picture of ${subject}`,
            images: [{ assetId, url: `/api/files/${assetId}` }],
            model: model.id,
          },
        },
      });
      if (!card?.recognized || card.kind !== IMAGE_CARD_KIND)
        throw new Error('Invalid emitted image envelope fixture');
      return card;
    });
    const content = fence(
      'gallery',
      cards
        .map(
          (card, index) =>
            `${subjects[index]} | ${card.body.images[0]!.url} | Concept ${index + 1}`,
        )
        .join('\n'),
    );
    const { container } = render(
      <MessageBubble
        message={{
          id: 'image-tool-gallery-through-bubble',
          role: 'assistant',
          content,
          timestamp,
          metadata: { interactiveCards: cards },
        }}
      />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-gallery-resource]')).toHaveLength(4),
    );
    expect(container.querySelectorAll('img')).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Copy image' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Share image' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'More actions' })).toHaveLength(4);
    expect(screen.getAllByText(/Generated with/)).toHaveLength(4);
    expect(screen.getAllByRole('link', { name: /Open image:/ })).toHaveLength(4);
    expect(
      Array.from(container.querySelectorAll('[data-gallery-resource] figcaption')).map(
        (caption) => caption.textContent,
      ),
    ).toEqual(subjects.map((subject, index) => `${subject}Concept ${index + 1}`));
  });

  it('presents generated gallery resources once and preserves every file download', () => {
    const files = ['chat', 'analytics', 'mobile', 'developer'].map((id, index) => ({
      id,
      fileName: `${id}.png`,
      mimeType: 'image/png',
      uri: `/api/files/${id}`,
      byteCount: 100 + index,
      kind: 'image',
      checksumSha256: String(index + 1).repeat(64),
    }));
    const content = fence(
      'gallery',
      files.map((file) => `${file.fileName} | ${file.uri} | Separate resource`).join('\n'),
    );
    const { container } = render(
      <MessageBubble
        message={{
          id: 'gallery-through-bubble',
          role: 'assistant',
          content,
          timestamp,
          metadata: { generatedFiles: files },
        }}
      />,
    );
    expect(container.querySelectorAll('[data-gallery-resource]')).toHaveLength(4);
    expect(container.querySelectorAll('img')).toHaveLength(4);
    expect(
      screen.getAllByTestId('deliverable-card').map((link) => link.getAttribute('href')),
    ).toEqual(files.map((file) => file.uri));
  });

  it('does not hide an image because its URL appears inside a source-code example', () => {
    const file = {
      id: 'example',
      fileName: 'example.png',
      mimeType: 'image/png',
      uri: '/api/files/example',
      byteCount: 100,
      kind: 'image',
    };
    render(
      <MessageBubble
        message={{
          id: 'source-example-image',
          role: 'assistant',
          content: fence('python', 'print("/api/files/example")'),
          timestamp,
          metadata: { generatedFiles: [file] },
        }}
      />,
    );
    expect(screen.getByAltText('example.png')).toHaveAttribute('src', file.uri);
  });

  it('presents one image for a saved/display alias and keeps its alternate filename downloadable', () => {
    const identity = `matplotlib-v1:123e4567-e89b-12d3-a456-426614174000:${'a'.repeat(64)}`;
    const files = [
      {
        id: 'saved',
        fileName: 'monthly_sales_charts.png',
        mimeType: 'image/png',
        uri: '/api/files/saved',
        byteCount: 100,
        kind: 'image',
        checksumSha256: 'a'.repeat(64),
        renderIdentity: identity,
      },
      {
        id: 'display',
        fileName: 'chart.png',
        mimeType: 'image/png',
        uri: '/api/files/display',
        byteCount: 200,
        kind: 'image',
        checksumSha256: 'b'.repeat(64),
        renderIdentity: identity,
      },
      {
        id: 'unique',
        fileName: 'chart.png',
        mimeType: 'image/png',
        uri: '/api/files/unique',
        byteCount: 300,
        kind: 'image',
        checksumSha256: 'c'.repeat(64),
      },
    ];
    render(
      <MessageBubble
        message={{
          id: 'figure-through-bubble',
          role: 'assistant',
          content: 'Actual execution figures.',
          timestamp,
          metadata: { generatedFiles: files },
        }}
      />,
    );
    expect(screen.getByAltText('monthly_sales_charts.png')).toHaveAttribute(
      'src',
      '/api/files/saved',
    );
    expect(screen.getByAltText('chart.png')).toHaveAttribute('src', '/api/files/unique');
    const alias = screen.getByTestId('deliverable-card');
    expect(alias).toHaveAttribute('href', '/api/files/display');
    expect(alias).toHaveAttribute('download', 'chart.png');
  });
});
