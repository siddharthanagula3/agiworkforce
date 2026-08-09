/**
 * Editing Components
 *
 * Presentational pieces for reviewing and applying code changes against the
 * pending-change state in `@/stores/editingStore`.
 *
 * Components exported here:
 * - EnhancedDiffViewer: Monaco-based diff viewer with per-hunk accept/reject
 * - FileTreeWithChanges: File tree with change indicators (M, +, -)
 * - ChangeSummary: Statistics and summary of pending changes
 * - ConflictResolver: UI for resolving merge conflicts
 *
 * There is no `VisualEditor` shell and no `LivePreview` in this module; both
 * were removed and nothing composes the four components above into a screen
 * yet, so none of them currently render in the shipped app. Wire them into a
 * route or panel before describing this module as a working surface.
 *
 * Usage:
 * ```tsx
 * import { EnhancedDiffViewer } from './features/editing';
 * import { useEditingStore } from './stores/editingStore';
 *
 * function MyComponent() {
 *   const { addPendingChange, generateDiff } = useEditingStore();
 *
 *   // Generate a diff
 *   const diff = await generateDiff(
 *     '/path/to/file.ts',
 *     originalContent,
 *     modifiedContent
 *   );
 *   addPendingChange(diff);
 *
 *   return <EnhancedDiffViewer />;
 * }
 * ```
 */

export { EnhancedDiffViewer } from './EnhancedDiffViewer';
export { FileTreeWithChanges } from './FileTreeWithChanges';
export { ChangeSummary } from './ChangeSummary';
export { ConflictResolver } from './ConflictResolver';
