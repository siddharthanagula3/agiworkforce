import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Eye,
  FileText,
  GitCompare,
  Loader2,
  Sparkles,
  DollarSign,
  Clock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { UploadedImage } from './ImageUpload';

export interface VisionResponse {
  content: string;
  model: string;
  tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  processing_time_ms: number;
}

export interface VisionAnalysisProps {
  images: UploadedImage[];
  onResult?: (result: VisionResponse) => void;
}

type AnalysisMode =
  | 'describe'
  | 'extract_text'
  | 'compare'
  | 'custom';

export const VisionAnalysis: React.FC<VisionAnalysisProps> = ({
  images,
  onResult,
}) => {
  const [mode, setMode] = useState<AnalysisMode>('describe');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeImages = async () => {
    if (images.length === 0) {
      setError('Please upload at least one image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let prompt = customPrompt;
      let command = 'vision_send_message';

      // Set default prompt based on mode
      if (mode === 'describe' && !customPrompt) {
        prompt =
          images.length === 1
            ? 'Describe this image in detail. What do you see?'
            : 'Describe these images in detail. What do you see in each?';
      } else if (mode === 'extract_text') {
        command = 'vision_extract_text';
        prompt = '';
      } else if (mode === 'compare') {
        if (images.length < 2) {
          setError('Please upload at least 2 images to compare');
          setLoading(false);
          return;
        }
        prompt =
          'Compare these images and describe all differences, similarities, and changes.';
      }

      // Prepare vision images
      const visionImages = images.map((img) => ({
        source_type: img.sourceType === 'file' ? 'base64' : img.sourceType,
        source:
          img.sourceType === 'file' && img.file
            ? await fileToBase64(img.file)
            : img.sourceType === 'capture'
            ? img.captureId
            : img.preview,
        detail: img.detail,
      }));

      // Call appropriate Tauri command
      let response: VisionResponse;

      if (mode === 'extract_text' && images.length === 1) {
        // Use specialized extract_text command
        response = await invoke<VisionResponse>(
          'vision_extract_text',
          {
            imagePath: visionImages[0].source,
            provider: null,
          }
        );
      } else if (mode === 'compare' && images.length >= 2) {
        // Use specialized compare command
        const comparison = await invoke<{
          similarity_score: number;
          differences_description: string;
          model: string;
          cost?: number;
        }>('vision_compare_images', {
          imagePath1: visionImages[0].source,
          imagePath2: visionImages[1].source,
          comparisonType: 'changes',
          provider: null,
        });

        response = {
          content: comparison.differences_description,
          model: comparison.model,
          cost: comparison.cost,
          processing_time_ms: 0,
        };
      } else {
        // Use general vision_send_message
        response = await invoke<VisionResponse>('vision_send_message', {
          request: {
            prompt,
            images: visionImages,
            provider: null,
            model: null,
            temperature: 0.3,
            max_tokens: 2000,
            detail_level: 'auto',
          },
        });
      }

      setResult(response);
      if (onResult) {
        onResult(response);
      }
    } catch (err) {
      console.error('Vision analysis error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to analyze images'
      );
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Analysis Mode Selector */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Analysis Mode</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button
            variant={mode === 'describe' ? 'default' : 'outline'}
            onClick={() => setMode('describe')}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Describe
          </Button>
          <Button
            variant={mode === 'extract_text' ? 'default' : 'outline'}
            onClick={() => setMode('extract_text')}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Extract Text
          </Button>
          <Button
            variant={mode === 'compare' ? 'default' : 'outline'}
            onClick={() => setMode('compare')}
            className="gap-2"
            disabled={images.length < 2}
          >
            <GitCompare className="h-4 w-4" />
            Compare
          </Button>
          <Button
            variant={mode === 'custom' ? 'default' : 'outline'}
            onClick={() => setMode('custom')}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Custom
          </Button>
        </div>
      </Card>

      {/* Custom Prompt Input */}
      {(mode === 'custom' || customPrompt) && (
        <Card className="p-4">
          <label className="block text-sm font-medium mb-2">
            Custom Prompt
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="What would you like to know about these images?"
            className="w-full px-3 py-2 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
            rows={3}
          />
        </Card>
      )}

      {/* Analyze Button */}
      <Button
        onClick={analyzeImages}
        disabled={loading || images.length === 0}
        className="w-full gap-2"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            Analyze {images.length} {images.length === 1 ? 'Image' : 'Images'}
          </>
        )}
      </Button>

      {/* Error Display */}
      {error && (
        <Card className="p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </Card>
      )}

      {/* Result Display */}
      {result && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Analysis Result</h3>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              {result.cost !== undefined && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  ${result.cost.toFixed(6)}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {result.processing_time_ms}ms
              </div>
            </div>
          </div>

          <div className="prose dark:prose-invert max-w-none">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Model: {result.model}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <pre className="whitespace-pre-wrap text-sm">
                {result.content}
              </pre>
            </div>
          </div>

          {/* Token Usage */}
          {result.tokens && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-4">
              <span>
                Input: {result.prompt_tokens?.toLocaleString()} tokens
              </span>
              <span>
                Output: {result.completion_tokens?.toLocaleString()} tokens
              </span>
              <span>Total: {result.tokens.toLocaleString()} tokens</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
