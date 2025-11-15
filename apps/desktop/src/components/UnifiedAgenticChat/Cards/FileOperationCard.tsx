import React, { useState } from 'react';
import {
  FileText,
  FilePlus,
  FileEdit,
  FileX,
  FolderInput,
  Check,
  X,
  Eye,
  Clock,
} from 'lucide-react';
import { FileOperation } from '../../../stores/unifiedChatStore';
import { DiffViewer } from '../Visualizations/DiffViewer';

export interface FileOperationCardProps {
  operation: FileOperation;
  showDiff?: boolean;
  enableApproval?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onViewFile?: () => void;
  className?: string;
}

const OPERATION_ICONS = {
  read: FileText,
  write: FileEdit,
  create: FilePlus,
  delete: FileX,
  move: FolderInput,
  rename: FolderInput,
};

const OPERATION_COLORS = {
  read: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  write: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
  create: 'text-green-500 bg-green-50 dark:bg-green-900/20',
  delete: 'text-red-500 bg-red-50 dark:bg-red-900/20',
  move: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
  rename: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
};

export const FileOperationCard: React.FC<FileOperationCardProps> = ({
  operation,
  showDiff = true,
  enableApproval = false,
  onApprove,
  onReject,
  onViewFile,
  className = '',
}) => {
  const [showFullDiff, setShowFullDiff] = useState(false);

  const Icon = OPERATION_ICONS[operation.type];
  const colorClass = OPERATION_COLORS[operation.type];

  const hasDiff =
    operation.oldContent !== undefined &&
    operation.newContent !== undefined &&
    operation.oldContent !== operation.newContent;

  const sizeChange = operation.sizeBytes
    ? operation.sizeBytes > 0
      ? `+${(operation.sizeBytes / 1024).toFixed(1)} KB`
      : `${(operation.sizeBytes / 1024).toFixed(1)} KB`
    : null;

  const formattedTime = new Date(operation.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={`file-operation-card rounded-lg border ${
        operation.success
          ? 'border-gray-200 dark:border-gray-700'
          : 'border-red-200 dark:border-red-900'
      } bg-white dark:bg-gray-800 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className={`p-2 rounded-lg ${colorClass} flex-shrink-0`}>
            <Icon size={20} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-400">
                {operation.type}
              </span>
              {operation.success ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <X size={14} className="text-red-500" />
              )}
            </div>

            {/* File Path */}
            <div
              className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate"
              title={operation.filePath}
            >
              {operation.filePath}
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formattedTime}
              </span>
              {sizeChange && <span>{sizeChange}</span>}
              {operation.sessionId && (
                <span className="truncate">Session: {operation.sessionId.slice(0, 8)}</span>
              )}
            </div>

            {/* Error Message */}
            {!operation.success && operation.error && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                {operation.error}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {onViewFile && (
            <button
              onClick={onViewFile}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="View file"
            >
              <Eye size={14} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Diff Preview */}
      {showDiff && hasDiff && (
        <div className="px-4 pb-4">
          {!showFullDiff ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Content modified ({operation.oldContent?.split('\n').length || 0} →{' '}
                {operation.newContent?.split('\n').length || 0} lines)
              </div>
              <button
                onClick={() => setShowFullDiff(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View full diff →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <DiffViewer
                oldContent={operation.oldContent || ''}
                newContent={operation.newContent || ''}
                fileName={operation.filePath.split('/').pop()}
                viewMode="split"
                showLineNumbers={true}
              />
              <button
                onClick={() => setShowFullDiff(false)}
                className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
              >
                Hide diff
              </button>
            </div>
          )}
        </div>
      )}

      {/* Approval Actions */}
      {enableApproval && (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onApprove}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

export default FileOperationCard;
