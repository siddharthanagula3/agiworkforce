const pt = {
  'applyEdit.prompt': 'AGI Workforce: aplicar o resultado de {command}?',
  'applyEdit.applyInline': 'Aplicar no local',
  'applyEdit.viewInNewTab': 'Ver em nova aba',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: não foi possível aplicar a edição automaticamente, o documento pode ter mudado.',
  'applyEdit.applyFailed':
    'AGI Workforce: não foi possível aplicar a edição, o documento pode ter mudado.',
  'advancedFeatures.inlineNeedsCredential':
    'As conclusões em linha do AGI Workforce exigem login no AGI Cloud ou uma chave de API AGI.',
  'advancedFeatures.openAccount': 'Abrir conta',
  'subsystemHealth.allHealthy': 'AGI Workforce: todos os subsistemas estão saudáveis.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} indisponível',
  'subsystemHealth.manyUnavailable': 'AGI: {count} subsistemas indisponíveis',
  'subsystemHealth.detailsTooltip': 'Clique para ver os detalhes',
  'subsystemHealth.failuresTitle': 'AGI Workforce, Falhas de subsistemas',
  'subsystemHealth.failuresPlaceholder': 'Falhas registradas durante esta sessão',
  'chatError.keyRejected': 'Sua chave para {provider} foi rejeitada.',
  'chatError.notCoveredByPlan':
    '{provider} informa que esta solicitação não está incluída no seu plano.',
  'chatError.rateLimiting':
    '{provider} está limitando a taxa de solicitações. Tente novamente em instantes.',
  'chatError.providerProblem':
    '{provider} teve um problema e não conseguiu responder. Tente novamente.',
  'chatError.providerRejected': '{provider} rejeitou a solicitação.',
  'chatError.updateExtension': 'Atualizar a extensão',
  'chatError.stoppedPartWay': '{provider} interrompeu a resposta no meio do caminho.',
  'chatError.toolFailed': 'A ferramenta {tool} falhou, então a resposta foi interrompida.',
  'chatError.couldNotReach':
    'Não foi possível acessar {provider}. Verifique sua conexão e tente novamente.',
  'chatError.theModelProvider': 'o provedor do modelo',
  'chatError.tooLongForModel':
    'Esta conversa é mais longa do que {model} consegue ler de uma só vez.',
  'chatError.planRequired': 'O chat na nuvem requer o plano {plan}.',
  'chatError.runtimeSettings': 'O runtime local do AGI não conseguiu ler suas configurações.',
  'chatError.noPermission': 'O AGI não tem permissão para essa ação.',
  'chatError.runtimeNotRunning': 'O runtime local do AGI não está em execução.',
  'chatError.aboutSeconds_one': 'cerca de {count} segundo',
  'chatError.aboutSeconds_many': 'cerca de {count} de segundos',
  'chatError.aboutSeconds_other': 'cerca de {count} segundos',
  'chatError.aboutMinutes_one': 'cerca de {count} minuto',
  'chatError.aboutMinutes_many': 'cerca de {count} de minutos',
  'chatError.aboutMinutes_other': 'cerca de {count} minutos',
  'chatError.aboutHours_one': 'cerca de {count} hora',
  'chatError.aboutHours_many': 'cerca de {count} de horas',
  'chatError.aboutHours_other': 'cerca de {count} horas',
  'chatError.withReference': '{text} Referência: {reference}',
  'chatError.signInToRun': 'Entre no AGI para executar este modelo no seu plano.',
  'chatError.planExcludesModel': 'Seu plano não inclui este modelo.',
  'chatError.usageLimitWait':
    'Você atingiu um limite de uso na sua conta. O uso será liberado novamente em {wait}.',
  'chatError.usageLimit':
    'Você atingiu um limite de uso na sua conta. Verifique seu uso para saber quando ele será redefinido.',
  'chatError.noProviderKey':
    'O AGI não tem uma chave para {provider} com a qual executar esta solicitação.',
  'chatError.providerBusyWait':
    'No momento, {provider} está recebendo solicitações demais. Tente novamente em {wait}.',
  'chatError.providerBusy':
    'No momento, {provider} está recebendo solicitações demais. Tente novamente em instantes ou troque de modelo.',
  'chatError.freeAllowanceWait':
    'O modelo gratuito esgotou a cota compartilhada por todos no plano Free, portanto este não é um limite da sua conta. Tente novamente em {wait}.',
  'chatError.freeAllowance':
    'O modelo gratuito esgotou a cota compartilhada por todos no plano Free, portanto este não é um limite da sua conta. A cota é redefinida conforme o cronograma do provedor.',
  'chatError.providerCouldNotAnswer': '{provider} não conseguiu responder.',
  'chatError.tooLong': 'Esta conversa é mais longa do que o modelo consegue ler de uma só vez.',
  'chatError.outputLimit':
    'A resposta atingiu o tamanho máximo deste modelo e parou ali. Peça uma resposta mais curta ou divida a solicitação.',
  'chatError.safety':
    'O sistema de segurança interrompeu esta resposta. Reformule a solicitação ou tente outro modelo.',
  'chatError.network': 'Este computador não conseguiu acessar o provedor.',
  'chatError.toolDenied':
    'O turno parou porque uma ferramenta não teve permissão para ser executada.',
  'chatError.interrupted': 'O turno foi interrompido.',
  'chatError.timeout': '{provider} demorou demais para responder.',
  'chatError.invalidRequest': 'O AGI enviou para {provider} uma solicitação que foi recusada.',
  'chatError.generic': 'O AGI não conseguiu concluir a resposta.',
  'chatError.theProvider': 'o provedor',
  'chatError.signInToProvider': 'Entrar com {provider}',
  'chatError.signInToAgi': 'Entrar no AGI',
  'chatError.upgradePlan': 'Fazer upgrade do plano',
  'chatError.openSettings': 'Abrir configurações',
  'chatError.switchModel': 'Trocar de modelo',
  'chatNotice.noEditorForDiagnostics': 'Nenhum editor ativo para diagnóstico.',
  'chatNotice.noDiagnostics': 'Nenhum diagnóstico encontrado no arquivo ativo.',
  'chatNotice.modelNotOnPlan':
    'Este modelo não está disponível para seu plano atual ou sua configuração de provedor.',
  'chatNotice.trustBeforeResume':
    'Confie neste espaço de trabalho antes de retomar uma sessão de desenvolvimento.',
  'chatNotice.stopBeforeOpening':
    'Interrompa a resposta atual antes de abrir outra sessão de desenvolvimento.',
  'chatNotice.historyUnavailable':
    'O histórico de sessões de desenvolvimento não está disponível nesta interface de chat.',
  'chatNotice.sessionNotFound':
    'Sessão de desenvolvimento não encontrada no espaço de trabalho aberto.',
  'chatNotice.differentSession':
    'O runtime local retornou uma sessão de desenvolvimento diferente.',
  'chatNotice.workspaceMismatch':
    'O espaço de trabalho da sessão de desenvolvimento não corresponde ao runtime local ao qual ela pertence.',
  'chatNotice.modelUnavailableForSession':
    'Esta sessão de desenvolvimento usa o modelo "{model}", que não está disponível no catálogo de modelos atual nem no runtime local. Selecione um modelo disponível e inicie uma nova sessão.',
  'chatNotice.resumeFailed': 'Não foi possível retomar a sessão de desenvolvimento.',
  'chatNotice.approvalFailed': 'Falha ao enviar a resposta de aprovação.',
  'chatNotice.trustBeforeStart':
    'Confie neste espaço de trabalho antes de iniciar uma sessão de desenvolvimento.',
  'chatNotice.openWorkspace':
    'Abra uma pasta de espaço de trabalho antes de iniciar uma sessão de desenvolvimento.',
  'chatNotice.runtimeUnavailable': 'O runtime local do AGI não está disponível.',
  'chatNotice.reopenWorkspace':
    'Reabra o espaço de trabalho desta sessão de desenvolvimento antes de continuar.',
  'chatNotice.localBoundary':
    'O AGI não continua uma sessão de desenvolvimento Local no roteamento BYOK, Managed Cloud ou Auto sem uma transferência revisada. Use New Chat para uma nova sessão com o provedor ou crie uma continuação revisada no AGI CLI.',
  'chatNotice.eventOverflow':
    'O runtime local emitiu eventos demais antes de confirmar o turno. O AGI interrompeu o turno para não perder o estado de conclusão dele.',
  'chatNotice.overflowNotInterrupted':
    'Não foi possível interromper o turno local com excesso de eventos: {reason}',
  'chatNotice.cancellationFailed': 'Falha no cancelamento.',
  'chatNotice.runtimeFailed': 'Falha no runtime local do AGI.',
  'chatNotice.turnFailed': 'O turno local da sessão de desenvolvimento falhou.',
  'chatNotice.sessionRunningElsewhere':
    'Esta sessão de desenvolvimento ainda está em execução em outro cliente. Interrompa-a lá ou aguarde até que fique ociosa.',
  'chatNotice.sessionAwaitingApprovalElsewhere':
    'Esta sessão de desenvolvimento está aguardando aprovação em outro cliente. Resolva isso lá antes de retomá-la aqui.',
  'chatNotice.sessionArchived':
    'Sessões de desenvolvimento arquivadas são somente leitura. Inicie uma nova sessão para continuar este trabalho.',
  'chatNotice.unverifiedBoundary':
    'Esta sessão de desenvolvimento de uma versão anterior não tem um limite Local, BYOK ou Managed verificado. Inicie uma nova sessão e escolha o provedor novamente; o AGI não a retomará automaticamente.',
  'chatNotice.queuedNotStarted': 'A mensagem de acompanhamento na fila não foi iniciada.',
  'chatNotice.followUpCapacity_one':
    'A fila de mensagens de acompanhamento está cheia ({count} pendente). Tente novamente depois que o turno ativo terminar.',
  'chatNotice.followUpCapacity_many':
    'A fila de mensagens de acompanhamento está cheia ({count} pendentes). Tente novamente depois que o turno ativo terminar.',
  'chatNotice.followUpCapacity_other':
    'A fila de mensagens de acompanhamento está cheia ({count} pendentes). Tente novamente depois que o turno ativo terminar.',
  'chatNotice.steerFailed': 'Não foi possível redirecionar o turno ativo.',
  'chatNotice.openFileForDiff': 'Abra um arquivo no editor para revisar esta sugestão de código.',
  'chatNotice.diffUnavailable':
    'O provedor de comparação não está disponível. Recarregue a extensão.',
  'webview.retry': 'Tentar novamente',
  'webview.details': 'Detalhes',
  'webview.copy': 'Copiar',
  'webview.copyResponse': 'Copiar resposta',
  'webview.copied': 'Copiado',
  'webview.copyFailed': 'Falha ao copiar',
  'webview.goodResponse': 'Resposta boa',
  'webview.badResponse': 'Resposta ruim',
  'webview.removeRating': 'Remover avaliação',
  'webview.failed': 'Falhou',
  'webview.newerDiffReplaced':
    'Uma proposta de alteração mais recente substituiu esta solicitação.',
  'webview.couldNotOpenDiff': 'Não foi possível abrir as alterações propostas.',
  'webview.cloudSessionExpired': 'A sessão do AGI Cloud expirou',
  'webview.localStillAvailable': '· Local e BYOK de provedores continuam disponíveis',
  'webview.signInAgain': 'Entrar novamente',
  'webview.accountNeedsAttention': 'A conta requer atenção',
  'webview.sessionExpired': 'Sessão expirada',
  'webview.tryAgain': 'Tentar novamente',
  'webview.checking': 'Verificando…',
  'webview.openWorkspaceToBegin': 'Abra um espaço de trabalho para começar',
  'webview.restrictedMode': 'O espaço de trabalho está no Modo Restrito',
  'webview.runtimeNeedsSetup': 'O runtime de desenvolvimento precisa ser configurado',
  'webview.openFolderToBegin': 'Abra uma pasta ou espaço de trabalho para começar.',
  'webview.trustWorkspaceFirst':
    'Confie neste espaço de trabalho para que o AGI possa usar arquivos ou ferramentas do projeto.',
  'webview.cliUnavailable': 'O AGI CLI não está disponível.',
  'webview.openFolder': 'Abrir pasta',
  'webview.manageTrust': 'Gerenciar confiança',
  'webview.installCli': 'Instalar o AGI CLI',
  'webview.openSetup': 'Abrir configuração',
  'webview.activity': 'Atividade',
  'webview.starting': 'Iniciando…',
  'webview.completed': 'Concluído',
  'webview.completedWithErrors': 'Concluído com erros',
  'webview.collapseDetails': 'Recolher detalhes',
  'webview.expandDetails': 'Expandir detalhes',
  'webview.lineDelta': '+{added} −{removed} linhas',
  'webview.actions_one': '{count} ação',
  'webview.actions_many': '{count} de ações',
  'webview.actions_other': '{count} ações',
  'webview.errors_one': '{count} erro',
  'webview.errors_many': '{count} de erros',
  'webview.errors_other': '{count} erros',
  'webview.runningCount_one': '{count} em execução',
  'webview.runningCount_many': '{count} em execução',
  'webview.runningCount_other': '{count} em execução',
  'webview.completedCount_one': '{count} concluída',
  'webview.completedCount_many': '{count} concluídas',
  'webview.completedCount_other': '{count} concluídas',
  'webview.linesWritten_one': '{count} linha escrita',
  'webview.linesWritten_many': '{count} de linhas escritas',
  'webview.linesWritten_other': '{count} linhas escritas',
  'diff.confirmWriteInFile_one':
    'AGI Workforce: gravar em disco {count} alteração pendente em {file}?',
  'diff.confirmWriteInFile_many':
    'AGI Workforce: gravar em disco {count} de alterações pendentes em {file}?',
  'diff.confirmWriteInFile_other':
    'AGI Workforce: gravar em disco {count} alterações pendentes em {file}?',
  'diff.confirmWrite_one': 'AGI Workforce: gravar em disco {count} alteração pendente?',
  'diff.confirmWrite_many': 'AGI Workforce: gravar em disco {count} de alterações pendentes?',
  'diff.confirmWrite_other': 'AGI Workforce: gravar em disco {count} alterações pendentes?',
  'diff.confirmDiscardInFile_one':
    'AGI Workforce: descartar {count} alteração pendente em {file} sem gravá-la?',
  'diff.confirmDiscardInFile_many':
    'AGI Workforce: descartar {count} de alterações pendentes em {file} sem gravá-las?',
  'diff.confirmDiscardInFile_other':
    'AGI Workforce: descartar {count} alterações pendentes em {file} sem gravá-las?',
  'diff.confirmDiscard_one': 'AGI Workforce: descartar {count} alteração pendente sem gravá-la?',
  'diff.confirmDiscard_many':
    'AGI Workforce: descartar {count} de alterações pendentes sem gravá-las?',
  'diff.confirmDiscard_other':
    'AGI Workforce: descartar {count} alterações pendentes sem gravá-las?',
  'diff.discardedInFile_one': 'AGI Workforce: {count} alteração pendente descartada em {file}.',
  'diff.discardedInFile_many':
    'AGI Workforce: {count} de alterações pendentes descartadas em {file}.',
  'diff.discardedInFile_other':
    'AGI Workforce: {count} alterações pendentes descartadas em {file}.',
  'diff.discarded_one': 'AGI Workforce: {count} alteração pendente descartada.',
  'diff.discarded_many': 'AGI Workforce: {count} de alterações pendentes descartadas.',
  'diff.discarded_other': 'AGI Workforce: {count} alterações pendentes descartadas.',
  'diff.restoredInFile_one': 'AGI Workforce: {count} alteração pendente restaurada em {file}.',
  'diff.restoredInFile_many':
    'AGI Workforce: {count} de alterações pendentes restauradas em {file}.',
  'diff.restoredInFile_other': 'AGI Workforce: {count} alterações pendentes restauradas em {file}.',
  'diff.restored_one': 'AGI Workforce: {count} alteração pendente restaurada.',
  'diff.restored_many': 'AGI Workforce: {count} de alterações pendentes restauradas.',
  'diff.restored_other': 'AGI Workforce: {count} alterações pendentes restauradas.',
  'diff.moreFiles_one': '• …e mais {count} arquivo',
  'diff.moreFiles_many': '• …e mais {count} de arquivos',
  'diff.moreFiles_other': '• …e mais {count} arquivos',
  'diff.nothingPending': 'AGI Workforce: não há alterações pendentes para revisar.',
  'diff.writeConsequence':
    'Essas edições são aplicadas à sua árvore de trabalho, sem nenhuma revisão prévia.',
  'diff.discardConsequence':
    'As propostas são descartadas. Execute "AGI Workforce: Restore Discarded Changes" para recuperá-las nesta sessão.',
  'diff.writeChanges': 'Gravar alterações',
  'diff.discardChanges': 'Descartar alterações',
  'diff.restoreDiscarded': 'Restaurar descartadas',
  'diff.reviewFirst': 'Revisar primeiro',
  'runtime.reloaded':
    'AGI Workforce: configuração do runtime recarregada. Verificando novamente o runtime de desenvolvimento do espaço de trabalho.',
  'runtime.restarted_one': 'AGI Workforce: runtime local reiniciado em {count} espaço de trabalho.',
  'runtime.restarted_many':
    'AGI Workforce: runtime local reiniciado em {count} de espaços de trabalho.',
  'runtime.restarted_other':
    'AGI Workforce: runtime local reiniciado em {count} espaços de trabalho.',
  'memory.nothingToForget': 'Nenhuma informação na memória para esquecer.',
  'memory.forgetEverything': 'Esquecer tudo',
  'memory.confirmForgetAll_one':
    'Excluir {count} informação da memória da sua conta do AGI Cloud? Ela também desaparecerá do aplicativo web, da CLI e do aplicativo para celular, e isso não pode ser desfeito.',
  'memory.confirmForgetAll_many':
    'Excluir todas as {count} de informações da memória da sua conta do AGI Cloud? Elas também desaparecerão do aplicativo web, da CLI e do aplicativo para celular, e isso não pode ser desfeito.',
  'memory.confirmForgetAll_other':
    'Excluir todas as {count} informações da memória da sua conta do AGI Cloud? Elas também desaparecerão do aplicativo web, da CLI e do aplicativo para celular, e isso não pode ser desfeito.',
  'memory.allForgotten': 'Todas as informações da memória foram excluídas da sua conta.',
  'memory.someKept': 'Algumas informações foram mantidas. {reasons}',
  'project.archived': 'Arquivado',
  'project.files_one': '{count} arquivo',
  'project.files_many': '{count} de arquivos',
  'project.files_other': '{count} arquivos',
  'project.chats_one': '{count} chat',
  'project.chats_many': '{count} de chats',
  'project.chats_other': '{count} chats',
  'project.lastUsed': 'usado pela última vez em {date}',
  'project.deleteEverywhere':
    '"{title}" desaparece do aplicativo web, da CLI, do aplicativo para celular e de todos os outros clientes.',
  'project.deleteKnowledge_one':
    '{count} arquivo de conhecimento é excluído junto com o projeto e não pode ser recuperado.',
  'project.deleteKnowledge_many':
    '{count} de arquivos de conhecimento são excluídos junto com o projeto e não podem ser recuperados.',
  'project.deleteKnowledge_other':
    '{count} arquivos de conhecimento são excluídos junto com o projeto e não podem ser recuperados.',
  'project.keepConversations_one':
    '{count} conversa é mantida, mas sai do projeto e perde as instruções e o conhecimento dele.',
  'project.keepConversations_many':
    '{count} de conversas são mantidas, mas saem do projeto e perdem as instruções e o conhecimento dele.',
  'project.keepConversations_other':
    '{count} conversas são mantidas, mas saem do projeto e perdem as instruções e o conhecimento dele.',
  'billing.credits_one': '{count} crédito',
  'billing.credits_many': '{count} de créditos',
  'billing.credits_other': '{count} créditos',
  'billing.unsettledRequests_one': '{count} solicitação ainda não contabilizada',
  'billing.unsettledRequests_many': '{count} de solicitações ainda não contabilizadas',
  'billing.unsettledRequests_other': '{count} solicitações ainda não contabilizadas',
  'billing.noneYet': 'nenhum ainda',
  'billing.noPublishedRate': 'sem tarifa publicada',
  'billing.withUnsettled': '{credits} ({unsettled})',
  'billing.excludesUnpriced_one': '{credits} (exclui {count} turno sem tarifa publicada)',
  'billing.excludesUnpriced_many': '{credits} (exclui {count} de turnos sem tarifa publicada)',
  'billing.excludesUnpriced_other': '{credits} (exclui {count} turnos sem tarifa publicada)',
  'billing.turnBilled': 'AGI Workforce: este turno custou {credits}',
  'billing.turnBilledSoFar': 'AGI Workforce: até agora, este turno custou {credits}, {unsettled}',
  'schedule.runsSoFar_one': '{count} execução até agora',
  'schedule.runsSoFar_many': '{count} de execuções até agora',
  'schedule.runsSoFar_other': '{count} execuções até agora',
  'composer.problems_one': '{count} problema',
  'composer.problems_many': '{count} de problemas',
  'composer.problems_other': '{count} problemas',
  'review.noIssues': 'AGI Workforce: o código parece bom! Nenhum problema encontrado.',
  'review.issuesFound_one':
    'AGI Workforce: {count} problema encontrado. Verifique o painel Problemas.',
  'review.issuesFound_many':
    'AGI Workforce: {count} de problemas encontrados. Verifique o painel Problemas.',
  'review.issuesFound_other':
    'AGI Workforce: {count} problemas encontrados. Verifique o painel Problemas.',
  'commands.registrationFailed_one':
    'AGI Workforce: falha ao registrar {count} comando ({commands}). Verifique o indicador de integridade dos subsistemas do AGI na barra de status para obter detalhes.',
  'commands.registrationFailed_many':
    'AGI Workforce: falha ao registrar {count} de comandos ({commands}). Verifique o indicador de integridade dos subsistemas do AGI na barra de status para obter detalhes.',
  'commands.registrationFailed_other':
    'AGI Workforce: falha ao registrar {count} comandos ({commands}). Verifique o indicador de integridade dos subsistemas do AGI na barra de status para obter detalhes.',
  'usage.requests_one': '{count} solicitação',
  'usage.requests_many': '{count} de solicitações',
  'usage.requests_other': '{count} solicitações',
  'usage.lastDays_one': 'último dia',
  'usage.lastDays_many': 'últimos {count} de dias',
  'usage.lastDays_other': 'últimos {count} dias',
  'usage.unsettledTurns_one': '{count} turno em processamento, ainda não contabilizado',
  'usage.unsettledTurns_many': '{count} de turnos em processamento, ainda não contabilizados',
  'usage.unsettledTurns_other': '{count} turnos em processamento, ainda não contabilizados',
  'handoff.switchBranch':
    'Mudar este espaço de trabalho para {branch} e correr o risco de perder alterações não confirmadas?',
  'handoff.uncommittedFiles_one':
    '{count} arquivo aqui tem alterações que não estão em nenhum commit. O check-out de {branch} pode descartá-las, e isso não pode ser desfeito.',
  'handoff.uncommittedFiles_many':
    '{count} de arquivos aqui têm alterações que não estão em nenhum commit. O check-out de {branch} pode descartá-las, e isso não pode ser desfeito.',
  'handoff.uncommittedFiles_other':
    '{count} arquivos aqui têm alterações que não estão em nenhum commit. O check-out de {branch} pode descartá-las, e isso não pode ser desfeito.',
  'handoff.andMore_one': 'e mais {count}',
  'handoff.andMore_many': 'e mais {count}',
  'handoff.andMore_other': 'e mais {count}',
  'cloud.repository': 'Repositório: {repository}',
  'cloud.branch': 'Branch: {branch}, conforme enviado por push para {upstream}',
  'cloud.model': 'Modelo: {model}',
  'cloud.network': 'Rede: somente hosts confiáveis, registros de pacotes e hosts de código',
  'cloud.whatMoves': 'O que é transferido: a tarefa que você digitou e o branch enviado por push.',
  'cloud.whatStays':
    'O que fica aqui: a conversa deste chat, as ferramentas e os servidores locais e tudo o que não foi enviado por push.',
  'cloud.unpushedCommits_one':
    '{count} commit em {branch} não foi enviado por push e não estará na nuvem.',
  'cloud.unpushedCommits_many':
    '{count} de commits em {branch} não foram enviados por push e não estarão na nuvem.',
  'cloud.unpushedCommits_other':
    '{count} commits em {branch} não foram enviados por push e não estarão na nuvem.',
  'cloud.uncommittedFiles_one':
    '{count} arquivo tem alterações não confirmadas que não estarão na nuvem.',
  'cloud.uncommittedFiles_many':
    '{count} de arquivos têm alterações não confirmadas que não estarão na nuvem.',
  'cloud.uncommittedFiles_other':
    '{count} arquivos têm alterações não confirmadas que não estarão na nuvem.',
  'cloud.continueQuestion': 'Continuar este trabalho na nuvem em {repository}?',
  'sessionHandoff.protocolUnsupported':
    'Essa sessão usa o protocolo de sessão de desenvolvimento {requested}, e esta extensão usa {supported}. Atualize o AGI para VS Code ou o AGI CLI para que os dois lados usem o mesmo protocolo.',
  'sessionHandoff.wrongDestination':
    'Essa sessão foi entregue ao ambiente {destination}, não a este editor.',
  'sessionHandoff.trustModeUnknown':
    'Essa sessão não informa se estava sendo executada no modo Local, BYOK ou Managed, então este editor não vai continuá-la.',
  'sessionHandoff.issuedAtUnreadable':
    'O registro dessa sessão não informa quando foi emitido, então este editor não consegue saber se ele está atualizado.',
  'sessionHandoff.expired_one':
    'Essa sessão foi transferida há {count} minuto, e os registros expiram após {limit}. Transfira-a novamente pelo AGI CLI.',
  'sessionHandoff.expired_many':
    'Essa sessão foi transferida há {count} de minutos, e os registros expiram após {limit}. Transfira-a novamente pelo AGI CLI.',
  'sessionHandoff.expired_other':
    'Essa sessão foi transferida há {count} minutos, e os registros expiram após {limit}. Transfira-a novamente pelo AGI CLI.',
  'sessionHandoff.expiryLimit_one': '{count} minuto',
  'sessionHandoff.expiryLimit_many': '{count} de minutos',
  'sessionHandoff.expiryLimit_other': '{count} minutos',
  'sessionHandoff.notYetIssued':
    'O registro dessa sessão tem uma data no futuro. Verifique o relógio do computador que o gerou.',
  'sessionHandoff.alreadyAccepted':
    'Este editor já recebeu essa sessão. Abra-a em Sessions em vez de transferi-la duas vezes.',
  'sessionHandoff.wrongAccount':
    'Essa sessão pertence a uma conta do AGI diferente daquela com a qual você entrou neste editor.',
  'sessionHandoff.wrongWorkspace':
    'Essa sessão estava trabalhando em {received}, mas nesta janela está aberto {expected}. Abra essa pasta primeiro.',
  'sessionHandoff.credentialInRecord':
    'O registro dessa sessão contém o que parece ser uma credencial no campo {field}, então este editor o recusou. Reporte-o em vez de repassá-lo.',
  'sessionHandoff.source.cli': 'AGI CLI',
  'sessionHandoff.source.vscode': 'VS Code',
  'sessionHandoff.source.desktop': 'aplicativo para desktop',
  'sessionHandoff.source.unknown': 'outro aplicativo do AGI',
  'sessionHandoff.resource.backgroundShell': 'shell em segundo plano',
  'sessionHandoff.resource.devServer': 'servidor de desenvolvimento',
  'sessionHandoff.resource.mcpServer': 'servidor MCP',
  'sessionHandoff.resource.sandbox': 'sandbox',
  'sessionHandoff.resource.fileWatcher': 'observador de arquivos',
  'sessionHandoff.resource.terminal': 'terminal',
  'sessionHandoff.goal': 'Objetivo: {goal}',
  'sessionHandoff.folder': 'Pasta: {folder}',
  'sessionHandoff.branch': 'Branch: {branch}',
  'sessionHandoff.branchAt': 'Branch: {branch} no commit {commit}',
  'sessionHandoff.runsAs': 'Modo de execução: {trust}',
  'sessionHandoff.uncommittedStays':
    'A pasta tem alterações não confirmadas, que permanecem no disco como estão.',
  'sessionHandoff.movesConversation': 'A conversa, com todo o histórico',
  'sessionHandoff.movesNewSession': 'Uma nova sessão, iniciada a partir dessa conversa',
  'sessionHandoff.changedFiles_one': '{count} arquivo alterado: {files}',
  'sessionHandoff.changedFiles_many': '{count} de arquivos alterados: {files}',
  'sessionHandoff.changedFiles_other': '{count} arquivos alterados: {files}',
  'sessionHandoff.andMore_one': ' e mais {count}',
  'sessionHandoff.andMore_many': ' e mais {count}',
  'sessionHandoff.andMore_other': ' e mais {count}',
  'sessionHandoff.planSteps_one': 'Um plano de {count} etapa',
  'sessionHandoff.planSteps_many': 'Um plano de {count} de etapas',
  'sessionHandoff.planSteps_other': 'Um plano de {count} etapas',
  'sessionHandoff.checksRun_one': '{count} verificação já executada',
  'sessionHandoff.checksRun_many': '{count} de verificações já executadas',
  'sessionHandoff.checksRun_other': '{count} verificações já executadas',
  'sessionHandoff.movesWithIt': 'Itens transferidos com a sessão:',
  'sessionHandoff.reask_one':
    '{count} aprovação pendente será solicitada novamente aqui. Nenhuma resposta anterior é mantida.',
  'sessionHandoff.reask_many':
    '{count} de aprovações pendentes serão solicitadas novamente aqui. Nenhuma resposta anterior é mantida.',
  'sessionHandoff.reask_other':
    '{count} aprovações pendentes serão solicitadas novamente aqui. Nenhuma resposta anterior é mantida.',
  'sessionHandoff.restarted': 'Recursos reiniciados aqui, não transferidos: {resources}.',
  'sessionHandoff.interrupted': 'O último turno foi interrompido e não continua sozinho.',
  'sessionHandoff.continueQuestion': 'Continuar nesta janela a sessão do {source}?',
  'sessionHandoff.startQuestion':
    'Iniciar uma sessão nesta janela a partir da conversa do {source}?',
  'webview.contextUsedUnknownWindow_one':
    'O último turno usou {count} token. A janela de contexto deste modelo não é conhecida aqui.',
  'webview.contextUsedUnknownWindow_many':
    'O último turno usou {count} de tokens. A janela de contexto deste modelo não é conhecida aqui.',
  'webview.contextUsedUnknownWindow_other':
    'O último turno usou {count} tokens. A janela de contexto deste modelo não é conhecida aqui.',
  'webview.contextUsed_one': 'Contexto após o último turno: {used} de {count} token ({percent}%)',
  'webview.contextUsed_many':
    'Contexto após o último turno: {used} de {count} de tokens ({percent}%)',
  'webview.contextUsed_other':
    'Contexto após o último turno: {used} de {count} tokens ({percent}%)',
  'webview.answerTokens_one': '{model} · {count} token ({input} de entrada, {output} de saída)',
  'webview.answerTokens_many':
    '{model} · {count} de tokens ({input} de entrada, {output} de saída)',
  'webview.answerTokens_other': '{model} · {count} tokens ({input} de entrada, {output} de saída)',
  'webview.moreLinesHidden_one': 'Mais {count} linha não exibida',
  'webview.moreLinesHidden_many': 'Mais {count} de linhas não exibidas',
  'webview.moreLinesHidden_other': 'Mais {count} linhas não exibidas',
  'mcp.connected_one': 'AGI Workforce: {name} se conectou em {ms} ms e oferece {count} ferramenta.',
  'mcp.connected_many':
    'AGI Workforce: {name} se conectou em {ms} ms e oferece {count} de ferramentas.',
  'mcp.connected_other':
    'AGI Workforce: {name} se conectou em {ms} ms e oferece {count} ferramentas.',
};

export default pt;
