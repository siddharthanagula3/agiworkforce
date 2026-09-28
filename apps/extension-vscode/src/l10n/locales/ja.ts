const ja = {
  'applyEdit.prompt': 'AGI Workforce: {command} の結果を適用しますか？',
  'applyEdit.applyInline': 'その場に適用',
  'applyEdit.viewInNewTab': '新しいタブで表示',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: 編集を自動適用できませんでした, ドキュメントが変更された可能性があります。',
  'applyEdit.applyFailed':
    'AGI Workforce: 編集を適用できませんでした, ドキュメントが変更された可能性があります。',
  'advancedFeatures.inlineNeedsCredential':
    'AGI Workforce のインライン補完には AGI Cloud へのサインインまたは AGI API キーが必要です。',
  'advancedFeatures.openAccount': 'アカウントを開く',
  'subsystemHealth.allHealthy': 'AGI Workforce: すべてのサブシステムは正常です。',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} を利用できません',
  'subsystemHealth.manyUnavailable': 'AGI: {count} 個のサブシステムを利用できません',
  'subsystemHealth.detailsTooltip': 'クリックして詳細を表示',
  'subsystemHealth.failuresTitle': 'AGI Workforce, サブシステムの障害',
  'subsystemHealth.failuresPlaceholder': 'このセッションで記録された障害',
  'chatError.keyRejected': '{provider} のキーが拒否されました。',
  'chatError.notCoveredByPlan': '{provider} によると、この要求はご利用のプランの対象外です。',
  'chatError.rateLimiting':
    '{provider} が要求をレート制限しています。しばらくしてからもう一度お試しください。',
  'chatError.providerProblem':
    '{provider} で問題が発生したため、応答できませんでした。もう一度お試しください。',
  'chatError.providerRejected': '{provider} が要求を拒否しました。',
  'chatError.updateExtension': '拡張機能を更新',
  'chatError.stoppedPartWay': '{provider} の応答が途中で停止しました。',
  'chatError.toolFailed': '{tool} ツールが失敗したため、応答が停止しました。',
  'chatError.couldNotReach':
    '{provider} に接続できませんでした。接続を確認して、もう一度お試しください。',
  'chatError.theModelProvider': 'モデル プロバイダー',
  'chatError.tooLongForModel': 'この会話は、{model} が一度に読み取れる長さを超えています。',
  'chatError.planRequired': 'クラウド チャットには {plan} プランが必要です。',
  'chatError.runtimeSettings': 'AGI のローカル ランタイムが設定を読み取れませんでした。',
  'chatError.noPermission': 'AGI にはその操作を行うアクセス許可がありません。',
  'chatError.runtimeNotRunning': 'AGI のローカル ランタイムが実行されていません。',
  'chatError.aboutSeconds_other': '約 {count} 秒',
  'chatError.aboutMinutes_other': '約 {count} 分',
  'chatError.aboutHours_other': '約 {count} 時間',
  'chatError.withReference': '{text}参照 ID: {reference}',
  'chatError.signInToRun':
    'ご利用のプランでこのモデルを実行するには、AGI にサインインしてください。',
  'chatError.planExcludesModel': 'ご利用のプランにはこのモデルが含まれていません。',
  'chatError.usageLimitWait':
    'アカウントの使用量の上限に達しました。{wait}後に再び利用できるようになります。',
  'chatError.usageLimit':
    'アカウントの使用量の上限に達しました。リセットされる時期は使用状況で確認してください。',
  'chatError.noProviderKey': 'この処理を実行するための {provider} キーが AGI にありません。',
  'chatError.providerBusyWait':
    '{provider} は現在、要求が集中しています。{wait}後にもう一度お試しください。',
  'chatError.providerBusy':
    '{provider} は現在、要求が集中しています。しばらくしてからもう一度お試しいただくか、モデルを切り替えてください。',
  'chatError.freeAllowanceWait':
    'この無料モデルは、Free プランの全ユーザーで共有している割り当てを使い切りました。アカウント個別の制限ではありません。{wait}後にもう一度お試しください。',
  'chatError.freeAllowance':
    'この無料モデルは、Free プランの全ユーザーで共有している割り当てを使い切りました。アカウント個別の制限ではありません。割り当てはプロバイダーのスケジュールに従ってリセットされます。',
  'chatError.providerCouldNotAnswer': '{provider} は応答できませんでした。',
  'chatError.tooLong': 'この会話は、モデルが一度に読み取れる長さを超えています。',
  'chatError.outputLimit':
    '応答がこのモデルの最大長に達したため、そこで停止しました。短い応答を求めるか、要求を分割してください。',
  'chatError.safety':
    '安全システムによってこの応答が停止されました。要求を言い換えるか、別のモデルをお試しください。',
  'chatError.network': 'このマシンからプロバイダーに接続できませんでした。',
  'chatError.toolDenied': 'ツールの実行が許可されなかったため、ターンが停止しました。',
  'chatError.interrupted': 'ターンは停止されました。',
  'chatError.timeout': '{provider} の応答に時間がかかりすぎました。',
  'chatError.invalidRequest': 'AGI が {provider} に送信した要求は拒否されました。',
  'chatError.generic': 'AGI は応答を完了できませんでした。',
  'chatError.theProvider': 'プロバイダー',
  'chatError.signInToProvider': '{provider} にサインイン',
  'chatError.signInToAgi': 'AGI にサインイン',
  'chatError.upgradePlan': 'プランをアップグレード',
  'chatError.openSettings': '設定を開く',
  'chatError.switchModel': 'モデルを切り替える',
  'chatNotice.noEditorForDiagnostics': '診断に使用するアクティブなエディターがありません。',
  'chatNotice.noDiagnostics': 'アクティブなファイルに診断が見つかりません。',
  'chatNotice.modelNotOnPlan':
    'このモデルは、現在のプランまたはプロバイダーの設定では利用できません。',
  'chatNotice.trustBeforeResume':
    '開発者セッションを再開する前に、このワークスペースを信頼してください。',
  'chatNotice.stopBeforeOpening': '別の開発者セッションを開く前に、現在の応答を停止してください。',
  'chatNotice.historyUnavailable': 'このチャット画面では開発者セッションの履歴を利用できません。',
  'chatNotice.sessionNotFound': '開いているワークスペースに開発者セッションが見つかりません。',
  'chatNotice.differentSession': 'ローカル ランタイムから別の開発者セッションが返されました。',
  'chatNotice.workspaceMismatch':
    '開発者セッションのワークスペースが、そのセッションを所有するローカル ランタイムと一致しません。',
  'chatNotice.modelUnavailableForSession':
    'この開発者セッションはモデル "{model}" を使用していますが、このモデルは現在のモデル カタログまたはローカル ランタイムでは利用できません。利用可能なモデルを選択してから、新しいセッションを開始してください。',
  'chatNotice.resumeFailed': '開発者セッションを再開できませんでした。',
  'chatNotice.approvalFailed': '承認の応答に失敗しました。',
  'chatNotice.trustBeforeStart':
    '開発者セッションを開始する前に、このワークスペースを信頼してください。',
  'chatNotice.openWorkspace':
    '開発者セッションを開始する前に、ワークスペース フォルダーを開いてください。',
  'chatNotice.runtimeUnavailable': 'AGI のローカル ランタイムを利用できません。',
  'chatNotice.reopenWorkspace':
    '続行する前に、この開発者セッションのワークスペースを開き直してください。',
  'chatNotice.localBoundary':
    'AGI は、レビュー済みのハンドオフなしで Local 開発者セッションを BYOK、Managed Cloud、Auto ルーティングに切り替えて続行することはありません。新しいプロバイダー セッションを始めるには [New Chat] を使用するか、AGI CLI でレビュー済みの継続を作成してください。',
  'chatNotice.eventOverflow':
    'ローカル ランタイムがターンを確定する前に過剰な数のイベントを発行しました。完了状態が失われないように、AGI はターンを中断しました。',
  'chatNotice.overflowNotInterrupted':
    'オーバーフローしたローカル ターンを中断できませんでした: {reason}',
  'chatNotice.cancellationFailed': 'キャンセルに失敗しました。',
  'chatNotice.runtimeFailed': 'AGI のローカル ランタイムでエラーが発生しました。',
  'chatNotice.turnFailed': 'ローカルの開発者ターンが失敗しました。',
  'chatNotice.sessionRunningElsewhere':
    'この開発者セッションは別のクライアントでまだ実行中です。そちらで停止するか、アイドル状態になるまでお待ちください。',
  'chatNotice.sessionAwaitingApprovalElsewhere':
    'この開発者セッションは別のクライアントで承認待ちです。ここで再開する前に、そちらで対応してください。',
  'chatNotice.sessionArchived':
    'アーカイブ済みの開発者セッションは読み取り専用です。この作業を続けるには、新しいセッションを開始してください。',
  'chatNotice.unverifiedBoundary':
    'この従来の開発者セッションには、検証済みの Local、BYOK、Managed の境界がありません。新しいセッションを開始して、プロバイダーを選択し直してください。AGI はこのセッションを自動的には再開しません。',
  'chatNotice.queuedNotStarted': 'キューに登録されたフォローアップは開始されませんでした。',
  'chatNotice.followUpCapacity_other':
    'フォローアップの上限に達しています ({count} 件が保留中)。アクティブなターンが終了してから、もう一度お試しください。',
  'chatNotice.steerFailed': 'アクティブなターンを誘導できませんでした。',
  'chatNotice.openFileForDiff':
    'このコードの提案を確認するには、エディターでファイルを開いてください。',
  'chatNotice.diffUnavailable':
    '差分プロバイダーを利用できません。拡張機能を再読み込みしてください。',
  'webview.retry': '再試行',
  'webview.details': '詳細',
  'webview.copy': 'コピー',
  'webview.copyResponse': '応答をコピー',
  'webview.copied': 'コピーしました',
  'webview.copyFailed': 'コピーに失敗しました',
  'webview.goodResponse': '良い応答',
  'webview.badResponse': '悪い応答',
  'webview.removeRating': '評価を削除',
  'webview.failed': '失敗',
  'webview.newerDiffReplaced': 'この要求は、より新しい差分の提案に置き換えられました。',
  'webview.couldNotOpenDiff': '提案された差分を開けませんでした。',
  'webview.cloudSessionExpired': 'AGI Cloud のセッションの有効期限が切れました',
  'webview.localStillAvailable': '· Local とプロバイダーの BYOK は引き続き利用できます',
  'webview.signInAgain': 'もう一度サインイン',
  'webview.accountNeedsAttention': 'アカウントの確認が必要です',
  'webview.sessionExpired': 'セッションの有効期限が切れました',
  'webview.tryAgain': '再試行',
  'webview.checking': '確認しています…',
  'webview.openWorkspaceToBegin': 'ワークスペースを開いて開始',
  'webview.restrictedMode': 'ワークスペースは制限モードです',
  'webview.runtimeNeedsSetup': '開発者ランタイムのセットアップが必要です',
  'webview.openFolderToBegin': '開始するには、フォルダーまたはワークスペースを開いてください。',
  'webview.trustWorkspaceFirst':
    'AGI がプロジェクトのファイルやツールを使用できるようにするには、このワークスペースを信頼してください。',
  'webview.cliUnavailable': 'AGI CLI を利用できません。',
  'webview.openFolder': 'フォルダーを開く',
  'webview.manageTrust': '信頼を管理',
  'webview.installCli': 'AGI CLI をインストール',
  'webview.openSetup': 'セットアップを開く',
  'webview.activity': 'アクティビティ',
  'webview.starting': '開始しています…',
  'webview.completed': '完了',
  'webview.completedWithErrors': '完了 (エラーあり)',
  'webview.collapseDetails': '詳細を折りたたむ',
  'webview.expandDetails': '詳細を展開',
  'webview.lineDelta': '+{added} −{removed} 行',
  'webview.actions_other': '{count} 件のアクション',
  'webview.errors_other': '{count} 件のエラー',
  'webview.runningCount_other': '{count} 件実行中',
  'webview.completedCount_other': '{count} 件完了',
  'webview.linesWritten_other': '{count} 行書き込み済み',
  'diff.confirmWriteInFile_other':
    'AGI Workforce: {file} 内の保留中の変更 {count} 件をディスクに書き込みますか？',
  'diff.confirmWrite_other': 'AGI Workforce: 保留中の変更 {count} 件をディスクに書き込みますか？',
  'diff.confirmDiscardInFile_other':
    'AGI Workforce: {file} 内の保留中の変更 {count} 件を書き込まずに破棄しますか？',
  'diff.confirmDiscard_other': 'AGI Workforce: 保留中の変更 {count} 件を書き込まずに破棄しますか？',
  'diff.discardedInFile_other': 'AGI Workforce: {file} 内の保留中の変更 {count} 件を破棄しました。',
  'diff.discarded_other': 'AGI Workforce: 保留中の変更 {count} 件を破棄しました。',
  'diff.restoredInFile_other': 'AGI Workforce: {file} 内の保留中の変更 {count} 件を復元しました。',
  'diff.restored_other': 'AGI Workforce: 保留中の変更 {count} 件を復元しました。',
  'diff.moreFiles_other': '• …ほか {count} 個のファイル',
  'diff.nothingPending': 'AGI Workforce: 確認する保留中の変更はありません。',
  'diff.writeConsequence':
    'これらの編集は作業ツリーに適用されます。事前に他のレビューは行われません。',
  'diff.discardConsequence':
    '提案は破棄されます。このセッション中に元に戻すには、"AGI Workforce: Restore Discarded Changes" を実行してください。',
  'diff.writeChanges': '変更を書き込む',
  'diff.discardChanges': '変更を破棄',
  'diff.restoreDiscarded': '破棄した変更を復元',
  'diff.reviewFirst': '先に確認',
  'runtime.reloaded':
    'AGI Workforce: ランタイム構成を再読み込みしました。ワークスペースの開発者ランタイムを再確認しています。',
  'runtime.restarted_other':
    'AGI Workforce: {count} 個のワークスペースでローカル ランタイムを再起動しました。',
  'memory.nothingToForget': '削除するメモリはありません。',
  'memory.forgetEverything': 'すべて削除',
  'memory.confirmForgetAll_other':
    'AGI Cloud アカウントから {count} 件のメモリを削除しますか？Web アプリ、CLI、モバイルからも削除され、この操作は元に戻せません。',
  'memory.allForgotten': 'アカウントからすべてのメモリを削除しました。',
  'memory.someKept': '一部のメモリは保持されました。{reasons}',
  'project.archived': 'アーカイブ済み',
  'project.files_other': '{count} 個のファイル',
  'project.chats_other': '{count} 件のチャット',
  'project.lastUsed': '最終使用: {date}',
  'project.deleteEverywhere':
    '"{title}" は、Web アプリ、CLI、モバイル、その他すべてのクライアントから削除されます。',
  'project.deleteKnowledge_other':
    'このプロジェクトの {count} 個のナレッジ ファイルも一緒に削除され、復元できません。',
  'project.keepConversations_other':
    'このプロジェクトの {count} 件の会話は保持されますが、プロジェクトから外れ、プロジェクトの指示とナレッジは適用されなくなります。',
  'billing.credits_other': '{count} クレジット',
  'billing.unsettledRequests_other': '未精算の要求 {count} 件',
  'billing.noneYet': 'まだありません',
  'billing.noPublishedRate': '公開料金なし',
  'billing.withUnsettled': '{credits} ({unsettled})',
  'billing.excludesUnpriced_other': '{credits} (公開料金のない {count} 件のターンを除く)',
  'billing.turnBilled': 'AGI Workforce: このターンの請求額は {credits} です',
  'billing.turnBilledSoFar': 'AGI Workforce: このターンのこれまでの請求額は {credits}、{unsettled}',
  'schedule.runsSoFar_other': 'これまでに {count} 回実行',
  'composer.problems_other': '{count} 件の問題',
  'review.noIssues': 'AGI Workforce: コードは良好です。問題は見つかりませんでした。',
  'review.issuesFound_other':
    'AGI Workforce: {count} 件の問題が見つかりました。問題パネルを確認してください。',
  'commands.registrationFailed_other':
    'AGI Workforce: {count} 個のコマンドを登録できませんでした ({commands})。詳細については、AGI サブシステム正常性のステータス バー項目を確認してください。',
  'usage.requests_other': '{count} 件の要求',
  'usage.lastDays_other': '過去 {count} 日間',
  'usage.unsettledTurns_other': '{count} 件のターンは精算中のため、まだ集計されていません',
  'handoff.switchBranch':
    'このワークスペースを {branch} に切り替えますか？コミットされていない変更が失われる可能性があります。',
  'handoff.uncommittedFiles_other':
    'ここにある {count} 個のファイルには、どのコミットにも含まれていない変更があります。{branch} をチェックアウトすると、それらが破棄される可能性があり、元に戻すことはできません。',
  'handoff.andMore_other': 'ほか {count} 個',
  'cloud.repository': 'リポジトリ: {repository}',
  'cloud.branch': 'ブランチ: {branch} ({upstream} にプッシュ済みの状態)',
  'cloud.model': 'モデル: {model}',
  'cloud.network': 'ネットワーク: 信頼されたホスト、パッケージ レジストリ、コード ホストのみ',
  'cloud.whatMoves': '移行されるもの: 入力したタスクとプッシュ済みのブランチ。',
  'cloud.whatStays':
    'ここに残るもの: このチャットの会話、ローカルのツールとサーバー、プッシュされていないすべてのもの。',
  'cloud.unpushedCommits_other':
    '{branch} の {count} 個のコミットはプッシュされていないため、クラウドには含まれません。',
  'cloud.uncommittedFiles_other':
    '{count} 個のファイルにコミットされていない変更があり、それらはクラウドには含まれません。',
  'cloud.continueQuestion': 'この作業を {repository} のクラウドで続行しますか？',
  'sessionHandoff.protocolUnsupported':
    'そのセッションは開発者セッション プロトコル {requested} を使用していますが、この拡張機能は {supported} を使用しています。両方が同じプロトコルを使用するように、AGI for VS Code または AGI CLI を更新してください。',
  'sessionHandoff.wrongDestination':
    'そのセッションは、このエディターではなく {destination} 環境に引き渡されました。',
  'sessionHandoff.trustModeUnknown':
    'そのセッションは Local、BYOK、Managed のどれで実行されていたかを示していないため、このエディターでは続行しません。',
  'sessionHandoff.issuedAtUnreadable':
    'そのセッション レコードには発行日時が記載されていないため、このエディターではそれが最新かどうかを判断できません。',
  'sessionHandoff.expired_other':
    'そのセッションは {count} 分前に引き渡されましたが、レコードは {limit}で期限切れになります。AGI CLI からもう一度引き渡してください。',
  'sessionHandoff.expiryLimit_other': '{count} 分',
  'sessionHandoff.notYetIssued':
    'そのセッション レコードの日付は未来になっています。レコードを生成したマシンの時計を確認してください。',
  'sessionHandoff.alreadyAccepted':
    'このエディターはそのセッションを既に受け取っています。もう一度引き渡すのではなく、[Sessions] から開いてください。',
  'sessionHandoff.wrongAccount':
    'そのセッションは、このエディターでサインインしているアカウントとは別の AGI アカウントに属しています。',
  'sessionHandoff.wrongWorkspace':
    'そのセッションは {received} で作業していましたが、このウィンドウでは {expected} が開いています。先にそのフォルダーを開いてください。',
  'sessionHandoff.credentialInRecord':
    'そのセッション レコードの {field} に資格情報と思われるものが含まれているため、このエディターは受け取りを拒否しました。他に渡さずに報告してください。',
  'sessionHandoff.source.cli': 'AGI CLI',
  'sessionHandoff.source.vscode': 'VS Code',
  'sessionHandoff.source.desktop': 'デスクトップ アプリ',
  'sessionHandoff.source.unknown': '他の AGI アプリ',
  'sessionHandoff.resource.backgroundShell': 'バックグラウンド シェル',
  'sessionHandoff.resource.devServer': '開発サーバー',
  'sessionHandoff.resource.mcpServer': 'MCP サーバー',
  'sessionHandoff.resource.sandbox': 'サンドボックス',
  'sessionHandoff.resource.fileWatcher': 'ファイル ウォッチャー',
  'sessionHandoff.resource.terminal': 'ターミナル',
  'sessionHandoff.goal': '目標: {goal}',
  'sessionHandoff.folder': 'フォルダー: {folder}',
  'sessionHandoff.branch': 'ブランチ: {branch}',
  'sessionHandoff.branchAt': 'ブランチ: {branch} (コミット {commit})',
  'sessionHandoff.runsAs': '実行モード: {trust}',
  'sessionHandoff.uncommittedStays':
    'フォルダーにはコミットされていない変更があります。これらはそのままディスク上に残ります。',
  'sessionHandoff.movesConversation': '会話とその履歴全体',
  'sessionHandoff.movesNewSession': 'そのスレッドから開始される新しいセッション',
  'sessionHandoff.changedFiles_other': '変更されたファイル {count} 個: {files}',
  'sessionHandoff.andMore_other': ' ほか {count} 個',
  'sessionHandoff.planSteps_other': '{count} ステップの計画',
  'sessionHandoff.checksRun_other': '実行済みのチェック {count} 件',
  'sessionHandoff.movesWithIt': '一緒に移行されるもの:',
  'sessionHandoff.reask_other':
    '保留中の承認 {count} 件は、ここで改めて確認されます。以前の回答は引き継がれません。',
  'sessionHandoff.restarted': '移行されずにここで再起動されるもの: {resources}。',
  'sessionHandoff.interrupted': '最後のターンは中断されたため、自動的には続行されません。',
  'sessionHandoff.continueQuestion': '{source} のセッションをこのウィンドウで続行しますか？',
  'sessionHandoff.startQuestion':
    '{source} のスレッドから、このウィンドウでセッションを開始しますか？',
  'webview.contextUsedUnknownWindow_other':
    '最後のターンで {count} 個のトークンを使用しました。このモデルのコンテキスト ウィンドウはここでは不明です。',
  'webview.contextUsed_other':
    '最後のターン後のコンテキスト: {count} 個のトークン中 {used} 個を使用 ({percent}%)',
  'webview.answerTokens_other': '{model} · {count} 個のトークン (入力 {input}、出力 {output})',
  'webview.moreLinesHidden_other': 'ほか {count} 行は非表示',
  'mcp.connected_other':
    'AGI Workforce: {name} に {ms} ミリ秒で接続しました。{count} 個のツールを利用できます。',
  'checkpoints.trackedFiles_other': '追跡中のファイル {count} 個',
  'checkpoints.skippedFiles_other':
    'AGI Workforce: {count} 個のファイルを復元できませんでした: {files}',
  'checkpoints.filesRestored_other':
    'AGI Workforce: {count} 個のファイルをチェックポイントの状態に戻しました。',
  'webview.sources_other': '{count} 件のソース',
};

export default ja;
