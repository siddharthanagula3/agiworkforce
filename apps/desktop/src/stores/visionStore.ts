/**
 * Vision Store
 *
 * Provides frontend wiring for the vision Tauri commands:
 * - vision_send_message        — generic vision LLM request with one or more images
 * - vision_analyze_screenshot  — describe a stored capture by ID
 * - vision_extract_text        — OCR-style text extraction from an image path
 * - vision_compare_images      — compare two images and describe differences
 * - vision_answer_question     — answer a question about an image
 * - vision_describe_ui_elements — structured UI element description from a capture
 * - vision_locate_element      — find bounding box of a named element in a capture
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types (mirror Rust structs in sys/commands/vision.rs)
// =============================================================================

export interface VisionImage {
  /** "path" | "base64" | "capture_id" */
  source_type: 'path' | 'base64' | 'capture_id';
  source: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface VisionRequest {
  prompt: string;
  images: VisionImage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  detail_level?: 'low' | 'high' | 'auto';
}

export interface VisionResponse {
  content: string;
  model: string;
  tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  processing_time_ms: number;
}

export interface ImageComparisonResult {
  similarity_score: number;
  differences_description: string;
  visual_diff_highlighted?: string;
  model: string;
  cost?: number;
}

export interface VisualElementLocation {
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export type ComparisonType = 'visual_diff' | 'similarity' | 'changes';

// =============================================================================
// Store State
// =============================================================================

interface VisionStoreState {
  isLoading: boolean;
  lastResponse: VisionResponse | null;
  lastComparison: ImageComparisonResult | null;
  lastLocation: VisualElementLocation | null;
  error: string | null;

  // Actions
  sendVisionMessage: (request: VisionRequest) => Promise<VisionResponse | null>;
  analyzeScreenshot: (
    captureId: string,
    prompt?: string,
    provider?: string,
    model?: string,
  ) => Promise<VisionResponse | null>;
  extractText: (imagePath: string, provider?: string) => Promise<VisionResponse | null>;
  compareImages: (
    imagePath1: string,
    imagePath2: string,
    comparisonType?: ComparisonType,
    provider?: string,
  ) => Promise<ImageComparisonResult | null>;
  answerQuestion: (
    imagePath: string,
    question: string,
    provider?: string,
    model?: string,
  ) => Promise<VisionResponse | null>;
  describeUiElements: (captureId: string, provider?: string) => Promise<VisionResponse | null>;
  locateElement: (
    captureId: string,
    elementDescription: string,
    provider?: string,
  ) => Promise<VisualElementLocation | null>;
  clearError: () => void;
  reset: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useVisionStore = create<VisionStoreState>()(
  devtools(
    immer((set) => ({
      isLoading: false,
      lastResponse: null,
      lastComparison: null,
      lastLocation: null,
      error: null,

      sendVisionMessage: async (request) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/sendMessage/start',
        );
        try {
          const response = await invoke<VisionResponse>('vision_send_message', { request });
          set(
            (state) => {
              state.lastResponse = response;
              state.isLoading = false;
            },
            undefined,
            'vision/sendMessage/done',
          );
          return response;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/sendMessage/error',
          );
          return null;
        }
      },

      analyzeScreenshot: async (captureId, prompt, provider, model) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/analyzeScreenshot/start',
        );
        try {
          const response = await invoke<VisionResponse>('vision_analyze_screenshot', {
            captureId,
            prompt,
            provider,
            model,
          });
          set(
            (state) => {
              state.lastResponse = response;
              state.isLoading = false;
            },
            undefined,
            'vision/analyzeScreenshot/done',
          );
          return response;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/analyzeScreenshot/error',
          );
          return null;
        }
      },

      extractText: async (imagePath, provider) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/extractText/start',
        );
        try {
          const response = await invoke<VisionResponse>('vision_extract_text', {
            imagePath,
            provider,
          });
          set(
            (state) => {
              state.lastResponse = response;
              state.isLoading = false;
            },
            undefined,
            'vision/extractText/done',
          );
          return response;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/extractText/error',
          );
          return null;
        }
      },

      compareImages: async (imagePath1, imagePath2, comparisonType, provider) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/compareImages/start',
        );
        try {
          const result = await invoke<ImageComparisonResult>('vision_compare_images', {
            imagePath1,
            imagePath2,
            comparisonType,
            provider,
          });
          set(
            (state) => {
              state.lastComparison = result;
              state.isLoading = false;
            },
            undefined,
            'vision/compareImages/done',
          );
          return result;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/compareImages/error',
          );
          return null;
        }
      },

      answerQuestion: async (imagePath, question, provider, model) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/answerQuestion/start',
        );
        try {
          const response = await invoke<VisionResponse>('vision_answer_question', {
            imagePath,
            question,
            provider,
            model,
          });
          set(
            (state) => {
              state.lastResponse = response;
              state.isLoading = false;
            },
            undefined,
            'vision/answerQuestion/done',
          );
          return response;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/answerQuestion/error',
          );
          return null;
        }
      },

      describeUiElements: async (captureId, provider) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/describeUiElements/start',
        );
        try {
          const response = await invoke<VisionResponse>('vision_describe_ui_elements', {
            captureId,
            provider,
          });
          set(
            (state) => {
              state.lastResponse = response;
              state.isLoading = false;
            },
            undefined,
            'vision/describeUiElements/done',
          );
          return response;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/describeUiElements/error',
          );
          return null;
        }
      },

      locateElement: async (captureId, elementDescription, provider) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'vision/locateElement/start',
        );
        try {
          const location = await invoke<VisualElementLocation>('vision_locate_element', {
            captureId,
            elementDescription,
            provider,
          });
          set(
            (state) => {
              state.lastLocation = location;
              state.isLoading = false;
            },
            undefined,
            'vision/locateElement/done',
          );
          return location;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'vision/locateElement/error',
          );
          return null;
        }
      },

      clearError: () =>
        set(
          (state) => {
            state.error = null;
          },
          undefined,
          'vision/clearError',
        ),

      reset: () =>
        set(
          {
            isLoading: false,
            lastResponse: null,
            lastComparison: null,
            lastLocation: null,
            error: null,
          },
          undefined,
          'vision/reset',
        ),
    })),
    { name: 'VisionStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectVisionLoading = (state: VisionStoreState) => state.isLoading;
export const selectVisionError = (state: VisionStoreState) => state.error;
export const selectLastVisionResponse = (state: VisionStoreState) => state.lastResponse;
export const selectLastComparison = (state: VisionStoreState) => state.lastComparison;
export const selectLastLocation = (state: VisionStoreState) => state.lastLocation;
