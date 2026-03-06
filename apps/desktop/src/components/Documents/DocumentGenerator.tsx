import { useState, useCallback } from 'react';
import {
  FileText,
  FileSpreadsheet,
  File,
  Loader2,
  FolderOpen,
  Download,
  Check,
} from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '../../lib/tauri-mock';
import { useDocumentStore } from '../../stores/documentStore';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

type DocFormat = 'pdf' | 'word' | 'excel';

interface FormatTab {
  id: DocFormat;
  label: string;
  icon: React.ReactNode;
  color: string;
  extension: string;
}

const FORMAT_TABS: FormatTab[] = [
  {
    id: 'pdf',
    label: 'PDF',
    icon: <FileText className="h-4 w-4" />,
    color: 'text-red-400',
    extension: 'pdf',
  },
  {
    id: 'word',
    label: 'Word',
    icon: <File className="h-4 w-4" />,
    color: 'text-blue-400',
    extension: 'docx',
  },
  {
    id: 'excel',
    label: 'Excel',
    icon: <FileSpreadsheet className="h-4 w-4" />,
    color: 'text-green-400',
    extension: 'xlsx',
  },
];

const PAGE_SIZE_OPTIONS = [
  { label: 'A4', value: 'a4' },
  { label: 'Letter', value: 'letter' },
];

interface DocumentGeneratorProps {
  initialFormat?: DocFormat;
  initialTitle?: string;
  initialContent?: string;
  onClose?: () => void;
}

export function DocumentGenerator({
  initialFormat = 'pdf',
  initialTitle = '',
  initialContent = '',
  onClose,
}: DocumentGeneratorProps) {
  const [format, setFormat] = useState<DocFormat>(initialFormat);
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [pageSize, setPageSize] = useState('a4');
  const [includeCover, setIncludeCover] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);

  const { isGenerating, generatePdf, generateWord, generateExcel } = useDocumentStore();

  const getExtension = useCallback(() => {
    return FORMAT_TABS.find((t) => t.id === format)?.extension ?? 'pdf';
  }, [format]);

  const handleGenerate = async () => {
    if (!title.trim()) return;

    const ext = getExtension();
    const defaultName = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;

    const targetPath = await save({
      defaultPath: defaultName,
      filters: [{ name: `${format.toUpperCase()} Document`, extensions: [ext] }],
    });
    if (!targetPath) return;

    try {
      let result: string;
      switch (format) {
        case 'pdf':
          result = await generatePdf(targetPath, title, content);
          break;
        case 'word':
          result = await generateWord(targetPath, title, content);
          break;
        case 'excel': {
          const lines = content
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          const headers = lines[0]?.split(',').map((h) => h.trim()) ?? ['Data'];
          const rows = lines.slice(1).map((line) => line.split(',').map((c) => c.trim()));
          result = await generateExcel(targetPath, title, headers, rows);
          break;
        }
      }
      setResultPath(result);
    } catch {
      // Error already handled by store with toast
    }
  };

  const handleOpen = async () => {
    if (!resultPath) return;
    try {
      await invoke<void>('file_open_with_default_app', { path: resultPath });
    } catch {
      // Silent fail for open
    }
  };

  const activeTab = FORMAT_TABS.find((t) => t.id === format)!;

  return (
    <div className="rounded-xl bg-surface-elevated border border-border/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Generate Document</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Close
            </button>
          )}
        </div>

        <div className="flex gap-1 mt-3">
          {FORMAT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setFormat(tab.id);
                setResultPath(null);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                format === tab.id
                  ? `${tab.color} bg-white/5 border border-white/10`
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title..."
            className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              format === 'excel'
                ? 'Enter CSV data:\nName, Age, City\nAlice, 30, NYC\nBob, 25, LA'
                : 'Content will be formatted automatically...'
            }
            rows={6}
            className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
        </div>

        {format === 'pdf' && (
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Page Size</label>
              <div className="flex gap-1">
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPageSize(opt.value)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs transition-colors',
                      pageSize === opt.value
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setIncludeCover(!includeCover)}
                className={cn(
                  'w-8 h-5 rounded-full transition-colors relative',
                  includeCover ? 'bg-primary' : 'bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    includeCover ? 'left-3.5' : 'left-0.5',
                  )}
                />
              </button>
              <span className="text-xs text-muted-foreground">Cover page</span>
            </div>
          </div>
        )}

        {!resultPath ? (
          <Button
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !title.trim()}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <span className={activeTab.color}>{activeTab.icon}</span>
                Generate {activeTab.label}
              </>
            )}
          </Button>
        ) : (
          <div className="rounded-lg bg-background border border-border/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-400" />
              <span className="text-sm text-foreground font-medium">Document created</span>
            </div>
            <p className="text-xs text-muted-foreground break-all mb-3">{resultPath}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => void handleOpen()}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => void navigator.clipboard.writeText(resultPath)}
              >
                <Download className="h-3.5 w-3.5" />
                Copy Path
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
