/**
 * UI Component Library
 *
 * Primitive React components (shadcn/radix-based design system).
 * Moved here from src/components/ui/ in the Phase 5 reorg. The forwarding
 * layer that reorg left at src/components/ui/ is deleted — every caller
 * imports '@/ui/X' directly, and check-structure-conventions.mjs fails the
 * build if that path comes back.
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
