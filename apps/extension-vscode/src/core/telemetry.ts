import { redactWithPolicy } from '@agiworkforce/utils/secret-redaction';

export function redactTelemetryText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  return redactWithPolicy(input, 'telemetry');
}
