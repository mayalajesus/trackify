import { Avatar } from "@heroui/react/avatar";
import { Autocomplete } from "@heroui/react/autocomplete";
import { Button } from "@heroui/react/button";
import { Dropdown } from "@heroui/react/dropdown";
import { EmptyState } from "@heroui/react/empty-state";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { useFilter } from "@heroui/react/rac";
import { SearchField } from "@heroui/react/search-field";
import { Tag } from "@heroui/react/tag";
import { TagGroup } from "@heroui/react/tag-group";
import { TextField } from "@heroui/react/textfield";
import { Switch } from "@heroui/react/switch";
import { Typography } from "@heroui/react/typography";
import { toast } from "@/lib/toast";
import { ChevronDown } from "@gravity-ui/icons";
import { useEffect, useMemo, useState } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { getSessionDefaultAvatarUrl } from "@/lib/default-avatar";
import type { Project } from "@/lib/domain";
import { useI18n } from "@/lib/i18n";
import { defaultProjectColor } from "@/lib/project-colors";
import { useStore } from "@/lib/store";
import { sortClientsByName } from "@/lib/client-order";

export interface CreatedProjectSelection {
  id: string;
  billable: boolean;
}

interface ProjectFormModalProps {
  isOpen: boolean;
  project?: Project | null;
  initialName?: string;
  onOpenChange: (isOpen: boolean) => void;
  onCreated?: (project: CreatedProjectSelection) => void;
}

export function ProjectFormModal({
  isOpen,
  project = null,
  initialName = "",
  onOpenChange,
  onCreated,
}: ProjectFormModalProps) {
  const { clients, members, preferencesByUserId, today, addProject, updateProject } = useStore();
  const { locale, t, error } = useI18n();
  const sortedClients = useMemo(() => sortClientsByName(clients, locale), [clients, locale]);
  const { contains } = useFilter({ sensitivity: "base" });
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [projectBillable, setProjectBillable] = useState(false);
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setName(project?.name ?? initialName);
    setClientId(project?.clientId ?? "");
    setClientQuery("");
    setProjectBillable(project?.billable ?? false);
    setAssignedMemberIds(project?.memberIds ?? []);
    setMemberQuery("");
    setFormError(null);
  }, [initialName, isOpen, project]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );
  const assignedMemberIdSet = useMemo(() => new Set(assignedMemberIds), [assignedMemberIds]);
  const assignedMembers = useMemo(
    () => activeMembers.filter((member) => assignedMemberIdSet.has(member.id)),
    [activeMembers, assignedMemberIdSet],
  );
  const memberSearchResults = useMemo(() => {
    const query = memberQuery.trim();

    return activeMembers
      .filter(
        (member) =>
          !assignedMemberIdSet.has(member.id) &&
          (query.length === 0 || contains(member.name, query) || contains(member.email, query)),
      )
      .slice(0, 50);
  }, [activeMembers, assignedMemberIdSet, contains, memberQuery]);

  const setOpen = (open: boolean) => {
    if (!open) {
      setClientQuery("");
      setMemberQuery("");
      setFormError(null);
    }
    onOpenChange(open);
  };

  const addMember = (memberId: string) => {
    setAssignedMemberIds((current) =>
      current.includes(memberId) ? current : [...current, memberId],
    );
    setMemberQuery("");
  };

  const saveProject = () => {
    if (!name.trim() || !clientId) return;

    const result = project
      ? updateProject(project.id, {
          name: name.trim(),
          clientId,
          billable: projectBillable,
          color: defaultProjectColor,
          memberIds: assignedMemberIds,
        })
      : addProject({
          name: name.trim(),
          clientId,
          billable: projectBillable,
          status: "active",
          color: defaultProjectColor,
          lastActivity: today,
          memberIds: assignedMemberIds,
        });

    if (!result.success) {
      setFormError(error(result.error));
      return;
    }

    toast.success(t(project ? "Project updated" : "Project is ready"), {
      description: name.trim(),
    });
    if (!project && result.id) onCreated?.({ id: result.id, billable: projectBillable });
    setOpen(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={setOpen}>
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm" scroll="outside">
          <Modal.Dialog className="project-form-modal">
            <Modal.CloseTrigger />
            <ModalLayout.Header>{t(project ? "Edit project" : "New project")}</ModalLayout.Header>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                saveProject();
              }}
            >
              <ModalLayout.Body>
                {formError ? (
                  <FormAlert title={t("We couldn't create this project")} description={formError} />
                ) : null}

                <div className="min-w-0">
                  <TextField
                    isRequired
                    fullWidth
                    className="min-w-0 flex-1"
                    name="project-name"
                    value={name}
                    validate={(value) => (value.trim() ? null : t("Project name is required"))}
                    onChange={(value) => {
                      setName(value);
                      setFormError(null);
                    }}
                  >
                    <Label>{t("Name")}</Label>
                    <Input variant="secondary" placeholder={t("e.g. Brand refresh")} />
                    <FieldError />
                  </TextField>
                </div>

                <Switch
                  name="project-billable"
                  isSelected={projectBillable}
                  onChange={setProjectBillable}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Label>{t("Billable")}</Label>
                  </Switch.Content>
                </Switch>

                <Autocomplete
                  isRequired
                  fullWidth
                  name="project-client"
                  variant="secondary"
                  placeholder={t("Select a client")}
                  value={clientId || null}
                  onOpenChange={(open) => {
                    if (!open) setClientQuery("");
                  }}
                  onChange={(value) => {
                    setClientId(value === null ? "" : String(value));
                    setFormError(null);
                  }}
                >
                  <Label>{t("Client")}</Label>
                  <Autocomplete.Trigger>
                    <Autocomplete.Value />
                    <Autocomplete.Indicator />
                  </Autocomplete.Trigger>
                  <Autocomplete.Popover className="w-[var(--trigger-width)] max-w-[calc(100vw-2rem)] min-w-0">
                    <div className="flex flex-col gap-2 p-2">
                      <Autocomplete.Filter
                        filter={contains}
                        inputValue={clientQuery}
                        onInputChange={setClientQuery}
                      >
                        <SearchField
                          autoFocus
                          aria-label={t("Search clients")}
                          name="project-client-search"
                          variant="secondary"
                        >
                          <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder={`${t("Search clients")}...`} />
                            <SearchField.ClearButton />
                          </SearchField.Group>
                        </SearchField>
                        <ListBox
                          aria-label={t("Clients")}
                          className="max-h-64 overflow-y-auto"
                          renderEmptyState={() => <EmptyState>{t("No results")}</EmptyState>}
                        >
                          {sortedClients
                            .filter(
                              (client) =>
                                (client.status ?? "active") === "active" || client.id === clientId,
                            )
                            .map((client) => (
                              <ListBox.Item key={client.id} id={client.id} textValue={client.name}>
                                <Label>{client.name}</Label>
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                        </ListBox>
                      </Autocomplete.Filter>
                    </div>
                  </Autocomplete.Popover>
                  <FieldError>{t("Choose an existing client for this project.")}</FieldError>
                </Autocomplete>

                <div className="project-form-members space-y-2">
                  <Label>{t("Project members")}</Label>
                  <Dropdown>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={t("Add project members")}
                      className="project-form-members-trigger h-9 w-full justify-between gap-2 px-3"
                    >
                      <span className="truncate text-sm">{t("Add members")}</span>
                      <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                    </Button>
                    <Dropdown.Popover
                      className="w-[var(--trigger-width)] max-w-[calc(100vw-2rem)] min-w-0"
                      onOpenChange={(open) => {
                        if (!open) setMemberQuery("");
                      }}
                    >
                      <div className="flex flex-col gap-2 p-2">
                        <SearchField
                          autoFocus
                          aria-label={t("Search members")}
                          name="new-project-member-search"
                          value={memberQuery}
                          onChange={setMemberQuery}
                          variant="secondary"
                        >
                          <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder={`${t("Search members")}...`} />
                            <SearchField.ClearButton />
                          </SearchField.Group>
                        </SearchField>
                        {memberSearchResults.length === 0 ? (
                          <EmptyState>{t("No matching active members")}</EmptyState>
                        ) : (
                          <Dropdown.Menu
                            aria-label={t("Active members")}
                            selectionMode="single"
                            onAction={(key) => addMember(String(key))}
                            className="max-h-60 overflow-y-auto"
                          >
                            {memberSearchResults.map((member) => (
                              <Dropdown.Item
                                key={member.id}
                                id={member.id}
                                textValue={`${member.name} ${member.email}`}
                              >
                                <div className="shrink-0">
                                  <ProfileAvatar
                                    member={member}
                                    avatarUrl={preferencesByUserId[member.id]?.avatarUrl ?? null}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <Typography type="body-sm" truncate>
                                    {member.name}
                                  </Typography>
                                </div>
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        )}
                      </div>
                    </Dropdown.Popover>
                  </Dropdown>
                  {assignedMembers.length > 0 ? (
                    <div className="pt-3">
                      <TagGroup
                        aria-label={t("Selected members")}
                        className="project-members"
                        size="sm"
                        onRemove={(keys) => {
                          const removedIds = new Set(Array.from(keys, String));
                          setAssignedMemberIds((current) =>
                            current.filter((id) => !removedIds.has(id)),
                          );
                        }}
                      >
                        <Label>{t("Selected members")}</Label>
                        <TagGroup.List
                          items={assignedMembers}
                          renderEmptyState={() => (
                            <EmptyState className="p-1">{t("No members selected")}</EmptyState>
                          )}
                        >
                          {(member) => (
                            <Tag key={member.id} id={member.id} textValue={member.name}>
                              <Avatar className="size-5 shrink-0" size="sm">
                                <Avatar.Image
                                  alt={member.name}
                                  src={
                                    preferencesByUserId[member.id]?.avatarUrl ??
                                    getSessionDefaultAvatarUrl(member.id)
                                  }
                                />
                                <Avatar.Fallback>{member.initials}</Avatar.Fallback>
                              </Avatar>
                              <span className="max-w-40 truncate">{member.name}</span>
                              <Tag.RemoveButton
                                aria-label={t("Remove {name}", { name: member.name })}
                              />
                            </Tag>
                          )}
                        </TagGroup.List>
                      </TagGroup>
                    </div>
                  ) : null}
                </div>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" type="button" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button type="submit" isDisabled={!name.trim()}>
                  {t(project ? "Save changes" : "Create project")}
                </Button>
              </ModalLayout.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
