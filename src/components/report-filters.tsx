import { Button } from "@heroui/react/button";
import { ButtonGroup } from "@heroui/react/button-group";
import { DateField } from "@heroui/react/date-field";
import { DateRangePicker } from "@heroui/react/date-range-picker";
import { Dropdown } from "@heroui/react/dropdown";
import { EmptyState } from "@heroui/react/empty-state";
import { I18nProvider, useFilter } from "@heroui/react/rac";
import { InputGroup } from "@heroui/react/input-group";
import { Label } from "@heroui/react/label";
import { RangeCalendar } from "@heroui/react/range-calendar";
import { SearchField } from "@heroui/react/search-field";
import { Separator } from "@heroui/react/separator";
import { TextField } from "@heroui/react/textfield";
import { Toolbar } from "@heroui/react/toolbar";
import { Typography } from "@heroui/react/typography";
import {
  ArrowRotateLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Magnifier,
  Person,
  Persons,
  Wallet,
} from "@gravity-ui/icons";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "@react-types/shared";
import { BillableIndicator } from "@/components/billable-indicator";
import { ProjectLabel } from "@/components/project-color";
import { useI18n } from "@/lib/i18n";
import {
  formatReportPeriod,
  getReportPeriodRange,
  reportPeriodPresets,
  type DateRange,
  type ReportPeriodPreset,
} from "@/lib/format";
import type { Client, Member, Project } from "@/lib/domain";
import type { CurrencyCode } from "@/lib/billing";

export type ReportFilterKey = "member" | "client" | "project" | "description" | "billability";

export type ReportFilterValues = {
  memberIds: string[];
  clientIds: string[];
  projectIds: string[];
  description: string;
  billability: "all" | "billable" | "internal";
  currency: CurrencyCode | "all";
};

export type ReportFilterOption = {
  id: string;
  label: string;
  description?: string;
  billable?: boolean | null;
  project?: Pick<Project, "color"> | null;
};

const reportFilterIconClassName = "size-4 shrink-0";

function ReportFilterValue({ children }: { children: string }) {
  return (
    <Typography
      slot="description"
      type="body-sm"
      color="default"
      weight="normal"
      truncate
      className="min-w-0"
    >
      {children}
    </Typography>
  );
}

function ReportFilterIcon({
  children,
  slot = "description",
}: {
  children: ReactNode;
  slot?: string | null;
}) {
  if (slot === null) return <>{children}</>;

  return (
    <Typography
      slot={slot}
      type="body-sm"
      color="muted"
      weight="normal"
      className="flex size-4 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      {children}
    </Typography>
  );
}

function ReportPeriodNavigation({
  navigationLabel,
  previousLabel,
  nextLabel,
  onPeriodShift,
}: {
  navigationLabel: string;
  previousLabel: string;
  nextLabel: string;
  onPeriodShift: (direction: -1 | 1) => void;
}) {
  return (
    <ButtonGroup
      variant="tertiary"
      size="sm"
      slot={null}
      className="relative shrink-0"
      aria-label={navigationLabel}
    >
      <GroupedButtonSeparator className="start-0" />
      <Button
        isIconOnly
        slot={null}
        aria-label={previousLabel}
        className="h-9 w-8 min-w-8 shrink-0 px-0"
        onPress={() => onPeriodShift(-1)}
      >
        <ReportFilterIcon slot={null}>
          <ChevronLeft aria-hidden="true" className={reportFilterIconClassName} />
        </ReportFilterIcon>
      </Button>
      <GroupedButtonSeparator className="start-8" />
      <Button
        isIconOnly
        slot={null}
        aria-label={nextLabel}
        className="h-9 w-8 min-w-8 shrink-0 px-0"
        onPress={() => onPeriodShift(1)}
      >
        <ReportFilterIcon slot={null}>
          <ChevronRight aria-hidden="true" className={reportFilterIconClassName} />
        </ReportFilterIcon>
      </Button>
    </ButtonGroup>
  );
}

function GroupedButtonSeparator({ className }: { className?: string }) {
  return <ButtonGroup.Separator {...(className ? { className } : {})} />;
}

function ReportFilterActions({
  hasActiveFilters,
  clearLabel,
  onClear,
}: {
  hasActiveFilters: boolean;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <Button
      variant="tertiary"
      size="sm"
      isIconOnly
      className="shrink-0"
      aria-label={clearLabel}
      isDisabled={!hasActiveFilters}
      onPress={onClear}
    >
      <ReportFilterIcon>
        <ArrowRotateLeft aria-hidden="true" className={reportFilterIconClassName} />
      </ReportFilterIcon>
    </Button>
  );
}

function toCalendarDate(value: string): CalendarDate | null {
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    ![year, month, day].every((part) => Number.isInteger(part))
  ) {
    return null;
  }
  try {
    return new CalendarDate(year, month, day);
  } catch {
    return null;
  }
}

function toRangeValue(range: DateRange): RangeValue<CalendarDate> | null {
  const start = toCalendarDate(range.startDate);
  const end = toCalendarDate(range.endDate);
  return start && end ? { start, end } : null;
}

function fromRangeValue(value: RangeValue<CalendarDate> | null): DateRange | null {
  if (!value?.start || !value.end) return null;
  const first = value.start.toString();
  const second = value.end.toString();
  return first <= second
    ? { startDate: first, endDate: second }
    : { startDate: second, endDate: first };
}

function selectedLabel(options: ReportFilterOption[], values: string[], empty: string): string {
  if (values.length === 0) return empty;
  if (values.length === 1) return options.find((option) => option.id === values[0])?.label ?? empty;
  return `${values.length} selected`;
}

function GroupedDropdown({ children }: { children: ReactNode }) {
  return <Dropdown>{children}</Dropdown>;
}

function ReportFilterDropdown({
  label,
  icon,
  options,
  values,
  onChange,
  searchable,
  multiple,
  allLabel,
  separator = "button-group",
  className,
}: {
  label: string;
  icon: ReactNode;
  options: ReportFilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
  searchable: boolean;
  multiple: boolean;
  allLabel?: string;
  separator?: "button-group" | "vertical";
  className?: string;
}) {
  const { t } = useI18n();
  const { contains } = useFilter({ sensitivity: "base" });
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(() => {
    if (!searchable || query.trim().length === 0) return options;
    return options.filter(
      (option) => contains(option.label, query) || contains(option.description ?? "", query),
    );
  }, [contains, options, query, searchable]);
  const selectionMode = multiple ? "multiple" : "single";

  return (
    <ButtonGroup
      variant="tertiary"
      size="sm"
      className={className ? `min-w-0 ${className}` : "min-w-0"}
      aria-label={t("{label} filter", { label })}
    >
      <Button
        type="button"
        aria-label={t("{label} filter", { label })}
        className="h-9 min-w-0 flex-1 justify-start gap-2"
      >
        <ReportFilterIcon>{icon}</ReportFilterIcon>
        <ReportFilterValue>{selectedLabel(options, values, allLabel ?? label)}</ReportFilterValue>
      </Button>
      <GroupedDropdown>
        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          aria-label={t("Open {label}", { label })}
          className="h-9 w-9 min-w-9 shrink-0 px-0"
        >
          {separator === "vertical" ? (
            <Separator
              orientation="vertical"
              variant="tertiary"
              className="mx-1 h-5 shrink-0 self-center"
            />
          ) : (
            <ButtonGroup.Separator />
          )}
          <ReportFilterIcon>
            <ChevronDown aria-hidden="true" className={reportFilterIconClassName} />
          </ReportFilterIcon>
        </Button>
        <Dropdown.Popover
          className="w-64 max-w-[calc(100vw-2rem)] min-w-0"
          onOpenChange={(isOpen) => {
            if (!isOpen) setQuery("");
          }}
        >
          {searchable ? (
            <div className="p-2">
              <SearchField
                autoFocus
                aria-label={t("Search {label} options", { label: label.toLowerCase() })}
                name={`report-${label.toLowerCase()}-search`}
                value={query}
                onChange={setQuery}
                variant="secondary"
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    placeholder={t("Search {label}...", { label: label.toLowerCase() })}
                  />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            </div>
          ) : null}
          {filteredOptions.length === 0 && !allLabel ? (
            <EmptyState>{t("No results")}</EmptyState>
          ) : (
            <Dropdown.Menu
              aria-label={t("{label} options", { label })}
              className="max-h-64 overflow-y-auto"
              selectionMode={selectionMode}
              selectedKeys={new Set(allLabel && values.length === 0 ? ["__all__"] : values)}
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  onChange(allLabel ? [] : options.map((option) => option.id));
                  return;
                }
                if (allLabel && keys.has("__all__") && values.length > 0) {
                  onChange([]);
                  return;
                }
                const nextValues = [...keys]
                  .map(String)
                  .filter((key) => !allLabel || key !== "__all__");
                onChange(multiple ? nextValues : nextValues.slice(-1));
              }}
            >
              {allLabel ? (
                <Dropdown.Item id="__all__" textValue={allLabel}>
                  <Label>{allLabel}</Label>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ) : null}
              {filteredOptions.map((option) => (
                <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
                  {option.billable !== undefined ? (
                    <Label className="flex items-center gap-2">
                      <BillableIndicator billable={option.billable} mode="icon" />
                      {option.label}
                    </Label>
                  ) : option.project ? (
                    <ProjectLabel project={option.project} label={option.label} />
                  ) : (
                    <Label>{option.label}</Label>
                  )}
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          )}
        </Dropdown.Popover>
      </GroupedDropdown>
    </ButtonGroup>
  );
}

function ReportMultiSelect(props: {
  allLabel?: string;
  label: string;
  icon: ReactNode;
  options: ReportFilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
  separator?: "button-group" | "vertical";
  className?: string;
}) {
  return <ReportFilterDropdown {...props} searchable multiple />;
}

function ReportSingleSelect({
  label,
  icon,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  options: ReportFilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <ReportFilterDropdown
      label={label}
      icon={icon}
      options={options}
      values={[value]}
      onChange={(values) => onChange(values[0] ?? value)}
      searchable={false}
      multiple={false}
      {...(className ? { className } : {})}
    />
  );
}

function ReportPeriodPicker({
  preset,
  range,
  today,
  weekStartsOn,
  weeklyNavigation = false,
  navigationLabel,
  previousLabel,
  nextLabel,
  onPeriodShift,
  onChange,
}: {
  preset: ReportPeriodPreset;
  range: DateRange;
  today: string;
  weekStartsOn: 0 | 1;
  weeklyNavigation?: boolean;
  navigationLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  onPeriodShift?: (direction: -1 | 1) => void;
  onChange: (preset: ReportPeriodPreset, range: DateRange) => void;
}) {
  const { locale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [calendarValue, setCalendarValue] = useState<RangeValue<CalendarDate> | null>(() =>
    toRangeValue(range),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rangeStartDate = range.startDate;
  const rangeEndDate = range.endDate;
  const selectedPreset = reportPeriodPresets.find((option) => option.id === preset);
  const presetLabel = preset !== "custom" && selectedPreset ? t(selectedPreset.label) : null;

  useEffect(() => {
    setCalendarValue(toRangeValue({ startDate: rangeStartDate, endDate: rangeEndDate }));
  }, [rangeEndDate, rangeStartDate]);

  return (
    <I18nProvider locale={locale}>
      <DateRangePicker
        className={weeklyNavigation ? "w-fit min-w-0 shrink-0" : "w-60 min-w-60 shrink-0"}
        aria-label={t("Date range: {range}", { range: formatReportPeriod(range, locale) })}
        value={calendarValue}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onChange={(nextValue) => {
          setCalendarValue(nextValue);
          const nextRange = fromRangeValue(nextValue);
          if (nextRange) {
            onChange("custom", nextRange);
            setIsOpen(false);
          }
        }}
      >
        <Label className="sr-only">{t("Report period")}</Label>
        <div className="flex min-w-0 items-center">
          <DateField.Group
            className={`h-9 min-w-0 gap-0 overflow-hidden p-1 ${
              weeklyNavigation
                ? "w-fit flex-none rounded-s-[calc(var(--radius)*3)] rounded-e-none"
                : "w-fit rounded-[calc(var(--radius)*3)]"
            }`}
            variant="secondary"
            aria-label={t("Selected report period")}
          >
            <DateField.Prefix className="pointer-events-auto ms-1 me-0 shrink-0 p-0">
              <DateRangePicker.Trigger
                ref={triggerRef}
                className={`flex h-7 min-w-7 shrink-0 items-center justify-center gap-2 ${presetLabel ? "px-2" : "w-7 px-0"}`}
                aria-label={t("Open {label} calendar", { label: presetLabel ?? t("Date range") })}
              >
                <Calendar aria-hidden="true" className={reportFilterIconClassName} />
                {presetLabel ? (
                  <span className="whitespace-nowrap text-sm">{presetLabel}</span>
                ) : null}
              </DateRangePicker.Trigger>
            </DateField.Prefix>
            <div className={presetLabel ? "hidden" : "contents"}>
              <DateField.Input
                slot="start"
                className="w-fit min-w-0 flex-none gap-0 overflow-hidden p-0 whitespace-nowrap"
              >
                {(segment) => (
                  <DateField.Segment segment={segment} className="px-0 whitespace-nowrap" />
                )}
              </DateField.Input>
              <DateRangePicker.RangeSeparator className="px-1">–</DateRangePicker.RangeSeparator>
              <DateField.Input
                slot="end"
                className="w-fit min-w-0 flex-none gap-0 overflow-hidden p-0 pe-2 whitespace-nowrap"
              >
                {(segment) => (
                  <DateField.Segment segment={segment} className="px-0 whitespace-nowrap" />
                )}
              </DateField.Input>
            </div>
          </DateField.Group>
          {weeklyNavigation && navigationLabel && previousLabel && nextLabel && onPeriodShift ? (
            <ReportPeriodNavigation
              navigationLabel={navigationLabel}
              previousLabel={previousLabel}
              nextLabel={nextLabel}
              onPeriodShift={(direction) => {
                setIsOpen(false);
                onPeriodShift(direction);
              }}
            />
          ) : null}
        </div>

        <DateRangePicker.Popover
          placement="bottom start"
          triggerRef={triggerRef}
          shouldFlip
          containerPadding={12}
          offset={8}
          className="overflow-hidden p-2"
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:gap-1">
            <div className="hidden w-36 shrink-0 flex-col p-1 sm:flex">
              <Typography type="body-xs" color="muted" weight="semibold" className="px-2 py-1.5">
                {t("Date range")}
              </Typography>
              {reportPeriodPresets.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant={preset === option.id ? "secondary" : "ghost"}
                  onPress={() => {
                    if (option.id === "custom") return;
                    const nextRange = getReportPeriodRange(option.id, today, weekStartsOn);
                    setCalendarValue(toRangeValue(nextRange));
                    onChange(option.id, nextRange);
                    setIsOpen(false);
                  }}
                >
                  {t(option.label)}
                </Button>
              ))}
            </div>
            <div className="p-0 sm:hidden">
              <ButtonGroup variant="tertiary" size="sm" className="w-full">
                <Button
                  type="button"
                  aria-label={t("Date range preset")}
                  className="h-9 min-w-0 flex-1 justify-start"
                >
                  {t(reportPeriodPresets.find((option) => option.id === preset)?.label ?? "Custom")}
                </Button>
                <GroupedDropdown>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    aria-label={t("Choose date range preset")}
                    className="h-9 w-9 min-w-9 shrink-0 px-0"
                  >
                    <ButtonGroup.Separator />
                    <ReportFilterIcon>
                      <ChevronDown aria-hidden="true" className={reportFilterIconClassName} />
                    </ReportFilterIcon>
                  </Button>
                  <Dropdown.Popover>
                    <Dropdown.Menu
                      aria-label={t("Date range presets")}
                      selectionMode="single"
                      selectedKeys={new Set([preset])}
                      onAction={(key) => {
                        const nextPreset = String(key) as ReportPeriodPreset;
                        if (nextPreset === "custom") return;
                        const nextRange = getReportPeriodRange(nextPreset, today, weekStartsOn);
                        setCalendarValue(toRangeValue(nextRange));
                        onChange(nextPreset, nextRange);
                        setIsOpen(false);
                      }}
                    >
                      {reportPeriodPresets.map((option) => (
                        <Dropdown.Item
                          key={option.id}
                          id={option.id}
                          textValue={option.label}
                          isDisabled={option.id === "custom"}
                        >
                          <Label>{t(option.label)}</Label>
                          <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </GroupedDropdown>
              </ButtonGroup>
            </div>
            <div className="min-w-0 flex-1 p-2 pe-4 sm:w-64 sm:flex-none">
              <RangeCalendar
                aria-label={t("Choose report date range")}
                firstDayOfWeek={weekStartsOn === 0 ? "sun" : "mon"}
                visibleDuration={{ months: 1 }}
                className="!w-full !max-w-full pe-2"
              >
                <RangeCalendar.Header>
                  <RangeCalendar.NavButton slot="previous" aria-label={t("Previous month")}>
                    <ChevronLeft aria-hidden="true" className={reportFilterIconClassName} />
                  </RangeCalendar.NavButton>
                  <RangeCalendar.Heading />
                  <RangeCalendar.NavButton slot="next" aria-label={t("Next month")}>
                    <ChevronRight aria-hidden="true" className={reportFilterIconClassName} />
                  </RangeCalendar.NavButton>
                </RangeCalendar.Header>
                <RangeCalendar.Grid>
                  <RangeCalendar.GridHeader>
                    {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                  </RangeCalendar.GridHeader>
                  <RangeCalendar.GridBody>
                    {(date) => <RangeCalendar.Cell date={date} />}
                  </RangeCalendar.GridBody>
                </RangeCalendar.Grid>
              </RangeCalendar>
            </div>
          </div>
        </DateRangePicker.Popover>
      </DateRangePicker>
    </I18nProvider>
  );
}

export function ReportFiltersBar({
  preset,
  range,
  today,
  weekStartsOn,
  values,
  visibleFilters,
  members,
  clients,
  projects,
  currencies,
  showTeam,
  weeklyNavigation = false,
  onPeriodChange,
  onPeriodShift,
  onChange,
  onClear,
}: {
  preset: ReportPeriodPreset;
  range: DateRange;
  today: string;
  weekStartsOn: 0 | 1;
  values: ReportFilterValues;
  visibleFilters: ReportFilterKey[];
  members: Member[];
  clients: Client[];
  projects: Project[];
  currencies: readonly CurrencyCode[];
  showTeam: boolean;
  weeklyNavigation?: boolean;
  onPeriodChange: (preset: ReportPeriodPreset, range: DateRange) => void;
  onPeriodShift?: (direction: -1 | 1) => void;
  onChange: (patch: Partial<ReportFilterValues>) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const visible = showTeam ? visibleFilters : visibleFilters.filter((key) => key !== "member");
  const memberOptions = useMemo(
    () =>
      members
        .filter((member) => member.status === "active")
        .map((member) => ({ id: member.id, label: member.name, description: member.email })),
    [members],
  );
  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        id: client.id,
        label: client.name,
        description: client.contact,
      })),
    [clients],
  );
  const clientNameById = useMemo(
    () => new Map(clients.map((client) => [client.id, client.name])),
    [clients],
  );
  const projectOptions = useMemo(
    () => [
      { id: "none", label: "No project", description: "No client" },
      ...projects.map((project) => ({
        id: project.id,
        label: project.name,
        description: clientNameById.get(project.clientId) ?? t("Unknown client"),
        project,
      })),
    ],
    [clientNameById, projects, t],
  );
  const activeFilterCount = [
    showTeam && values.memberIds.length > 0,
    values.clientIds.length > 0,
    values.projectIds.length > 0,
    values.description.trim().length > 0,
    values.billability !== "all",
    values.currency !== "all",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const dataFilterControls: ReactElement[] = [];
  const multiSelectClassName = "min-w-0 flex-[1_1_0%]";
  const billabilityClassName = "min-w-0 flex-[1.2_1_0%]";

  if (visible.includes("member") && showTeam) {
    dataFilterControls.push(
      <ReportMultiSelect
        key="member"
        label={t("Team")}
        allLabel={t("All team members")}
        icon={<Persons aria-hidden="true" className={reportFilterIconClassName} />}
        options={memberOptions}
        values={values.memberIds}
        onChange={(memberIds) => onChange({ memberIds })}
        className={multiSelectClassName}
      />,
    );
  }
  if (visible.includes("client")) {
    dataFilterControls.push(
      <ReportMultiSelect
        key="client"
        label={t("Client")}
        icon={<Person aria-hidden="true" className={reportFilterIconClassName} />}
        options={clientOptions}
        values={values.clientIds}
        onChange={(clientIds) => onChange({ clientIds })}
        className={multiSelectClassName}
      />,
    );
  }
  if (visible.includes("project")) {
    dataFilterControls.push(
      <ReportMultiSelect
        key="project"
        label={t("Project")}
        icon={<Folder aria-hidden="true" className={reportFilterIconClassName} />}
        options={projectOptions}
        values={values.projectIds}
        onChange={(projectIds) => onChange({ projectIds })}
        className={multiSelectClassName}
      />,
    );
  }
  if (visible.includes("billability")) {
    dataFilterControls.push(
      <ReportSingleSelect
        key="billability"
        label={t("Billability")}
        icon={
          <BillableIndicator
            billable={values.billability === "all" ? null : values.billability === "billable"}
            mode="icon"
            className={reportFilterIconClassName}
          />
        }
        value={values.billability}
        options={[
          { id: "all", label: t("All billability"), billable: null },
          { id: "billable", label: t("Billable"), billable: true },
          { id: "internal", label: t("Non-billable"), billable: false },
        ]}
        onChange={(billability) =>
          onChange({ billability: billability as ReportFilterValues["billability"] })
        }
        className={billabilityClassName}
      />,
    );
  }
  if (currencies.length > 1 || values.currency !== "all") {
    const currencyOptions =
      values.currency !== "all" && !currencies.includes(values.currency)
        ? [values.currency, ...currencies]
        : currencies;
    dataFilterControls.push(
      <ReportSingleSelect
        key="currency"
        label={t("Currency")}
        icon={<Wallet aria-hidden="true" className={reportFilterIconClassName} />}
        value={values.currency}
        options={[
          { id: "all", label: t("All currencies") },
          ...currencyOptions.map((currency) => ({ id: currency, label: currency })),
        ]}
        onChange={(currency) => onChange({ currency: currency as ReportFilterValues["currency"] })}
        className={billabilityClassName}
      />,
    );
  }

  return (
    <Toolbar
      orientation="horizontal"
      aria-label={t("Report filters")}
      className="w-full max-w-full min-w-0 flex flex-wrap items-center justify-between gap-3 overflow-visible"
    >
      <div className="ms-auto flex w-full min-w-0 max-w-full flex-1 flex-nowrap items-center justify-end gap-2 overflow-hidden">
        <ReportPeriodPicker
          preset={preset}
          range={range}
          today={today}
          weekStartsOn={weekStartsOn}
          weeklyNavigation={weeklyNavigation}
          {...(weeklyNavigation
            ? {
                navigationLabel: t("Report period navigation"),
                previousLabel: t("Previous {unit}", { unit: t("range") }),
                nextLabel: t("Next {unit}", { unit: t("range") }),
                ...(onPeriodShift ? { onPeriodShift } : {}),
              }
            : {})}
          onChange={onPeriodChange}
        />
        {dataFilterControls.map((control, index) => (
          <Fragment key={`report-filter-${index}`}>{control}</Fragment>
        ))}
        {visible.includes("description") ? (
          <TextField
            className="min-w-0 flex-[1.2_1_0%]"
            name="report-description-filter"
            value={values.description}
            onChange={(description) => onChange({ description })}
          >
            <Label className="sr-only">{t("Description filter")}</Label>
            <InputGroup className="min-w-0" variant="primary">
              <InputGroup.Prefix>
                <ReportFilterIcon>
                  <Magnifier aria-hidden="true" className={reportFilterIconClassName} />
                </ReportFilterIcon>
              </InputGroup.Prefix>
              <InputGroup.Input placeholder={t("Description")} />
            </InputGroup>
          </TextField>
        ) : null}
        <ReportFilterActions
          hasActiveFilters={hasActiveFilters}
          clearLabel={t("Clear filters")}
          onClear={onClear}
        />
      </div>
    </Toolbar>
  );
}
