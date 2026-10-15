import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.fn();

vi.mock('electron', () => ({ dialog: { showMessageBox }, Notification: class {} }));

const {
  askNativeQuestion,
  DECLINED_QUIET_MS,
  GROUP_DECLINES_BEFORE_QUIET,
  OPEN_QUESTION_LIMIT,
  resetNativeQuestions,
} = await import('../runtime/nativeQuestions');

const options = { message: 'Allow this?', buttons: ['Cancel', 'Allow'], cancelId: 0 };
const cancel = { response: 0, checkboxChecked: false };
const allow = { response: 1, checkboxChecked: true };

function pending() {
  let answer: (value: typeof cancel) => void = () => undefined;
  showMessageBox.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  return (value: typeof cancel) => answer(value);
}

beforeEach(() => {
  showMessageBox.mockReset();
  resetNativeQuestions();
});

// Whoever asks chooses when and how often. A page could stack sheets behind
// one another and raise each again the moment it was cancelled.
describe('a native question', () => {
  it('is open once per subject: a second asker joins it and gets its answer', async () => {
    const answer = pending();
    const subject = { group: 'shell /p', key: 'ls' };

    const first = askNativeQuestion(null, subject, options);
    const second = askNativeQuestion(null, subject, options);
    answer(allow);

    expect(await first).toEqual(allow);
    expect(await second).toEqual(allow);
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('waits behind no more than the limit, and answers the rest as Cancel saying why', async () => {
    const answers = Array.from({ length: OPEN_QUESTION_LIMIT }, () => pending());
    const open = answers.map((_, index) =>
      askNativeQuestion(null, { group: 'g', key: `k${index}` }, options),
    );

    const crowded = await askNativeQuestion(null, { group: 'g', key: 'one more' }, options);

    expect(crowded).toEqual({ ...cancel, notAsked: 'too-many-open' });
    expect(showMessageBox).toHaveBeenCalledTimes(OPEN_QUESTION_LIMIT);
    for (const answer of answers) answer(allow);
    await Promise.all(open);

    showMessageBox.mockResolvedValueOnce(allow);
    expect(await askNativeQuestion(null, { group: 'g', key: 'one more' }, options)).toEqual(allow);
  });

  it('is asked again after a Cancel unless its subject says to stay quiet', async () => {
    showMessageBox.mockResolvedValue(cancel);
    const subject = { group: 'withdraw', key: 'root-1' };

    await askNativeQuestion(null, subject, options);
    await askNativeQuestion(null, subject, options);

    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('stays quiet about a subject for a minute after a Cancel, then asks again', async () => {
    const clock = vi.spyOn(Date, 'now');
    const subject = { group: 'shell /p', key: 'rm -rf build', quietAfterCancel: true };
    try {
      clock.mockReturnValue(1_000);
      showMessageBox.mockResolvedValueOnce(cancel).mockResolvedValueOnce(allow);

      expect(await askNativeQuestion(null, subject, options)).toEqual(cancel);
      clock.mockReturnValue(1_000 + DECLINED_QUIET_MS - 1);
      expect(await askNativeQuestion(null, subject, options)).toEqual({
        ...cancel,
        notAsked: 'cancelled-recently',
      });
      expect(showMessageBox).toHaveBeenCalledTimes(1);

      clock.mockReturnValue(1_000 + DECLINED_QUIET_MS);
      expect(await askNativeQuestion(null, subject, options)).toEqual(allow);
    } finally {
      clock.mockRestore();
    }
  });

  it('quiets a whole group once several different questions in it were cancelled, and no other group', async () => {
    showMessageBox.mockResolvedValue(cancel);
    const about = (key: string, group = 'shell /p') => ({ group, key, quietAfterCancel: true });

    for (let asked = 0; asked < GROUP_DECLINES_BEFORE_QUIET; asked += 1) {
      await askNativeQuestion(null, about(`command ${asked}`), options);
    }
    const next = await askNativeQuestion(null, about('yet another command'), options);
    const elsewhere = await askNativeQuestion(null, about('ls', 'shell /other'), options);

    expect(next.notAsked).toBe('cancelled-recently');
    expect(elsewhere.notAsked).toBeUndefined();
    expect(showMessageBox).toHaveBeenCalledTimes(GROUP_DECLINES_BEFORE_QUIET + 1);
  });

  it('does not count an allow against its group', async () => {
    showMessageBox.mockResolvedValue(allow);
    for (let asked = 0; asked < 6; asked += 1) {
      const answer = await askNativeQuestion(
        null,
        { group: 'shell /p', key: `command ${asked}`, quietAfterCancel: true },
        options,
      );
      expect(answer).toEqual(allow);
    }
  });
});
