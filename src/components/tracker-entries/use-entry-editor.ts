import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { TimeEntry } from "@/lib/domain";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import type { EntryDraft, TrackerEditableField } from "./types";
import {
  addSecondsToDateTime,
  dateTimeToTimestamp,
  formatDuration,
  formatDurationInput,
  getDayOffset,
  getElapsedMinutes,
  getEndDateForClockRange,
  getEndDateForEntry,
  isValidDateOnly,
  parseDurationInput,
  shiftDate,
} from "@/lib/format";

export function toDraft(entry: TimeEntry): EntryDraft {
  return {
    date: entry.date,
    task: entry.task,
    projectId: entry.projectId,
    start: entry.start,
    end: entry.end,
    endDate: getEndDateForEntry(entry),
    duration: formatDurationInput(entry.seconds),
    description: entry.description ?? "",
    billable: entry.billable,
  };
}

export function useEntryEditor(
  entry: TimeEntry,
  activeField: TrackerEditableField | null,
  onDeactivate: () => void,
) {
  const { projects, preferences, updateEntry, findEntryConflict } = useStore();
  const { locale, t, error } = useI18n();
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);
  const timeFieldRef = useRef<HTMLDivElement | null>(null);
  const skipNextBlurRef = useRef(false);
  const savedDraftRef = useRef<EntryDraft>(toDraft(entry));
  const [draft, setDraft] = useState<EntryDraft>(() => toDraft(entry));
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    candidate: EntryDraft;
    patch: Partial<Omit<TimeEntry, "id">>;
    conflict: TimeEntry;
  } | null>(null);

  useEffect(() => {
    if (activeField) return;
    const next = toDraft(entry);
    savedDraftRef.current = next;
    setDraft(next);
    setValidationMessage(null);
  }, [activeField, entry]);

  useEffect(() => {
    if (!activeField) return;
    if (activeField === "start" || activeField === "end") {
      const firstSegment = timeFieldRef.current?.querySelector<HTMLElement>(
        '[data-type]:not([data-type="literal"])',
      );
      firstSegment?.focus();
      return;
    }
    if (!focusRef.current) return;
    focusRef.current.focus();
    if (activeField === "task" || activeField === "description" || activeField === "duration") {
      focusRef.current.select();
    }
  }, [activeField]);

  const validateDraft = (candidate: EntryDraft, allowFullDayDuration = false): string | null => {
    if (!candidate.task.trim()) return t("Task is required.");
    if (!isValidDateOnly(candidate.date)) return t("Choose a valid date.");
    const elapsedMinutes = getElapsedMinutes(
      candidate.date,
      candidate.start,
      candidate.endDate,
      candidate.end,
    );
    const preciseDuration = parseDurationInput(candidate.duration);
    if (elapsedMinutes <= 0 && !allowFullDayDuration && !(preciseDuration && preciseDuration > 0)) {
      return t("End time must be after start time.");
    }
    if (!projects.some((item) => item.id === candidate.projectId)) {
      return t("Select a project");
    }
    return null;
  };

  const notifySaved = (candidate: EntryDraft, warning?: string) => {
    savedDraftRef.current = candidate;
    setDraft(candidate);
    setValidationMessage(null);
    const durationSeconds = parseDurationInput(candidate.duration);
    toast.success(t("Entry updated"), {
      description: `${candidate.task} · ${durationSeconds === null ? candidate.duration : formatDuration(durationSeconds, locale)}`,
    });
    if (warning) toast.info(t("Overlapping time"), { description: error(warning) });
  };

  const queueIfOverlapping = (
    candidate: EntryDraft,
    patch: Partial<Omit<TimeEntry, "id">>,
  ): boolean => {
    const conflict = findEntryConflict({ ...entry, ...patch }, entry.id);
    if (!conflict) return false;
    setPendingEdit({ candidate, patch, conflict });
    return true;
  };

  const commitField = (
    field: "task" | "description" | "project" | "date" | "billable",
    value: string | boolean | null,
  ): boolean => {
    const draftField = field === "project" ? "projectId" : field;
    const normalizedValue =
      field === "task" || field === "description" ? String(value).trim() : value;
    const nextEndDate =
      field === "date" && typeof normalizedValue === "string" && isValidDateOnly(normalizedValue)
        ? shiftDate(normalizedValue, getDayOffset(draft.date, draft.endDate))
        : draft.endDate;
    const candidate = {
      ...draft,
      [draftField]: normalizedValue,
      ...(field === "date" ? { endDate: nextEndDate } : {}),
    } as EntryDraft;
    const message = validateDraft(candidate);
    if (message) {
      setValidationMessage(message);
      return false;
    }

    if (savedDraftRef.current[draftField] === candidate[draftField]) return true;

    const changedDateStart =
      field === "date" && typeof normalizedValue === "string"
        ? dateTimeToTimestamp(normalizedValue, candidate.start, 0, preferences.timezone)
        : null;
    const patch =
      field === "project"
        ? { projectId: candidate.projectId }
        : field === "date"
          ? {
              date: candidate.date,
              endDate: candidate.endDate !== candidate.date ? candidate.endDate : undefined,
              startTimestamp: changedDateStart ?? undefined,
              endTimestamp:
                changedDateStart === null ? undefined : changedDateStart + entry.seconds * 1000,
            }
          : { [field]: normalizedValue };
    if (field === "date" && queueIfOverlapping(candidate, patch)) return false;
    const result = updateEntry(entry.id, patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      return false;
    }

    notifySaved(candidate, result.warning);
    return true;
  };

  const commitTime = (start: string, end: string, close = false): boolean => {
    const endDate = getEndDateForClockRange(draft.date, start, end, draft.endDate);
    const elapsedMinutes = getElapsedMinutes(draft.date, start, endDate, end);
    const elapsedSeconds = elapsedMinutes * 60;
    const candidate = {
      ...draft,
      start,
      end,
      endDate,
      duration: formatDurationInput(elapsedSeconds),
    };
    const message = validateDraft(candidate);
    if (message) {
      setValidationMessage(message);
      return false;
    }

    if (
      savedDraftRef.current.start === start &&
      savedDraftRef.current.end === end &&
      savedDraftRef.current.endDate === endDate
    ) {
      if (close) onDeactivate();
      return true;
    }

    const patch = {
      start,
      end,
      endDate: endDate !== draft.date ? endDate : undefined,
      seconds: elapsedSeconds,
      startTimestamp: dateTimeToTimestamp(draft.date, start, 0, preferences.timezone) ?? undefined,
      endTimestamp: dateTimeToTimestamp(endDate, end, 0, preferences.timezone) ?? undefined,
    };
    if (queueIfOverlapping(candidate, patch)) return false;
    const result = updateEntry(entry.id, patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      return false;
    }

    notifySaved(candidate, result.warning);
    if (close) onDeactivate();
    return true;
  };

  const commitDuration = (value: string, close = false): boolean => {
    const totalSeconds = parseDurationInput(value);
    if (totalSeconds === null) {
      setValidationMessage(
        t("Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns (for example, 1:20, 00:00:49, 120, 825 or 45s)."),
      );
      return false;
    }

    const finish = addSecondsToDateTime(draft.date, draft.start, totalSeconds);
    const startTimestamp = dateTimeToTimestamp(draft.date, draft.start, 0, preferences.timezone);
    const endTimestamp = startTimestamp === null ? null : startTimestamp + totalSeconds * 1000;
    const candidate = {
      ...draft,
      end: finish.end,
      endDate: finish.endDate,
      duration: formatDurationInput(totalSeconds),
    };
    const message = validateDraft(candidate, totalSeconds === 24 * 60 * 60);
    if (message) {
      setValidationMessage(message);
      return false;
    }

    if (
      savedDraftRef.current.end === finish.end &&
      savedDraftRef.current.endDate === finish.endDate &&
      savedDraftRef.current.duration === candidate.duration
    ) {
      if (close) onDeactivate();
      return true;
    }

    const patch = {
      end: finish.end,
      endDate: finish.endDate !== draft.date ? finish.endDate : undefined,
      seconds: totalSeconds,
      startTimestamp: startTimestamp ?? undefined,
      endTimestamp: endTimestamp ?? undefined,
    };
    if (queueIfOverlapping(candidate, patch)) return false;
    const result = updateEntry(entry.id, patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      return false;
    }

    notifySaved(candidate, result.warning);
    if (close) onDeactivate();
    return true;
  };

  const restoreField = () => {
    skipNextBlurRef.current = true;
    window.requestAnimationFrame(() => {
      skipNextBlurRef.current = false;
    });
    if (activeField === "start" || activeField === "end") {
      setDraft((current) => ({
        ...current,
        [activeField]: savedDraftRef.current[activeField],
      }));
    } else if (activeField === "duration") {
      setDraft((current) => ({
        ...current,
        end: savedDraftRef.current.end,
        endDate: savedDraftRef.current.endDate,
        duration: savedDraftRef.current.duration,
      }));
    } else {
      const draftField = activeField === "project" ? "projectId" : (activeField ?? "task");
      setDraft((current) => ({
        ...current,
        [draftField]: savedDraftRef.current[draftField],
      }));
    }
    setValidationMessage(null);
    onDeactivate();
  };

  useEffect(() => {
    if (!activeField) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (pendingEdit) return;
      const target = event.target instanceof Element ? event.target : null;
      const clickedEditor = target?.closest("[data-tracker-editor]");
      if (clickedEditor && rowRef.current?.contains(clickedEditor)) return;

      const clickedDatePicker = target?.closest(
        "[data-tracker-date-picker], [data-tracker-date-picker-popover]",
      );
      const clickedProjectSelect = target?.closest(
        "[data-project-select], [data-project-select-popover]",
      );

      const clickedActiveOverlay =
        (activeField === "date" && clickedDatePicker) ||
        (activeField === "project" && clickedProjectSelect);
      if (clickedActiveOverlay) return;

      restoreField();
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  });

  const confirmPendingEdit = () => {
    if (!pendingEdit) return;
    const result = updateEntry(entry.id, pendingEdit.patch);
    if (!result.success) {
      setValidationMessage(error(result.error));
      setPendingEdit(null);
      return;
    }
    notifySaved(pendingEdit.candidate);
    setPendingEdit(null);
    onDeactivate();
  };

  const handleTextKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    field: "task" | "description",
  ) => {
    // Keep typing out of the table's type-ahead search, which captures spaces.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      restoreField();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (commitField(field, draft[field])) onDeactivate();
    }
  };

  const handleTimeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      restoreField();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitTime(draft.start, draft.end, true);
    }
  };

  const handleDurationKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      restoreField();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitDuration(draft.duration, true);
    }
  };

  const handleEditorBlur = () => {
    if (skipNextBlurRef.current || pendingEdit) return;
    restoreField();
  };

  return {
    rowRef,
    focusRef,
    timeFieldRef,
    draft,
    setDraft,
    validationMessage,
    pendingEdit,
    setPendingEdit,
    commitField,
    restoreField,
    confirmPendingEdit,
    handleTextKeyDown,
    handleTimeKeyDown,
    handleDurationKeyDown,
    handleEditorBlur,
  };
}
