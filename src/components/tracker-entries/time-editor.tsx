import { FieldError } from "@heroui/react/field-error";

import { TimeField } from "@heroui/react/time-field";

import { Tooltip } from "@heroui/react/tooltip";

import { Time } from "@internationalized/date";

import { type KeyboardEvent, type RefObject } from "react";

import { CircleExclamation } from "@gravity-ui/icons";

import { getDayOffset } from "@/lib/format";

export function EndTimeValue({
  startDate,
  end,
  endDate,
}: {
  startDate: string;
  end: string;
  endDate: string;
}) {
  const dayOffset = getDayOffset(startDate, endDate);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{end}</span>
      {dayOffset > 0 ? <sup>+{dayOffset}</sup> : null}
    </span>
  );
}

export function toTimeValue(value: string): Time | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  try {
    return new Time(hour, minute);
  } catch {
    return null;
  }
}

export function formatTimeValue(value: Time): string {
  return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

export function InlineValidationTooltip({
  message,
  label,
}: {
  message: string | null;
  label: string;
}) {
  if (!message) return null;

  return (
    <Tooltip delay={0} closeDelay={0} shouldSkipAnimation>
      <Tooltip.Trigger
        aria-label={label}
        className="inline-flex size-6 min-w-6 shrink-0 items-center justify-center"
        data-tracker-editor="true"
      >
        <CircleExclamation aria-hidden="true" className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-xs break-words" showArrow>
        {message}
      </Tooltip.Content>
    </Tooltip>
  );
}

export function TrackerTimeEditor({
  name,
  value,
  label,
  validationLabel,
  isInvalid,
  inputRef,
  onChange,
  onBlur,
  onKeyDown,
  errorMessage,
}: {
  name: string;
  value: string;
  label: string;
  validationLabel: string;
  isInvalid: boolean;
  inputRef: RefObject<HTMLDivElement | null>;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  errorMessage: string | null;
}) {
  const timeValue = toTimeValue(value) ?? new Time(0, 0);

  return (
    <div className="flex min-w-0 items-start gap-1">
      <TimeField
        aria-label={label}
        autoFocus
        className="inline-flex min-w-0 flex-1"
        granularity="minute"
        hourCycle={24}
        isInvalid={isInvalid}
        name={name}
        ref={inputRef}
        value={timeValue}
        onBlur={(event) => {
          const nextFocusedElement = event.relatedTarget;
          if (
            nextFocusedElement instanceof Node &&
            event.currentTarget.contains(nextFocusedElement)
          ) {
            return;
          }
          onBlur(value);
        }}
        onChange={(nextValue) => {
          if (nextValue) onChange(formatTimeValue(nextValue));
        }}
        onKeyDown={onKeyDown}
      >
        <TimeField.Group
          fullWidth
          variant="secondary"
          className="h-8 min-h-8 px-1"
          data-tracker-editor="true"
        >
          <TimeField.Input className="min-w-0 gap-0 overflow-hidden px-1 whitespace-nowrap">
            {(segment) => (
              <TimeField.Segment
                segment={segment}
                className="px-0.5 text-center whitespace-nowrap"
              />
            )}
          </TimeField.Input>
        </TimeField.Group>
        <FieldError className="sr-only">{errorMessage}</FieldError>
      </TimeField>
      <InlineValidationTooltip message={errorMessage} label={validationLabel} />
    </div>
  );
}
