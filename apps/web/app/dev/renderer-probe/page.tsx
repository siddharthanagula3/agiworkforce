'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  applyAssistantFenceEdit,
  type AssistantFenceEdit,
} from '@agiworkforce/unified-chat/assistant-fence-edits';
import { getModels } from '@agiworkforce/types';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { MessageBubble } from '@/features/chat/components/messages/MessageBubble';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { CHAT_RENDERING_FIXTURES, LONG_RENDERING_FIXTURE } from '@/test/fixtures/chat-rendering';

const SPECIMEN = `# Heading one

Body text with **bold**, *italic*, \`inline code\` and a [link](https://example.com).

## Heading two

- top level
  - nested one
    - nested two
- [ ] task open
- [x] task done

> A block quote that must keep its marker.

| Item                                | Status  | Amount |
| :---------------------------------- | :-----: | -----: |
| alpha                               | ready   |  1,234 |
| beta with a deliberately long label | pending | 98,765 |

Inline math $E = mc^2$ and display math:

$$\\int_0^1 x^2 dx = \\frac{1}{3}$$

\`\`\`python
from dataclasses import dataclass

@dataclass
class Renderer:
    name: str

    def render(self) -> str:
        return self.name

print(Renderer("ok").render())
\`\`\`

\`\`\`mermaid
flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C[Do the thing]
  B -->|no| D[Stop]
\`\`\`

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi
\`\`\`

\`\`\`sql
SELECT id, name FROM users WHERE active = true ORDER BY name;
\`\`\`

\`\`\`mermaid
flowchart TD
  A[Unclosed --> B{{{ totally invalid
\`\`\`

Final paragraph after all fences.
`;

const FIXTURE_MODEL = getModels().find(
  (model) => model.capabilities.streaming && model.reasoning?.supportedEfforts?.includes('none'),
);

export default function RendererProbe() {
  const params = useSearchParams();
  const caseId = params.get('case') ?? 'baseline';
  const conversation = params.get('conversation') ?? caseId;
  return <RendererProbeCase key={conversation} caseId={caseId} conversation={conversation} />;
}

function RendererProbeCase({ caseId, conversation }: { caseId: string; conversation: string }) {
  const router = useRouter();
  const fixture = CHAT_RENDERING_FIXTURES.find((item) => item.id === caseId);
  const source = caseId === 'long' ? LONG_RENDERING_FIXTURE : (fixture?.content ?? SPECIMEN);
  const key = `agi.renderer-qa.v1:${conversation}`;
  const [content, setContent] = useState<string>(source);
  const [streaming, setStreaming] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const { resolvedTheme, setTheme } = useAppTheme();
  const [mounted, setMounted] = useState(false);
  const shownTheme = mounted ? resolvedTheme : 'dark';
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setContent(source);
    setStreaming(false);
    setFixtureError(null);
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) setContent(saved);
    } catch {
      setFixtureError('Saved fixture content could not be read.');
    }
  }, [key, source]);

  if (process.env.NODE_ENV === 'production') notFound();

  const save = async (_messageId: string, edit: AssistantFenceEdit) => {
    const next = applyAssistantFenceEdit(content, edit);
    if (next === null) throw new Error('The fixture changed before this edit was saved.');
    localStorage.setItem(key, next);
    setContent(next);
  };

  return (
    <main
      id="main-content"
      data-probe-root
      className="min-h-dvh min-w-0 bg-[var(--chat-bg)] text-[var(--chat-text-primary)]"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--chat-border)] px-4 py-3">
        <h1 data-unrelated-heading className="text-sm font-medium">
          Renderer fixture
        </h1>
        <label className="flex items-center gap-2 text-sm">
          QA case
          <select
            aria-label="QA case"
            value={caseId}
            className="min-h-10 rounded-md border border-border bg-background p-2"
            onChange={(event) =>
              router.push(
                `/dev/renderer-probe?case=${event.target.value}&conversation=${crypto.randomUUID()}`,
              )
            }
          >
            <option value="baseline">Baseline</option>
            <option value="long">Long content</option>
            {CHAT_RENDERING_FIXTURES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="min-h-10 rounded-md border border-border px-3 text-sm"
          onClick={() => setTheme(shownTheme === 'dark' ? 'light' : 'dark')}
        >
          Use {shownTheme === 'dark' ? 'light' : 'dark'} theme
        </button>
        <button
          type="button"
          className="min-h-10 rounded-md border border-border px-3 text-sm"
          onClick={() => {
            setStreaming(true);
            setContent(
              caseId === 'math'
                ? source.slice(0, source.indexOf('**Quadratic')) +
                    String.raw`$$
\frac{1}{`
                : source.slice(0, Math.max(1, Math.floor(source.length / 2))),
            );
          }}
        >
          Stream fixture
        </button>
        <button
          type="button"
          className="min-h-10 rounded-md border border-border px-3 text-sm"
          onClick={() => {
            setContent(source);
            setStreaming(false);
          }}
        >
          Complete response
        </button>
        <button
          type="button"
          className="min-h-10 rounded-md border border-border px-3 text-sm"
          onClick={() => setStreaming(false)}
        >
          Cancel response
        </button>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 py-6" data-renderer-conversation={conversation}>
        <p className="mb-4 text-xs text-[var(--chat-text-secondary)]">
          Deterministic renderer fixture. Model, image and search calls are stubbed by browser
          tests.
        </p>
        {fixtureError ? <p role="alert">{fixtureError}</p> : null}
        {mounted ? (
          <MessageBubble
            key={conversation}
            message={{
              id: `renderer-${conversation}`,
              role: 'assistant',
              sessionId: conversation,
              content,
              timestamp: new Date('2026-10-30T15:00:00Z'),
              model: FIXTURE_MODEL?.id,
              isStreaming: streaming,
              ...(caseId === 'python'
                ? {
                    metadata: {
                      artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY,
                      codeExecutionResult: {
                        stdout: 'Total sales: 1315\nAverage sales: 219.17\nMaximum sales: 310',
                        stderr: '',
                        returnCode: 0,
                      },
                    },
                  }
                : { metadata: { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY } }),
            }}
            onFenceEdit={save}
          />
        ) : (
          <p role="status">Loading renderer fixture…</p>
        )}
      </div>
    </main>
  );
}
