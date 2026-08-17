import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineArtifactCards } from './InlineArtifactCards';
import type { ArtifactData } from './ArtifactPreview';

const COLOURED_TYPES: ArtifactData['type'][] = ['html', 'react', 'svg', 'image', 'mermaid', 'code'];

function makeArtifact(type: ArtifactData['type']): ArtifactData {
  return { id: `a-${type}`, type, title: `Artifact ${type}`, content: 'x' } as ArtifactData;
}

describe('InlineArtifactCards · type badge readability in both themes', () => {
  it.each(COLOURED_TYPES)('gives the %s badge a light-theme colour and a dark override', (type) => {
    render(<InlineArtifactCards artifacts={[makeArtifact(type)]} />);

    const badge = screen.getByRole('listitem').querySelector('span.uppercase');
    const className = badge?.className ?? '';

    expect(className).toMatch(/(?<!dark:)text-[a-z]+-(6|7|8)00\b/);
    expect(className).toMatch(/dark:text-[a-z]+-(2|3)00\b/);
    expect(className).not.toMatch(/(?<!dark:)text-[a-z]+-(3|4)00\b/);
  });
});
