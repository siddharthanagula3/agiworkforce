/**
 * Not every synced row has its bytes in the cloud. A generated file left on the
 * desktop that made it syncs as metadata while the bytes stay there, so a client
 * that reads the row's presence as proof the content is fetchable shows a file
 * it cannot open. The row says what exists; this says where.
 */
export interface SyncResourceBytes {
  resourceId: string;
  /** False for a row that syncs while its bytes stay on the device that made them. */
  storedInCloud: boolean;
  holdingDeviceId: string | null;
  holdingDeviceName: string | null;
  byteSize: number | null;
}

export type SyncResourceAvailability =
  | { state: 'available' }
  | { state: 'on-another-device'; deviceId: string | null; deviceName: string | null }
  | { state: 'unavailable' };

export function resourceAvailability(
  bytes: SyncResourceBytes,
  thisDeviceId: string | null,
): SyncResourceAvailability {
  if (bytes.storedInCloud) return { state: 'available' };
  if (bytes.holdingDeviceId !== null && bytes.holdingDeviceId === thisDeviceId) {
    return { state: 'available' };
  }
  if (bytes.holdingDeviceId !== null || bytes.holdingDeviceName !== null) {
    return {
      state: 'on-another-device',
      deviceId: bytes.holdingDeviceId,
      deviceName: bytes.holdingDeviceName,
    };
  }
  return { state: 'unavailable' };
}

export function isResourceOpenableHere(availability: SyncResourceAvailability): boolean {
  return availability.state === 'available';
}

/**
 * A surface must be able to say which device holds the bytes rather than
 * showing a generic failure, so the distinction is kept in the value and not
 * flattened to a boolean.
 */
export function unavailableResourceHolder(
  availability: SyncResourceAvailability,
): { deviceId: string | null; deviceName: string | null } | null {
  return availability.state === 'on-another-device'
    ? { deviceId: availability.deviceId, deviceName: availability.deviceName }
    : null;
}

export function partitionByAvailability(
  resources: ReadonlyArray<SyncResourceBytes>,
  thisDeviceId: string | null,
): {
  openable: SyncResourceBytes[];
  elsewhere: SyncResourceBytes[];
  unavailable: SyncResourceBytes[];
} {
  const openable: SyncResourceBytes[] = [];
  const elsewhere: SyncResourceBytes[] = [];
  const unavailable: SyncResourceBytes[] = [];
  for (const resource of resources) {
    const availability = resourceAvailability(resource, thisDeviceId);
    if (availability.state === 'available') openable.push(resource);
    else if (availability.state === 'on-another-device') elsewhere.push(resource);
    else unavailable.push(resource);
  }
  return { openable, elsewhere, unavailable };
}
