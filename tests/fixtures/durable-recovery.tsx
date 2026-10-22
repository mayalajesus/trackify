import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../src/lib/auth-context";
import { StoreProvider, useStore } from "../../src/lib/store";
import { RecoveryDialog } from "../../src/components/recovery-dialog";
import "../../src/styles.css";

function Fixture() {
  const store = useStore();
  if (store.accountLoading || !store.currentWorkspace) return <p>Loading fixture</p>;
  return (
    <main>
      <output aria-label="Client name">{store.clients[0]?.name}</output>
      <output aria-label="Timer status">{store.timer.status}</output>
      <button onClick={() => store.startTimer("Recovery stop regression", store.projects[0]!.id)}>
        Start fixture timer
      </button>
      <button onClick={() => store.stopTimer()}>Stop fixture timer</button>
      <output aria-label="Save error">{store.accountPersistenceError}</output>
      <button
        onClick={() => store.updateClient(store.clients[0]!.id, { name: "Local recovery edit" })}
      >
        Edit fixture client
      </button>
      <button onClick={store.downloadPendingChanges}>Download fixture draft</button>
      <RecoveryDialog />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <StoreProvider>
        <Fixture />
      </StoreProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
