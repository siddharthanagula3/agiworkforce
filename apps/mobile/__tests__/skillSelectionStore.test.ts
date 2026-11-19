import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';

describe('mobile skill selection store', () => {
  beforeEach(() => {
    useMobileSkillSelectionStore.setState({ selection: null });
  });

  it('keeps the tools a skill requires so the send step can read them', () => {
    useMobileSkillSelectionStore.getState().selectSkill({
      ownerId: 'owner-1',
      name: 'deck-builder',
      requiredTools: ['create_office_file'],
    });

    expect(useMobileSkillSelectionStore.getState().selection).toEqual({
      ownerId: 'owner-1',
      name: 'deck-builder',
      requiredTools: ['create_office_file'],
    });
  });

  it('stores a skill with no requirements without the field', () => {
    useMobileSkillSelectionStore.getState().selectSkill({ ownerId: 'owner-1', name: 'plain' });

    expect(useMobileSkillSelectionStore.getState().selection).toEqual({
      ownerId: 'owner-1',
      name: 'plain',
    });
  });

  it('clears the selection', () => {
    useMobileSkillSelectionStore.getState().selectSkill({ ownerId: 'owner-1', name: 'plain' });
    useMobileSkillSelectionStore.getState().clearSkill();

    expect(useMobileSkillSelectionStore.getState().selection).toBeNull();
  });
});
