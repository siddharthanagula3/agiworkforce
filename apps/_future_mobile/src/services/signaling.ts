import { SignalingClient, type SignalingClientOptions } from '@agiworkforce/utils';

export type { SignalingEvent } from '@agiworkforce/utils';

export interface MobileSignalingOptions extends Omit<SignalingClientOptions, 'role'> {
  role?: 'mobile';
}

export function createMobileSignalingClient(options: MobileSignalingOptions): SignalingClient {
  return new SignalingClient({
    ...options,
    role: 'mobile',
  });
}

export interface PairingDetails {
  code: string;
  wsUrl: string;
}

function resolveConfiguredWsUrl(): string | null {
  const explicitWs = process.env['EXPO_PUBLIC_SIGNALING_WS_URL'];
  if (explicitWs) {
    return explicitWs;
  }

  const explicitHttp = process.env['EXPO_PUBLIC_SIGNALING_HTTP_URL'];
  if (explicitHttp) {
    try {
      const httpUrl = new URL(explicitHttp);
      const wsPath = process.env['EXPO_PUBLIC_SIGNALING_WS_PATH'] ?? '/ws';
      httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      httpUrl.pathname = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
      httpUrl.search = '';
      httpUrl.hash = '';
      return httpUrl.toString();
    } catch (error) {
      console.warn('[mobile] invalid EXPO_PUBLIC_SIGNALING_HTTP_URL', error);
    }
  }

  const host = process.env['EXPO_PUBLIC_SIGNALING_HOST'];
  if (host) {
    const normalizedHost = host.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    const scheme = process.env['EXPO_PUBLIC_SIGNALING_PROTOCOL'] ?? 'ws';
    const wsPath = process.env['EXPO_PUBLIC_SIGNALING_WS_PATH'] ?? '/ws';
    const safePath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
    return `${scheme}://${normalizedHost}${safePath}`;
  }

  return null;
}

export function parsePairingPayload(input: string): PairingDetails | null {
  try {
    if (input.startsWith('agiw://')) {
      const url = new URL(input);
      const dataParam = url.searchParams.get('data');
      if (!dataParam) {
        return null;
      }
      const decoded = JSON.parse(decodeURIComponent(dataParam)) as { code?: string; ws?: string };
      if (!decoded.code || !decoded.ws) {
        return null;
      }
      return { code: decoded.code, wsUrl: decoded.ws };
    }

    const maybeJson = JSON.parse(input) as { code?: string; ws?: string };
    if (maybeJson.code && maybeJson.ws) {
      return { code: maybeJson.code, wsUrl: maybeJson.ws };
    }

    if (/^\d{6}$/.test(input)) {
      const wsUrl = resolveConfiguredWsUrl();
      if (!wsUrl) {
        console.warn('[mobile] no signaling WebSocket configured for manual pairing');
        return null;
      }
      return { code: input, wsUrl };
    }
  } catch {
    return null;
  }
  return null;
}
