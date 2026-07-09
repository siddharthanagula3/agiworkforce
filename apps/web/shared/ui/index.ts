// Shared UI Components - Public API
//
// NOTE: Primitives with a canonical counterpart in @agiworkforce/ui have been
// migrated off this fork and their re-exports removed here (restructure Wave 3).
// The dead leaf forks (a pkg counterpart existed and they had zero importers)
// were deleted 2026-07-09. What remains: web-divergent primitives pending a pkg
// enhancement decision (Button/Input/Textarea/Card/Dialog/Alert/Slider/
// ScrollArea), the form and imperative-toast systems (open decisions), the
// bespoke/aceternity components, and the no-counterpart shadcn sidebar island.

// Core form components (web-divergent: a11y/error props pkg lacks — pending decision)
export { Button, type ButtonProps } from './button';
export { buttonVariants } from './button-variants';
export { Input, type InputProps } from './input';
export { Textarea, type TextareaProps } from './textarea';
export { Slider } from './slider';

// Layout components (web-divergent)
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card';
export { ScrollArea, ScrollBar } from './scroll-area';

// Overlay components (web-divergent: closeButtonLabel/hideCloseButton)
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
} from './dialog';

// Feedback components (web-divergent alert + legacy imperative toast — decision pending)
export { Alert, AlertTitle, AlertDescription } from './alert';
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
