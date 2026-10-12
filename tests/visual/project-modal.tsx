import "@fontsource-variable/inter";
import "../../src/styles.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Button } from "@heroui/react/button";
import { ProjectFormModal } from "../../src/components/project-form-modal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../src/lib/auth-context";
import { StoreProvider } from "../../src/lib/store";
import { AppI18nProvider } from "../../src/lib/i18n";

function ProjectPreview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>Abrir projeto</Button>
      <ProjectFormModal isOpen={open} onOpenChange={setOpen} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <StoreProvider>
        <AppI18nProvider locale="pt-BR">
          <main style={{ padding: 24 }}>
            <ProjectPreview />
          </main>
        </AppI18nProvider>
      </StoreProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
