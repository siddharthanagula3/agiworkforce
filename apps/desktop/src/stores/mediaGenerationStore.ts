import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { generateImage, generateVideo } from '../api/media';
import type {
  GeneratedImageResult,
  ImageGenerationPayload,
  ImageProviderId,
  VideoGenerationPayload,
  VideoGenerationResult,
} from '../types/media';

export type GenerationStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface ImageJob {
  id: string;
  prompt: string;
  provider: ImageProviderId;
  model?: string;
  status: GenerationStatus;
  createdAt: number;
  costEstimate?: number;
  latencyMs?: number;
  images: GeneratedImageResult[];
  error?: string;
}

export interface VideoJob {
  id: string;
  prompt: string;
  model?: string;
  status: GenerationStatus;
  provider: string;
  createdAt: number;
  durationSecs?: number;
  costEstimate?: number;
  latencyMs?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

interface MediaGenerationState {
  imageJobs: ImageJob[];
  videoJobs: VideoJob[];
  loadingImage: boolean;
  loadingVideo: boolean;
  error?: string;
  generateImage: (payload: ImageGenerationPayload) => Promise<ImageJob | null>;
  generateVideo: (payload: VideoGenerationPayload) => Promise<VideoJob | null>;
  clearError: () => void;
  reset: () => void;
}

export const useMediaGenerationStore = create<MediaGenerationState>()(
  devtools((set, _get) => ({
    imageJobs: [],
    videoJobs: [],
    loadingImage: false,
    loadingVideo: false,
    error: undefined,

    clearError: () => set({ error: undefined }),

    reset: () =>
      set({
        imageJobs: [],
        videoJobs: [],
        loadingImage: false,
        loadingVideo: false,
        error: undefined,
      }),

    generateImage: async (payload) => {
      const jobId = crypto.randomUUID();
      const startedAt = Date.now();

      set((state) => ({
        loadingImage: true,
        error: undefined,
        imageJobs: [
          {
            id: jobId,
            prompt: payload.prompt,
            provider: payload.provider,
            model: payload.model,
            status: 'running',
            createdAt: startedAt,
            images: [],
          },
          ...state.imageJobs,
        ],
      }));

      try {
        const results = await generateImage(payload);
        const costEstimate = results[0]?.costEstimate;
        const latencyMs = results[0]?.latencyMs;

        const job: ImageJob = {
          id: jobId,
          prompt: payload.prompt,
          provider: payload.provider,
          model: payload.model,
          status: 'completed',
          createdAt: startedAt,
          costEstimate,
          latencyMs,
          images: results,
        };

        set((state) => ({
          loadingImage: false,
          imageJobs: state.imageJobs.map((j) => (j.id === jobId ? job : j)),
        }));
        return job;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate image';
        set((state) => ({
          loadingImage: false,
          error: message,
          imageJobs: state.imageJobs.map((j) =>
            j.id === jobId ? { ...j, status: 'failed', error: message } : j,
          ),
        }));
        return null;
      }
    },

    generateVideo: async (payload) => {
      const jobId = crypto.randomUUID();
      const startedAt = Date.now();

      set((state) => ({
        loadingVideo: true,
        error: undefined,
        videoJobs: [
          {
            id: jobId,
            prompt: payload.prompt,
            provider: 'veo-3.1',
            model: payload.model,
            status: 'running',
            createdAt: startedAt,
            durationSecs: payload.durationSecs,
          },
          ...state.videoJobs,
        ],
      }));

      try {
        const response: VideoGenerationResult = await generateVideo(payload);
        const job: VideoJob = {
          id: jobId,
          prompt: payload.prompt,
          provider: response.provider,
          model: response.model,
          status: response.status === 'completed' ? 'completed' : 'running',
          createdAt: startedAt,
          durationSecs: response.durationSecs,
          costEstimate: response.costEstimate,
          latencyMs: response.latencyMs,
          videoUrl: response.videoUrl,
          thumbnailUrl: response.thumbnailUrl,
        };

        set((state) => ({
          loadingVideo: false,
          videoJobs: state.videoJobs.map((j) => (j.id === jobId ? job : j)),
        }));

        return job;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate video';
        set((state) => ({
          loadingVideo: false,
          error: message,
          videoJobs: state.videoJobs.map((j) =>
            j.id === jobId ? { ...j, status: 'failed', error: message } : j,
          ),
        }));
        return null;
      }
    },
  })),
);
