// Preserve saved filters and resend cooldowns when upgrading to the new brand.
// Authentication storage uses provider keys and is deliberately left untouched.
export function migrateBrandStorage() {
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[kind];
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const key of keys) {
        if (!key?.startsWith("time-tracker:")) continue;
        const nextKey = `trackify:${key.slice("time-tracker:".length)}`;
        const value = storage.getItem(key);
        if (value !== null && storage.getItem(nextKey) === null) storage.setItem(nextKey, value);
        storage.removeItem(key);
      }
    } catch {
      // Optional browser storage can be disabled or full.
    }
  }
}
