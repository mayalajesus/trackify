import { IconTooltip } from "@/components/icon-tooltip";
import { Dropdown } from "@heroui/react/dropdown";
import type { ReactNode } from "react";
import { Ellipsis } from "@gravity-ui/icons";

export type ActionDropdownItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  isSelected?: boolean;
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
      <Dropdown.Popover placement="bottom end" className="action-menu" containerPadding={12}>
        <Dropdown.Menu
          aria-label={ariaLabel}
          className="action-menu__list"
          onAction={(key) => onAction(String(key))}
        >
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              textValue={item.label}
              className="action-menu__item"
              data-tone={item.tone ?? "default"}
              {...(item.isDisabled ? { isDisabled: true } : {})}
              {...(item.tone === "danger" ? { variant: "danger" as const } : {})}
            >
              {item.icon ? (
                <span aria-hidden="true" className="action-menu__icon">
                  {item.icon}
                </span>
              ) : null}
              <span className="action-menu__label">{item.label}</span>
              {item.isSelected !== undefined ? (
                <span
                  aria-hidden="true"
                  className="action-menu__switch"
                  data-selected={item.isSelected}
                >
                  <span />
                </span>
              ) : item.trailing ? (
                <span className="action-menu__trailing">{item.trailing}</span>
              ) : null}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
