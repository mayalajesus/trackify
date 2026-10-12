import { useState } from "react";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { ListBox } from "@heroui/react/list-box";
import { SearchField } from "@heroui/react/search-field";
import { toast } from "@heroui/react/toast";
import { Check, Plus } from "@gravity-ui/icons";
import { ModalLayout } from "./modal-layout";
import { ModalTriggerRegistration } from "./overlay-trigger-registration";
import { ProfileAvatar } from "./profile-avatar";
import { FormAlert } from "./form-feedback";
import type { Client } from "@/lib/domain";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export function ClientMembersModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { members, preferencesByUserId, updateClient } = useStore();
  const { t, error } = useI18n();
  const [selected, setSelected] = useState(client.memberIds ?? []);
  const [query, setQuery] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const available = members.filter((member) => member.status === "active");
  const visible = available.filter((member) =>
    `${member.name} ${member.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog className="client-form-modal client-members-modal">
            <Modal.CloseTrigger />
            <ModalLayout.Header>{t("Manage members")}</ModalLayout.Header>
            <ModalLayout.Body>
              <p className="text-sm text-muted">{client.name}</p>
              {failure ? (
                <FormAlert title={t("Unable to complete this action")} description={failure} />
              ) : null}
              <SearchField value={query} onChange={setQuery} aria-label={t("Search members")}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={t("Search members")} />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <p className="text-xs text-muted">
                {t("Selected members")} · {selected.length}
              </p>
              <ListBox
                aria-label={t("Team members")}
                selectionMode="multiple"
                selectedKeys={new Set(selected)}
                onSelectionChange={(keys) =>
                  setSelected(
                    keys === "all" ? available.map((m) => m.id) : Array.from(keys, String),
                  )
                }
                className="max-h-64 overflow-y-auto"
                renderEmptyState={() => (
                  <p className="p-3 text-sm text-muted">{t("No members found")}</p>
                )}
              >
                {visible.map((member) => (
                  <ListBox.Item id={member.id} key={member.id} textValue={member.name}>
                    <ProfileAvatar
                      member={member}
                      size="sm"
                      avatarUrl={preferencesByUserId[member.id]?.avatarUrl ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{member.name}</p>
                      <p className="truncate text-xs text-muted">{member.email}</p>
                    </div>
                    {selected.includes(member.id) ? (
                      <Check className="size-4 text-accent" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </ListBox.Item>
                ))}
              </ListBox>
            </ModalLayout.Body>
            <ModalLayout.Footer>
              <Button variant="secondary" slot="close">
                {t("Cancel")}
              </Button>
              <Button
                onPress={() => {
                  const result = updateClient(client.id, {
                    memberIds: selected.filter((id) => available.some((m) => m.id === id)),
                  });
                  if (!result.success) {
                    setFailure(error(result.error));
                    return;
                  }
                  toast.success(t("Client updated"));
                  onClose();
                }}
              >
                {t("Save changes")}
              </Button>
            </ModalLayout.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
