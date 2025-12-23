console.log('AGI Workforce content script loaded on:', window.location.href);

const automationState = {
  isControlled: false,
  highlightedElement: null,
};

(function initialize() {
  addAutomationIndicator();

  chrome.runtime.onMessage.addListener(handleMessage);

  injectDeepAccessScript();
})();

function handleMessage(message, sender, sendResponse) {
  console.log('Content script received message:', message);

  switch (message.type) {
    case 'TAB_READY':
      sendResponse({ success: true, ready: true });
      break;

    case 'CLICK':
      handleClick(message, sendResponse);
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

    case 'HOVER':
      handleHover(message, sendResponse);
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

    case 'EVALUATE':
      sendResponse({ success: false, error: 'EVALUATE is disabled for security reasons' });
      return true;

    case 'QUERY_ALL':
      handleQueryAll(message, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

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
      sendResponse({ success: true });
    }, 100);
  } catch (error) {
    console.error('Click failed:', error);
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
        sendResponse({ success: true });
      });
    } else {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
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
    sendResponse({ success: true });
  } catch (error) {
    console.error('Focus failed:', error);
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

function handleGetLocalStorage(message, sendResponse) {
  try {
    const key = message.key;

    if (key) {
      const value = localStorage.getItem(key);
      sendResponse({ success: true, data: value });
    } else {
      const allItems = { ...localStorage };
      sendResponse({ success: true, data: allItems });
    }
  } catch (error) {
    console.error('Get local storage failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSetLocalStorage(message, sendResponse) {
  try {
    localStorage.setItem(message.key, message.value);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Set local storage failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleClearLocalStorage(sendResponse) {
  try {
    localStorage.clear();
    sendResponse({ success: true });
  } catch (error) {
    console.error('Clear local storage failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleQueryAll(message, sendResponse) {
  try {
    const elements = document.querySelectorAll(message.selector);
    const elementsData = Array.from(elements).map((el) => ({
      tagName: el.tagName,
      text: el.textContent?.trim() || '',
      attributes: Array.from(el.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      bounds: el.getBoundingClientRect(),
    }));

    sendResponse({ success: true, data: elementsData });
  } catch (error) {
    console.error('Query all failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

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
  indicator.textContent = 'AGI Workforce is controlling this page';
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
    display: none;
  `;

  document.body.appendChild(indicator);

  automationState.isControlled = true;
  indicator.style.display = 'block';
}

function injectDeepAccessScript() {
  const script = document.createElement('script');
  script.textContent = `
    
    window.agiWorkforceUtils = {
      findByText: function(text) {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        const matches = [];
        let node;

        while (node = walker.nextNode()) {
          if (node.textContent.includes(text)) {
            matches.push(node.parentElement);
          }
        }

        return matches;
      },

      getComputedStyles: function(selector) {
        const element = document.querySelector(selector);
        return element ? window.getComputedStyle(element) : null;
      },

      getShadowDomElements: function(selector) {
        
        const elements = [];
        document.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) {
            const shadowElements = el.shadowRoot.querySelectorAll(selector);
            elements.push(...shadowElements);
          }
        });
        return elements;
      }
    };
  `;

  (document.head || document.documentElement).appendChild(script);
  script.remove();
}
