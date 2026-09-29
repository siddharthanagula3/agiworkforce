const ru = {
  'applyEdit.prompt': 'AGI Workforce: применить результат {command}?',
  'applyEdit.applyInline': 'Применить на месте',
  'applyEdit.viewInNewTab': 'Открыть в новой вкладке',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: не удалось применить правку автоматически, документ мог измениться.',
  'applyEdit.applyFailed': 'AGI Workforce: не удалось применить правку, документ мог измениться.',
  'advancedFeatures.inlineNeedsCredential':
    'Встроенные подсказки AGI Workforce требуют входа в AGI Cloud или ключа API AGI.',
  'advancedFeatures.openAccount': 'Открыть аккаунт',
  'subsystemHealth.allHealthy': 'AGI Workforce: все подсистемы исправны.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} недоступна',
  'subsystemHealth.manyUnavailable': 'AGI: недоступных подсистем, {count}',
  'subsystemHealth.detailsTooltip': 'Нажмите для подробностей',
  'subsystemHealth.failuresTitle': 'AGI Workforce, Сбои подсистем',
  'subsystemHealth.failuresPlaceholder': 'Сбои, зафиксированные за эту сессию',
  'chatError.keyRejected': 'Ваш ключ {provider} отклонен.',
  'chatError.notCoveredByPlan': 'По данным {provider}, этот запрос не входит в ваш тариф.',
  'chatError.rateLimiting':
    'Сервис {provider} ограничивает частоту запросов. Повторите попытку чуть позже.',
  'chatError.providerProblem':
    'На стороне {provider} произошла ошибка, и ответ не получен. Повторите попытку.',
  'chatError.providerRejected': 'Сервис {provider} отклонил запрос.',
  'chatError.updateExtension': 'Обновить расширение',
  'chatError.stoppedPartWay': 'Сервис {provider} прервал ответ на полпути.',
  'chatError.toolFailed': 'Сбой инструмента {tool}, поэтому ответ прерван.',
  'chatError.couldNotReach':
    'Не удалось связаться с сервисом {provider}. Проверьте подключение к сети и повторите попытку.',
  'chatError.theModelProvider': 'поставщика модели',
  'chatError.tooLongForModel': 'Эта беседа длиннее, чем {model} может прочитать за один раз.',
  'chatError.planRequired': 'Для облачного чата нужен тариф {plan}.',
  'chatError.runtimeSettings':
    'Локальной среде выполнения AGI не удалось прочитать свои параметры.',
  'chatError.noPermission': 'У AGI нет разрешения на это действие.',
  'chatError.runtimeNotRunning': 'Локальная среда выполнения AGI не запущена.',
  'chatError.aboutSeconds_one': '{count} секунду',
  'chatError.aboutSeconds_few': '{count} секунды',
  'chatError.aboutSeconds_many': '{count} секунд',
  'chatError.aboutSeconds_other': '{count} секунды',
  'chatError.aboutMinutes_one': '{count} минуту',
  'chatError.aboutMinutes_few': '{count} минуты',
  'chatError.aboutMinutes_many': '{count} минут',
  'chatError.aboutMinutes_other': '{count} минуты',
  'chatError.aboutHours_one': '{count} час',
  'chatError.aboutHours_few': '{count} часа',
  'chatError.aboutHours_many': '{count} часов',
  'chatError.aboutHours_other': '{count} часа',
  'chatError.withReference': '{text} Идентификатор: {reference}',
  'chatError.signInToRun': 'Войдите в AGI, чтобы использовать эту модель в рамках вашего тарифа.',
  'chatError.planExcludesModel': 'Ваш тариф не включает эту модель.',
  'chatError.usageLimitWait':
    'Вы достигли лимита использования для своего аккаунта. Доступ снова откроется примерно через {wait}.',
  'chatError.usageLimit':
    'Вы достигли лимита использования для своего аккаунта. Проверьте статистику использования, чтобы узнать, когда лимит сбросится.',
  'chatError.noProviderKey': 'У AGI нет ключа {provider} для выполнения этого запроса.',
  'chatError.providerBusyWait':
    'Сервис {provider} сейчас перегружен запросами. Повторите попытку примерно через {wait}.',
  'chatError.providerBusy':
    'Сервис {provider} сейчас перегружен запросами. Повторите попытку чуть позже или выберите другую модель.',
  'chatError.freeAllowanceWait':
    'Бесплатная модель исчерпала общий лимит для всех пользователей тарифа Free, так что это не ограничение вашего аккаунта. Повторите попытку примерно через {wait}.',
  'chatError.freeAllowance':
    'Бесплатная модель исчерпала общий лимит для всех пользователей тарифа Free, так что это не ограничение вашего аккаунта. Лимит сбрасывается по расписанию поставщика.',
  'chatError.providerCouldNotAnswer': 'Не удалось получить ответ от {provider}.',
  'chatError.tooLong': 'Эта беседа длиннее, чем модель может прочитать за один раз.',
  'chatError.outputLimit':
    'Ответ достиг максимальной длины для этой модели и был прерван. Попросите ответ покороче или разделите запрос.',
  'chatError.safety':
    'Система безопасности остановила этот ответ. Переформулируйте запрос или попробуйте другую модель.',
  'chatError.network': 'Этому компьютеру не удалось связаться с поставщиком.',
  'chatError.toolDenied': 'Запрос остановлен, так как запуск инструмента не разрешен.',
  'chatError.interrupted': 'Запрос остановлен.',
  'chatError.timeout': 'Истекло время ожидания ответа от {provider}.',
  'chatError.invalidRequest': 'Сервис {provider} отклонил запрос, отправленный AGI.',
  'chatError.generic': 'AGI не удалось завершить ответ.',
  'chatError.theProvider': 'поставщика',
  'chatError.signInToProvider': 'Войти в аккаунт {provider}',
  'chatError.signInToAgi': 'Войти в AGI',
  'chatError.upgradePlan': 'Повысить тариф',
  'chatError.openSettings': 'Открыть параметры',
  'chatError.switchModel': 'Сменить модель',
  'chatNotice.noEditorForDiagnostics': 'Нет активного редактора для диагностики.',
  'chatNotice.noDiagnostics': 'В активном файле не найдено диагностических сообщений.',
  'chatNotice.modelNotOnPlan':
    'Эта модель недоступна в вашем текущем тарифе или при текущих настройках поставщика.',
  'chatNotice.trustBeforeResume':
    'Прежде чем возобновить сессию разработки, отметьте эту рабочую область как доверенную.',
  'chatNotice.cloudSessionReadOnly':
    'Этот облачный сеанс Code открывается здесь только для чтения. Продолжите его в веб-версии или выполните `agi code teleport`, чтобы перенести его на этот компьютер.',
  'chatNotice.openOnWeb': 'Открыть в браузере',
  'conversationTree.cloudLabel': 'Облако',
  'chatNotice.stopBeforeOpening':
    'Остановите текущий ответ, прежде чем открыть другую сессию разработки.',
  'chatNotice.historyUnavailable': 'История сессий разработки недоступна в этом интерфейсе чата.',
  'chatNotice.sessionNotFound': 'Сессия разработки не найдена в открытой рабочей области.',
  'chatNotice.differentSession': 'Локальная среда выполнения вернула другую сессию разработки.',
  'chatNotice.workspaceMismatch':
    'Рабочая область сессии разработки не соответствует локальной среде выполнения, к которой относится сессия.',
  'chatNotice.modelUnavailableForSession':
    'В этой сессии разработки используется модель "{model}", которая недоступна в текущем каталоге моделей или в локальной среде выполнения. Выберите доступную модель и начните новую сессию.',
  'chatNotice.resumeFailed': 'Не удалось возобновить сессию разработки.',
  'chatNotice.approvalFailed': 'Не удалось отправить ответ на запрос одобрения.',
  'chatNotice.trustBeforeStart':
    'Прежде чем начать сессию разработки, отметьте эту рабочую область как доверенную.',
  'chatNotice.openWorkspace':
    'Прежде чем начать сессию разработки, откройте папку рабочей области.',
  'chatNotice.runtimeUnavailable': 'Локальная среда выполнения AGI недоступна.',
  'chatNotice.reopenWorkspace':
    'Прежде чем продолжить, снова откройте рабочую область этой сессии разработки.',
  'chatNotice.localBoundary':
    'AGI не продолжит сессию разработки Local с маршрутизацией BYOK, Managed Cloud или Auto без проверенной передачи. Используйте New Chat, чтобы начать новую сессию с поставщиком, или создайте проверенное продолжение в AGI CLI.',
  'chatNotice.eventOverflow':
    'Локальная среда выполнения отправила слишком много событий до подтверждения запроса. AGI прервал запрос, чтобы не потерять состояние его завершения.',
  'chatNotice.overflowNotInterrupted':
    'Не удалось прервать локальный запрос, вызвавший переполнение: {reason}',
  'chatNotice.cancellationFailed': 'Не удалось выполнить отмену.',
  'chatNotice.runtimeFailed': 'Сбой локальной среды выполнения AGI.',
  'chatNotice.turnFailed': 'Сбой локального запроса в сессии разработки.',
  'chatNotice.sessionRunningElsewhere':
    'Эта сессия разработки все еще выполняется в другом клиенте. Остановите ее там или дождитесь, пока она станет неактивной.',
  'chatNotice.sessionAwaitingApprovalElsewhere':
    'Эта сессия разработки ожидает одобрения в другом клиенте. Обработайте запрос там, прежде чем возобновлять ее здесь.',
  'chatNotice.sessionArchived':
    'Архивные сессии разработки доступны только для чтения. Чтобы продолжить эту работу, начните новую сессию.',
  'chatNotice.unverifiedBoundary':
    'У этой устаревшей сессии разработки нет проверенной границы Local, BYOK или Managed. Начните новую сессию и снова выберите поставщика; AGI не возобновит ее автоматически.',
  'chatNotice.queuedNotStarted': 'Последующее сообщение из очереди не было отправлено.',
  'chatNotice.followUpCapacity_one':
    'Очередь последующих сообщений заполнена (в ожидании: {count}). Повторите попытку после завершения текущего запроса.',
  'chatNotice.followUpCapacity_few':
    'Очередь последующих сообщений заполнена (в ожидании: {count}). Повторите попытку после завершения текущего запроса.',
  'chatNotice.followUpCapacity_many':
    'Очередь последующих сообщений заполнена (в ожидании: {count}). Повторите попытку после завершения текущего запроса.',
  'chatNotice.followUpCapacity_other':
    'Очередь последующих сообщений заполнена (в ожидании: {count}). Повторите попытку после завершения текущего запроса.',
  'chatNotice.steerFailed': 'Не удалось скорректировать текущий запрос.',
  'chatNotice.openFileForDiff':
    'Откройте файл в редакторе, чтобы просмотреть это предложение кода.',
  'chatNotice.diffUnavailable': 'Поставщик сравнения недоступен. Перезагрузите расширение.',
  'webview.retry': 'Повторить попытку',
  'webview.details': 'Подробности',
  'webview.copy': 'Копировать',
  'webview.copyResponse': 'Копировать ответ',
  'webview.copied': 'Скопировано',
  'webview.copyFailed': 'Не удалось скопировать',
  'webview.goodResponse': 'Хороший ответ',
  'webview.badResponse': 'Плохой ответ',
  'webview.removeRating': 'Удалить оценку',
  'webview.failed': 'Сбой',
  'webview.newerDiffReplaced': 'Этот запрос заменен более новым предложением изменений.',
  'webview.couldNotOpenDiff': 'Не удалось открыть предложенные изменения.',
  'webview.cloudSessionExpired': 'Срок действия сессии AGI Cloud истек',
  'webview.localStillAvailable': '· Local и BYOK поставщиков по-прежнему доступны',
  'webview.signInAgain': 'Войти снова',
  'webview.accountNeedsAttention': 'Аккаунт требует внимания',
  'webview.sessionExpired': 'Срок действия сессии истек',
  'webview.tryAgain': 'Повторить попытку',
  'webview.checking': 'Проверка…',
  'webview.openWorkspaceToBegin': 'Откройте рабочую область, чтобы начать',
  'webview.restrictedMode': 'Рабочая область в ограниченном режиме',
  'webview.runtimeNeedsSetup': 'Требуется настройка среды выполнения для разработки',
  'webview.openFolderToBegin': 'Откройте папку или рабочую область, чтобы начать.',
  'webview.trustWorkspaceFirst':
    'Отметьте эту рабочую область как доверенную, чтобы разрешить AGI использовать файлы и инструменты проекта.',
  'webview.cliUnavailable': 'AGI CLI недоступен.',
  'webview.openFolder': 'Открыть папку',
  'webview.manageTrust': 'Управление доверием',
  'webview.installCli': 'Установить AGI CLI',
  'webview.openSetup': 'Открыть настройку',
  'webview.activity': 'Активность',
  'webview.starting': 'Запуск…',
  'webview.completed': 'Завершено',
  'webview.completedWithErrors': 'Завершено с ошибками',
  'webview.collapseDetails': 'Свернуть подробности',
  'webview.expandDetails': 'Развернуть подробности',
  'webview.lineDelta': 'Строки: +{added} −{removed}',
  'webview.actions_one': '{count} действие',
  'webview.actions_few': '{count} действия',
  'webview.actions_many': '{count} действий',
  'webview.actions_other': '{count} действия',
  'webview.errors_one': '{count} ошибка',
  'webview.errors_few': '{count} ошибки',
  'webview.errors_many': '{count} ошибок',
  'webview.errors_other': '{count} ошибки',
  'webview.runningCount_one': '{count} выполняется',
  'webview.runningCount_few': '{count} выполняются',
  'webview.runningCount_many': '{count} выполняются',
  'webview.runningCount_other': '{count} выполняется',
  'webview.completedCount_one': '{count} завершено',
  'webview.completedCount_few': '{count} завершено',
  'webview.completedCount_many': '{count} завершено',
  'webview.completedCount_other': '{count} завершено',
  'webview.linesWritten_one': 'Записана {count} строка',
  'webview.linesWritten_few': 'Записаны {count} строки',
  'webview.linesWritten_many': 'Записано {count} строк',
  'webview.linesWritten_other': 'Записано {count} строки',
  'diff.confirmWriteInFile_one':
    'AGI Workforce: записать на диск {count} ожидающее изменение в {file}?',
  'diff.confirmWriteInFile_few':
    'AGI Workforce: записать на диск {count} ожидающих изменения в {file}?',
  'diff.confirmWriteInFile_many':
    'AGI Workforce: записать на диск {count} ожидающих изменений в {file}?',
  'diff.confirmWriteInFile_other':
    'AGI Workforce: записать на диск {count} ожидающих изменения в {file}?',
  'diff.confirmWrite_one': 'AGI Workforce: записать на диск {count} ожидающее изменение?',
  'diff.confirmWrite_few': 'AGI Workforce: записать на диск {count} ожидающих изменения?',
  'diff.confirmWrite_many': 'AGI Workforce: записать на диск {count} ожидающих изменений?',
  'diff.confirmWrite_other': 'AGI Workforce: записать на диск {count} ожидающих изменения?',
  'diff.confirmDiscardInFile_one':
    'AGI Workforce: отменить {count} ожидающее изменение в {file} без записи на диск?',
  'diff.confirmDiscardInFile_few':
    'AGI Workforce: отменить {count} ожидающих изменения в {file} без записи на диск?',
  'diff.confirmDiscardInFile_many':
    'AGI Workforce: отменить {count} ожидающих изменений в {file} без записи на диск?',
  'diff.confirmDiscardInFile_other':
    'AGI Workforce: отменить {count} ожидающих изменения в {file} без записи на диск?',
  'diff.confirmDiscard_one':
    'AGI Workforce: отменить {count} ожидающее изменение без записи на диск?',
  'diff.confirmDiscard_few':
    'AGI Workforce: отменить {count} ожидающих изменения без записи на диск?',
  'diff.confirmDiscard_many':
    'AGI Workforce: отменить {count} ожидающих изменений без записи на диск?',
  'diff.confirmDiscard_other':
    'AGI Workforce: отменить {count} ожидающих изменения без записи на диск?',
  'diff.discardedInFile_one': 'AGI Workforce: отменено {count} ожидающее изменение в {file}.',
  'diff.discardedInFile_few': 'AGI Workforce: отменено {count} ожидающих изменения в {file}.',
  'diff.discardedInFile_many': 'AGI Workforce: отменено {count} ожидающих изменений в {file}.',
  'diff.discardedInFile_other': 'AGI Workforce: отменено {count} ожидающих изменения в {file}.',
  'diff.discarded_one': 'AGI Workforce: отменено {count} ожидающее изменение.',
  'diff.discarded_few': 'AGI Workforce: отменено {count} ожидающих изменения.',
  'diff.discarded_many': 'AGI Workforce: отменено {count} ожидающих изменений.',
  'diff.discarded_other': 'AGI Workforce: отменено {count} ожидающих изменения.',
  'diff.restoredInFile_one': 'AGI Workforce: восстановлено {count} ожидающее изменение в {file}.',
  'diff.restoredInFile_few': 'AGI Workforce: восстановлено {count} ожидающих изменения в {file}.',
  'diff.restoredInFile_many': 'AGI Workforce: восстановлено {count} ожидающих изменений в {file}.',
  'diff.restoredInFile_other': 'AGI Workforce: восстановлено {count} ожидающих изменения в {file}.',
  'diff.restored_one': 'AGI Workforce: восстановлено {count} ожидающее изменение.',
  'diff.restored_few': 'AGI Workforce: восстановлено {count} ожидающих изменения.',
  'diff.restored_many': 'AGI Workforce: восстановлено {count} ожидающих изменений.',
  'diff.restored_other': 'AGI Workforce: восстановлено {count} ожидающих изменения.',
  'diff.moreFiles_one': '• …и еще {count} файл',
  'diff.moreFiles_few': '• …и еще {count} файла',
  'diff.moreFiles_many': '• …и еще {count} файлов',
  'diff.moreFiles_other': '• …и еще {count} файла',
  'diff.nothingPending': 'AGI Workforce: нет ожидающих изменений для просмотра.',
  'diff.writeConsequence':
    'Эти правки применяются к вашему рабочему дереву без какой-либо предварительной проверки.',
  'diff.discardConsequence':
    'Предложения отменяются. Чтобы вернуть их в этой сессии, выполните команду "AGI Workforce: Restore Discarded Changes".',
  'diff.writeChanges': 'Записать изменения',
  'diff.discardChanges': 'Отменить изменения',
  'diff.restoreDiscarded': 'Восстановить отмененные',
  'diff.reviewFirst': 'Сначала просмотреть',
  'runtime.reloaded':
    'AGI Workforce: конфигурация среды выполнения перезагружена. Выполняется повторная проверка среды выполнения для разработки в рабочей области.',
  'runtime.restarted_one':
    'AGI Workforce: локальная среда выполнения перезапущена в {count} рабочей области.',
  'runtime.restarted_few':
    'AGI Workforce: локальная среда выполнения перезапущена в {count} рабочих областях.',
  'runtime.restarted_many':
    'AGI Workforce: локальная среда выполнения перезапущена в {count} рабочих областях.',
  'runtime.restarted_other':
    'AGI Workforce: локальная среда выполнения перезапущена в {count} рабочей области.',
  'memory.nothingToForget': 'Нет сохраненных фактов, которые можно забыть.',
  'memory.forgetEverything': 'Забыть все',
  'memory.confirmForgetAll_one':
    'Удалить {count} факт из памяти вашего аккаунта AGI Cloud? Данные исчезнут также из веб-приложения, CLI и мобильного приложения, и это действие нельзя отменить.',
  'memory.confirmForgetAll_few':
    'Удалить все {count} факта из памяти вашего аккаунта AGI Cloud? Данные исчезнут также из веб-приложения, CLI и мобильного приложения, и это действие нельзя отменить.',
  'memory.confirmForgetAll_many':
    'Удалить все {count} фактов из памяти вашего аккаунта AGI Cloud? Данные исчезнут также из веб-приложения, CLI и мобильного приложения, и это действие нельзя отменить.',
  'memory.confirmForgetAll_other':
    'Удалить все {count} факта из памяти вашего аккаунта AGI Cloud? Данные исчезнут также из веб-приложения, CLI и мобильного приложения, и это действие нельзя отменить.',
  'memory.allForgotten': 'Все факты из памяти удалены из вашего аккаунта.',
  'memory.someKept': 'Некоторые факты сохранены. {reasons}',
  'project.archived': 'В архиве',
  'project.files_one': '{count} файл',
  'project.files_few': '{count} файла',
  'project.files_many': '{count} файлов',
  'project.files_other': '{count} файла',
  'project.chats_one': '{count} чат',
  'project.chats_few': '{count} чата',
  'project.chats_many': '{count} чатов',
  'project.chats_other': '{count} чата',
  'project.lastUsed': 'последнее использование: {date}',
  'project.deleteEverywhere':
    '"{title}" исчезнет из веб-приложения, CLI, мобильного приложения и всех остальных клиентов.',
  'project.deleteKnowledge_one':
    'Вместе с проектом будет удален {count} файл знаний без возможности восстановления.',
  'project.deleteKnowledge_few':
    'Вместе с проектом будут удалены {count} файла знаний без возможности восстановления.',
  'project.deleteKnowledge_many':
    'Вместе с проектом будут удалены {count} файлов знаний без возможности восстановления.',
  'project.deleteKnowledge_other':
    'Вместе с проектом будут удалены {count} файла знаний без возможности восстановления.',
  'project.keepConversations_one':
    '{count} беседа сохранится, но будет исключена из проекта и лишится его инструкций и знаний.',
  'project.keepConversations_few':
    '{count} беседы сохранятся, но будут исключены из проекта и лишатся его инструкций и знаний.',
  'project.keepConversations_many':
    '{count} бесед сохранятся, но будут исключены из проекта и лишатся его инструкций и знаний.',
  'project.keepConversations_other':
    '{count} беседы сохранятся, но будут исключены из проекта и лишатся его инструкций и знаний.',
  'billing.credits_one': '{count} кредит',
  'billing.credits_few': '{count} кредита',
  'billing.credits_many': '{count} кредитов',
  'billing.credits_other': '{count} кредита',
  'billing.unsettledRequests_one': '{count} запрос еще не учтен',
  'billing.unsettledRequests_few': '{count} запроса еще не учтены',
  'billing.unsettledRequests_many': '{count} запросов еще не учтены',
  'billing.unsettledRequests_other': '{count} запроса еще не учтены',
  'billing.noneYet': 'пока нет',
  'billing.noPublishedRate': 'нет опубликованной расценки',
  'billing.withUnsettled': '{credits} ({unsettled})',
  'billing.excludesUnpriced_one':
    '{credits} (не считая {count} запроса без опубликованной расценки)',
  'billing.excludesUnpriced_few':
    '{credits} (не считая {count} запросов без опубликованной расценки)',
  'billing.excludesUnpriced_many':
    '{credits} (не считая {count} запросов без опубликованной расценки)',
  'billing.excludesUnpriced_other':
    '{credits} (не считая {count} запроса без опубликованной расценки)',
  'billing.turnBilled': 'AGI Workforce: за этот запрос списано {credits}',
  'billing.turnBilledSoFar': 'AGI Workforce: за этот запрос пока списано {credits}, {unsettled}',
  'schedule.runsSoFar_one': 'Пока {count} запуск',
  'schedule.runsSoFar_few': 'Пока {count} запуска',
  'schedule.runsSoFar_many': 'Пока {count} запусков',
  'schedule.runsSoFar_other': 'Пока {count} запуска',
  'composer.problems_one': '{count} проблема',
  'composer.problems_few': '{count} проблемы',
  'composer.problems_many': '{count} проблем',
  'composer.problems_other': '{count} проблемы',
  'review.noIssues': 'AGI Workforce: код выглядит хорошо! Проблем не найдено.',
  'review.issuesFound_one': 'AGI Workforce: найдена {count} проблема. Проверьте панель "Проблемы".',
  'review.issuesFound_few': 'AGI Workforce: найдено {count} проблемы. Проверьте панель "Проблемы".',
  'review.issuesFound_many': 'AGI Workforce: найдено {count} проблем. Проверьте панель "Проблемы".',
  'review.issuesFound_other':
    'AGI Workforce: найдено {count} проблемы. Проверьте панель "Проблемы".',
  'commands.registrationFailed_one':
    'AGI Workforce: не удалось зарегистрировать {count} команду ({commands}). Дополнительные сведения см. в индикаторе работоспособности подсистем AGI в строке состояния.',
  'commands.registrationFailed_few':
    'AGI Workforce: не удалось зарегистрировать {count} команды ({commands}). Дополнительные сведения см. в индикаторе работоспособности подсистем AGI в строке состояния.',
  'commands.registrationFailed_many':
    'AGI Workforce: не удалось зарегистрировать {count} команд ({commands}). Дополнительные сведения см. в индикаторе работоспособности подсистем AGI в строке состояния.',
  'commands.registrationFailed_other':
    'AGI Workforce: не удалось зарегистрировать {count} команды ({commands}). Дополнительные сведения см. в индикаторе работоспособности подсистем AGI в строке состояния.',
  'usage.requests_one': '{count} запрос',
  'usage.requests_few': '{count} запроса',
  'usage.requests_many': '{count} запросов',
  'usage.requests_other': '{count} запроса',
  'usage.lastDays_one': 'последний {count} день',
  'usage.lastDays_few': 'последние {count} дня',
  'usage.lastDays_many': 'последние {count} дней',
  'usage.lastDays_other': 'последние {count} дня',
  'usage.unsettledTurns_one': '{count} запрос еще обрабатывается и пока не учтен',
  'usage.unsettledTurns_few': '{count} запроса еще обрабатываются и пока не учтены',
  'usage.unsettledTurns_many': '{count} запросов еще обрабатываются и пока не учтены',
  'usage.unsettledTurns_other': '{count} запроса еще обрабатываются и пока не учтены',
  'handoff.switchBranch':
    'Переключить эту рабочую область на ветвь {branch}, рискуя потерять незафиксированные изменения?',
  'handoff.uncommittedFiles_one':
    '{count} файл здесь содержит изменения, которых нет ни в одной фиксации. При извлечении ветви {branch} они могут быть потеряны без возможности восстановления.',
  'handoff.uncommittedFiles_few':
    '{count} файла здесь содержат изменения, которых нет ни в одной фиксации. При извлечении ветви {branch} они могут быть потеряны без возможности восстановления.',
  'handoff.uncommittedFiles_many':
    '{count} файлов здесь содержат изменения, которых нет ни в одной фиксации. При извлечении ветви {branch} они могут быть потеряны без возможности восстановления.',
  'handoff.uncommittedFiles_other':
    '{count} файла здесь содержат изменения, которых нет ни в одной фиксации. При извлечении ветви {branch} они могут быть потеряны без возможности восстановления.',
  'handoff.andMore_one': 'и еще {count}',
  'handoff.andMore_few': 'и еще {count}',
  'handoff.andMore_many': 'и еще {count}',
  'handoff.andMore_other': 'и еще {count}',
  'cloud.repository': 'Репозиторий: {repository}',
  'cloud.branch': 'Ветвь: {branch} (отправлена в {upstream})',
  'cloud.model': 'Модель: {model}',
  'cloud.network': 'Сеть: только доверенные узлы, реестры пакетов и сервисы размещения кода',
  'cloud.whatMoves': 'Что переносится: введенная вами задача и отправленная ветвь.',
  'cloud.whatStays':
    'Что остается здесь: беседа этого чата, локальные инструменты и серверы, а также все, что не отправлено.',
  'cloud.unpushedCommits_one':
    '{count} фиксация в ветви {branch} не отправлена и не попадет в облако.',
  'cloud.unpushedCommits_few':
    '{count} фиксации в ветви {branch} не отправлены и не попадут в облако.',
  'cloud.unpushedCommits_many':
    '{count} фиксаций в ветви {branch} не отправлены и не попадут в облако.',
  'cloud.unpushedCommits_other':
    '{count} фиксации в ветви {branch} не отправлены и не попадут в облако.',
  'cloud.uncommittedFiles_one':
    '{count} файл содержит незафиксированные изменения, которые не попадут в облако.',
  'cloud.uncommittedFiles_few':
    '{count} файла содержат незафиксированные изменения, которые не попадут в облако.',
  'cloud.uncommittedFiles_many':
    '{count} файлов содержат незафиксированные изменения, которые не попадут в облако.',
  'cloud.uncommittedFiles_other':
    '{count} файла содержат незафиксированные изменения, которые не попадут в облако.',
  'cloud.continueQuestion': 'Продолжить эту работу в облаке в репозитории {repository}?',
  'sessionHandoff.protocolUnsupported':
    'Эта сессия использует протокол сессий разработки {requested}, а это расширение использует {supported}. Обновите AGI для VS Code или AGI CLI, чтобы обе стороны использовали один и тот же протокол.',
  'sessionHandoff.wrongDestination':
    'Эта сессия была передана в среду {destination}, а не в этот редактор.',
  'sessionHandoff.trustModeUnknown':
    'В этой сессии не указано, в каком режиме она выполнялась (Local, BYOK или Managed), поэтому этот редактор не будет ее продолжать.',
  'sessionHandoff.issuedAtUnreadable':
    'В записи этой сессии не указано время выдачи, поэтому этот редактор не может определить, актуальна ли она.',
  'sessionHandoff.expired_one':
    'Эта сессия была передана {count} минуту назад, а срок действия записей истекает через {limit}. Передайте ее заново из AGI CLI.',
  'sessionHandoff.expired_few':
    'Эта сессия была передана {count} минуты назад, а срок действия записей истекает через {limit}. Передайте ее заново из AGI CLI.',
  'sessionHandoff.expired_many':
    'Эта сессия была передана {count} минут назад, а срок действия записей истекает через {limit}. Передайте ее заново из AGI CLI.',
  'sessionHandoff.expired_other':
    'Эта сессия была передана {count} минуты назад, а срок действия записей истекает через {limit}. Передайте ее заново из AGI CLI.',
  'sessionHandoff.expiryLimit_one': '{count} минуту',
  'sessionHandoff.expiryLimit_few': '{count} минуты',
  'sessionHandoff.expiryLimit_many': '{count} минут',
  'sessionHandoff.expiryLimit_other': '{count} минуты',
  'sessionHandoff.notYetIssued':
    'Запись этой сессии датирована будущим временем. Проверьте часы на компьютере, который ее создал.',
  'sessionHandoff.alreadyAccepted':
    'Этот редактор уже принял эту сессию. Откройте ее из Sessions, а не передавайте повторно.',
  'sessionHandoff.wrongAccount':
    'Эта сессия принадлежит другому аккаунту AGI, а не тому, под которым выполнен вход в этом редакторе.',
  'sessionHandoff.wrongWorkspace':
    'Эта сессия работала в папке {received}, а в этом окне открыта папка {expected}. Сначала откройте нужную папку.',
  'sessionHandoff.credentialInRecord':
    'Запись этой сессии содержит в поле {field} данные, похожие на учетные данные, поэтому этот редактор отклонил ее. Сообщите об этом, а не передавайте запись дальше.',
  'sessionHandoff.source.cli': 'AGI CLI',
  'sessionHandoff.source.vscode': 'VS Code',
  'sessionHandoff.source.desktop': 'приложения для компьютера',
  'sessionHandoff.source.unknown': 'другого приложения AGI',
  'sessionHandoff.resource.backgroundShell': 'фоновая оболочка',
  'sessionHandoff.resource.devServer': 'сервер разработки',
  'sessionHandoff.resource.mcpServer': 'сервер MCP',
  'sessionHandoff.resource.sandbox': 'песочница',
  'sessionHandoff.resource.fileWatcher': 'наблюдатель файлов',
  'sessionHandoff.resource.terminal': 'терминал',
  'sessionHandoff.goal': 'Цель: {goal}',
  'sessionHandoff.folder': 'Папка: {folder}',
  'sessionHandoff.branch': 'Ветвь: {branch}',
  'sessionHandoff.branchAt': 'Ветвь: {branch}, фиксация {commit}',
  'sessionHandoff.runsAs': 'Режим выполнения: {trust}',
  'sessionHandoff.uncommittedStays':
    'В папке есть незафиксированные изменения, они останутся на диске как есть.',
  'sessionHandoff.movesConversation': 'Беседа со всей историей',
  'sessionHandoff.movesNewSession': 'Новая сессия на основе этой беседы',
  'sessionHandoff.changedFiles_one': '{count} измененный файл: {files}',
  'sessionHandoff.changedFiles_few': '{count} измененных файла: {files}',
  'sessionHandoff.changedFiles_many': '{count} измененных файлов: {files}',
  'sessionHandoff.changedFiles_other': '{count} измененных файла: {files}',
  'sessionHandoff.andMore_one': ' и еще {count}',
  'sessionHandoff.andMore_few': ' и еще {count}',
  'sessionHandoff.andMore_many': ' и еще {count}',
  'sessionHandoff.andMore_other': ' и еще {count}',
  'sessionHandoff.planSteps_one': 'План из {count} шага',
  'sessionHandoff.planSteps_few': 'План из {count} шагов',
  'sessionHandoff.planSteps_many': 'План из {count} шагов',
  'sessionHandoff.planSteps_other': 'План из {count} шага',
  'sessionHandoff.checksRun_one': '{count} проверка уже выполнена',
  'sessionHandoff.checksRun_few': '{count} проверки уже выполнены',
  'sessionHandoff.checksRun_many': '{count} проверок уже выполнено',
  'sessionHandoff.checksRun_other': '{count} проверки уже выполнено',
  'sessionHandoff.movesWithIt': 'Переносится вместе с сессией:',
  'sessionHandoff.reask_one':
    '{count} ожидающий запрос на одобрение будет задан здесь повторно. Прежние ответы не переносятся.',
  'sessionHandoff.reask_few':
    '{count} ожидающих запроса на одобрение будут заданы здесь повторно. Прежние ответы не переносятся.',
  'sessionHandoff.reask_many':
    '{count} ожидающих запросов на одобрение будут заданы здесь повторно. Прежние ответы не переносятся.',
  'sessionHandoff.reask_other':
    '{count} ожидающих запроса на одобрение будут заданы здесь повторно. Прежние ответы не переносятся.',
  'sessionHandoff.restarted': 'Перезапускаются здесь, а не переносятся: {resources}.',
  'sessionHandoff.interrupted': 'Последний запрос был прерван и сам не продолжится.',
  'sessionHandoff.continueQuestion': 'Продолжить в этом окне сессию из {source}?',
  'sessionHandoff.startQuestion': 'Начать в этом окне сессию на основе беседы из {source}?',
  'webview.contextUsedUnknownWindow_one':
    'Последний запрос использовал {count} токен. Размер контекстного окна этой модели здесь неизвестен.',
  'webview.contextUsedUnknownWindow_few':
    'Последний запрос использовал {count} токена. Размер контекстного окна этой модели здесь неизвестен.',
  'webview.contextUsedUnknownWindow_many':
    'Последний запрос использовал {count} токенов. Размер контекстного окна этой модели здесь неизвестен.',
  'webview.contextUsedUnknownWindow_other':
    'Последний запрос использовал {count} токена. Размер контекстного окна этой модели здесь неизвестен.',
  'webview.contextUsed_one':
    'Контекст после последнего запроса: {used} из {count} токена ({percent}%)',
  'webview.contextUsed_few':
    'Контекст после последнего запроса: {used} из {count} токенов ({percent}%)',
  'webview.contextUsed_many':
    'Контекст после последнего запроса: {used} из {count} токенов ({percent}%)',
  'webview.contextUsed_other':
    'Контекст после последнего запроса: {used} из {count} токена ({percent}%)',
  'webview.answerTokens_one': '{model} · {count} токен ({input} на входе, {output} на выходе)',
  'webview.answerTokens_few': '{model} · {count} токена ({input} на входе, {output} на выходе)',
  'webview.answerTokens_many': '{model} · {count} токенов ({input} на входе, {output} на выходе)',
  'webview.answerTokens_other': '{model} · {count} токена ({input} на входе, {output} на выходе)',
  'webview.moreLinesHidden_one': 'Скрыта еще {count} строка',
  'webview.moreLinesHidden_few': 'Скрыты еще {count} строки',
  'webview.moreLinesHidden_many': 'Скрыто еще {count} строк',
  'webview.moreLinesHidden_other': 'Скрыто еще {count} строки',
  'mcp.connected_one':
    'AGI Workforce: сервер {name} подключился за {ms} мс и предоставляет {count} инструмент.',
  'mcp.connected_few':
    'AGI Workforce: сервер {name} подключился за {ms} мс и предоставляет {count} инструмента.',
  'mcp.connected_many':
    'AGI Workforce: сервер {name} подключился за {ms} мс и предоставляет {count} инструментов.',
  'mcp.connected_other':
    'AGI Workforce: сервер {name} подключился за {ms} мс и предоставляет {count} инструмента.',
  'checkpoints.trackedFiles_one': '{count} отслеживаемый файл',
  'checkpoints.trackedFiles_few': '{count} отслеживаемых файла',
  'checkpoints.trackedFiles_many': '{count} отслеживаемых файлов',
  'checkpoints.trackedFiles_other': '{count} отслеживаемого файла',
  'checkpoints.skippedFiles_one': 'AGI Workforce: не удалось восстановить {count} файл: {files}',
  'checkpoints.skippedFiles_few': 'AGI Workforce: не удалось восстановить {count} файла: {files}',
  'checkpoints.skippedFiles_many': 'AGI Workforce: не удалось восстановить {count} файлов: {files}',
  'checkpoints.skippedFiles_other': 'AGI Workforce: не удалось восстановить {count} файла: {files}',
  'checkpoints.filesRestored_one': 'AGI Workforce: {count} файл возвращён к контрольной точке.',
  'checkpoints.filesRestored_few': 'AGI Workforce: {count} файла возвращены к контрольной точке.',
  'checkpoints.filesRestored_many': 'AGI Workforce: {count} файлов возвращено к контрольной точке.',
  'checkpoints.filesRestored_other': 'AGI Workforce: {count} файла возвращено к контрольной точке.',
  'webview.sources_one': '{count} источник',
  'webview.sources_few': '{count} источника',
  'webview.sources_many': '{count} источников',
  'webview.sources_other': '{count} источника',
  'sessionSync.continuedIn':
    'Эта сессия продолжилась в {client}. Здесь показаны её последние сообщения.',
  'sessionSync.continuedElsewhere':
    'Эта сессия продолжилась в другом приложении. Здесь показаны её последние сообщения.',
  'sessionSync.heldBy': '{client} использует эту сессию.',
  'sessionSync.takeOverDetail':
    'Перехватите её, чтобы отправить сообщение отсюда. Если {client} ещё отвечает, сначала остановите его там: когда два приложения пишут одновременно, остаются две копии сессии.',
  'sessionSync.takeOver': 'Перехватить и отправить',
  'sessionSync.notSent':
    'Не отправлено: {client} использует эту сессию. Отправьте снова, чтобы перехватить её здесь.',
  'sessionSync.takeOverFailed':
    'Не удалось перехватить сессию. Отправьте снова, чтобы повторить попытку.',
  'sessionSync.stopBeforeTerminal':
    'Остановите текущий ответ, прежде чем продолжить эту сессию в терминале.',
  'remote.title': 'Удалённое управление',
  'remote.intro':
    'Подключите телефон, чтобы следить за сессиями AGI в папках этого окна: подтверждайте шаги, просматривайте diff, результаты тестов и новые файлы и направляйте следующий ход.',
  'remote.howToPair':
    'Откройте приложение AGI Workforce на телефоне, выберите «Pair with Desktop» и отсканируйте этот код. Код срабатывает один раз и истекает через несколько минут.',
  'remote.qrLabel': 'QR-код для подключения',
  'remote.pairingCode': 'Код подключения',
  'remote.copyLink': 'Скопировать ссылку для подключения',
  'remote.linkCopied':
    'AGI Workforce: ссылка для подключения скопирована. Вставьте её в приложение AGI Workforce на телефоне.',
  'remote.noPairing':
    'AGI Workforce: нет ожидающего подключения. Запустите удалённое управление, чтобы получить новый код.',
  'remote.connected': 'Подключено: {phone}.',
  'remote.yourPhone': 'ваш телефон',
  'remote.reconnecting':
    'Соединение потеряно. Переподключаемся, чтобы телефон продолжил с того места, где остановился.',
  'remote.pair': 'Подключить телефон',
  'remote.pairAgain': 'Подключить снова',
  'remote.cancelPairing': 'Отменить подключение',
  'remote.disconnect': 'Отключить телефон',
  'remote.stop': 'Остановить удалённое управление',
  'remote.disconnectTitle': 'Отключить {phone}?',
  'remote.disconnectConsequence':
    'Телефон отключается от этого окна и больше не может следить за его сессиями и направлять их. Чтобы подключить его снова, выполните подключение с новым кодом.',
  'remote.starting': 'Запуск удалённого управления',
  'remote.startFailed': 'AGI Workforce: не удалось запустить удалённое управление. {reason}',
  'remote.pairFailed': 'Не удалось начать подключение.',
  'remote.signInFirst':
    'AGI Workforce: сначала войдите в аккаунт. Удалённое управление подключает телефон через ваш аккаунт.',
  'remote.trustFirst':
    'AGI Workforce: отметьте эту рабочую область как доверенную, прежде чем телефон сможет запускать в ней сессии.',
  'remote.openFolderFirst':
    'AGI Workforce: сначала откройте папку. Удалённое управление запускает сессии в папках этого окна.',
  'remote.folderClosed': 'Эта папка больше не открыта в этом окне.',
  'remote.runtimeUnavailable': 'AGI CLI не удалось получить список сессий в этой папке.',
  'remote.runtimeHint':
    'Проверьте, что AGI CLI установлен и вы вошли в аккаунт, затем обновите список на телефоне.',
  'remote.deviceName': '{host} (VS Code)',
  'remote.statusWaiting': 'Удалённое управление: ожидание телефона',
  'remote.statusConnected': 'Удалённое управление: {phone}',
  'remote.statusReconnecting': 'Удалённое управление: переподключение',
  'remote.statusError': 'Удалённое управление: остановлено',
  'remote.statusTooltip': 'Показать удалённое управление',
  'remote.attached_one': 'На телефоне открыта {count} сессия.',
  'remote.attached_few': 'На телефоне открыты {count} сессии.',
  'remote.attached_many': 'На телефоне открыто {count} сессий.',
  'remote.attached_other': 'На телефоне открыто {count} сессии.',
  'sessionSearch.title': 'История сессий',
  'sessionSearch.placeholder': 'Ищите сессии по названию или тексту сообщений',
  'sessionSearch.folderFailed':
    'AGI Workforce: AGI CLI не удалось прочитать сессии в {folder}. {reason}',
  'archived.title': 'Архивные сессии',
  'archived.placeholder': 'Выберите сессию, чтобы восстановить и открыть её',
  'archived.none': 'AGI Workforce: в этой рабочей области нет архивных сессий.',
  'archived.restore': 'Восстановить',
  'archived.delete': 'Удалить навсегда',
  'archived.deleteTitle': 'Удалить «{title}» навсегда?',
  'archived.deleteDetail':
    'Её расшифровка, а также сохранённые с ней подтверждения и изменения файлов удаляются с этого компьютера для всех поверхностей AGI. Это действие нельзя отменить.',
  'archived.restored': 'AGI Workforce: «{title}» снова среди ваших сессий.',
  'archived.open': 'Открыть',
  'archived.deleted': 'AGI Workforce: «{title}» удалена.',
  'archived.notFound': 'AGI Workforce: этой сессии больше нет в этой рабочей области.',
  'archived.actionFailed': 'AGI Workforce: {reason}',
  'webview.searchingSessions': 'Поиск сессий…',
  'webview.noMatchingSessions': 'Нет сессий, соответствующих «{query}»',
  'webview.archivedSessions': 'Архивные сессии',
  'messageActions.resendTitle': 'Отправить это сообщение повторно?',
  'messageActions.resendDetail':
    'Ответ на него и всё, что идёт после, удаляются из этой сессии, затем сообщение отправляется снова. Файлы не изменяются.',
  'messageActions.resend': 'Отправить повторно',
  'messageActions.stopFirst': 'AGI Workforce: сначала остановите текущий ответ.',
  'messageActions.notFound':
    'AGI Workforce: этого сообщения больше нет в сессии. Откройте сессию заново и повторите попытку.',
  'messageActions.needsUpdate':
    'AGI Workforce: обновите AGI CLI, чтобы повторно отправлять сообщения или ответвляться от них.',
  'messageActions.branchTitle': '{title} (ответвление)',
  'messageActions.failed': 'AGI Workforce: {reason}',
  'webview.resendMessage': 'Отправить повторно',
  'webview.resendMessageLabel': 'Отправить это сообщение повторно',
  'webview.branchFromMessage': 'Ответвить',
  'plan.needsUpdate':
    'AGI Workforce: обновите AGI CLI, чтобы одобрять или дорабатывать план из VS Code.',
  'plan.approvedMessage': 'Выполняйте план.',
  'plan.revisedMessage': 'Доработайте план: {feedback}',
  'webview.approvePlan': 'Одобрить план',
  'webview.revisePlan': 'Доработать',
  'webview.revisePlanPlaceholder': 'Что изменить в плане?',
  'webview.sendRevision': 'Отправить',
  'webview.cancelRevision': 'Отмена',
  'webview.branchFromAnswer': 'Ответвить отсюда',
  'webview.branchFromAnswerLabel': 'Начать новый сеанс, сохранив разговор до этого ответа',
  'webview.branchFromMessageLabel':
    'Начать новую сессию с этого места, подставив это сообщение для правки',
  'localServers.running_one': '{provider} запущен · {count} модель',
  'localServers.running_few': '{provider} запущен · {count} модели',
  'localServers.running_many': '{provider} запущен · {count} моделей',
  'localServers.running_other': '{provider} запущен · {count} модели',
  'localServers.runningEmpty': '{provider} запущен, но модели не загружены',
  'localServers.notRunning': '{provider} не запущен. Запустите его, чтобы использовать его модели.',
  'localServers.unhealthy': '{provider} не отвечает: {reason}',
  'localServers.blocked': '{provider} заблокирован: {reason}',
  'localServers.noReason': 'причина не указана',
  'cloudSteer.action': 'Написать агенту',
  'cloudSteer.actionDescription': 'Добавьте указания или смените направление',
  'cloudSteer.prompt': 'Агент прочтёт сообщение на следующем шаге и сохранит свой прогресс.',
  'cloudSteer.sent': 'В очереди. Агент прочтёт его на следующем шаге.',
  'cloudSteer.queued': 'В очереди. Агент прочтёт его на следующем шаге.',
  'cloudSteer.unread': 'Задача остановилась до того, как агент это прочитал.',
  'cloudSteer.delivered': 'Ваше сообщение, прочитанное агентом',
  'cloudSteer.waitingSection': 'Ваши сообщения',
  'cloudSteer.failed': 'не удалось отправить ваше сообщение',
  'cloudSteer.tooLong': 'Сообщение может содержать не более {count} символов.',
  'savedApprovals.title': 'Сохранённые подтверждения',
  'savedApprovals.placeholder': 'Правила, которые AGI CLI применяет во всех сессиях',
  'savedApprovals.empty':
    'Сохранённых подтверждений пока нет. Выберите «Всегда разрешать» в запросе, чтобы сохранить правило.',
  'savedApprovals.allowed': 'Всегда разрешено',
  'savedApprovals.denied': 'Всегда запрещено',
  'savedApprovals.kindCommand': 'Команда оболочки',
  'savedApprovals.kindFile': 'Изменение файла',
  'savedApprovals.kindPolicy': 'Правило политики команд',
  'savedApprovals.removeTitle': 'Удалить это сохранённое подтверждение?',
  'savedApprovals.removeAllowed':
    'AGI снова спросит, когда в следующий раз захочет сделать это: {label}',
  'savedApprovals.removeDenied': 'AGI сможет снова попросить сделать это вместо отказа: {label}',
  'pullRequest.titlePrompt': 'Заголовок pull request',
  'pullRequest.basePrompt': 'Ветка, в которую сливать',
  'pullRequest.confirmPush':
    'Отправить {count} коммит(ов) из {branch} в {remote} и открыть pull request в {base}?',
  'pullRequest.confirmOpen': 'Открыть pull request из {branch} в {base}?',
  'pullRequest.confirmAction': 'Отправить и открыть',
  'pullRequest.openAction': 'Открыть pull request',
  'pullRequest.created': 'AGI Workforce: pull request открыт.',
  'pullRequest.finishOnGitHub': 'AGI Workforce: {note}.',
  'pullRequest.view': 'Открыть',
  'pullRequest.blocked': 'AGI Workforce: не удаётся открыть pull request: {reason}.',
  'pullRequest.failed': 'AGI Workforce: {reason}',
  'savedApprovals.noun': 'сохранённые подтверждения',
  'webview.alwaysAllow': 'Всегда разрешать',
  'webview.alwaysAllowHint':
    'Сохраняет правило, чтобы AGI больше не спрашивал об этом ни в одной сессии. Управлять им можно в разделе «Сохранённые подтверждения».',
  'webview.alwaysAllowedOutcome': 'Всегда разрешено. AGI больше не будет спрашивать об этом.',
  'mcpDetails.action': 'Сведения о сервере',
  'mcpDetails.checking': 'AGI Workforce: проверка {name}',
  'mcpDetails.documentTitle': 'Сервер MCP {name}',
  'mcpDetails.health': 'Состояние',
  'mcpDetails.responding': 'Отвечает',
  'mcpDetails.notResponding': 'Подключён, но не ответил на ping',
  'mcpDetails.notConnected': 'Не удалось подключиться',
  'mcpDetails.connection': 'Подключение',
  'mcpDetails.live': 'Активное, в работающем сеансе',
  'mcpDetails.probe': 'Запущен для этой проверки и затем остановлен',
  'mcpDetails.protocol': 'Протокол',
  'mcpDetails.server': 'Сервер',
  'mcpDetails.notReported': 'Не указано',
  'mcpDetails.capabilities': 'Возможности',
  'mcpDetails.noCapabilities': 'Не заявлены',
  'mcpDetails.error': 'Ошибка',
  'mcpDetails.checkedAt': 'Проверено: {time}',
  'mcpDetails.instructions': 'Инструкции',
  'mcpDetails.output': 'Последний вывод',
  'mcpDetails.noOutput': 'Этот сервер пока ничего не вывел.',
  'mcpDetails.expired':
    'Эти сведения больше не хранятся. Выполните AGI Workforce: Show MCP Servers и выберите «Сведения о сервере», чтобы снова проверить {name}.',
  'mcpDetails.field': '{label}: {value}',
  'chatNotice.webSearchDenied':
    'Веб-поиск недоступен в этом сеансе. {reason} Отключите Browse the web, чтобы отправить без него.',
  'webSearchSetup.title': 'Настроить веб-поиск',
  'webSearchSetup.placeholder': 'Выберите поисковый сервис, для которого у вас есть ключ API',
  'webSearchSetup.detail':
    'Введите его ключ API в терминале. Сеансы с вашим ключом и локальные сеансы ищут с ним; управляемым сеансам ключ не нужен.',
  'webSearchSetup.unavailable':
    'AGI Workforce: эта AGI CLI не сообщает, какие ключи поиска она может сохранить. Обновите AGI CLI, чтобы настроить веб-поиск из VS Code.',
  'pluginUpdate.action': 'Обновить',
  'pluginUpdate.progress': 'AGI Workforce: обновление {name}',
  'pluginUpdate.upToDate': 'AGI Workforce: {name} уже обновлён.',
  'pluginUpdate.updated': 'AGI Workforce: {name} обновлён.',
  'pluginUpdate.updatedTo': 'AGI Workforce: {name} обновлён до {to}.',
  'pluginUpdate.updatedFromTo': 'AGI Workforce: {name} обновлён с {from} до {to}.',
  'chatError.usageLimitResetsAt':
    'Вы достигли лимита использования в своём аккаунте. Он сбросится {time}.',
  'chatError.continueWith': 'Продолжить с {model}',
  'chatError.addCredits': 'Пополнить кредиты',
  'chatError.comparePlans': 'Сравнить тарифы',
  'chatError.seeUsage': 'Посмотреть использование',
  'chatError.seeOptions': 'Посмотреть варианты',
  'webview.mcpAuthRequired':
    '{server} просит войти заново. AGI не смог использовать его на этом шаге.',
  'webview.mcpReconnect': 'Войти и продолжить',
  'webview.mcpReconnecting': 'Выполняется вход…',
  'webview.mcpReconnected': 'Вход в {server} выполнен. AGI продолжает.',
  'mcpReconnect.progress': 'AGI Workforce: вход в {server}',
  'mcpReconnect.notFinished':
    'AGI Workforce: вход в {server} не завершён, поэтому AGI не продолжил. Попробуйте снова, когда будете готовы.',
  'mcpReconnect.failed': 'AGI Workforce: не удалось войти в {server}: {reason}',
  'mcpReconnect.noSession':
    'AGI Workforce: здесь нет сеанса, который можно продолжить после входа в {server}.',
  'mcpReconnect.continue': 'продолжай',
};

export default ru;
