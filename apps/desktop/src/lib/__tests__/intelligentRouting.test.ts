/**
 * Tests for the Intelligent Routing System (January 2026)
 *
 * Tests the new intent classification, multi-modal routing, and tool matching.
 */

import { describe, it, expect } from 'vitest';
import { classifyIntentLocally, type ClassificationOptions } from '../intentClassifier';
import { selectModalityModel, getAvailableModels, routeToModalityModel } from '../multiModalRouter';
import { matchTools, getBuiltInToolsByCategory, type McpTool } from '../toolMatcher';
import { routeIntelligentlySync } from '../modelRouter';

// ============================================
// INTENT CLASSIFIER TESTS
// ============================================

describe('IntentClassifier', () => {
  const defaultOptions: ClassificationOptions = {
    tier: 'hobby',
    hasAttachments: false,
    attachmentTypes: [],
  };

  describe('classifyIntentLocally', () => {
    it('should classify image generation requests', () => {
      const result = classifyIntentLocally('Generate an image of a sunset', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('image-gen');
      expect(result!.confidence).toBeGreaterThan(0.7);
    });

    it('should classify video generation requests', () => {
      const result = classifyIntentLocally('Create a video of a dancing cat', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('video-gen');
    });

    it('should classify coding requests', () => {
      const result = classifyIntentLocally(
        'Write a function to sort an array in TypeScript',
        defaultOptions,
      );
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('coding');
    });

    it('should classify search requests', () => {
      const result = classifyIntentLocally(
        'Search the web for the latest news about AI',
        defaultOptions,
      );
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('search');
    });

    it('should classify deep research requests', () => {
      const result = classifyIntentLocally(
        'Do a deep dive research on climate change impacts',
        defaultOptions,
      );
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('deep-research');
    });

    it('should classify TTS requests', () => {
      const result = classifyIntentLocally('Convert this text to speech please', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('tts');
    });

    it('should classify music generation requests', () => {
      const result = classifyIntentLocally('Generate a pop song about summer', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('music');
    });

    it('should detect image attachments', () => {
      const result = classifyIntentLocally('What is in this image?', {
        ...defaultOptions,
        hasAttachments: true,
        attachmentTypes: ['image'],
      });
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('multimodal');
      expect(result!.requiredCapabilities).toContain('vision');
    });

    it('should detect audio attachments as STT', () => {
      const result = classifyIntentLocally('What does this say?', {
        ...defaultOptions,
        hasAttachments: true,
        attachmentTypes: ['audio'],
      });
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('stt');
    });

    it('should default to chat for general questions', () => {
      const result = classifyIntentLocally('Hello, how are you?', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.primary).toBe('chat');
    });
  });
});

// ============================================
// MULTI-MODAL ROUTER TESTS
// ============================================

describe('MultiModalRouter', () => {
  describe('getAvailableModels', () => {
    it('should return image models for hobby tier', () => {
      const models = getAvailableModels('image', 'hobby');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === 'dall-e-3')).toBe(true);
    });

    it('should return more models for pro tier', () => {
      const hobbyModels = getAvailableModels('image', 'hobby');
      const proModels = getAvailableModels('image', 'pro');
      expect(proModels.length).toBeGreaterThanOrEqual(hobbyModels.length);
    });

    it('should return TTS models', () => {
      const models = getAvailableModels('tts', 'hobby');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === 'tts-1')).toBe(true);
    });

    it('should return STT models', () => {
      const models = getAvailableModels('stt', 'hobby');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === 'whisper-1')).toBe(true);
    });

    it('should return search models', () => {
      const models = getAvailableModels('search', 'hobby');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === 'sonar')).toBe(true);
    });
  });

  describe('selectModalityModel', () => {
    it('should select an image model for hobby tier image generation', () => {
      const result = selectModalityModel('image', 'hobby');
      // Hobby tier gets access to economy image models
      expect(result.selectedModel).toBe('dall-e-3');
      expect(result.modality).toBe('image');
    });

    it('should prefer quality when specified', () => {
      const result = selectModalityModel('image', 'max', { preferQuality: true });
      expect(['gpt-image-1.5', 'imagen-4.0-ultra-generate-001']).toContain(
        result.selectedModel,
      );
    });

    it('should select sonar for hobby search', () => {
      const result = selectModalityModel('search', 'hobby');
      expect(result.selectedModel).toBe('sonar');
    });
  });

  describe('routeToModalityModel', () => {
    it('should route image-gen to image model', () => {
      const result = routeToModalityModel('image-gen', 'hobby');
      expect(result).not.toBeNull();
      expect(result!.modality).toBe('image');
    });

    it('should route search to search model', () => {
      const result = routeToModalityModel('search', 'hobby');
      expect(result).not.toBeNull();
      expect(result!.modality).toBe('search');
    });

    it('should route deep-research to search model with deep research', () => {
      const result = routeToModalityModel('deep-research', 'pro');
      expect(result).not.toBeNull();
      expect(result!.selectedModel).toBe('sonar-deep-research');
    });

    it('should return null for chat intent', () => {
      const result = routeToModalityModel('chat', 'hobby');
      expect(result).toBeNull();
    });
  });
});

// ============================================
// TOOL MATCHER TESTS
// ============================================

describe('ToolMatcher', () => {
  describe('matchTools', () => {
    it('should match browser tools for agentic intent', () => {
      const result = matchTools('agentic', 'Browse to google.com and click search');
      expect(result.requiredCategories).toContain('browser');
      expect(result.suggestedTools.length).toBeGreaterThan(0);
      expect(result.suggestedTools.some((t) => t.tool.category === 'browser')).toBe(true);
    });

    it('should match code execution tools for coding intent', () => {
      const result = matchTools('coding', 'Run the test suite');
      expect(result.requiredCategories).toContain('code-execution');
    });

    it('should match image tools for image-gen intent', () => {
      const result = matchTools('image-gen', 'Generate an image of a cat');
      expect(result.requiredCategories).toContain('image');
    });

    it('should match search tools for search intent', () => {
      const result = matchTools('search', 'Search for the latest news');
      expect(result.requiredCategories).toContain('search');
    });

    it('should match audio tools for TTS intent', () => {
      const result = matchTools('tts', 'Read this aloud');
      expect(result.requiredCategories).toContain('audio');
    });

    it('should have no required tools for chat intent', () => {
      const result = matchTools('chat', 'Hello, how are you?');
      expect(result.requiredCategories).toHaveLength(0);
    });

    it('should match MCP tools when provided', () => {
      const mcpTools: McpTool[] = [
        {
          id: 'mcp__browser__navigate',
          name: 'navigate',
          description: 'Navigate to a URL',
          serverName: 'browser',
          category: 'browser',
          capabilities: ['navigate'],
        },
      ];
      const result = matchTools('agentic', 'Browse to google.com', mcpTools);
      expect(result.suggestedTools.some((t) => t.isMcp)).toBe(true);
    });
  });

  describe('getBuiltInToolsByCategory', () => {
    it('should return browser tools', () => {
      const tools = getBuiltInToolsByCategory('browser');
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((t) => t.category === 'browser')).toBe(true);
    });

    it('should return file-system tools', () => {
      const tools = getBuiltInToolsByCategory('file-system');
      expect(tools.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// INTEGRATED ROUTING TESTS
// ============================================

describe('Intelligent Routing Integration', () => {
  describe('routeIntelligentlySync', () => {
    it('should route image generation to image model', () => {
      const result = routeIntelligentlySync('Generate an image of a mountain', 'auto-economy');
      expect(result.modelCategory).toBe('image');
      // Economy mode routes to dall-e-3 (the hobby-tier image model)
      expect(result.selectedModel).toBe('dall-e-3');
      expect(result.intent.primary).toBe('image-gen');
    });

    it('should route coding to chat model with coding task type', () => {
      const result = routeIntelligentlySync('Write a function to reverse a string', 'auto-economy');
      expect(result.modelCategory).toBe('chat');
      expect(result.taskType).toBe('coding');
    });

    it('should route search to search model', () => {
      const result = routeIntelligentlySync('Search the web for latest AI news', 'auto-balanced');
      expect(result.modelCategory).toBe('search');
      expect(result.intent.primary).toBe('search');
    });

    it('should suggest tools based on intent', () => {
      const result = routeIntelligentlySync('Browse to amazon and find laptops', 'auto-premium');
      expect(result.suggestedTools.length).toBeGreaterThan(0);
      expect(result.suggestedTools.some((t) => t.tool.category === 'browser')).toBe(true);
    });

    it('should handle image attachments', () => {
      const result = routeIntelligentlySync('What is in this picture?', 'auto-balanced', {
        hasImages: true,
      });
      expect(result.intent.primary).toBe('multimodal');
      expect(result.taskType).toBe('multimodal');
    });

    it('should set autoExecuteTools for agentic tasks', () => {
      const result = routeIntelligentlySync(
        'Navigate to google.com and click on search button',
        'auto-premium',
      );
      // Agentic tasks should have auto-execute when tools match with high confidence
      expect(result.intent.primary).toBe('agentic');
    });

    it('should return alternatives for premium tier', () => {
      const result = routeIntelligentlySync('Generate an image of a sunset', 'auto-premium');
      expect(result.alternativeModels).toBeDefined();
      expect(result.alternativeModels!.length).toBeGreaterThan(0);
    });

    it('should include estimated cost for modality models', () => {
      const result = routeIntelligentlySync('Generate an image', 'auto-economy');
      expect(result.estimatedCost).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });
});
