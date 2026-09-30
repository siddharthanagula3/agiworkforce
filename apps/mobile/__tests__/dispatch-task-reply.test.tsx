import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { DispatchTaskPendingStep, DispatchTaskReplyErrorCode } from '@agiworkforce/types';

const mockReply = jest.fn();

jest.mock('@/services/companion', () => ({
  replyToDispatchTask: (...args: unknown[]) => mockReply(...args),
}));

import {
  DispatchTaskReply,
  dispatchFieldError,
  replyErrorCopy,
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
          message: 'relayed <b>text</b> from the computer',
          fieldId: 'room',
          code: 'not_an_option',
        }}
      />,
    );
    expect(await findByText('Room: choose one of the options offered.')).toBeTruthy();
    expect(queryByText(/relayed/)).toBeNull();
    expect(getByLabelText('Email')).toBeTruthy();
  });
});

describe('replyErrorCopy', () => {
  it('writes its own copy for each code with the field label it already holds', () => {
    const at = (code: DispatchTaskReplyErrorCode, fieldId = 'email') =>
      replyErrorCopy({ toolCallId: 'call-input', message: 'ignored', fieldId, code }, [STEP]);
    expect(at('required')).toBe('Email: this is required.');
    expect(at('required', 'room')).toBe('Room: choose an option.');
    expect(at('not_an_option', 'room')).toBe('Room: choose one of the options offered.');
    expect(at('bad_format')).toBe('Email: enter an email address.');
    expect(at('too_long')).toBe('Email: use at most 40 characters.');
    expect(at('expired')).toBe('This question is no longer waiting for an answer.');
  });

  it('falls back to generic copy and never echoes the relayed message', () => {
    const generic = 'The computer did not accept that answer. Check it and send it again.';
    expect(replyErrorCopy({ toolCallId: 'call-input', message: 'secret detail' }, [STEP])).toBe(
      generic,
    );
    expect(
      replyErrorCopy(
        { toolCallId: 'call-input', message: 'secret detail', fieldId: 'nope', code: 'required' },
        [STEP],
      ),
    ).toBe(generic);
    expect(
      replyErrorCopy(
        { toolCallId: 'other', message: 'secret detail', fieldId: 'email', code: 'required' },
        [STEP],
      ),
    ).toBe(generic);
  });
});
