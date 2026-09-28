export const SUPPORTED_BROWSERS = ['Chrome', 'Edge', 'Firefox', 'Safari'] as const;

export const UNSUPPORTED_BROWSER_NOTICE_ID = 'unsupported-browser-notice';

const SUPPORTED_BROWSER_LIST = `${SUPPORTED_BROWSERS.slice(0, -1).join(', ')} or ${SUPPORTED_BROWSERS.at(-1)}`;

export const UNSUPPORTED_BROWSER_NOTICE = `This browser is too old to run AGI. Open it in a current version of ${SUPPORTED_BROWSER_LIST}.`;

export const JAVASCRIPT_REQUIRED_NOTICE = `AGI needs JavaScript. Turn it on, or open AGI in a current version of ${SUPPORTED_BROWSER_LIST}.`;

export const BROWSER_SUPPORT_SCRIPT = `(function(){var ok=false;try{ok=typeof Object.hasOwn==='function'&&typeof window.structuredClone==='function'&&typeof Array.prototype.at==='function'&&typeof window.fetch==='function'&&new RegExp('(?<=a)b').test('ab');}catch(e){ok=false;}if(ok)return;var notice=document.getElementById('${UNSUPPORTED_BROWSER_NOTICE_ID}');if(notice)notice.hidden=false;})();`;
