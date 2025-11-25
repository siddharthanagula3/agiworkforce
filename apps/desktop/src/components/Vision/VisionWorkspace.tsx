import { invoke } from '@/lib/tauri-mock';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { ImageUpload, type UploadedImage } from './ImageUpload';
import { VisionAnalysis, type VisionResponse } from './VisionAnalysis';

export const VisionWorkspace: React.FC = () => {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [history, setHistory] = useState<
    Array<{ images: UploadedImage[]; result: VisionResponse }>
  >([]);

  const handleCaptureClick = async () => {
    try {
      const capture = await invoke<{
        id: string;
        path: string;
        thumbnail_path?: string;
      }>('capture_screen_full', {
        conversationId: null,
      });

      const newImage: UploadedImage = {
        id: capture.id,
        preview: `file://${capture.path}`,
        sourceType: 'capture',
        captureId: capture.id,
        detail: 'auto',
      };

      setImages([...images, newImage]);
    } catch (error) {
      console.error('Failed to capture screen:', error);
    }
  };

  const handleCaptureFromClipboard = async () => {
    try {
      const capture = await invoke<{
        id: string;
        path: string;
        thumbnail_path?: string;
      }>('capture_from_clipboard', {
        conversationId: null,
      });

      const newImage: UploadedImage = {
        id: capture.id,
        preview: `file://${capture.path}`,
        sourceType: 'clipboard',
        captureId: capture.id,
        detail: 'auto',
      };

      setImages([...images, newImage]);
    } catch (error) {
      console.error('Failed to capture from clipboard:', error);
    }
  };

  const handleAnalysisResult = (result: VisionResponse) => {
    // Save to history
    setHistory([{ images: [...images], result }, ...history]);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <Sparkles className="h-6 w-6 text-purple-600" />
        <div>
          <h1 className="text-xl font-semibold">Vision Analysis</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Analyze images with multimodal AI models
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Image Upload Section */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Upload Images
            </h2>
            <ImageUpload
              images={images}
              onImagesChange={setImages}
              maxImages={10}
              onCaptureClick={handleCaptureClick}
              onCaptureFromClipboard={handleCaptureFromClipboard}
            />
          </Card>

          {/* Analysis Section */}
          {images.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Analyze
              </h2>
              <VisionAnalysis
                images={images}
                onResult={handleAnalysisResult}
              />
            </Card>
          )}

          {/* History Section */}
          {history.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Analysis History</h2>
              <div className="space-y-4">
                {history.map((item, index) => (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail of first image */}
                      <div className="flex-shrink-0">
                        <img
                          src={item.images[0]?.preview}
                          alt="Analysis preview"
                          className="w-16 h-16 object-cover rounded"
                        />
                        {item.images.length > 1 && (
                          <div className="text-xs text-center mt-1 text-gray-500">
                            +{item.images.length - 1} more
                          </div>
                        )}
                      </div>

                      {/* Result Summary */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {item.result.model} •{' '}
                          {item.result.cost
                            ? `$${item.result.cost.toFixed(6)}`
                            : 'Free'}{' '}
                          • {item.result.processing_time_ms}ms
                        </div>
                        <p className="text-sm line-clamp-3">
                          {item.result.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Empty State */}
          {images.length === 0 && (
            <div className="text-center py-12">
              <ImageIcon className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No images uploaded
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Upload images, capture your screen, or paste from clipboard to
                get started
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
