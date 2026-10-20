import { useEffect, useState } from "react";
import type { DataTablePagination } from "@/components/data-table";
import { useI18n } from "@/lib/i18n";
import { paginateTable } from "@/lib/table-pagination";

export function useTablePagination<T>(items: readonly T[], resetKey: string) {
  const { t } = useI18n();
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const result = paginateTable(items, selection.key === resetKey ? selection.page : 1);
  const { page } = result;
  useEffect(() => {
    setSelection((current) =>
      current.key === resetKey && current.page === page ? current : { key: resetKey, page },
    );
  }, [resetKey, page]);
  const pagination: DataTablePagination | undefined =
    result.totalPages > 1
      ? {
          page,
          totalPages: result.totalPages,
          onPageChange: (next) => setSelection({ key: resetKey, page: next }),
          summary: t("{start} to {end} of {total} results", {
            start: result.start,
            end: result.end,
            total: result.total,
          }),
          previousLabel: t("Previous"),
          nextLabel: t("Next"),
          ariaLabel: t("pagination"),
        }
      : undefined;
  return { items: result.items, pagination };
}
