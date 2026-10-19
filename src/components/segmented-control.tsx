import { ToggleButton } from "@heroui/react/toggle-button";
import { ToggleButtonGroup } from "@heroui/react/toggle-button-group";
import type { ReactNode } from "react";

// These controls choose a setting or display mode; they do not own tab panels.
// Keep the existing segmented visual styles with single-choice radio semantics.
export function SegmentedControl<T extends string>({
  value,
  onChange,
  label,
  options,
  className = "",
  itemClassName = "",
  isDisabled = false,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  options: ReadonlyArray<{ value: T; label: string; content?: ReactNode }>;
  className?: string;
  itemClassName?: string;
  isDisabled?: boolean;
}) {
  return (
    <div className={`segmented-control tabs ${className}`} data-orientation="horizontal">
      <div className="tabs__list-container">
        <ToggleButtonGroup
          className="tabs__list"
          aria-label={label}
          selectionMode="single"
          disallowEmptySelection
          isDetached
          isDisabled={isDisabled}
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const selected = options.find((option) => keys.has(option.value));
            if (selected) onChange(selected.value);
          }}
        >
          {options.map((option) => (
            <ToggleButton
              key={option.value}
              id={option.value}
              variant="ghost"
              aria-label={option.label}
              className={`tabs__tab ${itemClassName}`}
            >
              {option.content ?? option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
    </div>
  );
}
