import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { DispatchTaskPendingStep } from '@agiworkforce/types';

const mockReply = jest.fn();

jest.mock('@/services/companion', () => ({
  replyToDispatchTask: (...args: unknown[]) => mockReply(...args),
}));

import {
  DispatchTaskReply,
  dispatchFieldError,
} from '@/src/features/companion/components/DispatchTaskReply';

const STEP: DispatchTaskPendingStep = {
  toolCallId: 'call-input',
  kind: 'input',
  inputKey: 'form',
  message: 'Where should the invite go?',
  fields: [
    { key: 'email', title: 'Email', kind: 'text', required: true, format: 'email', maxLength: 40 },
    {
      key: 'room',
      title: 'Room',
      kind: 'choice',
      required: true,
      options: [
        { value: 'north', label: 'North' },
        { value: 'south', label: 'South' },
      ],
    },
  ],
};

const [EMAIL, ROOM] = STEP.kind === 'input' ? STEP.fields : [];

describe('answering a dispatched task on the phone', () => {
  beforeEach(() => {
    mockReply.mockReset();
    mockReply.mockResolvedValue(true);
  });

  it('checks each field the way the computer does', () => {
    expect(dispatchFieldError(EMAIL!, undefined)).not.toBeNull();
    expect(dispatchFieldError(EMAIL!, 'not an email')).not.toBeNull();
    expect(dispatchFieldError(EMAIL!, 'ada@example.com')).toBeNull();
    expect(dispatchFieldError(ROOM!, 'attic')).not.toBeNull();
    expect(dispatchFieldError(ROOM!, 'north')).toBeNull();
  });

  it('does not send an answer that fails a check', async () => {
    const { getByLabelText, findAllByRole } = render(
      <DispatchTaskReply taskRequestId="task-1" steps={[STEP]} />,
    );
    fireEvent.changeText(getByLabelText('Email'), 'nope');
    await act(async () => {
      fireEvent.press(getByLabelText(`Send answer: ${STEP.message}`));
    });
    expect(mockReply).not.toHaveBeenCalled();
    expect((await findAllByRole('alert')).length).toBeGreaterThan(0);
  });

  it('sends a valid answer and shows the step again when the computer refuses it', async () => {
    const { getByLabelText, rerender, findByText, queryByText } = render(
      <DispatchTaskReply taskRequestId="task-1" steps={[STEP]} />,
    );
    fireEvent.changeText(getByLabelText('Email'), 'ada@example.com');
    fireEvent.press(getByLabelText('North'));
    await act(async () => {
      fireEvent.press(getByLabelText(`Send answer: ${STEP.message}`));
    });
    expect(mockReply).toHaveBeenCalledWith('task-1', [
      {
        toolCallId: 'call-input',
        kind: 'input',
        inputKey: 'form',
        values: { email: 'ada@example.com', room: 'north' },
      },
    ]);
    rerender(
      <DispatchTaskReply
        taskRequestId="task-1"
        steps={[STEP]}
        replyError={{
          toolCallId: 'call-input',
          message: 'Room: Choose one of the options offered.',
        }}
      />,
    );
    expect(
      await findByText('The computer did not accept that answer. Check it and send it again.'),
    ).toBeTruthy();
    expect(queryByText('Room: Choose one of the options offered.')).toBeNull();
    expect(getByLabelText('Email')).toBeTruthy();
  });
});
