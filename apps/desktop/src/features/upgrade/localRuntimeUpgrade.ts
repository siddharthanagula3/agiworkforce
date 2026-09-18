/**
 * The renderer half of the startup decision the Rust `upgrade` module makes.
 * The numbers are not repeated here: the backend reports what it found and
 * this maps that to what the person is told and what they may do about it.
 */
export type RecoveryAction =
  'start' | 'rebuildRuntimeArtifacts' | 'rebuildFromCloud' | 'holdForNewerData';

export interface UpgradeStatus {
  action: RecoveryAction;
  /** Only set for holdForNewerData: the format the data on disk was written in. */
  foundDataFormat?: number;
  supportedDataFormat?: number;
}

export interface UpgradeNotice {
  title: string;
  body: string;
  /** Whether the app may carry on into its normal window behind this notice. */
  blocking: boolean;
  /** Whether anything the user cannot fetch again is at risk. */
  localDataAtRisk: boolean;
  actionLabel: string | null;
}

const REBUILD_BODY =
  'The local model runtime changed in this version, so anything it had cached is being built again. Your conversations, settings and downloaded models are untouched.';

const CLOUD_BODY =
  'The synced part of your local database could not be opened, so it is being fetched from your account again. Anything stored only on this device stays where it is.';

/**
 * A build that does not understand the data is never the build that decides to
 * migrate it, so the newer-data case blocks and offers no repair action: the
 * only safe move is installing the version that wrote it.
 */
export function upgradeNotice(status: UpgradeStatus): UpgradeNotice | null {
  switch (status.action) {
    case 'start':
      return null;
    case 'rebuildRuntimeArtifacts':
      return {
        title: 'Rebuilding the local model runtime',
        body: REBUILD_BODY,
        blocking: false,
        localDataAtRisk: false,
        actionLabel: null,
      };
    case 'rebuildFromCloud':
      return {
        title: 'Restoring your synced data',
        body: CLOUD_BODY,
        blocking: false,
        localDataAtRisk: false,
        actionLabel: null,
      };
    case 'holdForNewerData':
      return {
        title: 'This version is older than your data',
        body: `Your local data was written by a newer version of AGI Desktop (format ${
          status.foundDataFormat ?? 'unknown'
        }; this version reads ${
          status.supportedDataFormat ?? 'unknown'
        }). Nothing has been changed or removed. Install the newer version again to open it.`,
        blocking: true,
        localDataAtRisk: false,
        actionLabel: 'Get the newer version',
      };
  }
}

/** Whether the updater may offer this release to an install holding this data. */
export function updaterMayOffer(installedDataFormat: number, offeredDataFormat: number): boolean {
  return offeredDataFormat >= installedDataFormat;
}
