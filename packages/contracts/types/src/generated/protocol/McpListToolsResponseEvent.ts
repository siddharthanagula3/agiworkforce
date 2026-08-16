import type { McpAuthStatus } from './McpAuthStatus';
import type { Resource } from './Resource';
import type { ResourceTemplate } from './ResourceTemplate';
import type { Tool } from './Tool';

export type McpListToolsResponseEvent = {
  tools: { [key in string]?: Tool };
  resources: { [key in string]?: Array<Resource> };
  resource_templates: { [key in string]?: Array<ResourceTemplate> };
  auth_statuses: { [key in string]?: McpAuthStatus };
};
