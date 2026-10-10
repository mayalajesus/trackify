import { IconTooltip } from "@/components/icon-tooltip";
import { Chip } from "@heroui/react/chip";
import { Dropdown } from "@heroui/react/dropdown";
import type { ReactNode } from "react";
import { Ellipsis } from "@gravity-ui/icons";

export type ActionDropdownItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  tone?: "default" | "danger" | "warning";
  isDisabled?: boolean;
};

export function ActionDropdown({
  ariaLabel,
  items,
  onAction,
}: {
  ariaLabel: string;
  items: readonly ActionDropdownItem[];
  onAction: (id: string) => void;
}) {
  return (
    <Dropdown>
      <IconTooltip>
        <Dropdown.Trigger aria-label={ariaLabel} className="h-8 w-8 min-w-8 shrink-0 p-0">
          <Ellipsis className="size-4" />
        </Dropdown.Trigger>
      </IconTooltip>
      <Dropdown.Popover placement="bottom end" className="max-w-[calc(100vw-1.5rem)] min-w-48">
        <Dropdown.Menu onAction={(key) => onAction(String(key))}>
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              {...(item.isDisabled ? { isDisabled: true } : {})}
              {...(item.tone === "danger" ? { variant: "danger" as const } : {})}
            >
              {item.tone === "warning" ? (
                <Chip color="warning" size="sm" variant="tertiary" className="px-0 py-0">
                  {item.icon}
                  <Chip.Label>{item.label}</Chip.Label>
                </Chip>
              ) : (
                <span className="flex items-center gap-3">
                  {item.icon ? <span>{item.icon}</span> : null}
                  {item.label}
                </span>
              )}
              {item.trailing ? (
                <span className="ml-auto flex shrink-0 items-center">{item.trailing}</span>
              ) : null}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
