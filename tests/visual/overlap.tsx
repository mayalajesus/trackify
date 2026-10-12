import "@fontsource-variable/inter";
import "../../src/styles.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@heroui/react/button";
import { OverlapConfirmation } from "../../src/components/overlap-confirmation";
import { AppI18nProvider } from "../../src/lib/i18n";

function Preview() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("Nenhuma ação");
  return (
    <AppI18nProvider locale="pt-BR">
      <Button onPress={() => setOpen(true)}>Abrir confirmação</Button>
      <p role="status">{result}</p>
      <OverlapConfirmation
        conflict={{
          id: "visual-only",
          userId: "visual-only",
          projectId: null,
          task: "Ajustes gerais para MVP",
          date: "2026-10-12",
          start: "08:24",
          end: "11:38",
          seconds: 11640,
          billable: false,
        }}
        isOpen={open}
        onCancel={() => {
          setResult("Cancelado");
          setOpen(false);
        }}
        onConfirm={() => {
          setResult("Confirmado");
          setOpen(false);
        }}
      />
    </AppI18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
