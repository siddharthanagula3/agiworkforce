import { describe, expect, it } from 'vitest';

import { normalizeOpenAIStrictToolParameters } from '@agiworkforce/provider-protocol';
import { translateChatRequest as translateAnthropicRequest } from '@agiworkforce/providers-anthropic';
import { translateChatRequest as translateGoogleRequest } from '@agiworkforce/providers-google';
import { requireProviderDefaultModel, type ChatRequest, type ToolDef } from '@agiworkforce/types';

import { itineraryToolDefinition } from '@/lib/places/itinerary-tool';
import { answerUiToolDefinition } from '@/lib/services/answer-ui-tool-service';
import { createClarifyToolDefinition } from '@/lib/services/clarify-tool-service';
import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';
import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';
import { productComparisonToolDefinition } from '@/lib/services/product-comparison-tool-service';

type OpenAiStyleTool = {
  function: { name: string; description?: string; parameters: unknown };
};

function toToolDef(tool: OpenAiStyleTool): ToolDef {
  return {
    name: tool.function.name,
    description: tool.function.description ?? '',
    inputSchema: tool.function.parameters as ToolDef['inputSchema'],
  };
}

const MOBILE_TURN_TOOLS: ToolDef[] = [
  createManagedOfficeFileToolDefinition(),
  answerUiToolDefinition(),
  createClarifyToolDefinition(),
  createMapSearchToolDefinition(),
  itineraryToolDefinition(),
  productComparisonToolDefinition(),
].map((tool) => toToolDef(tool as OpenAiStyleTool));

function request(model: string): ChatRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'Write forty short numbered functions.' }],
    tools: MOBILE_TURN_TOOLS,
  };
}

function listValuedTypeOrItems(node: unknown, path: string, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => listValuedTypeOrItems(entry, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'type' || key === 'items') && Array.isArray(value)) found.push(`${path}.${key}`);
    if (key === 'enum' || key === 'default' || key === 'required') continue;
    if (key === 'properties' && value && typeof value === 'object') {
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        listValuedTypeOrItems(child, `${path}.properties.${name}`, found);
      }
      continue;
    }
    listValuedTypeOrItems(value, `${path}.${key}`, found);
  }
  return found;
}

function answerUiBlockProperties(parameters: unknown): Record<string, Record<string, unknown>> {
  const root = parameters as {
    properties: { blocks: { items: { properties: Record<string, Record<string, unknown>> } } };
  };
  return root.properties.blocks.items.properties;
}

describe('the tool schemas a mobile chat turn sends, on each provider', () => {
  it('declares no list-valued type or items to Google, where the answer UI tool failed', () => {
    const translated = translateGoogleRequest(request(requireProviderDefaultModel('google')));
    const declarations = translated.tools?.flatMap((tool) =>
      'functionDeclarations' in tool ? (tool.functionDeclarations ?? []) : [],
    );

    expect(declarations?.map((declaration) => declaration.name)).toEqual(
      MOBILE_TURN_TOOLS.map((tool) => tool.name),
    );
    for (const declaration of declarations ?? []) {
      expect(
        listValuedTypeOrItems(declaration.parameters, declaration.name),
        declaration.name,
      ).toEqual([]);
    }
    const answerUi = declarations?.find(
      (declaration) => declaration.name === answerUiToolDefinition().function.name,
    );
    const block = answerUiBlockProperties(answerUi?.parameters);
    expect(block['value']?.['type']).toBe('string');
    const series = block['series']?.['items'] as {
      properties: Record<string, { items: unknown }>;
    };
    expect(series.properties['values']?.items).toEqual({ type: 'string' });
  });

  it('keeps the JSON Schema type lists for Anthropic and OpenAI, which accept them', () => {
    const anthropic = translateAnthropicRequest(request(requireProviderDefaultModel('anthropic')));
    const answerUiName = answerUiToolDefinition().function.name;
    const anthropicTool = anthropic.tools?.find(
      (tool) => 'name' in tool && tool.name === answerUiName,
    ) as { input_schema: unknown } | undefined;
    expect(answerUiBlockProperties(anthropicTool?.input_schema)['value']?.['type']).toEqual([
      'number',
      'string',
    ]);

    const openAi = normalizeOpenAIStrictToolParameters(
      answerUiToolDefinition().function.parameters,
      false,
    );
    expect(answerUiBlockProperties(openAi)['value']?.['type']).toEqual(['number', 'string']);
  });
});
