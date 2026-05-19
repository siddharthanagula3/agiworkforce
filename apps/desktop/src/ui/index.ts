/**
 * UI Component Library
 *
 * Primitive React components (shadcn/radix-based design system).
 * Moved here from src/components/ui/ in Phase 5 reorg.
 *
 * Callers at src/components/** still use '../ui/Button' etc. — those
 * resolve via the legacy barrel at src/components/ui/index.ts.
 * New code should import directly from src/ui/*.
 */

// Core Components
export * from './Accordion';
export * from './Alert';
export * from './AlertDialog';
export * from './Badge';
export * from './Button';
export * from './Card';
export * from './Checkbox';
export * from './Collapsible';
export * from './Dialog';
export * from './DropdownMenu';
export * from './HoverCard';
export * from './Input';
export * from './Label';
export * from './Popover';
export * from './Progress';
export * from './ScrollArea';
export * from './Select';
export * from './Separator';
export * from './Slider';
export * from './Spinner';
export * from './Switch';
export * from './Table';
export * from './Tabs';
export * from './Textarea';
export * from './Toast';
export * from './Toaster';
export * from './Tooltip';

// Enhanced Components (Accessibility & UX Improvements)
export * from './AccessibleDialog';
export * from './ConfirmDialog';
export * from './ContextMenu';
export * from './EmptyState';
export * from './FormField';
export * from './LoadingButton';
export * from './PromptDialog';
export * from './ResizeHandle';
export * from './ResponsiveContainer';
export * from './SectionErrorBoundary';
export * from './Skeleton';
