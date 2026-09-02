'use client';

import { notFound } from 'next/navigation';

import { MarkdownContent } from '@agiworkforce/unified-chat';

const SPECIMEN = `# Heading one

Body text with **bold**, *italic*, \`inline code\` and a [link](https://example.com).

## Heading two

- top level
  - nested one
    - nested two
- [ ] task open
- [x] task done

> A block quote that must keep its marker.

| Column | Value |
| ------ | ----- |
| alpha  | 1     |
| beta   | 2     |

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

export default function RendererProbe() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main data-probe-root className="bg-surface-page p-6">
      <MarkdownContent content={SPECIMEN} />
    </main>
  );
}
