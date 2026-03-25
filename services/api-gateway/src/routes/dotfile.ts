/**
 * @file Dotfile Config API Routes
 * @description Exposes the user's ~/.agiworkforce/ config to web and mobile apps.
 * Attempts to proxy from the desktop app's localhost API (127.0.0.1:8765) when
 * available, otherwise returns sensible defaults.
 *
 * @security
 * - Authentication: JWT required for all endpoints
 * - Rate limiting: 60/min for read-only config endpoints
 * - No user input beyond auth — all endpoints are parameter-less GETs
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

// All dotfile endpoints require authentication
router.use(authenticateToken);

// =============================================================================
// CONSTANTS
// =============================================================================

const DESKTOP_BASE_URL = 'http://127.0.0.1:8765/api/dotfile';
const DESKTOP_TIMEOUT_MS = 2000;

// =============================================================================
// DEFAULT RESPONSES
// =============================================================================

interface DotfileConfigResponse {
  default: {
    model: string;
    provider: string;
    stream: boolean;
    approval_mode: string;
  };
  source: 'desktop' | 'default';
}

interface DotfileMcpServersResponse {
  servers: Record<string, unknown>;
  source: 'desktop' | 'default';
}

interface DotfileSkillsResponse {
  skills: unknown[];
  source: 'desktop' | 'default';
}

interface DotfileEcosystemResponse {
  tools: unknown[];
  source: 'desktop' | 'default';
}

interface DotfileStatusResponse {
  desktop_connected: boolean;
  config_source: 'desktop' | 'default';
  available_endpoints: string[];
}

const DEFAULT_CONFIG: DotfileConfigResponse = {
  default: {
    model: 'claude-opus-4-6',
    provider: 'anthropic',
    stream: true,
    approval_mode: 'suggest',
  },
  source: 'default',
};

const DEFAULT_MCP_SERVERS: DotfileMcpServersResponse = {
  servers: {},
  source: 'default',
};

const DEFAULT_SKILLS: DotfileSkillsResponse = {
  skills: [],
  source: 'default',
};

const DEFAULT_ECOSYSTEM: DotfileEcosystemResponse = {
  tools: [],
  source: 'default',
};

const AVAILABLE_ENDPOINTS = [
  '/api/dotfile/config',
  '/api/dotfile/mcp-servers',
  '/api/dotfile/skills',
  '/api/dotfile/ecosystem',
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Attempt to fetch from the desktop app's localhost API.
 * Returns the parsed JSON on success, or null if the desktop is unreachable.
 */
async function proxyFromDesktop<T extends Record<string, unknown>>(
  path: string,
): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DESKTOP_TIMEOUT_MS);

    let response: globalThis.Response;
    try {
      response = await fetch(`${DESKTOP_BASE_URL}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      logger.debug(
        { path, error: fetchError instanceof Error ? fetchError.message : String(fetchError) },
        'Desktop API fetch failed',
      );
      return null;
    }

    clearTimeout(timeout);

    if (!response.ok) {
      logger.debug({ path, status: response.status }, 'Desktop API returned non-OK status');
      return null;
    }

    // Validate response is JSON
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      logger.debug({ path, contentType }, 'Desktop API returned non-JSON content-type');
      return null;
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      logger.debug({ path }, 'Desktop API returned invalid JSON');
      return null;
    }

    // Validate response is a non-null object
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      logger.debug({ path }, 'Desktop API returned non-object JSON');
      return null;
    }

    return data as T;
  } catch (error) {
    // Expected when desktop app is not running — debug level only
    logger.debug(
      { path, error: error instanceof Error ? error.message : String(error) },
      'Desktop API unreachable',
    );
    return null;
  }
}

/**
 * Check whether the desktop app's localhost API is reachable.
 */
async function isDesktopConnected(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DESKTOP_TIMEOUT_MS);

    const response = await fetch(`${DESKTOP_BASE_URL}/config`, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Get user config preferences
 * GET /dotfile/config
 *
 * Returns model, provider, and settings from the desktop app if available,
 * otherwise returns defaults.
 */
router.get('/config', createRateLimiter('dotfile-read'), async (_req: Request, res: Response) => {
  const desktopData = await proxyFromDesktop<DotfileConfigResponse>('/config');

  if (desktopData) {
    res.json({ ...desktopData, source: 'desktop' });
    return;
  }

  res.json(DEFAULT_CONFIG);
});

/**
 * Get available MCP servers
 * GET /dotfile/mcp-servers
 */
router.get(
  '/mcp-servers',
  createRateLimiter('dotfile-read'),
  async (_req: Request, res: Response) => {
    const desktopData = await proxyFromDesktop<DotfileMcpServersResponse>('/mcp-servers');

    if (desktopData) {
      res.json({ ...desktopData, source: 'desktop' });
      return;
    }

    res.json(DEFAULT_MCP_SERVERS);
  },
);

/**
 * Get available skills list
 * GET /dotfile/skills
 */
router.get('/skills', createRateLimiter('dotfile-read'), async (_req: Request, res: Response) => {
  const desktopData = await proxyFromDesktop<DotfileSkillsResponse>('/skills');

  if (desktopData) {
    res.json({ ...desktopData, source: 'desktop' });
    return;
  }

  res.json(DEFAULT_SKILLS);
});

/**
 * Get detected ecosystem tools
 * GET /dotfile/ecosystem
 */
router.get(
  '/ecosystem',
  createRateLimiter('dotfile-read'),
  async (_req: Request, res: Response) => {
    const desktopData = await proxyFromDesktop<DotfileEcosystemResponse>('/ecosystem');

    if (desktopData) {
      res.json({ ...desktopData, source: 'desktop' });
      return;
    }

    res.json(DEFAULT_ECOSYSTEM);
  },
);

/**
 * Get dotfile bridge status
 * GET /dotfile/status
 *
 * Reports whether the desktop app is reachable and which config source is active.
 */
router.get('/status', createRateLimiter('dotfile-read'), async (_req: Request, res: Response) => {
  const connected = await isDesktopConnected();

  const status: DotfileStatusResponse = {
    desktop_connected: connected,
    config_source: connected ? 'desktop' : 'default',
    available_endpoints: AVAILABLE_ENDPOINTS,
  };

  res.json(status);
});

export { router as dotfileRouter };
