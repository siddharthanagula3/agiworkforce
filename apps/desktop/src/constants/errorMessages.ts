import type { TFunction } from 'i18next';

export interface ErrorMessageDefinition {
  title: string;
  message: string;
  suggestions: string[];
  helpLink?: string;
  recoverable: boolean;
}

interface ErrorPresentation {
  helpLink?: string;
  recoverable: boolean;
}

const UNKNOWN_ERROR = 'UNKNOWN_ERROR';

const ERROR_PRESENTATION: Readonly<Record<string, ErrorPresentation>> = {
  NETWORK_ERROR: { helpLink: '/docs/troubleshooting/network', recoverable: true },
  NETWORK_TIMEOUT: { recoverable: true },
  API_RATE_LIMIT: { recoverable: true },
  FILE_NOT_FOUND: { helpLink: '/docs/troubleshooting/filesystem', recoverable: false },
  PERMISSION_DENIED: { recoverable: true },
  DISK_FULL: { recoverable: false },
  DATABASE_LOCKED: { recoverable: true },
  DATABASE_CORRUPTED: { helpLink: '/docs/troubleshooting/database', recoverable: false },
  AUTH_FAILED: { recoverable: true },
  TOKEN_EXPIRED: { recoverable: true },
  LLM_API_ERROR: { helpLink: '/docs/troubleshooting/llm', recoverable: true },
  LLM_CONTEXT_LENGTH: { recoverable: false },
  LLM_CONTENT_FILTER: { recoverable: true },
  BROWSER_NOT_FOUND: { helpLink: '/docs/troubleshooting/browser', recoverable: false },
  BROWSER_CRASH: { recoverable: true },
  ELEMENT_NOT_FOUND: { recoverable: true },
  AUTOMATION_FAILED: { helpLink: '/docs/troubleshooting/automation', recoverable: true },
  UI_ELEMENT_TIMEOUT: { recoverable: true },
  OUT_OF_MEMORY: { recoverable: false },
  SYSTEM_ERROR: { recoverable: true },
  AGI_PLANNING_FAILED: { recoverable: true },
  AGI_EXECUTION_FAILED: { helpLink: '/docs/troubleshooting/agi', recoverable: true },
  AGI_TOOL_NOT_FOUND: { recoverable: false },
  [UNKNOWN_ERROR]: { recoverable: true },
};

export function getErrorMessage(errorType: string, t: TFunction): ErrorMessageDefinition {
  const type = Object.hasOwn(ERROR_PRESENTATION, errorType) ? errorType : UNKNOWN_ERROR;
  const suggestions: unknown = t(`errors:${type}.suggestions`, { returnObjects: true });
  return {
    title: t(`errors:${type}.title`),
    message: t(`errors:${type}.message`),
    suggestions: Array.isArray(suggestions) ? suggestions.map(String) : [],
    ...ERROR_PRESENTATION[type],
  } as ErrorMessageDefinition;
}
