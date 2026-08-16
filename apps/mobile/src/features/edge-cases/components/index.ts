/**
 * Edge-case modals — all 10 safety/UX nets for AGI Mobile v1.
 *
 * Import from the feature barrel rather than legacy component paths:
 *   import { OfflineBanner, BatteryLowModal } from '@/src/features/edge-cases';
 */

export { OfflineBanner } from './OfflineBanner';
export { ModelLoadingFirstRunModal } from './ModelLoadingFirstRunModal';
export type { ModelLoadingFirstRunModalProps } from './ModelLoadingFirstRunModal';
export { StorageFullModal } from './StorageFullModal';
export type { StorageFullModalProps } from './StorageFullModal';
export { ThermalThrottleModal } from './ThermalThrottleModal';
export type { ThermalThrottleModalProps } from './ThermalThrottleModal';
export { BatteryLowModal } from './BatteryLowModal';
export type { BatteryLowModalProps } from './BatteryLowModal';
export { ImageTooLargeModal } from './ImageTooLargeModal';
export type { ImageTooLargeModalProps } from './ImageTooLargeModal';
export { FileTooLargeModal } from './FileTooLargeModal';
export type { FileTooLargeModalProps } from './FileTooLargeModal';
export { FileUnreadableModal } from './FileUnreadableModal';
export type { FileUnreadableModalProps } from './FileUnreadableModal';
export { CloudTeaseModal } from './CloudTeaseModal';
export type { CloudTeaseModalProps } from './CloudTeaseModal';
export { ModelMissingError, DiskFullError, NetworkError } from './MessageErrorScreen';

export { EDGE_COPY } from './copy';
