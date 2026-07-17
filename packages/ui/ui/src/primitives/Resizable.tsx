'use client';

import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '../cn';

/**
 * Faithful port of apps/web/shared/ui/resizable.tsx — the file actually
 * exported from web's barrel (apps/web/shared/ui/index.ts re-exports
 * ResizablePanelGroup/ResizablePanel/ResizableHandle from './resizable').
 * A second, unexported apps/web/shared/ui/resizable-panels.tsx also exists
 * with a pure data-attribute-driven API and richer vertical-handle styling,
 * but nothing imports it, so it is not the port source. `direction` is a
 * back-compat alias resolved ahead of the primitive's own `orientation`
 * prop; react-resizable-panels' `Group` is a plain function component with
 * no forwardRef (it exposes `elementRef`/`groupRef` instead), so there is
 * no ref to thread here.
 */
const ResizablePanelGroup = ({
  className,
  direction,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group> & {
  direction?: 'horizontal' | 'vertical';
}) => (
  <ResizablePrimitive.Group
    orientation={props.orientation ?? direction ?? 'horizontal'}
    className={cn(
      'flex h-full w-full',
      (props.orientation ?? direction) === 'vertical' && 'flex-col',
      className,
    )}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
