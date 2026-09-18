export type DegradedMode = 'reduced' | 'queued' | 'read_only' | 'refused';

export interface CapabilityDegradation {
  /** The SLO id this capability is measured by, where one measures it. */
  id: string;
  capability: string;
  /** The dependency whose loss puts the capability in this mode. */
  dependency: string;
  mode: DegradedMode;
  /** What the product does instead. */
  behaviour: string;
  /** What the person is told, in the words the surface uses. */
  message: string;
  /** Whether work already accepted survives the degradation. */
  preservesWork: boolean;
}

/**
 * What every capability does when the thing it depends on is gone. A
 * capability with no entry here fails in whatever way its last error path
 * happens to produce, which is how an outage becomes a support queue: the test
 * beside this file refuses that by requiring a mode for each one.
 */
export const CAPABILITY_DEGRADATION: readonly CapabilityDegradation[] = [
  {
    id: 'authentication',
    capability: 'Authentication',
    dependency: 'the identity provider',
    mode: 'read_only',
    behaviour:
      'A session already established keeps working until it expires. A new sign-in is refused rather than granted on an unverified token.',
    message: 'Sign-in is temporarily unavailable. An open session is unaffected.',
    preservesWork: true,
  },
  {
    id: 'chat',
    capability: 'Chat',
    dependency: 'the model provider serving the selected route',
    mode: 'reduced',
    behaviour:
      'Auto rotates to another route for the same task. When every route in the plan refuses, the turn is failed rather than answered by a model the request excluded.',
    message: 'This model is overloaded right now.',
    preservesWork: true,
  },
  {
    id: 'work',
    capability: 'Work',
    dependency: 'the background job drain',
    mode: 'queued',
    behaviour:
      'Work is accepted onto its queue and held. Nothing is lost while the drain is down, and the run resumes from the queue when it returns.',
    message: 'This is queued and will run as soon as the workers catch up.',
    preservesWork: true,
  },
  {
    id: 'research',
    capability: 'Research',
    dependency: 'web search and the model that reads its results',
    mode: 'reduced',
    behaviour:
      'A run that loses search finishes on the sources it already gathered and the report says how many it reached, rather than presenting a partial sweep as a complete one.',
    message: 'Research finished on fewer sources than usual because search was unavailable.',
    preservesWork: true,
  },
  {
    id: 'code',
    capability: 'Code',
    dependency: 'the sandbox that executes code',
    mode: 'reduced',
    behaviour:
      'Code is still written and returned; it is not run. Nothing is presented as an execution result that was never executed.',
    message: 'Code execution is unavailable, so this was not run. The code itself is unchanged.',
    preservesWork: true,
  },
  {
    id: 'tool-execution',
    capability: 'Tools',
    dependency: 'the connector or MCP server behind the tool',
    mode: 'reduced',
    behaviour:
      'The failing tool is reported to the model as failed and the turn continues without it. A tool that cannot run is never silently skipped.',
    message: 'That tool could not run for this turn.',
    preservesWork: true,
  },
  {
    id: 'browser',
    capability: 'Browser',
    dependency: 'the paired browser or the extension',
    mode: 'refused',
    behaviour:
      'A browser action is refused at admission rather than queued: a page has moved on by the time the pairing returns, so a held action would act on a page nobody is looking at.',
    message: 'The browser is not reachable, so this action was not attempted.',
    preservesWork: false,
  },
  {
    id: 'remote-control',
    capability: 'Remote control',
    dependency: 'the paired device and the signaling server',
    mode: 'refused',
    behaviour:
      'A remote action is refused while the device is unreachable, for the same reason a browser action is.',
    message: 'That device is not reachable right now.',
    preservesWork: false,
  },
  {
    id: 'file-upload',
    capability: 'File upload',
    dependency: 'object storage',
    mode: 'refused',
    behaviour:
      'An upload is refused rather than accepted into a store that cannot hold it, so no attachment is referenced by a conversation without its bytes.',
    message: 'That file could not be stored. Try again in a moment.',
    preservesWork: false,
  },
  {
    id: 'file-parsing',
    capability: 'File parsing',
    dependency: 'the document parser',
    mode: 'reduced',
    behaviour:
      'The file stays attached and unparsed, and the turn proceeds without its text rather than with an empty extraction presented as the content.',
    message: 'This file is attached but could not be read into text.',
    preservesWork: true,
  },
  {
    id: 'search',
    capability: 'Search',
    dependency: 'the search provider',
    mode: 'reduced',
    behaviour:
      'The turn answers from the model and the conversation alone, and says that it did rather than implying the web was consulted.',
    message: 'Web search is unavailable, so this answer is not based on live results.',
    preservesWork: true,
  },
  {
    id: 'notifications',
    capability: 'Notifications',
    dependency: 'the email and push transports',
    mode: 'queued',
    behaviour:
      'The notification row is written and delivery is retried. The product never depends on a notification having arrived to consider the work done.',
    message: 'We could not reach you about this yet.',
    preservesWork: true,
  },
  {
    id: 'billing-events',
    capability: 'Billing',
    dependency: 'the payment provider',
    mode: 'read_only',
    behaviour:
      'Plans and balances are still readable and existing entitlements keep working. A purchase is refused rather than taken without a confirmed grant.',
    message: 'Payments are temporarily unavailable. Your current plan is unaffected.',
    preservesWork: true,
  },
];

export function degradationFor(id: string): CapabilityDegradation | undefined {
  return CAPABILITY_DEGRADATION.find((entry) => entry.id === id);
}
