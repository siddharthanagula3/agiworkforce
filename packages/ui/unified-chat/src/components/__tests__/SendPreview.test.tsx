import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { summarizeSendPreview, type SendPreviewPresentation } from '@agiworkforce/types';
import { SendPreview } from '../SendPreview';

const LOCAL_MODEL_LABEL = 'Local Model Fixture';
const DIRECT_MODEL_LABEL = 'Direct Model Fixture';

function localPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'Local',
    modelLabel: LOCAL_MODEL_LABEL,
    messageBody: 'hi',
    attachmentSummaries: [{ name: 'a.png', mimeType: 'image/png' }],
  });
}

describe('SendPreview', () => {
  it('renders a privacy-positive banner for Local turns, one line until expanded', () => {
    render(<SendPreview presentation={localPresentation()} />);
    expect(screen.getByText('Stays on this device')).toBeDefined();
    expect(screen.getByText('Local')).toBeDefined();
    expect(screen.queryByText(/nothing is uploaded/i)).toBeNull();

    fireEvent.click(screen.getByText(/Show details/i));
    expect(screen.getByText(/nothing is uploaded/i)).toBeDefined();
  });

  it('renders the BYOK destination host call-out behind the disclosure', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
      modelLabel: DIRECT_MODEL_LABEL,
    });
    render(<SendPreview presentation={presentation} />);
    expect(screen.getByText('Sent to api.anthropic.com')).toBeDefined();
    expect(screen.getByText('BYOK')).toBeDefined();
    expect(screen.queryByText(/your API key/i)).toBeNull();

    fireEvent.click(screen.getByText(/Show details/i));
    expect(screen.getByText(/your API key/i)).toBeDefined();
  });

  it('renders the Managed gateway call-out for ManagedNative behind the disclosure', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'ManagedNative',
    });
    render(<SendPreview presentation={presentation} />);
    expect(screen.getByText('Sent through AGI Managed gateway')).toBeDefined();
    expect(screen.getByText('Managed')).toBeDefined();
    expect(screen.queryByText(/managed-mode retention/i)).toBeNull();

    fireEvent.click(screen.getByText(/Show details/i));
    expect(screen.getByText(/managed-mode retention/i)).toBeDefined();
  });

  it('exposes provider-mode + stays-local data attributes for host wiring', () => {
    render(<SendPreview presentation={localPresentation()} />);
    const root = screen.getByTestId('send-preview');
    expect(root.getAttribute('data-provider-mode')).toBe('Local');
    expect(root.getAttribute('data-stays-local')).toBe('true');
  });

  it('shows the model label in the header strip', () => {
    render(<SendPreview presentation={localPresentation()} />);
    expect(screen.getByText(LOCAL_MODEL_LABEL)).toBeDefined();
  });

  it('hides the details block by default and reveals it when expanded', () => {
    render(<SendPreview presentation={localPresentation()} />);
    expect(screen.queryByTestId('send-preview-details')).toBeNull();
    fireEvent.click(screen.getByText(/Show details/i));
    expect(screen.getByTestId('send-preview-details')).toBeDefined();
    expect(screen.getByText('Message')).toBeDefined();
    expect(screen.getByText('2 chars')).toBeDefined();
    expect(screen.getByText('Attachments')).toBeDefined();
    expect(screen.getByText('1 attachment (png)')).toBeDefined();
  });

  it('respects defaultExpanded for hosts that want a permanently-open preview', () => {
    render(<SendPreview presentation={localPresentation()} defaultExpanded />);
    expect(screen.getByTestId('send-preview-details')).toBeDefined();
    fireEvent.click(screen.getByText(/Hide details/i));
    expect(screen.queryByTestId('send-preview-details')).toBeNull();
  });

  it('keeps the disclosure for the banner text but omits the details grid when there is nothing extra', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'Local',
      // No body, attachments, system prompt, context, tools, source-session.
    });
    render(<SendPreview presentation={presentation} />);
    expect(screen.queryByTestId('send-preview-details')).toBeNull();

    fireEvent.click(screen.getByText(/Show details/i));
    const details = screen.getByTestId('send-preview-details');
    expect(details).toBeDefined();
    expect(screen.getByText(presentation.bannerCopy)).toBeDefined();
    expect(details.querySelector('dl')).toBeNull();
  });

  it('applies different accent classes per provider mode', () => {
    const { rerender } = render(<SendPreview presentation={localPresentation()} />);
    let root = screen.getByTestId('send-preview');
    expect(root.className).toMatch(/emerald/);

    rerender(<SendPreview presentation={summarizeSendPreview({ providerMode: 'DirectByok' })} />);
    root = screen.getByTestId('send-preview');
    expect(root.className).toMatch(/amber/);

    rerender(
      <SendPreview presentation={summarizeSendPreview({ providerMode: 'ManagedGateway' })} />,
    );
    root = screen.getByTestId('send-preview');
    expect(root.className).toMatch(/sky/);
  });

  it('surfaces the source-session label in details when supplied', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'Local',
      sourceSessionLabel: 'Session conv-7',
    });
    render(<SendPreview presentation={presentation} defaultExpanded />);
    expect(screen.getByText('Source session')).toBeDefined();
    expect(screen.getByText('Session conv-7')).toBeDefined();
  });

  it('renders an unobtrusive compact destination control with details on demand', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'ManagedGateway',
      destinationHost: 'AGI managed cloud',
      modelLabel: 'Auto',
      toolNames: ['Web search'],
    });
    render(<SendPreview presentation={presentation} variant="compact" />);

    expect(screen.getByText('Managed cloud')).toBeDefined();
    expect(screen.queryByText(presentation.bannerCopy)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /show send details/i }));

    expect(screen.getByText(presentation.bannerCopy)).toBeDefined();
    expect(screen.getByText('Web search')).toBeDefined();
  });
});
