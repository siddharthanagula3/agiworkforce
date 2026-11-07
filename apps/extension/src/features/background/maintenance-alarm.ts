/** One demand-driven alarm, shared by all background maintenance work. */
export interface MaintenanceAlarmPort {
  read(): Promise<{ periodInMinutes?: number } | undefined>;
  create(): Promise<void>;
  clear(): Promise<void>;
  periodInMinutes: number;
  runPass(): Promise<boolean>;
  onError(error: unknown): void;
}

export function createMaintenanceAlarmController(port: MaintenanceAlarmPort) {
  let desiredPresent = false;
  let knownPresence: 'unknown' | 'present' | 'absent' = 'unknown';
  let demandRevision = 0;
  let reconciliationRevision = 0;
  let reconciliation: Promise<void> | null = null;
  let settlement: Promise<void> | null = null;

  function reconcile(): Promise<void> {
    reconciliationRevision += 1;
    if (reconciliation) return reconciliation;
    // Install the promise before running any injected operation, including a
    // synchronous throw. The finally clears ownership before this promise ends.
    reconciliation = Promise.resolve().then(async () => {
      try {
        let observedRevision: number;
        do {
          observedRevision = reconciliationRevision;
          // Alarms survive worker restarts and may change externally. An old
          // in-memory observation is never sufficient to skip this read.
          const alarm = await port.read();
          knownPresence = alarm ? 'present' : 'absent';
          if (desiredPresent) {
            if (knownPresence !== 'present' || alarm?.periodInMinutes !== port.periodInMinutes) {
              await port.create();
              knownPresence = 'present';
            }
          } else if (knownPresence !== 'absent') {
            await port.clear();
            knownPresence = 'absent';
          }
          // Demand can change while either the read or mutation is pending.
          // Serialize the next operation behind its actual completion.
        } while (observedRevision !== reconciliationRevision);
      } catch (error) {
        knownPresence = 'unknown';
        port.onError(error);
        // Do not spin on an immediate API failure. A later external demand,
        // alarm event, or worker start may try again.
      } finally {
        reconciliation = null;
      }
    });
    return reconciliation;
  }

  function requestWork(): void {
    demandRevision += 1;
    desiredPresent = true;
    void reconcile();
  }

  function settle(): Promise<void> {
    if (settlement) return settlement;
    const startedAtDemand = demandRevision;
    settlement = Promise.resolve().then(async () => {
      try {
        const outstanding = await port.runPass();
        if (startedAtDemand === demandRevision) desiredPresent = outstanding;
        await reconcile();
      } catch (error) {
        // An incomplete pass cannot establish that the worker has no work.
        desiredPresent = true;
        port.onError(error);
        await reconcile();
      } finally {
        settlement = null;
      }
    });
    return settlement;
  }

  return { requestWork, settle };
}
