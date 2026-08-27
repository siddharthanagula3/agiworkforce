import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  McpUiResourceCspSchema,
  type McpUiResourceCsp,
} from '@modelcontextprotocol/ext-apps/app-bridge';

export const runtime = 'nodejs';

const MAX_CSP_QUERY_CHARS = 8_192;
const UNSAFE_CSP_TOKEN = /[;\r\n'"\s]/u;

function decodeCsp(request: NextRequest): McpUiResourceCsp | undefined {
  const encoded = request.nextUrl.searchParams.get('csp');
  if (!encoded || encoded.length > MAX_CSP_QUERY_CHARS) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
    const validated = McpUiResourceCspSchema.safeParse(parsed);
    return validated.success ? validated.data : undefined;
  } catch {
    return undefined;
  }
}

function sources(values: string[] | undefined, schemes: readonly string[]): string {
  return (values ?? [])
    .filter((value) => {
      if (!value || UNSAFE_CSP_TOKEN.test(value)) return false;
      return schemes.some((scheme) => value.startsWith(`${scheme}://`));
    })
    .slice(0, 64)
    .join(' ');
}

function buildCsp(csp?: McpUiResourceCsp): string {
  const resources = sources(csp?.resourceDomains, ['https']);
  const connections = sources(csp?.connectDomains, ['https', 'wss']);
  const frames = sources(csp?.frameDomains, ['https']);
  const bases = sources(csp?.baseUriDomains, ['https']);
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob: data: ${resources}`.trim(),
    `style-src 'unsafe-inline' blob: data: ${resources}`.trim(),
    `img-src data: blob: ${resources}`.trim(),
    `font-src data: blob: ${resources}`.trim(),
    `media-src data: blob: ${resources}`.trim(),
    `connect-src ${connections || "'none'"}`,
    `worker-src blob: ${resources}`.trim(),
    `frame-src ${frames || "'none'"}`,
    `base-uri ${bases || "'none'"}`,
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

const PROXY_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#view{box-sizing:border-box;width:100%;height:100%;margin:0;border:0;background:transparent}#view{display:block}</style></head>
<body><iframe id="view" title="MCP App" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
<script>(()=>{
  const inner=document.getElementById('view');
  const ready='ui/notifications/sandbox-proxy-ready';
  const resource='ui/notifications/sandbox-resource-ready';
  const allowMap={camera:'camera',microphone:'microphone',geolocation:'geolocation',clipboardWrite:'clipboard-write'};
  addEventListener('message',(event)=>{
    if(event.source===parent){
      if(event.data&&event.data.method===resource){
        const params=event.data.params||{};
        if(typeof params.sandbox==='string')inner.setAttribute('sandbox',params.sandbox);
        const permissions=params.permissions||{};
        const allow=Object.keys(permissions).map((key)=>allowMap[key]).filter(Boolean).join('; ');
        if(allow)inner.setAttribute('allow',allow);
        if(typeof params.html==='string')inner.srcdoc=params.html;
        return;
      }
      if(inner.contentWindow)inner.contentWindow.postMessage(event.data,'*');
      return;
    }
    if(event.source===inner.contentWindow)parent.postMessage(event.data,'*');
  });
  parent.postMessage({jsonrpc:'2.0',method:ready,params:{}},'*');
})();</script></body></html>`;

export function GET(request: NextRequest): NextResponse {
  return new NextResponse(PROXY_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': buildCsp(decodeCsp(request)),
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      // The two iframe `allow` attributes remain the grant boundary. The
      // document-level policy must not pre-empt capabilities that the host
      // explicitly grants to a dedicated sandbox origin.
      'Permissions-Policy': 'camera=*, microphone=*, geolocation=*, clipboard-write=*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
