/**
 * A `.strict()` Zod schema that validates an object our own code produces is
 * a hand-copied shape of some TypeScript producer type, and copies drift:
 * AGI-129 (billing.routeId, d7d32eba7), AGI-130 (durable provider step usage,
 * 4a432b148) and its settlement-side sibling (getCloudAgentExecutionUsage)
 * were all a producer type gaining an optional field a `.strict()` schema
 * elsewhere never learned about, so a real, valid production object failed
 * validation and the durable turn silently died.
 *
 * `SameKeys<A, B>` fails to compile (widens from the literal `true` its call
 * sites assign) unless the key SETS of two types match exactly in both
 * directions. Pair it with a `z.infer<typeof Schema>` on one side and the
 * producer type on the other at every such boundary, so a schema/producer
 * drift is a compile error instead of a runtime ZodError three hops deep in
 * a durable step.
 */
export type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;
