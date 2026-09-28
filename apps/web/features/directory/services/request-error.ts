import {
  PLUGIN_SCAN_REVIEW_REFUSAL,
  PluginPackageRefusalDetailsSchema,
  type PluginScanFindingSummary,
} from '@agiworkforce/cloud-contracts';
import { DirectoryScanCaution } from '@agiworkforce/ui';

import { RATE_LIMITED_COPY, RATE_LIMITED_STATUS } from '../constants';

export class DirectoryRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DirectoryRequestError';
    this.status = status;
  }
}

export function describeActionFailure(caught: unknown, fallback: string): Error {
  if (caught instanceof DirectoryRequestError && caught.status === RATE_LIMITED_STATUS) {
    return new Error(RATE_LIMITED_COPY);
  }
  return new Error(fallback);
}

function findingLine(finding: PluginScanFindingSummary): string {
  return `${finding.path}:${finding.line} ${finding.message}`;
}

export function scanCautionFrom(body: unknown, message: string): DirectoryScanCaution | null {
  const error = (body as { error?: { details?: unknown } } | null)?.error;
  const parsed = PluginPackageRefusalDetailsSchema.safeParse(error?.details);
  if (!parsed.success || parsed.data.refusal !== PLUGIN_SCAN_REVIEW_REFUSAL) return null;
  const acknowledgements = parsed.data.acknowledgements ?? [];
  if (acknowledgements.length === 0) return null;
  return new DirectoryScanCaution(
    message,
    [...new Set((parsed.data.findings ?? []).map(findingLine))],
    acknowledgements,
  );
}
