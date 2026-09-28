const es = {
  'applyEdit.prompt': 'AGI Workforce: ¿Aplicar el resultado de {command}?',
  'applyEdit.applyInline': 'Aplicar en línea',
  'applyEdit.viewInNewTab': 'Ver en una pestaña nueva',
  'applyEdit.autoApplyFailed':
    'AGI Workforce: No se pudo aplicar la edición automáticamente, puede que el documento haya cambiado.',
  'applyEdit.applyFailed':
    'AGI Workforce: No se pudo aplicar la edición, puede que el documento haya cambiado.',
  'advancedFeatures.inlineNeedsCredential':
    'Las completaciones en línea de AGI Workforce requieren iniciar sesión en AGI Cloud o una clave de API de AGI.',
  'advancedFeatures.openAccount': 'Abrir cuenta',
  'subsystemHealth.allHealthy': 'AGI Workforce: todos los subsistemas están correctos.',
  'subsystemHealth.oneUnavailable': 'AGI: {subsystem} no disponible',
  'subsystemHealth.manyUnavailable': 'AGI: {count} subsistemas no disponibles',
  'subsystemHealth.detailsTooltip': 'Haga clic para ver los detalles',
  'subsystemHealth.failuresTitle': 'AGI Workforce, Fallos de subsistemas',
  'subsystemHealth.failuresPlaceholder': 'Fallos registrados durante esta sesión',
  'chatError.keyRejected': 'Se rechazó la clave de {provider}.',
  'chatError.notCoveredByPlan': '{provider} indica que esta solicitud no está incluida en su plan.',
  'chatError.rateLimiting':
    '{provider} está limitando la frecuencia de las solicitudes. Vuelva a intentarlo en un momento.',
  'chatError.providerProblem':
    '{provider} tuvo un problema y no pudo responder. Vuelva a intentarlo.',
  'chatError.providerRejected': '{provider} rechazó la solicitud.',
  'chatError.updateExtension': 'Actualizar la extensión',
  'chatError.stoppedPartWay': 'La respuesta de {provider} se interrumpió a mitad de camino.',
  'chatError.toolFailed': 'La herramienta {tool} falló, así que la respuesta se detuvo.',
  'chatError.couldNotReach':
    'No se pudo conectar con {provider}. Compruebe la conexión y vuelva a intentarlo.',
  'chatError.theModelProvider': 'el proveedor del modelo',
  'chatError.tooLongForModel':
    'Esta conversación es más larga de lo que {model} puede leer de una vez.',
  'chatError.planRequired': 'El chat en la nube requiere el plan {plan}.',
  'chatError.runtimeSettings':
    'El entorno de ejecución local de AGI no pudo leer su configuración.',
  'chatError.noPermission': 'AGI no tiene permiso para realizar esa acción.',
  'chatError.runtimeNotRunning': 'El entorno de ejecución local de AGI no se está ejecutando.',
  'chatError.aboutSeconds_one': 'aproximadamente {count} segundo',
  'chatError.aboutSeconds_many': 'unos {count} de segundos',
  'chatError.aboutSeconds_other': 'unos {count} segundos',
  'chatError.aboutMinutes_one': 'aproximadamente {count} minuto',
  'chatError.aboutMinutes_many': 'unos {count} de minutos',
  'chatError.aboutMinutes_other': 'unos {count} minutos',
  'chatError.aboutHours_one': 'aproximadamente {count} hora',
  'chatError.aboutHours_many': 'aproximadamente {count} de horas',
  'chatError.aboutHours_other': 'unas {count} horas',
  'chatError.withReference': '{text} Referencia: {reference}',
  'chatError.signInToRun': 'Inicie sesión en AGI para ejecutar este modelo con su plan.',
  'chatError.planExcludesModel': 'Su plan no incluye este modelo.',
  'chatError.usageLimitWait':
    'Ha alcanzado un límite de uso de su cuenta. El acceso se restablecerá en {wait}.',
  'chatError.usageLimit':
    'Ha alcanzado un límite de uso de su cuenta. Consulte su uso para ver cuándo se restablece.',
  'chatError.noProviderKey': 'AGI no tiene ninguna clave de {provider} para ejecutar esto.',
  'chatError.providerBusyWait':
    'En este momento, {provider} recibe demasiadas solicitudes. Vuelva a intentarlo en {wait}.',
  'chatError.providerBusy':
    'En este momento, {provider} recibe demasiadas solicitudes. Vuelva a intentarlo en un momento o cambie de modelo.',
  'chatError.freeAllowanceWait':
    'El modelo gratuito agotó la cuota que comparten todas las cuentas del plan Free, así que no se trata de un límite de su cuenta. Vuelva a intentarlo en {wait}.',
  'chatError.freeAllowance':
    'El modelo gratuito agotó la cuota que comparten todas las cuentas del plan Free, así que no se trata de un límite de su cuenta. Se restablece según el calendario del proveedor.',
  'chatError.providerCouldNotAnswer': 'No se pudo obtener una respuesta de {provider}.',
  'chatError.tooLong': 'Esta conversación es más larga de lo que el modelo puede leer de una vez.',
  'chatError.outputLimit':
    'La respuesta alcanzó la longitud máxima de este modelo y se detuvo ahí. Pida una respuesta más corta o divida la solicitud.',
  'chatError.safety':
    'El sistema de seguridad detuvo esta respuesta. Reformule la solicitud o pruebe con otro modelo.',
  'chatError.network': 'Esta máquina no pudo conectarse con el proveedor.',
  'chatError.toolDenied': 'El turno se detuvo porque no se permitió ejecutar una herramienta.',
  'chatError.interrupted': 'Se detuvo el turno.',
  'chatError.timeout': 'La respuesta de {provider} tardó demasiado.',
  'chatError.invalidRequest': 'AGI envió a {provider} una solicitud que fue rechazada.',
  'chatError.generic': 'AGI no pudo terminar la respuesta.',
  'chatError.theProvider': 'su proveedor',
  'chatError.signInToProvider': 'Iniciar sesión en {provider}',
  'chatError.signInToAgi': 'Iniciar sesión en AGI',
  'chatError.upgradePlan': 'Actualizar el plan',
  'chatError.openSettings': 'Abrir configuración',
  'chatError.switchModel': 'Cambiar de modelo',
  'chatNotice.noEditorForDiagnostics': 'No hay ningún editor activo para los diagnósticos.',
  'chatNotice.noDiagnostics': 'No se encontraron diagnósticos en el archivo activo.',
  'chatNotice.modelNotOnPlan':
    'Este modelo no está disponible con su plan actual o la configuración de su proveedor.',
  'chatNotice.trustBeforeResume':
    'Confíe en esta área de trabajo antes de reanudar una sesión de desarrollo.',
  'chatNotice.stopBeforeOpening':
    'Detenga la respuesta actual antes de abrir otra sesión de desarrollo.',
  'chatNotice.historyUnavailable':
    'El historial de sesiones de desarrollo no está disponible en esta interfaz de chat.',
  'chatNotice.sessionNotFound':
    'No se encontró la sesión de desarrollo en el área de trabajo abierta.',
  'chatNotice.differentSession':
    'El entorno de ejecución local devolvió una sesión de desarrollo distinta.',
  'chatNotice.workspaceMismatch':
    'El área de trabajo de la sesión de desarrollo no coincide con el entorno de ejecución local al que pertenece.',
  'chatNotice.modelUnavailableForSession':
    'Esta sesión de desarrollo usa el modelo "{model}", que no está disponible en el catálogo de modelos actual ni en el entorno de ejecución local. Seleccione un modelo disponible y, después, inicie una nueva sesión.',
  'chatNotice.resumeFailed': 'No se pudo reanudar la sesión de desarrollo.',
  'chatNotice.approvalFailed': 'Error en la respuesta de aprobación.',
  'chatNotice.trustBeforeStart':
    'Confíe en esta área de trabajo antes de iniciar una sesión de desarrollo.',
  'chatNotice.openWorkspace':
    'Abra una carpeta del área de trabajo antes de iniciar una sesión de desarrollo.',
  'chatNotice.runtimeUnavailable': 'El entorno de ejecución local de AGI no está disponible.',
  'chatNotice.reopenWorkspace':
    'Vuelva a abrir el área de trabajo de esta sesión de desarrollo antes de continuar.',
  'chatNotice.localBoundary':
    'AGI no continuará una sesión de desarrollo Local con enrutamiento BYOK, Managed Cloud o Auto sin una transferencia revisada. Use "New Chat" para iniciar una nueva sesión con un proveedor o cree una continuación revisada en AGI CLI.',
  'chatNotice.eventOverflow':
    'El entorno de ejecución local emitió demasiados eventos antes de confirmar el turno. AGI interrumpió el turno para no perder su estado de finalización.',
  'chatNotice.overflowNotInterrupted': 'No se pudo interrumpir el turno local desbordado: {reason}',
  'chatNotice.cancellationFailed': 'No se pudo cancelar.',
  'chatNotice.runtimeFailed': 'Error en el entorno de ejecución local de AGI.',
  'chatNotice.turnFailed': 'Error en el turno local de la sesión de desarrollo.',
  'chatNotice.sessionRunningElsewhere':
    'Esta sesión de desarrollo aún se está ejecutando en otro cliente. Deténgala allí o espere a que quede inactiva.',
  'chatNotice.sessionAwaitingApprovalElsewhere':
    'Esta sesión de desarrollo está esperando una aprobación en otro cliente. Resuélvala allí antes de reanudarla aquí.',
  'chatNotice.sessionArchived':
    'Las sesiones de desarrollo archivadas son de solo lectura. Inicie una nueva sesión para continuar este trabajo.',
  'chatNotice.unverifiedBoundary':
    'Esta sesión de desarrollo heredada no tiene un límite Local, BYOK o Managed verificado. Inicie una nueva sesión y vuelva a elegir el proveedor; AGI no la reanudará automáticamente.',
  'chatNotice.queuedNotStarted': 'No se inició el mensaje de seguimiento en cola.',
  'chatNotice.followUpCapacity_one':
    'La cola de mensajes de seguimiento está llena ({count} pendiente). Vuelva a intentarlo cuando termine el turno activo.',
  'chatNotice.followUpCapacity_many':
    'La cola de mensajes de seguimiento está llena ({count} pendientes). Vuelva a intentarlo cuando termine el turno activo.',
  'chatNotice.followUpCapacity_other':
    'La cola de mensajes de seguimiento está llena ({count} pendientes). Vuelva a intentarlo cuando termine el turno activo.',
  'chatNotice.steerFailed': 'No se pudo redirigir el turno activo.',
  'chatNotice.openFileForDiff':
    'Abra un archivo en el editor para revisar esta sugerencia de código.',
  'chatNotice.diffUnavailable':
    'El proveedor de diferencias no está disponible. Vuelva a cargar la extensión.',
  'webview.retry': 'Reintentar',
  'webview.details': 'Detalles',
  'webview.copy': 'Copiar',
  'webview.copyResponse': 'Copiar respuesta',
  'webview.copied': 'Copiado',
  'webview.copyFailed': 'Error al copiar',
  'webview.goodResponse': 'Buena respuesta',
  'webview.badResponse': 'Mala respuesta',
  'webview.removeRating': 'Quitar valoración',
  'webview.failed': 'Error',
  'webview.newerDiffReplaced': 'Una propuesta de cambios más reciente reemplazó esta solicitud.',
  'webview.couldNotOpenDiff': 'No se pudieron abrir los cambios propuestos.',
  'webview.cloudSessionExpired': 'Sesión de AGI Cloud expirada',
  'webview.localStillAvailable': '· Los modos Local y BYOK de proveedores siguen disponibles',
  'webview.signInAgain': 'Volver a iniciar sesión',
  'webview.accountNeedsAttention': 'La cuenta requiere atención',
  'webview.sessionExpired': 'Sesión expirada',
  'webview.tryAgain': 'Volver a intentarlo',
  'webview.checking': 'Comprobando…',
  'webview.openWorkspaceToBegin': 'Abra un área de trabajo para empezar',
  'webview.restrictedMode': 'El área de trabajo está en modo restringido',
  'webview.runtimeNeedsSetup': 'El entorno de ejecución de desarrollo necesita configuración',
  'webview.openFolderToBegin': 'Abra una carpeta o un área de trabajo para empezar.',
  'webview.trustWorkspaceFirst':
    'Confíe en esta área de trabajo para que AGI pueda usar los archivos o las herramientas del proyecto.',
  'webview.cliUnavailable': 'AGI CLI no está disponible.',
  'webview.openFolder': 'Abrir carpeta',
  'webview.manageTrust': 'Administrar confianza',
  'webview.installCli': 'Instalar AGI CLI',
  'webview.openSetup': 'Abrir configuración',
  'webview.activity': 'Actividad',
  'webview.starting': 'Iniciando…',
  'webview.completed': 'Completado',
  'webview.completedWithErrors': 'Completado con errores',
  'webview.collapseDetails': 'Contraer detalles',
  'webview.expandDetails': 'Expandir detalles',
  'webview.lineDelta': '+{added} −{removed} líneas',
  'webview.actions_one': '{count} acción',
  'webview.actions_many': '{count} de acciones',
  'webview.actions_other': '{count} acciones',
  'webview.errors_one': '{count} error',
  'webview.errors_many': '{count} de errores',
  'webview.errors_other': '{count} errores',
  'webview.runningCount_one': '{count} en curso',
  'webview.runningCount_many': '{count} en curso',
  'webview.runningCount_other': '{count} en curso',
  'webview.completedCount_one': '{count} completada',
  'webview.completedCount_many': '{count} completadas',
  'webview.completedCount_other': '{count} completadas',
  'webview.linesWritten_one': '{count} línea escrita',
  'webview.linesWritten_many': '{count} de líneas escritas',
  'webview.linesWritten_other': '{count} líneas escritas',
  'diff.confirmWriteInFile_one':
    'AGI Workforce: ¿Escribir {count} cambio pendiente de {file} en el disco?',
  'diff.confirmWriteInFile_many':
    'AGI Workforce: ¿Escribir {count} de cambios pendientes de {file} en el disco?',
  'diff.confirmWriteInFile_other':
    'AGI Workforce: ¿Escribir {count} cambios pendientes de {file} en el disco?',
  'diff.confirmWrite_one': 'AGI Workforce: ¿Escribir {count} cambio pendiente en el disco?',
  'diff.confirmWrite_many': 'AGI Workforce: ¿Escribir {count} de cambios pendientes en el disco?',
  'diff.confirmWrite_other': 'AGI Workforce: ¿Escribir {count} cambios pendientes en el disco?',
  'diff.confirmDiscardInFile_one':
    'AGI Workforce: ¿Descartar {count} cambio pendiente de {file} sin escribirlo?',
  'diff.confirmDiscardInFile_many':
    'AGI Workforce: ¿Descartar {count} de cambios pendientes de {file} sin escribirlos?',
  'diff.confirmDiscardInFile_other':
    'AGI Workforce: ¿Descartar {count} cambios pendientes de {file} sin escribirlos?',
  'diff.confirmDiscard_one': 'AGI Workforce: ¿Descartar {count} cambio pendiente sin escribirlo?',
  'diff.confirmDiscard_many':
    'AGI Workforce: ¿Descartar {count} de cambios pendientes sin escribirlos?',
  'diff.confirmDiscard_other':
    'AGI Workforce: ¿Descartar {count} cambios pendientes sin escribirlos?',
  'diff.discardedInFile_one': 'AGI Workforce: se descartó {count} cambio pendiente de {file}.',
  'diff.discardedInFile_many':
    'AGI Workforce: se descartaron {count} de cambios pendientes de {file}.',
  'diff.discardedInFile_other':
    'AGI Workforce: se descartaron {count} cambios pendientes de {file}.',
  'diff.discarded_one': 'AGI Workforce: se descartó {count} cambio pendiente.',
  'diff.discarded_many': 'AGI Workforce: se descartaron {count} de cambios pendientes.',
  'diff.discarded_other': 'AGI Workforce: se descartaron {count} cambios pendientes.',
  'diff.restoredInFile_one': 'AGI Workforce: se restauró {count} cambio pendiente de {file}.',
  'diff.restoredInFile_many':
    'AGI Workforce: se restauraron {count} de cambios pendientes de {file}.',
  'diff.restoredInFile_other':
    'AGI Workforce: se restauraron {count} cambios pendientes de {file}.',
  'diff.restored_one': 'AGI Workforce: se restauró {count} cambio pendiente.',
  'diff.restored_many': 'AGI Workforce: se restauraron {count} de cambios pendientes.',
  'diff.restored_other': 'AGI Workforce: se restauraron {count} cambios pendientes.',
  'diff.moreFiles_one': '• …y {count} archivo más',
  'diff.moreFiles_many': '• …y {count} de archivos más',
  'diff.moreFiles_other': '• …y {count} archivos más',
  'diff.nothingPending': 'AGI Workforce: no hay cambios pendientes para revisar.',
  'diff.writeConsequence':
    'Estas ediciones se aplican a su árbol de trabajo. No pasan antes por ninguna otra revisión.',
  'diff.discardConsequence':
    'Las propuestas se descartan. Ejecute "AGI Workforce: Restore Discarded Changes" para recuperarlas en esta sesión.',
  'diff.writeChanges': 'Escribir cambios',
  'diff.discardChanges': 'Descartar cambios',
  'diff.restoreDiscarded': 'Restaurar cambios descartados',
  'diff.reviewFirst': 'Revisar primero',
  'runtime.reloaded':
    'AGI Workforce: Se recargó la configuración del entorno de ejecución. Volviendo a comprobar el entorno de ejecución de desarrollo del área de trabajo.',
  'runtime.restarted_one':
    'AGI Workforce: Se reinició el entorno de ejecución local en {count} área de trabajo.',
  'runtime.restarted_many':
    'AGI Workforce: Se reinició el entorno de ejecución local en {count} de áreas de trabajo.',
  'runtime.restarted_other':
    'AGI Workforce: Se reinició el entorno de ejecución local en {count} áreas de trabajo.',
  'memory.nothingToForget': 'No hay datos memorizados que olvidar.',
  'memory.forgetEverything': 'Olvidar todo',
  'memory.confirmForgetAll_one':
    '¿Eliminar {count} dato memorizado de su cuenta de AGI Cloud? También desaparece de la aplicación web, la CLI y la aplicación móvil, y esta acción no se puede deshacer.',
  'memory.confirmForgetAll_many':
    '¿Eliminar todos los {count} de datos memorizados de su cuenta de AGI Cloud? También desaparecen de la aplicación web, la CLI y la aplicación móvil, y esta acción no se puede deshacer.',
  'memory.confirmForgetAll_other':
    '¿Eliminar todos los {count} datos memorizados de su cuenta de AGI Cloud? También desaparecen de la aplicación web, la CLI y la aplicación móvil, y esta acción no se puede deshacer.',
  'memory.allForgotten': 'Se eliminaron todos los datos memorizados de su cuenta.',
  'memory.someKept': 'Se conservaron algunos datos. {reasons}',
  'project.archived': 'Archivado',
  'project.files_one': '{count} archivo',
  'project.files_many': '{count} de archivos',
  'project.files_other': '{count} archivos',
  'project.chats_one': '{count} chat',
  'project.chats_many': '{count} de chats',
  'project.chats_other': '{count} chats',
  'project.lastUsed': 'último uso: {date}',
  'project.deleteEverywhere':
    '"{title}" desaparece de la aplicación web, la CLI, la aplicación móvil y todos los demás clientes.',
  'project.deleteKnowledge_one':
    '{count} archivo de conocimiento se elimina con el proyecto y no se puede recuperar.',
  'project.deleteKnowledge_many':
    '{count} de archivos de conocimiento se eliminan con el proyecto y no se pueden recuperar.',
  'project.deleteKnowledge_other':
    '{count} archivos de conocimiento se eliminan con el proyecto y no se pueden recuperar.',
  'project.keepConversations_one':
    '{count} conversación se conserva, pero sale del proyecto y pierde las instrucciones y los conocimientos de este.',
  'project.keepConversations_many':
    '{count} de conversaciones se conservan, pero salen del proyecto y pierden las instrucciones y los conocimientos de este.',
  'project.keepConversations_other':
    '{count} conversaciones se conservan, pero salen del proyecto y pierden las instrucciones y los conocimientos de este.',
  'billing.credits_one': '{count} crédito',
  'billing.credits_many': '{count} de créditos',
  'billing.credits_other': '{count} créditos',
  'billing.unsettledRequests_one': '{count} solicitud aún sin liquidar',
  'billing.unsettledRequests_many': '{count} de solicitudes aún sin liquidar',
  'billing.unsettledRequests_other': '{count} solicitudes aún sin liquidar',
  'billing.noneYet': 'ninguno por ahora',
  'billing.noPublishedRate': 'sin tarifa publicada',
  'billing.withUnsettled': '{credits} ({unsettled})',
  'billing.excludesUnpriced_one': '{credits} (excluye {count} turno sin tarifa publicada)',
  'billing.excludesUnpriced_many': '{credits} (excluye {count} de turnos sin tarifa publicada)',
  'billing.excludesUnpriced_other': '{credits} (excluye {count} turnos sin tarifa publicada)',
  'billing.turnBilled': 'AGI Workforce: este turno costó {credits}',
  'billing.turnBilledSoFar':
    'AGI Workforce: este turno ha costado {credits} hasta ahora, {unsettled}',
  'schedule.runsSoFar_one': '{count} ejecución hasta ahora',
  'schedule.runsSoFar_many': '{count} de ejecuciones hasta ahora',
  'schedule.runsSoFar_other': '{count} ejecuciones hasta ahora',
  'composer.problems_one': '{count} problema',
  'composer.problems_many': '{count} de problemas',
  'composer.problems_other': '{count} problemas',
  'review.noIssues': 'AGI Workforce: ¡El código se ve bien! No se encontraron problemas.',
  'review.issuesFound_one':
    'AGI Workforce: Se encontró {count} problema. Revise la vista Problemas.',
  'review.issuesFound_many':
    'AGI Workforce: Se encontraron {count} de problemas. Revise la vista Problemas.',
  'review.issuesFound_other':
    'AGI Workforce: Se encontraron {count} problemas. Revise la vista Problemas.',
  'commands.registrationFailed_one':
    'AGI Workforce: No se pudo registrar {count} comando ({commands}). Consulte el elemento de estado de los subsistemas de AGI en la barra de estado para ver los detalles.',
  'commands.registrationFailed_many':
    'AGI Workforce: No se pudieron registrar {count} de comandos ({commands}). Consulte el elemento de estado de los subsistemas de AGI en la barra de estado para ver los detalles.',
  'commands.registrationFailed_other':
    'AGI Workforce: No se pudieron registrar {count} comandos ({commands}). Consulte el elemento de estado de los subsistemas de AGI en la barra de estado para ver los detalles.',
  'usage.requests_one': '{count} solicitud',
  'usage.requests_many': '{count} de solicitudes',
  'usage.requests_other': '{count} solicitudes',
  'usage.lastDays_one': 'último {count} día',
  'usage.lastDays_many': 'últimos {count} de días',
  'usage.lastDays_other': 'últimos {count} días',
  'usage.unsettledTurns_one': '{count} turno se está liquidando y aún no se ha contabilizado',
  'usage.unsettledTurns_many':
    '{count} de turnos se están liquidando y aún no se han contabilizado',
  'usage.unsettledTurns_other': '{count} turnos se están liquidando y aún no se han contabilizado',
  'handoff.switchBranch':
    '¿Cambiar esta área de trabajo a {branch} y arriesgarse a perder cambios no confirmados?',
  'handoff.uncommittedFiles_one':
    '{count} archivo de aquí tiene cambios que no están en ninguna confirmación. Cambiar a {branch} puede descartarlos, y eso no se puede deshacer.',
  'handoff.uncommittedFiles_many':
    '{count} de archivos de aquí tienen cambios que no están en ninguna confirmación. Cambiar a {branch} puede descartarlos, y eso no se puede deshacer.',
  'handoff.uncommittedFiles_other':
    '{count} archivos de aquí tienen cambios que no están en ninguna confirmación. Cambiar a {branch} puede descartarlos, y eso no se puede deshacer.',
  'handoff.andMore_one': 'y {count} más',
  'handoff.andMore_many': 'y {count} más',
  'handoff.andMore_other': 'y {count} más',
  'cloud.repository': 'Repositorio: {repository}',
  'cloud.branch': 'Rama: {branch}, tal como se envió a {upstream}',
  'cloud.model': 'Modelo: {model}',
  'cloud.network': 'Red: solo hosts de confianza, registros de paquetes y hosts de código',
  'cloud.whatMoves': 'Lo que se transfiere: la tarea que escribió y la rama enviada.',
  'cloud.whatStays':
    'Lo que se queda aquí: la conversación de este chat, las herramientas y servidores locales, y todo lo que no se haya enviado.',
  'cloud.unpushedCommits_one':
    '{count} confirmación en {branch} no se ha enviado y no estará en la nube.',
  'cloud.unpushedCommits_many':
    '{count} de confirmaciones en {branch} no se han enviado y no estarán en la nube.',
  'cloud.unpushedCommits_other':
    '{count} confirmaciones en {branch} no se han enviado y no estarán en la nube.',
  'cloud.uncommittedFiles_one':
    '{count} archivo tiene cambios no confirmados que no estarán en la nube.',
  'cloud.uncommittedFiles_many':
    '{count} de archivos tienen cambios no confirmados que no estarán en la nube.',
  'cloud.uncommittedFiles_other':
    '{count} archivos tienen cambios no confirmados que no estarán en la nube.',
  'cloud.continueQuestion': '¿Continuar este trabajo sobre {repository} en la nube?',
  'sessionHandoff.protocolUnsupported':
    'Esa sesión usa el protocolo de sesión de desarrollo {requested} y esta extensión usa {supported}. Actualice AGI para VS Code o AGI CLI para que ambos lados usen el mismo.',
  'sessionHandoff.wrongDestination':
    'Esa sesión se transfirió al entorno {destination}, no a este editor.',
  'sessionHandoff.trustModeUnknown':
    'Esa sesión no indica si se ejecutaba en modo Local, BYOK o Managed, así que este editor no la continuará.',
  'sessionHandoff.issuedAtUnreadable':
    'Ese registro de sesión no indica cuándo se emitió, así que este editor no puede saber si está vigente.',
  'sessionHandoff.expired_one':
    'Esa sesión se transfirió hace {count} minuto y los registros caducan tras {limit}. Vuelva a transferirla desde AGI CLI.',
  'sessionHandoff.expired_many':
    'Esa sesión se transfirió hace {count} de minutos y los registros caducan tras {limit}. Vuelva a transferirla desde AGI CLI.',
  'sessionHandoff.expired_other':
    'Esa sesión se transfirió hace {count} minutos y los registros caducan tras {limit}. Vuelva a transferirla desde AGI CLI.',
  'sessionHandoff.expiryLimit_one': '{count} minuto',
  'sessionHandoff.expiryLimit_many': '{count} de minutos',
  'sessionHandoff.expiryLimit_other': '{count} minutos',
  'sessionHandoff.notYetIssued':
    'Ese registro de sesión tiene una fecha futura. Compruebe el reloj de la máquina que lo generó.',
  'sessionHandoff.alreadyAccepted':
    'Este editor ya aceptó esa sesión. Ábrala desde "Sessions" en lugar de transferirla dos veces.',
  'sessionHandoff.wrongAccount':
    'Esa sesión pertenece a una cuenta de AGI distinta de aquella con la que se inició sesión en este editor.',
  'sessionHandoff.wrongWorkspace':
    'Esa sesión trabajaba en {received} y esta ventana tiene abierto {expected}. Abra primero esa carpeta.',
  'sessionHandoff.credentialInRecord':
    'Ese registro de sesión contiene lo que parece una credencial en su campo {field}, así que este editor lo rechazó. Notifíquelo en lugar de transmitirlo.',
  'sessionHandoff.source.cli': 'AGI CLI',
  'sessionHandoff.source.vscode': 'VS Code',
  'sessionHandoff.source.desktop': 'la aplicación de escritorio',
  'sessionHandoff.source.unknown': 'otra aplicación de AGI',
  'sessionHandoff.resource.backgroundShell': 'shell en segundo plano',
  'sessionHandoff.resource.devServer': 'servidor de desarrollo',
  'sessionHandoff.resource.mcpServer': 'servidor MCP',
  'sessionHandoff.resource.sandbox': 'espacio aislado',
  'sessionHandoff.resource.fileWatcher': 'monitor de archivos',
  'sessionHandoff.resource.terminal': 'terminal',
  'sessionHandoff.goal': 'Objetivo: {goal}',
  'sessionHandoff.folder': 'Carpeta: {folder}',
  'sessionHandoff.branch': 'Rama: {branch}',
  'sessionHandoff.branchAt': 'Rama: {branch}, confirmación {commit}',
  'sessionHandoff.runsAs': 'Modo de ejecución: {trust}',
  'sessionHandoff.uncommittedStays':
    'La carpeta tiene cambios no confirmados, que se quedan en el disco tal como están.',
  'sessionHandoff.movesConversation': 'La conversación, con todo su historial',
  'sessionHandoff.movesNewSession': 'Una nueva sesión, iniciada a partir de ese hilo',
  'sessionHandoff.changedFiles_one': '{count} archivo modificado: {files}',
  'sessionHandoff.changedFiles_many': '{count} de archivos modificados: {files}',
  'sessionHandoff.changedFiles_other': '{count} archivos modificados: {files}',
  'sessionHandoff.andMore_one': ' y {count} más',
  'sessionHandoff.andMore_many': ' y {count} más',
  'sessionHandoff.andMore_other': ' y {count} más',
  'sessionHandoff.planSteps_one': 'Un plan de {count} paso',
  'sessionHandoff.planSteps_many': 'Un plan de {count} de pasos',
  'sessionHandoff.planSteps_other': 'Un plan de {count} pasos',
  'sessionHandoff.checksRun_one': '{count} comprobación ya ejecutada',
  'sessionHandoff.checksRun_many': '{count} de comprobaciones ya ejecutadas',
  'sessionHandoff.checksRun_other': '{count} comprobaciones ya ejecutadas',
  'sessionHandoff.movesWithIt': 'Se transfiere con la sesión:',
  'sessionHandoff.reask_one':
    '{count} aprobación pendiente se volverá a solicitar aquí. No se conserva ninguna respuesta anterior.',
  'sessionHandoff.reask_many':
    '{count} de aprobaciones pendientes se volverán a solicitar aquí. No se conserva ninguna respuesta anterior.',
  'sessionHandoff.reask_other':
    '{count} aprobaciones pendientes se volverán a solicitar aquí. No se conserva ninguna respuesta anterior.',
  'sessionHandoff.restarted': 'Recursos reiniciados aquí, no transferidos: {resources}.',
  'sessionHandoff.interrupted': 'El último turno se interrumpió y no continuará por sí solo.',
  'sessionHandoff.continueQuestion': '¿Continuar en esta ventana la sesión de {source}?',
  'sessionHandoff.startQuestion':
    '¿Iniciar en esta ventana una sesión a partir del hilo de {source}?',
  'webview.contextUsedUnknownWindow_one':
    'El último turno usó {count} token. La ventana de contexto de este modelo no se conoce aquí.',
  'webview.contextUsedUnknownWindow_many':
    'El último turno usó {count} de tokens. La ventana de contexto de este modelo no se conoce aquí.',
  'webview.contextUsedUnknownWindow_other':
    'El último turno usó {count} tokens. La ventana de contexto de este modelo no se conoce aquí.',
  'webview.contextUsed_one':
    'Contexto después del último turno: {used} de {count} token ({percent}%)',
  'webview.contextUsed_many':
    'Contexto después del último turno: {used} de {count} de tokens ({percent}%)',
  'webview.contextUsed_other':
    'Contexto después del último turno: {used} de {count} tokens ({percent}%)',
  'webview.answerTokens_one': '{model} · {count} token ({input} de entrada, {output} de salida)',
  'webview.answerTokens_many':
    '{model} · {count} de tokens ({input} de entrada, {output} de salida)',
  'webview.answerTokens_other': '{model} · {count} tokens ({input} de entrada, {output} de salida)',
  'webview.moreLinesHidden_one': '{count} línea más sin mostrar',
  'webview.moreLinesHidden_many': '{count} de líneas más sin mostrar',
  'webview.moreLinesHidden_other': '{count} líneas más sin mostrar',
  'mcp.connected_one': 'AGI Workforce: {name} se conectó en {ms} ms y ofrece {count} herramienta.',
  'mcp.connected_many':
    'AGI Workforce: {name} se conectó en {ms} ms y ofrece {count} de herramientas.',
  'mcp.connected_other':
    'AGI Workforce: {name} se conectó en {ms} ms y ofrece {count} herramientas.',
  'checkpoints.trackedFiles_one': '{count} archivo registrado',
  'checkpoints.trackedFiles_many': '{count} de archivos registrados',
  'checkpoints.trackedFiles_other': '{count} archivos registrados',
  'checkpoints.skippedFiles_one': 'AGI Workforce: no se pudo restaurar {count} archivo: {files}',
  'checkpoints.skippedFiles_many':
    'AGI Workforce: no se pudieron restaurar {count} de archivos: {files}',
  'checkpoints.skippedFiles_other':
    'AGI Workforce: no se pudieron restaurar {count} archivos: {files}',
  'checkpoints.filesRestored_one': 'AGI Workforce: {count} archivo volvió al punto de control.',
  'checkpoints.filesRestored_many':
    'AGI Workforce: {count} de archivos volvieron al punto de control.',
  'checkpoints.filesRestored_other':
    'AGI Workforce: {count} archivos volvieron al punto de control.',
};

export default es;
