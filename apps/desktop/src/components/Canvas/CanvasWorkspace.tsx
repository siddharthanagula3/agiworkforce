/**
 * Canvas/Whiteboard Workspace Component
 *
 * A full-featured drawing canvas with support for:
 * - Shapes (rectangles, circles, lines)
 * - Freehand drawing
 * - Text elements
 * - Pan and zoom
 * - Undo/Redo
 * - Export to PNG
 *
 * Uses local state management with optional Tauri backend integration.
 */

import {
  Circle,
  Download,
  Hand,
  Minus,
  MousePointer,
  Palette,
  PenTool,
  Redo2,
  RotateCcw,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { Slider } from '../ui/Slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip';

// Types
export type CanvasToolType = 'select' | 'rect' | 'circle' | 'line' | 'text' | 'freehand' | 'pan';

export interface Point {
  x: number;
  y: number;
}

export interface CanvasElement {
  id: string;
  type: 'rect' | 'circle' | 'line' | 'text' | 'freehand';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: Point[];
  text?: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
}

interface CanvasState {
  elements: CanvasElement[];
  selectedId: string | null;
  zoom: number;
  panOffset: Point;
}

interface HistoryEntry {
  elements: CanvasElement[];
}

interface CanvasWorkspaceProps {
  className?: string;
}

// Color presets
const COLOR_PRESETS = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

// Generate unique ID
const generateId = (): string => {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

export function CanvasWorkspace({ className }: CanvasWorkspaceProps) {
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [state, setState] = useState<CanvasState>({
    elements: [],
    selectedId: null,
    zoom: 1,
    panOffset: { x: 0, y: 0 },
  });

  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([{ elements: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Tool state
  const [activeTool, setActiveTool] = useState<CanvasToolType>('select');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(2);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);

  // Text input state
  const [textInputPosition, setTextInputPosition] = useState<Point | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Update canvas size on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(rect.width - 2, 400),
        height: Math.max(rect.height - 2, 300),
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: screenX, y: screenY };

      const rect = canvas.getBoundingClientRect();
      return {
        x: (screenX - rect.left - state.panOffset.x) / state.zoom,
        y: (screenY - rect.top - state.panOffset.y) / state.zoom,
      };
    },
    [state.zoom, state.panOffset],
  );

  // Push state to history
  const pushToHistory = useCallback(
    (newElements: CanvasElement[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ elements: newElements });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex],
  );

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const historyEntry = history[newIndex];
      if (historyEntry) {
        setState((prev) => ({
          ...prev,
          elements: historyEntry.elements,
          selectedId: null,
        }));
      }
    }
  }, [historyIndex, history]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const historyEntry = history[newIndex];
      if (historyEntry) {
        setState((prev) => ({
          ...prev,
          elements: historyEntry.elements,
          selectedId: null,
        }));
      }
    }
  }, [historyIndex, history]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Undo: Ctrl/Cmd + Z
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((isMeta && e.shiftKey && e.key === 'z') || (isMeta && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        e.preventDefault();
        const newElements = state.elements.filter((el) => el.id !== state.selectedId);
        setState((prev) => ({ ...prev, elements: newElements, selectedId: null }));
        pushToHistory(newElements);
        return;
      }

      // Tool shortcuts
      if (!isMeta && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setActiveTool('select');
            break;
          case 'r':
            setActiveTool('rect');
            break;
          case 'c':
            setActiveTool('circle');
            break;
          case 'l':
            setActiveTool('line');
            break;
          case 't':
            setActiveTool('text');
            break;
          case 'p':
            setActiveTool('freehand');
            break;
          case 'h':
            setActiveTool('pan');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, state.selectedId, state.elements, pushToHistory]);

  // Find element at point
  const findElementAtPoint = useCallback(
    (point: Point): CanvasElement | null => {
      // Check elements in reverse order (top to bottom)
      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        if (!el) continue;

        switch (el.type) {
          case 'rect':
            if (
              el.width !== undefined &&
              el.height !== undefined &&
              point.x >= el.x &&
              point.x <= el.x + el.width &&
              point.y >= el.y &&
              point.y <= el.y + el.height
            ) {
              return el;
            }
            break;
          case 'circle':
            if (el.radius !== undefined) {
              const dx = point.x - el.x;
              const dy = point.y - el.y;
              if (Math.sqrt(dx * dx + dy * dy) <= el.radius) {
                return el;
              }
            }
            break;
          case 'line':
            if (el.width !== undefined && el.height !== undefined) {
              // Simple line hit detection
              const lineLength = Math.sqrt(el.width * el.width + el.height * el.height);
              const d1 = Math.sqrt(Math.pow(point.x - el.x, 2) + Math.pow(point.y - el.y, 2));
              const d2 = Math.sqrt(
                Math.pow(point.x - (el.x + el.width), 2) +
                  Math.pow(point.y - (el.y + el.height), 2),
              );
              if (d1 + d2 < lineLength + 10) {
                return el;
              }
            }
            break;
          case 'text':
            // Approximate text bounds
            if (
              point.x >= el.x &&
              point.x <= el.x + (el.text?.length || 0) * 10 &&
              point.y >= el.y - 20 &&
              point.y <= el.y
            ) {
              return el;
            }
            break;
          case 'freehand':
            if (el.points && el.points.length > 0) {
              // Check if point is near any path segment
              for (const pathPoint of el.points) {
                const dx = point.x - pathPoint.x;
                const dy = point.y - pathPoint.y;
                if (Math.sqrt(dx * dx + dy * dy) < 10) {
                  return el;
                }
              }
            }
            break;
        }
      }
      return null;
    },
    [state.elements],
  );

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const point = screenToCanvas(e.clientX, e.clientY);

      if (activeTool === 'pan') {
        setIsPanning(true);
        setPanStart({ x: e.clientX - state.panOffset.x, y: e.clientY - state.panOffset.y });
        return;
      }

      if (activeTool === 'select') {
        const element = findElementAtPoint(point);
        setState((prev) => ({ ...prev, selectedId: element?.id || null }));
        if (element) {
          setIsDrawing(true);
          setDrawStart(point);
        }
        return;
      }

      if (activeTool === 'text') {
        setTextInputPosition(point);
        setTextInputValue('');
        setTimeout(() => textInputRef.current?.focus(), 0);
        return;
      }

      setIsDrawing(true);
      setDrawStart(point);

      if (activeTool === 'freehand') {
        setCurrentPath([point]);
      }
    },
    [activeTool, screenToCanvas, findElementAtPoint, state.panOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning && panStart) {
        setState((prev) => ({
          ...prev,
          panOffset: {
            x: e.clientX - panStart.x,
            y: e.clientY - panStart.y,
          },
        }));
        return;
      }

      if (!isDrawing || !drawStart) return;

      const point = screenToCanvas(e.clientX, e.clientY);

      if (activeTool === 'freehand') {
        setCurrentPath((prev) => [...prev, point]);
        return;
      }

      if (activeTool === 'select' && state.selectedId) {
        // Move selected element
        const dx = point.x - drawStart.x;
        const dy = point.y - drawStart.y;
        setState((prev) => ({
          ...prev,
          elements: prev.elements.map((el) => {
            if (el.id === prev.selectedId) {
              if (el.type === 'freehand' && el.points) {
                return {
                  ...el,
                  points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
                };
              }
              return { ...el, x: el.x + dx, y: el.y + dy };
            }
            return el;
          }),
        }));
        setDrawStart(point);
      }
    },
    [isPanning, panStart, isDrawing, drawStart, screenToCanvas, activeTool, state.selectedId],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning) {
        setIsPanning(false);
        setPanStart(null);
        return;
      }

      if (!isDrawing || !drawStart) {
        setIsDrawing(false);
        return;
      }

      const point = screenToCanvas(e.clientX, e.clientY);

      if (activeTool === 'select') {
        // Finalize move - push to history
        if (state.selectedId) {
          pushToHistory(state.elements);
        }
        setIsDrawing(false);
        setDrawStart(null);
        return;
      }

      let newElement: CanvasElement | null = null;

      switch (activeTool) {
        case 'rect': {
          const width = point.x - drawStart.x;
          const height = point.y - drawStart.y;
          if (Math.abs(width) > 5 && Math.abs(height) > 5) {
            newElement = {
              id: generateId(),
              type: 'rect',
              x: width > 0 ? drawStart.x : point.x,
              y: height > 0 ? drawStart.y : point.y,
              width: Math.abs(width),
              height: Math.abs(height),
              stroke: strokeColor,
              fill: fillColor,
              strokeWidth,
            };
          }
          break;
        }
        case 'circle': {
          const radius = Math.sqrt(
            Math.pow(point.x - drawStart.x, 2) + Math.pow(point.y - drawStart.y, 2),
          );
          if (radius > 5) {
            newElement = {
              id: generateId(),
              type: 'circle',
              x: drawStart.x,
              y: drawStart.y,
              radius,
              stroke: strokeColor,
              fill: fillColor,
              strokeWidth,
            };
          }
          break;
        }
        case 'line': {
          const lineLength = Math.sqrt(
            Math.pow(point.x - drawStart.x, 2) + Math.pow(point.y - drawStart.y, 2),
          );
          if (lineLength > 5) {
            newElement = {
              id: generateId(),
              type: 'line',
              x: drawStart.x,
              y: drawStart.y,
              width: point.x - drawStart.x,
              height: point.y - drawStart.y,
              stroke: strokeColor,
              fill: 'transparent',
              strokeWidth,
            };
          }
          break;
        }
        case 'freehand': {
          if (currentPath.length > 1) {
            newElement = {
              id: generateId(),
              type: 'freehand',
              x: 0,
              y: 0,
              points: currentPath,
              stroke: strokeColor,
              fill: 'transparent',
              strokeWidth,
            };
          }
          setCurrentPath([]);
          break;
        }
      }

      if (newElement) {
        const newElements = [...state.elements, newElement];
        setState((prev) => ({ ...prev, elements: newElements }));
        pushToHistory(newElements);
      }

      setIsDrawing(false);
      setDrawStart(null);
    },
    [
      isPanning,
      isDrawing,
      drawStart,
      screenToCanvas,
      activeTool,
      strokeColor,
      fillColor,
      strokeWidth,
      currentPath,
      state.elements,
      state.selectedId,
      pushToHistory,
    ],
  );

  // Handle text input
  const handleTextSubmit = useCallback(() => {
    if (textInputValue.trim() && textInputPosition) {
      const newElement: CanvasElement = {
        id: generateId(),
        type: 'text',
        x: textInputPosition.x,
        y: textInputPosition.y,
        text: textInputValue,
        stroke: strokeColor,
        fill: strokeColor,
        strokeWidth: 1,
      };
      const newElements = [...state.elements, newElement];
      setState((prev) => ({ ...prev, elements: newElements }));
      pushToHistory(newElements);
    }
    setTextInputPosition(null);
    setTextInputValue('');
  }, [textInputValue, textInputPosition, strokeColor, state.elements, pushToHistory]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply transformations
    ctx.save();
    ctx.translate(state.panOffset.x, state.panOffset.y);
    ctx.scale(state.zoom, state.zoom);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    const gridSize = 20;
    const startX = Math.floor(-state.panOffset.x / state.zoom / gridSize) * gridSize;
    const startY = Math.floor(-state.panOffset.y / state.zoom / gridSize) * gridSize;
    const endX = startX + canvas.width / state.zoom + gridSize * 2;
    const endY = startY + canvas.height / state.zoom + gridSize * 2;

    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }

    // Draw elements
    for (const el of state.elements) {
      ctx.strokeStyle = el.stroke;
      ctx.fillStyle = el.fill;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (el.type) {
        case 'rect':
          if (el.width !== undefined && el.height !== undefined) {
            if (el.fill !== 'transparent') {
              ctx.fillRect(el.x, el.y, el.width, el.height);
            }
            ctx.strokeRect(el.x, el.y, el.width, el.height);
          }
          break;
        case 'circle':
          if (el.radius !== undefined) {
            ctx.beginPath();
            ctx.arc(el.x, el.y, el.radius, 0, Math.PI * 2);
            if (el.fill !== 'transparent') {
              ctx.fill();
            }
            ctx.stroke();
          }
          break;
        case 'line':
          if (el.width !== undefined && el.height !== undefined) {
            ctx.beginPath();
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.x + el.width, el.y + el.height);
            ctx.stroke();
          }
          break;
        case 'text':
          if (el.text) {
            ctx.font = '16px Inter, sans-serif';
            ctx.fillStyle = el.stroke;
            ctx.fillText(el.text, el.x, el.y);
          }
          break;
        case 'freehand':
          if (el.points && el.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(el.points[0]!.x, el.points[0]!.y);
            for (let i = 1; i < el.points.length; i++) {
              ctx.lineTo(el.points[i]!.x, el.points[i]!.y);
            }
            ctx.stroke();
          }
          break;
      }

      // Draw selection indicator
      if (el.id === state.selectedId) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        switch (el.type) {
          case 'rect':
            if (el.width !== undefined && el.height !== undefined) {
              ctx.strokeRect(el.x - 4, el.y - 4, el.width + 8, el.height + 8);
            }
            break;
          case 'circle':
            if (el.radius !== undefined) {
              ctx.beginPath();
              ctx.arc(el.x, el.y, el.radius + 4, 0, Math.PI * 2);
              ctx.stroke();
            }
            break;
          case 'line':
            if (el.width !== undefined && el.height !== undefined) {
              ctx.strokeRect(
                Math.min(el.x, el.x + el.width) - 4,
                Math.min(el.y, el.y + el.height) - 4,
                Math.abs(el.width) + 8,
                Math.abs(el.height) + 8,
              );
            }
            break;
          case 'text':
            if (el.text) {
              const textWidth = ctx.measureText(el.text).width;
              ctx.strokeRect(el.x - 4, el.y - 20, textWidth + 8, 24);
            }
            break;
          case 'freehand':
            if (el.points && el.points.length > 0) {
              const minX = Math.min(...el.points.map((p) => p.x));
              const maxX = Math.max(...el.points.map((p) => p.x));
              const minY = Math.min(...el.points.map((p) => p.y));
              const maxY = Math.max(...el.points.map((p) => p.y));
              ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
            }
            break;
        }
        ctx.setLineDash([]);
      }
    }

    // Draw current freehand path
    if (activeTool === 'freehand' && currentPath.length > 1) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(currentPath[0]!.x, currentPath[0]!.y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i]!.x, currentPath[i]!.y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [
    state,
    currentPath,
    isDrawing,
    drawStart,
    activeTool,
    strokeColor,
    fillColor,
    strokeWidth,
    screenToCanvas,
    canvasSize,
  ]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setState((prev) => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 5) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setState((prev) => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, 0.1) }));
  }, []);

  const handleResetView = useCallback(() => {
    setState((prev) => ({ ...prev, zoom: 1, panOffset: { x: 0, y: 0 } }));
  }, []);

  // Clear canvas
  const handleClear = useCallback(() => {
    setState((prev) => ({ ...prev, elements: [], selectedId: null }));
    pushToHistory([]);
  }, [pushToHistory]);

  // Delete selected
  const handleDeleteSelected = useCallback(() => {
    if (!state.selectedId) return;
    const newElements = state.elements.filter((el) => el.id !== state.selectedId);
    setState((prev) => ({ ...prev, elements: newElements, selectedId: null }));
    pushToHistory(newElements);
  }, [state.selectedId, state.elements, pushToHistory]);

  // Export to PNG
  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `canvas-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Canvas exported successfully');
    } catch (error) {
      console.error('Failed to export canvas:', error);
      toast.error('Failed to export canvas');
    }
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setState((prev) => ({
        ...prev,
        zoom: Math.max(0.1, Math.min(5, prev.zoom * delta)),
      }));
    }
  }, []);

  // Tool button component
  const ToolButton = useMemo(() => {
    return function ToolButtonInner({
      tool,
      icon: Icon,
      label,
      shortcut,
    }: {
      tool: CanvasToolType;
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      shortcut: string;
    }) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTool === tool ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setActiveTool(tool)}
              className="h-9 w-9"
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>
              {label} ({shortcut})
            </p>
          </TooltipContent>
        </Tooltip>
      );
    };
  }, [activeTool]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex h-full flex-col bg-background border border-border rounded-lg',
          className,
        )}
        role="region"
        aria-label="Canvas workspace"
      >
        {/* Header toolbar */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Canvas</span>
            <span className="text-xs text-muted-foreground">
              {state.elements.length} element{state.elements.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Undo/Redo */}
            <div className="flex items-center gap-1 border-r border-border pr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="h-8 w-8"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="h-8 w-8"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
              </Tooltip>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1 border-r border-border pr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom Out</TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground w-12 text-center">
                {Math.round(state.zoom * 100)}%
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom In</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleResetView} className="h-8 w-8">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset View</TooltipContent>
              </Tooltip>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteSelected}
                    disabled={!state.selectedId}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Selected</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleClear} className="h-8 w-8">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear Canvas</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleExport} className="h-8">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export to PNG</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left toolbar */}
          <div className="flex flex-col gap-1 border-r border-border bg-muted/10 p-2">
            <ToolButton tool="select" icon={MousePointer} label="Select" shortcut="V" />
            <ToolButton tool="pan" icon={Hand} label="Pan" shortcut="H" />

            <div className="my-1 h-px bg-border" />

            <ToolButton tool="rect" icon={Square} label="Rectangle" shortcut="R" />
            <ToolButton tool="circle" icon={Circle} label="Circle" shortcut="C" />
            <ToolButton tool="line" icon={Minus} label="Line" shortcut="L" />
            <ToolButton tool="text" icon={Type} label="Text" shortcut="T" />
            <ToolButton tool="freehand" icon={PenTool} label="Freehand" shortcut="P" />

            <div className="my-1 h-px bg-border" />

            {/* Stroke color */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <div
                    className="h-5 w-5 rounded-sm border border-border"
                    style={{ backgroundColor: strokeColor }}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-auto p-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Stroke Color</p>
                  <div className="grid grid-cols-5 gap-1">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        className={cn(
                          'h-6 w-6 rounded-sm border-2',
                          strokeColor === color ? 'border-primary' : 'border-transparent',
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setStrokeColor(color)}
                      />
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Fill color */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <div
                    className="h-5 w-5 rounded-sm border border-border"
                    style={{
                      backgroundColor: fillColor === 'transparent' ? '#ffffff' : fillColor,
                      backgroundImage:
                        fillColor === 'transparent'
                          ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)'
                          : 'none',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 3px 3px',
                    }}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-auto p-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Fill Color</p>
                  <div className="grid grid-cols-5 gap-1">
                    <button
                      className={cn(
                        'h-6 w-6 rounded-sm border-2',
                        fillColor === 'transparent' ? 'border-primary' : 'border-transparent',
                        'bg-white',
                      )}
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)',
                        backgroundSize: '6px 6px',
                        backgroundPosition: '0 0, 3px 3px',
                      }}
                      onClick={() => setFillColor('transparent')}
                      title="Transparent"
                    />
                    {COLOR_PRESETS.slice(0, 9).map((color) => (
                      <button
                        key={color}
                        className={cn(
                          'h-6 w-6 rounded-sm border-2',
                          fillColor === color ? 'border-primary' : 'border-transparent',
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setFillColor(color)}
                      />
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Stroke width */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <div className="flex items-center justify-center">
                    <div
                      className="rounded-full bg-foreground"
                      style={{
                        width: Math.min(strokeWidth * 2, 16),
                        height: Math.min(strokeWidth * 2, 16),
                      }}
                    />
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-48 p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Stroke Width</p>
                    <span className="text-xs text-muted-foreground">{strokeWidth}px</span>
                  </div>
                  <Slider
                    value={[strokeWidth]}
                    onValueChange={([value]) => value !== undefined && setStrokeWidth(value)}
                    min={1}
                    max={20}
                    step={1}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Canvas container */}
          <div
            ref={containerRef}
            className="relative flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900"
          >
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className={cn(
                'cursor-crosshair',
                activeTool === 'select' && 'cursor-default',
                activeTool === 'pan' && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
                activeTool === 'text' && 'cursor-text',
              )}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />

            {/* Text input overlay */}
            {textInputPosition && (
              <input
                ref={textInputRef}
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTextSubmit();
                  } else if (e.key === 'Escape') {
                    setTextInputPosition(null);
                    setTextInputValue('');
                  }
                }}
                onBlur={handleTextSubmit}
                className="absolute bg-transparent border-none outline-none text-base font-sans"
                style={{
                  left: textInputPosition.x * state.zoom + state.panOffset.x,
                  top: textInputPosition.y * state.zoom + state.panOffset.y - 16,
                  color: strokeColor,
                  fontSize: 16 * state.zoom,
                }}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3 py-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Tool: {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}</span>
            {state.selectedId && <span>Selected: 1 element</span>}
          </div>
          <div className="flex items-center gap-4">
            <span>Zoom: {Math.round(state.zoom * 100)}%</span>
            <span>
              Pan: ({Math.round(state.panOffset.x)}, {Math.round(state.panOffset.y)})
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default CanvasWorkspace;
