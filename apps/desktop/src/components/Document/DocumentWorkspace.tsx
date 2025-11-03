import { useState } from 'react';
import { FileText, Search, FileSearch, Download, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-dialog';

import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { useDocumentStore } from '../../stores/documentStore';
import type { DocumentMetadata } from '../../types/document';

interface DocumentWorkspaceProps {
  className?: string;
}

export function DocumentWorkspace({ className }: DocumentWorkspaceProps) {
  const {
    currentDocument,
    searchResults,
    loading,
    error,
    readDocument,
    extractText,
    search,
    reset,
  } = useDocumentStore();

  const [searchQuery, setSearchQuery] = useState('');

  const handleOpenDocument = async () => {
    try {
      const selected = await open({
        title: 'Select Document',
        multiple: false,
        filters: [
          {
            name: 'Documents',
            extensions: ['pdf', 'docx', 'xlsx', 'xls'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        await readDocument(selected);
        toast.success('Document loaded successfully');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to open document: ${message}`);
    }
  };

  const handleSearch = async () => {
    if (!currentDocument) {
      toast.error('Please open a document first');
      return;
    }

    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    try {
      const results = await search(currentDocument.metadata.file_path, searchQuery);
      if (results.length === 0) {
        toast.info('No matches found');
      } else {
        toast.success(`Found ${results.length} result${results.length === 1 ? '' : 's'}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Search failed: ${message}`);
    }
  };

  const handleExtractText = async () => {
    if (!currentDocument) {
      toast.error('Please open a document first');
      return;
    }

    try {
      const text = await extractText(currentDocument.metadata.file_path);
      navigator.clipboard.writeText(text);
      toast.success('Text extracted and copied to clipboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Text extraction failed: ${message}`);
    }
  };

  const renderMetadata = (metadata: DocumentMetadata) => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-muted-foreground">File Name:</div>
        <div className="font-medium">{metadata.file_name}</div>

        <div className="text-muted-foreground">Type:</div>
        <div className="font-medium">{metadata.document_type}</div>

        <div className="text-muted-foreground">Size:</div>
        <div className="font-medium">{(metadata.file_size / 1024).toFixed(2)} KB</div>

        {metadata.title && (
          <>
            <div className="text-muted-foreground">Title:</div>
            <div className="font-medium">{metadata.title}</div>
          </>
        )}

        {metadata.author && (
          <>
            <div className="text-muted-foreground">Author:</div>
            <div className="font-medium">{metadata.author}</div>
          </>
        )}

        {metadata.page_count && (
          <>
            <div className="text-muted-foreground">Pages:</div>
            <div className="font-medium">{metadata.page_count}</div>
          </>
        )}

        {metadata.word_count && (
          <>
            <div className="text-muted-foreground">Words:</div>
            <div className="font-medium">{metadata.word_count}</div>
          </>
        )}

        {metadata.created_at && (
          <>
            <div className="text-muted-foreground">Created:</div>
            <div className="font-medium">
              {new Date(parseInt(metadata.created_at) * 1000).toLocaleString()}
            </div>
          </>
        )}

        {metadata.modified_at && (
          <>
            <div className="text-muted-foreground">Modified:</div>
            <div className="font-medium">
              {new Date(parseInt(metadata.modified_at) * 1000).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Document MCP</h2>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleOpenDocument} size="sm" disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Open Document
          </Button>
          {currentDocument && (
            <Button onClick={reset} variant="outline" size="sm">
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2">
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {currentDocument ? (
          <Tabs defaultValue="content" className="flex h-full flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="content">
                <FileText className="mr-2 h-4 w-4" />
                Content
              </TabsTrigger>
              <TabsTrigger value="search">
                <Search className="mr-2 h-4 w-4" />
                Search
              </TabsTrigger>
              <TabsTrigger value="metadata">
                <FileSearch className="mr-2 h-4 w-4" />
                Metadata
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="flex-1 overflow-hidden px-4 pb-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Document Content</CardTitle>
                  <CardDescription>Extracted text from the document</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <pre className="whitespace-pre-wrap text-sm">{currentDocument.text}</pre>
                  </ScrollArea>
                  <div className="mt-4">
                    <Button onClick={handleExtractText} variant="outline" size="sm">
                      Copy to Clipboard
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="search" className="flex-1 overflow-hidden px-4 pb-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Search Document</CardTitle>
                  <CardDescription>Search for text within the document</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter search query..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                      <Search className="mr-2 h-4 w-4" />
                      Search
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {searchResults.map((result, idx) => (
                          <Card key={idx}>
                            <CardContent className="p-4">
                              <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                                {result.page && <span>Page {result.page}</span>}
                                {result.line && <span>Line {result.line}</span>}
                              </div>
                              <p className="text-sm">
                                <span className="bg-yellow-200 dark:bg-yellow-800">{result.match_text}</span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{result.context}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  {searchResults.length === 0 && searchQuery && (
                    <p className="text-sm text-muted-foreground">No results found</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metadata" className="flex-1 overflow-hidden px-4 pb-4">
              <Card>
                <CardHeader>
                  <CardTitle>Document Metadata</CardTitle>
                  <CardDescription>File information and properties</CardDescription>
                </CardHeader>
                <CardContent>{renderMetadata(currentDocument.metadata)}</CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <FileText className="h-16 w-16" />
            <div className="text-center">
              <h3 className="mb-2 text-lg font-semibold">No Document Loaded</h3>
              <p className="text-sm">
                Click "Open Document" to load a Word, Excel, or PDF document
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
