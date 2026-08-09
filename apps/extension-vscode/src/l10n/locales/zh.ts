/**
 * Chinese catalog. Key parity with `en` is enforced by l10n.test.ts.
 */
const zh = {
  'applyEdit.prompt': 'AGI Workforce：应用 {command} 的结果？',
  'applyEdit.applyInline': '就地应用',
  'applyEdit.viewInNewTab': '在新标签页中查看',
  'applyEdit.autoApplyFailed': 'AGI Workforce：无法自动应用编辑 — 文档可能已更改。',
  'applyEdit.applyFailed': 'AGI Workforce：无法应用编辑 — 文档可能已更改。',
  'advancedFeatures.inlineNeedsCredential':
    'AGI Workforce 内联补全需要登录 AGI Cloud 或提供 AGI API 密钥。',
  'advancedFeatures.openAccount': '打开账户',
  'subsystemHealth.allHealthy': 'AGI Workforce：所有子系统均正常。',
  'subsystemHealth.oneUnavailable': 'AGI：{subsystem} 不可用',
  'subsystemHealth.manyUnavailable': 'AGI：{count} 个子系统不可用',
  'subsystemHealth.detailsTooltip': '点击查看详情',
  'subsystemHealth.failuresTitle': 'AGI Workforce — 子系统故障',
  'subsystemHealth.failuresPlaceholder': '本次会话中记录的故障',
};

export default zh;
