export { CODE_SESSION_IDES, lineRange, offsetAt, positionAt, rangeFromOffsets } from './session';
export type {
  CodeDiagnosticsSession,
  CodeDocument,
  CodeEditorSession,
  CodePosition,
  CodeRange,
  CodeSelection,
  CodeSession,
  CodeSessionIde,
  CodeSessionIdentity,
  CodeTerminalSession,
} from './session';

export {
  buildCodeReviewPrompt,
  CODE_DIAGNOSTIC_SEVERITIES,
  CODE_REVIEW_DIAGNOSTIC_SOURCE,
  parseCodeReview,
  parseDiagnosticSeverity,
} from './diagnostics';
export type {
  CodeDiagnostic,
  CodeDiagnosticSeverity,
  CodeReviewPrompt,
  CodeReviewResult,
} from './diagnostics';

export {
  AGGRESSIVE_FUZZY_MIN_LEN,
  describePatchMatch,
  describePatchRefusal,
  matchAggressively,
  matchPatchBlock,
  matchPatchBlockAggressive,
  parsePatchBlocks,
  patchFailureMessage,
  whitespaceDiffPercent,
} from './diff';
export type {
  PatchBlock,
  PatchConfidence,
  PatchMatch,
  PatchMatchStrategy,
  PatchOutcome,
  PatchRefusal,
} from './diff';

export {
  BINARY_SNIFF_BYTES,
  globToRegExp,
  grepLines,
  GREP_PREVIEW_LIMIT,
  isSkippedDirectory,
  joinWorkspacePath,
  looksBinary,
  matchesGlob,
  MAX_WORKSPACE_WALK_DEPTH,
  SKIPPED_WORKSPACE_DIRECTORIES,
  toPosixPath,
} from './workspace';
export type { GrepOptions, WorkspaceGrepMatch } from './workspace';

export {
  countPorcelainStatus,
  describeGitHead,
  GIT_OPERATION_PROBES,
  GIT_OPERATIONS,
  isDetachedHead,
  parseAheadBehind,
  SHORT_SHA_LENGTH,
} from './git';
export type { GitHead, GitOperation, GitStatusCounts } from './git';

export {
  CODE_DOCTOR_STATUSES,
  doctorReportIsHealthy,
  formatDoctorReport,
  parseDoctorReport,
  parseDoctorStatus,
  summarizeDoctorChecks,
} from './doctor';
export type {
  CodeDoctorCheck,
  CodeDoctorReport,
  CodeDoctorStatus,
  CodeDoctorSummary,
} from './doctor';

export {
  appendTerminalOutput,
  describeTerminalOutsideWorkspace,
  emptyTerminalCapture,
  formatTerminalCapture,
  parseSuggestedCommands,
  runSuggestedCommand,
  stripAnsiEscapes,
  stripTerminalControlSequences,
  TERMINAL_CAPTURE_MAX_CHARS,
  validateSuggestedCommand,
} from './terminal';
export type { CodeTerminalCapture } from './terminal';
