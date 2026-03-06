/**
 * Research Module
 *
 * Provides comprehensive research functionality with multi-source
 * investigation capabilities, progress tracking, and report generation.
 */

export { ResearchPanel, default } from './ResearchPanel';
export type {
  ResearchPanelProps,
  ResearchState,
  ResearchMode,
  ResearchModeId,
  ResearchSource,
  ResearchFinding,
  ResearchProgress,
  ResearchResponse,
} from './ResearchPanel';

export { ResearchHistory } from './ResearchHistory';
export type { ResearchHistoryProps } from './ResearchHistory';

export { SourceCard } from './SourceCard';
export type { SourceCardProps, SourceData, SourceStatus, SourceType } from './SourceCard';

export { ResearchProgressPanel } from './ResearchProgressPanel';
export type {
  ResearchProgressPanelProps,
  ResearchSource as ResearchSourceShape,
} from './ResearchProgressPanel';

export { ResearchSourceCard } from './ResearchSourceCard';
export type { ResearchSourceCardProps } from './ResearchSourceCard';

export { ResearchReport, ResearchReportExternalLink } from './ResearchReport';
export type { ResearchReportProps } from './ResearchReport';
