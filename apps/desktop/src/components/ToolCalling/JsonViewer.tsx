/**
 * JsonViewer Component
 *
 * Beautiful JSON data viewer with syntax highlighting, collapsible sections,
 * search, and copy functionality. Optimized for large JSON objects.
 */

import { useState, useMemo } from 'react';
import { Copy, Check, ChevronRight, ChevronDown, Search, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';

interface JsonViewerProps {
  data: unknown;
  className?: string;
  maxHeight?: string;
  defaultExpanded?: boolean;
  searchable?: boolean;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

interface TreeNode {
  key: string;
  value: JsonValue;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  level: number;
  path: string;
  expanded?: boolean;
}

function getType(value: unknown): TreeNode['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as TreeNode['type'];
}

function buildTree(data: unknown, level = 0, path = 'root'): TreeNode[] {
  const nodes: TreeNode[] = [];
  const type = getType(data);

  if (type === 'object' && data !== null) {
    const obj = data as JsonObject;
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = `${path}.${key}`;
      const valueType = getType(value);
      nodes.push({
        key,
        value,
        type: valueType,
        level,
        path: currentPath,
        expanded: level < 2, // Auto-expand first 2 levels
      });
    }
  } else if (type === 'array' && data !== null) {
    const arr = data as JsonArray;
    arr.forEach((value, index) => {
      const currentPath = `${path}[${index}]`;
      const valueType = getType(value);
      nodes.push({
        key: index.toString(),
        value,
        type: valueType,
        level,
        path: currentPath,
        expanded: level < 2,
      });
    });
  }

  return nodes;
}

function JsonTreeNode({
  node,
  onToggle,
  searchTerm,
}: {
  node: TreeNode;
  onToggle: (path: string) => void;
  searchTerm: string;
}) {
  const isExpandable = node.type === 'object' || node.type === 'array';
  const isExpanded = node.expanded ?? false;

  // Highlight search matches
  const matchesSearch =
    !searchTerm ||
    node.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (typeof node.value === 'string' && node.value.toLowerCase().includes(searchTerm.toLowerCase()));

  // Format value for display
  const formatValue = (value: JsonValue, type: TreeNode['type']): string => {
    if (type === 'null') return 'null';
    if (type === 'string') return `"${value}"`;
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'number') return String(value);
    if (type === 'array') return `Array(${(value as JsonArray).length})`;
    if (type === 'object') return `Object(${Object.keys(value as JsonObject).length})`;
    return String(value);
  };

  const valueDisplay = formatValue(node.value, node.type);

  // Get color for value type
  const getValueColor = (type: TreeNode['type']): string => {
    switch (type) {
      case 'string':
        return 'text-green-600 dark:text-green-400';
      case 'number':
        return 'text-blue-600 dark:text-blue-400';
      case 'boolean':
        return 'text-purple-600 dark:text-purple-400';
      case 'null':
        return 'text-gray-500 dark:text-gray-400';
      default:
        return 'text-foreground';
    }
  };

  const childNodes = isExpanded ? buildTree(node.value, node.level + 1, node.path) : [];

  return (
    <div className={cn('font-mono text-sm', !matchesSearch && 'opacity-40')}>
      <div
        className={cn(
          'flex items-center gap-2 py-0.5 hover:bg-accent/50 rounded px-1 cursor-pointer',
          matchesSearch && searchTerm && 'bg-yellow-100 dark:bg-yellow-900/30',
        )}
        style={{ paddingLeft: `${node.level * 1.5}rem` }}
        onClick={() => isExpandable && onToggle(node.path)}
      >
        {isExpandable && (
          <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}
        {!isExpandable && <span className="w-4" />}

        <span className="text-blue-700 dark:text-blue-300 font-medium">{node.key}:</span>
        {!isExpandable && <span className={cn(getValueColor(node.type))}>{valueDisplay}</span>}
        {isExpandable && <span className="text-muted-foreground">{valueDisplay}</span>}
      </div>

      {isExpanded && childNodes.length > 0 && (
        <div>
          {childNodes.map((child) => (
            <JsonTreeNode
              key={child.path}
              node={child}
              onToggle={onToggle}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonViewer({
  data,
  className,
  maxHeight = '400px',
  defaultExpanded = true,
  searchable = true,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const jsonString = useMemo(() => JSON.stringify(data, null, 2), [data]);

  const rootNodes = useMemo(() => {
    if (typeof data === 'object' && data !== null) {
      return buildTree(data, 0, 'root');
    }
    // Primitive value
    const type = getType(data);
    return [
      {
        key: 'value',
        value: data as JsonValue,
        type,
        level: 0,
        path: 'root',
        expanded: false,
      },
    ];
  }, [data]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggle = (path: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Update node expanded state based on expandedNodes set
  const nodesWithExpandedState = useMemo(() => {
    return rootNodes.map((node) => ({
      ...node,
      expanded: expandedNodes.has(node.path) ?? node.expanded,
    }));
  }, [rootNodes, expandedNodes]);

  const handleExpandAll = () => {
    const allPaths = new Set<string>();
    const collectPaths = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'object' || node.type === 'array') {
          allPaths.add(node.path);
          const children = buildTree(node.value, node.level + 1, node.path);
          collectPaths(children);
        }
      }
    };
    collectPaths(rootNodes);
    setExpandedNodes(allPaths);
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  return (
    <div className={cn('border border-border rounded-lg bg-muted/30', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-semibold text-muted-foreground">JSON</span>
          {searchable && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-7 pl-8 pr-7 text-xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleExpandAll} className="h-7 text-xs">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCollapseAll} className="h-7 text-xs">
            Collapse All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div
        className="overflow-auto p-3"
        style={{ maxHeight }}
      >
        {nodesWithExpandedState.map((node) => (
          <JsonTreeNode key={node.path} node={node} onToggle={handleToggle} searchTerm={searchTerm} />
        ))}
      </div>
    </div>
  );
}
