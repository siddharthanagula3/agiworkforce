(function installIsolationHook() {
  const isolationHook = (message) => {
    if (
      message === null ||
      typeof message !== 'object' ||
      typeof message.cmd !== 'string' ||
      message.cmd.length === 0
    ) {
      throw new TypeError('Rejected malformed Tauri IPC message')
    }

    return message
  }

  Object.defineProperty(window, '__TAURI_ISOLATION_HOOK__', {
    value: isolationHook,
    writable: false,
    configurable: false,
    enumerable: false,
  })
})()
