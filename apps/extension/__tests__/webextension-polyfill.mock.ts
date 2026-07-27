const browser = new Proxy<Record<PropertyKey, unknown>>(
  {},
  {
    get(_target, property) {
      const chromeApi = (
        globalThis as typeof globalThis & {
          chrome?: Record<PropertyKey, unknown>;
        }
      ).chrome;
      return chromeApi?.[property];
    },
  },
);

export default browser;
