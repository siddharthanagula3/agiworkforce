import { BROWSER_TOOL_DEFINITIONS, isTaskTabAction } from './browserToolDefinitions';

export type SensitiveSiteClass = 'banking' | 'health' | 'identity_provider' | 'password_manager';

export type AlwaysAskReason =
  | 'download'
  | 'upload'
  | 'sensitive_input'
  | 'unidentified_input'
  | 'sensitive_site'
  | 'authorization'
  | 'authentication'
  | 'payment'
  | 'publish'
  | 'selection'
  | 'history_navigation'
  | 'reload'
  | 'tab_management'
  | 'window_resize'
  | 'site_tool'
  | 'permission_change'
  | 'purchase'
  | 'terms';

export interface ActionApprovalRequirement {
  readonly alwaysAsk: boolean;
  readonly reason?: AlwaysAskReason;
  readonly siteClass?: SensitiveSiteClass;
}

export interface ActionApprovalInput {
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly pageUrl: string | null;
  readonly targetSignature?: string | null;
  readonly sourceSignature?: string | null;
  readonly destinationSignature?: string | null;
}

const SENSITIVE_HOSTS: Readonly<Record<SensitiveSiteClass, readonly string[]>> = {
  banking: [
    'chase.com',
    'bankofamerica.com',
    'wellsfargo.com',
    'citi.com',
    'citibank.com',
    'capitalone.com',
    'usbank.com',
    'pnc.com',
    'truist.com',
    'schwab.com',
    'fidelity.com',
    'vanguard.com',
    'robinhood.com',
    'etrade.com',
    'americanexpress.com',
    'discover.com',
    'ally.com',
    'sofi.com',
    'chime.com',
    'paypal.com',
    'venmo.com',
    'cash.app',
    'zellepay.com',
    'wise.com',
    'revolut.com',
    'monzo.com',
    'hsbc.com',
    'barclays.co.uk',
    'lloydsbank.com',
    'natwest.com',
    'santander.com',
    'coinbase.com',
    'kraken.com',
    'binance.com',
    'gemini.com',
  ],
  health: [
    'mychart.com',
    'mychart.org',
    'kp.org',
    'healthcare.gov',
    'medicare.gov',
    'labcorp.com',
    'questdiagnostics.com',
    'zocdoc.com',
    'teladoc.com',
    'onemedical.com',
    'followmyhealth.com',
    'patientportal.com',
    'nhs.uk',
    'anthem.com',
    'aetna.com',
    'cigna.com',
    'uhc.com',
    'myuhc.com',
    'humana.com',
    'bcbs.com',
  ],
  identity_provider: [
    'accounts.google.com',
    'login.microsoftonline.com',
    'login.live.com',
    'account.live.com',
    'appleid.apple.com',
    'account.apple.com',
    'idmsa.apple.com',
    'okta.com',
    'oktapreview.com',
    'auth0.com',
    'onelogin.com',
    'duosecurity.com',
    'pingidentity.com',
    'jumpcloud.com',
    'login.gov',
    'id.me',
    'clerk.accounts.dev',
  ],
  password_manager: [
    '1password.com',
    '1password.eu',
    '1password.ca',
    'bitwarden.com',
    'bitwarden.eu',
    'lastpass.com',
    'dashlane.com',
    'keepersecurity.com',
    'nordpass.com',
    'roboform.com',
    'pass.proton.me',
  ],
};

const SENSITIVE_HOST_LABELS: ReadonlyArray<readonly [RegExp, SensitiveSiteClass]> = [
  [/(^|[.-])(bank|banking|creditunion|onlinebanking)([.-]|$)/, 'banking'],
  [/(^|[.-])(mychart|patientportal)([.-]|$)/, 'health'],
  [/(^|\.)(sso|login|signin|auth|idp|adfs)\./, 'identity_provider'],
  [/(^|\.)vault\./, 'password_manager'],
];

const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'read_console',
  'read_network',
  'ask_user_to_take_over',
]);

const PAGE_READING_TOOLS: ReadonlySet<string> = new Set([
  ...READ_ONLY_TOOLS,
  'screenshot',
  'scroll',
  'read_dom',
  'find',
  'list_tabs',
  'discover_site_tools',
]);

const PURCHASE_CONTROL_LABEL =
  /\b(place (your |my )?order|buy (it )?now|complete (your |my )?(purchase|order|payment|checkout)|confirm (and pay|your order|order|purchase|payment)|pay now|submit (order|payment)|subscribe and pay|start (your |my )?(paid )?(subscription|membership)|send money|transfer (money|funds))\b|^\s*(pay|purchase|buy|donate)\b/i;

export const PURCHASE_REFUSAL =
  'Not done: this completes a purchase or payment, which the browser agent never does itself. Call ask_user_to_take_over so the user can check the amount and finish it.';

export function readsWithoutActing(toolName: string, siteToolEffect?: 'read' | 'write'): boolean {
  return siteToolEffect === undefined
    ? PAGE_READING_TOOLS.has(toolName)
    : siteToolEffect === 'read';
}

const FILE_INPUT_SELECTOR = /type\s*=\s*["']?file\b/i;

const SENSITIVE_FIELD_LABEL =
  /\b(password|secret|api[-_ ]?key|token|private[-_ ]?key|recovery[-_ ]?code|card ?number|credit ?card|cc-?number|cvv|cvc|security code|expir\w*|ssn|social security|routing|account ?number|iban|swift|tax ?id|passport|date[-_ ]?of[-_ ]?birth|dob|one[- ]time|otp|passcode|verification code|2fa|mfa|pin)\b/i;

const AUTHENTICATION_CONTROL =
  /\b(sign[-_ ]?in|log[-_ ]?in|authenticate|enter password|verify identity)\b/i;
const AUTHORIZATION_CONTROL = /\b(authorize|grant access|allow access|connect account)\b/i;
const TERMS_CONTROL =
  /\b(i agree|i accept|agree (to|and continue)|accept (the |all )?(terms|conditions|agreement|policy|policies))\b/i;
const PAYMENT_CONTROL =
  /\b(pay|payment|purchase|buy|checkout|place order|confirm order|transfer|withdraw|send money)\b/i;
const PUBLISH_CONTROL = /\b(publish|post|send|submit|delete|remove permanently)\b/i;
const PERMISSION_CONTROL =
  /\b(permission|access rights|api[-_ ]?keys|access[-_ ]?tokens|sharing|share|grant|revoke|invite|member role)\b/i;
const AUTHENTICATION_PATH =
  /\/(login|log[-_]?in|signin|sign[-_]?in|authenticate|authentication|reset[-_]?password|verify[-_]?identity)\b/i;

const PERMISSION_PATH =
  /\/(settings|account|security|myaccount|admin)\b.*\b(permissions?|connected[-_ ]?apps|connections|applications|authorized[-_]?(apps|applications)|third[-_]party|oauth|api[-_]?keys|tokens|sharing|roles|members)\b/i;

function hostMatches(host: string, entry: string): boolean {
  return host === entry || host.endsWith(`.${entry}`);
}

function parseUrl(url: string | null | undefined): URL | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function classifySensitiveSite(url: string | null | undefined): SensitiveSiteClass | null {
  const parsed = parseUrl(url);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return null;
  const host = parsed.hostname.toLowerCase();
  for (const [siteClass, hosts] of Object.entries(SENSITIVE_HOSTS) as Array<
    [SensitiveSiteClass, readonly string[]]
  >) {
    if (hosts.some((entry) => hostMatches(host, entry))) return siteClass;
  }
  for (const [pattern, siteClass] of SENSITIVE_HOST_LABELS) {
    if (pattern.test(host)) return siteClass;
  }
  return null;
}

export function isAuthorizationRequest(url: string | null | undefined): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const params = parsed.searchParams;
  if (params.has('client_id') && (params.has('response_type') || params.has('redirect_uri'))) {
    return true;
  }
  return /\/(oauth2?|openid-connect|saml2?)\/(authorize|auth|consent|sso)\b/i.test(parsed.pathname);
}

export function isPermissionChangePage(url: string | null | undefined): boolean {
  const parsed = parseUrl(url);
  return parsed ? PERMISSION_PATH.test(parsed.pathname) : false;
}

interface SignatureParts {
  tag: string;
  role: string;
  type: string;
  name: string;
  label: string;
}

function parseSignature(signature: string | null | undefined): SignatureParts | null {
  if (typeof signature !== 'string' || signature.length === 0) return null;
  const parts = signature.split('|');
  if (parts.length < 5) return null;
  const [tag = '', role = '', type = '', name = '', ...rest] = parts;
  if (!/^[a-z][a-z0-9-]*$/i.test(tag)) return null;
  return {
    tag: tag.toLowerCase(),
    role: role.toLowerCase(),
    type: type.toLowerCase(),
    name,
    label: rest.join('|'),
  };
}

function isButtonLike(target: SignatureParts): boolean {
  if (target.tag === 'button' || target.role === 'button') return true;
  return target.tag === 'input' && ['submit', 'button', 'image'].includes(target.type);
}

function completesPurchase(target: SignatureParts | null): boolean {
  return target !== null && isButtonLike(target) && PURCHASE_CONTROL_LABEL.test(target.label);
}

function targetsFileInput(input: ActionApprovalInput, target: SignatureParts | null): boolean {
  if (target?.tag === 'input' && target.type === 'file') return true;
  const selector = input.args['selector'];
  return typeof selector === 'string' && FILE_INPUT_SELECTOR.test(selector);
}

function targetsSensitiveField(target: SignatureParts | null): boolean {
  if (!target) return false;
  if (target.type === 'password') return true;
  return SENSITIVE_FIELD_LABEL.test(targetLabel(target));
}

function targetLabel(target: SignatureParts): string {
  return `${target.name} ${target.label}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
}

function controlApprovalReason(target: SignatureParts): AlwaysAskReason | null {
  const label = targetLabel(target);
  if (AUTHENTICATION_CONTROL.test(label)) return 'authentication';
  if (AUTHORIZATION_CONTROL.test(label)) return 'authorization';
  if (TERMS_CONTROL.test(label)) return 'terms';
  if (PAYMENT_CONTROL.test(label)) return 'payment';
  if (PERMISSION_CONTROL.test(label)) return 'permission_change';
  if (PUBLISH_CONTROL.test(label)) return 'publish';
  return null;
}

const ASK_NOT_REQUIRED: ActionApprovalRequirement = { alwaysAsk: false };

export function registeredSiteToolApprovalRequirement(input: {
  readonly pageUrl: string | null;
  readonly effect: 'read' | 'write';
  readonly source: 'imperative' | 'declarative';
}): ActionApprovalRequirement {
  if (input.source !== 'imperative' && input.source !== 'declarative') {
    throw new Error('The page tool has no registered execution surface.');
  }
  if (input.effect !== 'read' && input.effect !== 'write') {
    throw new Error('The page tool has no verified action effect.');
  }
  const siteClass = classifySensitiveSite(input.pageUrl);
  if (siteClass) return { alwaysAsk: true, reason: 'sensitive_site', siteClass };
  if (isAuthorizationRequest(input.pageUrl)) return { alwaysAsk: true, reason: 'authorization' };
  if (isPermissionChangePage(input.pageUrl))
    return { alwaysAsk: true, reason: 'permission_change' };
  const pageUrl = parseUrl(input.pageUrl);
  if (!pageUrl || (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:')) {
    return { alwaysAsk: true, reason: 'unidentified_input' };
  }
  if (AUTHENTICATION_PATH.test(pageUrl.pathname))
    return { alwaysAsk: true, reason: 'authentication' };
  return ASK_NOT_REQUIRED;
}

export function approvalRequirement(input: ActionApprovalInput): ActionApprovalRequirement {
  const { toolName } = input;
  if (!BROWSER_TOOL_DEFINITIONS.some((tool) => tool.function.name === toolName)) {
    throw new Error(`Unsupported browser action: ${toolName}`);
  }
  if (toolName === 'download_file') return { alwaysAsk: true, reason: 'download' };
  if (toolName === 'upload_file') return { alwaysAsk: true, reason: 'upload' };
  if (toolName === 'select_option') return { alwaysAsk: true, reason: 'selection' };
  if (toolName === 'go_back' || toolName === 'go_forward')
    return { alwaysAsk: true, reason: 'history_navigation' };
  if (toolName === 'reload') return { alwaysAsk: true, reason: 'reload' };
  if (isTaskTabAction(toolName)) return { alwaysAsk: true, reason: 'tab_management' };
  if (toolName === 'resize_window') return { alwaysAsk: true, reason: 'window_resize' };
  if (toolName === 'call_site_tool') return { alwaysAsk: true, reason: 'site_tool' };
  if (toolName === 'discover_site_tools') return ASK_NOT_REQUIRED;

  const target = parseSignature(input.targetSignature);
  const gestures = toolName === 'drag' || toolName === 'swipe';
  const targets = gestures
    ? [parseSignature(input.sourceSignature), parseSignature(input.destinationSignature)]
    : [target];
  const acts =
    toolName === 'click' ||
    toolName === 'type' ||
    toolName === 'hover' ||
    toolName === 'press_key' ||
    gestures;
  if (acts && targets.some((entry) => targetsFileInput(input, entry))) {
    return { alwaysAsk: true, reason: 'upload' };
  }
  if (acts && targets.some(targetsSensitiveField)) {
    return { alwaysAsk: true, reason: 'sensitive_input' };
  }
  if (acts && targets.some(completesPurchase)) {
    return { alwaysAsk: true, reason: 'purchase' };
  }
  if (acts) {
    for (const entry of targets) {
      const reason = entry && controlApprovalReason(entry);
      if (reason) return { alwaysAsk: true, reason };
    }
  }

  if (toolName === 'navigate') {
    const destination = typeof input.args['url'] === 'string' ? input.args['url'] : null;
    const destinationClass = classifySensitiveSite(destination);
    if (destinationClass) {
      return { alwaysAsk: true, reason: 'sensitive_site', siteClass: destinationClass };
    }
    if (isAuthorizationRequest(destination)) return { alwaysAsk: true, reason: 'authorization' };
  }

  if (READ_ONLY_TOOLS.has(toolName)) return ASK_NOT_REQUIRED;

  const siteClass = classifySensitiveSite(input.pageUrl);
  if (siteClass) return { alwaysAsk: true, reason: 'sensitive_site', siteClass };

  const pageUrl = parseUrl(input.pageUrl);
  if (acts && pageUrl && AUTHENTICATION_PATH.test(pageUrl.pathname)) {
    return { alwaysAsk: true, reason: 'authentication' };
  }
  if (acts && isAuthorizationRequest(input.pageUrl)) {
    return { alwaysAsk: true, reason: 'authorization' };
  }
  if (acts && isPermissionChangePage(input.pageUrl)) {
    return { alwaysAsk: true, reason: 'permission_change' };
  }
  if (
    acts &&
    (targets.some((entry) => !entry || !targetLabel(entry).trim()) ||
      !pageUrl ||
      (pageUrl.protocol !== 'https:' && pageUrl.protocol !== 'http:'))
  ) {
    return { alwaysAsk: true, reason: 'unidentified_input' };
  }
  return ASK_NOT_REQUIRED;
}

const SITE_CLASS_LABEL: Readonly<Record<SensitiveSiteClass, string>> = {
  banking: 'a banking or payments site',
  health: 'a health site',
  identity_provider: 'a sign-in provider',
  password_manager: 'a password manager',
};

export function describeApprovalReason(requirement: ActionApprovalRequirement): string | null {
  if (!requirement.alwaysAsk) return null;
  switch (requirement.reason) {
    case 'download':
      return 'Downloading a file always needs approval.';
    case 'upload':
      return 'This opens a file upload. Uploads always need your approval.';
    case 'sensitive_input':
      return 'This field looks like it holds a password, payment or identity detail.';
    case 'unidentified_input':
      return 'The element this would act on could not be identified, so it may be a sensitive field or control.';
    case 'sensitive_site':
      return requirement.siteClass
        ? `This is ${SITE_CLASS_LABEL[requirement.siteClass]}, so every step needs your approval.`
        : 'This is a sensitive site, so every step needs your approval.';
    case 'authorization':
      return 'This page grants another app access to an account.';
    case 'authentication':
      return 'Signing in or verifying identity always needs your approval.';
    case 'payment':
      return 'This control may make a payment or move money.';
    case 'publish':
      return 'This control may send, publish, submit, or delete content.';
    case 'selection':
      return 'Changing a dropdown option may submit a form or update the page.';
    case 'history_navigation':
      return 'This leaves the current page and may discard unsaved changes.';
    case 'reload':
      return 'Reloading may discard unsaved changes or resend a form.';
    case 'tab_management':
      return 'This changes the task tab. Closing a tab loses its unsaved changes.';
    case 'window_resize':
      return 'Resizing also changes how other tabs in this browser window are displayed.';
    case 'site_tool':
      return 'This tool is supplied by the website and may change data or navigate. Its annotations do not authorize it.';
    case 'permission_change':
      return 'This page changes account permissions or access.';
    case 'purchase':
      return 'This completes a purchase or payment, which you finish yourself.';
    case 'terms':
      return 'This accepts terms or an agreement on your behalf.';
    default:
      return 'This step always needs your approval.';
  }
}

export function alwaysAskRefusal(requirement: ActionApprovalRequirement): string {
  const reason = describeApprovalReason(requirement) ?? 'This step always needs approval.';
  return `${reason} This run has no way to ask. Start the run from the side panel to approve it.`;
}
