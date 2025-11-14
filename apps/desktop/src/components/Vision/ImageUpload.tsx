import React, { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, X, FileImage } from 'lucide-react';
import { Button } from '../ui/Button';

export interface UploadedImage {
  id: string;
  file?: File;
  preview: string;
  sourceType: 'file' | 'capture' | 'clipboard';
  captureId?: string;
  detail?: 'low' | 'high' | 'auto';
}

interface ImageUploadProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  onCaptureClick?: () => void;
  onCaptureFromClipboard?: () => void;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  images,
  onImagesChange,
  maxImages = 10,
  onCaptureClick,
  onCaptureFromClipboard,
}) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const newFiles = Array.from(e.dataTransfer.files).filter(
          (file) => file.type.startsWith('image/')
        );

        addFiles(newFiles);
      }
    },
    [images]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const newFiles = Array.from(e.target.files);
        addFiles(newFiles);
      }
    },
    [images]
  );

  const addFiles = (newFiles: File[]) => {
    const remaining = maxImages - images.length;
    const filesToAdd = newFiles.slice(0, remaining);

    const newImages: UploadedImage[] = filesToAdd.map((file) => ({
      id: `file-${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      sourceType: 'file',
      detail: 'auto',
    }));

    onImagesChange([...images, ...newImages]);
  };

  const removeImage = (id: string) => {
    const updatedImages = images.filter((img) => img.id !== id);
    // Revoke object URL to prevent memory leaks
    const removedImage = images.find((img) => img.id === id);
    if (removedImage && removedImage.sourceType === 'file') {
      URL.revokeObjectURL(removedImage.preview);
    }
    onImagesChange(updatedImages);
  };

  const updateImageDetail = (id: string, detail: 'low' | 'high' | 'auto') => {
    const updatedImages = images.map((img) =>
      img.id === id ? { ...img, detail } : img
    );
    onImagesChange(updatedImages);
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
        } ${images.length >= maxImages ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="image-upload"
          className="hidden"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          disabled={images.length >= maxImages}
        />

        <div className="text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Drag and drop images here, or{' '}
            <label
              htmlFor="image-upload"
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              browse
            </label>
          </p>
          <p className="text-xs text-gray-500">
            {images.length} / {maxImages} images added
          </p>

          {/* Action Buttons */}
          <div className="mt-4 flex justify-center gap-2">
            {onCaptureClick && (
              <Button
                onClick={onCaptureClick}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <ImageIcon className="h-4 w-4" />
                Capture Screen
              </Button>
            )}
            {onCaptureFromClipboard && (
              <Button
                onClick={onCaptureFromClipboard}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <FileImage className="h-4 w-4" />
                Paste from Clipboard
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
            >
              {/* Image */}
              <div className="aspect-square">
                <img
                  src={image.preview}
                  alt="Upload preview"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeImage(image.id)}
                className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Source Type Badge */}
              <div className="absolute top-2 left-2 px-2 py-1 rounded text-xs bg-black/50 text-white">
                {image.sourceType === 'file'
                  ? 'File'
                  : image.sourceType === 'capture'
                  ? 'Capture'
                  : 'Clipboard'}
              </div>

              {/* Detail Level Selector */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  {(['low', 'high', 'auto'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => updateImageDetail(image.id, level)}
                      className={`flex-1 px-2 py-1 text-xs rounded ${
                        image.detail === level
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
