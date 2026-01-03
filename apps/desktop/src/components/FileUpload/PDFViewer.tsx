import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (options: { scale: number; rotation: number }) => PDFPageViewport;
  render: (options: {
    canvasContext: globalThis.CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }) => { promise: Promise<void> };
}

interface PDFPageViewport {
  width: number;
  height: number;
}

interface PDFViewerProps {
  /** URL or data URL of the PDF to display */
  src: string;
  /** Optional file path for Tauri file system access */
  filePath?: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when PDF fails to load */
  onError?: (error: Error) => void;
  /** Callback when PDF loads successfully */
  onLoad?: (numPages: number) => void;
}

export function PDFViewer({ src, filePath, className, onError, onLoad }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState(false);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Dynamically import PDF.js to avoid SSR issues
        const pdfjs = await import('pdfjs-dist');

        // Set worker source - use CDN for simplicity
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

        let loadingTask;

        if (filePath) {
          // For Tauri file paths, we need to read the file first
          const { invoke } = await import('@/lib/tauri-mock');
          try {
            const content = await invoke<string>('file_read_binary_base64', { filePath });
            const binaryData = atob(content);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }
            loadingTask = pdfjs.getDocument({ data: bytes });
          } catch {
            // Fallback to URL if file read fails
            loadingTask = pdfjs.getDocument(src);
          }
        } else if (src.startsWith('data:')) {
          // Data URL - extract base64 content
          const base64 = src.split(',')[1];
          if (base64) {
            const binaryData = atob(base64);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }
            loadingTask = pdfjs.getDocument({ data: bytes });
          } else {
            loadingTask = pdfjs.getDocument(src);
          }
        } else {
          // Regular URL
          loadingTask = pdfjs.getDocument(src);
        }

        const pdf = (await loadingTask.promise) as unknown as PDFDocumentProxy;

        if (cancelled) return;

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        onLoad?.(pdf.numPages);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load PDF:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load PDF';
        setError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      cancelled = true;
    };
  }, [src, filePath, onError, onLoad]);

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || renderingPage) return;

    try {
      setRenderingPage(true);
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale, rotation });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    } catch (err) {
      console.error('Failed to render page:', err);
    } finally {
      setRenderingPage(false);
    }
  }, [pdfDoc, currentPage, scale, rotation, renderingPage]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Navigation handlers
  const goToPrevPage = useCallback(() => {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => (prev < numPages ? prev + 1 : prev));
  }, [numPages]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, 4));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevPage();
      } else if (e.key === 'ArrowRight') {
        goToNextPage();
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevPage, goToNextPage, zoomIn, zoomOut]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center min-h-[400px] bg-zinc-900', className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
          <p className="text-sm text-zinc-500">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center justify-center min-h-[400px] bg-zinc-900', className)}>
        <div className="flex flex-col items-center gap-3 text-center p-4">
          <AlertCircle className="w-10 h-10 text-rose-400" />
          <p className="text-sm text-rose-400 font-medium">Failed to load PDF</p>
          <p className="text-xs text-zinc-500 max-w-xs">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col bg-zinc-900 rounded-lg overflow-hidden', className)}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className={cn(
              'p-1.5 rounded hover:bg-zinc-700 transition-colors',
              currentPage <= 1 ? 'opacity-50 cursor-not-allowed' : '',
            )}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <span className="text-sm text-zinc-300 tabular-nums min-w-[80px] text-center">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className={cn(
              'p-1.5 rounded hover:bg-zinc-700 transition-colors',
              currentPage >= numPages ? 'opacity-50 cursor-not-allowed' : '',
            )}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4 text-zinc-300" />
          </button>
        </div>

        {/* Zoom and rotation controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className={cn(
              'p-1.5 rounded hover:bg-zinc-700 transition-colors',
              scale <= 0.5 ? 'opacity-50 cursor-not-allowed' : '',
            )}
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-zinc-300" />
          </button>
          <span className="text-xs text-zinc-400 min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 4}
            className={cn(
              'p-1.5 rounded hover:bg-zinc-700 transition-colors',
              scale >= 4 ? 'opacity-50 cursor-not-allowed' : '',
            )}
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="w-px h-4 bg-zinc-600 mx-2" />
          <button
            onClick={rotate}
            className="p-1.5 rounded hover:bg-zinc-700 transition-colors"
            aria-label="Rotate"
          >
            <RotateCw className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      </div>

      {/* PDF canvas */}
      <div className="flex-1 overflow-auto p-4 flex justify-center items-start bg-zinc-950">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className={cn(
              'shadow-lg transition-opacity',
              renderingPage ? 'opacity-50' : 'opacity-100',
            )}
          />
          {renderingPage && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PDFViewer;
