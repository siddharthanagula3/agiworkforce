import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { BrowserViewer } from './BrowserViewer';
import { BrowserActionLog } from './BrowserActionLog';
import { BrowserDebugPanel } from './BrowserDebugPanel';
import { BrowserRecorder } from './BrowserRecorder';
import {
  Eye,
  List,
  Bug,
  Circle,
} from 'lucide-react';

interface BrowserVisualizationProps {
  className?: string;
  tabId?: string;
}

/**
 * Comprehensive browser automation visualization system
 * Combines live view, action log, debug panel, and recorder
 */
export function BrowserVisualization({ className, tabId }: BrowserVisualizationProps) {
  const [activeTab, setActiveTab] = useState('live');

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="px-4 py-2 border-b border-border">
          <TabsTrigger value="live">
            <Eye className="h-4 w-4 mr-2" />
            Live View
          </TabsTrigger>
          <TabsTrigger value="actions">
            <List className="h-4 w-4 mr-2" />
            Actions
          </TabsTrigger>
          <TabsTrigger value="debug">
            <Bug className="h-4 w-4 mr-2" />
            Debug
          </TabsTrigger>
          <TabsTrigger value="record">
            <Circle className="h-4 w-4 mr-2" />
            Record
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="flex-1 overflow-hidden m-0 p-4">
          <BrowserViewer tabId={tabId} className="h-full" />
        </TabsContent>

        <TabsContent value="actions" className="flex-1 overflow-hidden m-0 p-4">
          <BrowserActionLog className="h-full" />
        </TabsContent>

        <TabsContent value="debug" className="flex-1 overflow-hidden m-0 p-4">
          <BrowserDebugPanel tabId={tabId} className="h-full" />
        </TabsContent>

        <TabsContent value="record" className="flex-1 overflow-hidden m-0 p-4">
          <BrowserRecorder className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
