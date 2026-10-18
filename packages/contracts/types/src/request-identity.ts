/**
 * The three identifiers every request carries, and the one it may inherit.
 *
 * - `requestId` is the call. It changes when the caller asks again.
 * - `operationId` is the thing being done, and survives every retry of it.
 * - `attemptId` is this try. Only this changes when the attempt is repeated.
 * - `parentTaskId` is the run that asked, absent when a person did.
 *
 * @module request-identity
 */

export interface RequestIdentity {
  requestId: string;
  operationId: string;
  attemptId: string;
  /** The task this request serves, when something other than a person asked. */
  parentTaskId?: string;
}
