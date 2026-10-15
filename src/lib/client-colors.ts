export const defaultClientColor = "#000000";

export const clientColorOptions = [
  { id: "sky", label: "Sky", value: "#019ed4" },
  { id: "violet", label: "Violet", value: "#a37be4" },
  { id: "pink", label: "Pink", value: "#d52467" },
  { id: "orange", label: "Orange", value: "#f26e23" },
  { id: "emerald", label: "Emerald", value: "#60a702" },
  { id: "amber", label: "Amber", value: "#d4a200" },
  { id: "red", label: "Red", value: "#dd1d0d" },
  { id: "slate", label: "Slate", value: "#909499" },
] as const;

export function isClientColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function clientColorValue(value: unknown): string {
  return isClientColor(value) ? value.toLowerCase() : defaultClientColor;
}
