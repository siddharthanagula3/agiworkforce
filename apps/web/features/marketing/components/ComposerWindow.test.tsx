// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { interactionMode } from '@agiworkforce/types';
import { BUILT_IN_SLASH_COMMANDS } from '@agiworkforce/unified-chat';
import { ComposerWindow } from './FeatureScenes';

function initialMarkup() {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<ComposerWindow />);
  return root;
}

describe('Web composer slash command illustration', () => {
  it('uses the current shared command selector and describes an unsent draft', () => {
    const root = initialMarkup();
    const mode = interactionMode('search');
    const native = BUILT_IN_SLASH_COMMANDS.find((command) => command.id === 'search');
    expect(native).toBeDefined();
    expect(mode.selector.label).toBe(native!.label);
    expect(root.querySelector('.agi-sc-typed code')).toHaveTextContent(native!.label);
    expect(root.querySelector('.agi-sc-slash-name')).toHaveTextContent(native!.label);
    expect(root.querySelector('[data-composer-command-description]')).toHaveTextContent(
      mode.description,
    );
    expect(root.querySelector('.agi-mk-seg [data-on]')).toHaveTextContent(
      interactionMode('chat').selector.label,
    );
    expect(root.querySelector('[data-composer-example]')).toHaveTextContent(
      'Example · Web composer draft',
    );
    expect(root.querySelector('[data-composer-availability]')).toHaveTextContent(
      'Search availability depends on the selected model, tools and account. No message has been sent.',
    );
    expect(root.textContent).not.toMatch(
      /\/research|\/summarise|Search · on|Enter to send|\d+:\d+ dictated|Served by/,
    );
  });

  it('keeps the initial illustration static and uses registered icons', () => {
    const root = initialMarkup();
    expect(root.querySelector('figure.agi-composer-responsive')).not.toBeNull();
    expect(root.querySelector('.agi-dev-body')).toHaveAttribute('aria-hidden', 'true');
    expect(
      root.querySelectorAll('a,button,input,select,textarea,[contenteditable],[tabindex]'),
    ).toHaveLength(0);
    expect(root.querySelectorAll('[data-composer-attachment]')).toHaveLength(2);
    expect(root.querySelectorAll('svg.agi-composer-icon[aria-hidden="true"]')).toHaveLength(4);
    expect(root.querySelector('.agi-dev-caret')).toBeNull();
    expect(root.textContent).not.toMatch(/[▤▣◉➤▾]/);
  });
});
