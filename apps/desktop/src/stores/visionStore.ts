/**
 * Vision Store
 *
 * Manages vision AI capabilities: screenshot analysis, text extraction,
 * image comparison, UI element detection, and visual Q&A.
 *
 * Differentiator: Desktop automation + vision — only AGI Workforce combines
 * native Tauri desktop app with multi-model vision analysis.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { getSimpleErrorMessage } from '../lib/errorMessages';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VisionImage {
  sourceType: 'path' | 'base64' | 'capture_id';
  source: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface VisionRequest {
  prompt: string;
  images: VisionImage[];
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  detailLevel?: string;
}

export interface VisionResponse {
  content: string;
  model: string;
  tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  processingTimeMs: number;
}

export interface ImageComparisonResult {
  similarityScore: number;
  differencesDescription: string;
  visualDiffHighlighted?: string;
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

// ── Store ──────────────────────────────────────────────────────────────────────

interface VisionState {
  lastResponse: VisionResponse | null;
  lastComparison: ImageComparisonResult | null;
  lastElementLocation: VisualElementLocation | null;
  isAnalyzing: boolean;
  error: string | null;

  sendMessage: (request: VisionRequest) => Promise<VisionResponse>;
  analyzeScreenshot: (
    captureId: string,
    prompt?: string,
    provider?: string,
    model?: string,
  ) => Promise<VisionResponse>;
  extractText: (imagePath: string, provider?: string) => Promise<VisionResponse>;
  compareImages: (
    imagePath1: string,
    imagePath2: string,
    comparisonType?: string,
    provider?: string,
  ) => Promise<ImageComparisonResult>;
  locateElement: (
    captureId: string,
    elementDescription: string,
    provider?: string,
  ) => Promise<VisualElementLocation>;
  describeUiElements: (captureId: string, provider?: string) => Promise<VisionResponse>;
  answerQuestion: (
    imagePath: string,
    question: string,
    provider?: string,
    model?: string,
  ) => Promise<VisionResponse>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  lastResponse: null,
  lastComparison: null,
  lastElementLocation: null,
  isAnalyzing: false,
  error: null,
};

export const useVisionStore = create<VisionState>()(
  devtools(
    (set) => ({
      ...initialState,

      sendMessage: async (request) => {
        set({ isAnalyzing: true, error: null });
        try {
          const response = await invoke<VisionResponse>('vision_send_message', { request });
          set({ lastResponse: response, isAnalyzing: false });
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`Vision analysis failed: ${msg}`);
          throw error;
        }
      },

      analyzeScreenshot: async (captureId, prompt, provider, model) => {
        set({ isAnalyzing: true, error: null });
        try {
          const response = await invoke<VisionResponse>('vision_analyze_screenshot', {
            captureId,
            prompt,
            provider,
            model,
          });
          set({ lastResponse: response, isAnalyzing: false });
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`Screenshot analysis failed: ${msg}`);
          throw error;
        }
      },

      extractText: async (imagePath, provider) => {
        set({ isAnalyzing: true, error: null });
        try {
          const response = await invoke<VisionResponse>('vision_extract_text', {
            imagePath,
            provider,
          });
          set({ lastResponse: response, isAnalyzing: false });
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`Text extraction failed: ${msg}`);
          throw error;
        }
      },

      compareImages: async (imagePath1, imagePath2, comparisonType, provider) => {
        set({ isAnalyzing: true, error: null });
        try {
          const result = await invoke<ImageComparisonResult>('vision_compare_images', {
            imagePath1,
            imagePath2,
            comparisonType,
            provider,
          });
          set({ lastComparison: result, isAnalyzing: false });
          return result;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`Image comparison failed: ${msg}`);
          throw error;
        }
      },

      locateElement: async (captureId, elementDescription, provider) => {
        set({ isAnalyzing: true, error: null });
        try {
          const location = await invoke<VisualElementLocation>('vision_locate_element', {
            captureId,
            elementDescription,
            provider,
          });
          set({ lastElementLocation: location, isAnalyzing: false });
          return location;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`Element location failed: ${msg}`);
          throw error;
        }
      },

      describeUiElements: async (captureId, provider) => {
        set({ isAnalyzing: true, error: null });
        try {
          const response = await invoke<VisionResponse>('vision_describe_ui_elements', {
            captureId,
            provider,
          });
          set({ lastResponse: response, isAnalyzing: false });
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`UI element description failed: ${msg}`);
          throw error;
        }
      },

      answerQuestion: async (imagePath, question, provider, model) => {
        set({ isAnalyzing: true, error: null });
        try {
          const response = await invoke<VisionResponse>('vision_answer_question', {
            imagePath,
            question,
            provider,
            model,
          });
          set({ lastResponse: response, isAnalyzing: false });
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isAnalyzing: false });
          toast.error(`Visual Q&A failed: ${msg}`);
          throw error;
        }
      },

      clearError: () => set({ error: null }),
      reset: () => set(initialState),
    }),
    { name: 'VisionStore' },
  ),
);

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectLastVisionResponse = (state: VisionState) => state.lastResponse;
export const selectLastComparison = (state: VisionState) => state.lastComparison;
export const selectLastElementLocation = (state: VisionState) => state.lastElementLocation;
export const selectIsAnalyzing = (state: VisionState) => state.isAnalyzing;
export const selectVisionError = (state: VisionState) => state.error;
