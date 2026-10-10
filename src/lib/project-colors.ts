export type ProjectColorOption = {
  id: string;
  label: string;
  value: string;
};

export const projectColorOptions: readonly ProjectColorOption[] = [
  { id: "sky", label: "Sky", value: "#019ed4" },
  { id: "violet", label: "Violet", value: "#a37be4" },
  { id: "pink", label: "Pink", value: "#d52467" },
  { id: "orange", label: "Orange", value: "#f26e23" },
  { id: "emerald", label: "Emerald", value: "#60a702" },
  { id: "amber", label: "Amber", value: "#d4a200" },
  { id: "red", label: "Red", value: "#dd1d0d" },
  { id: "slate", label: "Slate", value: "#909499" },
];

export const defaultProjectColor = projectColorOptions[0]?.value ?? "#019ed4";

const legacyProjectColors: Record<string, string> = {
  accent: defaultProjectColor,
  "bg-accent": defaultProjectColor,
  success: "#b8f26b",
  "bg-success": "#b8f26b",
  warning: "#f3d77c",
  "bg-warning": "#f3d77c",
  danger: "#f2a1a1",
  "bg-danger": "#f2a1a1",
  foreground: "#b0bbc8",
  "bg-foreground": "#b0bbc8",
  "#38bdf8": "#9ddcf3",
  "#8b5cf6": "#c6b5f2",
  "#ec4899": "#f2b3cb",
  "#f97316": "#f2a77c",
  "#10b981": "#b8f26b",
  "#f59e0b": "#f3d77c",
  "#ef4444": "#f2a1a1",
  "#64748b": "#b0bbc8",
};

export function projectColorValue(color: string | null | undefined): string {
  const normalized = color?.trim().toLowerCase() ?? "";
  return (
    legacyProjectColors[normalized] ??
    (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(normalized) ? normalized : defaultProjectColor)
  );
}

export function projectColorTextValue(color: string | null | undefined): string {
  return `color-mix(in srgb, ${projectColorValue(color)} 72%, var(--foreground) 28%)`;
}
