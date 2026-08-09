/**
 * Russian catalog. Key parity with `en` is enforced by l10n.test.ts.
 */
const ru = {
  'applyEdit.prompt': 'AGI Workforce: применить результат {command}?',
  'applyEdit.applyInline': 'Применить на месте',
  'applyEdit.viewInNewTab': 'Открыть в новой вкладке',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: не удалось применить правку автоматически — документ мог измениться.',
  'applyEdit.applyFailed': 'AGI Workforce: не удалось применить правку — документ мог измениться.',
  'advancedFeatures.inlineNeedsCredential':
    'Встроенные подсказки AGI Workforce требуют входа в AGI Cloud или ключа API AGI.',
  'advancedFeatures.openAccount': 'Открыть аккаунт',
  'subsystemHealth.allHealthy': 'AGI Workforce: все подсистемы исправны.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} недоступна',
  'subsystemHealth.manyUnavailable': 'AGI: недоступных подсистем — {count}',
  'subsystemHealth.detailsTooltip': 'Нажмите для подробностей',
  'subsystemHealth.failuresTitle': 'AGI Workforce — Сбои подсистем',
  'subsystemHealth.failuresPlaceholder': 'Сбои, зафиксированные за эту сессию',
};

export default ru;
