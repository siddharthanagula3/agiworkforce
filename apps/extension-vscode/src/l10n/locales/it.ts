const it = {
  'applyEdit.prompt': 'AGI Workforce: applicare il risultato di {command}?',
  'applyEdit.applyInline': 'Applica in linea',
  'applyEdit.viewInNewTab': 'Apri in una nuova scheda',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: impossibile applicare automaticamente la modifica, il documento potrebbe essere cambiato.',
  'applyEdit.applyFailed':
    'AGI Workforce: impossibile applicare la modifica, il documento potrebbe essere cambiato.',
  'advancedFeatures.inlineNeedsCredential':
    "I completamenti in linea di AGI Workforce richiedono l'accesso ad AGI Cloud o una chiave API AGI.",
  'advancedFeatures.openAccount': 'Apri account',
  'subsystemHealth.allHealthy': 'AGI Workforce: tutti i sottosistemi sono integri.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} non disponibile',
  'subsystemHealth.manyUnavailable': 'AGI: {count} sottosistemi non disponibili',
  'subsystemHealth.detailsTooltip': 'Fai clic per i dettagli',
  'subsystemHealth.failuresTitle': 'AGI Workforce, Errori dei sottosistemi',
  'subsystemHealth.failuresPlaceholder': 'Errori registrati durante questa sessione',
  'chatError.keyRejected': 'La tua chiave per {provider} è stata rifiutata.',
  'chatError.notCoveredByPlan': 'Secondo {provider}, questa richiesta non è inclusa nel tuo piano.',
  'chatError.rateLimiting':
    '{provider} sta limitando la frequenza delle richieste. Riprova tra poco.',
  'chatError.providerProblem':
    '{provider} ha avuto un problema e non ha potuto rispondere. Riprova.',
  'chatError.providerRejected': '{provider} ha rifiutato la richiesta.',
  'chatError.updateExtension': "Aggiorna l'estensione",
  'chatError.stoppedPartWay': 'La risposta di {provider} si è interrotta a metà.',
  'chatError.toolFailed':
    'Lo strumento {tool} ha restituito un errore, quindi la risposta si è interrotta.',
  'chatError.couldNotReach':
    'Impossibile raggiungere {provider}. Controlla la connessione e riprova.',
  'chatError.theModelProvider': 'il provider del modello',
  'chatError.tooLongForModel':
    'Questa conversazione è più lunga di quanto {model} possa leggere in una volta.',
  'chatError.planRequired': 'La chat cloud richiede il piano {plan}.',
  'chatError.runtimeSettings':
    'Il runtime locale di AGI non è riuscito a leggere le proprie impostazioni.',
  'chatError.noPermission': "AGI non ha l'autorizzazione per questa azione.",
  'chatError.runtimeNotRunning': 'Il runtime locale di AGI non è in esecuzione.',
  'chatError.aboutSeconds_one': 'circa {count} secondo',
  'chatError.aboutSeconds_many': 'circa {count} di secondi',
  'chatError.aboutSeconds_other': 'circa {count} secondi',
  'chatError.aboutMinutes_one': 'circa {count} minuto',
  'chatError.aboutMinutes_many': 'circa {count} di minuti',
  'chatError.aboutMinutes_other': 'circa {count} minuti',
  'chatError.aboutHours_one': 'circa {count} ora',
  'chatError.aboutHours_many': 'circa {count} di ore',
  'chatError.aboutHours_other': 'circa {count} ore',
  'chatError.withReference': '{text} Riferimento: {reference}',
  'chatError.signInToRun': 'Accedi ad AGI per usare questo modello con il tuo piano.',
  'chatError.planExcludesModel': 'Il tuo piano non include questo modello.',
  'chatError.usageLimitWait':
    'Hai raggiunto un limite di utilizzo del tuo account. Sarà di nuovo disponibile tra {wait}.',
  'chatError.usageLimit':
    "Hai raggiunto un limite di utilizzo del tuo account. Controlla l'utilizzo per sapere quando verrà reimpostato.",
  'chatError.noProviderKey':
    'AGI non ha una chiave per {provider} con cui eseguire questa richiesta.',
  'chatError.providerBusyWait':
    'Al momento {provider} riceve troppe richieste. Riprova tra {wait}.',
  'chatError.providerBusy':
    'Al momento {provider} riceve troppe richieste. Riprova tra poco o cambia modello.',
  'chatError.freeAllowanceWait':
    'Il modello gratuito ha esaurito la quota condivisa da tutti gli utenti del piano Free, quindi non si tratta di un limite del tuo account. Riprova tra {wait}.',
  'chatError.freeAllowance':
    'Il modello gratuito ha esaurito la quota condivisa da tutti gli utenti del piano Free, quindi non si tratta di un limite del tuo account. La quota viene reimpostata secondo i tempi del provider.',
  'chatError.providerCouldNotAnswer': 'Impossibile ottenere una risposta da {provider}.',
  'chatError.tooLong':
    'Questa conversazione è più lunga di quanto il modello possa leggere in una volta.',
  'chatError.outputLimit':
    'La risposta ha raggiunto la lunghezza massima di questo modello e si è interrotta. Chiedi una risposta più breve o suddividi la richiesta.',
  'chatError.safety':
    'Il sistema di sicurezza ha interrotto questa risposta. Riformula la richiesta o prova un modello diverso.',
  'chatError.network': 'Questo computer non è riuscito a raggiungere il provider.',
  'chatError.toolDenied':
    "Il turno si è interrotto perché l'esecuzione di uno strumento non è stata consentita.",
  'chatError.interrupted': 'Il turno è stato interrotto.',
  'chatError.timeout': 'Tempo scaduto in attesa della risposta di {provider}.',
  'chatError.invalidRequest': 'AGI ha inviato a {provider} una richiesta che è stata rifiutata.',
  'chatError.generic': 'AGI non è riuscito a completare la risposta.',
  'chatError.theProvider': 'questo provider',
  'chatError.signInToProvider': 'Accedi a {provider}',
  'chatError.signInToAgi': 'Accedi ad AGI',
  'chatError.upgradePlan': 'Aggiorna il tuo piano',
  'chatError.openSettings': 'Apri impostazioni',
  'chatError.switchModel': 'Cambia modello',
  'chatNotice.noEditorForDiagnostics': 'Nessun editor attivo per la diagnostica.',
  'chatNotice.noDiagnostics': 'Nessuna diagnostica trovata nel file attivo.',
  'chatNotice.modelNotOnPlan':
    'Questo modello non è disponibile con il tuo piano attuale o con la configurazione del provider.',
  'chatNotice.trustBeforeResume':
    "Considera attendibile quest'area di lavoro prima di riprendere una sessione di sviluppo.",
  'chatNotice.cloudSessionReadOnly':
    'Questa sessione Code nel cloud si apre qui in sola lettura. Continuala sul web oppure esegui `agi code teleport` per portarla su questo computer.',
  'chatNotice.openOnWeb': 'Apri sul web',
  'conversationTree.cloudLabel': 'Cloud',
  'chatNotice.stopBeforeOpening':
    "Interrompi la risposta corrente prima di aprire un'altra sessione di sviluppo.",
  'chatNotice.historyUnavailable':
    'La cronologia delle sessioni di sviluppo non è disponibile in questa interfaccia di chat.',
  'chatNotice.sessionNotFound': "Sessione di sviluppo non trovata nell'area di lavoro aperta.",
  'chatNotice.differentSession':
    'Il runtime locale ha restituito una sessione di sviluppo diversa.',
  'chatNotice.workspaceMismatch':
    "L'area di lavoro della sessione di sviluppo non corrisponde al runtime locale a cui appartiene.",
  'chatNotice.modelUnavailableForSession':
    'Questa sessione di sviluppo usa il modello "{model}", che non è disponibile nel catalogo dei modelli attuale né nel runtime locale. Seleziona un modello disponibile e avvia una nuova sessione.',
  'chatNotice.resumeFailed': 'Impossibile riprendere la sessione di sviluppo.',
  'chatNotice.approvalFailed': 'Impossibile inviare la risposta di approvazione.',
  'chatNotice.trustBeforeStart':
    "Considera attendibile quest'area di lavoro prima di avviare una sessione di sviluppo.",
  'chatNotice.openWorkspace':
    "Apri una cartella dell'area di lavoro prima di avviare una sessione di sviluppo.",
  'chatNotice.runtimeUnavailable': 'Il runtime locale di AGI non è disponibile.',
  'chatNotice.reopenWorkspace':
    "Riapri l'area di lavoro di questa sessione di sviluppo prima di continuare.",
  'chatNotice.localBoundary':
    'AGI non prosegue una sessione di sviluppo Local con il routing BYOK, Managed Cloud o Auto senza un trasferimento verificato. Usa New Chat per una nuova sessione con il provider oppure crea una continuazione verificata in AGI CLI.',
  'chatNotice.eventOverflow':
    'Il runtime locale ha emesso troppi eventi prima di confermare il turno. AGI ha interrotto il turno per non perderne lo stato di completamento.',
  'chatNotice.overflowNotInterrupted':
    'Impossibile interrompere il turno locale con troppi eventi: {reason}',
  'chatNotice.cancellationFailed': 'Annullamento non riuscito.',
  'chatNotice.runtimeFailed': 'Errore del runtime locale di AGI.',
  'chatNotice.turnFailed': 'Il turno locale della sessione di sviluppo non è riuscito.',
  'chatNotice.sessionRunningElsewhere':
    'Questa sessione di sviluppo è ancora in esecuzione in un altro client. Interrompila lì o attendi che diventi inattiva.',
  'chatNotice.sessionAwaitingApprovalElsewhere':
    "Questa sessione di sviluppo è in attesa di approvazione in un altro client. Gestisci l'approvazione lì prima di riprenderla qui.",
  'chatNotice.sessionArchived':
    'Le sessioni di sviluppo archiviate sono di sola lettura. Avvia una nuova sessione per continuare questo lavoro.',
  'chatNotice.unverifiedBoundary':
    'Questa sessione di sviluppo di una versione precedente non ha un confine Local, BYOK o Managed verificato. Avvia una nuova sessione e scegli di nuovo il provider; AGI non la riprenderà automaticamente.',
  'chatNotice.queuedNotStarted': 'Il messaggio di follow-up in coda non è stato avviato.',
  'chatNotice.followUpCapacity_one':
    'La coda dei messaggi di follow-up è piena ({count} in attesa). Riprova al termine del turno attivo.',
  'chatNotice.followUpCapacity_many':
    'La coda dei messaggi di follow-up è piena ({count} in attesa). Riprova al termine del turno attivo.',
  'chatNotice.followUpCapacity_other':
    'La coda dei messaggi di follow-up è piena ({count} in attesa). Riprova al termine del turno attivo.',
  'chatNotice.steerFailed': 'Impossibile reindirizzare il turno attivo.',
  'chatNotice.openFileForDiff':
    "Apri un file nell'editor per esaminare questo suggerimento di codice.",
  'chatNotice.diffUnavailable':
    "Il provider delle differenze non è disponibile. Ricarica l'estensione.",
  'webview.retry': 'Riprova',
  'webview.details': 'Dettagli',
  'webview.copy': 'Copia',
  'webview.copyResponse': 'Copia risposta',
  'webview.copied': 'Copiato',
  'webview.copyFailed': 'Copia non riuscita',
  'webview.goodResponse': 'Risposta utile',
  'webview.badResponse': 'Risposta non utile',
  'webview.removeRating': 'Rimuovi valutazione',
  'webview.failed': 'Non riuscito',
  'webview.newerDiffReplaced':
    'Questa richiesta è stata sostituita da una proposta di modifiche più recente.',
  'webview.couldNotOpenDiff': 'Impossibile aprire le modifiche proposte.',
  'webview.cloudSessionExpired': 'Sessione AGI Cloud scaduta',
  'webview.localStillAvailable': '· Local e BYOK dei provider restano disponibili',
  'webview.signInAgain': 'Accedi di nuovo',
  'webview.accountNeedsAttention': "L'account richiede attenzione",
  'webview.sessionExpired': 'Sessione scaduta',
  'webview.tryAgain': 'Riprova',
  'webview.checking': 'Verifica in corso…',
  'webview.openWorkspaceToBegin': "Apri un'area di lavoro per iniziare",
  'webview.restrictedMode': "L'area di lavoro è in Modalità con restrizioni",
  'webview.runtimeNeedsSetup': 'Il runtime di sviluppo deve essere configurato',
  'webview.openFolderToBegin': "Apri una cartella o un'area di lavoro per iniziare.",
  'webview.trustWorkspaceFirst':
    "Considera attendibile quest'area di lavoro per consentire ad AGI di usare i file o gli strumenti del progetto.",
  'webview.cliUnavailable': 'AGI CLI non è disponibile.',
  'webview.openFolder': 'Apri cartella',
  'webview.manageTrust': 'Gestisci attendibilità',
  'webview.installCli': 'Installa AGI CLI',
  'webview.openSetup': 'Apri configurazione',
  'webview.activity': 'Attività',
  'webview.starting': 'Avvio in corso…',
  'webview.completed': 'Completato',
  'webview.completedWithErrors': 'Completato con errori',
  'webview.collapseDetails': 'Comprimi dettagli',
  'webview.expandDetails': 'Espandi dettagli',
  'webview.lineDelta': '+{added} −{removed} righe',
  'webview.actions_one': '{count} azione',
  'webview.actions_many': '{count} di azioni',
  'webview.actions_other': '{count} azioni',
  'webview.errors_one': '{count} errore',
  'webview.errors_many': '{count} di errori',
  'webview.errors_other': '{count} errori',
  'webview.runningCount_one': '{count} in esecuzione',
  'webview.runningCount_many': '{count} in esecuzione',
  'webview.runningCount_other': '{count} in esecuzione',
  'webview.completedCount_one': '{count} completata',
  'webview.completedCount_many': '{count} completate',
  'webview.completedCount_other': '{count} completate',
  'webview.linesWritten_one': '{count} riga scritta',
  'webview.linesWritten_many': '{count} di righe scritte',
  'webview.linesWritten_other': '{count} righe scritte',
  'diff.confirmWriteInFile_one':
    'AGI Workforce: scrivere su disco {count} modifica in sospeso in {file}?',
  'diff.confirmWriteInFile_many':
    'AGI Workforce: scrivere su disco {count} di modifiche in sospeso in {file}?',
  'diff.confirmWriteInFile_other':
    'AGI Workforce: scrivere su disco {count} modifiche in sospeso in {file}?',
  'diff.confirmWrite_one': 'AGI Workforce: scrivere su disco {count} modifica in sospeso?',
  'diff.confirmWrite_many': 'AGI Workforce: scrivere su disco {count} di modifiche in sospeso?',
  'diff.confirmWrite_other': 'AGI Workforce: scrivere su disco {count} modifiche in sospeso?',
  'diff.confirmDiscardInFile_one':
    'AGI Workforce: scartare {count} modifica in sospeso in {file} senza scriverla?',
  'diff.confirmDiscardInFile_many':
    'AGI Workforce: scartare {count} di modifiche in sospeso in {file} senza scriverle?',
  'diff.confirmDiscardInFile_other':
    'AGI Workforce: scartare {count} modifiche in sospeso in {file} senza scriverle?',
  'diff.confirmDiscard_one': 'AGI Workforce: scartare {count} modifica in sospeso senza scriverla?',
  'diff.confirmDiscard_many':
    'AGI Workforce: scartare {count} di modifiche in sospeso senza scriverle?',
  'diff.confirmDiscard_other':
    'AGI Workforce: scartare {count} modifiche in sospeso senza scriverle?',
  'diff.discardedInFile_one': 'AGI Workforce: scartata {count} modifica in sospeso in {file}.',
  'diff.discardedInFile_many': 'AGI Workforce: scartate {count} di modifiche in sospeso in {file}.',
  'diff.discardedInFile_other': 'AGI Workforce: scartate {count} modifiche in sospeso in {file}.',
  'diff.discarded_one': 'AGI Workforce: scartata {count} modifica in sospeso.',
  'diff.discarded_many': 'AGI Workforce: scartate {count} di modifiche in sospeso.',
  'diff.discarded_other': 'AGI Workforce: scartate {count} modifiche in sospeso.',
  'diff.restoredInFile_one': 'AGI Workforce: ripristinata {count} modifica in sospeso in {file}.',
  'diff.restoredInFile_many':
    'AGI Workforce: ripristinate {count} di modifiche in sospeso in {file}.',
  'diff.restoredInFile_other':
    'AGI Workforce: ripristinate {count} modifiche in sospeso in {file}.',
  'diff.restored_one': 'AGI Workforce: ripristinata {count} modifica in sospeso.',
  'diff.restored_many': 'AGI Workforce: ripristinate {count} di modifiche in sospeso.',
  'diff.restored_other': 'AGI Workforce: ripristinate {count} modifiche in sospeso.',
  'diff.moreFiles_one': '• …e un altro file',
  'diff.moreFiles_many': '• …e altri {count} di file',
  'diff.moreFiles_other': '• …e altri {count} file',
  'diff.nothingPending': 'AGI Workforce: non ci sono modifiche in sospeso da rivedere.',
  'diff.writeConsequence':
    'Queste modifiche vengono applicate al tuo albero di lavoro, senza ulteriori revisioni.',
  'diff.discardConsequence':
    'Le proposte vengono scartate. Esegui "AGI Workforce: Restore Discarded Changes" per recuperarle in questa sessione.',
  'diff.writeChanges': 'Scrivi modifiche',
  'diff.discardChanges': 'Scarta modifiche',
  'diff.restoreDiscarded': 'Ripristina scartate',
  'diff.reviewFirst': 'Rivedi prima',
  'runtime.reloaded':
    "AGI Workforce: configurazione del runtime ricaricata. Nuova verifica in corso del runtime di sviluppo dell'area di lavoro.",
  'runtime.restarted_one': 'AGI Workforce: runtime locale riavviato in {count} area di lavoro.',
  'runtime.restarted_many': 'AGI Workforce: runtime locale riavviato in {count} di aree di lavoro.',
  'runtime.restarted_other': 'AGI Workforce: runtime locale riavviato in {count} aree di lavoro.',
  'memory.nothingToForget': 'Nessuna informazione in memoria da dimenticare.',
  'memory.forgetEverything': 'Dimentica tutto',
  'memory.confirmForgetAll_one':
    "Eliminare {count} informazione in memoria dal tuo account AGI Cloud? Scomparirà anche dall'app web, dalla CLI e dall'app mobile e l'operazione non può essere annullata.",
  'memory.confirmForgetAll_many':
    "Eliminare tutte le {count} di informazioni in memoria dal tuo account AGI Cloud? Scompariranno anche dall'app web, dalla CLI e dall'app mobile e l'operazione non può essere annullata.",
  'memory.confirmForgetAll_other':
    "Eliminare tutte le {count} informazioni in memoria dal tuo account AGI Cloud? Scompariranno anche dall'app web, dalla CLI e dall'app mobile e l'operazione non può essere annullata.",
  'memory.allForgotten': 'Tutte le informazioni in memoria sono state eliminate dal tuo account.',
  'memory.someKept': 'Alcune informazioni sono state mantenute. {reasons}',
  'project.archived': 'Archiviato',
  'project.files_one': '{count} file',
  'project.files_many': '{count} di file',
  'project.files_other': '{count} file',
  'project.chats_one': '{count} chat',
  'project.chats_many': '{count} di chat',
  'project.chats_other': '{count} chat',
  'project.lastUsed': 'ultimo utilizzo {date}',
  'project.deleteEverywhere':
    '"{title}" scompare dall\'app web, dalla CLI, dall\'app mobile e da ogni altro client.',
  'project.deleteKnowledge_one':
    '{count} file di conoscenza viene eliminato insieme al progetto e non può essere recuperato.',
  'project.deleteKnowledge_many':
    '{count} di file di conoscenza vengono eliminati insieme al progetto e non possono essere recuperati.',
  'project.deleteKnowledge_other':
    '{count} file di conoscenza vengono eliminati insieme al progetto e non possono essere recuperati.',
  'project.keepConversations_one':
    '{count} conversazione viene mantenuta, ma esce dal progetto e ne perde le istruzioni e le conoscenze.',
  'project.keepConversations_many':
    '{count} di conversazioni vengono mantenute, ma escono dal progetto e ne perdono le istruzioni e le conoscenze.',
  'project.keepConversations_other':
    '{count} conversazioni vengono mantenute, ma escono dal progetto e ne perdono le istruzioni e le conoscenze.',
  'billing.credits_one': '{count} credito',
  'billing.credits_many': '{count} di crediti',
  'billing.credits_other': '{count} crediti',
  'billing.unsettledRequests_one': '{count} richiesta non ancora contabilizzata',
  'billing.unsettledRequests_many': '{count} di richieste non ancora contabilizzate',
  'billing.unsettledRequests_other': '{count} richieste non ancora contabilizzate',
  'billing.noneYet': 'ancora nessuno',
  'billing.noPublishedRate': 'nessuna tariffa pubblicata',
  'billing.withUnsettled': '{credits} ({unsettled})',
  'billing.excludesUnpriced_one': '{credits} (escluso {count} turno senza tariffa pubblicata)',
  'billing.excludesUnpriced_many': '{credits} (esclusi {count} di turni senza tariffa pubblicata)',
  'billing.excludesUnpriced_other': '{credits} (esclusi {count} turni senza tariffa pubblicata)',
  'billing.turnBilled': 'AGI Workforce: questo turno è costato {credits}',
  'billing.turnBilledSoFar': 'AGI Workforce: finora questo turno è costato {credits}, {unsettled}',
  'schedule.runsSoFar_one': '{count} esecuzione finora',
  'schedule.runsSoFar_many': '{count} di esecuzioni finora',
  'schedule.runsSoFar_other': '{count} esecuzioni finora',
  'composer.problems_one': '{count} problema',
  'composer.problems_many': '{count} di problemi',
  'composer.problems_other': '{count} problemi',
  'review.noIssues': 'AGI Workforce: il codice sembra a posto! Nessun problema rilevato.',
  'review.issuesFound_one':
    'AGI Workforce: trovato {count} problema. Controlla il pannello Problemi.',
  'review.issuesFound_many':
    'AGI Workforce: trovati {count} di problemi. Controlla il pannello Problemi.',
  'review.issuesFound_other':
    'AGI Workforce: trovati {count} problemi. Controlla il pannello Problemi.',
  'commands.registrationFailed_one':
    "AGI Workforce: registrazione non riuscita per {count} comando ({commands}). Per i dettagli, controlla l'indicatore di integrità dei sottosistemi AGI nella barra di stato.",
  'commands.registrationFailed_many':
    "AGI Workforce: registrazione non riuscita per {count} di comandi ({commands}). Per i dettagli, controlla l'indicatore di integrità dei sottosistemi AGI nella barra di stato.",
  'commands.registrationFailed_other':
    "AGI Workforce: registrazione non riuscita per {count} comandi ({commands}). Per i dettagli, controlla l'indicatore di integrità dei sottosistemi AGI nella barra di stato.",
  'usage.requests_one': '{count} richiesta',
  'usage.requests_many': '{count} di richieste',
  'usage.requests_other': '{count} richieste',
  'usage.lastDays_one': 'ultimo giorno',
  'usage.lastDays_many': 'ultimi {count} di giorni',
  'usage.lastDays_other': 'ultimi {count} giorni',
  'usage.unsettledTurns_one': '{count} turno in fase di contabilizzazione, non ancora conteggiato',
  'usage.unsettledTurns_many':
    '{count} di turni in fase di contabilizzazione, non ancora conteggiati',
  'usage.unsettledTurns_other':
    '{count} turni in fase di contabilizzazione, non ancora conteggiati',
  'handoff.switchBranch':
    "Passare quest'area di lavoro a {branch} rischiando di perdere le modifiche non sottoposte a commit?",
  'handoff.uncommittedFiles_one':
    "{count} file qui contiene modifiche non incluse in alcun commit. Il checkout di {branch} può eliminarle e l'operazione non può essere annullata.",
  'handoff.uncommittedFiles_many':
    "{count} di file qui contengono modifiche non incluse in alcun commit. Il checkout di {branch} può eliminarle e l'operazione non può essere annullata.",
  'handoff.uncommittedFiles_other':
    "{count} file qui contengono modifiche non incluse in alcun commit. Il checkout di {branch} può eliminarle e l'operazione non può essere annullata.",
  'handoff.andMore_one': 'e un altro',
  'handoff.andMore_many': 'e altri {count}',
  'handoff.andMore_other': 'e altri {count}',
  'cloud.repository': 'Repository: {repository}',
  'cloud.branch': 'Ramo: {branch}, come da push su {upstream}',
  'cloud.model': 'Modello: {model}',
  'cloud.network': 'Rete: solo host attendibili, registri di pacchetti e host di codice',
  'cloud.whatMoves':
    "Cosa viene trasferito: l'attività che hai digitato e il ramo di cui è stato eseguito il push.",
  'cloud.whatStays':
    'Cosa resta qui: la conversazione di questa chat, gli strumenti e i server locali e tutto ciò di cui non è stato eseguito il push.',
  'cloud.unpushedCommits_one':
    'Per {count} commit su {branch} non è stato eseguito il push, quindi non sarà nel cloud.',
  'cloud.unpushedCommits_many':
    'Per {count} di commit su {branch} non è stato eseguito il push, quindi non saranno nel cloud.',
  'cloud.unpushedCommits_other':
    'Per {count} commit su {branch} non è stato eseguito il push, quindi non saranno nel cloud.',
  'cloud.uncommittedFiles_one':
    '{count} file contiene modifiche non sottoposte a commit che non saranno nel cloud.',
  'cloud.uncommittedFiles_many':
    '{count} di file contengono modifiche non sottoposte a commit che non saranno nel cloud.',
  'cloud.uncommittedFiles_other':
    '{count} file contengono modifiche non sottoposte a commit che non saranno nel cloud.',
  'cloud.continueQuestion': 'Continuare questo lavoro nel cloud su {repository}?',
  'sessionHandoff.protocolUnsupported':
    'Quella sessione usa il protocollo delle sessioni di sviluppo {requested}, mentre questa estensione usa {supported}. Aggiorna AGI per VS Code o AGI CLI in modo che entrambi usino lo stesso protocollo.',
  'sessionHandoff.wrongDestination':
    "Quella sessione è stata trasferita all'ambiente {destination}, non a questo editor.",
  'sessionHandoff.trustModeUnknown':
    'Quella sessione non indica se era in esecuzione in modalità Local, BYOK o Managed, quindi questo editor non la continuerà.',
  'sessionHandoff.issuedAtUnreadable':
    'Il record di quella sessione non indica quando è stato emesso, quindi questo editor non può stabilire se è aggiornato.',
  'sessionHandoff.expired_one':
    'Quella sessione è stata trasferita {count} minuto fa e i record scadono dopo {limit}. Trasferiscila di nuovo da AGI CLI.',
  'sessionHandoff.expired_many':
    'Quella sessione è stata trasferita {count} di minuti fa e i record scadono dopo {limit}. Trasferiscila di nuovo da AGI CLI.',
  'sessionHandoff.expired_other':
    'Quella sessione è stata trasferita {count} minuti fa e i record scadono dopo {limit}. Trasferiscila di nuovo da AGI CLI.',
  'sessionHandoff.expiryLimit_one': '{count} minuto',
  'sessionHandoff.expiryLimit_many': '{count} di minuti',
  'sessionHandoff.expiryLimit_other': '{count} minuti',
  'sessionHandoff.notYetIssued':
    "Il record di quella sessione ha una data futura. Controlla l'orologio del computer che l'ha generato.",
  'sessionHandoff.alreadyAccepted':
    'Questo editor ha già preso in carico quella sessione. Aprila da Sessions invece di trasferirla una seconda volta.',
  'sessionHandoff.wrongAccount':
    "Quella sessione appartiene a un account AGI diverso da quello con cui è stato eseguito l'accesso in questo editor.",
  'sessionHandoff.wrongWorkspace':
    'Quella sessione lavorava in {received}, mentre in questa finestra è aperto {expected}. Apri prima quella cartella.',
  'sessionHandoff.credentialInRecord':
    "Il record di quella sessione contiene quella che sembra una credenziale nel campo {field}, quindi questo editor l'ha rifiutato. Segnalalo invece di inoltrarlo.",
  'sessionHandoff.source.cli': 'AGI CLI',
  'sessionHandoff.source.vscode': 'VS Code',
  'sessionHandoff.source.desktop': "l'app desktop",
  'sessionHandoff.source.unknown': "un'altra app AGI",
  'sessionHandoff.resource.backgroundShell': 'shell in background',
  'sessionHandoff.resource.devServer': 'server di sviluppo',
  'sessionHandoff.resource.mcpServer': 'server MCP',
  'sessionHandoff.resource.sandbox': 'sandbox',
  'sessionHandoff.resource.fileWatcher': 'watcher dei file',
  'sessionHandoff.resource.terminal': 'terminale',
  'sessionHandoff.goal': 'Obiettivo: {goal}',
  'sessionHandoff.folder': 'Cartella: {folder}',
  'sessionHandoff.branch': 'Ramo: {branch}',
  'sessionHandoff.branchAt': 'Ramo: {branch} al commit {commit}',
  'sessionHandoff.runsAs': 'Modalità di esecuzione: {trust}',
  'sessionHandoff.uncommittedStays':
    'La cartella contiene modifiche non sottoposte a commit, che restano su disco così come sono.',
  'sessionHandoff.movesConversation': 'La conversazione, con la cronologia completa',
  'sessionHandoff.movesNewSession': 'Una nuova sessione, avviata da quel thread',
  'sessionHandoff.changedFiles_one': '{count} file modificato: {files}',
  'sessionHandoff.changedFiles_many': '{count} di file modificati: {files}',
  'sessionHandoff.changedFiles_other': '{count} file modificati: {files}',
  'sessionHandoff.andMore_one': ' e un altro',
  'sessionHandoff.andMore_many': ' e altri {count}',
  'sessionHandoff.andMore_other': ' e altri {count}',
  'sessionHandoff.planSteps_one': 'Un piano di {count} passaggio',
  'sessionHandoff.planSteps_many': 'Un piano di {count} di passaggi',
  'sessionHandoff.planSteps_other': 'Un piano di {count} passaggi',
  'sessionHandoff.checksRun_one': '{count} controllo già eseguito',
  'sessionHandoff.checksRun_many': '{count} di controlli già eseguiti',
  'sessionHandoff.checksRun_other': '{count} controlli già eseguiti',
  'sessionHandoff.movesWithIt': 'Elementi trasferiti con la sessione:',
  'sessionHandoff.reask_one':
    '{count} approvazione in sospeso verrà richiesta di nuovo qui. Nessuna risposta precedente viene mantenuta.',
  'sessionHandoff.reask_many':
    '{count} di approvazioni in sospeso verranno richieste di nuovo qui. Nessuna risposta precedente viene mantenuta.',
  'sessionHandoff.reask_other':
    '{count} approvazioni in sospeso verranno richieste di nuovo qui. Nessuna risposta precedente viene mantenuta.',
  'sessionHandoff.restarted': 'Risorse riavviate qui, non trasferite: {resources}.',
  'sessionHandoff.interrupted': "L'ultimo turno è stato interrotto e non riprenderà da solo.",
  'sessionHandoff.continueQuestion':
    'Continuare in questa finestra la sessione avviata con {source}?',
  'sessionHandoff.startQuestion':
    'Avviare in questa finestra una sessione dal thread aperto con {source}?',
  'webview.contextUsedUnknownWindow_one':
    "L'ultimo turno ha usato {count} token. La finestra di contesto di questo modello non è nota qui.",
  'webview.contextUsedUnknownWindow_many':
    "L'ultimo turno ha usato {count} di token. La finestra di contesto di questo modello non è nota qui.",
  'webview.contextUsedUnknownWindow_other':
    "L'ultimo turno ha usato {count} token. La finestra di contesto di questo modello non è nota qui.",
  'webview.contextUsed_one': "Contesto dopo l'ultimo turno: {used} su {count} token ({percent}%)",
  'webview.contextUsed_many':
    "Contesto dopo l'ultimo turno: {used} su {count} di token ({percent}%)",
  'webview.contextUsed_other': "Contesto dopo l'ultimo turno: {used} su {count} token ({percent}%)",
  'webview.answerTokens_one': '{model} · {count} token ({input} in ingresso, {output} in uscita)',
  'webview.answerTokens_many':
    '{model} · {count} di token ({input} in ingresso, {output} in uscita)',
  'webview.answerTokens_other': '{model} · {count} token ({input} in ingresso, {output} in uscita)',
  'webview.moreLinesHidden_one': '{count} riga in più non mostrata',
  'webview.moreLinesHidden_many': '{count} di righe in più non mostrate',
  'webview.moreLinesHidden_other': '{count} righe in più non mostrate',
  'mcp.connected_one': 'AGI Workforce: {name} si è connesso in {ms} ms e offre {count} strumento.',
  'mcp.connected_many':
    'AGI Workforce: {name} si è connesso in {ms} ms e offre {count} di strumenti.',
  'mcp.connected_other':
    'AGI Workforce: {name} si è connesso in {ms} ms e offre {count} strumenti.',
  'checkpoints.trackedFiles_one': '{count} file tracciato',
  'checkpoints.trackedFiles_many': '{count} di file tracciati',
  'checkpoints.trackedFiles_other': '{count} file tracciati',
  'checkpoints.skippedFiles_one': 'AGI Workforce: impossibile ripristinare {count} file: {files}',
  'checkpoints.skippedFiles_many':
    'AGI Workforce: impossibile ripristinare {count} di file: {files}',
  'checkpoints.skippedFiles_other': 'AGI Workforce: impossibile ripristinare {count} file: {files}',
  'checkpoints.filesRestored_one': 'AGI Workforce: {count} file è tornato al checkpoint.',
  'checkpoints.filesRestored_many': 'AGI Workforce: {count} di file sono tornati al checkpoint.',
  'checkpoints.filesRestored_other': 'AGI Workforce: {count} file sono tornati al checkpoint.',
  'webview.sources_one': '{count} fonte',
  'webview.sources_many': '{count} di fonti',
  'webview.sources_other': '{count} fonti',
  'sessionSync.continuedIn':
    'Questa sessione è proseguita in {client}. Qui vedi i suoi messaggi più recenti.',
  'sessionSync.continuedElsewhere':
    "Questa sessione è proseguita in un'altra app. Qui vedi i suoi messaggi più recenti.",
  'sessionSync.heldBy': '{client} sta usando questa sessione.',
  'sessionSync.takeOverDetail':
    'Prendine il controllo per inviare il messaggio da qui. Se {client} sta ancora rispondendo, fermalo prima lì: due app che scrivono insieme lasciano due copie della sessione.',
  'sessionSync.takeOver': 'Prendi il controllo e invia',
  'sessionSync.notSent':
    'Non inviato: {client} sta usando questa sessione. Invia di nuovo per prenderne il controllo da qui.',
  'sessionSync.takeOverFailed':
    'Impossibile prendere il controllo di questa sessione. Invia di nuovo per riprovare.',
  'sessionSync.stopBeforeTerminal':
    'Interrompi la risposta in corso prima di continuare questa sessione nel terminale.',
  'remote.title': 'Controllo remoto',
  'remote.intro':
    'Abbina il telefono per seguire le sessioni AGI nelle cartelle di questa finestra: approva i passaggi, leggi diff, risultati dei test e nuovi file, e guida il turno successivo.',
  'remote.howToPair':
    "Apri l'app AGI Workforce sul telefono, scegli «Pair with Desktop» e scansiona questo codice. Il codice funziona una sola volta e scade dopo pochi minuti.",
  'remote.qrLabel': 'Codice QR di abbinamento',
  'remote.pairingCode': 'Codice di abbinamento',
  'remote.copyLink': 'Copia link di abbinamento',
  'remote.linkCopied':
    "AGI Workforce: link di abbinamento copiato. Incollalo nell'app AGI Workforce sul telefono.",
  'remote.noPairing':
    'AGI Workforce: nessun abbinamento in attesa. Avvia il controllo remoto per ottenere un nuovo codice.',
  'remote.connected': 'Connesso: {phone}.',
  'remote.yourPhone': 'il tuo telefono',
  'remote.reconnecting':
    'Connessione persa. Riconnessione in corso perché il telefono riprenda da dove si era fermato.',
  'remote.pair': 'Abbina un telefono',
  'remote.pairAgain': 'Abbina di nuovo',
  'remote.cancelPairing': 'Annulla abbinamento',
  'remote.disconnect': 'Disconnetti telefono',
  'remote.stop': 'Interrompi controllo remoto',
  'remote.disconnectTitle': 'Disconnettere {phone}?',
  'remote.disconnectConsequence':
    'Il telefono viene disconnesso da questa finestra e non può più seguire né guidare le sue sessioni. Per ricollegarlo, abbinalo con un nuovo codice.',
  'remote.starting': 'Avvio del controllo remoto',
  'remote.startFailed': 'AGI Workforce: impossibile avviare il controllo remoto. {reason}',
  'remote.pairFailed': "Impossibile avviare l'abbinamento.",
  'remote.signInFirst':
    'AGI Workforce: accedi prima. Il controllo remoto abbina il telefono tramite il tuo account.',
  'remote.trustFirst':
    'AGI Workforce: considera attendibile questa area di lavoro prima che un telefono possa eseguirvi sessioni.',
  'remote.openFolderFirst':
    'AGI Workforce: apri prima una cartella. Il controllo remoto esegue le sessioni nelle cartelle di questa finestra.',
  'remote.folderClosed': 'Quella cartella non è più aperta in questa finestra.',
  'remote.runtimeUnavailable':
    'La CLI di AGI non è riuscita a elencare le sessioni di questa cartella.',
  'remote.runtimeHint':
    "Verifica che la CLI di AGI sia installata e con l'accesso effettuato, poi aggiorna l'elenco sul telefono.",
  'remote.deviceName': '{host} (VS Code)',
  'remote.statusWaiting': 'Controllo remoto: in attesa del telefono',
  'remote.statusConnected': 'Controllo remoto: {phone}',
  'remote.statusReconnecting': 'Controllo remoto: riconnessione',
  'remote.statusError': 'Controllo remoto: interrotto',
  'remote.statusTooltip': 'Mostra controllo remoto',
  'remote.attached_one': '{count} sessione aperta sul telefono.',
  'remote.attached_many': '{count} di sessioni aperte sul telefono.',
  'remote.attached_other': '{count} sessioni aperte sul telefono.',
  'sessionSearch.title': 'Cronologia delle sessioni',
  'sessionSearch.placeholder': 'Cerca le sessioni per titolo o testo dei messaggi',
  'sessionSearch.folderFailed':
    'AGI Workforce: la CLI di AGI non è riuscita a leggere le sessioni in {folder}. {reason}',
  'archived.title': 'Sessioni archiviate',
  'archived.placeholder': 'Seleziona una sessione per ripristinarla e aprirla',
  'archived.none': 'AGI Workforce: non ci sono sessioni archiviate in questa area di lavoro.',
  'archived.restore': 'Ripristina',
  'archived.delete': 'Elimina definitivamente',
  'archived.deleteTitle': 'Eliminare definitivamente «{title}»?',
  'archived.deleteDetail':
    'La sua trascrizione e le approvazioni e le modifiche ai file registrate con essa vengono rimosse da questo computer per tutte le superfici di AGI. Questa operazione non può essere annullata.',
  'archived.restored': 'AGI Workforce: «{title}» è di nuovo tra le tue sessioni.',
  'archived.open': 'Apri',
  'archived.deleted': 'AGI Workforce: «{title}» è stata eliminata.',
  'archived.notFound': 'AGI Workforce: quella sessione non è più in questa area di lavoro.',
  'archived.actionFailed': 'AGI Workforce: {reason}',
  'webview.searchingSessions': 'Ricerca delle sessioni…',
  'webview.noMatchingSessions': 'Nessuna sessione corrisponde a «{query}»',
  'webview.archivedSessions': 'Sessioni archiviate',
  'messageActions.resendTitle': 'Inviare di nuovo questo messaggio?',
  'messageActions.resendDetail':
    'La risposta a questo messaggio e tutto ciò che segue vengono rimossi da questa sessione, poi il messaggio viene inviato di nuovo. I file non cambiano.',
  'messageActions.resend': 'Invia di nuovo',
  'messageActions.stopFirst': 'AGI Workforce: interrompi prima la risposta in corso.',
  'messageActions.notFound':
    'AGI Workforce: quel messaggio non è più in questa sessione. Riapri la sessione e riprova.',
  'messageActions.needsUpdate':
    'AGI Workforce: aggiorna la CLI di AGI per inviare di nuovo un messaggio o creare un ramo da esso.',
  'messageActions.branchTitle': '{title} (ramo)',
  'messageActions.failed': 'AGI Workforce: {reason}',
  'webview.resendMessage': 'Invia di nuovo',
  'webview.resendMessageLabel': 'Invia di nuovo questo messaggio',
  'webview.branchFromMessage': 'Crea ramo',
  'plan.needsUpdate':
    'AGI Workforce: aggiorna la AGI CLI per approvare o rivedere un piano da VS Code.',
  'plan.approvedMessage': 'Procedi con il piano.',
  'plan.revisedMessage': 'Rivedi il piano: {feedback}',
  'webview.approvePlan': 'Approva il piano',
  'webview.revisePlan': 'Rivedi',
  'webview.revisePlanPlaceholder': 'Cosa dovrebbe cambiare nel piano?',
  'webview.sendRevision': 'Invia',
  'webview.cancelRevision': 'Annulla',
  'webview.branchFromAnswer': 'Crea ramo da qui',
  'webview.branchFromAnswerLabel':
    'Avvia una nuova sessione che mantiene la conversazione fino a questa risposta',
  'webview.branchFromMessageLabel':
    'Avvia una nuova sessione da qui con questo messaggio pronto da modificare',
  'localServers.running_one': '{provider} è in esecuzione · {count} modello',
  'localServers.running_many': '{provider} è in esecuzione · {count} di modelli',
  'localServers.running_other': '{provider} è in esecuzione · {count} modelli',
  'localServers.runningEmpty': '{provider} è in esecuzione senza modelli caricati',
  'localServers.notRunning': '{provider} non è in esecuzione. Avvialo per usarne i modelli.',
  'localServers.unhealthy': '{provider} non risponde: {reason}',
  'localServers.blocked': '{provider} è bloccato: {reason}',
  'localServers.noReason': 'nessun motivo indicato',
  'cloudSteer.action': "Scrivi all'agente",
  'cloudSteer.actionDescription': 'Aggiungi istruzioni o cambia direzione',
  'cloudSteer.prompt': 'Legge il tuo messaggio al passaggio successivo e mantiene i progressi.',
  'cloudSteer.sent': "In coda. L'agente lo leggerà al passaggio successivo.",
  'cloudSteer.queued': "In coda. L'agente lo leggerà al passaggio successivo.",
  'cloudSteer.unread': "L'attività si è fermata prima che l'agente leggesse questo messaggio.",
  'cloudSteer.delivered': "Il tuo messaggio, letto dall'agente",
  'cloudSteer.waitingSection': 'I tuoi messaggi',
  'cloudSteer.failed': 'non è stato possibile inviare il tuo messaggio',
  'cloudSteer.tooLong': 'Un messaggio può contenere al massimo {count} caratteri.',
  'savedApprovals.title': 'Approvazioni salvate',
  'savedApprovals.placeholder': 'Regole che la CLI di AGI applica in ogni sessione',
  'savedApprovals.empty':
    "Nessuna approvazione salvata finora. Scegli Consenti sempre su un'approvazione per salvarne una.",
  'savedApprovals.allowed': 'Sempre consentito',
  'savedApprovals.denied': 'Sempre negato',
  'savedApprovals.kindCommand': 'Comando shell',
  'savedApprovals.kindFile': 'Modifica di file',
  'savedApprovals.kindPolicy': 'Regola di criterio dei comandi',
  'savedApprovals.removeTitle': 'Rimuovere questa approvazione salvata?',
  'savedApprovals.removeAllowed':
    'AGI chiederà di nuovo la prossima volta che vorrà fare questo: {label}',
  'savedApprovals.removeDenied':
    'AGI potrà chiedere di nuovo di fare questo invece di essere rifiutato: {label}',
  'pullRequest.titlePrompt': 'Titolo della pull request',
  'pullRequest.basePrompt': 'Branch in cui unire',
  'pullRequest.confirmPush':
    'Inviare {count} commit da {branch} a {remote} e aprire una pull request verso {base}?',
  'pullRequest.confirmOpen': 'Aprire una pull request da {branch} verso {base}?',
  'pullRequest.confirmAction': 'Invia e apri',
  'pullRequest.openAction': 'Apri pull request',
  'pullRequest.created': 'AGI Workforce: pull request aperta.',
  'pullRequest.finishOnGitHub': 'AGI Workforce: {note}.',
  'pullRequest.view': 'Visualizza',
  'pullRequest.blocked': 'AGI Workforce: impossibile aprire una pull request: {reason}.',
  'pullRequest.failed': 'AGI Workforce: {reason}',
  'savedApprovals.noun': 'approvazioni salvate',
  'webview.alwaysAllow': 'Consenti sempre',
  'webview.alwaysAllowHint':
    'Salva una regola così AGI smette di chiederlo in ogni sessione. Gestiscila in Approvazioni salvate.',
  'webview.alwaysAllowedOutcome': 'Sempre consentito. AGI non lo chiederà più.',
  'mcpDetails.action': 'Dettagli del server',
  'mcpDetails.checking': 'AGI Workforce: verifica di {name}',
  'mcpDetails.documentTitle': 'Server MCP {name}',
  'mcpDetails.health': 'Stato',
  'mcpDetails.responding': 'Risponde',
  'mcpDetails.notResponding': 'Connesso, ma non ha risposto a un ping',
  'mcpDetails.notConnected': 'Connessione non riuscita',
  'mcpDetails.connection': 'Connessione',
  'mcpDetails.live': 'Attiva, in una sessione in corso',
  'mcpDetails.probe': 'Avviato per questa verifica, poi arrestato',
  'mcpDetails.protocol': 'Protocollo',
  'mcpDetails.server': 'Server',
  'mcpDetails.notReported': 'Non indicato',
  'mcpDetails.capabilities': 'Funzionalità',
  'mcpDetails.noCapabilities': 'Nessuna dichiarata',
  'mcpDetails.error': 'Errore',
  'mcpDetails.checkedAt': 'Verificato: {time}',
  'mcpDetails.instructions': 'Istruzioni',
  'mcpDetails.output': 'Output recente',
  'mcpDetails.noOutput': 'Questo server non ha ancora prodotto output.',
  'mcpDetails.expired':
    'Questi dettagli non sono più disponibili. Esegui AGI Workforce: Show MCP Servers e scegli Dettagli del server per verificare di nuovo {name}.',
  'mcpDetails.field': '{label}: {value}',
  'chatNotice.webSearchDenied':
    'La ricerca web non è disponibile in questa sessione. {reason} Disattiva Browse the web per inviare senza.',
  'webSearchSetup.title': 'Configura la ricerca web',
  'webSearchSetup.placeholder': 'Scegli il servizio di ricerca di cui hai una chiave API',
  'webSearchSetup.detail':
    'Inserisci la sua chiave API nel terminale. Le sessioni con la tua chiave e quelle locali la usano per cercare; le sessioni gestite non ne hanno bisogno.',
  'webSearchSetup.unavailable':
    "AGI Workforce: questa AGI CLI non indica quali chiavi di ricerca può salvare. Aggiorna l'AGI CLI per configurare la ricerca web da VS Code.",
  'pluginUpdate.action': 'Aggiorna',
  'pluginUpdate.progress': 'AGI Workforce: aggiornamento di {name}',
  'pluginUpdate.upToDate': 'AGI Workforce: {name} è già aggiornato.',
  'pluginUpdate.updated': 'AGI Workforce: {name} è stato aggiornato.',
  'pluginUpdate.updatedTo': 'AGI Workforce: {name} è stato aggiornato a {to}.',
  'pluginUpdate.updatedFromTo': 'AGI Workforce: {name} è stato aggiornato da {from} a {to}.',
  'chatError.usageLimitResetsAt':
    'Hai raggiunto un limite di utilizzo del tuo account. Si azzera il {time}.',
  'chatError.continueWith': 'Continua con {model}',
  'chatError.addCredits': 'Aggiungi crediti',
  'chatError.comparePlans': 'Confronta i piani',
  'chatError.seeUsage': 'Vedi il tuo utilizzo',
  'chatError.seeOptions': 'Vedi le opzioni',
  'webview.mcpAuthRequired':
    '{server} richiede un nuovo accesso. AGI non ha potuto usarlo per questo passaggio.',
  'webview.mcpReconnect': 'Accedi e continua',
  'webview.mcpReconnecting': 'Accesso in corso…',
  'webview.mcpReconnected': 'Accesso a {server} eseguito. AGI continua.',
  'mcpReconnect.progress': 'AGI Workforce: accesso a {server}',
  'mcpReconnect.notFinished':
    "AGI Workforce: l'accesso a {server} non è stato completato, quindi AGI non ha continuato. Riprova quando sei pronto.",
  'mcpReconnect.failed': 'AGI Workforce: accesso a {server} non riuscito: {reason}',
  'mcpReconnect.noSession':
    "AGI Workforce: qui non c'è una sessione da continuare dopo l'accesso a {server}.",
  'mcpReconnect.continue': 'continua',
};

export default it;
