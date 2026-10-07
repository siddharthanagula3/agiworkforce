import {
  ApprovalScenePreview,
  ArtifactScenePreview,
  ComposerScenePreview,
  ConsoleScenePreview,
  MemoryScenePreview,
  ProjectScenePreview,
  ResearchScenePreview,
  type ConsoleSceneView,
} from './app-preview/ScenePreviews';
import { AgentRunScenePreview } from './app-preview/WorkScenePreviews';

export function AgentRunWindow() {
  return <ApprovalScenePreview />;
}

export function AgiWorkRunWindow() {
  return <AgentRunScenePreview />;
}

export function ArtifactsWindow() {
  return <ArtifactScenePreview />;
}

export function ResearchWindow() {
  return <ResearchScenePreview />;
}

export function MemoryWindow() {
  return <MemoryScenePreview />;
}

export function ProjectWindow() {
  return <ProjectScenePreview />;
}

export function ConsoleWindow({ view = 'members' }: { view?: ConsoleSceneView }) {
  return <ConsoleScenePreview view={view} />;
}

export function ComposerWindow() {
  return <ComposerScenePreview />;
}
