import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { INSPIRATION } from '../inspiration';
import { TemplatePreview } from './TemplatePreview';

const SOURCE_ONLY = INSPIRATION.filter((template) => template.type === 'code');
const PREVIEWABLE = INSPIRATION.filter((template) => template.type !== 'code');

describe('TemplatePreview', () => {
  it('covers both kinds of gallery example', () => {
    expect(SOURCE_ONLY.length).toBeGreaterThan(0);
    expect(PREVIEWABLE.length).toBeGreaterThan(0);
  });

  it.each(SOURCE_ONLY)('shows the full source of $id without any interaction', (template) => {
    render(<TemplatePreview template={template} />);

    const card = within(screen.getByTestId('artifact-preview-card'));
    expect(card.queryByRole('tablist')).toBeNull();
    expect(card.getByRole('region', { name: 'Artifact source' }).textContent).toBe(
      template.content,
    );
  });

  it.each(PREVIEWABLE)(
    'opens $id on its rendered preview with the source one tab away',
    (template) => {
      render(<TemplatePreview template={template} />);

      const card = within(screen.getByTestId('artifact-preview-card'));
      expect(card.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
      expect(card.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'false');
      expect(card.getByRole('tabpanel')).not.toBeEmptyDOMElement();
    },
  );
});
