import * as React from 'react';
import { Search } from 'lucide-react';
import * as Icons from 'lucide-react';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/Accordion';
import { cn } from '../../lib/utils';
import { useConfiguratorStore } from '../../stores/configuratorStore';
import type { Capability } from '../../types/configurator';

interface CapabilityItemProps {
  capability: Capability;
  onDragStart: (event: React.DragEvent, capability: Capability) => void;
}

function CapabilityItem({ capability, onDragStart }: CapabilityItemProps) {
  // Updated Nov 16, 2025: Improved type safety for dynamic icon lookup
  const IconComponent = (Icons as Record<string, React.ComponentType>)[capability.icon] || Icons.Circle;

  const categoryColors = {
    data: 'text-blue-600 hover:bg-blue-50',
    logic: 'text-yellow-600 hover:bg-yellow-50',
    actions: 'text-green-600 hover:bg-green-50',
    ai: 'text-purple-600 hover:bg-purple-50',
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, capability)}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md p-2 transition-colors active:cursor-grabbing',
        categoryColors[capability.category],
      )}
    >
      <IconComponent className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 overflow-hidden">
        <div className="truncate text-sm font-medium">{capability.name}</div>
        <div className="truncate text-xs text-muted-foreground">{capability.description}</div>
      </div>
    </div>
  );
}

interface CapabilityLibraryProps {
  className?: string;
}

export function CapabilityLibrary({ className }: CapabilityLibraryProps) {
  const [search, setSearch] = React.useState('');
  const capabilities = useConfiguratorStore((state) => state.capabilities);
  const fetchCapabilities = useConfiguratorStore((state) => state.fetchCapabilities);

  React.useEffect(() => {
    if (capabilities.length === 0) {
      fetchCapabilities();
    }
  }, [capabilities.length, fetchCapabilities]);

  // Filter capabilities by search
  const filteredCapabilities = React.useMemo(() => {
    if (!search.trim()) return capabilities;

    const query = search.toLowerCase();
    return capabilities.filter(
      (cap) =>
        cap.name.toLowerCase().includes(query) ||
        cap.description.toLowerCase().includes(query) ||
        cap.category.toLowerCase().includes(query),
    );
  }, [capabilities, search]);

  // Group capabilities by category
  const groupedCapabilities = React.useMemo(() => {
    const groups: Record<string, Capability[]> = {
      data: [],
      logic: [],
      actions: [],
      ai: [],
    };

    filteredCapabilities.forEach((cap) => {
      groups[cap.category]?.push(cap);
    });

    return groups;
  }, [filteredCapabilities]);

  const handleDragStart = (event: React.DragEvent, capability: Capability) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(capability));
    event.dataTransfer.effectAllowed = 'move';
  };

  const categoryLabels = {
    data: 'Data Sources',
    logic: 'Logic',
    actions: 'Actions',
    ai: 'AI Operations',
  };

  return (
    <div className={cn('flex flex-col border-r bg-muted/10', className)}>
      {/* Header */}
      <div className="border-b p-3">
        <h2 className="mb-2 text-sm font-semibold">Capability Library</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search capabilities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Capabilities List */}
      <ScrollArea className="flex-1">
        <Accordion type="multiple" defaultValue={['data', 'logic', 'actions', 'ai']} className="px-2">
          {Object.entries(categoryLabels).map(([category, label]) => {
            const items = groupedCapabilities[category as keyof typeof groupedCapabilities];
            if (!items || items.length === 0) return null;

            return (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="text-sm font-medium">
                  {label} ({items.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1 py-2">
                    {items.map((capability) => (
                      <CapabilityItem
                        key={capability.id}
                        capability={capability}
                        onDragStart={handleDragStart}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {filteredCapabilities.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No capabilities found matching &quot;{search}&quot;
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3">
        <div className="text-xs text-muted-foreground">
          Drag capabilities to the canvas to build your workflow
        </div>
      </div>
    </div>
  );
}
