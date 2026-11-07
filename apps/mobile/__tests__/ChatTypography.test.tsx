import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { agiChatTypography } from '@agiworkforce/design-tokens';
import {
  colors,
  lightColors,
  highContrastColors,
  highContrastLightColors,
} from '@/src/ui/theme/tokens';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';

const THEMES = [
  ['dark', colors],
  ['light', lightColors],
  ['high contrast dark', highContrastColors],
  ['high contrast light', highContrastLightColors],
] as const;

describe.each(THEMES)('%s native chat typography', (_name, palette) => {
  it('uses shared prose and heading metrics without restricting long headings', () => {
    const longHeading = 'A long section title that wraps within the available reading column';
    render(
      <View>
        {renderMarkdownContent(
          `# ${longHeading}\n\n## Results\n\n### Next steps\n\nOrdinary prose.\n\n- A list item.\n\n> Quoted prose.`,
          palette,
        )}
      </View>,
    );

    for (const [name, metrics] of [
      [longHeading, agiChatTypography.heading1],
      ['Results', agiChatTypography.heading2],
      ['Next steps', agiChatTypography.heading3],
    ] as const) {
      const heading = screen.getByRole('header', { name });
      expect(heading).toHaveStyle({ ...metrics, color: palette.textPrimary });
      expect(heading.props.numberOfLines).toBeUndefined();
    }
    for (const text of ['Ordinary prose.', 'A list item.', 'Quoted prose.']) {
      expect(screen.getByText(text)).toHaveStyle(agiChatTypography.body);
    }
  });

  it('keeps email fields legible with one writing inset and reachable actions', () => {
    render(
      <View>
        {renderMarkdownContent(
          '```email\nTo: reader@example.com\nSubject: Quarterly review\n\nThe review is ready.\n```',
          palette,
        )}
      </View>,
    );

    expect(screen.getByTestId('answer-surface-email')).toHaveStyle({ padding: 20 });
    expect(screen.getByLabelText('Subject')).toHaveStyle(agiChatTypography.writingSubject);
    expect(screen.getByLabelText('Message')).toHaveStyle(agiChatTypography.body);
    for (const name of ['Copy email', 'Share']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ minWidth: 44, minHeight: 44 });
    }
  });

  it('applies the same readable body and inset to a writing draft', () => {
    render(
      <View>
        {renderMarkdownContent('```writing\nA draft that remains editable.\n```', palette)}
      </View>,
    );

    expect(screen.getByTestId('answer-surface-writing')).toHaveStyle({ padding: 20 });
    expect(screen.getByDisplayValue('A draft that remains editable.')).toHaveStyle(
      agiChatTypography.body,
    );
    expect(screen.getByRole('button', { name: 'Copy draft' })).toHaveStyle({
      minWidth: 44,
      minHeight: 44,
    });
  });
});
