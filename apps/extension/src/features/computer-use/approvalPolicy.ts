export type SensitiveSiteClass = 'banking' | 'health' | 'identity_provider' | 'password_manager';

export type AlwaysAskReason =
  | 'download'
  | 'upload'
  | 'sensitive_input'
  | 'sensitive_site'
  | 'authorization'
  | 'permission_change';

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

const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(['read_console', 'read_network']);

const FILE_INPUT_SELECTOR = /type\s*=\s*["']?file\b/i;

const SENSITIVE_FIELD_LABEL =
  /\b(card ?number|credit ?card|cc-?number|cvv|cvc|security code|expir\w*|ssn|social security|routing|account ?number|iban|swift|tax ?id|passport|one[- ]time|otp|passcode|verification code|2fa|mfa|pin)\b/i;

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
  type: string;
  name: string;
  label: string;
}

function parseSignature(signature: string | null | undefined): SignatureParts | null {
  if (typeof signature !== 'string' || signature.length === 0) return null;
  const [tag = '', , type = '', name = '', ...rest] = signature.split('|');
  return {
    tag: tag.toLowerCase(),
    type: type.toLowerCase(),
    name,
    label: rest.join('|'),
  };
}

function targetsFileInput(input: ActionApprovalInput, target: SignatureParts | null): boolean {
  if (target?.tag === 'input' && target.type === 'file') return true;
  const selector = input.args['selector'];
  return typeof selector === 'string' && FILE_INPUT_SELECTOR.test(selector);
}

function targetsSensitiveField(target: SignatureParts | null): boolean {
  if (!target) return false;
  if (target.type === 'password') return true;
  return SENSITIVE_FIELD_LABEL.test(`${target.name} ${target.label}`);
}

const ASK_NOT_REQUIRED: ActionApprovalRequirement = { alwaysAsk: false };

export function approvalRequirement(input: ActionApprovalInput): ActionApprovalRequirement {
  const { toolName } = input;
  if (toolName === 'download_file') return { alwaysAsk: true, reason: 'download' };

  const target = parseSignature(input.targetSignature);
  if ((toolName === 'click' || toolName === 'type') && targetsFileInput(input, target)) {
    return { alwaysAsk: true, reason: 'upload' };
  }
  if (toolName === 'type' && targetsSensitiveField(target)) {
    return { alwaysAsk: true, reason: 'sensitive_input' };
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

  const acts = toolName === 'click' || toolName === 'type';
  if (acts && isAuthorizationRequest(input.pageUrl)) {
    return { alwaysAsk: true, reason: 'authorization' };
  }
  if (acts && isPermissionChangePage(input.pageUrl)) {
    return { alwaysAsk: true, reason: 'permission_change' };
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
    case 'sensitive_site':
      return requirement.siteClass
        ? `This is ${SITE_CLASS_LABEL[requirement.siteClass]}, so every step needs your approval.`
        : 'This is a sensitive site, so every step needs your approval.';
    case 'authorization':
      return 'This page grants another app access to an account.';
    case 'permission_change':
      return 'This page changes account permissions or access.';
    default:
      return 'This step always needs your approval.';
  }
}

export function alwaysAskRefusal(requirement: ActionApprovalRequirement): string {
  const reason = describeApprovalReason(requirement) ?? 'This step always needs approval.';
  return `${reason} This run has no way to ask. Start the run from the side panel to approve it.`;
}
