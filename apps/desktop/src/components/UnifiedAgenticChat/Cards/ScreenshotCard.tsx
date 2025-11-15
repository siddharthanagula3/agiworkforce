import React, { useState } from 'react';
import { Camera, Download, Maximize2, Minimize2, Copy, Clock, Target } from 'lucide-react';
import { Screenshot } from '../../../stores/unifiedChatStore';

export interface ScreenshotCardProps {
  screenshot: Screenshot;
  className?: string;
}

export const ScreenshotCard: React.FC<ScreenshotCardProps> = ({ screenshot, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const formattedTime = new Date(screenshot.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const imageUrl = `data:image/png;base64,${screenshot.imageBase64}`;

  const handleDownload = async () => {
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `screenshot-${screenshot.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download screenshot:', err);
    }
  };

  const handleCopyImage = async () => {
    try {
      // Create a blob from the base64 image
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Copy to clipboard
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (err) {
      console.error('Failed to copy screenshot:', err);
    }
  };

  return (
    <div
      className={`screenshot-card rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="p-2 rounded-lg text-purple-500 bg-purple-50 dark:bg-purple-900/20 flex-shrink-0">
            <Camera size={20} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-400">
                Screenshot
              </span>
            </div>

            {/* Action */}
            {screenshot.action && (
              <div className="text-sm text-gray-800 dark:text-gray-200 mb-2">
                {screenshot.action}
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formattedTime}
              </span>
              {screenshot.confidence !== undefined && (
                <span className="flex items-center gap-1">
                  <Target size={12} />
                  {(screenshot.confidence * 100).toFixed(0)}% confidence
                </span>
              )}
              {screenshot.elementBounds && (
                <span className="text-purple-600 dark:text-purple-400">Element highlighted</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={handleCopyImage}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copy image"
          >
            <Copy size={14} className="text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Download image"
          >
            <Download size={14} className="text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 size={14} className="text-gray-600 dark:text-gray-400" />
            ) : (
              <Maximize2 size={14} className="text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div className={`relative bg-gray-50 dark:bg-gray-900 ${isExpanded ? 'p-4' : 'p-2'}`}>
        <div className="relative inline-block">
          <img
            src={imageUrl}
            alt={screenshot.action || 'Screenshot'}
            className={`rounded border border-gray-200 dark:border-gray-700 ${
              isExpanded ? 'max-w-full h-auto' : 'max-w-md max-h-64 object-contain'
            }`}
            onLoad={() => setIsImageLoaded(true)}
          />

          {/* Element Bounds Overlay */}
          {isImageLoaded && screenshot.elementBounds && (
            <svg
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ zIndex: 10 }}
            >
              <rect
                x={`${(screenshot.elementBounds.x / 100) * 100}%`}
                y={`${(screenshot.elementBounds.y / 100) * 100}%`}
                width={`${(screenshot.elementBounds.width / 100) * 100}%`}
                height={`${(screenshot.elementBounds.height / 100) * 100}%`}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeDasharray="4 2"
                rx="4"
              />
              <rect
                x={`${(screenshot.elementBounds.x / 100) * 100}%`}
                y={`${(screenshot.elementBounds.y / 100) * 100}%`}
                width={`${(screenshot.elementBounds.width / 100) * 100}%`}
                height={`${(screenshot.elementBounds.height / 100) * 100}%`}
                fill="rgba(139, 92, 246, 0.1)"
                rx="4"
              />
            </svg>
          )}
        </div>

        {/* Loading Placeholder */}
        {!isImageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-sm text-gray-500">Loading image...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScreenshotCard;
