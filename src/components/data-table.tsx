import { Pagination } from "@heroui/react/pagination";
import { Table } from "@heroui/react/table";
import { Typography } from "@heroui/react/typography";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { tablePageLinks } from "@/lib/table-pagination";

export type DataTablePagination = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  summary: ReactNode;
  previousLabel: string;
  nextLabel: string;
  ariaLabel: string;
};

export function DataTablePagination({
  page,
  totalPages,
  onPageChange,
  summary,
  previousLabel,
  nextLabel,
  ariaLabel,
}: DataTablePagination) {
  const pages = tablePageLinks(page, totalPages);

  return (
    <Pagination aria-label={ariaLabel} className="w-full flex-wrap justify-between gap-3" size="sm">
      <Pagination.Summary>{summary}</Pagination.Summary>
      <Pagination.Content aria-label={ariaLabel} className="flex-wrap justify-end gap-1">
        <Pagination.Item>
          <Pagination.Previous
            aria-label={previousLabel}
            isDisabled={page === 1}
            onPress={() => onPageChange(Math.max(1, page - 1))}
          >
            <Pagination.PreviousIcon />
            {previousLabel}
          </Pagination.Previous>
        </Pagination.Item>
        {pages.map((pageNumber) => (
          <Pagination.Item key={pageNumber}>
            {typeof pageNumber === "string" ? (
              <Pagination.Ellipsis />
            ) : (
              <Pagination.Link
                aria-label={`${ariaLabel} ${pageNumber}`}
                isActive={pageNumber === page}
                onPress={() => onPageChange(pageNumber)}
              >
                {pageNumber}
              </Pagination.Link>
            )}
          </Pagination.Item>
        ))}
        <Pagination.Item>
          <Pagination.Next
            aria-label={nextLabel}
            isDisabled={page === totalPages}
            onPress={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            {nextLabel}
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

/**
 * Shared HeroUI table shell.
 *
 * Keeping the primary table and its scroll container together is intentional:
 * HeroUI owns the outer radius and the inner first/last-cell rounding while
 * this component owns the accessible label and responsive width contract.
 */
export function DataTable({
  label,
  children,
  minWidth = "min-w-full",
  contentClassName,
  scrollContainerClassName,
  className,
  pagination,
  footer,
  scrollHint,
  selectedKeys,
}: {
  label: string;
  children: ReactNode;
  minWidth?: string;
  contentClassName?: string;
  scrollContainerClassName?: string;
  className?: string;
  pagination?: DataTablePagination | undefined;
  footer?: ReactNode;
  scrollHint?: string;
  selectedKeys?: ReadonlySet<string>;
}) {
  const { t } = useI18n();
  const resolvedScrollHint = scrollHint ?? t("Scroll horizontally to see all columns");
  const descriptionId = useId();
  const regionRef = useRef<HTMLElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const region = regionRef.current;
    const scrollContainer = region?.querySelector<HTMLElement>(
      '[data-slot="table-scroll-container"]',
    );
    if (!scrollContainer) return;

    const updateScrollableState = () => {
      setIsScrollable(scrollContainer.scrollWidth > scrollContainer.clientWidth + 1);
    };

    updateScrollableState();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollableState);
    observer?.observe(scrollContainer);
    const table = scrollContainer.querySelector("table");
    if (table) observer?.observe(table);
    window.addEventListener("resize", updateScrollableState);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScrollableState);
    };
  }, [minWidth]);

  return (
    <section ref={regionRef} className="min-w-0 max-w-full" aria-label={label}>
      {resolvedScrollHint ? (
        <Typography
          type="body-xs"
          color="muted"
          id={descriptionId}
          className={isScrollable ? "mb-2" : "sr-only"}
        >
          {resolvedScrollHint}
        </Typography>
      ) : null}
      <Table className={`app-data-table ${className ?? ""}`.trim()}>
        <Table.ScrollContainer
          className={`min-w-0 max-w-full ${scrollContainerClassName ?? ""}`.trim()}
          tabIndex={isScrollable ? 0 : undefined}
          aria-describedby={resolvedScrollHint ? descriptionId : undefined}
        >
          <Table.Content
            aria-label={label}
            className={`w-full ${minWidth} ${contentClassName ?? ""}`.trim()}
            {...(selectedKeys ? { selectionMode: "multiple", selectedKeys } : {})}
          >
            {children}
          </Table.Content>
        </Table.ScrollContainer>
        {pagination || footer ? (
          <Table.Footer>
            {footer}
            {pagination ? <DataTablePagination {...pagination} /> : null}
          </Table.Footer>
        ) : null}
      </Table>
    </section>
  );
}
