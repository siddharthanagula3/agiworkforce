/**
 * Research Module
 *
 * The mounted Deep Research surface (`DeepResearchPage`) plus the two
 * components it composes.
 *
 * Cut 2026-08-06 (see docs/adr/wire-or-cut.md): `ResearchPanel` was a legacy
 * pre-store fork that declared its own parallel type set, called
 * `invoke('research_start')` directly instead of going through
 * `stores/researchStore`, and shadowed `ResearchReport`'s name. `SourceCard`,
 * `ResearchProgressPanel`, and `ResearchSourceCard` were unfeedable: the
 * backend emits `research:source_added` / `research:finding_added` only when
 * `request.task_id` is set, and the standalone page never sets it.
 */

export { DeepResearchPage } from './DeepResearchPage';
export { ResearchProgress } from './ResearchProgress';
export { ResearchHistory } from './ResearchHistory';
export type { ResearchHistoryProps } from './ResearchHistory';
export { ResearchReport, ResearchReportExternalLink } from './ResearchReport';
export type { ResearchReportProps } from './ResearchReport';
