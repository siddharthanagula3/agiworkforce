/**
 * Visual Editing Components
 *
 * This module provides a comprehensive visual editing interface for reviewing and applying
 * code changes with Cursor Composer-style diff preview.
 *
 * Components:
 * - VisualEditor: Main wrapper component that brings everything together
 * - EnhancedDiffViewer: Monaco-based diff viewer with per-hunk accept/reject
 * - FileTreeWithChanges: File tree with change indicators (M, +, -)
 * - ChangeSummary: Statistics and summary of pending changes
 * - LivePreview: Live preview for supported file types (Markdown, HTML, JSON, etc.)
 * - ConflictResolver: UI for resolving merge conflicts
 *
 * Usage:
 * ```tsx
 * import { VisualEditor } from './components/editing';
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
 *   return <VisualEditor rootPath="/path/to/project" />;
 * }
 * ```
 */

export { VisualEditor } from './VisualEditor';
export { EnhancedDiffViewer } from './EnhancedDiffViewer';
export { FileTreeWithChanges } from './FileTreeWithChanges';
export { ChangeSummary } from './ChangeSummary';
export { LivePreview } from './LivePreview';
export { ConflictResolver } from './ConflictResolver';
