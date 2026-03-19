/**
 * MCPAppComponents
 *
 * Built-in component renderers that execute inside the sandboxed iframe.
 * Nothing here runs in the React tree — these functions produce plain HTML/JS
 * strings that are injected into the iframe's srcdoc attribute.
 *
 * Security model:
 *   - The iframe is sandbox="allow-scripts" (no allow-same-origin).
 *   - All scripts run in an opaque origin; they cannot access parent storage,
 *     cookies, or the DOM outside the iframe.
 *   - Data flows host→iframe via postMessage only (never via shared memory).
 *   - Arbitrary tool output is JSON-encoded and inserted via the JS data
 *     binding, never via innerHTML of untrusted strings.
 */

import type { McpAppDefinition } from './MCPAppRegistry';

// ---------------------------------------------------------------------------
// Component descriptor types (host-side only)
// ---------------------------------------------------------------------------

interface ChartConfig {
  chartType?: 'bar' | 'line' | 'pie';
  labels?: string[];
  datasets?: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
  title?: string;
}

interface TableConfig {
  columns?: string[];
  title?: string;
  striped?: boolean;
}

interface FormConfig {
  fields?: Array<{
    name: string;
    label: string;
    type?: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
    options?: string[];
    required?: boolean;
    placeholder?: string;
  }>;
  submitLabel?: string;
  title?: string;
}

interface MarkdownConfig {
  content?: string;
}

interface CodeConfig {
  language?: string;
  content?: string;
}

export type BuiltinComponentConfig =
  | ChartConfig
  | TableConfig
  | FormConfig
  | MarkdownConfig
  | CodeConfig;

// ---------------------------------------------------------------------------
// Iframe JS source builder
// ---------------------------------------------------------------------------

/**
 * Returns the JavaScript source that runs inside the sandboxed iframe.
 * Written as a string concatenation (not a template literal) to avoid
 * backtick and dollar-sign escaping issues in the outer TypeScript file.
 */
function buildIframeScript(): string {
  // NOTE: Do NOT use template literals here — this string is composed with
  // plain + concatenation so that backtick characters in the iframe JS do
  // not accidentally close an outer TypeScript template literal.
  const lines: string[] = [
    '(function () {',
    '  "use strict";',
    '',
    '  // ── helpers ──────────────────────────────────────────────────────────',
    '',
    '  function esc(str) {',
    '    if (str == null) return "";',
    '    return String(str)',
    '      .replace(/&/g, "&amp;")',
    '      .replace(/</g, "&lt;")',
    '      .replace(/>/g, "&gt;")',
    '      .replace(/"/g, "&quot;")',
    '      .replace(/\'/g, "&#x27;");',
    '  }',
    '',
    '  function sendToHost(method, params) {',
    '    window.parent.postMessage(',
    '      { jsonrpc: "2.0", method: method, params: params },',
    '      "*"',
    '    );',
    '  }',
    '',
    '  function reportHeight() {',
    '    var h = document.documentElement.scrollHeight;',
    '    sendToHost("mcp:resize", { height: h });',
    '  }',
    '',
    '  // ── chart renderer (SVG bar/line/pie) ────────────────────────────────',
    '',
    '  function renderChart(container, config, data) {',
    '    var cfg = Object.assign({ chartType: "bar", labels: [], datasets: [] }, config);',
    '    var labels = (data && data.labels) ? data.labels : (cfg.labels || []);',
    '    var datasets = (data && data.datasets) ? data.datasets : (cfg.datasets || []);',
    '    var W = 400, H = 200, padL = 30, padB = 24, padR = 10, padT = 16;',
    '    var drawW = W - padL - padR;',
    '    var drawH = H - padT - padB;',
    '    var palette = ["#6366f1","#22c55e","#f59e0b","#ef4444","#14b8a6","#a855f7"];',
    '',
    '    if (cfg.chartType === "pie" && datasets.length > 0) {',
    '      var vals = datasets[0].data || [];',
    '      var total = vals.reduce(function(a,b){return a+b;},0) || 1;',
    '      var cx = W/2, cy = H/2, r = Math.min(W,H)/2 - 16;',
    '      var slices = "";',
    '      var angle = -Math.PI/2;',
    '      for (var i=0;i<vals.length;i++){',
    '        var frac = vals[i]/total;',
    '        var a1=angle, a2=angle+frac*Math.PI*2;',
    '        var x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);',
    '        var x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);',
    '        var large=frac>0.5?1:0;',
    '        var col = palette[i%palette.length];',
    '        slices += "<path d=\\"M"+cx+","+cy+" L"+x1+","+y1+" A"+r+","+r+" 0 "+large+",1 "+x2+","+y2+" Z\\" fill=\\""+col+"\\" opacity=\\"0.85\\"/>";',
    '        angle=a2;',
    '      }',
    '      container.innerHTML = "<svg viewBox=\\"0 0 "+W+" "+H+"\\" width=\\"100%\\">"+slices+"</svg>";',
    '      return;',
    '    }',
    '',
    '    var allVals = [];',
    '    datasets.forEach(function(ds){ (ds.data||[]).forEach(function(v){allVals.push(v);}); });',
    '    var maxV = allVals.length ? Math.max.apply(null,allVals.map(Math.abs)) : 1;',
    '    if(maxV===0) maxV=1;',
    '    var n = labels.length || (datasets[0] && datasets[0].data ? datasets[0].data.length : 0);',
    '    var barW = n>0 ? drawW/n : drawW;',
    '    var bars = "";',
    '    var lines = "";',
    '',
    '    datasets.forEach(function(ds,di){',
    '      var col = ds.color || palette[di%palette.length];',
    '      var pts = [];',
    '      (ds.data||[]).forEach(function(v,i){',
    '        var x = padL + i*barW + barW/2;',
    '        var barH2 = (Math.abs(v)/maxV)*drawH;',
    '        var y = padT + drawH - barH2;',
    '        pts.push([x,y]);',
    '        if(cfg.chartType==="bar"){',
    '          bars += "<rect x=\\"" + (x-barW*0.3) + "\\" y=\\""+y+"\\" width=\\"" + (barW*0.6) + "\\" height=\\""+barH2+"\\" fill=\\""+col+"\\" opacity=\\"0.85\\" rx=\\"2\\"/>";',
    '        }',
    '      });',
    '      if(cfg.chartType==="line" && pts.length>1){',
    '        var d="M"+pts.map(function(p){return p[0]+","+p[1];}).join(" L");',
    '        lines+="<path d=\\""+d+"\\" fill=\\"none\\" stroke=\\""+col+"\\" stroke-width=\\"2\\" stroke-linejoin=\\"round\\"/>";',
    '        pts.forEach(function(p){ lines+="<circle cx=\\""+p[0]+"\\" cy=\\""+p[1]+"\\" r=\\"3\\" fill=\\""+col+"\\"/>"; });',
    '      }',
    '    });',
    '',
    '    var axisLine = "<line x1=\\""+padL+"\\" y1=\\""+(padT+drawH)+"\\" x2=\\""+(padL+drawW)+"\\" y2=\\""+(padT+drawH)+"\\" stroke=\\"var(--c-axis)\\" stroke-width=\\"1\\"/>";',
    '    axisLine += "<line x1=\\""+padL+"\\" y1=\\""+padT+"\\" x2=\\""+padL+"\\" y2=\\""+(padT+drawH)+"\\" stroke=\\"var(--c-axis)\\" stroke-width=\\"1\\"/>";',
    '',
    '    var xlabels="";',
    '    labels.forEach(function(lbl,i){',
    '      var x=padL+i*barW+barW/2;',
    '      xlabels+="<text x=\\""+x+"\\" y=\\""+(H-4)+"\\" text-anchor=\\"middle\\" font-size=\\"9\\" fill=\\"var(--c-text)\\">"+esc(String(lbl).slice(0,8))+"</text>";',
    '    });',
    '',
    '    container.innerHTML="<svg viewBox=\\"0 0 "+W+" "+H+"\\" width=\\"100%\\">"+axisLine+bars+lines+xlabels+"</svg>";',
    '  }',
    '',
    '  // ── table renderer ────────────────────────────────────────────────────',
    '',
    '  function renderTable(container, config, data) {',
    '    var rows = [];',
    '    var cols = config.columns || [];',
    '    if (Array.isArray(data)) {',
    '      rows = data;',
    '      if (cols.length === 0 && rows.length > 0 && typeof rows[0] === "object") {',
    '        cols = Object.keys(rows[0]);',
    '      }',
    '    } else if (data && Array.isArray(data.rows)) {',
    '      rows = data.rows;',
    '      if (data.columns && cols.length === 0) cols = data.columns;',
    '    }',
    '    var thead = "<thead><tr>" + cols.map(function(c){ return "<th>"+esc(c)+"</th>"; }).join("") + "</tr></thead>";',
    '    var tbody = "<tbody>" + rows.map(function(row,ri){',
    '      var cls = config.striped && ri%2===1 ? " class=\\"striped\\"" : "";',
    '      var cells = cols.map(function(c){',
    '        var v = (typeof row === "object" && row !== null) ? row[c] : "";',
    '        return "<td>"+esc(v==null?"":String(v))+"</td>";',
    '      }).join("");',
    '      return "<tr"+cls+">"+cells+"</tr>";',
    '    }).join("") + "</tbody>";',
    '    container.innerHTML = (config.title ? "<p class=\\"tbl-title\\">"+esc(config.title)+"</p>" : "") +',
    '      "<div class=\\"tbl-wrap\\"><table>"+thead+tbody+"</table></div>";',
    '  }',
    '',
    '  // ── form renderer ─────────────────────────────────────────────────────',
    '',
    '  function renderForm(container, config) {',
    '    var fields = config.fields || [];',
    '    var formId = "mcp-form-" + Math.random().toString(36).slice(2);',
    '    var html = (config.title ? "<p class=\\"form-title\\">"+esc(config.title)+"</p>" : "") +',
    '      "<form id=\\""+formId+"\\">"; ',
    '    fields.forEach(function(f){',
    '      html += "<div class=\\"field\\">";',
    '      html += "<label for=\\""+esc(f.name)+"\\">"+esc(f.label)+(f.required?"<span class=\\"req\\">*</span>":"")+"</label>";',
    '      var type = f.type || "text";',
    '      if(type === "select"){',
    '        html += "<select id=\\""+esc(f.name)+"\\" name=\\""+esc(f.name)+"\\"" + (f.required?" required":"") + ">";',
    '        (f.options||[]).forEach(function(o){ html+="<option value=\\""+esc(o)+"\\">"+esc(o)+"</option>"; });',
    '        html += "</select>";',
    '      } else if(type === "textarea"){',
    '        html += "<textarea id=\\""+esc(f.name)+"\\" name=\\""+esc(f.name)+"\\"" + (f.required?" required":"") + (f.placeholder?" placeholder=\\""+esc(f.placeholder)+"\\"":"") + "></textarea>";',
    '      } else if(type === "checkbox"){',
    '        html += "<input type=\\"checkbox\\" id=\\""+esc(f.name)+"\\" name=\\""+esc(f.name)+"\\"" + "/>";',
    '      } else {',
    '        html += "<input type=\\""+esc(type)+"\\" id=\\""+esc(f.name)+"\\" name=\\""+esc(f.name)+"\\"" + (f.required?" required":"") + (f.placeholder?" placeholder=\\""+esc(f.placeholder)+"\\"":"") + "/>";',
    '      }',
    '      html += "</div>";',
    '    });',
    '    html += "<button type=\\"submit\\">"+esc(config.submitLabel||"Submit")+"</button></form>";',
    '    container.innerHTML = html;',
    '    var formEl = document.getElementById(formId);',
    '    if(formEl){',
    '      formEl.addEventListener("submit", function(e){',
    '        e.preventDefault();',
    '        var fd = new FormData(formEl);',
    '        var values = {};',
    '        fd.forEach(function(v,k){ values[k]=v; });',
    '        fields.forEach(function(f){',
    '          if(f.type==="checkbox"){',
    '            values[f.name] = !!formEl.querySelector("[name=\\""+f.name+"\\"]").checked;',
    '          }',
    '        });',
    '        sendToHost("mcp:action", { type: "form_submit", values: values });',
    '      });',
    '    }',
    '  }',
    '',
    '  // ── markdown renderer ─────────────────────────────────────────────────',
    '',
    '  function renderMarkdown(container, config, data) {',
    '    var src = (data && typeof data === "string") ? data :',
    '              (data && data.content) ? data.content :',
    '              (config.content || "");',
    // Use String.fromCharCode(96) to produce a backtick without breaking this file's template literals
    '    var BT = String.fromCharCode(96);',
    '    var btRe = new RegExp(BT+"([^"+BT+"]+)"+BT, "g");',
    '    var html = esc(src)',
    '      .replace(/^### (.+)$/gm, "<h3>$1</h3>")',
    '      .replace(/^## (.+)$/gm, "<h2>$1</h2>")',
    '      .replace(/^# (.+)$/gm, "<h1>$1</h1>")',
    '      .replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>")',
    '      .replace(/\\*(.+?)\\*/g, "<em>$1</em>")',
    '      .replace(btRe, "<code>$1</code>")',
    '      .replace(/^- (.+)$/gm, "<li>$1</li>")',
    '      .replace(/\\[(.+?)\\]\\((.+?)\\)/g, function(m, text, href) {',
    '        if (/^\\s*(javascript|data|vbscript):/i.test(href)) return esc(text);',
    '        return "<a href=\\""+esc(href)+"\\">"+text+"</a>";',
    '      })',
    '      .replace(/\\n\\n/g, "</p><p>")',
    '      .replace(/\\n/g, "<br>");',
    '    container.innerHTML = "<div class=\\"md\\"><p>"+html+"</p></div>";',
    '  }',
    '',
    '  // ── code block renderer ───────────────────────────────────────────────',
    '',
    '  function renderCode(container, config, data) {',
    '    var src = (data && typeof data === "string") ? data :',
    '              (data && data.content) ? data.content :',
    '              (config.content || "");',
    '    var lang = (data && data.language) ? data.language : (config.language || "");',
    '    container.innerHTML =',
    '      "<pre><code class=\\"lang-"+esc(lang)+"\\">"+esc(src)+"</code></pre>";',
    '  }',
    '',
    '  // ── component dispatch ────────────────────────────────────────────────',
    '',
    '  function renderComponent(el, type, config, data) {',
    '    try {',
    '      switch(type){',
    '        case "chart":    renderChart(el, config, data);    break;',
    '        case "table":    renderTable(el, config, data);    break;',
    '        case "form":     renderForm(el, config);           break;',
    '        case "markdown": renderMarkdown(el, config, data); break;',
    '        case "code":     renderCode(el, config, data);     break;',
    '        default:',
    '          el.innerHTML = "<p class=\\"err\\">Unknown component type: "+esc(type)+"</p>";',
    '      }',
    '    } catch(err) {',
    '      el.innerHTML = "<p class=\\"err\\">Render error: "+esc(String(err))+"</p>";',
    '    }',
    '  }',
    '',
    '  // ── postMessage bridge ────────────────────────────────────────────────',
    '',
    '  var APP_DEF = null;',
    '  var TOOL_DATA = null;',
    '',
    '  function renderAll() {',
    '    if (!APP_DEF) return;',
    '    var root = document.getElementById("mcp-root");',
    '    if (!root) return;',
    '    root.innerHTML = "";',
    '    (APP_DEF.components || []).forEach(function(comp, idx) {',
    '      var wrapper = document.createElement("div");',
    '      wrapper.className = "comp-wrapper";',
    '      wrapper.dataset.idx = String(idx);',
    '      root.appendChild(wrapper);',
    '      renderComponent(wrapper, comp.type, comp.config || {}, TOOL_DATA);',
    '    });',
    '    setTimeout(reportHeight, 60);',
    '  }',
    '',
    '  window.addEventListener("message", function(evt) {',
    '    if (!evt.data || typeof evt.data !== "object") return;',
    '    var msg = evt.data;',
    '    if (msg.method === "mcp:init") {',
    '      APP_DEF = msg.params.appDefinition;',
    '      TOOL_DATA = msg.params.toolResult;',
    '      applyTheme(msg.params.theme);',
    '      renderAll();',
    '    } else if (msg.method === "mcp:data") {',
    '      TOOL_DATA = msg.params.toolResult;',
    '      renderAll();',
    '    } else if (msg.method === "mcp:theme") {',
    '      applyTheme(msg.params.theme);',
    '    }',
    '  });',
    '',
    '  // ── theme ─────────────────────────────────────────────────────────────',
    '',
    '  function applyTheme(theme) {',
    '    var dark = theme === "dark";',
    '    var r = document.documentElement;',
    '    r.style.setProperty("--c-bg",     dark ? "#1a1a1a" : "#ffffff");',
    '    r.style.setProperty("--c-surface",dark ? "#262626" : "#f8f8f8");',
    '    r.style.setProperty("--c-border", dark ? "#3a3a3a" : "#e5e7eb");',
    '    r.style.setProperty("--c-text",   dark ? "#e4e4e7" : "#111827");',
    '    r.style.setProperty("--c-muted",  dark ? "#71717a" : "#6b7280");',
    '    r.style.setProperty("--c-accent", dark ? "#6366f1" : "#4f46e5");',
    '    r.style.setProperty("--c-axis",   dark ? "#4a4a4a" : "#d1d5db");',
    '    r.style.setProperty("--c-btn-bg", dark ? "#6366f1" : "#4f46e5");',
    '    r.style.setProperty("--c-btn-fg", "#ffffff");',
    '  }',
    '',
    '  sendToHost("mcp:ready", {});',
    '})();',
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Inline CSS builder
// ---------------------------------------------------------------------------

function buildIframeCSS(): string {
  const lines: string[] = [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'html, body {',
    '  font-family: system-ui, -apple-system, sans-serif;',
    '  font-size: 13px;',
    '  line-height: 1.5;',
    '  background: var(--c-bg, #ffffff);',
    '  color: var(--c-text, #111827);',
    '}',
    '#mcp-root { padding: 10px 12px; display: flex; flex-direction: column; gap: 12px; }',
    '.comp-wrapper { width: 100%; }',
    'svg { overflow: visible; }',
    '.tbl-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--c-muted); }',
    '.tbl-wrap { overflow-x: auto; }',
    'table { width: 100%; border-collapse: collapse; font-size: 12px; }',
    'th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid var(--c-border); }',
    'th { font-weight: 600; background: var(--c-surface); }',
    'tr:last-child td { border-bottom: none; }',
    'tr.striped { background: var(--c-surface); }',
    '.form-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--c-muted); }',
    '.field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }',
    'label { font-size: 11px; font-weight: 500; color: var(--c-muted); }',
    '.req { color: #ef4444; margin-left: 2px; }',
    'input[type="text"], input[type="number"], input[type="email"], input[type="password"],',
    'select, textarea {',
    '  width: 100%; padding: 5px 8px;',
    '  border: 1px solid var(--c-border); border-radius: 5px;',
    '  background: var(--c-surface); color: var(--c-text);',
    '  font-size: 12px; outline: none;',
    '}',
    'input:focus, select:focus, textarea:focus { border-color: var(--c-accent); }',
    'textarea { resize: vertical; min-height: 60px; }',
    'input[type="checkbox"] { width: auto; }',
    'button[type="submit"] {',
    '  padding: 6px 14px; border-radius: 5px; font-size: 12px; font-weight: 500; cursor: pointer;',
    '  background: var(--c-btn-bg); color: var(--c-btn-fg); border: none;',
    '  margin-top: 4px;',
    '}',
    'button[type="submit"]:hover { opacity: 0.9; }',
    '.md h1 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }',
    '.md h2 { font-size: 14px; font-weight: 600; margin-bottom: 5px; }',
    '.md h3 { font-size: 13px; font-weight: 600; margin-bottom: 4px; }',
    '.md ul { padding-left: 16px; }',
    '.md li { margin-bottom: 2px; }',
    '.md a { color: var(--c-accent); text-decoration: underline; }',
    '.md p { margin-bottom: 6px; }',
    'pre { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 6px; padding: 8px 10px; overflow-x: auto; }',
    'pre code { font-family: "Cascadia Code", "Fira Mono", monospace; font-size: 11.5px; }',
    '.err { font-size: 11px; color: #ef4444; padding: 4px 0; }',
    // inline code styling (we cannot use backtick selector in TS string safely, so use attribute)
    'code { background: var(--c-surface); padding: 1px 4px; border-radius: 3px; }',
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API: generateSrcdoc
// ---------------------------------------------------------------------------

/**
 * Produces a complete, self-contained HTML document string suitable for an
 * iframe's srcdoc attribute. The document:
 *   - Has no external network requests (all assets inline)
 *   - Applies CSP via <meta> to block eval and external loads
 *   - Boots immediately from embedded data (no async round-trip required)
 *   - Sends "mcp:ready" to the host so it can push a full init payload
 *
 * @param definition  The MCP App definition (components, name, server)
 * @param toolResult  Optional initial tool result data to bind
 */
export function generateSrcdoc(definition: McpAppDefinition, toolResult?: unknown): string {
  const safeDefinition = JSON.stringify(definition).replace(/</g, '\\u003c');
  const safeData =
    toolResult !== undefined ? JSON.stringify(toolResult).replace(/</g, '\\u003c') : 'null';

  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="Content-Security-Policy"\n' +
    "  content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;\">\n" +
    '<style>\n' +
    buildIframeCSS() +
    '\n</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div id="mcp-root" aria-live="polite"></div>\n' +
    '<script>\n' +
    buildIframeScript() +
    '\n' +
    // Auto-init with embedded data so rendering works without a postMessage round-trip
    '(function(){\n' +
    '  window.dispatchEvent(new MessageEvent("message", {\n' +
    '    data: {\n' +
    '      method: "mcp:init",\n' +
    '      params: {\n' +
    '        appDefinition: ' +
    safeDefinition +
    ',\n' +
    '        toolResult: ' +
    safeData +
    ',\n' +
    '        theme: document.documentElement.classList.contains("dark") ? "dark" : "light"\n' +
    '      }\n' +
    '    }\n' +
    '  }));\n' +
    '})();\n' +
    '</script>\n' +
    '</body>\n' +
    '</html>'
  );
}
