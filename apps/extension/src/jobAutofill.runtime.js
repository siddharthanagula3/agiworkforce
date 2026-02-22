/* eslint-disable no-undef */
const DEFAULT_DELAY_MS = 120;
const DEFAULT_MAX_SUBMIT_STEPS = 5;

const NEGATIVE_BUTTON_KEYWORDS = [
  'cancel',
  'close',
  'back',
  'filter',
  'search',
  'withdraw',
  'remove',
  'delete',
  'save draft',
];
const SUBMIT_BUTTON_KEYWORDS = [
  'submit',
  'submit application',
  'apply now',
  'send application',
  'finish',
];
const PROGRESS_BUTTON_KEYWORDS = ['next', 'continue', 'review', 'proceed'];
const START_APPLICATION_BUTTON_KEYWORDS = [
  'easy apply',
  'quick apply',
  'start application',
  'apply now',
  'apply for this job',
  'apply',
];

const SEMANTIC_FIELD_MATCHERS = [
  { semantic: 'firstName', patterns: ['first name', 'given name', 'firstname'] },
  { semantic: 'lastName', patterns: ['last name', 'surname', 'family name', 'lastname'] },
  { semantic: 'fullName', patterns: ['full name', 'legal name', 'name'] },
  { semantic: 'email', patterns: ['email', 'e-mail'] },
  { semantic: 'phone', patterns: ['phone', 'mobile', 'telephone'] },
  { semantic: 'locationCity', patterns: ['city', 'town'] },
  { semantic: 'locationState', patterns: ['state', 'province', 'region'] },
  { semantic: 'locationCountry', patterns: ['country', 'nation'] },
  { semantic: 'linkedinUrl', patterns: ['linkedin'] },
  { semantic: 'githubUrl', patterns: ['github'] },
  { semantic: 'portfolioUrl', patterns: ['portfolio'] },
  { semantic: 'websiteUrl', patterns: ['website', 'personal site', 'homepage'] },
  { semantic: 'currentCompany', patterns: ['current company', 'employer', 'company'] },
  { semantic: 'currentTitle', patterns: ['current title', 'job title', 'title'] },
  { semantic: 'yearsOfExperience', patterns: ['years of experience', 'experience'] },
  { semantic: 'workAuthorization', patterns: ['work authorization', 'authorized to work'] },
  { semantic: 'requiresSponsorship', patterns: ['sponsorship', 'visa sponsorship'] },
  { semantic: 'salaryExpectation', patterns: ['salary', 'compensation', 'expected pay'] },
  { semantic: 'resumeText', patterns: ['resume text', 'about you', 'summary'] },
  { semantic: 'coverLetterText', patterns: ['cover letter', 'motivation'] },
  { semantic: 'resumeFile', patterns: ['resume', 'cv', 'curriculum vitae'] },
  { semantic: 'coverLetterFile', patterns: ['cover letter file', 'cover letter upload'] },
];

function normalize(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function assertNotTimedOut(deadlineEpochMs) {
  if (Date.now() > deadlineEpochMs) {
    throw new Error('Autofill timed out before completion');
  }
}

export function detectPlatformFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();

    if (
      host.includes('greenhouse.io') ||
      host.includes('boards.greenhouse.io') ||
      host.includes('job-boards.greenhouse.io') ||
      path.includes('/job_app') ||
      path.includes('/application') ||
      query.includes('gh_jid=')
    ) {
      return 'greenhouse';
    }

    if (
      host.includes('myworkdayjobs.com') ||
      host.includes('workdayjobs.com') ||
      host.includes('.myworkday.com') ||
      host.includes('wd1.myworkday') ||
      host.includes('wd3.myworkday') ||
      host.includes('wd5.myworkday')
    ) {
      return 'workday';
    }

    if (host.includes('workday.com') && path.includes('/job/')) {
      return 'workday';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolvePlatform(options) {
  if (
    options &&
    (options.platform === 'greenhouse' ||
      options.platform === 'workday' ||
      options.platform === 'generic')
  ) {
    return options.platform;
  }
  const detected = detectPlatformFromUrl(window.location.href);
  return detected === 'unknown' ? 'generic' : detected;
}

function isFillableElement(node) {
  const isInput = node instanceof HTMLInputElement;
  const isTextArea = node instanceof HTMLTextAreaElement;
  const isSelect = node instanceof HTMLSelectElement;
  if (!isInput && !isTextArea && !isSelect) {
    return false;
  }

  if (isInput) {
    const disallowedTypes = new Set(['hidden', 'button', 'submit', 'reset', 'image']);
    if (disallowedTypes.has(node.type.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function isElementVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function isReadonlyField(element) {
  if (element instanceof HTMLSelectElement) {
    return false;
  }
  return Boolean(element.readOnly);
}

function getFieldsForPlatform(platform) {
  const selectors =
    platform === 'greenhouse'
      ? [
          'form#application_form input',
          'form#application_form textarea',
          'form#application_form select',
          'form.application input',
          'form.application textarea',
          'form.application select',
        ]
      : platform === 'workday'
        ? [
            'form input',
            'form textarea',
            'form select',
            '[data-automation-id] input',
            '[data-automation-id] textarea',
            '[data-automation-id] select',
          ]
        : ['form input', 'form textarea', 'form select'];

  const unique = new Set();

  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (
        isFillableElement(node) &&
        isEligibleFieldForAutofillVisibility(node) &&
        !node.disabled &&
        !isReadonlyField(node)
      ) {
        unique.add(node);
      }
    }
  }

  return Array.from(unique);
}

function getLabelFromAriaLabelledBy(element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) {
    return '';
  }

  const texts = labelledBy
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((node) => node instanceof HTMLElement)
    .map((node) => (node.textContent || '').trim())
    .filter(Boolean);

  return texts.join(' ');
}

function getFieldLabelText(element) {
  const explicitLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('placeholder') ||
    getLabelFromAriaLabelledBy(element);
  if (explicitLabel && explicitLabel.trim()) {
    return explicitLabel.trim();
  }

  if (element instanceof HTMLInputElement && element.labels && element.labels.length > 0) {
    const text = Array.from(element.labels)
      .map((label) => label.textContent || '')
      .join(' ')
      .trim();
    if (text) {
      return text;
    }
  }

  if (element.id) {
    const labelFor = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (labelFor && labelFor.textContent) {
      return labelFor.textContent.trim();
    }
  }

  const closestLabel = element.closest('label');
  if (closestLabel && closestLabel.textContent) {
    return closestLabel.textContent.trim();
  }

  const workdayContainer = element.closest('[data-automation-id]');
  const workdayLabel = workdayContainer
    ? workdayContainer.querySelector('[data-automation-id$="label"]')
    : null;
  if (workdayLabel && workdayLabel.textContent) {
    return workdayLabel.textContent.trim();
  }

  return '';
}

function isEligibleFieldForAutofillVisibility(element) {
  if (isElementVisible(element)) {
    return true;
  }

  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  const inputType = element.type.toLowerCase();
  if (inputType !== 'checkbox' && inputType !== 'radio') {
    return false;
  }

  if (getFieldLabelText(element)) {
    return true;
  }

  if (element.getAttribute('data-automation-id')) {
    return true;
  }

  const container = element.closest('[data-automation-id]');
  return Boolean(container);
}

function buildFieldDescriptor(element) {
  const parts = [
    element.getAttribute('name') || '',
    element.id || '',
    element.getAttribute('autocomplete') || '',
    element.getAttribute('data-automation-id') || '',
    element.getAttribute('data-testid') || '',
    element.getAttribute('aria-label') || '',
    getFieldLabelText(element),
  ];
  return normalize(parts.filter(Boolean).join(' '));
}

function matchesPattern(input, pattern) {
  return input.includes(normalize(pattern));
}

function resolveSemanticField(element, descriptor) {
  if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'file') {
    if (descriptor.includes('cover letter')) {
      return 'coverLetterFile';
    }
    return 'resumeFile';
  }

  for (const matcher of SEMANTIC_FIELD_MATCHERS) {
    if (matcher.patterns.some((pattern) => matchesPattern(descriptor, pattern))) {
      return matcher.semantic;
    }
  }

  return null;
}

function getFirstNameFromFullName(fullName) {
  if (!fullName) {
    return undefined;
  }
  const tokens = String(fullName).trim().split(/\s+/).filter(Boolean);
  return tokens[0];
}

function getLastNameFromFullName(fullName) {
  if (!fullName) {
    return undefined;
  }
  const tokens = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return undefined;
  }
  return tokens.slice(1).join(' ');
}

function toBooleanLike(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = normalize(value);
  if (['yes', 'true', 'required', 'need sponsorship'].includes(normalized)) {
    return true;
  }
  if (['no', 'false', 'not required', 'no sponsorship'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function findCustomAnswer(customAnswers, descriptor) {
  if (!customAnswers || typeof customAnswers !== 'object') {
    return undefined;
  }

  for (const [question, answer] of Object.entries(customAnswers)) {
    const normalizedQuestion = normalize(question);
    if (!normalizedQuestion || !String(answer || '').trim()) {
      continue;
    }
    if (descriptor.includes(normalizedQuestion) || normalizedQuestion.includes(descriptor)) {
      return String(answer);
    }
  }

  return undefined;
}

function resolveValueForField(semantic, descriptor, profile, options) {
  const fullName =
    profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();

  if (semantic) {
    switch (semantic) {
      case 'firstName': {
        const value = profile.firstName || getFirstNameFromFullName(fullName);
        return value ? { kind: 'text', value: String(value) } : undefined;
      }
      case 'lastName': {
        const value = profile.lastName || getLastNameFromFullName(fullName);
        return value ? { kind: 'text', value: String(value) } : undefined;
      }
      case 'fullName':
        return fullName ? { kind: 'text', value: String(fullName) } : undefined;
      case 'email':
        return profile.email ? { kind: 'text', value: String(profile.email) } : undefined;
      case 'phone':
        return profile.phone ? { kind: 'text', value: String(profile.phone) } : undefined;
      case 'locationCity':
        return profile.locationCity
          ? { kind: 'text', value: String(profile.locationCity) }
          : undefined;
      case 'locationState':
        return profile.locationState
          ? { kind: 'text', value: String(profile.locationState) }
          : undefined;
      case 'locationCountry':
        return profile.locationCountry
          ? { kind: 'text', value: String(profile.locationCountry) }
          : undefined;
      case 'linkedinUrl':
        return profile.linkedinUrl
          ? { kind: 'text', value: String(profile.linkedinUrl) }
          : undefined;
      case 'githubUrl':
        return profile.githubUrl ? { kind: 'text', value: String(profile.githubUrl) } : undefined;
      case 'portfolioUrl':
        return profile.portfolioUrl
          ? { kind: 'text', value: String(profile.portfolioUrl) }
          : undefined;
      case 'websiteUrl':
        return profile.websiteUrl ? { kind: 'text', value: String(profile.websiteUrl) } : undefined;
      case 'currentCompany':
        return profile.currentCompany
          ? { kind: 'text', value: String(profile.currentCompany) }
          : undefined;
      case 'currentTitle':
        return profile.currentTitle
          ? { kind: 'text', value: String(profile.currentTitle) }
          : undefined;
      case 'yearsOfExperience':
        return profile.yearsOfExperience
          ? { kind: 'text', value: String(profile.yearsOfExperience) }
          : undefined;
      case 'workAuthorization':
        return profile.workAuthorization
          ? { kind: 'text', value: String(profile.workAuthorization) }
          : undefined;
      case 'requiresSponsorship': {
        const boolValue = toBooleanLike(profile.requiresSponsorship);
        if (boolValue === undefined) {
          return undefined;
        }
        return { kind: 'boolean', value: boolValue };
      }
      case 'salaryExpectation':
        return profile.salaryExpectation
          ? { kind: 'text', value: String(profile.salaryExpectation) }
          : undefined;
      case 'resumeText':
        return profile.resumeText ? { kind: 'text', value: String(profile.resumeText) } : undefined;
      case 'coverLetterText':
        return profile.coverLetterText
          ? { kind: 'text', value: String(profile.coverLetterText) }
          : undefined;
      case 'resumeFile':
        if (profile.files && profile.files.resumeDataUrl) {
          return {
            kind: 'file',
            dataUrl: String(profile.files.resumeDataUrl),
            fileName: String(profile.files.resumeFileName || 'resume.pdf'),
          };
        }
        return undefined;
      case 'coverLetterFile':
        if (profile.files && profile.files.coverLetterDataUrl) {
          return {
            kind: 'file',
            dataUrl: String(profile.files.coverLetterDataUrl),
            fileName: String(profile.files.coverLetterFileName || 'cover-letter.pdf'),
          };
        }
        return undefined;
      default:
        break;
    }
  }

  const customAnswer = findCustomAnswer(profile.customAnswers, descriptor);
  if (customAnswer) {
    return { kind: 'text', value: customAnswer };
  }

  if (!options.includeOptionalFields) {
    return undefined;
  }

  if (descriptor.includes('linkedin') && profile.linkedinUrl) {
    return { kind: 'text', value: String(profile.linkedinUrl) };
  }
  if (descriptor.includes('github') && profile.githubUrl) {
    return { kind: 'text', value: String(profile.githubUrl) };
  }
  if (
    (descriptor.includes('website') || descriptor.includes('portfolio')) &&
    profile.portfolioUrl
  ) {
    return { kind: 'text', value: String(profile.portfolioUrl) };
  }

  return undefined;
}

function setInputValueWithNativeSetter(element, value) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

function trySetSelectValue(select, value) {
  const normalizedTarget = normalize(value);
  const options = Array.from(select.options || []);

  const exact = options.find((option) => normalize(option.value) === normalizedTarget);
  if (exact) {
    select.value = exact.value;
    dispatchInputEvents(select);
    return true;
  }

  const byLabel = options.find(
    (option) => normalize(option.textContent || '') === normalizedTarget,
  );
  if (byLabel) {
    select.value = byLabel.value;
    dispatchInputEvents(select);
    return true;
  }

  const contains = options.find(
    (option) =>
      normalize(option.value).includes(normalizedTarget) ||
      normalize(option.textContent || '').includes(normalizedTarget),
  );
  if (contains) {
    select.value = contains.value;
    dispatchInputEvents(select);
    return true;
  }

  return false;
}

function dataUrlToFile(dataUrl, fileName) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) {
    return null;
  }

  const meta = parts[0] || '';
  const payload = parts[1] || '';
  const mimeMatch = meta.match(/^data:(.*?);base64$/i);
  const mimeType = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mimeType });
  } catch {
    return null;
  }
}

function getFieldQueryRoot(element) {
  return element.form || document;
}

function getRadioGroupFields(radio) {
  const name = radio.getAttribute('name');
  if (!name) {
    return [radio];
  }

  const root = getFieldQueryRoot(radio);
  try {
    return Array.from(
      root.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`),
    ).filter((node) => node instanceof HTMLInputElement);
  } catch {
    return Array.from(root.querySelectorAll('input[type="radio"]')).filter(
      (node) => node instanceof HTMLInputElement && node.getAttribute('name') === name,
    );
  }
}

function getRadioOptionTexts(radio) {
  const texts = [];

  const push = (value) => {
    const text = String(value || '').trim();
    if (!text) {
      return;
    }
    if (!texts.includes(text)) {
      texts.push(text);
    }
  };

  push(radio.value);
  push(radio.getAttribute('aria-label'));

  if (radio.labels && radio.labels.length > 0) {
    for (const label of Array.from(radio.labels)) {
      push(label.textContent);
    }
  }

  const wrappedLabel = radio.closest('label');
  if (wrappedLabel) {
    push(wrappedLabel.textContent);
  }

  return texts;
}

function parseBooleanChoiceText(value) {
  const text = normalize(value);
  if (!text) {
    return undefined;
  }

  const positive = new Set([
    'yes',
    'y',
    'true',
    'required',
    'need sponsorship',
    'i require sponsorship',
  ]);
  const negative = new Set([
    'no',
    'n',
    'false',
    'not required',
    'no sponsorship',
    'i do not require sponsorship',
    "i don't require sponsorship",
  ]);

  if (positive.has(text)) {
    return true;
  }
  if (negative.has(text)) {
    return false;
  }

  return undefined;
}

function pickRadioForResolvedValue(radio, resolved) {
  const group = getRadioGroupFields(radio);
  if (group.length === 0) {
    return null;
  }

  if (resolved.kind === 'boolean') {
    for (const candidate of group) {
      const parsedChoices = getRadioOptionTexts(candidate)
        .map(parseBooleanChoiceText)
        .filter((choice) => choice !== undefined);

      if (parsedChoices.includes(resolved.value)) {
        return candidate;
      }
    }
    return null;
  }

  if (resolved.kind === 'text') {
    const target = normalize(resolved.value);
    if (!target) {
      return null;
    }

    for (const candidate of group) {
      const matches = getRadioOptionTexts(candidate).some((text) => {
        const normalized = normalize(text);
        return normalized === target || normalized.includes(target) || target.includes(normalized);
      });
      if (matches) {
        return candidate;
      }
    }
    return null;
  }

  return null;
}

function setFileInput(input, dataUrl, fileName) {
  const file = dataUrlToFile(dataUrl, fileName);
  if (!file) {
    return false;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  return true;
}

function boolToText(value) {
  return value ? 'yes' : 'no';
}

async function fillFieldValue(element, resolved, delayMs) {
  if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'file') {
    if (resolved.kind !== 'file') {
      return false;
    }
    const success = setFileInput(element, resolved.dataUrl, resolved.fileName);
    if (success && delayMs > 0) {
      await sleep(delayMs);
    }
    return success;
  }

  if (element instanceof HTMLSelectElement) {
    if (resolved.kind !== 'text' && resolved.kind !== 'boolean') {
      return false;
    }
    const selectValue = resolved.kind === 'boolean' ? boolToText(resolved.value) : resolved.value;
    const success = trySetSelectValue(element, selectValue);
    if (success && delayMs > 0) {
      await sleep(delayMs);
    }
    return success;
  }

  if (element instanceof HTMLInputElement) {
    const inputType = element.type.toLowerCase();

    if (inputType === 'radio') {
      if (resolved.kind !== 'boolean' && resolved.kind !== 'text') {
        return false;
      }

      const selectedRadio = pickRadioForResolvedValue(element, resolved);
      if (!selectedRadio) {
        return false;
      }

      selectedRadio.focus();
      selectedRadio.checked = true;
      dispatchInputEvents(selectedRadio);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      return true;
    }

    if (inputType === 'checkbox') {
      if (resolved.kind !== 'boolean') {
        return false;
      }
      element.checked = resolved.value;
      dispatchInputEvents(element);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      return true;
    }

    const textValue =
      resolved.kind === 'text'
        ? resolved.value
        : resolved.kind === 'boolean'
          ? boolToText(resolved.value)
          : null;
    if (!textValue) {
      return false;
    }

    element.focus();
    setInputValueWithNativeSetter(element, textValue);
    dispatchInputEvents(element);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    const textValue =
      resolved.kind === 'text'
        ? resolved.value
        : resolved.kind === 'boolean'
          ? boolToText(resolved.value)
          : null;
    if (!textValue) {
      return false;
    }
    element.focus();
    setInputValueWithNativeSetter(element, textValue);
    dispatchInputEvents(element);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    return true;
  }

  return false;
}

function isRequired(element) {
  if (element.required) {
    return true;
  }

  const ariaRequired = element.getAttribute('aria-required');
  if (ariaRequired && normalize(ariaRequired) === 'true') {
    return true;
  }

  return false;
}

function isEmptyRequiredField(element) {
  if (!isRequired(element)) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === 'radio') {
      const group = getRadioGroupFields(element);
      const groupIsRequired = group.some((field) => isRequired(field));
      if (!groupIsRequired) {
        return false;
      }
      return !group.some((field) => field.checked);
    }
    if (type === 'checkbox') {
      return !element.checked;
    }
    if (type === 'file') {
      return !element.files || element.files.length === 0;
    }
    return !String(element.value || '').trim();
  }

  if (element instanceof HTMLSelectElement) {
    return !String(element.value || '').trim();
  }

  if (element instanceof HTMLTextAreaElement) {
    return !String(element.value || '').trim();
  }

  return false;
}

function describeField(element, descriptor) {
  const label = getFieldLabelText(element);
  const name = element.getAttribute('name') || element.id;
  const summary = label || name || descriptor || element.tagName.toLowerCase();
  return String(summary).trim().slice(0, 160);
}

function fieldFingerprint(element, descriptor) {
  return `${element.tagName.toLowerCase()}|${element.getAttribute('name') || ''}|${element.id}|${descriptor}`;
}

function radioGroupFingerprint(element) {
  if (!(element instanceof HTMLInputElement) || element.type.toLowerCase() !== 'radio') {
    return null;
  }

  const name = element.getAttribute('name');
  if (!name) {
    return null;
  }

  const form = element.form;
  const formKey = form ? `form:${form.id || form.getAttribute('name') || 'anonymous'}` : 'document';
  return `radio-group|${formKey}|${name}`;
}

async function runAutofillPass(platform, profile, options, alreadyFilled, deadlineEpochMs) {
  const delayMs = Math.max(Number(options.delayMs ?? DEFAULT_DELAY_MS), 0);
  const fields = getFieldsForPlatform(platform);
  const processedRadioGroups = new Set();

  let filledCount = 0;
  let skippedCount = 0;
  const missingRequired = new Set();
  const filledFields = [];
  const skippedFields = [];
  const errors = [];

  for (const field of fields) {
    assertNotTimedOut(deadlineEpochMs);

    const radioGroupKey = radioGroupFingerprint(field);
    if (radioGroupKey) {
      if (processedRadioGroups.has(radioGroupKey)) {
        continue;
      }
      processedRadioGroups.add(radioGroupKey);
    }

    const descriptor = buildFieldDescriptor(field);
    const summary = describeField(field, descriptor);
    const fingerprint = fieldFingerprint(field, descriptor);

    if (alreadyFilled.has(fingerprint)) {
      continue;
    }

    const semantic = resolveSemanticField(field, descriptor);
    const resolved = resolveValueForField(semantic, descriptor, profile, options);

    if (!resolved) {
      skippedCount += 1;
      skippedFields.push(summary);
      if (isEmptyRequiredField(field)) {
        missingRequired.add(summary);
      }
      continue;
    }

    try {
      const success = await fillFieldValue(field, resolved, delayMs);
      if (success) {
        alreadyFilled.add(fingerprint);
        filledCount += 1;
        filledFields.push(summary);
        missingRequired.delete(summary);
      } else {
        skippedCount += 1;
        skippedFields.push(summary);
        if (isEmptyRequiredField(field)) {
          missingRequired.add(summary);
        }
      }
    } catch (error) {
      errors.push(`${summary}: ${error instanceof Error ? error.message : 'Fill failed'}`);
      if (isEmptyRequiredField(field)) {
        missingRequired.add(summary);
      }
    }
  }

  return {
    filledCount,
    skippedCount,
    missingRequiredFields: Array.from(missingRequired),
    filledFields,
    skippedFields,
    errors,
  };
}

function isButtonVisibleAndEnabled(button) {
  if (button.disabled) {
    return false;
  }
  return isElementVisible(button);
}

function buttonLabel(button) {
  const text =
    button.textContent ||
    button.getAttribute('aria-label') ||
    button.getAttribute('value') ||
    button.getAttribute('data-automation-id') ||
    '';
  return normalize(text);
}

function isNegativeButton(label) {
  return NEGATIVE_BUTTON_KEYWORDS.some((keyword) => label.includes(keyword));
}

function isSubmitButton(label) {
  return SUBMIT_BUTTON_KEYWORDS.some((keyword) => label.includes(keyword));
}

function isProgressButton(label) {
  return PROGRESS_BUTTON_KEYWORDS.some((keyword) => label.includes(keyword));
}

function getActionButtons(platform) {
  const selectors =
    platform === 'greenhouse'
      ? [
          'form#application_form button',
          'form#application_form input[type="submit"]',
          'button[type="submit"]',
          '#submit_app',
        ]
      : platform === 'workday'
        ? [
            'button[data-automation-id="bottom-navigation-next-button"]',
            'button[data-automation-id="bottom-navigation-review-button"]',
            'button[data-automation-id="bottom-navigation-submit-button"]',
            'button[data-automation-id="job-apply-button"]',
            'button',
          ]
        : [
            'button[type="submit"]',
            'button',
            'input[type="submit"]',
            '[role="button"]',
            'a[href*="apply"]',
          ];

  const buttons = [];
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (node instanceof HTMLElement && isButtonVisibleAndEnabled(node)) {
        buttons.push(node);
      }
    }
  }
  return buttons;
}

function pickNextActionButton(platform) {
  const buttons = getActionButtons(platform)
    .map((button) => ({ button, label: buttonLabel(button) }))
    .filter((entry) => entry.label && !isNegativeButton(entry.label));

  if (buttons.length === 0) {
    return null;
  }

  const submit = buttons.find((entry) => isSubmitButton(entry.label));
  if (submit) {
    return submit.button;
  }

  const progress = buttons.find((entry) => isProgressButton(entry.label));
  if (progress) {
    return progress.button;
  }

  return buttons[0]?.button || null;
}

function isStartApplicationButton(label) {
  return START_APPLICATION_BUTTON_KEYWORDS.some((keyword) => label.includes(keyword));
}

function getGenericFlowButtons() {
  const selectors = [
    'button',
    'input[type="submit"]',
    'input[type="button"]',
    '[role="button"]',
    'a[href*="apply"]',
  ];
  const buttons = [];
  const seen = new Set();

  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (!isButtonVisibleAndEnabled(node)) {
        continue;
      }
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);
      buttons.push(node);
    }
  }

  return buttons;
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  element.click();
}

async function startGenericApplicationFlow(delayMs, deadlineEpochMs) {
  assertNotTimedOut(deadlineEpochMs);
  const buttons = getGenericFlowButtons()
    .map((button) => ({ button, label: buttonLabel(button) }))
    .filter((entry) => entry.label && !isNegativeButton(entry.label))
    .filter((entry) => isStartApplicationButton(entry.label));

  if (buttons.length === 0) {
    return { started: false, clickedLabel: null };
  }

  const preferred = buttons.find((entry) => entry.label.includes('easy apply')) || buttons[0];
  if (!preferred) {
    return { started: false, clickedLabel: null };
  }

  clickElement(preferred.button);
  if (delayMs > 0) {
    await sleep(delayMs);
  }

  return {
    started: true,
    clickedLabel: preferred.label,
  };
}

async function runGenericSubmitSweep(delayMs, deadlineEpochMs, maxClicks = 2) {
  let clicks = 0;
  let submitted = false;

  for (let i = 0; i < maxClicks; i += 1) {
    assertNotTimedOut(deadlineEpochMs);

    const candidate = getGenericFlowButtons()
      .map((button) => ({ button, label: buttonLabel(button) }))
      .filter((entry) => entry.label && !isNegativeButton(entry.label))
      .find((entry) => isSubmitButton(entry.label));

    if (!candidate) {
      break;
    }

    clickElement(candidate.button);
    clicks += 1;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    if (looksSubmitted()) {
      submitted = true;
      break;
    }
  }

  return { clicks, submitted };
}

function looksSubmitted() {
  const bodyText = normalize(document.body?.innerText || '');
  return (
    bodyText.includes('application submitted') ||
    bodyText.includes('thank you for applying') ||
    bodyText.includes('thanks for applying') ||
    bodyText.includes('submission received')
  );
}

function collectMissingRequiredFields(platform) {
  const fields = getFieldsForPlatform(platform);
  const missing = new Set();
  for (const field of fields) {
    if (isEmptyRequiredField(field)) {
      missing.add(describeField(field, buildFieldDescriptor(field)));
    }
  }
  return Array.from(missing);
}

async function advanceAndSubmit(
  platform,
  profile,
  options,
  alreadyFilled,
  details,
  deadlineEpochMs,
) {
  const maxSteps = Math.max(Number(options.maxSubmitSteps ?? DEFAULT_MAX_SUBMIT_STEPS), 1);
  const delayMs = Math.max(Number(options.delayMs ?? DEFAULT_DELAY_MS), 150);

  let stepsAdvanced = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    assertNotTimedOut(deadlineEpochMs);

    const missingBefore = collectMissingRequiredFields(platform);
    if (missingBefore.length > 0 && !options.allowSubmitWithMissingRequired) {
      return {
        submitted: false,
        stepsAdvanced,
        missingRequiredFields: missingBefore,
      };
    }

    const button = pickNextActionButton(platform);
    if (!button) {
      break;
    }

    const label = buttonLabel(button);
    button.click();
    stepsAdvanced += 1;

    await sleep(delayMs);

    const pass = await runAutofillPass(platform, profile, options, alreadyFilled, deadlineEpochMs);
    details.filledFields.push(...pass.filledFields);
    details.skippedFields.push(...pass.skippedFields);
    details.errors.push(...pass.errors);

    if (looksSubmitted()) {
      return {
        submitted: true,
        stepsAdvanced,
        missingRequiredFields: [],
      };
    }

    if (isSubmitButton(label)) {
      const missingAfter = collectMissingRequiredFields(platform);
      return {
        submitted: missingAfter.length === 0 || options.allowSubmitWithMissingRequired === true,
        stepsAdvanced,
        missingRequiredFields: missingAfter,
      };
    }

    if (isStartApplicationButton(label)) {
      continue;
    }

    if (!isProgressButton(label)) {
      break;
    }
  }

  return {
    submitted: false,
    stepsAdvanced,
    missingRequiredFields: collectMissingRequiredFields(platform),
  };
}

export async function runPlatformJobAutofill(profile = {}, options = {}, timeoutMs = 120000) {
  try {
    const deadlineEpochMs = Date.now() + Math.max(timeoutMs, 5_000);
    const platform = resolvePlatform(options);

    const filledFingerprints = new Set();
    const details = {
      filledFields: [],
      skippedFields: [],
      errors: [],
    };

    const firstPass = await runAutofillPass(
      platform,
      profile,
      options,
      filledFingerprints,
      deadlineEpochMs,
    );
    details.filledFields.push(...firstPass.filledFields);
    details.skippedFields.push(...firstPass.skippedFields);
    details.errors.push(...firstPass.errors);

    let submitted = false;
    let stepsAdvanced = 0;
    let missingRequiredFields = firstPass.missingRequiredFields;
    let genericFlowStarted = false;

    if (platform === 'generic' && firstPass.filledCount === 0) {
      const delayMs = Math.max(Number(options.delayMs ?? DEFAULT_DELAY_MS), 150);
      const flowStart = await startGenericApplicationFlow(delayMs, deadlineEpochMs);
      genericFlowStarted = flowStart.started;

      if (flowStart.started) {
        const secondPass = await runAutofillPass(
          platform,
          profile,
          options,
          filledFingerprints,
          deadlineEpochMs,
        );
        details.filledFields.push(...secondPass.filledFields);
        details.skippedFields.push(...secondPass.skippedFields);
        details.errors.push(...secondPass.errors);
        missingRequiredFields = secondPass.missingRequiredFields;
      }
    }

    if (options.autoSubmit) {
      const submission = await advanceAndSubmit(
        platform,
        profile,
        options,
        filledFingerprints,
        details,
        deadlineEpochMs,
      );
      submitted = submission.submitted;
      stepsAdvanced = submission.stepsAdvanced;
      missingRequiredFields = submission.missingRequiredFields;

      if (platform === 'generic' && !submitted) {
        const delayMs = Math.max(Number(options.delayMs ?? DEFAULT_DELAY_MS), 150);
        const submitSweep = await runGenericSubmitSweep(delayMs, deadlineEpochMs);
        stepsAdvanced += submitSweep.clicks;
        submitted = submitSweep.submitted || looksSubmitted();
        missingRequiredFields = collectMissingRequiredFields(platform);
      }
    }

    return {
      success: true,
      platform,
      filledCount: details.filledFields.length,
      skippedCount: details.skippedFields.length,
      missingRequiredFields,
      submitted,
      stepsAdvanced,
      genericFlowStarted,
      details,
    };
  } catch (error) {
    return {
      success: false,
      platform: 'unknown',
      error: error instanceof Error ? error.message : 'Autofill failed unexpectedly',
    };
  }
}
