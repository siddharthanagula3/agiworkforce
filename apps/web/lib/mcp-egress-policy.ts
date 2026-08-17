import type { McpEgressPolicy } from '@agiworkforce/mcp';

import { assertResolvedPublicHostname } from './egress-policy';

export const MCP_EGRESS_POLICY: McpEgressPolicy = {
  assertAllowedUrl: (url: string) => assertResolvedPublicHostname(url),
};
