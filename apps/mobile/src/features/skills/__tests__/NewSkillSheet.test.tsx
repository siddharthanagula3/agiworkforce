import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockCreate = jest.fn();

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  createPersonalSkill: (...args: unknown[]) => mockCreate(...args),
}));

import { NewSkillSheet } from '../NewSkillSheet';

function Harness({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityLabel="Open sheet" onPress={() => setOpen(true)}>
        <Text>open</Text>
      </Pressable>
      <NewSkillSheet visible={open} onClose={() => setOpen(false)} onCreated={onCreated} />
    </>
  );
}

function fill(api: ReturnType<typeof render>, name: string, body: string) {
  fireEvent.changeText(api.getByLabelText('Skill name'), name);
  fireEvent.changeText(api.getByLabelText('Skill description'), `${name} description`);
  fireEvent.changeText(api.getByLabelText('Skill instructions'), body);
}

describe('NewSkillSheet save lifetime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a newer draft intact when an earlier cancelled create succeeds', async () => {
    let resolveFirst: () => void = () => undefined;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const onCreated = jest.fn();
    const api = render(<Harness onCreated={onCreated} />);

    fireEvent.press(api.getByLabelText('Open sheet'));
    fill(api, 'first-skill', 'first body');
    await act(async () => {
      fireEvent.press(api.getByLabelText('Create skill'));
    });
    fireEvent.press(api.getByLabelText('Cancel'));

    fireEvent.press(api.getByLabelText('Open sheet'));
    fill(api, 'second-skill', 'second body');

    await act(async () => {
      resolveFirst();
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(api.getByLabelText('Skill name').props.value).toBe('second-skill');
    expect(api.getByLabelText('Skill instructions').props.value).toBe('second body');
    expect(api.getByLabelText('Create skill').props.accessibilityState.disabled).toBe(false);
  });

  it('closes and clears when the current draft saves', async () => {
    mockCreate.mockResolvedValueOnce(undefined);
    const onCreated = jest.fn();
    const api = render(<Harness onCreated={onCreated} />);

    fireEvent.press(api.getByLabelText('Open sheet'));
    fill(api, 'only-skill', 'only body');
    await act(async () => {
      fireEvent.press(api.getByLabelText('Create skill'));
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(api.queryByLabelText('Skill name')).toBeNull();
    fireEvent.press(api.getByLabelText('Open sheet'));
    expect(api.getByLabelText('Skill name').props.value).toBe('');
  });

  it('locks the fields while the current draft is saving', async () => {
    mockCreate.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const api = render(<Harness onCreated={jest.fn()} />);

    fireEvent.press(api.getByLabelText('Open sheet'));
    fill(api, 'locked-skill', 'locked body');
    await act(async () => {
      fireEvent.press(api.getByLabelText('Create skill'));
    });

    expect(api.getByLabelText('Skill name').props.editable).toBe(false);
    expect(api.getByLabelText('Skill description').props.editable).toBe(false);
    expect(api.getByLabelText('Skill instructions').props.editable).toBe(false);
  });
});
