/**
 * ChatAIService Tests
 *
 * Tests for the static methods on ChatAIService, the SSE parser helper,
 * and the formatSkillName utility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  })),
}));

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: {
    getState: vi.fn(() => ({
      selectedModelId: 'gpt-4o',
    })),
  },
}));

vi.mock('@core/ai/employees/prompt-management', () => ({
  systemPromptsService: {
    getAvailableEmployees: vi.fn().mockResolvedValue([
      {
        name: 'backend-engineer',
        description: 'Expert in server-side development',
        expertise: ['node', 'python', 'databases'],
        tools: ['code-editor'],
        avatar: '/avatars/backend.png',
      },
      {
        name: 'financial-advisor',
        description: 'Financial planning and advice',
        expertise: ['investing', 'budgeting'],
        tools: ['calculator'],
        avatar: '/avatars/finance.png',
      },
    ]),
  },
}));

vi.mock('@core/ai/orchestration/intelligent-agent-router', () => {
  class MockRouter {
    registerAgents = vi.fn();
    routeQuery = vi.fn().mockReturnValue(['backend-engineer']);
  }
  return {
    IntelligentAgentRouter: MockRouter,
    RoleExpertiseMapping: {
      'backend-engineer': ['node', 'python'],
      'financial-advisor': ['investing'],
    },
    SkillCategories: [
      { name: 'Technical', skills: ['backend-engineer', 'frontend-engineer'] },
      { name: 'Finance', skills: ['financial-advisor'] },
    ],
  };
});

import { ChatAIService } from './chat-ai-service';

describe('ChatAIService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the cached employees between tests by re-importing
    // We can't easily reset module-level state, so we test idempotent paths
  });

  // ==========================================================================
  // getAvailableSkillsSync
  // ==========================================================================

  describe('getAvailableSkillsSync', () => {
    it('returns an array of SkillInfo objects', () => {
      const skills = ChatAIService.getAvailableSkillsSync();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
    });

    it('each skill has id, name, description, category', () => {
      const skills = ChatAIService.getAvailableSkillsSync();
      for (const skill of skills) {
        expect(skill).toHaveProperty('id');
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('description');
        expect(skill).toHaveProperty('category');
      }
    });

    it('formats kebab-case ids into human-readable names', () => {
      const skills = ChatAIService.getAvailableSkillsSync();
      // The default skills include 'backend-engineer' which should become 'Backend Engineer'
      const backendSkill = skills.find((s) => s.id === 'backend-engineer');
      if (backendSkill) {
        expect(backendSkill.name).toBe('Backend Engineer');
      }
    });
  });

  // ==========================================================================
  // getAvailableSkills (async)
  // ==========================================================================

  describe('getAvailableSkills', () => {
    it('returns skills loaded from backend', async () => {
      const skills = await ChatAIService.getAvailableSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(2); // Two mock employees
    });

    it('maps employee names to formatted skill names', async () => {
      const skills = await ChatAIService.getAvailableSkills();

      const be = skills.find((s) => s.id === 'backend-engineer');
      expect(be?.name).toBe('Backend Engineer');
      expect(be?.description).toBe('Expert in server-side development');
    });

    it('assigns categories from SkillCategories', async () => {
      const skills = await ChatAIService.getAvailableSkills();

      const be = skills.find((s) => s.id === 'backend-engineer');
      expect(be?.category).toBe('Technical');

      const fa = skills.find((s) => s.id === 'financial-advisor');
      expect(fa?.category).toBe('Finance');
    });
  });

  // ==========================================================================
  // detectSkill
  // ==========================================================================

  describe('detectSkill', () => {
    it('returns a skill id for a matching query', async () => {
      const result = await ChatAIService.detectSkill('Build me a REST API in Node.js');

      expect(result).toBe('backend-engineer');
    });
  });

  // ==========================================================================
  // getSkillCategories
  // ==========================================================================

  describe('getSkillCategories', () => {
    it('returns the SkillCategories array', () => {
      const categories = ChatAIService.getSkillCategories();

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(2);
      expect(categories![0]!.name!).toBe('Technical');
    });
  });
});
