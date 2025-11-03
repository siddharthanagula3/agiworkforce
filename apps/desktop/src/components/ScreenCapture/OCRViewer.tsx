import { useState, useEffect } from 'react';
import { Copy, Download, Edit2, Languages, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Separator } from '../ui/Separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { useOCR, Language } from '../../hooks/useOCR';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface OCRViewerProps {
  captureId: string;
  imagePath: string;
  onClose?: () => void;
}

export function OCRViewer({ captureId, imagePath, onClose }: OCRViewerProps) {
  const { isProcessing, processImage, getLanguages, result, error } = useOCR();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('eng');
  const [editedText, setEditedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);

  useEffect(() => {
    const loadLanguages = async () => {
      const langs = await getLanguages();
      setLanguages(langs);
    };
    loadLanguages();
  }, [getLanguages]);

  useEffect(() => {
    if (result) {
      setEditedText(result.text);
    }
  }, [result]);

  const handleProcess = async () => {
    try {
      await processImage(captureId, imagePath, selectedLanguage);
      setHasProcessed(true);
      toast.success('OCR processing completed');
    } catch (err) {
      toast.error('OCR processing failed');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedText : result?.text || '');
      toast.success('Text copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy text');
    }
  };

  const handleDownload = () => {
    const text = isEditing ? editedText : result?.text || '';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${captureId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Text downloaded');
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-500';
    if (confidence >= 0.7) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card className="flex h-full flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">OCR Text Extraction</h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Language and Process Controls */}
      <div className="mb-4 flex gap-2">
        <Select
          value={selectedLanguage}
          onValueChange={setSelectedLanguage}
          disabled={isProcessing || hasProcessed}
        >
          <option value="">Select Language</option>
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </Select>

        <Button
          onClick={handleProcess}
          disabled={isProcessing || hasProcessed}
          className="gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : hasProcessed ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Processed
            </>
          ) : (
            <>
              <Languages className="h-4 w-4" />
              Extract Text
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Result Display */}
      {result && (
        <>
          {/* Confidence Score */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <Badge
              variant="outline"
              className={cn('font-mono', getConfidenceColor(result.confidence / 100))}
            >
              {result.confidence.toFixed(1)}%
            </Badge>
            <span className="text-sm text-muted-foreground">
              Processed in {result.processingTimeMs}ms
            </span>
          </div>

          <Separator className="mb-4" />

          {/* Action Buttons */}
          <div className="mb-4 flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy text to clipboard</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download as text file</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="gap-2"
                >
                  <Edit2 className="h-4 w-4" />
                  {isEditing ? 'View' : 'Edit'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isEditing ? 'View original text' : 'Edit extracted text'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Text Display/Editor */}
          <div className="flex-1 overflow-auto">
            {isEditing ? (
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                placeholder="Edit extracted text..."
              />
            ) : (
              <div className="rounded-md border bg-muted/50 p-4">
                <pre className="whitespace-pre-wrap font-mono text-sm">{result.text}</pre>
              </div>
            )}
          </div>

          {/* Word Count */}
          <div className="mt-4 text-sm text-muted-foreground">
            {result.text.split(/\s+/).filter(Boolean).length} words,{' '}
            {result.text.length} characters
          </div>
        </>
      )}

      {/* Initial State */}
      {!result && !isProcessing && !error && (
        <div className="flex flex-1 items-center justify-center text-center text-muted-foreground">
          <div>
            <Languages className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Select a language and click &quot;Extract Text&quot; to begin OCR processing</p>
          </div>
        </div>
      )}
    </Card>
  );
}
