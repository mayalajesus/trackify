export let idCounter = 100;

export const nextId = (_prefix: string, _existingIds: Iterable<string> = []) => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const suffix = (++idCounter).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
};

export const inviteEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
