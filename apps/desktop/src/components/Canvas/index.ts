/**
 * Canvas Component Exports
 *
 * This module provides canvas/whiteboard and code execution workspace functionality.
 */

// Drawing canvas (existing)
export {
  CanvasWorkspace,
  type CanvasElement,
  type CanvasToolType,
  type Point,
} from './CanvasWorkspace';
export { default } from './CanvasWorkspace';

// Code execution workspace (new)
export { CodeEditor } from './CodeEditor';
export { ArtifactPreview } from './ArtifactPreview';
export { ArtifactList } from './ArtifactList';
export { CanvasPanel } from './CanvasPanel';
export { CanvasContainer } from './CanvasContainer';
