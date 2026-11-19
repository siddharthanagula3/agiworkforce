/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, Text, type AlertButton } from 'react-native';
import {
  actionMenuLabels,
  actionMenuRowColor,
  actionMenuTitle,
  cancelActionMenu,
  chooseActionMenuItem,
  isActionMenuOpen,
} from '@/test-utils/actionMenu';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { spaceAbove, tapTarget } from '@/test-utils/viewerChrome';
import { parseDeck, serializeDeck } from '@agiworkforce/unified-chat/deck-model';
import { ArtifactViewer } from '../ArtifactViewer';
import { PresentationDeckView } from '../presentation/PresentationDeckView';
import { deckSlides, isDeckArtifact } from '../presentation/deckContent';
import {
  REWRITE_SLIDE_INSTRUCTION,
  buildSlideEditRequest,
} from '@agiworkforce/unified-chat/deck-request';
import { artifactViewerKind, viewerSourceForArtifact } from '../viewerKind';

const DECK =
  '<!-- deck -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it\n\n---\n\n## Thanks';

const renderMarkdown = (text: string) => <Text testID="slide-markdown">{text}</Text>;

function slideText(index: number): string {
  const slide = screen.getByTestId(`deck-slide-${index}`);
  const markdown = slide.findAll((node) => node.props.testID === 'slide-markdown')[0];
  return markdown?.props.children as string;
}

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function renderOnPhone(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={PHONE}>{element}</SafeAreaProvider>);
}

function laidOut(width: number) {
  fireEvent(screen.getByTestId('presentation-deck'), 'layout', {
    nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } },
  });
}

describe('deck detection', () => {
  it('knows a Markdown deck by its deck line, with or without the artifact marker', () => {
    expect(isDeckArtifact('markdown', DECK)).toBe(true);
    expect(isDeckArtifact(undefined, DECK)).toBe(true);
    expect(isDeckArtifact('markdown', `<!-- @artifact -->\n${DECK}`)).toBe(true);
    expect(isDeckArtifact('markdown', '# Notes\n\n---\n\nMore notes')).toBe(false);
    expect(isDeckArtifact('python', DECK)).toBe(false);
  });

  it('gives a deck artifact the deck viewer whether it was stored as code or as a document', () => {
    for (const type of ['code', 'document'] as const) {
      const source = viewerSourceForArtifact({
        id: 'a1',
        type,
        title: 'Launch',
        content: DECK,
        language: 'markdown',
      });
      expect(artifactViewerKind(source)).toBe('deck');
    }
  });

  it('draws the deck through ArtifactViewer only when the caller gives a Markdown renderer', () => {
    const source = viewerSourceForArtifact({
      id: 'a1',
      type: 'document',
      title: 'Launch',
      content: DECK,
      language: 'markdown',
    });
    const { unmount } = render(<ArtifactViewer source={source} />);
    expect(screen.queryByTestId('presentation-deck')).toBeNull();
    unmount();
    render(<ArtifactViewer source={source} renderMarkdown={renderMarkdown} />);
    expect(screen.getByTestId('presentation-deck')).toBeTruthy();
  });
});

describe('PresentationDeckView', () => {
  it('shows one slide at a time with its position and moves with Previous and Next', () => {
    render(<PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />);
    laidOut(320);

    expect(screen.getByTestId('deck-counter').props.children).toBe('1 / 3');
    expect(screen.getByLabelText('Slide 1 of 3')).toBeTruthy();
    expect(slideText(0)).toBe('# Launch plan\nWhy now');
    expect(screen.getByTestId('deck-previous').props.accessibilityState).toEqual({
      disabled: true,
    });

    fireEvent.press(screen.getByTestId('deck-next'));
    expect(screen.getByTestId('deck-counter').props.children).toBe('2 / 3');
    expect(screen.getByTestId('deck-go-1').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('deck-previous'));
    expect(screen.getByTestId('deck-counter').props.children).toBe('1 / 3');
  });

  it('goes straight to a slide and stops at the last one', () => {
    render(<PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />);
    laidOut(320);

    fireEvent.press(screen.getByLabelText('Go to slide 3'));
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 3');
    expect(screen.getByTestId('deck-next').props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(screen.getByTestId('deck-next'));
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 3');
  });

  it('follows a swipe to the slide it settles on', () => {
    render(<PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />);
    laidOut(320);

    fireEvent(screen.getByTestId('deck-slides'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 640, y: 0 } },
    });
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 3');
    fireEvent(screen.getByTestId('deck-slides'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 330, y: 0 } },
    });
    expect(screen.getByTestId('deck-counter').props.children).toBe('2 / 3');
  });

  it('presents the current slide full screen and stops presenting', () => {
    renderOnPhone(
      <PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />,
    );
    laidOut(320);
    fireEvent.press(screen.getByTestId('deck-next'));

    expect(screen.queryByTestId('deck-presenting')).toBeNull();
    fireEvent.press(screen.getByLabelText('Present'));
    expect(screen.getByTestId('deck-presenting')).toBeTruthy();
    expect(screen.getByTestId('deck-presenting-counter').props.children).toBe('2 / 3');
    const presented = screen
      .getByTestId('deck-presenting-slide-1')
      .findAll((node) => node.props.testID === 'slide-markdown')[0];
    expect(presented?.props.children).toBe('## Steps\nShip it');

    fireEvent.press(screen.getByTestId('deck-presenting-next'));
    expect(screen.getByTestId('deck-presenting-counter').props.children).toBe('3 / 3');
    fireEvent.press(screen.getByLabelText('Stop presenting'));
    expect(screen.queryByTestId('deck-presenting')).toBeNull();
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 3');
  });

  it('keeps Stop presenting below the status bar, and the system back stops presenting', () => {
    renderOnPhone(
      <PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />,
    );
    laidOut(320);
    fireEvent.press(screen.getByLabelText('Present'));

    const stop = screen.getByLabelText('Stop presenting');
    expect(spaceAbove(stop)).toBeGreaterThanOrEqual(PHONE.insets.top);
    const target = tapTarget(stop);
    expect(target.width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(target.height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);

    const presenter = screen
      .UNSAFE_getAllByType(Modal)
      .find((modal) => modal.props.supportedOrientations !== undefined)!;
    act(() => presenter.props.onRequestClose());
    expect(screen.queryByTestId('deck-presenting')).toBeNull();
  });

  it('says so when the deck has no slides', () => {
    render(<PresentationDeckView title="Empty" content="  " renderMarkdown={renderMarkdown} />);
    expect(screen.getByText('No slides found')).toBeTruthy();
  });
});

describe('Ask about this slide', () => {
  it('offers no ask control outside a chat', () => {
    render(<PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />);
    expect(screen.queryByTestId('deck-ask-slide')).toBeNull();
  });

  it('sends a change request scoped to the slide on screen', () => {
    const onAsk = jest.fn();
    render(
      <PresentationDeckView
        title="Launch"
        content={DECK}
        renderMarkdown={renderMarkdown}
        onAsk={onAsk}
      />,
    );
    laidOut(320);
    fireEvent.press(screen.getByTestId('deck-next'));
    fireEvent.press(screen.getByLabelText('Ask about slide 2'));
    expect(screen.getByTestId('deck-ask-slide').props.accessibilityState).toEqual({
      expanded: true,
    });
    expect(screen.getByPlaceholderText('What should change on slide 2?')).toBeTruthy();
    expect(screen.getByTestId('deck-ask-send').props.accessibilityState).toEqual({
      disabled: true,
    });
    fireEvent.press(screen.getByTestId('deck-ask-send'));
    expect(onAsk).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('deck-ask-input'), '  Add a timeline  ');
    fireEvent.press(screen.getByTestId('deck-ask-send'));

    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith(
      buildSlideEditRequest({
        title: 'Launch',
        slideIndex: 1,
        slideCount: 3,
        slide: '## Steps\nShip it',
        instruction: 'Add a timeline',
      }),
    );
    const request = onAsk.mock.calls[0]![0] as string;
    expect(request).toContain('Change only slide 2 of 3');
    expect(request).toContain('Requested change: Add a timeline');
    expect(screen.queryByTestId('deck-ask-form')).toBeNull();
  });

  it('rewrites the slide with the shared instruction', () => {
    const onAsk = jest.fn();
    render(
      <PresentationDeckView
        title="Launch"
        content={DECK}
        renderMarkdown={renderMarkdown}
        onAsk={onAsk}
      />,
    );
    laidOut(320);
    fireEvent.press(screen.getByLabelText('Go to slide 3'));
    fireEvent.press(screen.getByTestId('deck-ask-slide'));
    fireEvent.press(screen.getByLabelText('Rewrite slide'));
    expect(onAsk).toHaveBeenCalledWith(
      buildSlideEditRequest({
        title: 'Launch',
        slideIndex: 2,
        slideCount: 3,
        slide: '## Thanks',
        instruction: REWRITE_SLIDE_INSTRUCTION,
      }),
    );
  });

  it('passes the ask through ArtifactViewer for a deck', () => {
    const onAsk = jest.fn();
    render(
      <ArtifactViewer
        source={{ origin: 'inline', title: 'Launch', language: 'markdown', content: DECK }}
        renderMarkdown={renderMarkdown}
        onAsk={onAsk}
      />,
    );
    laidOut(320);
    fireEvent.press(screen.getByTestId('deck-ask-slide'));
    fireEvent.changeText(screen.getByTestId('deck-ask-input'), 'Shorter title');
    fireEvent(screen.getByTestId('deck-ask-input'), 'submitEditing');
    expect(onAsk.mock.calls[0]![0]).toContain('Change only slide 1 of 3');
  });
});

describe('deck content', () => {
  it('keeps the deck line out of the first slide', () => {
    expect(deckSlides(DECK)).toEqual(['# Launch plan\nWhy now', '## Steps\nShip it', '## Thanks']);
  });

  it('keeps a saved deck a deck, with or without settings', () => {
    const bare = serializeDeck(parseDeck(DECK));
    expect(bare).toBe(
      '<!-- deck -->\n\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it\n\n---\n\n## Thanks\n',
    );
    expect(isDeckArtifact('markdown', bare)).toBe(true);
    const themed = serializeDeck(parseDeck('<!-- deck theme=midnight -->\n# One\n\n---\n\n# Two'));
    expect(themed).toBe('<!-- deck theme=midnight -->\n\n# One\n\n---\n\n# Two\n');
  });
});

describe('Ask about this slide after an edit', () => {
  it('includes the current deck only when the person edited it', () => {
    const onAsk = jest.fn();
    const { rerender } = render(
      <PresentationDeckView
        title="Launch"
        content={DECK}
        renderMarkdown={renderMarkdown}
        onAsk={onAsk}
      />,
    );
    fireEvent.press(screen.getByTestId('deck-ask-slide'));
    fireEvent.changeText(screen.getByTestId('deck-ask-input'), 'Shorter');
    fireEvent.press(screen.getByTestId('deck-ask-send'));
    expect(onAsk.mock.calls[0]![0]).not.toContain('edited since you last wrote it');

    rerender(
      <PresentationDeckView
        title="Launch"
        content={DECK}
        renderMarkdown={renderMarkdown}
        onAsk={onAsk}
        handEdited
      />,
    );
    fireEvent.press(screen.getByTestId('deck-ask-slide'));
    fireEvent.changeText(screen.getByTestId('deck-ask-input'), 'Shorter');
    fireEvent.press(screen.getByTestId('deck-ask-send'));
    expect(onAsk.mock.calls[1]![0]).toBe(
      buildSlideEditRequest({
        title: 'Launch',
        slideIndex: 0,
        slideCount: 3,
        slide: '# Launch plan\nWhy now',
        instruction: 'Shorter',
        currentDeck: DECK,
      }),
    );
    expect(onAsk.mock.calls[1]![0]).toContain('edited since you last wrote it');
  });
});

describe('Slide actions', () => {
  const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
  const alert = jest.spyOn(Alert, 'alert');

  beforeEach(() => {
    sheet.mockReset();
    alert.mockReset();
  });

  afterAll(() => {
    sheet.mockRestore();
    alert.mockRestore();
  });

  function deckOf(...slides: string[]): string {
    return `<!-- deck -->\n\n${slides.join('\n\n---\n\n')}\n`;
  }

  function Harness({ initial, onSave }: { initial: string; onSave: (content: string) => void }) {
    const [content, setContent] = useState(initial);
    return (
      <PresentationDeckView
        title="Launch"
        content={content}
        renderMarkdown={renderMarkdown}
        onSave={(next) => {
          onSave(next);
          setContent(next);
        }}
      />
    );
  }

  function shownActions(): string[] {
    const options = sheet.mock.calls.at(-1)![0].options;
    return options.slice(0, -1);
  }

  function choose(label: string) {
    const [options, callback] = sheet.mock.calls.at(-1)!;
    const chosen = options.options.indexOf(label);
    expect(chosen).toBeGreaterThanOrEqual(0);
    act(() => callback(chosen));
  }

  function pressAlertButton(text: string) {
    const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
    const button = buttons.find((candidate) => candidate.text === text);
    expect(button).toBeDefined();
    act(() => button!.onPress?.());
  }

  it('offers no slide actions when the deck cannot be saved', () => {
    render(<PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />);
    expect(screen.queryByTestId('deck-slide-actions')).toBeNull();
  });

  it('lists only the moves that make sense for the slide on screen', () => {
    render(<Harness initial={DECK} onSave={jest.fn()} />);
    laidOut(320);
    fireEvent.press(screen.getByLabelText('Slide 1 actions'));
    expect(sheet.mock.calls[0]![0].title).toBe('Slide 1');
    expect(sheet.mock.calls[0]![0].destructiveButtonIndex).toBe(4);
    expect(shownActions()).toEqual([
      'Edit slide',
      'New slide after this',
      'Duplicate slide',
      'Move later',
      'Delete slide',
    ]);

    fireEvent.press(screen.getByLabelText('Go to slide 3'));
    fireEvent.press(screen.getByLabelText('Slide 3 actions'));
    expect(shownActions()).toEqual([
      'Edit slide',
      'New slide after this',
      'Duplicate slide',
      'Move earlier',
      'Delete slide',
    ]);
  });

  it('adds a new slide after the current one and shows it', () => {
    const onSave = jest.fn();
    render(<Harness initial={DECK} onSave={onSave} />);
    laidOut(320);
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('New slide after this');
    expect(onSave).toHaveBeenCalledWith(
      deckOf(
        '# Launch plan\nWhy now',
        '## New slide\n\n- First point\n- Second point',
        '## Steps\nShip it',
        '## Thanks',
      ),
    );
    expect(screen.getByTestId('deck-counter').props.children).toBe('2 / 4');
    expect(slideText(1)).toBe('## New slide\n\n- First point\n- Second point');
  });

  it('duplicates and moves a slide', () => {
    const onSave = jest.fn();
    render(<Harness initial={DECK} onSave={onSave} />);
    laidOut(320);
    fireEvent.press(screen.getByTestId('deck-next'));
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Duplicate slide');
    expect(onSave).toHaveBeenLastCalledWith(
      deckOf('# Launch plan\nWhy now', '## Steps\nShip it', '## Steps\nShip it', '## Thanks'),
    );
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 4');

    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Move later');
    expect(onSave).toHaveBeenLastCalledWith(
      deckOf('# Launch plan\nWhy now', '## Steps\nShip it', '## Thanks', '## Steps\nShip it'),
    );
    expect(screen.getByTestId('deck-counter').props.children).toBe('4 / 4');

    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Move earlier');
    expect(onSave).toHaveBeenLastCalledWith(
      deckOf('# Launch plan\nWhy now', '## Steps\nShip it', '## Steps\nShip it', '## Thanks'),
    );
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 4');
  });

  it('asks before deleting a slide and says how to bring it back', () => {
    const onSave = jest.fn();
    render(<Harness initial={DECK} onSave={onSave} />);
    laidOut(320);
    fireEvent.press(screen.getByLabelText('Go to slide 2'));
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Delete slide');
    expect(onSave).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe('Delete slide 2?');
    expect(alert.mock.calls[0]![1]).toBe(
      'You can bring it back by restoring the previous version.',
    );

    pressAlertButton('Cancel');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Delete slide');
    pressAlertButton('Delete');
    expect(onSave).toHaveBeenCalledWith(deckOf('# Launch plan\nWhy now', '## Thanks'));
    expect(screen.getByTestId('deck-counter').props.children).toBe('1 / 2');
  });

  it('never offers to delete the only slide', () => {
    render(<Harness initial={'<!-- deck -->\n# Only'} onSave={jest.fn()} />);
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    expect(shownActions()).toEqual(['Edit slide', 'New slide after this', 'Duplicate slide']);
  });

  it('edits the slide text and keeps its diagram', () => {
    const onSave = jest.fn();
    const withDiagram = deckOf(
      '# Launch plan\nWhy now',
      '## Steps\nShip it\n\n```mermaid\ngraph TD; A-->B\n```',
    );
    render(<Harness initial={withDiagram} onSave={onSave} />);
    laidOut(320);
    fireEvent.press(screen.getByTestId('deck-next'));
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Edit slide');

    expect(screen.getByText('Edit slide 2')).toBeTruthy();
    expect(screen.getByTestId('deck-edit-input').props.value).toBe('## Steps\nShip it');
    fireEvent.changeText(screen.getByTestId('deck-edit-input'), '## Steps\nShip it this week');
    fireEvent.press(screen.getByLabelText('Save the slide'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as string;
    expect(parseDeck(saved).slides[1]).toBe(
      '## Steps\nShip it this week\n\n```mermaid\ngraph TD; A-->B\n```',
    );
    expect(parseDeck(saved).slides[0]).toBe('# Launch plan\nWhy now');
    expect(isDeckArtifact('markdown', saved)).toBe(true);
    expect(screen.queryByTestId('deck-edit-sheet')).toBeNull();
    expect(screen.getByTestId('deck-counter').props.children).toBe('2 / 2');
  });

  it('closes an unchanged edit without saving and asks before dropping a changed one', () => {
    const onSave = jest.fn();
    render(<Harness initial={DECK} onSave={onSave} />);
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Edit slide');
    fireEvent.press(screen.getByLabelText('Save the slide'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByTestId('deck-edit-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Edit slide');
    fireEvent.press(screen.getByLabelText('Cancel editing'));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('deck-edit-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Edit slide');
    fireEvent.changeText(screen.getByTestId('deck-edit-input'), '# Launch');
    fireEvent.press(screen.getByLabelText('Cancel editing'));
    expect(alert.mock.calls[0]![0]).toBe('Discard your edits?');
    expect(alert.mock.calls[0]![1]).toBe('Your changes to slide 1 will be lost.');
    pressAlertButton('Keep editing');
    expect(screen.getByTestId('deck-edit-sheet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Cancel editing'));
    pressAlertButton('Discard');
    expect(screen.queryByTestId('deck-edit-sheet')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('passes saving through ArtifactViewer for a deck', () => {
    const onSave = jest.fn();
    render(
      <ArtifactViewer
        source={{ origin: 'inline', title: 'Launch', language: 'markdown', content: DECK }}
        renderMarkdown={renderMarkdown}
        onSave={onSave}
      />,
    );
    fireEvent.press(screen.getByTestId('deck-slide-actions'));
    choose('Duplicate slide');
    expect(onSave).toHaveBeenCalledWith(
      deckOf('# Launch plan\nWhy now', '# Launch plan\nWhy now', '## Steps\nShip it', '## Thanks'),
    );
  });

  describe('on Android', () => {
    let platform: jest.ReplaceProperty<typeof Platform.OS>;

    beforeEach(() => {
      jest.useFakeTimers();
      platform = jest.replaceProperty(Platform, 'OS', 'android');
    });

    afterEach(() => {
      platform.restore();
      sheet.mockReset();
      alert.mockReset();
      jest.useRealTimers();
    });

    function openActions(onSave = jest.fn()) {
      renderOnPhone(<Harness initial={DECK} onSave={onSave} />);
      laidOut(320);
      fireEvent.press(screen.getByLabelText('Go to slide 2'));
      fireEvent.press(screen.getByTestId('deck-slide-actions'));
      return onSave;
    }

    it('lists every slide action in the app sheet, with Delete slide in the destructive colour', () => {
      openActions();

      expect(sheet).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
      expect(actionMenuTitle()).toBe('Slide 2');
      expect(actionMenuLabels()).toEqual([
        'Edit slide',
        'New slide after this',
        'Duplicate slide',
        'Move earlier',
        'Move later',
        'Delete slide',
      ]);
      expect(actionMenuRowColor('Delete slide')).not.toBe(actionMenuRowColor('Edit slide'));
    });

    it('moves the slide earlier and later', () => {
      const onSave = openActions();
      chooseActionMenuItem('Move later');
      expect(onSave).toHaveBeenLastCalledWith(
        deckOf('# Launch plan\nWhy now', '## Thanks', '## Steps\nShip it'),
      );

      fireEvent.press(screen.getByTestId('deck-slide-actions'));
      chooseActionMenuItem('Move earlier');
      expect(onSave).toHaveBeenLastCalledWith(
        deckOf('# Launch plan\nWhy now', '## Steps\nShip it', '## Thanks'),
      );
    });

    it('adds and duplicates a slide after the current one', () => {
      const onSave = openActions();
      chooseActionMenuItem('Duplicate slide');
      expect(onSave).toHaveBeenLastCalledWith(
        deckOf('# Launch plan\nWhy now', '## Steps\nShip it', '## Steps\nShip it', '## Thanks'),
      );

      fireEvent.press(screen.getByTestId('deck-slide-actions'));
      chooseActionMenuItem('New slide after this');
      expect(screen.getByTestId('deck-counter').props.children).toBe('4 / 5');
    });

    it('asks before deleting a slide and deletes only on Delete', () => {
      const onSave = openActions();
      chooseActionMenuItem('Delete slide');

      expect(alert.mock.calls[0]![0]).toBe('Delete slide 2?');
      expect((alert.mock.calls[0]![2] as AlertButton[]).map((button) => button.text)).toEqual([
        'Cancel',
        'Delete',
      ]);
      expect(onSave).not.toHaveBeenCalled();
      pressAlertButton('Delete');
      expect(onSave).toHaveBeenCalledWith(deckOf('# Launch plan\nWhy now', '## Thanks'));
    });

    it('opens the slide editor', () => {
      openActions();
      chooseActionMenuItem('Edit slide');

      expect(screen.getByTestId('deck-edit-sheet')).toBeTruthy();
    });

    it('closes on Cancel without changing the deck', () => {
      const onSave = openActions();
      cancelActionMenu();

      expect(isActionMenuOpen()).toBe(false);
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
