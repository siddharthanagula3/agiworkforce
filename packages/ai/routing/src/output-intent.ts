import {
  explicitWebSearchRequestSignals,
  webSearchRequestText,
  withoutQuotedRequestMaterial,
} from '@agiworkforce/search';

export type ResponseOutputIntent = 'image' | 'rendered' | 'text' | 'calculation' | 'unknown';
export type ImageToolIntent = 'generate' | 'edit' | 'continuation' | null;

const REQUEST_LABEL = /^[\p{Lu}\d _-]{2,40}:\s*/u;
const REQUEST_PREFIX =
  /^(?:(?:please|kindly|just|now|hey|hi|okay|ok|visually)[\s,!.:]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?/iu;
const REQUEST_CONTEXT =
  /^(?:using|given|with|based\s+on|from)\b[^.!?\n]{1,600}?,\s*(?=(?:render|show|display|create|make|generate|calculate)\b)/iu;
const DESIRED_OUTPUT_PREFIX = /^(?:i\s+(?:need|want)|i['’]d\s+like)\s+(?:you\s+to\s+)?/iu;
const STRUCTURED_FORMAT = /^(?:use\s+)?(?:html|react|svg|mermaid)\b/iu;
const FENCE_START = /^\s*(`{3,}|~{3,})/u;
const IMAGE_COMMAND = /^\/(?:image|imagine|draw|generate)\b/iu;
const OUTPUT_ACTION =
  /^(?:show|display|render|present|demonstrate|typeset|create|make|generate|design|build|draw|paint|illustrate|visuali[sz]e|write|draft|compose|prepare|provide|give|produce|rewrite|re-write|translate|summari[sz]e|paraphrase|proofread|edit|polish|format|reformat|convert|turn|repeat|echo|respond|reply)\b[\s,:-]*/iu;
const OUTPUT_FILLER =
  /^(?:(?:me|us|one|two|three|four|five|six|seven|eight|nine|ten|some|an?|the|this|that|these|those|my|our|your|complete|comprehensive|different|several|multiple|reusable|independent|independently|separate|copyable|editable|interactive|live|inline|beautiful|detailed|simple|small|short|long|concise|full|new|visual|visually|rich|real|actual|intelligent|native|responsive|professional|polished|formatted|\d+)[\s,:-]+)*/iu;
const IMAGE_OUTPUT =
  /^(?:or\s+(?:retrieve|find)\s+)?(?:[\p{L}\d-]+\s+){0,3}?(?:images?|pictures?|photos?|photographs?|illustrations?|logos?|artwork|drawings?|paintings?|sketch(?:es)?|portraits?|posters?|banners?|avatars?|thumbnails?|wallpapers?|icons?|stickers?|collages?)\b/iu;
const RENDERED_OUTPUT =
  /^(?:(?:html|react|svg|mermaid|web|user|chat|email|writing|data|bar|line|pie|donut|sequence|flow|metric|image|photo|component|ui|interface)\s+){0,3}(?:ui|interfaces?|screens?|apps?|web\s*pages?|websites?|dashboards?|mockups?|wireframes?|charts?|graphs?|plots?|diagrams?|flowcharts?|tables?|forms?|cards?|carousels?|galler(?:y|ies)|components?|artifacts?|calculators?|widgets?|timelines?|checklists?|math|equations?|formulae?|formulas?|rendering)\b/iu;
const TEXT_OUTPUT =
  /^(?:(?:follow[- ]up|cover|leave|thank[- ]you|linkedin|markdown|text|code|shell|sql|email|writing|document|prompt|copy|reusable|independent|separate|formatted|image|art)\s+){0,3}(?:emails?|messages?|letters?|documents?|prompts?|snippets?|commands?|posts?|bios?|captions?|stories|story|poems?|essays?|reports?|summar(?:y|ies)|translations?|paragraphs?|sentences?|text|copy|code|responses?|replies|reply|notes?|templates?|blocks?)\b/iu;
const TEXT_AUTHORING = /^(?:write|draft|compose)\b/iu;
const TEXT_TRANSFORMATION =
  /^(?:rewrite|re-write|translate|summari[sz]e|paraphrase|proofread|polish|format|reformat|repeat|echo|respond|reply)\b/iu;
const CALCULATION_REQUEST = /^(?:calculate|compute|solve|derive|evaluate|simplify)\b/iu;
const CALCULATION_EXPRESSION =
  /^(?:(?:what(?:'s|\s+is)|how\s+much\s+is)\s+)?(?:-?\d+(?:\.\d+)?\s*(?:[+*/×÷^=-]|plus|minus|times|divided\s+by|percent\s+of)\s*)+-?\d+(?:\.\d+)?\s*\??$/iu;
const EXTERNAL_FACTS =
  /\b(?:(?:latest|current|recent|live|real[- ]time|up[- ]to[- ]date|today'?s?)\s+(?:(?:\w+)\s+){0,2}(?:news|events?|prices?|rates?|weather|forecast|versions?|releases?|results?|scores?|standings|market\s+data)|(?:who\s+(?:is|are)|current|incumbent|sitting)\s+(?:the\s+)?(?:president|prime\s+minister|governor|mayor|ceo|cfo|cto)|what\s+happened\s+(?:today|yesterday)|research\s+(?:report|paper))\b/iu;
const DRAW_SUBJECT = /^(?:draw|paint)\s+(?!up\b)/iu;
const DATA_RENDERING_REQUEST =
  /^(?:render|show|display|visuali[sz]e|present|demonstrate|build|create|make|generate|design)\b[^.!?\n]*\b(?:data|charts?|graphs?|plots?|diagrams?|ui|interfaces?|components?|artifacts?|forms?|cards?|carousels?|galler(?:y|ies)|tables?|checklists?|calculators?|equations?|formulas?|theorems?|matri(?:x|ces)|integrals?|summations?|math)\b/iu;
const CHAT_RENDERING_REQUEST =
  /\b(?:what|which|show|demonstrate|display)\b[^.!?\n]*\b(?:this\s+chat\s+(?:can\s+)?(?:render|supports?)|render\s+(?:in\s+)?this\s+chat|inline\s+in\s+(?:this|the)\s+chat)/iu;
const SNIPPET_OUTPUT = /^(?:[\p{L}+#.-]+\s+){0,2}(?:snippets?|code\s+blocks?)\b/iu;
const CODE_OUTPUT =
  /^(?:and\s+(?:run|execute)\s+)?(?:[\p{L}+#.-]+\s+){0,3}(?:code(?:\s+(?:examples?|snippets?|blocks?))?|programs?|scripts?)\b/iu;
const IMAGE_EDIT_REQUEST =
  /^(?:edit|restyle|retouch|crop|rotate|resize|upscale|sharpen|recolou?r|inpaint|outpaint)\b|^(?:change|modify|transform|convert|turn)\b[^.!?\n]{0,160}\b(?:image|photo|picture|illustration|portrait)\b/iu;
const IMAGE_VISUAL_EDIT =
  /^(?:make|turn|change)\s+(?:it|this|that|the\s+(?:image|picture|photo))\b[^.!?\n]{0,160}\b(?:warmer|cooler|brighter|darker|lighter|sharper|softer|colou?rful|saturated|photorealistic|transparent)\b|^(?:make|change|remove|replace)\b[^.!?\n]{0,80}\b(?:background|lighting|watermark)\b/iu;
const IMAGE_CONTINUATION =
  /^(?:(?:another|one\s+more)(?:\s+(?:one|image|picture|photo|version|variation))?|(?:make|generate|create|draw)\s+(?:another|one\s+more)\s+(?:one|version|variation))\s*[.!?]?$/iu;
const IMAGE_REFERENCE =
  /\b(?:from|based\s+on|using)\s+(?:(?:the|this|that|my|attached|uploaded|source|reference)\s+){1,3}(?:image|photo|picture|illustration|portrait)\b/iu;

function withoutFencedMaterial(message: string): string {
  const output: string[] = [];
  let fence = '';
  for (const line of message.split('\n')) {
    const marker = FENCE_START.exec(line)?.[1] ?? '';
    if (fence) {
      if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trimStart().slice(marker.length).trim() === ''
      )
        fence = '';
    } else if (marker) {
      fence = marker;
    } else {
      output.push(line);
    }
  }
  return output.join('\n');
}

function requestText(message: string): string {
  return withoutQuotedRequestMaterial(withoutFencedMaterial(message))
    .trimStart()
    .replace(REQUEST_LABEL, '')
    .replace(REQUEST_CONTEXT, '')
    .replace(REQUEST_PREFIX, '')
    .replace(DESIRED_OUTPUT_PREFIX, '')
    .replace(REQUEST_PREFIX, '');
}

export function classifyResponseOutputIntent(message: string): ResponseOutputIntent {
  const request = requestText(message);
  if (IMAGE_COMMAND.test(request)) return 'image';
  if (CALCULATION_REQUEST.test(request) || CALCULATION_EXPRESSION.test(request))
    return 'calculation';
  if (TEXT_TRANSFORMATION.test(request)) return 'text';
  const action = OUTPUT_ACTION.exec(request);
  const output = request.slice(action?.[0].length ?? 0).replace(OUTPUT_FILLER, '');
  if (STRUCTURED_FORMAT.test(output) || RENDERED_OUTPUT.test(output)) return 'rendered';
  if (
    TEXT_OUTPUT.test(output) ||
    SNIPPET_OUTPUT.test(output) ||
    CODE_OUTPUT.test(output) ||
    TEXT_AUTHORING.test(request)
  )
    return 'text';
  if (!action) {
    if (
      DESIRED_OUTPUT_PREFIX.test(message.trimStart().replace(REQUEST_PREFIX, '')) &&
      IMAGE_OUTPUT.test(output)
    )
      return 'image';
    return CHAT_RENDERING_REQUEST.test(request) ? 'rendered' : 'unknown';
  }
  if (IMAGE_OUTPUT.test(output)) return 'image';
  if (DRAW_SUBJECT.test(request)) return 'image';
  if (DATA_RENDERING_REQUEST.test(request) || CHAT_RENDERING_REQUEST.test(request))
    return 'rendered';
  return 'unknown';
}

export function isSelfContainedResponseRequest(message: string): boolean {
  const request = requestText(webSearchRequestText(message));
  const signals = explicitWebSearchRequestSignals(message);
  return (
    classifyResponseOutputIntent(message) !== 'unknown' &&
    !signals.includes('search_verb') &&
    !signals.includes('sources') &&
    (TEXT_TRANSFORMATION.test(request) || !EXTERNAL_FACTS.test(request))
  );
}

export function requestsNonImageOutput(message: string): boolean {
  const output = classifyResponseOutputIntent(message);
  return output === 'rendered' || output === 'text' || output === 'calculation';
}

export function classifyImageToolIntent(message: string): ImageToolIntent {
  if (requestsNonImageOutput(message)) return null;
  const request = requestText(message);
  if (
    IMAGE_EDIT_REQUEST.test(request) ||
    IMAGE_VISUAL_EDIT.test(request) ||
    IMAGE_REFERENCE.test(request)
  )
    return 'edit';
  if (IMAGE_CONTINUATION.test(request)) return 'continuation';
  return classifyResponseOutputIntent(message) === 'image' ? 'generate' : null;
}

export function imageToolIntentAllows(
  intent: ImageToolIntent,
  operation: 'generate' | 'edit',
  hasSourceImage: boolean,
): boolean {
  if (intent === 'generate') return operation === 'generate';
  if (intent === 'edit') return operation === 'edit' && hasSourceImage;
  return intent === 'continuation' && hasSourceImage;
}

export function requestsSeparateImageResources(message: string): boolean {
  if (classifyImageToolIntent(message) !== 'generate') return false;
  const request = requestText(message);
  const action = OUTPUT_ACTION.exec(request);
  const object = request.slice(action?.[0].length ?? 0).trim();
  const withoutFillers = object.replace(OUTPUT_FILLER, '');
  const firstResource = IMAGE_OUTPUT.exec(withoutFillers)?.[0];
  if (!firstResource) return false;
  const resourceWords = firstResource.trim().split(/\s+/u);
  const noun = resourceWords[resourceWords.length - 1] ?? '';
  const prefix = object.slice(
    0,
    object.length - withoutFillers.length + firstResource.length - noun.length,
  );
  return (
    noun.endsWith('s') ||
    /\b(?:multiple|several|many|various|different|distinct|two|three|four|five|six|seven|eight|nine|ten)\b/iu.test(
      prefix,
    ) ||
    [...prefix.matchAll(/\b\d+\b/gu)].some((match) => Number(match[0]) > 1)
  );
}
