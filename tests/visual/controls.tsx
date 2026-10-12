import "@fontsource-variable/inter";
import "../../src/styles.css";
import { createRoot } from "react-dom/client";
import { Label } from "@heroui/react/label";
import { Switch } from "@heroui/react/switch";

function Controls() {
  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <h1>Controles isolados</h1>
      <Switch>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Faturável</Label>
        </Switch.Content>
      </Switch>
      <Switch isDisabled>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Desabilitado</Label>
        </Switch.Content>
      </Switch>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Controls />);
