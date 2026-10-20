export function paginateTable<T>(items: readonly T[], requestedPage: number, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const offset = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    items: items.slice(offset, offset + pageSize),
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + pageSize, items.length),
    total: items.length,
  };
}

export function tablePageLinks(page: number, totalPages: number): Array<number | string> {
  const visible = new Set([1, totalPages]);
  const start = Math.max(1, Math.min(page - 1, totalPages - 4));
  const end = Math.min(totalPages, Math.max(page + 1, 5));
  for (let value = start; value <= end; value += 1) visible.add(value);
  const result: Array<number | string> = [];
  for (const value of [...visible].sort((a, b) => a - b)) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && value - previous > 1) {
      if (value - previous === 2) result.push(previous + 1);
      else result.push(`gap-${previous}`);
    }
    result.push(value);
  }
  return result;
}
