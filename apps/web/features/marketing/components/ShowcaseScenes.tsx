import { ApprovalScenePreview } from './app-preview/ScenePreviews';
import { DiffScenePreview } from './app-preview/WorkScenePreviews';

export function DiffWindow() {
  return <DiffScenePreview />;
}

export function ApprovalWindow() {
  return <ApprovalScenePreview />;
}
