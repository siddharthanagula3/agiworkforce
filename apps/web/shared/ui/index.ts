// Shared UI Components - Public API
//
// NOTE: Primitives with a canonical counterpart in @agiworkforce/ui are
// re-exported from the package (restructure Wave 3). The previously
// web-divergent forks (Button/Input/Textarea/Card/ScrollArea/Dialog/Alert/
// Slider) were migrated onto the enhanced canonical primitives and their local
// copies deleted 2026-07-09. What remains web-local: the form and imperative-
// toast systems (open decisions), the bespoke/aceternity components, and the
// no-counterpart shadcn sidebar island.

// Core form components (canonical @agiworkforce/ui)
export { Button, buttonVariants, type ButtonProps } from '@agiworkforce/ui';
export { Input, type InputProps } from '@agiworkforce/ui';
export { Textarea, type TextareaProps } from '@agiworkforce/ui';
export { Slider } from '@agiworkforce/ui';

// Layout components (canonical @agiworkforce/ui)
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '@agiworkforce/ui';
export { ScrollArea, ScrollBar } from '@agiworkforce/ui';

// Overlay components (canonical @agiworkforce/ui)
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@agiworkforce/ui';

// Feedback components (Alert canonical @agiworkforce/ui; legacy imperative toast below — decision pending)
export { Alert, AlertTitle, AlertDescription } from '@agiworkforce/ui';
export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastProps,
  type ToastActionElement,
} from './toast';
export { Toaster } from './toaster';
export { useToast, toast } from './use-toast';

// Form components (react-hook-form FormField collides with pkg FormField — decision pending)
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from './form';
export { FormFieldContext, FormItemContext } from './form-hooks';

// Sidebar island (pkg Sidebar is a different bespoke component; no shared counterpart)
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from './sidebar';
export { SidebarContext, useSidebar } from './sidebar-hooks';
export { sidebarMenuButtonVariants } from './sidebar-variants';
export {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_MOBILE,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_KEYBOARD_SHORTCUT,
} from './sidebar-constants';

// Chat components (bespoke — no generic pkg counterpart)
export {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleAvatar,
  ChatBubbleAction,
  ChatBubbleActionWrapper,
} from './chat-bubble';
export { ChatInput } from './chat-input';
export { ChatMessageList } from './chat-message-list';
export {
  ExpandableChat,
  ExpandableChatHeader,
  ExpandableChatBody,
  ExpandableChatFooter,
  type ChatPosition,
  type ChatSize,
} from './expandable-chat';
export { ExpandableChatDemo } from './expandable-chat-demo';
export { MessageLoading } from './message-loading';
export { PromptInputBox } from './ai-prompt-box';

// Loading components (bespoke)
export { DashboardLoading, ChatLoading, DataLoading } from './premium-loading';
export { SkeletonText, SkeletonCard, SkeletonAvatar, SkeletonTable } from './skeleton-loader';
export { default as LoadingSpinner } from './loading-spinner';

// Animation and effects (bespoke/aceternity)
export { AnimatedBeam } from './animated-beam';
export { AnimatedGradientText } from './animated-gradient-text';
export { BentoGrid, BentoCard } from './bento-grid';
export { CountdownTimer } from './countdown-timer';
export { getOneMonthFromNow, createDiscountEndDate } from './countdown-utils';
export { FloatingDock } from './floating-dock';
export { InteractiveHoverCard } from './interactive-hover-card';
export { Particles } from './particles';
export { Spotlight, MouseSpotlight } from './spotlight';

// Sonner toast (alternative — the canonical SonnerToaster lives in @agiworkforce/ui)
export { Toaster as SonnerToaster } from './sonner';
export { toast as sonnerToast } from './sonner-utils';
