jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { renderMarkdownContent } from '../MessageContentRenderer';

function renderReply(content: string, onFollowUp?: (text: string) => void) {
  return render(<>{renderMarkdownContent(content, undefined, onFollowUp ? { onFollowUp } : {})}</>);
}

const fence = (language: string, body: string) => `\`\`\`${language}\n${body}\n\`\`\``;

describe('mobile answer surface controls', () => {
  it('sends a completed form as the next message and blocks an empty required field', () => {
    const onFollowUp = jest.fn();
    renderReply(
      fence(
        'form',
        [
          'title: Trip',
          'text: City*',
          'select: Season | Spring | *Summer',
          'slider: Budget | 0 | 10 | 4 | k',
          'checks: Bring | *Camera | Map',
          'submit: Plan it | send',
        ].join('\n'),
      ),
      onFollowUp,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Plan it (send to chat)' }));
    expect(onFollowUp).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid value for City.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('City'), 'Kyoto');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Map' }));
    fireEvent.press(screen.getByRole('button', { name: 'Plan it (send to chat)' }));

    expect(onFollowUp).toHaveBeenCalledWith(
      'Trip\nCity: Kyoto\nSeason: Summer\nBudget: 4 k\nBring: Camera, Map',
    );
    expect(screen.getByLabelText('Applied values')).toBeTruthy();
  });

  it('keeps a form that sends to chat disabled where there is no chat to send to', () => {
    renderReply(fence('form', 'title: Trip\ntext: City | Rome\nsubmit: Plan it | send'));
    expect(screen.getByText('Submitting to chat is unavailable in this view.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Plan it (send to chat)' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('moves a slider with the screen reader adjust actions and shows the new value', () => {
    renderReply(fence('slider', 'label: Tip\nmin: 0\nmax: 30\nvalue: 15\nprefix: $'));
    const slider = screen.getByRole('adjustable', { name: 'Tip' });
    fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByText('$17')).toBeTruthy();
    expect(slider.props.accessibilityValue).toMatchObject({ min: 0, max: 30, now: 17 });
  });

  it('opens a dropdown, picks an option and shows it as selected', () => {
    renderReply(fence('dropdown', 'label: Size\nselected: Medium\nSmall\nMedium\nLarge'));
    fireEvent.press(screen.getByRole('button', { name: 'Size, Medium' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    expect(screen.getByText('Selected: Large')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Small' })).toBeNull();
  });

  it('draws radio choices as a group with one selection', () => {
    renderReply(fence('radio', 'prompt: Plan\n- Basic\n* Pro'));
    expect(screen.getByRole('radio', { name: 'Pro' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    fireEvent.press(screen.getByRole('radio', { name: 'Basic' }));
    expect(screen.getByText('Selected: Basic')).toBeTruthy();
  });

  it('draws checks as checkboxes and summarises their states', () => {
    renderReply(fence('checks', 'title: Features\n- [x] Sync\n- [ ] Backup'));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Backup' }));
    expect(screen.getByText('Sync: Enabled\nBackup: Enabled')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });

  it('hides details until the summary is opened', () => {
    renderReply(fence('details', 'Why\nBecause it is faster.'));
    expect(screen.queryByText('Because it is faster.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Why' }));
    expect(screen.getByText('Because it is faster.')).toBeTruthy();
  });

  it('draws colour swatches and loads a remote gallery image only when asked', () => {
    renderReply(fence('gallery', 'Sky | #3366ff\nPhoto | https://example.com/photo.png'));
    expect(screen.getByLabelText('Sky, #3366ff')).toBeTruthy();
    expect(screen.queryByRole('imagebutton', { name: 'Photo' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Load image from example.com' }));
    fireEvent.press(screen.getByRole('imagebutton', { name: 'Photo' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/photo.png');
  });

  it('opens a citation link in the in-app browser', () => {
    renderReply(fence('citation', 'title: Guide\nsource: Docs\nurl: https://example.com/guide'));
    fireEvent.press(screen.getByRole('link', { name: 'Open https://example.com/guide' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/guide');
  });

  it('labels status rows and timeline steps with their state', () => {
    renderReply(
      `${fence('status', 'Build | Passed\nDeploy | Failed')}\n\n${fence('timeline', 'Plan | Scope | Complete\nShip | Release | Not started')}`,
    );
    expect(screen.getByLabelText('Build: Passed')).toBeTruthy();
    expect(screen.getByLabelText('Deploy: Failed')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
  });
});
