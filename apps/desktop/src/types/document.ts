import type { ArtifactManifest, ComputeSession, GeneratedFile } from '@agiworkforce/types';

export interface DocumentCreationResult {
  path: string;
  file_path: string;
  filePath: string;
  format: 'pdf' | 'docx' | 'xlsx' | 'pptx';
  status: 'created';
  success: boolean;
  computeSession: ComputeSession;
  generatedFile: GeneratedFile;
  artifactManifest: ArtifactManifest;
}
