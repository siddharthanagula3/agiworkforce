const ko = {
  'applyEdit.prompt': 'AGI Workforce: {command} 결과를 적용할까요?',
  'applyEdit.applyInline': '인라인 적용',
  'applyEdit.viewInNewTab': '새 탭에서 보기',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: 편집을 자동으로 적용하지 못했습니다, 문서가 변경되었을 수 있습니다.',
  'applyEdit.applyFailed':
    'AGI Workforce: 편집을 적용하지 못했습니다, 문서가 변경되었을 수 있습니다.',
  'advancedFeatures.inlineNeedsCredential':
    'AGI Workforce 인라인 완성에는 AGI Cloud 로그인 또는 AGI API 키가 필요합니다.',
  'advancedFeatures.openAccount': '계정 열기',
  'subsystemHealth.allHealthy': 'AGI Workforce: 모든 하위 시스템이 정상입니다.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} 사용 불가',
  'subsystemHealth.manyUnavailable': 'AGI: 하위 시스템 {count}개 사용 불가',
  'subsystemHealth.detailsTooltip': '자세한 내용을 보려면 클릭',
  'subsystemHealth.failuresTitle': 'AGI Workforce, 하위 시스템 장애',
  'subsystemHealth.failuresPlaceholder': '이 세션에서 기록된 장애',
  'chatError.keyRejected': '{provider} 키가 거부되었습니다.',
  'chatError.notCoveredByPlan': '{provider}에 따르면 이 요청은 사용 중인 플랜에 포함되지 않습니다.',
  'chatError.rateLimiting':
    '{provider}에서 요청 속도를 제한하고 있습니다. 잠시 후 다시 시도하세요.',
  'chatError.providerProblem': '{provider}에 문제가 발생하여 응답하지 못했습니다. 다시 시도하세요.',
  'chatError.providerRejected': '{provider}에서 요청을 거부했습니다.',
  'chatError.updateExtension': '확장 업데이트',
  'chatError.stoppedPartWay': '{provider}의 응답이 도중에 중단되었습니다.',
  'chatError.toolFailed': '{tool} 도구가 실패하여 응답이 중단되었습니다.',
  'chatError.couldNotReach': '{provider}에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.',
  'chatError.theModelProvider': '모델 공급자',
  'chatError.tooLongForModel': '이 대화는 {model}에서 한 번에 읽을 수 있는 길이를 초과합니다.',
  'chatError.planRequired': '클라우드 채팅에는 {plan} 플랜이 필요합니다.',
  'chatError.runtimeSettings': 'AGI 로컬 런타임에서 설정을 읽지 못했습니다.',
  'chatError.noPermission': 'AGI에 해당 작업에 대한 권한이 없습니다.',
  'chatError.runtimeNotRunning': 'AGI 로컬 런타임이 실행 중이 아닙니다.',
  'chatError.aboutSeconds_other': '약 {count}초',
  'chatError.aboutMinutes_other': '약 {count}분',
  'chatError.aboutHours_other': '약 {count}시간',
  'chatError.withReference': '{text} 참조 ID: {reference}',
  'chatError.signInToRun': '플랜으로 이 모델을 실행하려면 AGI에 로그인하세요.',
  'chatError.planExcludesModel': '사용 중인 플랜에는 이 모델이 포함되어 있지 않습니다.',
  'chatError.usageLimitWait':
    '계정의 사용 한도에 도달했습니다. {wait} 후에 다시 사용할 수 있습니다.',
  'chatError.usageLimit':
    '계정의 사용 한도에 도달했습니다. 사용량을 확인하여 한도가 초기화되는 시기를 알아보세요.',
  'chatError.noProviderKey': 'AGI에 이 작업을 실행할 {provider} 키가 없습니다.',
  'chatError.providerBusyWait':
    '{provider}에 현재 요청이 너무 많습니다. {wait} 후에 다시 시도하세요.',
  'chatError.providerBusy':
    '{provider}에 현재 요청이 너무 많습니다. 잠시 후 다시 시도하거나 모델을 전환하세요.',
  'chatError.freeAllowanceWait':
    '무료 모델이 Free 플랜 사용자 전체가 공유하는 허용량을 모두 사용했습니다. 계정의 한도에 도달한 것은 아닙니다. {wait} 후에 다시 시도하세요.',
  'chatError.freeAllowance':
    '무료 모델이 Free 플랜 사용자 전체가 공유하는 허용량을 모두 사용했습니다. 계정의 한도에 도달한 것은 아닙니다. 허용량은 공급자의 일정에 따라 초기화됩니다.',
  'chatError.providerCouldNotAnswer': '{provider}에서 응답하지 못했습니다.',
  'chatError.tooLong': '이 대화는 모델이 한 번에 읽을 수 있는 길이를 초과합니다.',
  'chatError.outputLimit':
    '응답이 이 모델의 최대 길이에 도달하여 거기서 중단되었습니다. 더 짧은 응답을 요청하거나 요청을 나누세요.',
  'chatError.safety':
    '안전 시스템이 이 응답을 중단했습니다. 요청을 다르게 표현하거나 다른 모델을 사용해 보세요.',
  'chatError.network': '이 컴퓨터에서 공급자에 연결하지 못했습니다.',
  'chatError.toolDenied': '도구 실행이 허용되지 않아 턴이 중지되었습니다.',
  'chatError.interrupted': '턴이 중지되었습니다.',
  'chatError.timeout': '{provider}에서 응답하는 데 시간이 너무 오래 걸렸습니다.',
  'chatError.invalidRequest': 'AGI가 {provider}에 보낸 요청이 거부되었습니다.',
  'chatError.generic': 'AGI에서 응답을 완료하지 못했습니다.',
  'chatError.theProvider': '공급자',
  'chatError.signInToProvider': '{provider}에 로그인',
  'chatError.signInToAgi': 'AGI에 로그인',
  'chatError.upgradePlan': '플랜 업그레이드',
  'chatError.openSettings': '설정 열기',
  'chatError.switchModel': '모델 전환',
  'chatNotice.noEditorForDiagnostics': '진단할 활성 편집기가 없습니다.',
  'chatNotice.noDiagnostics': '활성 파일에서 진단을 찾을 수 없습니다.',
  'chatNotice.modelNotOnPlan': '현재 플랜 또는 공급자 설정에서는 이 모델을 사용할 수 없습니다.',
  'chatNotice.trustBeforeResume': '개발자 세션을 재개하기 전에 이 작업 영역을 신뢰하세요.',
  'chatNotice.stopBeforeOpening': '다른 개발자 세션을 열기 전에 현재 응답을 중지하세요.',
  'chatNotice.historyUnavailable': '이 채팅 화면에서는 개발자 세션 기록을 사용할 수 없습니다.',
  'chatNotice.sessionNotFound': '열려 있는 작업 영역에서 개발자 세션을 찾을 수 없습니다.',
  'chatNotice.differentSession': '로컬 런타임에서 다른 개발자 세션을 반환했습니다.',
  'chatNotice.workspaceMismatch':
    '개발자 세션 작업 영역이 해당 세션을 소유한 로컬 런타임과 일치하지 않습니다.',
  'chatNotice.modelUnavailableForSession':
    '이 개발자 세션은 "{model}" 모델을 사용하지만, 이 모델은 현재 모델 카탈로그나 로컬 런타임에서 사용할 수 없습니다. 사용 가능한 모델을 선택한 후 새 세션을 시작하세요.',
  'chatNotice.resumeFailed': '개발자 세션을 재개하지 못했습니다.',
  'chatNotice.approvalFailed': '승인 응답에 실패했습니다.',
  'chatNotice.trustBeforeStart': '개발자 세션을 시작하기 전에 이 작업 영역을 신뢰하세요.',
  'chatNotice.openWorkspace': '개발자 세션을 시작하기 전에 작업 영역 폴더를 여세요.',
  'chatNotice.runtimeUnavailable': 'AGI 로컬 런타임을 사용할 수 없습니다.',
  'chatNotice.reopenWorkspace': '계속하기 전에 이 개발자 세션의 작업 영역을 다시 여세요.',
  'chatNotice.localBoundary':
    'AGI는 검토된 핸드오프 없이 Local 개발자 세션을 BYOK, Managed Cloud 또는 Auto 라우팅으로 이어서 진행하지 않습니다. 새 공급자 세션을 시작하려면 New Chat을 사용하거나, AGI CLI에서 검토된 연속 세션을 만드세요.',
  'chatNotice.eventOverflow':
    '로컬 런타임이 턴을 확인하기 전에 너무 많은 이벤트를 내보냈습니다. AGI는 완료 상태가 손실되지 않도록 턴을 중단했습니다.',
  'chatNotice.overflowNotInterrupted': '오버플로된 로컬 턴을 중단하지 못했습니다: {reason}',
  'chatNotice.cancellationFailed': '취소하지 못했습니다.',
  'chatNotice.runtimeFailed': 'AGI 로컬 런타임이 실패했습니다.',
  'chatNotice.turnFailed': '로컬 개발자 턴이 실패했습니다.',
  'chatNotice.sessionRunningElsewhere':
    '이 개발자 세션은 다른 클라이언트에서 아직 실행 중입니다. 해당 클라이언트에서 중지하거나 유휴 상태가 될 때까지 기다리세요.',
  'chatNotice.sessionAwaitingApprovalElsewhere':
    '이 개발자 세션은 다른 클라이언트에서 승인을 기다리고 있습니다. 여기서 재개하기 전에 해당 클라이언트에서 처리하세요.',
  'chatNotice.sessionArchived':
    '보관된 개발자 세션은 읽기 전용입니다. 이 작업을 계속하려면 새 세션을 시작하세요.',
  'chatNotice.unverifiedBoundary':
    '이 레거시 개발자 세션에는 확인된 Local, BYOK 또는 Managed 경계가 없습니다. 새 세션을 시작하고 공급자를 다시 선택하세요. AGI는 이 세션을 자동으로 재개하지 않습니다.',
  'chatNotice.queuedNotStarted': '대기열에 추가된 후속 메시지가 시작되지 않았습니다.',
  'chatNotice.followUpCapacity_other':
    '후속 메시지 대기열이 가득 찼습니다(대기 중 {count}개). 진행 중인 턴이 끝난 후 다시 시도하세요.',
  'chatNotice.steerFailed': '진행 중인 턴을 조정하지 못했습니다.',
  'chatNotice.openFileForDiff': '이 코드 제안을 검토하려면 편집기에서 파일을 여세요.',
  'chatNotice.diffUnavailable': 'diff 공급자를 사용할 수 없습니다. 확장을 다시 로드하세요.',
  'webview.retry': '다시 시도',
  'webview.details': '세부 정보',
  'webview.copy': '복사',
  'webview.copyResponse': '응답 복사',
  'webview.copied': '복사됨',
  'webview.copyFailed': '복사 실패',
  'webview.goodResponse': '좋은 응답',
  'webview.badResponse': '나쁜 응답',
  'webview.removeRating': '평가 제거',
  'webview.failed': '실패',
  'webview.newerDiffReplaced': '더 최신 diff 제안이 이 요청을 대체했습니다.',
  'webview.couldNotOpenDiff': '제안된 diff를 열 수 없습니다.',
  'webview.cloudSessionExpired': 'AGI Cloud 세션이 만료됨',
  'webview.localStillAvailable': '· Local 및 공급자 BYOK는 계속 사용할 수 있음',
  'webview.signInAgain': '다시 로그인',
  'webview.accountNeedsAttention': '계정 확인 필요',
  'webview.sessionExpired': '세션이 만료됨',
  'webview.tryAgain': '다시 시도',
  'webview.checking': '확인 중…',
  'webview.openWorkspaceToBegin': '작업 영역을 열어 시작하세요',
  'webview.restrictedMode': '작업 영역이 제한 모드에 있음',
  'webview.runtimeNeedsSetup': '개발자 런타임 설정 필요',
  'webview.openFolderToBegin': '시작하려면 폴더 또는 작업 영역을 여세요.',
  'webview.trustWorkspaceFirst':
    '먼저 이 작업 영역을 신뢰해야 AGI가 프로젝트 파일이나 도구를 사용할 수 있습니다.',
  'webview.cliUnavailable': 'AGI CLI를 사용할 수 없습니다.',
  'webview.openFolder': '폴더 열기',
  'webview.manageTrust': '신뢰 관리',
  'webview.installCli': 'AGI CLI 설치',
  'webview.openSetup': '설정 열기',
  'webview.activity': '활동',
  'webview.starting': '시작 중…',
  'webview.completed': '완료됨',
  'webview.completedWithErrors': '완료됨(오류 있음)',
  'webview.collapseDetails': '세부 정보 축소',
  'webview.expandDetails': '세부 정보 확장',
  'webview.lineDelta': '+{added} −{removed}줄',
  'webview.actions_other': '작업 {count}개',
  'webview.errors_other': '오류 {count}개',
  'webview.runningCount_other': '{count}개 실행 중',
  'webview.completedCount_other': '{count}개 완료됨',
  'webview.linesWritten_other': '{count}줄 작성됨',
  'diff.confirmWriteInFile_other':
    'AGI Workforce: {file}의 보류 중인 변경 내용 {count}개를 디스크에 쓸까요?',
  'diff.confirmWrite_other': 'AGI Workforce: 보류 중인 변경 내용 {count}개를 디스크에 쓸까요?',
  'diff.confirmDiscardInFile_other':
    'AGI Workforce: {file}의 보류 중인 변경 내용 {count}개를 쓰지 않고 취소할까요?',
  'diff.confirmDiscard_other':
    'AGI Workforce: 보류 중인 변경 내용 {count}개를 쓰지 않고 취소할까요?',
  'diff.discardedInFile_other':
    'AGI Workforce: {file}의 보류 중인 변경 내용 {count}개를 취소했습니다.',
  'diff.discarded_other': 'AGI Workforce: 보류 중인 변경 내용 {count}개를 취소했습니다.',
  'diff.restoredInFile_other':
    'AGI Workforce: {file}의 보류 중인 변경 내용 {count}개를 복원했습니다.',
  'diff.restored_other': 'AGI Workforce: 보류 중인 변경 내용 {count}개를 복원했습니다.',
  'diff.moreFiles_other': '• …외 파일 {count}개',
  'diff.nothingPending': 'AGI Workforce: 검토할 보류 중인 변경 내용이 없습니다.',
  'diff.writeConsequence':
    '이 편집 내용은 작업 트리에 적용됩니다. 그 전에 다른 검토를 거치지 않습니다.',
  'diff.discardConsequence':
    '제안이 취소됩니다. 이 세션에서 복원하려면 "AGI Workforce: Restore Discarded Changes"를 실행하세요.',
  'diff.writeChanges': '변경 내용 쓰기',
  'diff.discardChanges': '변경 내용 취소',
  'diff.restoreDiscarded': '취소한 변경 내용 복원',
  'diff.reviewFirst': '먼저 검토',
  'runtime.reloaded':
    'AGI Workforce: 런타임 구성을 다시 로드했습니다. 작업 영역 개발자 런타임을 다시 확인하는 중입니다.',
  'runtime.restarted_other':
    'AGI Workforce: 작업 영역 {count}개에서 로컬 런타임을 다시 시작했습니다.',
  'memory.nothingToForget': '삭제할 메모리 항목이 없습니다.',
  'memory.forgetEverything': '모두 삭제',
  'memory.confirmForgetAll_other':
    'AGI Cloud 계정에서 메모리 항목 {count}개를 삭제할까요? 웹 앱, CLI, 모바일에서도 사라지며 이 작업은 실행 취소할 수 없습니다.',
  'memory.allForgotten': '계정에서 모든 메모리 항목을 삭제했습니다.',
  'memory.someKept': '일부 항목은 유지되었습니다. {reasons}',
  'project.archived': '보관됨',
  'project.files_other': '파일 {count}개',
  'project.chats_other': '채팅 {count}개',
  'project.lastUsed': '마지막 사용: {date}',
  'project.deleteEverywhere':
    '"{title}"이(가) 웹 앱, CLI, 모바일 및 기타 모든 클라이언트에서 사라집니다.',
  'project.deleteKnowledge_other':
    '이 프로젝트의 지식 파일 {count}개도 함께 삭제되며 복구할 수 없습니다.',
  'project.keepConversations_other':
    '이 프로젝트의 대화 {count}개는 유지되지만, 프로젝트에서 제외되어 프로젝트 지침과 지식이 더 이상 적용되지 않습니다.',
  'billing.credits_other': '{count}크레딧',
  'billing.unsettledRequests_other': '아직 정산되지 않은 요청 {count}개',
  'billing.noneYet': '아직 없음',
  'billing.noPublishedRate': '공개된 요금 없음',
  'billing.withUnsettled': '{credits}({unsettled})',
  'billing.excludesUnpriced_other': '{credits}(공개된 요금이 없는 턴 {count}개 제외)',
  'billing.turnBilled': 'AGI Workforce: 이번 턴에 {credits}이 청구되었습니다',
  'billing.turnBilledSoFar':
    'AGI Workforce: 이번 턴에 지금까지 {credits}이 청구되었습니다({unsettled})',
  'schedule.runsSoFar_other': '지금까지 {count}회 실행',
  'composer.problems_other': '문제 {count}개',
  'review.noIssues': 'AGI Workforce: 코드가 좋아 보입니다! 문제가 발견되지 않았습니다.',
  'review.issuesFound_other': 'AGI Workforce: 문제 {count}개를 찾았습니다. 문제 패널을 확인하세요.',
  'commands.registrationFailed_other':
    'AGI Workforce: 명령 {count}개를 등록하지 못했습니다({commands}). 자세한 내용은 AGI 하위 시스템 상태 표시줄 항목을 확인하세요.',
  'usage.requests_other': '요청 {count}개',
  'usage.lastDays_other': '최근 {count}일',
  'usage.unsettledTurns_other': '턴 {count}개가 아직 정산 중이어서 집계되지 않았습니다',
  'handoff.switchBranch':
    '이 작업 영역을 {branch}(으)로 전환할까요? 커밋되지 않은 변경 내용이 손실될 수 있습니다.',
  'handoff.uncommittedFiles_other':
    '이곳의 파일 {count}개에 어떤 커밋에도 포함되지 않은 변경 내용이 있습니다. {branch}을(를) 체크 아웃하면 이 변경 내용이 삭제될 수 있으며, 실행 취소할 수 없습니다.',
  'handoff.andMore_other': '외 {count}개',
  'cloud.repository': '리포지토리: {repository}',
  'cloud.branch': '분기: {branch}({upstream}에 푸시된 상태)',
  'cloud.model': '모델: {model}',
  'cloud.network': '네트워크: 신뢰할 수 있는 호스트, 패키지 레지스트리 및 코드 호스트만 허용',
  'cloud.whatMoves': '이동하는 항목: 입력한 작업과 푸시된 분기.',
  'cloud.whatStays':
    '여기에 남는 항목: 이 채팅의 대화, 로컬 도구 및 서버, 푸시되지 않은 모든 항목.',
  'cloud.unpushedCommits_other':
    '{branch}의 커밋 {count}개가 푸시되지 않아 클라우드에 포함되지 않습니다.',
  'cloud.uncommittedFiles_other':
    '파일 {count}개에 커밋되지 않은 변경 내용이 있으며, 이 내용은 클라우드에 포함되지 않습니다.',
  'cloud.continueQuestion': '이 작업을 클라우드의 {repository}에서 계속할까요?',
  'sessionHandoff.protocolUnsupported':
    '해당 세션은 개발자 세션 프로토콜 {requested}을(를) 사용하고, 이 확장은 {supported}을(를) 사용합니다. 양쪽이 같은 프로토콜을 사용하도록 AGI for VS Code 또는 AGI CLI를 업데이트하세요.',
  'sessionHandoff.wrongDestination':
    '해당 세션은 이 편집기가 아니라 {destination} 환경으로 인계되었습니다.',
  'sessionHandoff.trustModeUnknown':
    '해당 세션이 Local, BYOK, Managed 중 어느 방식으로 실행되었는지 알 수 없으므로 이 편집기에서 계속하지 않습니다.',
  'sessionHandoff.issuedAtUnreadable':
    '해당 세션 기록에 발급 시점이 나와 있지 않아 이 편집기에서 최신 기록인지 확인할 수 없습니다.',
  'sessionHandoff.expired_other':
    '해당 세션은 {count}분 전에 인계되었으며, 기록은 {limit} 후에 만료됩니다. AGI CLI에서 다시 인계하세요.',
  'sessionHandoff.expiryLimit_other': '{count}분',
  'sessionHandoff.notYetIssued':
    '해당 세션 기록의 날짜가 미래로 되어 있습니다. 기록을 만든 컴퓨터의 시계를 확인하세요.',
  'sessionHandoff.alreadyAccepted':
    '이 편집기는 이미 해당 세션을 받았습니다. 다시 인계하지 말고 Sessions에서 여세요.',
  'sessionHandoff.wrongAccount':
    '해당 세션은 이 편집기에 로그인된 계정과 다른 AGI 계정에 속해 있습니다.',
  'sessionHandoff.wrongWorkspace':
    '해당 세션은 {received}에서 작업 중이었지만 이 창에는 {expected}이(가) 열려 있습니다. 먼저 해당 폴더를 여세요.',
  'sessionHandoff.credentialInRecord':
    '해당 세션 기록의 {field}에 자격 증명으로 보이는 항목이 있어 이 편집기에서 거부했습니다. 다른 곳에 전달하지 말고 신고하세요.',
  'sessionHandoff.source.cli': 'AGI CLI',
  'sessionHandoff.source.vscode': 'VS Code',
  'sessionHandoff.source.desktop': '데스크톱 앱',
  'sessionHandoff.source.unknown': '다른 AGI 앱',
  'sessionHandoff.resource.backgroundShell': '백그라운드 셸',
  'sessionHandoff.resource.devServer': '개발 서버',
  'sessionHandoff.resource.mcpServer': 'MCP 서버',
  'sessionHandoff.resource.sandbox': '샌드박스',
  'sessionHandoff.resource.fileWatcher': '파일 감시자',
  'sessionHandoff.resource.terminal': '터미널',
  'sessionHandoff.goal': '목표: {goal}',
  'sessionHandoff.folder': '폴더: {folder}',
  'sessionHandoff.branch': '분기: {branch}',
  'sessionHandoff.branchAt': '분기: {branch}(커밋 {commit})',
  'sessionHandoff.runsAs': '실행 모드: {trust}',
  'sessionHandoff.uncommittedStays':
    '폴더에 커밋되지 않은 변경 내용이 있으며, 이 내용은 디스크에 그대로 유지됩니다.',
  'sessionHandoff.movesConversation': '대화 및 전체 기록',
  'sessionHandoff.movesNewSession': '해당 스레드에서 시작되는 새 세션',
  'sessionHandoff.changedFiles_other': '변경된 파일 {count}개: {files}',
  'sessionHandoff.andMore_other': ' 외 {count}개',
  'sessionHandoff.planSteps_other': '{count}단계 계획',
  'sessionHandoff.checksRun_other': '이미 실행한 검사 {count}개',
  'sessionHandoff.movesWithIt': '함께 이동하는 항목:',
  'sessionHandoff.reask_other':
    '보류 중인 승인 {count}개를 여기서 다시 요청합니다. 이전 응답은 이어지지 않습니다.',
  'sessionHandoff.restarted': '이동되지 않고 여기서 다시 시작됨: {resources}.',
  'sessionHandoff.interrupted': '마지막 턴이 중단되었으며 자동으로 계속되지 않습니다.',
  'sessionHandoff.continueQuestion': '{source} 세션을 이 창에서 계속할까요?',
  'sessionHandoff.startQuestion': '{source} 스레드에서 이 창에 세션을 시작할까요?',
  'webview.contextUsedUnknownWindow_other':
    '마지막 턴에서 토큰 {count}개를 사용했습니다. 이 모델의 컨텍스트 창 크기는 여기서 알 수 없습니다.',
  'webview.contextUsed_other':
    '마지막 턴 이후 컨텍스트: 토큰 {count}개 중 {used}개 사용({percent}%)',
  'webview.answerTokens_other': '{model} · 토큰 {count}개(입력 {input}, 출력 {output})',
  'webview.moreLinesHidden_other': '표시되지 않은 줄 {count}개',
  'mcp.connected_other':
    'AGI Workforce: {name}에 {ms}ms 만에 연결되었습니다. 도구 {count}개를 제공합니다.',
  'checkpoints.trackedFiles_other': '추적 중인 파일 {count}개',
  'checkpoints.skippedFiles_other': 'AGI Workforce: 파일 {count}개를 복원하지 못했습니다: {files}',
  'checkpoints.filesRestored_other':
    'AGI Workforce: 파일 {count}개를 체크포인트 시점으로 되돌렸습니다.',
};

export default ko;
