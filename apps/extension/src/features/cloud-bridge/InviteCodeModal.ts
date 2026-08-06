import { getExtensionTokensCssAuto } from '../../tokens';
import { waitlistService } from '../../lib/waitlistService';
import type { InviteCodeError, InviteCodeModalProps, InviteCodeTab } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function friendlyInviteError(code?: InviteCodeError): string {
  switch (code) {
    case 'invalid_code':
      return "That code doesn't look right. Double-check and try again.";
    case 'expired':
      return "That code has expired. You can still use AGI Cloud — just sign in; it's open in public alpha.";
    case 'fully_redeemed':
      return "That code is fully redeemed. You can still use AGI Cloud — just sign in; it's open in public alpha.";
    case 'already_redeemed_by_user':
      return "You've already redeemed this code.";
    case 'anon_signin_failed':
      return "Couldn't create your session. Try again in a moment.";
    case 'not_wired':
      return 'Code redemption is not wired in this extension build.';
    case 'rpc_error':
      return 'Something went wrong on our end. Try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

// ---------------------------------------------------------------------------
// Style builder
// ---------------------------------------------------------------------------

function buildModalStyles(): string {
  return `
    ${getExtensionTokensCssAuto(':host')}

    :host { display:block; position:fixed; inset:0; z-index:2147483645; pointer-events:none; }

    .agi-modal-backdrop {
      position:absolute; inset:0;
      background:rgba(0,0,0,0.55);
      display:flex; align-items:center; justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      pointer-events:auto;
    }

    .agi-modal-backdrop.hidden { display:none; }

    .agi-modal {
      width:380px; max-width:calc(100vw - 32px);
      max-height:calc(100vh - 32px);
      background:var(--agi-ext-surface);
      border:1px solid var(--agi-ext-border-strong);
      border-radius:12px;
      box-shadow:0 8px 40px rgba(0,0,0,0.18);
      overflow:hidden;
      display:flex; flex-direction:column;
    }

    /* ── Header ── */
    .agi-modal-header {
      padding:16px 16px 14px;
      border-bottom:1px solid var(--agi-ext-border);
      display:flex; align-items:flex-start; gap:12px;
      background:var(--agi-ext-bg);
    }

    .agi-modal-icon {
      width:36px; height:36px; flex-shrink:0;
      background:var(--agi-ext-hover);
      border:1px solid var(--agi-ext-border-strong);
      border-radius:8px;
      display:flex; align-items:center; justify-content:center;
      color:var(--agi-ext-text-muted);
    }

    .agi-modal-title-group {
      flex:1; min-width:0;
    }

    .agi-modal-title {
      font-size:14px; font-weight:700;
      color:var(--agi-ext-text);
      margin:0 0 4px 0;
      line-height:1.2;
    }

    .agi-modal-desc {
      font-size:11px; color:var(--agi-ext-text-muted);
      line-height:1.45; margin:0;
    }

    .agi-modal-close {
      flex-shrink:0; background:transparent; border:none; cursor:pointer;
      color:var(--agi-ext-text-muted); padding:2px;
      width:24px; height:24px;
      display:flex; align-items:center; justify-content:center;
      border-radius:4px;
      transition:color 0.15s, background 0.15s;
      line-height:1;
    }
    .agi-modal-close:hover {
      color:var(--agi-ext-text); background:var(--agi-ext-hover);
    }

    /* ── Tabs ── */
    .agi-tabs {
      display:flex; gap:0;
      border-bottom:1px solid var(--agi-ext-border);
    }

    .agi-tab-btn {
      flex:1; padding:10px 8px;
      font-size:12px; font-weight:600;
      background:transparent; border:none; cursor:pointer;
      color:var(--agi-ext-text-muted);
      border-bottom:2px solid transparent;
      transition:color 0.15s, border-color 0.15s;
      text-align:center;
    }
    .agi-tab-btn:hover { color:var(--agi-ext-text); }
    .agi-tab-btn.active {
      color:var(--agi-ext-accent);
      border-bottom-color:var(--agi-ext-accent);
    }

    /* ── Content ── */
    .agi-modal-body { padding:18px 16px 16px; overflow-y:auto; }

    .agi-tab-content { display:none; }
    .agi-tab-content.active { display:block; }

    /* ── Form ── */
    .agi-form-group { margin-bottom:14px; }

    .agi-label {
      display:block; font-size:10px; font-weight:700;
      text-transform:uppercase; letter-spacing:0.06em;
      color:var(--agi-ext-text-muted);
      margin-bottom:5px;
    }

    .agi-input {
      width:100%; box-sizing:border-box;
      padding:8px 10px;
      font-size:13px; font-family:inherit; color:var(--agi-ext-text);
      background:var(--agi-ext-bg);
      border:1px solid var(--agi-ext-border-strong);
      border-radius:6px; outline:none;
      transition:border-color 0.15s, box-shadow 0.15s;
    }
    .agi-input:focus {
      border-color:var(--agi-ext-accent);
      box-shadow:0 0 0 3px rgba(33,128,141,0.15);
    }
    .agi-input.mono {
      font-family:'SF Mono',Monaco,'Cascadia Code','Roboto Mono',monospace;
      letter-spacing:0.12em; text-transform:uppercase;
    }

    .agi-error-text {
      font-size:11px; color:var(--agi-ext-danger);
      margin-top:5px; display:none;
    }
    .agi-error-text.visible { display:block; }

    /* ── Button ── */
    .agi-btn {
      width:100%; padding:9px 16px;
      font-size:13px; font-weight:700;
      border:none; border-radius:6px; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:6px;
      transition:opacity 0.15s, box-shadow 0.15s;
      background:linear-gradient(135deg,var(--agi-ext-accent) 0%,var(--agi-ext-accent-secondary) 100%);
      color:var(--agi-ext-on-accent);
    }
    .agi-btn:hover:not(:disabled) { opacity:0.9; box-shadow:0 3px 10px rgba(33,128,141,0.3); }
    .agi-btn:disabled { opacity:0.5; cursor:not-allowed; }

    /* ── Spinner ── */
    .agi-spinner {
      width:12px; height:12px;
      border:2px solid var(--agi-ext-on-accent);
      border-top-color:transparent;
      border-radius:50%;
      animation:agi-spin 0.7s linear infinite;
      flex-shrink:0;
    }
    @keyframes agi-spin { to { transform:rotate(360deg); } }

    /* ── Switch tab link ── */
    .agi-switch-link {
      text-align:center; font-size:11px; color:var(--agi-ext-text-muted);
      margin-top:12px;
    }
    .agi-switch-link button {
      background:transparent; border:none; cursor:pointer;
      color:var(--agi-ext-accent); font-size:11px; font-weight:600;
      text-decoration:underline; text-underline-offset:2px; padding:0;
    }
    .agi-switch-link button:hover { opacity:0.8; }

    /* ── Success state ── */
    .agi-success {
      display:none; flex-direction:column; align-items:center;
      gap:10px; padding:8px 0 4px; text-align:center;
    }
    .agi-success.visible { display:flex; }

    .agi-success-icon {
      width:44px; height:44px; border-radius:50%;
      background:var(--agi-ext-success-bg);
      border:1px solid var(--agi-ext-success-border);
      display:flex; align-items:center; justify-content:center;
      color:var(--agi-ext-success);
      font-size:22px; line-height:1;
    }

    .agi-success-title {
      font-size:14px; font-weight:700; color:var(--agi-ext-text); margin:0;
    }
    .agi-success-sub {
      font-size:12px; color:var(--agi-ext-text-muted); margin:0;
    }

    .agi-form-fields { display:block; }
    .agi-form-fields.hidden { display:none; }
  `;
}

// ---------------------------------------------------------------------------
// DOM builder
// ---------------------------------------------------------------------------

interface ModalElements {
  backdrop: HTMLElement;
  closeBtn: HTMLButtonElement;
  tabInviteBtn: HTMLButtonElement;
  tabWaitlistBtn: HTMLButtonElement;
  inviteContent: HTMLElement;
  waitlistContent: HTMLElement;
  // Invite tab
  inviteInput: HTMLInputElement;
  inviteErrorText: HTMLElement;
  inviteSubmitBtn: HTMLButtonElement;
  inviteSpinner: HTMLElement;
  inviteSubmitLabel: HTMLElement;
  inviteSwitchBtn: HTMLButtonElement;
  inviteFormFields: HTMLElement;
  inviteSuccess: HTMLElement;
  // Waitlist tab
  waitlistEmailInput: HTMLInputElement;
  waitlistNameInput: HTMLInputElement;
  waitlistErrorText: HTMLElement;
  waitlistSubmitBtn: HTMLButtonElement;
  waitlistSpinner: HTMLElement;
  waitlistSubmitLabel: HTMLElement;
  waitlistFormFields: HTMLElement;
  waitlistSuccess: HTMLElement;
}

function buildModalDOM(shadow: ShadowRoot): ModalElements {
  const style = document.createElement('style');
  style.textContent = buildModalStyles();
  shadow.appendChild(style);

  const backdrop = document.createElement('div');
  backdrop.className = 'agi-modal-backdrop hidden';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'agi-modal-title');

  const modal = document.createElement('div');
  modal.className = 'agi-modal';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'agi-modal-header';

  const icon = document.createElement('div');
  icon.className = 'agi-modal-icon';
  icon.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'agi-modal-title-group';

  const title = document.createElement('p');
  title.className = 'agi-modal-title';
  title.id = 'agi-modal-title';
  title.textContent = 'AGI Cloud';

  const desc = document.createElement('p');
  desc.className = 'agi-modal-desc';
  desc.textContent =
    'AGI Cloud is in public alpha — sign in to start using it, no invite needed. Have a ' +
    'promo or invite code? Redeem it below for plan credits. You can also get product ' +
    'updates by email.';

  titleGroup.appendChild(title);
  titleGroup.appendChild(desc);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'agi-modal-close';
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  header.appendChild(icon);
  header.appendChild(titleGroup);
  header.appendChild(closeBtn);

  // ── Tabs ──
  const tabs = document.createElement('div');
  tabs.className = 'agi-tabs';
  tabs.setAttribute('role', 'tablist');

  const tabInviteBtn = document.createElement('button');
  tabInviteBtn.className = 'agi-tab-btn active';
  tabInviteBtn.setAttribute('type', 'button');
  tabInviteBtn.setAttribute('role', 'tab');
  tabInviteBtn.setAttribute('aria-selected', 'true');
  tabInviteBtn.textContent = 'Redeem a code';

  const tabWaitlistBtn = document.createElement('button');
  tabWaitlistBtn.className = 'agi-tab-btn';
  tabWaitlistBtn.setAttribute('type', 'button');
  tabWaitlistBtn.setAttribute('role', 'tab');
  tabWaitlistBtn.setAttribute('aria-selected', 'false');
  tabWaitlistBtn.textContent = 'Product updates';

  tabs.appendChild(tabInviteBtn);
  tabs.appendChild(tabWaitlistBtn);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'agi-modal-body';

  // -- Invite tab content --
  const inviteContent = document.createElement('div');
  inviteContent.className = 'agi-tab-content active';
  inviteContent.setAttribute('role', 'tabpanel');

  const inviteSuccess = document.createElement('div');
  inviteSuccess.className = 'agi-success';
  inviteSuccess.innerHTML =
    '<div class="agi-success-icon">✓</div>' +
    '<p class="agi-success-title">Code redeemed!</p>' +
    '<p class="agi-success-sub">Closing in a moment…</p>';

  const inviteFormFields = document.createElement('div');
  inviteFormFields.className = 'agi-form-fields';

  const inviteFormGroup = document.createElement('div');
  inviteFormGroup.className = 'agi-form-group';

  const inviteLabel = document.createElement('label');
  inviteLabel.className = 'agi-label';
  inviteLabel.textContent = 'Promo or invite code';

  const inviteInput = document.createElement('input');
  inviteInput.type = 'text';
  inviteInput.className = 'agi-input mono';
  inviteInput.placeholder = 'XXXXXXXX';
  inviteInput.setAttribute('autocomplete', 'off');
  inviteInput.setAttribute('autocorrect', 'off');
  inviteInput.setAttribute('autocapitalize', 'characters');
  inviteInput.setAttribute('spellcheck', 'false');

  const inviteErrorText = document.createElement('p');
  inviteErrorText.className = 'agi-error-text';
  inviteErrorText.setAttribute('role', 'alert');

  inviteFormGroup.appendChild(inviteLabel);
  inviteFormGroup.appendChild(inviteInput);
  inviteFormGroup.appendChild(inviteErrorText);

  const inviteSubmitBtn = document.createElement('button');
  inviteSubmitBtn.type = 'button';
  inviteSubmitBtn.className = 'agi-btn';
  inviteSubmitBtn.disabled = true;

  const inviteSpinner = document.createElement('span');
  inviteSpinner.className = 'agi-spinner';
  inviteSpinner.style.display = 'none';

  const inviteSubmitLabel = document.createElement('span');
  inviteSubmitLabel.textContent = 'Redeem';

  inviteSubmitBtn.appendChild(inviteSpinner);
  inviteSubmitBtn.appendChild(inviteSubmitLabel);

  const inviteSwitchRow = document.createElement('p');
  inviteSwitchRow.className = 'agi-switch-link';
  inviteSwitchRow.appendChild(
    document.createTextNode('No code needed for AGI Cloud — just sign in. '),
  );

  const inviteSwitchBtn = document.createElement('button');
  inviteSwitchBtn.type = 'button';
  inviteSwitchBtn.textContent = 'Get product updates';
  inviteSwitchRow.appendChild(inviteSwitchBtn);

  inviteFormFields.appendChild(inviteFormGroup);
  inviteFormFields.appendChild(inviteSubmitBtn);
  inviteFormFields.appendChild(inviteSwitchRow);

  inviteContent.appendChild(inviteSuccess);
  inviteContent.appendChild(inviteFormFields);

  // -- Waitlist tab content --
  const waitlistContent = document.createElement('div');
  waitlistContent.className = 'agi-tab-content';
  waitlistContent.setAttribute('role', 'tabpanel');

  const waitlistSuccess = document.createElement('div');
  waitlistSuccess.className = 'agi-success';
  waitlistSuccess.innerHTML =
    '<div class="agi-success-icon">✓</div>' +
    '<p class="agi-success-title">You\'re subscribed!</p>' +
    '<p class="agi-success-sub">We\'ll email you occasional product updates.</p>';

  const waitlistFormFields = document.createElement('div');
  waitlistFormFields.className = 'agi-form-fields';

  const emailFormGroup = document.createElement('div');
  emailFormGroup.className = 'agi-form-group';

  const emailLabel = document.createElement('label');
  emailLabel.className = 'agi-label';
  emailLabel.textContent = 'Email · required';

  const waitlistEmailInput = document.createElement('input');
  waitlistEmailInput.type = 'email';
  waitlistEmailInput.className = 'agi-input';
  waitlistEmailInput.placeholder = 'you@example.com';
  waitlistEmailInput.setAttribute('autocomplete', 'email');
  waitlistEmailInput.setAttribute('autocapitalize', 'none');
  waitlistEmailInput.setAttribute('autocorrect', 'off');
  waitlistEmailInput.setAttribute('spellcheck', 'false');

  emailFormGroup.appendChild(emailLabel);
  emailFormGroup.appendChild(waitlistEmailInput);

  const nameFormGroup = document.createElement('div');
  nameFormGroup.className = 'agi-form-group';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'agi-label';
  nameLabel.textContent = 'Name · optional';

  const waitlistNameInput = document.createElement('input');
  waitlistNameInput.type = 'text';
  waitlistNameInput.className = 'agi-input';
  waitlistNameInput.placeholder = 'Your name';
  waitlistNameInput.setAttribute('autocomplete', 'name');

  nameFormGroup.appendChild(nameLabel);
  nameFormGroup.appendChild(waitlistNameInput);

  const waitlistErrorText = document.createElement('p');
  waitlistErrorText.className = 'agi-error-text';
  waitlistErrorText.setAttribute('role', 'alert');

  const waitlistSubmitBtn = document.createElement('button');
  waitlistSubmitBtn.type = 'button';
  waitlistSubmitBtn.className = 'agi-btn';
  waitlistSubmitBtn.disabled = true;

  const waitlistSpinner = document.createElement('span');
  waitlistSpinner.className = 'agi-spinner';
  waitlistSpinner.style.display = 'none';

  const waitlistSubmitLabel = document.createElement('span');
  waitlistSubmitLabel.textContent = 'Get updates';

  waitlistSubmitBtn.appendChild(waitlistSpinner);
  waitlistSubmitBtn.appendChild(waitlistSubmitLabel);

  const privacyNote = document.createElement('p');
  privacyNote.className = 'agi-switch-link';
  privacyNote.textContent =
    'Optional — AGI Cloud is already open in public alpha. Email used only for product updates.';

  waitlistFormFields.appendChild(emailFormGroup);
  waitlistFormFields.appendChild(nameFormGroup);
  waitlistFormFields.appendChild(waitlistErrorText);
  waitlistFormFields.appendChild(waitlistSubmitBtn);
  waitlistFormFields.appendChild(privacyNote);

  waitlistContent.appendChild(waitlistSuccess);
  waitlistContent.appendChild(waitlistFormFields);

  body.appendChild(inviteContent);
  body.appendChild(waitlistContent);

  modal.appendChild(header);
  modal.appendChild(tabs);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  shadow.appendChild(backdrop);

  return {
    backdrop,
    closeBtn,
    tabInviteBtn,
    tabWaitlistBtn,
    inviteContent,
    waitlistContent,
    inviteInput,
    inviteErrorText,
    inviteSubmitBtn,
    inviteSpinner,
    inviteSubmitLabel,
    inviteSwitchBtn,
    inviteFormFields,
    inviteSuccess,
    waitlistEmailInput,
    waitlistNameInput,
    waitlistErrorText,
    waitlistSubmitBtn,
    waitlistSpinner,
    waitlistSubmitLabel,
    waitlistFormFields,
    waitlistSuccess,
  };
}

// ---------------------------------------------------------------------------
// InviteCodeModal class
// ---------------------------------------------------------------------------

export class InviteCodeModal {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private els: ModalElements;
  private props: InviteCodeModalProps;
  private activeTab: InviteCodeTab;
  private inviteLoading = false;
  private waitlistLoading = false;

  constructor(props: InviteCodeModalProps) {
    this.props = props;
    this.activeTab = props.defaultTab ?? 'invite';

    this.host = document.createElement('div');
    this.host.setAttribute('data-agi-cloud-modal', 'true');
    // Do not use all:initial — it resets display to inline and prevents the
    // shadow-DOM :host rule (display:block; position:fixed) from taking effect,
    // which causes the overlay to collapse into normal document flow instead of
    // covering the viewport. The shadow-DOM stylesheet handles all internal
    // isolation via the :host rule; no inline reset is needed here.

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.els = buildModalDOM(this.shadow);

    this.bindEvents();

    if (props.open) {
      this.show();
    }
  }

  private bindEvents(): void {
    const { els } = this;

    els.closeBtn.addEventListener('click', () => this.close());

    // Close on backdrop click (outside modal box)
    els.backdrop.addEventListener('click', (e: MouseEvent) => {
      if (e.target === els.backdrop) this.close();
    });

    // Keyboard close
    this.host.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') this.close();
    });

    // Tab switching
    els.tabInviteBtn.addEventListener('click', () => this.switchTab('invite'));
    els.tabWaitlistBtn.addEventListener('click', () => this.switchTab('waitlist'));
    els.inviteSwitchBtn.addEventListener('click', () => this.switchTab('waitlist'));

    // Invite input
    els.inviteInput.addEventListener('input', () => {
      const raw = els.inviteInput.value.toUpperCase();
      if (els.inviteInput.value !== raw) els.inviteInput.value = raw;
      this.updateInviteSubmitState();
    });

    els.inviteInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') void this.submitInvite();
    });

    els.inviteSubmitBtn.addEventListener('click', () => void this.submitInvite());

    // Waitlist inputs
    els.waitlistEmailInput.addEventListener('input', () => this.updateWaitlistSubmitState());
    els.waitlistEmailInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') void this.submitWaitlist();
    });
    els.waitlistNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') void this.submitWaitlist();
    });

    els.waitlistSubmitBtn.addEventListener('click', () => void this.submitWaitlist());
  }

  private updateInviteSubmitState(): void {
    const len = this.els.inviteInput.value.trim().length;
    this.els.inviteSubmitBtn.disabled = len < 6 || this.inviteLoading;
  }

  private updateWaitlistSubmitState(): void {
    const valid = EMAIL_RE.test(this.els.waitlistEmailInput.value.trim());
    this.els.waitlistSubmitBtn.disabled = !valid || this.waitlistLoading;
  }

  private switchTab(tab: InviteCodeTab): void {
    this.activeTab = tab;

    const isInvite = tab === 'invite';

    this.els.tabInviteBtn.classList.toggle('active', isInvite);
    this.els.tabInviteBtn.setAttribute('aria-selected', String(isInvite));
    this.els.tabWaitlistBtn.classList.toggle('active', !isInvite);
    this.els.tabWaitlistBtn.setAttribute('aria-selected', String(!isInvite));

    this.els.inviteContent.classList.toggle('active', isInvite);
    this.els.waitlistContent.classList.toggle('active', !isInvite);

    if (isInvite) {
      this.els.inviteInput.focus();
    } else {
      this.els.waitlistEmailInput.focus();
    }
  }

  private setInviteLoading(loading: boolean): void {
    this.inviteLoading = loading;
    this.els.inviteSpinner.style.display = loading ? 'block' : 'none';
    this.els.inviteSubmitLabel.textContent = loading ? 'Validating…' : 'Redeem';
    this.els.inviteInput.disabled = loading;
    this.updateInviteSubmitState();
  }

  private setWaitlistLoading(loading: boolean): void {
    this.waitlistLoading = loading;
    this.els.waitlistSpinner.style.display = loading ? 'block' : 'none';
    this.els.waitlistSubmitLabel.textContent = loading ? 'Subscribing…' : 'Get updates';
    this.els.waitlistEmailInput.disabled = loading;
    this.els.waitlistNameInput.disabled = loading;
    this.updateWaitlistSubmitState();
  }

  private showInviteError(msg: string): void {
    this.els.inviteErrorText.textContent = msg;
    this.els.inviteErrorText.classList.add('visible');
  }

  private clearInviteError(): void {
    this.els.inviteErrorText.textContent = '';
    this.els.inviteErrorText.classList.remove('visible');
  }

  private showWaitlistError(msg: string): void {
    this.els.waitlistErrorText.textContent = msg;
    this.els.waitlistErrorText.classList.add('visible');
  }

  private clearWaitlistError(): void {
    this.els.waitlistErrorText.textContent = '';
    this.els.waitlistErrorText.classList.remove('visible');
  }

  private async submitInvite(): Promise<void> {
    const code = this.els.inviteInput.value.trim().toUpperCase();
    if (code.length < 6 || this.inviteLoading) return;

    this.clearInviteError();
    this.setInviteLoading(true);

    const result = await waitlistService.redeemInviteCode(code, this.props.source);

    this.setInviteLoading(false);

    if (!result.success) {
      this.showInviteError(friendlyInviteError(result.error));
      return;
    }

    if (result.inviteId) {
      // Cloud access is gated solely by a valid Clerk token (see callCloud); the
      // former `agi_cloud_unlocked` flag was vestigial — nothing consumed it — so
      // the redeem path no longer writes an unlock flag. Just notify the caller.
      this.props.onRedeemed?.(result.inviteId);
    }

    this.els.inviteFormFields.classList.add('hidden');
    this.els.inviteSuccess.classList.add('visible');

    setTimeout(() => this.close(), 1500);
  }

  private async submitWaitlist(): Promise<void> {
    const email = this.els.waitlistEmailInput.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || this.waitlistLoading) return;

    this.clearWaitlistError();
    this.setWaitlistLoading(true);

    const result = await waitlistService.joinWaitlist({
      email,
      name: this.els.waitlistNameInput.value.trim() || undefined,
      referralSource: this.props.source,
    });

    this.setWaitlistLoading(false);

    if (!result.success) {
      this.showWaitlistError(result.error ?? 'Something went wrong. Try again.');
      return;
    }

    this.props.onWaitlisted?.(email);

    this.els.waitlistFormFields.classList.add('hidden');
    this.els.waitlistSuccess.classList.add('visible');

    setTimeout(() => this.close(), 2000);
  }

  show(): void {
    this.els.backdrop.classList.remove('hidden');
    // Reset to defaultTab on every open
    this.switchTab(this.props.defaultTab ?? 'invite');
    // Reset invite form state
    this.els.inviteInput.value = '';
    this.clearInviteError();
    this.els.inviteFormFields.classList.remove('hidden');
    this.els.inviteSuccess.classList.remove('visible');
    this.updateInviteSubmitState();
    // Reset waitlist form state
    this.els.waitlistEmailInput.value = '';
    this.els.waitlistNameInput.value = '';
    this.clearWaitlistError();
    this.els.waitlistFormFields.classList.remove('hidden');
    this.els.waitlistSuccess.classList.remove('visible');
    this.updateWaitlistSubmitState();
    // Focus appropriate input
    setTimeout(() => {
      if (this.activeTab === 'invite') {
        this.els.inviteInput.focus();
      } else {
        this.els.waitlistEmailInput.focus();
      }
    }, 50);
  }

  close(): void {
    this.els.backdrop.classList.add('hidden');
    this.props.onClose();
  }

  mount(container: Element): void {
    container.appendChild(this.host);
  }

  unmount(): void {
    this.host.remove();
  }

  update(props: Partial<InviteCodeModalProps>): void {
    this.props = { ...this.props, ...props };
    if ('open' in props) {
      if (props.open) this.show();
      else this.els.backdrop.classList.add('hidden');
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Mount an InviteCodeModal into the given container and return a handle to
 * update or unmount it.
 */
export function mountInviteCodeModal(
  container: Element,
  props: InviteCodeModalProps,
): InviteCodeModal {
  const modal = new InviteCodeModal(props);
  modal.mount(container);
  return modal;
}
