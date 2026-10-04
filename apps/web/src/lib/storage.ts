// localStorage can throw (private mode, blocked storage) — never let that break the app.
export const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

export const LAST_ORG_KEY = 'ledgerly:last-org';
