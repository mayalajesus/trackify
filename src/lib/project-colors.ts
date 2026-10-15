export type ProjectColorOption = {
  id: string;
  label: string;
  value: string;
};

export const defaultProjectColor = "#000000";

export const projectColorOptions: readonly ProjectColorOption[] = [
  { id: "black", label: "Black", value: defaultProjectColor },
];

// Keep accepting stored colors so existing callers and legacy projects remain compatible.
export function projectColorValue(color: string | null | undefined): string {
  void color;
  return defaultProjectColor;
}

export function projectColorTextValue(color: string | null | undefined): string {
  void color;
  return "var(--foreground)";
}
