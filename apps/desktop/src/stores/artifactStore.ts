/**
 * Artifact Store
 *
 * Manages artifact state for the live previews panel. Provides CRUD operations,
 * version management, and real-time streaming support.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { applyDiff } from '@/lib/diffUtils';

// =============================================================================
// Types
// =============================================================================

export type ArtifactType =
  | 'code'
  | 'document'
  | 'spreadsheet'
  | 'diagram'
  | 'web'
  | 'chart'
  | 'presentation'
  | 'image';

export type ArtifactStatus = 'streaming' | 'complete' | 'failed' | 'archived';

export interface CodeMetadata {
  language: string;
  file_path?: string;
  highlight_lines?: number[];
  executable: boolean;
}

export interface DocumentMetadata {
  format: string;
  toc?: TocEntry[];
  word_count?: number;
}

export interface TocEntry {
  level: number;
  title: string;
  anchor: string;
}

export interface SpreadsheetMetadata {
  columns: string[];
  row_count: number;
  column_types?: Record<string, string>;
  formulas?: Record<string, string>;
}

export interface DiagramMetadata {
  diagram_type: string;
  theme?: string;
}

export interface WebMetadata {
  enable_scripts: boolean;
  external_resources: string[];
  viewport?: [number, number];
}

export interface ChartMetadata {
  chart_type: string;
  x_label?: string;
  y_label?: string;
  show_legend: boolean;
}

export type ArtifactMetadata =
  | { Code: CodeMetadata }
  | { Document: DocumentMetadata }
  | { Spreadsheet: SpreadsheetMetadata }
  | { Diagram: DiagramMetadata }
  | { Web: WebMetadata }
  | { Chart: ChartMetadata }
  | { Generic: Record<string, unknown> };

export interface ArtifactVersion {
  version: number;
  content: string;
  created_at: string;
  change_description?: string;
  size_bytes: number;
  content_hash: string;
}

export interface Artifact {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  content: string;
  metadata: ArtifactMetadata;
  conversation_id?: number;
  message_id?: number;
  status: ArtifactStatus;
  versions: ArtifactVersion[];
  current_version: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  pinned: boolean;
}

export interface ArtifactSummary {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  status: ArtifactStatus;
  current_version: number;
  version_count: number;
  created_at: string;
  updated_at: string;
  size_bytes: number;
  tags: string[];
  pinned: boolean;
  conversation_id?: number;
}

export interface VersionDiff {
  from_version: number;
  to_version: number;
  from_content: string;
  to_content: string;
  from_timestamp: string;
  to_timestamp: string;
}

export interface ArtifactStoreStats {
  total_artifacts: number;
  total_versions: number;
  total_size_bytes: number;
  by_type: Record<ArtifactType, number>;
  by_status: Record<ArtifactStatus, number>;
}

// Rendered artifact types
export type ArtifactAction =
  | 'copy'
  | 'download'
  | 'edit'
  | 'delete'
  | 'pin'
  | 'share'
  | 'export_pdf'
  | 'export_word'
  | 'export_excel'
  | 'export_svg'
  | 'export_png'
  | 'copy_markdown'
  | 'run'
  | 'apply_to_file';

export interface RenderedArtifact {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  rendered_content: RenderedContent;
  version_info: VersionInfo;
  status: ArtifactStatus;
  available_actions: ArtifactAction[];
}

export interface VersionInfo {
  current: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export type RenderedContent =
  | { type: 'Code'; data: CodeRenderData }
  | { type: 'Document'; data: DocumentRenderData }
  | { type: 'Spreadsheet'; data: SpreadsheetRenderData }
  | { type: 'Diagram'; data: DiagramRenderData }
  | { type: 'Web'; data: WebRenderData }
  | { type: 'Chart'; data: ChartRenderData }
  | { type: 'Presentation'; data: PresentationRenderData }
  | { type: 'Image'; data: ImageRenderData };

export interface CodeRenderData {
  source: string;
  language: string;
  highlight_lines: number[];
  executable: boolean;
  line_count: number;
  file_extension: string;
}

export interface DocumentRenderData {
  source: string;
  format: string;
  toc: TocEntry[];
  word_count: number;
  char_count: number;
}

export interface SpreadsheetRenderData {
  rows: Record<string, unknown>[];
  columns: ColumnInfo[];
  row_count: number;
  editable: boolean;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  width?: number;
}

export interface DiagramRenderData {
  source: string;
  diagram_type: string;
  theme: string;
}

export interface WebRenderData {
  html: string;
  scripts_enabled: boolean;
  sandbox_permissions: string[];
  viewport?: [number, number];
}

export interface ChartRenderData {
  chart_type: string;
  data: Record<string, unknown>[];
  x_axis?: { label?: string; data_key: string };
  y_axis?: { label?: string; data_key: string };
  series: { data_key: string; name?: string; color?: string }[];
  show_legend: boolean;
  colors: string[];
}

export interface PresentationRenderData {
  slides: SlideData[];
  slide_count: number;
  current_slide: number;
}

export interface SlideData {
  index: number;
  title?: string;
  content: string;
  notes?: string;
}

export interface ImageRenderData {
  source: string;
  format: string;
  width?: number;
  height?: number;
  alt_text?: string;
}

// API Response wrapper
interface ArtifactResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// Diff Types
// =============================================================================

export interface ArtifactDiff {
  hunks: Array<{
    startLine: number;
    endLine: number;
    originalContent: string;
    newContent: string;
  }>;
  changeDescription?: string;
}

// =============================================================================
// Store State
// =============================================================================

interface ArtifactStoreState {
  // Artifacts cache
  artifacts: Map<string, Artifact>;
  summaries: ArtifactSummary[];

  // Active artifact for panel
  activeArtifactId: string | null;
  selectedVersion: number | null;

  // Panel state
  panelOpen: boolean;
  panelWidth: number;

  // Loading states
  isLoading: boolean;
  isStreaming: string | null; // ID of currently streaming artifact

  // Actions
  createArtifact: (
    title: string,
    artifactType: ArtifactType,
    content: string,
    metadata?: ArtifactMetadata,
    conversationId?: number,
    messageId?: number,
    tags?: string[],
  ) => Promise<Artifact | null>;

  createStreamingArtifact: (
    title: string,
    artifactType: ArtifactType,
    metadata?: ArtifactMetadata,
    conversationId?: number,
    messageId?: number,
  ) => Promise<Artifact | null>;

  appendStreamingContent: (id: string, delta: string) => Promise<void>;
  finalizeStreamingArtifact: (id: string, changeDescription?: string) => Promise<Artifact | null>;

  getArtifact: (id: string) => Promise<Artifact | null>;
  getRenderedArtifact: (id: string) => Promise<RenderedArtifact | null>;

  updateArtifact: (
    id: string,
    content: string,
    changeDescription?: string,
    title?: string,
    metadata?: ArtifactMetadata,
    tags?: string[],
  ) => Promise<Artifact | null>;

  applyDiffToArtifact: (id: string, diff: ArtifactDiff) => Promise<Artifact | null>;

  rollbackArtifact: (id: string, version: number) => Promise<Artifact | null>;
  deleteArtifact: (id: string) => Promise<boolean>;
  archiveArtifact: (id: string) => Promise<boolean>;
  unarchiveArtifact: (id: string) => Promise<boolean>;
  pinArtifact: (id: string, pinned: boolean) => Promise<boolean>;
  addTags: (id: string, tags: string[]) => Promise<boolean>;
  removeTags: (id: string, tags: string[]) => Promise<boolean>;

  listArtifacts: (filter?: {
    artifactTypes?: ArtifactType[];
    statuses?: ArtifactStatus[];
    tags?: string[];
    conversationId?: number;
    searchQuery?: string;
    pinnedOnly?: boolean;
    limit?: number;
    offset?: number;
  }) => Promise<ArtifactSummary[]>;

  getArtifactsByConversation: (conversationId: number) => Promise<ArtifactSummary[]>;
  getVersionHistory: (id: string) => Promise<ArtifactVersion[] | null>;
  getVersionDiff: (
    id: string,
    fromVersion: number,
    toVersion: number,
  ) => Promise<VersionDiff | null>;
  getStats: () => Promise<ArtifactStoreStats | null>;

  // Panel actions
  setActiveArtifact: (id: string | null) => void;
  setSelectedVersion: (version: number | null) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelWidth: (width: number) => void;

  // Bulk operations (previously unwired)
  clearAllArtifacts: () => Promise<boolean>;
  exportAllArtifacts: () => Promise<string | null>;
  importAllArtifacts: (exportData: string) => Promise<boolean>;

  // Utility
  clearCache: () => void;
  resetOnLogout: () => void;
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useArtifactStore = create<ArtifactStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        artifacts: new Map(),
        summaries: [],
        activeArtifactId: null,
        selectedVersion: null,
        panelOpen: false,
        panelWidth: 480,
        isLoading: false,
        isStreaming: null,

        // Create a new artifact
        createArtifact: async (
          title,
          artifactType,
          content,
          metadata,
          conversationId,
          messageId,
          tags,
        ) => {
          set({ isLoading: true });
          try {
            const response = await invoke<ArtifactResponse<Artifact>>('artifact_create', {
              title,
              artifact_type: artifactType,
              content,
              metadata,
              conversation_id: conversationId,
              message_id: messageId,
              tags,
            });

            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isLoading: false };
              });
              return artifact;
            }
            console.error('Failed to create artifact:', response.error);
            return null;
          } catch (error) {
            console.error('Error creating artifact:', error);
            return null;
          } finally {
            set({ isLoading: false });
          }
        },

        // Create a streaming artifact
        createStreamingArtifact: async (
          title,
          artifactType,
          metadata,
          conversationId,
          messageId,
        ) => {
          try {
            const response = await invoke<ArtifactResponse<Artifact>>('artifact_create_streaming', {
              title,
              artifact_type: artifactType,
              metadata,
              conversation_id: conversationId,
              message_id: messageId,
            });

            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isStreaming: artifact.id };
              });
              return artifact;
            }
            return null;
          } catch (error) {
            console.error('Error creating streaming artifact:', error);
            return null;
          }
        },

        // Append content to streaming artifact
        appendStreamingContent: async (id, delta) => {
          try {
            await invoke<ArtifactResponse<void>>('artifact_append_streaming', { id, delta });

            // Update local cache
            set((state) => {
              const artifact = state.artifacts.get(id);
              if (artifact) {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(id, {
                  ...artifact,
                  content: artifact.content + delta,
                });
                return { artifacts: newArtifacts };
              }
              return state;
            });
          } catch (error) {
            console.error('Error appending streaming content:', error);
          }
        },

        // Finalize streaming artifact
        finalizeStreamingArtifact: async (id, changeDescription) => {
          try {
            const response = await invoke<ArtifactResponse<Artifact>>(
              'artifact_finalize_streaming',
              {
                id,
                change_description: changeDescription,
              },
            );

            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isStreaming: null };
              });
              return artifact;
            }
            return null;
          } catch (error) {
            console.error('Error finalizing streaming artifact:', error);
            set({ isStreaming: null });
            return null;
          }
        },

        // Get artifact by ID
        getArtifact: async (id) => {
          // Check cache first
          const cached = get().artifacts.get(id);
          if (cached) return cached;

          try {
            const response = await invoke<ArtifactResponse<Artifact>>('artifact_get', { id });
            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts };
              });
              return artifact;
            }
            return null;
          } catch (error) {
            console.error('Error getting artifact:', error);
            return null;
          }
        },

        // Get rendered artifact
        getRenderedArtifact: async (id) => {
          try {
            const response = await invoke<ArtifactResponse<RenderedArtifact>>(
              'artifact_get_rendered',
              {
                id,
              },
            );
            return response.success ? (response.data ?? null) : null;
          } catch (error) {
            console.error('Error getting rendered artifact:', error);
            return null;
          }
        },

        // Update artifact
        updateArtifact: async (id, content, changeDescription, title, metadata, tags) => {
          set({ isLoading: true });
          try {
            const response = await invoke<ArtifactResponse<Artifact>>('artifact_update', {
              id,
              content,
              change_description: changeDescription,
              title,
              metadata,
              tags,
            });

            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isLoading: false };
              });
              return artifact;
            }
            return null;
          } catch (error) {
            console.error('Error updating artifact:', error);
            return null;
          } finally {
            set({ isLoading: false });
          }
        },

        // Apply a targeted diff to an artifact (avoids full content replacement)
        applyDiffToArtifact: async (id, diff) => {
          set({ isLoading: true });
          try {
            // Attempt the dedicated Tauri command first
            const response = await invoke<ArtifactResponse<Artifact>>('artifact_apply_diff', {
              id,
              hunks: diff.hunks.map((h) => ({
                start_line: h.startLine,
                end_line: h.endLine,
                original_content: h.originalContent,
                new_content: h.newContent,
              })),
              change_description: diff.changeDescription,
            });

            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isLoading: false };
              });
              return artifact;
            }

            // artifact_apply_diff returned a non-success — fall through to local fallback
          } catch {
            // Command not yet registered — apply the diff locally and call artifact_update
          }

          // Fallback: compute new content locally and call the existing update path
          const cached = get().artifacts.get(id);
          if (!cached) {
            set({ isLoading: false });
            return null;
          }

          const newContent = applyDiff(cached.content, diff);
          return get().updateArtifact(id, newContent, diff.changeDescription);
        },

        // Rollback artifact to version
        rollbackArtifact: async (id, version) => {
          set({ isLoading: true });
          try {
            const response = await invoke<ArtifactResponse<Artifact>>('artifact_rollback', {
              id,
              version,
            });

            if (response.success && response.data) {
              const artifact = response.data;
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isLoading: false };
              });
              return artifact;
            }
            return null;
          } catch (error) {
            console.error('Error rolling back artifact:', error);
            return null;
          } finally {
            set({ isLoading: false });
          }
        },

        // Delete artifact
        deleteArtifact: async (id) => {
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_delete', { id });
            if (response.success) {
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.delete(id);
                return {
                  artifacts: newArtifacts,
                  activeArtifactId: state.activeArtifactId === id ? null : state.activeArtifactId,
                };
              });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error deleting artifact:', error);
            return false;
          }
        },

        // Archive artifact
        archiveArtifact: async (id) => {
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_archive', { id });
            if (response.success) {
              set((state) => {
                const artifact = state.artifacts.get(id);
                if (artifact) {
                  const newArtifacts = new Map(state.artifacts);
                  newArtifacts.set(id, { ...artifact, status: 'archived' as ArtifactStatus });
                  return { artifacts: newArtifacts };
                }
                return state;
              });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error archiving artifact:', error);
            return false;
          }
        },

        // Unarchive artifact
        unarchiveArtifact: async (id) => {
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_unarchive', { id });
            if (response.success) {
              set((state) => {
                const artifact = state.artifacts.get(id);
                if (artifact) {
                  const newArtifacts = new Map(state.artifacts);
                  newArtifacts.set(id, { ...artifact, status: 'complete' as ArtifactStatus });
                  return { artifacts: newArtifacts };
                }
                return state;
              });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error unarchiving artifact:', error);
            return false;
          }
        },

        // Pin artifact
        pinArtifact: async (id, pinned) => {
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_pin', { id, pinned });
            if (response.success) {
              set((state) => {
                const artifact = state.artifacts.get(id);
                if (artifact) {
                  const newArtifacts = new Map(state.artifacts);
                  newArtifacts.set(id, { ...artifact, pinned });
                  return { artifacts: newArtifacts };
                }
                return state;
              });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error pinning artifact:', error);
            return false;
          }
        },

        // Add tags
        addTags: async (id, tags) => {
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_add_tags', {
              id,
              tags,
            });
            if (response.success) {
              await get().getArtifact(id); // Refresh from server
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error adding tags:', error);
            return false;
          }
        },

        // Remove tags
        removeTags: async (id, tags) => {
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_remove_tags', {
              id,
              tags,
            });
            if (response.success) {
              await get().getArtifact(id); // Refresh from server
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error removing tags:', error);
            return false;
          }
        },

        // List artifacts
        listArtifacts: async (filter) => {
          set({ isLoading: true });
          try {
            const response = await invoke<ArtifactResponse<ArtifactSummary[]>>('artifact_list', {
              artifact_types: filter?.artifactTypes,
              statuses: filter?.statuses,
              tags: filter?.tags,
              conversation_id: filter?.conversationId,
              search_query: filter?.searchQuery,
              pinned_only: filter?.pinnedOnly,
              limit: filter?.limit,
              offset: filter?.offset,
            });

            if (response.success && response.data) {
              set({ summaries: response.data, isLoading: false });
              return response.data;
            }
            return [];
          } catch (error) {
            console.error('Error listing artifacts:', error);
            return [];
          } finally {
            set({ isLoading: false });
          }
        },

        // Get artifacts by conversation
        getArtifactsByConversation: async (conversationId) => {
          try {
            const response = await invoke<ArtifactResponse<ArtifactSummary[]>>(
              'artifact_get_by_conversation',
              { conversation_id: conversationId },
            );
            return response.success && response.data ? response.data : [];
          } catch (error) {
            console.error('Error getting artifacts by conversation:', error);
            return [];
          }
        },

        // Get version history
        getVersionHistory: async (id) => {
          try {
            const response = await invoke<ArtifactResponse<ArtifactVersion[]>>(
              'artifact_get_versions',
              {
                id,
              },
            );
            return response.success ? (response.data ?? null) : null;
          } catch (error) {
            console.error('Error getting version history:', error);
            return null;
          }
        },

        // Get version diff
        getVersionDiff: async (id, fromVersion, toVersion) => {
          try {
            const response = await invoke<ArtifactResponse<VersionDiff>>('artifact_get_diff', {
              id,
              from_version: fromVersion,
              to_version: toVersion,
            });
            return response.success ? (response.data ?? null) : null;
          } catch (error) {
            console.error('Error getting version diff:', error);
            return null;
          }
        },

        // Get stats
        getStats: async () => {
          try {
            const response =
              await invoke<ArtifactResponse<ArtifactStoreStats>>('artifact_get_stats');
            return response.success ? (response.data ?? null) : null;
          } catch (error) {
            console.error('Error getting stats:', error);
            return null;
          }
        },

        // Panel actions
        setActiveArtifact: (id) => set({ activeArtifactId: id, selectedVersion: null }),
        setSelectedVersion: (version) => set({ selectedVersion: version }),
        openPanel: () => set({ panelOpen: true }),
        closePanel: () => set({ panelOpen: false }),
        togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
        setPanelWidth: (width) => set({ panelWidth: width }),

        // Bulk operations
        clearAllArtifacts: async () => {
          set({ isLoading: true });
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_clear_all');
            if (response.success) {
              set({ artifacts: new Map(), summaries: [], isLoading: false });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error clearing all artifacts:', error);
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        exportAllArtifacts: async () => {
          try {
            const response = await invoke<ArtifactResponse<string>>('artifact_export_all');
            return response.success ? (response.data ?? null) : null;
          } catch (error) {
            console.error('Error exporting artifacts:', error);
            return null;
          }
        },

        importAllArtifacts: async (exportData) => {
          set({ isLoading: true });
          try {
            const response = await invoke<ArtifactResponse<void>>('artifact_import_all', {
              exportData,
            });
            if (response.success) {
              // Refresh the list after import
              const refreshResponse = await invoke<ArtifactResponse<ArtifactSummary[]>>(
                'artifact_list',
                {},
              );
              if (refreshResponse.success && refreshResponse.data) {
                set({ summaries: refreshResponse.data, isLoading: false });
              }
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error importing artifacts:', error);
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        // Utility
        clearCache: () => set({ artifacts: new Map(), summaries: [] }),
        resetOnLogout: () =>
          set({
            artifacts: new Map(),
            summaries: [],
            activeArtifactId: null,
            selectedVersion: null,
            panelOpen: false,
            isLoading: false,
            isStreaming: null,
          }),
      }),
      {
        name: 'artifact-store',
        version: 1,
        // IMPORTANT: `artifacts: Map<string, Artifact>` must stay excluded from
        // partialize. JSON.stringify serializes Maps as `{}`, so including it would
        // silently break persistence. If you ever need to persist artifacts, add a
        // custom `storage` option with Map-aware replacer/reviver functions.
        partialize: (state) => ({
          panelWidth: state.panelWidth,
        }),
      },
    ),
    { name: 'ArtifactStore', enabled: import.meta.env.DEV },
  ),
);
