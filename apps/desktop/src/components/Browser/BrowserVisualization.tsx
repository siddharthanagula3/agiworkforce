import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { BrowserActionLog } from './BrowserActionLog';
import { BrowserViewer } from './BrowserViewer';

interface BrowserVisualizationProps {
  className?: string;
  tabId?: string;
}

export function BrowserVisualization({ className, tabId }: BrowserVisualizationProps) {
  const [activeTab, setActiveTab] = useState('live');

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="px-4 py-2 border-b border-border bg-transparent w-full justify-start">
          <TabsTrigger
            value="live"
            className="data-[state=active]:bg-zinc-100 dark:data-[state=active]:bg-zinc-800"
          >
            Preview
          </TabsTrigger>
          <TabsTrigger
            value="actions"
            className="data-[state=active]:bg-zinc-100 dark:data-[state=active]:bg-zinc-800"
          >
            Console
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="flex-1 overflow-hidden m-0 p-0">
          <BrowserViewer tabId={tabId} className="h-full" />
        </TabsContent>

        <TabsContent value="actions" className="flex-1 overflow-hidden m-0 p-0">
          <BrowserActionLog className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
