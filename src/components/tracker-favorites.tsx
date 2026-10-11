import { Button } from "@heroui/react/button";
import { StarFill, Xmark } from "@gravity-ui/icons";
import { IconTooltip } from "@/components/icon-tooltip";
import { favoriteTaskKey, type FavoriteTask } from "@/lib/favorite-tasks";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export function TrackerFavorites({ onSelect }: { onSelect: (favorite: FavoriteTask) => void }) {
  const { favorites, toggleFavorite } = useFavoriteTasks();
  const { projects, timer } = useStore();
  const { t } = useI18n();
  const active = timer.status !== "idle";

  return favorites.length > 0 ? (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t("Favorite tasks")}
    >
      {favorites.map((favorite) => {
        const project = projects.find((item) => item.id === favorite.projectId);
        const unavailable = !project || project.status !== "active";
        return (
          <div
            key={favoriteTaskKey(favorite)}
            className="inline-flex max-w-full items-center rounded-full bg-default"
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-6 min-w-0 rounded-full px-2 text-xs"
              isDisabled={active || unavailable}
              aria-label={t("Use favorite {task}, {project}", {
                task: favorite.task,
                project: project?.name ?? t("Project unavailable"),
              })}
              onPress={() => onSelect(favorite)}
            >
              <StarFill className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span className="max-w-48 truncate">{favorite.task}</span>
              <span className="max-w-32 truncate text-xs text-muted">
                {unavailable ? t("Project unavailable") : project?.name}
              </span>
            </Button>
            <IconTooltip>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-5 min-w-5 rounded-full"
                aria-label={t("Remove {task} from favorites", { task: favorite.task })}
                onPress={() => toggleFavorite(favorite)}
              >
                <Xmark className="size-3" />
              </Button>
            </IconTooltip>
          </div>
        );
      })}
    </div>
  ) : null;
}
