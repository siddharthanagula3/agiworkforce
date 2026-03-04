import { Eye, Loader2, AlertCircle, FileText, Box } from 'lucide-react';
import { useState } from 'react';
import type { ToolResultProps } from './index';

interface VisionData {
  imageUrl?: string;
  analysis?: string;
  objects?: Array<{ label: string; confidence?: number }>;
  extractedText?: string;
}

export function InlineVisionResult({ result, status }: ToolResultProps) {
  const [imgError, setImgError] = useState(false);
  const data = result?.data as VisionData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Analyzing image...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Vision analysis failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { imageUrl, analysis, objects = [], extractedText } = data;

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-b border-white/10">
        <Eye className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-medium text-zinc-300">Vision Analysis</span>
      </div>

      <div className="flex gap-3 p-3">
        {imageUrl && !imgError && (
          <div className="shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-zinc-800 border border-white/10">
            <img
              src={imageUrl}
              alt="Analyzed"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          {analysis && (
            <p className="text-xs text-zinc-300 leading-relaxed line-clamp-4">{analysis}</p>
          )}

          {objects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {objects.slice(0, 6).map((obj, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300"
                >
                  <Box className="h-2.5 w-2.5" />
                  {obj.label}
                  {obj.confidence !== undefined && (
                    <span className="text-cyan-500/60">{Math.round(obj.confidence * 100)}%</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {extractedText && (
            <div className="flex items-start gap-1.5">
              <FileText className="h-3 w-3 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500 font-mono line-clamp-2">{extractedText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
