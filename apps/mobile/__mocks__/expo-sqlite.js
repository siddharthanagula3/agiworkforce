'use strict';

/**
 * Jest stub for expo-sqlite (native module, not yet installed).
 * Individual tests override this via jest.mock('expo-sqlite', () => ...).
 */
const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 0 }),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  withTransactionAsync: jest.fn().mockImplementation(async (fn) => fn()),
  closeAsync: jest.fn().mockResolvedValue(undefined),
};

module.exports = {
  openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
};
