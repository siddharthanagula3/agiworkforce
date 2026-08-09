/**
 * Korean catalog. Key parity with `en` is enforced by l10n.test.ts.
 */
const ko = {
  'applyEdit.prompt': 'AGI Workforce: {command} 결과를 적용할까요?',
  'applyEdit.applyInline': '인라인 적용',
  'applyEdit.viewInNewTab': '새 탭에서 보기',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: 편집을 자동으로 적용하지 못했습니다 — 문서가 변경되었을 수 있습니다.',
  'applyEdit.applyFailed':
    'AGI Workforce: 편집을 적용하지 못했습니다 — 문서가 변경되었을 수 있습니다.',
  'advancedFeatures.inlineNeedsCredential':
    'AGI Workforce 인라인 완성에는 AGI Cloud 로그인 또는 AGI API 키가 필요합니다.',
  'advancedFeatures.openAccount': '계정 열기',
  'subsystemHealth.allHealthy': 'AGI Workforce: 모든 하위 시스템이 정상입니다.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} 사용 불가',
  'subsystemHealth.manyUnavailable': 'AGI: 하위 시스템 {count}개 사용 불가',
  'subsystemHealth.detailsTooltip': '자세한 내용을 보려면 클릭',
  'subsystemHealth.failuresTitle': 'AGI Workforce — 하위 시스템 장애',
  'subsystemHealth.failuresPlaceholder': '이 세션에서 기록된 장애',
};

export default ko;
