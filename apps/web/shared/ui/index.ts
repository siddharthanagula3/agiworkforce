// Shared UI Components - Public API
//
// NOTE: Primitives with a canonical counterpart in @agiworkforce/ui have been
// migrated off this fork and their re-exports removed here. What remains are the
// residual forks: web-divergent primitives pending a pkg enhancement decision
// (Button/Input/Textarea/Card/Dialog/Alert/Slider/ScrollArea), the form and
// imperative-toast systems (open decisions), the bespoke/aceternity components,
// the no-counterpart shadcn sidebar island, and dead leaf forks kept for a
// separate dead-code cleanup pass.

// Core form components
export { Button, type ButtonProps } from './button';
export { buttonVariants } from './button-variants';
export { Input, type InputProps } from './input';
export { Textarea, type TextareaProps } from './textarea';
export { RadioGroup, RadioGroupItem } from './radio-group';
export { Slider } from './slider';

// Layout components
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card';
export { ScrollArea, ScrollBar } from './scroll-area';
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './resizable';
export { AspectRatio } from './aspect-ratio';

// Navigation components
export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from './navigation-menu';
export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from './breadcrumb';
export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination';

// Overlay components
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
export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from './drawer';
export { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';

// Menu components
export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
} from './context-menu';
export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
} from './menubar';

// Feedback components
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

// Data display components
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';

// Toggle components
export { Toggle } from './toggle';
export { ToggleGroup, ToggleGroupItem } from './toggle-group';

// Form components
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

// Input components
export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from './input-otp';

// Sidebar components
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

// Carousel
export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './carousel';

// Chat components
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

// Loading components
export { DashboardLoading, ChatLoading, DataLoading } from './premium-loading';
export { SkeletonText, SkeletonCard, SkeletonAvatar, SkeletonTable } from './skeleton-loader';
export { default as LoadingSpinner } from './loading-spinner';

// Animation and effects
export { AnimatedBeam } from './animated-beam';
export { AnimatedGradientText } from './animated-gradient-text';
export { BentoGrid, BentoCard } from './bento-grid';
export { CountdownTimer } from './countdown-timer';
export { getOneMonthFromNow, createDiscountEndDate } from './countdown-utils';
export { FloatingDock } from './floating-dock';
export { InteractiveHoverCard } from './interactive-hover-card';
export { Particles } from './particles';
export { Spotlight, MouseSpotlight } from './spotlight';

// Sonner toast (alternative)
export { Toaster as SonnerToaster } from './sonner';
export { toast as sonnerToast } from './sonner-utils';
