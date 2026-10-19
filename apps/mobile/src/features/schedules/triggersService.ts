import {
  MANAGED_CLOUD_TRIGGERS_PATH,
  ManagedCloudEventTriggerCreatedResponseSchema,
  ManagedCloudEventTriggerDeliveryListResponseSchema,
  ManagedCloudEventTriggerListResponseSchema,
  managedCloudTriggerPath,
  managedCloudTriggersForTaskPath,
  managedCloudTriggerWatchPath,
  type ManagedCloudEventTrigger,
  type ManagedCloudEventTriggerCreated,
  type ManagedCloudEventTriggerDeliveryListResponse,
  type ManagedCloudEventTriggerInput,
  type ManagedCloudScheduleFieldCondition,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

export async function listScheduleTriggers(
  scheduleId: string,
  signal?: AbortSignal,
): Promise<ManagedCloudEventTrigger[]> {
  return ManagedCloudEventTriggerListResponseSchema.parse(
    await api.get<unknown>(managedCloudTriggersForTaskPath(scheduleId), { signal }),
  ).triggers;
}

export async function createScheduleTrigger(
  input: ManagedCloudEventTriggerInput,
): Promise<ManagedCloudEventTriggerCreated> {
  return ManagedCloudEventTriggerCreatedResponseSchema.parse(
    await api.post<unknown>(MANAGED_CLOUD_TRIGGERS_PATH, input),
  );
}

export async function setScheduleTriggerEnabled(
  triggerId: string,
  isEnabled: boolean,
): Promise<void> {
  await api.patch<unknown>(managedCloudTriggerPath(triggerId), { isEnabled });
}

export async function saveScheduleTriggerConditions(
  triggerId: string,
  conditions: ManagedCloudScheduleFieldCondition[],
): Promise<void> {
  await api.patch<unknown>(managedCloudTriggerPath(triggerId), { conditions });
}

export async function deleteScheduleTrigger(triggerId: string): Promise<void> {
  await api.delete<unknown>(managedCloudTriggerPath(triggerId));
}

export async function registerScheduleTriggerWatch(triggerId: string): Promise<void> {
  await api.post<unknown>(managedCloudTriggerWatchPath(triggerId), {});
}

export async function listScheduleTriggerDeliveries(
  triggerId: string,
): Promise<ManagedCloudEventTriggerDeliveryListResponse['events']> {
  return ManagedCloudEventTriggerDeliveryListResponseSchema.parse(
    await api.get<unknown>(`${managedCloudTriggerPath(triggerId)}/events`),
  ).events;
}
