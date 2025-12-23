export const editor = {
  create: () => null,
  createModel: () => null,
  defineTheme: () => {},
  setTheme: () => {},
  IStandaloneCodeEditor: {},
};

export const languages = {
  register: () => {},
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  setMonarchTokensProvider: () => ({ dispose: () => {} }),
  setLanguageConfiguration: () => ({ dispose: () => {} }),
};

export const Range = class Range {
  constructor() {}
};

export const Selection = class Selection {
  constructor() {}
};

export const KeyMod = {
  CtrlCmd: 2048,
  Shift: 1024,
  Alt: 512,
  WinCtrl: 256,
};

export const KeyCode = {
  Enter: 3,
  Escape: 9,
  Backspace: 1,
  Tab: 2,
};

export default {
  editor,
  languages,
  Range,
  Selection,
  KeyMod,
  KeyCode,
};
