# Phase 6b Test Coverage Analysis — Master Index

**Purpose**: Complete test coverage analysis and implementation roadmap for AGI Workforce web app
**Date**: 2026-03-16
**Phase**: Phase 6b: Test Writing and Coverage Verification
**Status**: Analysis Complete, Ready for Implementation

---

## Document Structure

This analysis consists of 3 comprehensive reports:

### 1. TEST_COVERAGE_REPORT.md

**What**: Overall test coverage status, metrics, and gap analysis
**Key Metrics**:

- Test Pass Rate: 97.7% (3472/3555 tests passing)
- Test Files: 34 failed, 124 passed
- Critical Blockers: 3 unhandled errors
- Estimated Current Coverage: ~65% (lines), ~60% (branches)
- Target Coverage: 80%+ across all metrics

**Key Findings**:

- 158 test files (good foundation)
- 83 failing tests (mostly due to 3 mock issues)
- 30+ components with 0% coverage (critical gaps)
- Chat interface, sidebar, artifacts, composer untested

**Use When**:

- Getting overview of coverage status
- Understanding current test landscape
- Identifying coverage gaps by feature
- Reviewing test failure summaries

---

### 2. COVERAGE_GAPS_PRIORITY.md

**What**: Detailed test specifications and priority matrix
**Key Sections**:

#### Priority Tiers

1. **CRITICAL (P0)** - 3-4 hours
   - Fix 3 unhandled promise rejections
   - Fix HelpTour selector ambiguity
   - Fix ToolTimeline duration test

2. **HIGH (P1)** - 28-38 hours
   - MessageListNew (8-12h)
   - ChatComposerNew (6-8h)
   - ChatSidebarNew (8-10h)
   - ArtifactsPanel (6-8h)

3. **MEDIUM (P2)** - 10-15 hours
   - ToolTimeline extended tests
   - ReasoningAccordion tests
   - Audio components tests

4. **LOW (P3)** - 6-8 hours
   - Settings pages
   - Remaining stores

#### Detailed Test Specifications

Each priority tier includes:

- Current coverage status
- Feature scope breakdown
- Full test case implementations
- Acceptance criteria
- Time estimates

**Use When**:

- Planning sprint work
- Writing actual test code
- Understanding test requirements
- Estimating implementation effort

---

### 3. TEST_INFRASTRUCTURE_ISSUES.md

**What**: Architectural issues and recommended tooling improvements
**Key Issues**:

1. **Missing Mock Factories** (CRITICAL)
   - systemPromptsService undefined
   - Causes 3 unhandled rejections
   - Fix: Create `/test/factories/` directory

2. **Mock Reset Issues** (HIGH)
   - State leaks between tests
   - Non-deterministic failures
   - Fix: Use `beforeEach()` setup pattern

3. **Inadequate Async Patterns** (MEDIUM)
   - Manual setTimeout usage
   - waitFor timeout issues
   - Fix: Create async test helpers

4. **No Component Test Wrapper** (MEDIUM)
   - Repetitive provider setup
   - Inconsistent test context
   - Fix: Create TestWrapper component

5. **Missing Zustand Utilities** (MEDIUM)
   - Verbose store testing
   - Boilerplate code
   - Fix: Create store test helpers

**Use When**:

- Setting up test infrastructure
- Creating mock factories
- Establishing test patterns
- Training team on conventions

---

## How to Use These Documents

### For Team Lead / Manager

1. Read **TEST_COVERAGE_REPORT.md** executive summary
2. Review priority tiers in **COVERAGE_GAPS_PRIORITY.md**
3. Estimate: ~50-60 hours effort for 80%+ coverage
4. Plan: 2-3 week sprint with 2-3 engineers

### For Test Implementation Engineer

1. Start with **CRITICAL (P0)** issues in COVERAGE_GAPS_PRIORITY.md
2. Reference TEST_INFRASTRUCTURE_ISSUES.md for tooling setup
3. Use detailed test specifications for implementation
4. Validate against acceptance criteria

### For Code Reviewer

1. Review mock factory implementations against TEST_INFRASTRUCTURE_ISSUES.md
2. Check test patterns match COVERAGE_GAPS_PRIORITY.md specs
3. Verify coverage metrics in TEST_COVERAGE_REPORT.md

---

## Key Metrics Summary

| Metric              | Current | Target | Gap   |
| ------------------- | ------- | ------ | ----- |
| Test Pass Rate      | 97.7%   | 100%   | +2.3% |
| Lines Coverage      | ~65%    | 80%+   | +15%  |
| Branches Coverage   | ~60%    | 75%+   | +15%  |
| Functions Coverage  | ~72%    | 80%+   | +8%   |
| Statements Coverage | ~64%    | 80%+   | +16%  |

**Time to Target**: 50-60 hours (2-3 weeks @ 2-3 engineers)

---

## Implementation Roadmap

### Phase 6b Week 1 (CRITICAL)

**Monday-Wednesday** (12 hours):

1. Fix chat-ai-service mock (2h)
   - Add systemPromptsService factory
   - Add tests verification (1h)
   - Commit: `fix(test): mock systemPromptsService.getAvailableEmployees()`

2. Fix HelpTour selector (1.5h)
   - Add data-testid to buttons
   - Update test selectors
   - Commit: `fix(test): disambiguate HelpTour skip button selector`

3. Fix ToolTimeline duration test (2h)
   - Debug async rendering
   - Fix duration format
   - Commit: `fix(test): ToolTimeline duration display in expanded state`

4. Create test infrastructure (6.5h)
   - Create test/factories/ directory
   - Create test/utils/ with helpers
   - Create TestWrapper component
   - Update test/setup.ts

**By End of Week 1**: All blockers fixed, test infrastructure in place

### Phase 6b Week 2-3 (HIGH PRIORITY)

**Week 2** (24 hours):

- MessageListNew component tests (8-12h)
- ChatComposerNew component tests (6-8h)
- Begin ChatSidebarNew (4-6h)

**Week 3** (14 hours):

- Complete ChatSidebarNew (4-6h)
- ArtifactsPanel component tests (6-8h)
- Begin MEDIUM priority items

### Post Week 3 (MEDIUM + LOW)

- ToolTimeline extended tests
- ReasoningAccordion tests
- Audio components tests
- Settings pages tests
- Final coverage validation

---

## Critical Path Items

**Must-Do First** (Day 1):

```
1. Create test/factories/system-prompts-service.mock.ts
2. Fix chat-ai-service.test.ts mock import
3. Verify 3 tests now pass (no unhandled rejections)
```

**Must-Do By Wednesday**:

```
4. Create test/utils/test-wrapper.tsx
5. Create test/utils/async-helpers.ts
6. Fix HelpTour and ToolTimeline tests
```

**This Sprint**:

```
7. Start MessageListNew tests
8. Document test patterns in README
```

---

## Success Criteria

Phase 6b is complete when:

- [ ] All 83 failing tests pass (or are removed as invalid)
- [ ] 0 unhandled promise rejections
- [ ] test/factories/ directory with 4+ mock factories
- [ ] test/utils/ directory with 5+ helper modules
- [ ] Coverage: Lines 80%+, Branches 75%+, Functions 80%+
- [ ] 4 critical components tested (MessageListNew, ChatComposerNew, ChatSidebarNew, ArtifactsPanel)
- [ ] COVERAGE_REPORT.md updated with new metrics
- [ ] All new tests documented with JSDoc comments

---

## File Cross-References

### From TEST_COVERAGE_REPORT.md

- Failing tests: useHelpTour.test.ts:139, HelpTour.test.tsx:379, ToolTimeline.test.tsx:488
- Untested components: 30+ files listed in appendix
- Gap analysis: Chat interface (HIGH), Tool execution (HIGH), Audio (MEDIUM)

### From COVERAGE_GAPS_PRIORITY.md

- P0 Issue #1: chat-ai-service mock (line 56-307)
- P0 Issue #2: HelpTour selectors (line 379)
- P0 Issue #3: ToolTimeline duration (line 488)
- P1 Components: MessageListNew, ChatComposerNew, ChatSidebarNew, ArtifactsPanel
- Full test specs: 60+ test cases defined with implementation code

### From TEST_INFRASTRUCTURE_ISSUES.md

- Mock factory location: test/factories/\*
- Test wrapper location: test/utils/test-wrapper.tsx
- Async helpers location: test/utils/async-helpers.ts
- Zustand helpers location: test/utils/zustand-helpers.ts

---

## Resource Links

### Official Documentation

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Zustand Testing](https://docs.pmnd.rs/zustand/guides/testing)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

### Internal References

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/vitest.config.ts` — Test config
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/test/setup.ts` — Test environment
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/**` — Main feature area

---

## Next Steps

1. **Today**: Share these documents with team
2. **Tomorrow**: Begin P0 fixes (critical blockers)
3. **This Week**: Set up test infrastructure
4. **Next 2 Weeks**: Implement HIGH priority tests
5. **Final Week**: Complete MEDIUM priority, validate coverage

---

## Questions & Support

**Q: How long will 80%+ coverage take?**
A: 50-60 hours across 2-3 engineers, approximately 2-3 weeks.

**Q: Can we parallelize test writing?**
A: Yes! See zone ownership in COVERAGE_GAPS_PRIORITY.md. Different engineers can work on different components simultaneously.

**Q: Should we write E2E tests first or unit tests?**
A: Unit tests first (this sprint). E2E tests are Phase 7.

**Q: What if a component is too complex to test?**
A: Consider refactoring. Complex components usually indicate design issues. See TEST_INFRASTRUCTURE_ISSUES.md for patterns that help simplify testing.

---

## Document Maintenance

**Last Updated**: 2026-03-16
**Next Review**: After P0 fixes (3-4 days)
**Final Review**: After Phase 6b completion (2-3 weeks)

---

**Generated by**: Claude Code Coverage Analysis (2026-03-16)
**For**: AGI Workforce Phase 6b Implementation Team
**Status**: READY FOR IMPLEMENTATION ✓
