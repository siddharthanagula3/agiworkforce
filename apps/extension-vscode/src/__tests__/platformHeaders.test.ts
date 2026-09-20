import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_NAME_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  SURFACE_REQUEST_HEADER,
  VSCODE_CLIENT_NAME,
} from '@agiworkforce/cloud-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { platformRequestHeaders } from '../platform/platformHeaders';

const installed = vscode.extensions.getExtension as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  installed.mockReset();
  installed.mockReturnValue({ packageJSON: { version: '0.3.0' }, isActive: true });
});

describe('what every call from the editor extension tells the platform', () => {
  it('takes the version from the installed extension, never from a literal', () => {
    installed.mockReturnValue({ packageJSON: { version: '0.4.2' }, isActive: true });

    const headers = platformRequestHeaders();

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('vscode');
    expect(headers[CLIENT_NAME_REQUEST_HEADER]).toBe(VSCODE_CLIENT_NAME);
    expect(headers[CLIENT_VERSION_HEADER]).toBe('0.4.2');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
  });

  it('keeps the user agent the editor already sent alongside the handshake', () => {
    installed.mockReturnValue({ packageJSON: { version: '0.4.2' }, isActive: true });
    expect(platformRequestHeaders()['User-Agent']).toContain('0.4.2');
  });
});
