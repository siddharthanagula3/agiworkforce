import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NewArtifactMenu } from './NewArtifactMenu';
import { BUILT_IN_TEMPLATES, fillTemplate } from './artifact-templates';
import { parseDeck } from '../presentation/deck-model';
import { useArtifactsStore } from '../../../stores/artifacts-store';

const CONVERSATION = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a99';

describe('new artifact from a template', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('fills the date placeholder', () => {
    expect(fillTemplate('Week of {{date}}')).not.toContain('{{date}}');
  });

  it('ships deck templates that parse into slides', () => {
    for (const template of BUILT_IN_TEMPLATES.filter((entry) => entry.kind === 'presentation')) {
      expect(parseDeck(template.content).slides.length).toBeGreaterThan(2);
    }
  });

  it('creates a document in the open conversation and selects it', () => {
    render(<NewArtifactMenu conversationId={CONVERSATION} />);
    fireEvent.click(screen.getByTestId('artifact-new-menu'));
    expect(screen.getByRole('menuitem', { name: 'Pitch deck' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('deck-menu-template-meeting-notes'));
    const state = useArtifactsStore.getState();
    const created = state.artifacts[0]!;
    expect(created).toMatchObject({
      type: 'document',
      title: 'Meeting notes',
      conversationId: CONVERSATION,
      language: 'markdown',
    });
    expect(created.content).toContain('## Action items');
    expect(state.selectedArtifactId).toBe(created.id);
  });

  it('creates a presentation from a deck template', () => {
    render(<NewArtifactMenu conversationId={CONVERSATION} />);
    fireEvent.click(screen.getByTestId('artifact-new-menu'));
    fireEvent.click(screen.getByTestId('deck-menu-template-pitch-deck'));
    expect(useArtifactsStore.getState().artifacts[0]).toMatchObject({ type: 'presentation' });
  });

  it('is hidden with no conversation to hold the artifact', () => {
    render(<NewArtifactMenu conversationId={null} />);
    expect(screen.queryByTestId('artifact-new-menu')).not.toBeInTheDocument();
  });
});
