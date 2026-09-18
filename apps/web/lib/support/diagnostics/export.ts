import { describeDiagnostics, type SupportDiagnostics } from './types';

/**
 * Every surface posts its raw bundle here and gets back the redacted one. The
 * server is the only redactor, so a surface can never ship a file this code
 * has not cleaned.
 */
export const DIAGNOSTICS_EXPORT_PATH = '/api/support/diagnostics';

export interface DiagnosticsExport {
  diagnostics: SupportDiagnostics;
  summary: string;
  filename: string;
}

export function diagnosticsExportFilename(diagnostics: SupportDiagnostics): string {
  const stamp = diagnostics.collectedAt.replace(/[^0-9A-Za-z]/gu, '-');
  return `agi-diagnostics-${diagnostics.surface}-${stamp}.json`;
}

export function buildDiagnosticsExport(diagnostics: SupportDiagnostics): DiagnosticsExport {
  return {
    diagnostics,
    summary: describeDiagnostics(diagnostics),
    filename: diagnosticsExportFilename(diagnostics),
  };
}
