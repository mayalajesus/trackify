import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../src/lib/auth-context";
import { StoreProvider, useStore } from "../../src/lib/store";

// Exercise real provider effects and network ordering without depending on
// unrelated combobox/popup behavior. Only the API is replaced by the test.
function TimerRecoveryFixture() {
  const store = useStore();
  if (store.accountLoading || !store.currentWorkspace) return <p>Loading fixture</p>;
  return (
    <main>
      <output aria-label="Timer status">{store.timer.status}</output>
      <output aria-label="Timer task">{store.timer.task}</output>
      <p role="alert">{store.accountPersistenceError}</p>
      <button onClick={() => store.startTimer("E2E pending timer recovery", store.projects[0]!.id)}>
        Start fixture timer
      </button>
      <button onClick={() => store.pauseTimer()}>Pause fixture timer</button>
      <button onClick={store.retryAccountSave}>Retry fixture save</button>
      <button onClick={store.downloadPendingChanges}>Download fixture draft</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <StoreProvider>
        <TimerRecoveryFixture />
      </StoreProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
