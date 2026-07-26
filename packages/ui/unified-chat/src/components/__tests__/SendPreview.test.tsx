/**
 * SendPreview tests.
 *
 * Pin the surface contract of the shared "what will be sent" disclosure:
 * destination labelling per provider mode, privacy-positive banner copy
 * for Local turns, expand/collapse details block, and accent class
 * selection across Local / DirectByok / Managed.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { summarizeSendPreview, type SendPreviewPresentation } from '@agiworkforce/types';
import { SendPreview } from '../SendPreview';

function localPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'Local',
    modelLabel: 'Llama 3.2 8B',
    messageBody: 'hi',
    attachmentSummaries: [{ name: 'a.png', mimeType: 'image/png' }],
  });
}

describe('SendPreview', () => {
  it('renders a privacy-positive banner for Local turns', () => {
    render(<SendPreview presentation={localPresentation()} />);
    expect(screen.getByText('Stays on this device')).toBeDefined();
    expect(screen.getByText('Local')).toBeDefined();
    expect(screen.getByText(/nothing is uploaded/i)).toBeDefined();
  });

  it('renders the BYOK destination host call-out', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
      modelLabel: 'Claude Sonnet 4.6',
    });
    render(<SendPreview presentation={presentation} />);
    expect(screen.getByText('Sent to api.anthropic.com')).toBeDefined();
    expect(screen.getByText('BYOK')).toBeDefined();
    expect(screen.getByText(/your API key/i)).toBeDefined();
  });

  it('renders the Managed gateway call-out for ManagedNative', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'ManagedNative',
    });
    render(<SendPreview presentation={presentation} />);
    expect(screen.getByText('Sent through AGI Managed gateway')).toBeDefined();
    expect(screen.getByText('Managed')).toBeDefined();
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
    expect(screen.getByText('Llama 3.2 8B')).toBeDefined();
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

  it('omits the expand toggle when there are no extra details to show', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'Local',
      // No body, attachments, system prompt, context, tools, source-session.
    });
    render(<SendPreview presentation={presentation} />);
    expect(screen.queryByText(/Show details/i)).toBeNull();
    expect(screen.queryByTestId('send-preview-details')).toBeNull();
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
