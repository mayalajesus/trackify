import { toast } from "@/lib/toast";
import { useStore } from "./store";
import { useI18n } from "./i18n";
import { favoriteTaskKey, type FavoriteTask } from "./favorite-tasks";

export function useFavoriteTasks() {
  const { preferences, activeWorkspaceId, projects, setUserPreferences } = useStore();
  const { t, error } = useI18n();
  const favorites = preferences.favoriteTasks?.[activeWorkspaceId] ?? [];
  const isFavorite = (task: { task: string; projectId: string | null }) =>
    favorites.some((item) => favoriteTaskKey(item) === favoriteTaskKey(task));
  const toggleFavorite = (task: { task: string; projectId: string | null; billable: boolean }) => {
    const existing = isFavorite(task);
    if (
      !existing &&
      (!task.task.trim() ||
        !projects.some((project) => project.id === task.projectId && project.status === "active"))
    ) {
      toast.warning(t("Choose a task and an active project to favorite"));
      return;
    }
    if (!existing && favorites.length >= 100) {
      toast.warning(t("You can save up to 100 favorite tasks per workspace"));
      return;
    }
    const next: FavoriteTask[] = existing
      ? favorites.filter((item) => favoriteTaskKey(item) !== favoriteTaskKey(task))
      : [
          ...favorites,
          { task: task.task.trim(), projectId: task.projectId!, billable: task.billable },
        ];
    const result = setUserPreferences({
      favoriteTasks: { ...preferences.favoriteTasks, [activeWorkspaceId]: next },
    });
    if (!result.success)
      toast.danger(t("Could not update favorites"), { description: error(result.error) });
  };
  return { favorites, isFavorite, toggleFavorite };
}
