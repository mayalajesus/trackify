import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = join(root, "src");
const chartFile = "src/components/ui/chart.tsx";
const legacyImports = [
  "@radix-ui/",
  "class-variance-authority",
  "cmdk",
  "embla-carousel-react",
  "input-otp",
  "react-day-picker",
  "react-resizable-panels",
  "sonner",
  "vaul",
];
const forbiddenPaletteClasses =
  /\b(?:bg|border|ring|divide|decoration|fill|stroke|text)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/;
const appUiRoots = ["src/components/", "src/routes/", "src/main.tsx"];
const dynamicStyleExceptions = new Set([
  "src/components/detailed-report.tsx",
  "src/components/project-color-picker.tsx",
  "src/components/modal-select.tsx",
  "src/components/project-color.tsx",
  "src/routes/projects.index.tsx",
  "src/components/reports/overview-dashboard.tsx",
]);
const approvedThemeVariables = new Set([
  "--accent",
  "--accent-foreground",
  "--background",
  "--border",
  "--danger",
  "--danger-foreground",
  "--default",
  "--default-foreground",
  "--field-background",
  "--field-border",
  "--field-foreground",
  "--field-placeholder",
  "--focus",
  "--foreground",
  "--muted",
  "--overlay",
  "--overlay-foreground",
  "--scrollbar",
  "--segment",
  "--segment-foreground",
  "--separator",
  "--success",
  "--success-foreground",
  "--surface",
  "--surface-foreground",
  "--surface-secondary",
  "--surface-secondary-foreground",
  "--surface-tertiary",
  "--surface-tertiary-foreground",
  "--warning",
  "--warning-foreground",
  "--radius",
  "--field-radius",
  "--font-sans",
  "--navigation-border",
  "--navigation-field-border",
  "--navigation-selected",
  "--navigation-surface",
  "--theme-selection",
  "--theme-track",
]);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else if (/\.(tsx|ts|css)$/.test(entry.name)) files.push(path);
  }

  return files;
}

const violations = [];
const sourceFiles = await filesIn(sourceRoot);
const packageJson = JSON.parse(await readFile(join(root, "package.json")));
const packageNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });

for (const dependency of legacyImports) {
  const isPresent = packageNames.some((name) =>
    dependency.endsWith("/") ? name.startsWith(dependency) : name === dependency,
  );
  if (isPresent) violations.push(`package.json: legacy UI dependency ${dependency}`);
}

for (const path of sourceFiles) {
  const content = await readFile(path, "utf8");
  const file = relative(root, path).replaceAll("\\", "/");
  const isChartException = file === chartFile;
  const isAppUiFile = appUiRoots.some((rootPath) => file === rootPath || file.startsWith(rootPath));

  if (
    content.includes("@heroui-pro/") ||
    content.includes("hero-ui-pro") ||
    content.includes("heroui-pro")
  ) {
    violations.push(`${file}: HeroUI Pro is forbidden`);
  }

  if (content.includes("@/components/ui/") && !content.includes("@/components/ui/chart")) {
    violations.push(
      `${file}: only the approved chart helper may be imported from src/components/ui`,
    );
  }

  for (const dependency of legacyImports) {
    if (
      new RegExp(
        `(?:from|import\\s*\\(|require\\s*\\()\\s*[\\"']${dependency.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`,
      ).test(content)
    ) {
      violations.push(`${file}: legacy UI dependency ${dependency}`);
    }
  }

  if (content.includes('from "recharts"') || content.includes("from 'recharts'")) {
    if (
      !isChartException &&
      ![
        "src/components/reports/overview-dashboard.tsx",
        "src/components/report-distribution.tsx",
      ].includes(file)
    ) {
      violations.push(`${file}: Recharts is allowed only in the chart helper and reports route`);
    }
  }

  if (
    !isChartException &&
    !dynamicStyleExceptions.has(file) &&
    /\bstyle\s*=|<style\b|dangerouslySetInnerHTML/.test(content)
  ) {
    violations.push(`${file}: inline or authored styles are forbidden outside the chart exception`);
  }

  const contentForClassAudit =
    file === "src/components/layout/app-shell.tsx"
      ? content.replaceAll("bg-background", "")
      : content;
  if (!isChartException && isAppUiFile && forbiddenPaletteClasses.test(contentForClassAudit)) {
    violations.push(`${file}: hard-coded palette utility bypasses semantic theme tokens`);
  }

  if (file.endsWith(".css")) {
    const themeOverride = /--background\s*:\s*#060607\s*;/gi;
    const contentWithoutApprovedThemeOverride = content.replace(themeOverride, "");
    const contentWithoutApprovedColorScheme = contentWithoutApprovedThemeOverride.replace(
      /color-scheme\s*:\s*dark\s*;/gi,
      "",
    );
    const contentWithoutApprovedThemeVariables =
      file === "src/styles.css"
        ? contentWithoutApprovedColorScheme.replace(
            /(--[a-zA-Z0-9_-]+)\s*:/g,
            (declaration, variable) => (approvedThemeVariables.has(variable) ? "" : declaration),
          )
        : contentWithoutApprovedColorScheme;
    if (/--[a-zA-Z0-9_-]+\s*:/.test(contentWithoutApprovedThemeVariables)) {
      violations.push(`${file}: authored design token or theme variable`);
    }
    if (
      // Figma DEV component overrides live in this single reviewed stylesheet.
      file !== "src/styles.css" &&
      /(?<!-)\b(?:background|background-color|color|border|box-shadow|font|text-shadow)\s*:/.test(
        contentWithoutApprovedColorScheme,
      )
    ) {
      violations.push(`${file}: authored visual CSS property`);
    }
  }

  if (!file.endsWith(".tsx") || isChartException) continue;

  const nativeTags = content.match(/<(button|select|textarea|a|img)\b[\s\S]*?>/g) ?? [];
  for (const tag of nativeTags) {
    // Static brand assets retain native image sizing in desktop and mobile navigation.
    if (
      file === "src/components/layout/app-shell.tsx" &&
      tag.startsWith("<img") &&
      tag.includes("/brand/trackify-")
    )
      continue;
    violations.push(`${file}: native interactive/visual element ${tag.split(/\s|>/, 1)[0]}`);
  }

  const nativeInputs = content.match(/<input\b[\s\S]*?>/g) ?? [];
  for (const input of nativeInputs) {
    const isHiddenFileInput =
      /type\s*=\s*["']file["']/.test(input) &&
      /className\s*=\s*["'][^"']*\b(?:hidden|sr-only)\b/.test(input);
    if (!isHiddenFileInput) violations.push(`${file}: visible native input`);
  }
}

try {
  const uiDirectory = await stat(join(sourceRoot, "components", "ui"));
  if (uiDirectory.isDirectory()) {
    const uiFiles = (await filesIn(join(sourceRoot, "components", "ui"))).map((path) =>
      relative(root, path).replaceAll("\\", "/"),
    );
    for (const file of uiFiles) {
      if (file !== chartFile)
        violations.push(`${file}: only chart.tsx is allowed in src/components/ui`);
    }
  }
} catch {
  // The chart exception is optional when no chart is present.
}

if (violations.length > 0) {
  console.error("UI audit failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    "UI audit passed: HeroUI Core is the product UI system; shadcn/ui chart helper is the only approved exception.",
  );
}
