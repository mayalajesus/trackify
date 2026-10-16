import type { ReactNode } from "react";
import type { Project } from "@/lib/domain";
import { projectColorTextValue } from "@/lib/project-colors";
import { clientColorValue } from "@/lib/client-colors";

export function ClientColorLabel({
  color,
  children,
}: {
  color: string | undefined;
  children: ReactNode;
}) {
  const value = clientColorValue(color);
  return (
    <span style={{ color: value === "#000000" ? "var(--foreground)" : value }}>{children}</span>
  );
}

const projectLabelSizeClasses = {
  sm: "text-sm leading-5",
  lg: "text-2xl leading-8",
} as const;

const projectLabelWeightClasses = {
  medium: "font-medium",
  semibold: "font-semibold",
} as const;

export function ProjectLabel({
  project,
  label,
  className = "",
  size = "sm",
  weight = "medium",
}: {
  project?: Pick<Project, "color"> | null;
  label: ReactNode;
  className?: string;
  size?: keyof typeof projectLabelSizeClasses;
  weight?: keyof typeof projectLabelWeightClasses;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center ${className}`}>
      <span
        className={`min-w-0 truncate ${projectLabelSizeClasses[size]} ${projectLabelWeightClasses[weight]}`}
        style={project ? { color: projectColorTextValue(project.color) } : undefined}
      >
        {label}
      </span>
    </span>
  );
}
