import "@fontsource-variable/inter";
import "../../src/styles.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Button } from "@heroui/react/button";
import { LogTimeModal } from "../../src/components/log-time-modal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../src/lib/auth-context";
import { StoreProvider } from "../../src/lib/store";
import { AppI18nProvider } from "../../src/lib/i18n";
import { TrackerEntries } from "../../src/components/tracker-entries";
import type { TimeEntry } from "../../src/lib/domain";

const entries: TimeEntry[] = [
  { id: "one", start: "13:34", end: "13:34", seconds: 5 },
  { id: "two", start: "13:34", end: "13:34", seconds: 5 },
  {
    id: "three",
    start: "23:59",
    end: "07:58",
    endDate: "2026-10-13",
    seconds: 28740,
    task: "Duração longa",
  },
  { id: "four", start: "08:00", end: "23:59", seconds: 57540, task: "Duração longa" },
  { id: "single", start: "09:00", end: "09:10", seconds: 600, task: "estudo" },
].map((entry) => ({
  userId: "visual-only",
  projectId: null,
  task: "Tarefa agrupada",
  date: "2026-10-12",
  billable: false,
  ...entry,
}));

function ManualPreview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>Abrir registro manual</Button>
      <LogTimeModal isOpen={open} onOpenChange={setOpen} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <StoreProvider>
        <AppI18nProvider locale="pt-BR">
          <main style={{ padding: 24 }}>
            <TrackerEntries days={[{ date: "2026-10-12", totalSeconds: 86290, entries }]} />
            <ManualPreview />
          </main>
        </AppI18nProvider>
      </StoreProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
