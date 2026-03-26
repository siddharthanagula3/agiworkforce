import { formatDistanceToNow } from 'date-fns';
import {
  BarChart3,
  Code2,
  FileCode,
  Globe,
  Network,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { ArtifactRenderer } from './ArtifactRenderer';

export function ArtifactsView() {
  const messagesByConversation = useUnifiedChatStore((state) => state.messagesByConversation);
  const [searchQuery, setSearchQuery] = useState('');

  const allArtifacts = useMemo(() => {
    const artifacts = [];
    for (const [convoId, messages] of Object.entries(messagesByConversation)) {
      for (const msg of messages) {
        if (msg.artifacts) {
          for (const artifact of msg.artifacts) {
            artifacts.push({
              ...artifact,
              conversationId: convoId,
              timestamp: msg.timestamp,
            });
          }
        }
      }
    }

    return artifacts.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [messagesByConversation]);

  const filteredArtifacts = useMemo(() => {
    if (!searchQuery.trim()) return allArtifacts;
    const lower = searchQuery.toLowerCase();
    return allArtifacts.filter(
      (a) =>
        (a.title && a.title.toLowerCase().includes(lower)) ||
        (typeof a.content === 'string' && a.content.toLowerCase().includes(lower)) ||
        a.type.toLowerCase().includes(lower),
    );
  }, [allArtifacts, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-background/50">
      <div className="p-6 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center">
            <Code2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Artifacts</h2>
            <p className="text-sm text-muted-foreground">
              View and manage generated code, charts, and diagrams
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search artifacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/50 border-border"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {filteredArtifacts.length > 0 ? (
            filteredArtifacts.map((artifact, i) => (
              <div key={`${artifact.id}-${i}`} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span className="flex items-center gap-1">
                    {getArtifactIcon(artifact.type)}
                    {artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)}
                  </span>
                  <span>
                    {formatDistanceToNow(new Date(artifact.timestamp), { addSuffix: true })}
                  </span>
                </div>
                <ArtifactRenderer
                  artifact={artifact}
                  className="h-[300px] shadow-xs hover:shadow-md transition-shadow"
                />
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              {searchQuery ? 'No artifacts match your search' : 'No artifacts generated yet'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function getArtifactIcon(type: string) {
  switch (type) {
    case 'code':
      return <FileCode className="w-3 h-3" />;
    case 'chart':
      return <BarChart3 className="w-3 h-3" />;
    case 'diagram':
    case 'mermaid':
      return <Network className="w-3 h-3" />;
    case 'table':
      return <TableIcon className="w-3 h-3" />;
    case 'html':
      return <Globe className="w-3 h-3" />;
    default:
      return <Code2 className="w-3 h-3" />;
  }
}
