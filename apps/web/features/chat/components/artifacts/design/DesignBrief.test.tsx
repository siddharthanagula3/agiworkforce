import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ArtifactPreview } from '../ArtifactPreview';
import { NewArtifactMenu } from '../templates/NewArtifactMenu';
import { useArtifactsStore } from '../../../stores/artifacts-store';
import {
  buildBriefRevisionRequest,
  buildDesignFromBriefRequest,
  readDesignBrief,
  type DesignBrief,
} from './design-brief';

const BRIEF: DesignBrief = {
  format: 'Landing page',
  goal: 'Get sign-ups for the beta',
  audience: 'Indie developers',
  style: 'Minimal, Bold',
  content: 'Hero, three features, pricing',
  layout: 'Single column',
};

const BRIEF_COMMENT_PATTERN = /\x3C!-- brief: .* -->/;

const ARTIFACT_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6e5f4d3c2b1a';

describe('design briefs', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('asks for an html design that carries its brief and reads it back', () => {
    const prompt = buildDesignFromBriefRequest(BRIEF);
    expect(prompt).toContain('Design a landing page from this brief');
    expect(prompt).toContain('- Audience: Indie developers');
    const comment = BRIEF_COMMENT_PATTERN.exec(prompt)![0];
    expect(readDesignBrief(`<!-- @artifact -->\n${comment}\n<main></main>`)).toEqual(BRIEF);
    expect(buildBriefRevisionRequest('Beta page', BRIEF)).toContain(
      'Revise the design "Beta page"',
    );
    expect(readDesignBrief('<main>no brief</main>')).toBeNull();
  });

  it('starts a design from the brief dialog in the New menu', () => {
    const onRequestEdits = vi.fn(() => true);
    render(
      <NewArtifactMenu
        conversationId="9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
        onRequestEdits={onRequestEdits}
      />,
    );
    fireEvent.click(screen.getByTestId('artifact-new-menu'));
    fireEvent.click(screen.getByTestId('deck-menu-design-brief'));
    const dialog = screen.getByTestId('design-brief-dialog');
    expect(within(dialog).getByTestId('design-brief-submit')).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText('What should this design achieve?'), {
      target: { value: 'Collect waitlist emails' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Playful' }));
    fireEvent.click(within(dialog).getByTestId('design-brief-submit'));
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('- Goal: Collect waitlist emails');
    expect(prompt).toContain('- Style: Playful');
  });

  it('opens the kept brief from the panel and sends a revision', () => {
    const comment = BRIEF_COMMENT_PATTERN.exec(buildDesignFromBriefRequest(BRIEF))![0];
    useArtifactsStore.getState().addArtifact({
      id: ARTIFACT_ID,
      type: 'html',
      title: 'Beta page',
      language: 'html',
      content: `<!-- @artifact -->\n${comment}\n<main><h1>Beta</h1></main>`,
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
    const artifact = useArtifactsStore.getState().artifacts[0]!;
    const onRequestEdits = vi.fn(() => true);
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
        onRequestEdits={onRequestEdits}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
    fireEvent.click(screen.getByTestId('artifact-design-brief'));
    const dialog = screen.getByTestId('design-brief-dialog');
    const goal = within(dialog).getByPlaceholderText('What should this design achieve?');
    expect(goal).toHaveValue('Get sign-ups for the beta');
    fireEvent.change(goal, { target: { value: 'Get sign-ups for the paid plan' } });
    fireEvent.click(within(dialog).getByTestId('design-brief-submit'));
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('Revise the design "Beta page"');
    expect(prompt).toContain('- Goal: Get sign-ups for the paid plan');
  });
});
