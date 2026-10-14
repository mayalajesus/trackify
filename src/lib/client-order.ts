export function sortClientsByName<T extends { name: string }>(
  clients: readonly T[],
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return [...clients].sort((first, second) =>
    collator.compare(first.name.trim(), second.name.trim()),
  );
}
