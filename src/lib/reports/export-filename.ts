import { defaultLocale, translate, type Locale } from "../i18n";

function safeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120)
    .trim();
}

export function reportExportFilename({
  memberIds,
  memberMap,
  workspaceName,
  view,
  startDate,
  endDate,
  locale = defaultLocale,
}: {
  /** Effective member filters, including permission restrictions. */
  memberIds: readonly string[];
  memberMap: ReadonlyMap<string, { name: string }>;
  workspaceName?: string | null;
  view: "overview" | "detailed";
  startDate: string;
  endDate: string;
  locale?: Locale;
}): string {
  const ids = [...new Set(memberIds)];
  const memberName = ids.length === 1 ? memberMap.get(ids[0]!)?.name : undefined;
  const subject = safeName(memberName) || safeName(workspaceName) || "Trackify";
  const label = translate(view === "detailed" ? "Detailed report" : "Overview report", locale);
  // Format calendar dates directly, without timezone conversion.
  const date = (iso: string) => iso.split("-").reverse().join("-");
  const period =
    startDate === endDate
      ? date(startDate)
      : `${date(startDate)} ${locale === "pt-BR" ? "a" : "to"} ${date(endDate)}`;
  return `${subject} - ${label} - ${period}`;
}
