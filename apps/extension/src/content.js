console.log('AGI Workforce content script loaded on:', window.location.href);

// State management
const automationState = {
  isControlled: false,
  highlightedElement: null,
  isRecording: false,
  recordedActions: [],
  connectionStatus: 'disconnected',
};

// Initialize on load
(function initialize() {
  addAutomationIndicator();
  chrome.runtime.onMessage.addListener(handleMessage);
  // SECURITY: Removed injectDeepAccessScript() - inline script injection exposes
  // utilities to page context which is a security vulnerability. All functionality
  // is now available through the content script's message-based API.

  // Check connection status
  checkConnectionStatus();
})();

// Check connection to desktop app
async function checkConnectionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' });
    automationState.connectionStatus = response?.nativeConnected ? 'connected' : 'disconnected';
    updateIndicatorStatus();
  } catch {
    automationState.connectionStatus = 'disconnected';
  }
}

// Handle incoming messages from background script
function handleMessage(message, sender, sendResponse) {
  console.log('Content script received message:', message);

  switch (message.type) {
    case 'TAB_READY':
      sendResponse({ success: true, ready: true });
      break;

    case 'CONNECTION_STATUS_CHANGED':
      automationState.connectionStatus = message.connected ? 'connected' : 'disconnected';
      updateIndicatorStatus();
      sendResponse({ success: true });
      break;

    case 'CLICK':
      handleClick(message, sendResponse);
      return true;

    case 'DOUBLE_CLICK':
      handleDoubleClick(message, sendResponse);
      return true;

    case 'RIGHT_CLICK':
      handleRightClick(message, sendResponse);
      return true;

    case 'TYPE':
      handleType(message, sendResponse);
      return true;

    case 'GET_TEXT':
      handleGetText(message, sendResponse);
      return true;

    case 'GET_ATTRIBUTE':
      handleGetAttribute(message, sendResponse);
      return true;

    case 'SET_ATTRIBUTE':
      handleSetAttribute(message, sendResponse);
      return true;

    case 'WAIT_FOR_SELECTOR':
      handleWaitForSelector(message, sendResponse);
      return true;

    case 'SELECT_OPTION':
      handleSelectOption(message, sendResponse);
      return true;

    case 'CHECK':
      handleCheck(message, sendResponse);
      return true;

    case 'UNCHECK':
      handleUncheck(message, sendResponse);
      return true;

    case 'FOCUS':
      handleFocus(message, sendResponse);
      return true;

    case 'BLUR':
      handleBlur(message, sendResponse);
      return true;

    case 'HOVER':
      handleHover(message, sendResponse);
      return true;

    case 'SCROLL':
      handleScroll(message, sendResponse);
      return true;

    case 'SCROLL_TO_ELEMENT':
      handleScrollToElement(message, sendResponse);
      return true;

    case 'DRAG_DROP':
      handleDragDrop(message, sendResponse);
      return true;

    case 'GET_LOCAL_STORAGE':
      handleGetLocalStorage(message, sendResponse);
      return true;

    case 'SET_LOCAL_STORAGE':
      handleSetLocalStorage(message, sendResponse);
      return true;

    case 'CLEAR_LOCAL_STORAGE':
      handleClearLocalStorage(sendResponse);
      return true;

    case 'QUERY_ALL':
      handleQueryAll(message, sendResponse);
      return true;

    case 'BUILD_ACCESSIBILITY_TREE':
      handleBuildAccessibilityTree(sendResponse);
      return true;

    case 'GET_FOCUSABLE_ELEMENTS':
      handleGetFocusableElements(sendResponse);
      return true;

    case 'GET_INTERACTIVE_ELEMENTS':
      handleGetInteractiveElements(sendResponse);
      return true;

    case 'GET_PAGE_INFO':
      handleGetPageInfo(sendResponse);
      return true;

    case 'GET_PAGE_CONTENT':
      handleGetPageContent(sendResponse);
      return true;

    case 'GET_FORMS':
      handleGetForms(sendResponse);
      return true;

    case 'FILL_FORM':
      handleFillForm(message, sendResponse);
      return true;

    case 'SUBMIT_FORM':
      handleSubmitForm(message, sendResponse);
      return true;

    case 'START_RECORDING':
      handleStartRecording(sendResponse);
      return true;

    case 'STOP_RECORDING':
      handleStopRecording(sendResponse);
      return true;

    case 'GET_RECORDED_ACTIONS':
      handleGetRecordedActions(sendResponse);
      return true;

    case 'CLICK_AT_COORDINATES':
      handleClickAtCoordinates(message, sendResponse);
      return true;

    case 'GET_ELEMENT_AT_POINT':
      handleGetElementAtPoint(message, sendResponse);
      return true;

    case 'EVALUATE':
      sendResponse({ success: false, error: 'EVALUATE is disabled for security reasons' });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

// ============================================
// ACCESSIBILITY TREE BUILDER
// ============================================

function buildAccessibilityTree(root = document.body, maxDepth = 10) {
  const nodeIdCounter = { value: 0 };
  return buildAccessibilityNode(root, nodeIdCounter, 0, maxDepth);
}

function buildAccessibilityNode(element, idCounter, depth, maxDepth) {
  if (!element || depth > maxDepth) return null;

  const nodeId = `node_${idCounter.value++}`;
  const bounds = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  // Determine if element is visible
  const isVisible =
    bounds.width > 0 &&
    bounds.height > 0 &&
    computedStyle.display !== 'none' &&
    computedStyle.visibility !== 'hidden' &&
    computedStyle.opacity !== '0';

  // Determine role
  const role = getElementRole(element);

  // Determine if focusable
  const focusable = isFocusable(element);

  // Get accessible name
  const name = getAccessibleName(element);

  // Get value for inputs
  const value = getElementValue(element);

  // Get attributes
  const attributes = {};
  for (const attr of element.attributes || []) {
    attributes[attr.name] = attr.value;
  }

  // Build children
  const children = [];
  if (depth < maxDepth) {
    for (const child of element.children || []) {
      const childNode = buildAccessibilityNode(child, idCounter, depth + 1, maxDepth);
      if (childNode) {
        children.push(childNode);
      }
    }
  }

  return {
    id: nodeId,
    role,
    name,
    value,
    description: element.getAttribute('aria-description') || element.title || null,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    focusable,
    focused: document.activeElement === element,
    enabled: !element.disabled,
    visible: isVisible,
    children,
    attributes,
    tagName: element.tagName.toLowerCase(),
    selector: generateUniqueSelector(element),
  };
}

function getElementRole(element) {
  // Check explicit ARIA role first
  const ariaRole = element.getAttribute('role');
  if (ariaRole) return ariaRole;

  // Map HTML elements to implicit roles
  const tagName = element.tagName.toLowerCase();
  const roleMap = {
    a: element.hasAttribute('href') ? 'link' : 'generic',
    button: 'button',
    input: getInputRole(element),
    select: 'combobox',
    textarea: 'textbox',
    img: 'img',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    article: 'article',
    section: 'region',
    form: 'form',
    table: 'table',
    thead: 'rowgroup',
    tbody: 'rowgroup',
    tr: 'row',
    th: 'columnheader',
    td: 'cell',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    dialog: 'dialog',
    menu: 'menu',
    menuitem: 'menuitem',
    progress: 'progressbar',
    meter: 'meter',
  };

  return roleMap[tagName] || 'generic';
}

function getInputRole(input) {
  const type = input.type?.toLowerCase() || 'text';
  const inputRoleMap = {
    text: 'textbox',
    password: 'textbox',
    email: 'textbox',
    tel: 'textbox',
    url: 'textbox',
    search: 'searchbox',
    number: 'spinbutton',
    range: 'slider',
    checkbox: 'checkbox',
    radio: 'radio',
    button: 'button',
    submit: 'button',
    reset: 'button',
    file: 'button',
    image: 'button',
    date: 'textbox',
    time: 'textbox',
    'datetime-local': 'textbox',
    month: 'textbox',
    week: 'textbox',
    color: 'button',
  };
  return inputRoleMap[type] || 'textbox';
}

function getAccessibleName(element) {
  // aria-label takes precedence
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return labelElement.textContent?.trim();
  }

  // For inputs, check associated label
  if (
    element.tagName === 'INPUT' ||
    element.tagName === 'SELECT' ||
    element.tagName === 'TEXTAREA'
  ) {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent?.trim();
    }
    // Check for wrapping label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent?.replace(element.value || '', '').trim();
    }
    // Placeholder as fallback
    if (element.placeholder) return element.placeholder;
  }

  // For buttons and links, use text content
  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    return element.textContent?.trim() || element.getAttribute('title');
  }

  // For images, use alt text
  if (element.tagName === 'IMG') {
    return element.alt || element.getAttribute('title');
  }

  // Default to title attribute
  return element.getAttribute('title') || null;
}

function getElementValue(element) {
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return element.value;
  }
  if (element.tagName === 'SELECT') {
    return element.options[element.selectedIndex]?.text;
  }
  if (element.getAttribute('role') === 'slider' || element.getAttribute('role') === 'progressbar') {
    return element.getAttribute('aria-valuenow');
  }
  return null;
}

function isFocusable(element) {
  // Check tabindex
  const tabindex = element.getAttribute('tabindex');
  if (tabindex !== null && parseInt(tabindex) >= 0) return true;

  // Naturally focusable elements
  const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY'];
  if (focusableTags.includes(element.tagName)) {
    // Check if disabled
    if (element.disabled) return false;
    // For links, need href
    if (element.tagName === 'A' && !element.hasAttribute('href')) return false;
    return true;
  }

  // Elements with contenteditable
  if (element.isContentEditable) return true;

  return false;
}

function generateUniqueSelector(element) {
  if (element.id) {
    // eslint-disable-next-line no-undef
    return `#${CSS.escape(element.id)}`;
  }

  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.className && typeof current.className === 'string') {
      const classes = current.className
        .trim()
        .split(/\s+/)
        .filter((c) => c);
      if (classes.length > 0) {
        /* eslint-disable no-undef */
        selector +=
          '.' +
          classes
            .slice(0, 2)
            .map((c) => CSS.escape(c))
            .join('.');
        /* eslint-enable no-undef */
      }
    }

    // Add nth-child if needed for uniqueness
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((el) => el.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

// ============================================
// ELEMENT HANDLERS
// ============================================

function handleClick(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    highlightElement(element);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      element.click();
      recordAction('click', message.selector);
      sendResponse({ success: true });
    }, 100);
  } catch (error) {
    console.error('Click failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleDoubleClick(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    highlightElement(element);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const event = new MouseEvent('dblclick', {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      recordAction('dblclick', message.selector);
      sendResponse({ success: true });
    }, 100);
  } catch (error) {
    console.error('Double click failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleRightClick(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    highlightElement(element);

    const event = new MouseEvent('contextmenu', {
      view: window,
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    element.dispatchEvent(event);
    recordAction('rightclick', message.selector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Right click failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleType(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    highlightElement(element);
    element.focus();

    if (message.clearFirst !== false) {
      element.value = '';
    }

    const text = message.text;
    const delay = message.delay || 0;

    if (delay > 0) {
      typeWithDelay(element, text, delay, () => {
        recordAction('type', message.selector, text);
        sendResponse({ success: true });
      });
    } else {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      recordAction('type', message.selector, text);
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error('Type failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function typeWithDelay(element, text, delay, callback) {
  let index = 0;

  function typeNextChar() {
    if (index < text.length) {
      element.value += text[index];
      element.dispatchEvent(new Event('input', { bubbles: true }));
      index++;
      setTimeout(typeNextChar, delay);
    } else {
      element.dispatchEvent(new Event('change', { bubbles: true }));
      callback();
    }
  }

  typeNextChar();
}

function handleGetText(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    const text = element.textContent || element.innerText || '';
    sendResponse({ success: true, data: text.trim() });
  } catch (error) {
    console.error('Get text failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleGetAttribute(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    const value = element.getAttribute(message.attribute);
    sendResponse({ success: true, data: value });
  } catch (error) {
    console.error('Get attribute failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSetAttribute(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    element.setAttribute(message.attribute, message.value);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Set attribute failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleWaitForSelector(message, sendResponse) {
  try {
    const timeout = message.timeout || 30000;
    const start = Date.now();

    const checkInterval = setInterval(() => {
      const element = document.querySelector(message.selector);

      if (element) {
        clearInterval(checkInterval);
        sendResponse({ success: true });
      } else if (Date.now() - start > timeout) {
        clearInterval(checkInterval);
        sendResponse({
          success: false,
          error: `Timeout waiting for selector: ${message.selector}`,
        });
      }
    }, 100);
  } catch (error) {
    console.error('Wait for selector failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSelectOption(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    if (element.tagName !== 'SELECT') {
      throw new Error('Element is not a select element');
    }

    element.value = message.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    recordAction('select', message.selector, message.value);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Select option failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleCheck(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    recordAction('check', message.selector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Check failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleUncheck(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    element.checked = false;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    recordAction('uncheck', message.selector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Uncheck failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleFocus(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    element.focus();
    recordAction('focus', message.selector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Focus failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleBlur(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    element.blur();
    recordAction('blur', message.selector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Blur failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleHover(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    const event = new MouseEvent('mouseover', {
      view: window,
      bubbles: true,
      cancelable: true,
    });

    element.dispatchEvent(event);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Hover failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleScroll(message, sendResponse) {
  try {
    const x = message.x || 0;
    const y = message.y || 0;
    const behavior = message.smooth ? 'smooth' : 'auto';

    window.scrollTo({ top: y, left: x, behavior });
    recordAction('scroll', null, { x, y });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Scroll failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleScrollToElement(message, sendResponse) {
  try {
    const element = document.querySelector(message.selector);
    if (!element) {
      throw new Error(`Element not found: ${message.selector}`);
    }

    element.scrollIntoView({
      behavior: message.smooth ? 'smooth' : 'auto',
      block: message.block || 'center',
      inline: message.inline || 'nearest',
    });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Scroll to element failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleDragDrop(message, sendResponse) {
  try {
    const sourceElement = document.querySelector(message.sourceSelector);
    const targetElement = document.querySelector(message.targetSelector);

    if (!sourceElement) {
      throw new Error(`Source element not found: ${message.sourceSelector}`);
    }
    if (!targetElement) {
      throw new Error(`Target element not found: ${message.targetSelector}`);
    }

    // Create drag events
    // eslint-disable-next-line no-undef
    const dataTransfer = new DataTransfer();

    // eslint-disable-next-line no-undef
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    // eslint-disable-next-line no-undef
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    // eslint-disable-next-line no-undef
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    // eslint-disable-next-line no-undef
    const dragEndEvent = new DragEvent('dragend', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    sourceElement.dispatchEvent(dragStartEvent);
    targetElement.dispatchEvent(dragOverEvent);
    targetElement.dispatchEvent(dropEvent);
    sourceElement.dispatchEvent(dragEndEvent);

    recordAction('dragdrop', message.sourceSelector, message.targetSelector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Drag drop failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleClickAtCoordinates(message, sendResponse) {
  try {
    const { x, y, button = 'left' } = message;

    const element = document.elementFromPoint(x, y);
    if (!element) {
      throw new Error(`No element found at coordinates (${x}, ${y})`);
    }

    highlightElement(element);

    const eventInit = {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: button === 'right' ? 2 : 0,
    };

    element.dispatchEvent(new MouseEvent('mousedown', eventInit));
    element.dispatchEvent(new MouseEvent('mouseup', eventInit));
    element.dispatchEvent(new MouseEvent('click', eventInit));

    recordAction('clickAt', null, { x, y });
    sendResponse({ success: true, element: getElementInfo(element) });
  } catch (error) {
    console.error('Click at coordinates failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleGetElementAtPoint(message, sendResponse) {
  try {
    const { x, y } = message;
    const element = document.elementFromPoint(x, y);

    if (!element) {
      sendResponse({ success: true, data: null });
      return;
    }

    sendResponse({ success: true, data: getElementInfo(element) });
  } catch (error) {
    console.error('Get element at point failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function getElementInfo(element) {
  const bounds = element.getBoundingClientRect();
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    classList: Array.from(element.classList),
    textContent: element.textContent?.trim().slice(0, 100),
    attributes: Object.fromEntries(
      Array.from(element.attributes).map((attr) => [attr.name, attr.value]),
    ),
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    selector: generateUniqueSelector(element),
  };
}

// ============================================
// LOCAL STORAGE HANDLERS
// ============================================

// ============================================
// SECURITY: localStorage key restrictions
// ============================================

// Keys that are NEVER allowed to be accessed (sensitive data)
const BLOCKED_STORAGE_KEYS = [
  // Auth tokens and credentials
  /token/i,
  /auth/i,
  /session/i,
  /password/i,
  /secret/i,
  /api.?key/i,
  /credential/i,
  /bearer/i,
  /jwt/i,
  // Payment info
  /payment/i,
  /credit/i,
  /card/i,
  /stripe/i,
  // Personal info
  /ssn/i,
  /social.?security/i,
  /private/i,
];

/**
 * Check if a localStorage key is allowed to be accessed
 */
function isStorageKeyAllowed(key) {
  if (!key || typeof key !== 'string') return false;

  // Check against blocked patterns
  for (const pattern of BLOCKED_STORAGE_KEYS) {
    if (pattern.test(key)) {
      return false;
    }
  }
  return true;
}

function handleGetLocalStorage(message, sendResponse) {
  try {
    const key = message.key;

    if (key) {
      // SECURITY: Validate key is allowed
      if (!isStorageKeyAllowed(key)) {
        sendResponse({ success: false, error: 'Access to this storage key is not allowed' });
        return;
      }
      const value = localStorage.getItem(key);
      sendResponse({ success: true, data: value });
    } else {
      // SECURITY: Getting all items is disabled - must specify a key
      sendResponse({
        success: false,
        error: 'Must specify a key. Getting all localStorage items is disabled for security.',
      });
    }
  } catch (error) {
    console.error('Get local storage failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSetLocalStorage(message, sendResponse) {
  try {
    const key = message.key;

    // SECURITY: Validate key is allowed
    if (!isStorageKeyAllowed(key)) {
      sendResponse({ success: false, error: 'Setting this storage key is not allowed' });
      return;
    }

    localStorage.setItem(key, message.value);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Set local storage failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleClearLocalStorage(sendResponse) {
  // SECURITY: Clearing all localStorage is disabled
  // This could destroy user data and is a common attack vector
  sendResponse({
    success: false,
    error:
      'Clearing all localStorage is disabled for security. Use SET_LOCAL_STORAGE to remove specific keys.',
  });
}

// ============================================
// PAGE INFO HANDLERS
// ============================================

function handleQueryAll(message, sendResponse) {
  try {
    const elements = document.querySelectorAll(message.selector);
    const elementsData = Array.from(elements).map((el) => getElementInfo(el));
    sendResponse({ success: true, data: elementsData });
  } catch (error) {
    console.error('Query all failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleBuildAccessibilityTree(sendResponse) {
  try {
    const tree = buildAccessibilityTree(document.body, 15);
    sendResponse({ success: true, data: tree });
  } catch (error) {
    console.error('Build accessibility tree failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleGetFocusableElements(sendResponse) {
  try {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ];

    const elements = document.querySelectorAll(focusableSelectors.join(', '));
    const elementsData = Array.from(elements)
      .filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((el) => getElementInfo(el));

    sendResponse({ success: true, data: elementsData });
  } catch (error) {
    console.error('Get focusable elements failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleGetInteractiveElements(sendResponse) {
  try {
    const interactiveSelectors = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[onclick]',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="tab"]',
    ];

    const elements = document.querySelectorAll(interactiveSelectors.join(', '));
    const elementsData = Array.from(elements)
      .filter((el) => {
        const style = window.getComputedStyle(el);
        const bounds = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      })
      .map((el) => ({
        ...getElementInfo(el),
        role: getElementRole(el),
        name: getAccessibleName(el),
      }));

    sendResponse({ success: true, data: elementsData });
  } catch (error) {
    console.error('Get interactive elements failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleGetPageInfo(sendResponse) {
  try {
    const pageInfo = {
      url: window.location.href,
      title: document.title,
      faviconUrl: getFaviconUrl(),
      readyState: document.readyState,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY,
      },
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      meta: getMetaTags(),
    };

    sendResponse({ success: true, data: pageInfo });
  } catch (error) {
    console.error('Get page info failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function getFaviconUrl() {
  const link = document.querySelector('link[rel*="icon"]');
  return link ? link.href : null;
}

function getMetaTags() {
  const metas = {};
  document.querySelectorAll('meta').forEach((meta) => {
    const name = meta.name || meta.getAttribute('property');
    if (name) {
      metas[name] = meta.content;
    }
  });
  return metas;
}

function handleGetPageContent(sendResponse) {
  try {
    // Get main content, excluding scripts, styles, etc.
    const clone = document.body.cloneNode(true);

    // Remove unwanted elements
    const removeSelectors = ['script', 'style', 'noscript', 'svg', 'iframe'];
    removeSelectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    const content = {
      html: clone.innerHTML,
      text: clone.textContent?.trim(),
      links: Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        text: a.textContent?.trim(),
        href: a.href,
      })),
      images: Array.from(document.querySelectorAll('img')).map((img) => ({
        src: img.src,
        alt: img.alt,
      })),
      headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim(),
      })),
    };

    sendResponse({ success: true, data: content });
  } catch (error) {
    console.error('Get page content failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================
// FORM HANDLERS
// ============================================

function handleGetForms(sendResponse) {
  try {
    const forms = Array.from(document.forms).map((form, index) => ({
      index,
      id: form.id || null,
      name: form.name || null,
      action: form.action,
      method: form.method,
      fields: Array.from(form.elements).map((el) => ({
        tagName: el.tagName.toLowerCase(),
        type: el.type,
        name: el.name,
        id: el.id,
        value: el.value,
        placeholder: el.placeholder,
        required: el.required,
        disabled: el.disabled,
        label: getAccessibleName(el),
        selector: generateUniqueSelector(el),
      })),
    }));

    sendResponse({ success: true, data: forms });
  } catch (error) {
    console.error('Get forms failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleFillForm(message, sendResponse) {
  try {
    const { formSelector, fields } = message;
    const form = formSelector ? document.querySelector(formSelector) : document.forms[0];

    if (!form) {
      throw new Error('Form not found');
    }

    const filledFields = [];

    for (const [name, value] of Object.entries(fields)) {
      const field = form.elements[name] || form.querySelector(`[name="${name}"]`);
      if (field) {
        if (field.type === 'checkbox') {
          field.checked = Boolean(value);
        } else if (field.type === 'radio') {
          const radio = form.querySelector(`[name="${name}"][value="${value}"]`);
          if (radio) radio.checked = true;
        } else {
          field.value = value;
        }
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields.push(name);
      }
    }

    recordAction('fillForm', formSelector, fields);
    sendResponse({ success: true, filledFields });
  } catch (error) {
    console.error('Fill form failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSubmitForm(message, sendResponse) {
  try {
    const { formSelector } = message;
    const form = formSelector ? document.querySelector(formSelector) : document.forms[0];

    if (!form) {
      throw new Error('Form not found');
    }

    // Check if form is valid
    if (!form.checkValidity()) {
      form.reportValidity();
      throw new Error('Form validation failed');
    }

    form.submit();
    recordAction('submit', formSelector);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Submit form failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================
// ACTION RECORDING
// ============================================

function handleStartRecording(sendResponse) {
  automationState.isRecording = true;
  automationState.recordedActions = [];

  // Add event listeners for recording
  document.addEventListener('click', recordClickEvent, true);
  document.addEventListener('input', recordInputEvent, true);
  document.addEventListener('change', recordChangeEvent, true);

  sendResponse({ success: true });
}

function handleStopRecording(sendResponse) {
  automationState.isRecording = false;

  // Remove event listeners
  document.removeEventListener('click', recordClickEvent, true);
  document.removeEventListener('input', recordInputEvent, true);
  document.removeEventListener('change', recordChangeEvent, true);

  sendResponse({ success: true, actions: automationState.recordedActions });
}

function handleGetRecordedActions(sendResponse) {
  sendResponse({ success: true, data: automationState.recordedActions });
}

function recordClickEvent(event) {
  if (!automationState.isRecording) return;

  const target = event.target;
  automationState.recordedActions.push({
    type: 'click',
    selector: generateUniqueSelector(target),
    timestamp: Date.now(),
    elementInfo: getElementInfo(target),
  });
}

function recordInputEvent(event) {
  if (!automationState.isRecording) return;

  const target = event.target;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    // Debounce input events
    const lastAction = automationState.recordedActions[automationState.recordedActions.length - 1];
    if (lastAction?.type === 'type' && lastAction.selector === generateUniqueSelector(target)) {
      lastAction.value = target.value;
      lastAction.timestamp = Date.now();
    } else {
      automationState.recordedActions.push({
        type: 'type',
        selector: generateUniqueSelector(target),
        value: target.value,
        timestamp: Date.now(),
      });
    }
  }
}

function recordChangeEvent(event) {
  if (!automationState.isRecording) return;

  const target = event.target;
  if (target.tagName === 'SELECT') {
    automationState.recordedActions.push({
      type: 'select',
      selector: generateUniqueSelector(target),
      value: target.value,
      timestamp: Date.now(),
    });
  } else if (target.type === 'checkbox') {
    automationState.recordedActions.push({
      type: target.checked ? 'check' : 'uncheck',
      selector: generateUniqueSelector(target),
      timestamp: Date.now(),
    });
  }
}

function recordAction(type, selector, value = null) {
  if (!automationState.isRecording) return;

  automationState.recordedActions.push({
    type,
    selector,
    value,
    timestamp: Date.now(),
  });
}

// ============================================
// UI HELPERS
// ============================================

function highlightElement(element) {
  const originalOutline = element.style.outline;
  element.style.outline = '2px solid #4CAF50';

  setTimeout(() => {
    element.style.outline = originalOutline;
  }, 1000);
}

function addAutomationIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'agi-workforce-indicator';

  // Create status dot using safe DOM methods (no innerHTML)
  const statusDot = document.createElement('span');
  statusDot.className = 'status-dot';
  statusDot.style.cssText = `
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffc107;
    margin-right: 8px;
    animation: pulse 2s infinite;
  `;

  const statusText = document.createElement('span');
  statusText.className = 'status-text';
  statusText.textContent = 'AGI Workforce';

  indicator.appendChild(statusDot);
  indicator.appendChild(statusText);

  indicator.style.cssText = `
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 0 0 8px 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    font-weight: 600;
    z-index: 2147483647;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  `;

  // Add pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(indicator);
  automationState.indicator = indicator;
}

function updateIndicatorStatus() {
  const indicator = document.getElementById('agi-workforce-indicator');
  if (!indicator) return;

  const statusDot = indicator.querySelector('.status-dot');
  const statusText = indicator.querySelector('.status-text');

  if (automationState.connectionStatus === 'connected') {
    if (statusDot) statusDot.style.background = '#4CAF50';
    if (statusText) statusText.textContent = 'AGI Workforce Connected';
    indicator.style.opacity = '1';

    // Hide after 3 seconds
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 3000);
  } else {
    if (statusDot) statusDot.style.background = '#ffc107';
    if (statusText) statusText.textContent = 'AGI Workforce';
    indicator.style.opacity = '0';
  }
}

// SECURITY NOTE: Removed injectDeepAccessScript() and related utility functions
// that were injecting code into page context. This was a security vulnerability
// as it exposed internal utilities to potentially malicious page scripts.
// If DOM utilities are needed in the future, implement them as message-based
// APIs that communicate between content script and background script.
