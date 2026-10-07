# Trackify design direction

## Product character

Trackify should feel quiet, clear and slightly premium. The interface
supports a quick return to work rather than asking users to configure a large
system before they can track time.

## HeroUI consolidation

- HeroUI is the single visual system for active product UI. Use `Card` for
  route-level surfaces, `Table`/`DataTable` for read-only data, `Form` and
  `TextField` for forms, `FieldError` for local validation, `Alert` for
  persistent errors, `Toast` for brief confirmations, `Link` for visible
  navigation, and `Avatar` for user or image identity.
- Do not add local components or CSS that recreate HeroUI radius, borders,
  focus rings, shadows, menus, cards, fields or states. Local styles may only
  express layout, sizing, truncation, responsive behavior and structural
  scrolling.
- The Tracker table keeps a semantic fixed-column implementation because it
  needs stable cell-level editing. This is a geometry exception, not a second
  visual system; its editors remain HeroUI controls.
- Hidden `input type="file"` elements are permitted only as the browser API
  behind a visible HeroUI upload button. Native markup is otherwise limited to
  boot/error fallbacks and the independent HTML used to print PDF reports.
- `src/components/ui` is retired. New imports from that path and direct use of
  the legacy UI dependencies are prohibited and checked by `npm run audit:ui`.

## Visual system

- Use HeroUI components as the default source of controls, overlays, tables,
  feedback and states.
- Use Tailwind utilities for spacing and responsive layout; avoid a second
  custom component framework.
- Use a restrained neutral surface palette with one accent for primary actions
  and status feedback.
- Treat HeroUI `Card`, `PageHeader`, `DataTable` and `LoadingState` as the
  official shared building blocks for route-level composition. New reusable
  components should consume these patterns instead of inventing a parallel
  surface, table or loading treatment. `DataTable` is the standard read-only
  table; the Tracker's semantic table is the documented geometry exception for
  cell-level editing.
- Use a near-borderless surface policy: cards and sections separate through
  background contrast, spacing and restrained elevation. Reserve visible
  borders for input-like fields, table separators, validation, focus and
  boundaries that would otherwise lose context.
- In dark mode, follow the HeroUI form-reference contrast hierarchy: a near-black
  canvas, distinct charcoal field surfaces, bright labels, cool blue-gray support
  text, vivid blue primary actions and clear red danger states.
- In light mode, use the same hierarchy through a soft gray canvas, white
  surfaces and tinted field fills. Field controls must not use drop shadows as
  their primary separation mechanism; focus may use the shared accent ring.
- Use strong, readable headings and compact supporting text. Keep dense data
  scannable with tabular numerals and aligned values.
- Use `@gravity-ui/icons` icons with labels or tooltips. Do not use decorative icon-only
  controls without an accessible name.

## Layout

- Tracker is the product center: a compact timer composer is the primary
  action, followed by the selected week of time entries.
- Treat the timer composer as one responsive toolbar: at desktop widths it
  stays on one line with a flexible task field, controlled project width and
  non-shrinking time/actions/billability controls. At tablet and mobile sizes,
  wrapping is intentional and follows priority (task, project/time, actions,
  then compact billability), never accidental or page-wide.
- Keep the composer quiet and unified: Billable belongs to the primary
  control row, and the active state is communicated by the timer controls and
  live clock without adding a secondary status strip. Use min-width
  constraints and shrink-safe controls to preserve the toolbar's geometry
  across viewport sizes.
- Billable uses a compact icon-only HeroUI ToggleButton in the composer. Its
  selected state uses the system's success-soft green and its resting state is
  neutral, creating a quiet visual association without adding a text label to
  the toolbar. It shares the same height and baseline as the timer actions; no
  vertical Switch or isolated control row is used in this toolbar. The
  accessible label remains available to assistive technology.
- On smaller screens, clock, timer actions and Billable travel as one compact
  control group and wrap only between those controls when the available width
  requires it; Task and Project keep their own full-width priority rows.
- Follow the familiar trackify hierarchy: composer, week total, then one
  aligned flat table with task, project/client, start, end, date, duration and
  quick actions. The date belongs in the Date column, not in repeated row
  headers. Days are shown from most recent to oldest, while entries within a
  day remain ordered by start time. Entries from the same date, task, project
  and billability state are grouped into one compact summary row.
- Multi-entry groups start collapsed and show their count, first start, last end
  and summed duration. The summary row is read-only and expands to reveal the
  individual entries; inline editing remains available on those detail rows.
- Collapsed group summaries use the same neutral surface as ordinary entries.
  Only the individual detail rows receive the subtle secondary-surface tint
  while a group is expanded. Task descriptions align to the task title's left
  edge, while billability remains attached to the title line only.
- Group summaries preserve the same vertical rhythm as detail rows: the task
  line carries the count and expansion control, with a quiet second line such
  as `3 entries`. Start again and the actions menu occupy fixed, shared slots
  across summary and detail rows, so grouping never shifts the table's action
  geometry. The expansion control uses a subtle hover state and a visible
  focus ring without making the summary look like an input or card.
- Descriptions stay attached to their individual entries and do not prevent
  grouping. Changing an entry's date, task, project or billability immediately
  recalculates its group membership.
- Use the selected period as the main navigation unit. The Tracker opens on
  `This week`, and clicking the fixed-width period trigger opens the HeroUI
  range calendar directly; there is no preset menu or calendar icon in the
  trigger. Keep the label centered in a compact fixed-width control; weekly
  ranges use a compact visible format while the full year remains available
  to assistive labels and the calendar. The
  arrows move by week for aligned week ranges and by the custom range length
  for arbitrary dates. Custom ranges use the same compact date treatment as
  weekly ranges and do not show a `Custom range` label inside the trigger.
  When the selection is not the current week, expose a
  compact `This week` return action beside the next arrow. A custom selection
  displays the selected interval using the same compact date treatment. Show a
  quiet contextual total rather than summary cards.
- Keep one manual Add entry action beside the selected week's total. Avoid
  duplicate global, page-level and per-day actions when the timer composer and
  Date column are already visible.
- Prefer direct cell-level editing for the fields users need to correct most
  often. Clicking a value replaces only that value with its editor; never
  expand the row into a card and never add an Edit action.
- Duration is edited as `H:MM` and accepts compact Clockify-style values such as
  `2400`, `825`, `2h`, `2:45` and `45s`; it recalculates the end time while
  keeping the start time fixed. On narrow screens, the table owns horizontal
  scrolling so the page itself does not overflow. At the compact-desktop `1200px` CSS
  viewport and above, the table fits beside the open sidebar without
  horizontal scrolling.
- Standard read-only tables use the shared `DataTable` component, which keeps
  HeroUI's primary surface, internal cell rounding and `ScrollContainer` in
  one place. The editable Tracker table remains semantic and owns only the
  fixed-column geometry required for cell editing. When a viewport cannot fit
  all columns, horizontal scrolling belongs to the table container, never to
  the document body.
- Use the effective CSS viewport, rather than the physical diagonal of a
  laptop, as the responsive reference because operating-system display scaling
  changes the number of CSS pixels available at browser zoom 100%.
- Keep the table at a stable minimum width below `1200px` so time inputs and
  action controls remain fully visible. Above that threshold, compact the
  horizontal cell padding while preserving the same column alignment. Inline
  editors must preserve the row's column geometry, and compact actions must
  remain square instead of shrinking into pills.
- `Start` and `End` are separate table columns with fixed-width controls. Each
  field is edited independently in place, so the static and editing states keep
  the same width, height and visual rhythm. Overnight entries remain grouped by
  their start date; the End value shows a quiet `+1`, `+2` or equivalent day
  offset instead of splitting the entry into another row.
- Inline cell actions use compact HeroUI `Button` and `Input` components. Do
  not present static values as large filled fields or add native HTML controls
  when a HeroUI control already provides the interaction.
- Compact page filters and action-level selectors use the same HeroUI pill
  radius as primary action buttons, keeping their height, focus ring and
  horizontal rhythm consistent across the system. Form fields retain the
  standard HeroUI field radius so action controls remain distinct from inputs.
- Project selectors use one shared searchable HeroUI pattern. The popover
  always opens with a focused `Search projects` field, matches project and
  client names without case or accent sensitivity, preserves `No project` (and
  `All projects` in filters), and reports `No projects found` when needed.
  Archived projects stay hidden for new assignments but remain available when
  editing a historical entry; the popover remains viewport-constrained and
  never changes the Tracker table geometry.

## Phase 1A product rules

- A timer may start without a task; in that case it receives `Untitled task`
  so it can persist safely and be named while running. A non-empty task remains
  required for manual and edited time entries. Notes and project assignment
  remain optional.
- Overlapping entries for the same user and workspace are allowed because
  legitimate work can be duplicated or reconciled later. Manual creation and
  editing require a confirmation that identifies the conflicting task, time
  and duration; stopping a timer gives the same information as a non-blocking
  warning. Adjacent entries whose end and start times are equal do not overlap,
  and reports keep every overlapping entry visible in their totals.
- Work that crosses midnight remains one entry. The entry keeps its start date,
  records an explicit end date when it differs, and uses elapsed seconds as the
  authoritative value for totals and reports.
- Billability defaults to the selected project's setting. Entries without a
  project use the workspace default. The user may override that value per timer
  or entry without changing either default.
- Archiving a project prevents new assignments while preserving its name,
  client and all existing entries in history and reports. Historical entries
  may retain the archived project, and a project with tracked time cannot be
  permanently deleted.
- Timer dates, clock values and report period boundaries use the active user's
  IANA time zone preference. New local profiles default to the device time zone;
  UTC is the safe fallback when it cannot be resolved.
- Running and paused are both active timer states. At most one active timer is
  stored for each user and workspace, and manual creation is unavailable until
  that timer is stopped.
- Starting again from a historical entry copies its task, project and
  billability into a new timer without changing the entry. Missing, archived,
  inactive or unassigned projects stop the action with a clear error instead
  of silently choosing a replacement; an explicitly unassigned entry may start
  without a project. The restarted task moves to the front of recent tasks and
  preserves favorite metadata.
- When personal reminders are enabled, a non-blocking reminder appears at each
  completed 60-minute boundary of a running timer. Reloading derives the next
  boundary from persisted elapsed time, and a reminder that becomes due in a
  background tab waits until the tab is visible. Disabling reminders cancels
  pending notifications. Showing or dismissing a reminder never pauses, resets
  or otherwise changes the timer.

- The live timer is a persistent state, not a page-local counter. A timestamp
  is the source of truth for running time, while paused time is stored as
  accumulated seconds. The active timer survives reloads, route changes and
  browser restarts through server-side persistence, and is cleared only after an explicit
  stop action. A stopped timer uses its start date and stores an optional end
  date when the session crosses midnight; `seconds` remains authoritative for
  totals, including sessions that span more than one day. Task, project and
  billability remain editable while the timer is active and are persisted with
  the timer. Only one active timer is allowed, and manual creation is blocked
  while a timer is running or paused. Timers shorter than one minute preserve
  their real seconds instead of being silently rounded up.
- Entries, projects, clients and workspace settings use the authenticated
  database API. Invalid server responses do not replace a valid active timer.
- All date selection uses the shared HeroUI DatePicker and Calendar pattern.
  Native browser date pickers are not used; inline date edits and manual log
  forms share the same calendar, keyboard navigation and visual language. The
  inline Date field keeps a compact fixed footprint, reserves space for the
  calendar trigger, and anchors the popover to that trigger so editing never
  overlaps adjacent columns. Selecting a date closes the calendar once, keeps
  the selected value in the field, and the popover flips or constrains itself
  to the available visual viewport on small screens. Calendar surfaces are
  compact, use short weekday labels and never become scroll containers in
  either direction; responsive sizing and placement keep the complete grid
  visible without document overflow.
- Save valid inline changes automatically. Keep deletion as the only explicit
  destructive row action. Confirm deletion with HeroUI and offer a short
  HeroUI Toast `Undo` action that restores the complete entry.
- A time entry may be unassigned (`No project` / `No client`). Every project
  must have a valid client, and a time entry derives its client from its
  selected project rather than storing a second client relationship.
- Projects remain compact cards for quick scanning, with a stable hierarchy:
  identity in the header, the billability chip beside the three-dot action
  menu, and tracked time plus last activity anchored in a compact two-column
  footer without an internal divider.
  The reversible `active`/`on-hold` switch
  lives inside the action menu, while `archived` remains a separate read-only
  state. Long names and client names truncate without changing card geometry;
  the project link does not contain switches or action menus.
- Clients are managed in the existing responsive table. They have no billable
  status; billability belongs to the project default and can be overridden on
  each task/time entry. Client creation uses a HeroUI form, while deletion is
  confirmed in a HeroUI modal and blocked when projects still reference it.
- Team is an access-management surface. Invite members with email and a
  `Member` or `Admin` role; `Owner` access remains reserved. Pending invitations
  stay in the same table with an `Invited` status, show `Resend invite` and
  `Cancel invite` in the shared action menu, and use HeroUI Toast/Modal
  feedback. The local mock prepares and persists invitation state, while real
  email delivery remains an integration boundary. Removing an active member
  is an explicit, confirmed access-revocation action: it removes current
  project assignments but preserves tracked history and reports. The Owner and
  the last Admin are protected. Removed members remain visible as `Removed`
  for auditability and can be restored; restoration does not automatically
  reassign projects. Invitation cancellation remains a separate action.
- Archive and restore are explicit actions in the project card menu. Archiving
  requires a HeroUI confirmation modal, keeps existing entries intact, and
  moves the project out of Active and Inactive until it is restored.
- Desktop uses a collapsible sidebar and a focused content column.
- The desktop sidebar is fixed to the viewport; only the content column scrolls,
  while the collapsed state preserves the same fixed rail.
- The sidebar is organized into `Workspace` (Tracker, Projects, Clients, Team
  and Reports) and `Manage` (Integrations and Settings). Section labels are
  quiet and disappear in the collapsed rail without removing accessible names.
- The expanded desktop sidebar is 224px wide and keeps its navigation hierarchy
  intentionally light. The profile avatar/menu is anchored at the top, while
  workspace selection is anchored in the footer. The global HeroUI search
  remains in the header at every responsive size, preserving one predictable
  location.
- Small screens replace the horizontal navigation strip with a left HeroUI
  Drawer. The header keeps only menu, search and timer access; the Drawer
  mirrors the desktop hierarchy with profile at the top, grouped navigation in
  the middle and workspace selection in the footer.
- Navigation links use a calm `bg-surface-secondary` active state, visible
  focus, truncation for long labels and consistent HeroUI radius and density.
- The workspace switcher is a compact HeroUI Card anchored in the sidebar
  footer, without a separator rule. Its name and role remain the only visible
  context in the expanded state; the collapsed state uses the same neutral
  card geometry with a generic workspace icon. The workspace logo and
  workspace initials/avatar are never shown in the
  sidebar; a generic workspace icon is used only as a compact footer switcher
  control, while the optional logo remains reserved for report PDFs. The
  profile avatar remains the only identity avatar in the sidebar and is placed
  at the top; workspace controls use neutral system color rather than accent
  color. The collapse/expand control is neutral at rest and only gains a
  background on hover or visible focus. When no profile photo exists, the
  identity avatar uses the system gradient fallback rather than initials.
- Prefer one clear primary action per surface. Secondary actions should remain
  contextual and visually quiet.
- Menus opened by three-dot action triggers use the shared HeroUI
  `ActionDropdown` pattern: compact rows, aligned icons, rounded hover and
  focus states, and responsive viewport-constrained popovers.
- Reports is one sidebar section with an expandable submenu for `Detailed`,
  `Summary`, `Weekly` and `Team`. The parent uses `aria-expanded` and
  `aria-controls`; the active report view is highlighted and mirrored by the
  page-level HeroUI selector. Reports is highlighted only on `/reports`; its
  previously opened state never marks unrelated pages. The same navigation
  works in the expanded, collapsed and mobile Drawer layouts.
- Action dropdowns do not display keyboard shortcut badges. HeroUI keeps the
  interaction keyboard-accessible through focus management, arrow navigation,
  `Enter`, `Space`, `Escape`, and click-away dismissal.
- Destructive actions such as deleting or archiving use the HeroUI danger
  treatment; reversible and informational actions retain the default tone.

## Reports

- Reports are driven by one memoized pipeline: permission scope, period,
  filters, lookup maps, totals and the selected view. The period is the primary
  filter and is synchronized in the URL so a report can be reloaded without
  losing context.
- `Detailed` is a flat line-by-line table. `Summary` supports Project, Client,
  Member, Task or Date grouping with an optional second level. `Weekly` is
  always a complete week and can group by Project or Member. `Team` presents
  member-level totals, billing mix, records, projects, clients, active-day
  average and share.
- Report presets are Today, Yesterday, This week, Last week, Last 2 weeks, This
  month, Last month, This year, Last year and Custom range. Custom ranges use
  the HeroUI `RangeCalendar`, normalize reversed selections and close after a
  valid range is selected. Weekly normalizes any selection to one full week.
- The period popover shows one compact seven-column HeroUI calendar grid at a
  time. Presets remain alongside it on larger screens without duplicate month
  panels or calendar scrolling.
- The filter bar supports Team, Client, Project, Description and
  Billability. Team is available only to Admins and Owners. Client and Project
  filters support multiple selections and accent-insensitive search; `No
project` remains a first-class report category. Hidden filters keep their
  values until `Clear filters` is used. Tags and approval Status are not shown
  until the data model supports them.
- The report filter bar is one official HeroUI `Toolbar` composition rather
  than a large enclosing card. The period uses the official `DateRangePicker`
  anatomy (`DateField.Group`, date segments, `DateRangePicker.Trigger` and
  `DateRangePicker.Popover`) so its calendar is anchored to the field instead
  of a hand-positioned panel. Team, Client, Project and Billability are all
  HeroUI `Select` controls; multi-select popovers keep their search field and
  `ListBox` inside the Select composition. No Button or div is used to imitate
  a Select. `Clear filters` is an icon-only HeroUI ghost action with an
  accessible label and remains disabled when there are no active selections,
  while Description remains a standard HeroUI text field for free-text
  matching.
- `ButtonGroup` is reserved for related previous/next controls in Weekly. The
  toolbar and each HeroUI control use their official defaults; local classes
  only provide structural layout for wrapping and the bounded option list.
  Presets and categorical options use HeroUI `ListBox`/`Select` primitives.
  Task remains available as a report column and Summary grouping dimension,
  but is intentionally not a toolbar filter. Report views are selected from
  the Reports submenu in the sidebar; the report toolbar contains only the
  period and data filters, with no duplicate view or filter-visibility
  dropdown.
- Period navigation, data filters and reset share one compact filter bar. The
  period context comes first, followed by Team, Client, Project, Description
  and Billability; the controls wrap between themselves on narrow screens,
  never inside a control. Date and option popovers use the official HeroUI
  overlay components, remain viewport-constrained, preserve keyboard focus and
  do not move the report content when opened.
- Members are scoped to their own entries in Reports and exports. Admins and
  Owners can analyze the full workspace. Detailed results are paginated at 50
  rows, while summary, weekly and team aggregation is calculated once per
  filter change. Empty results explain the state and provide a clear-filters
  action.
- CSV, XLSX and downloadable PDF exports receive the already filtered dataset
  and active view, preventing screen/export divergence. Export columns use the
  existing model only and retain overnight end-date indicators such as `+1`.
  PDF output is a clean, light, print-oriented document with Trackify
  branding, report context, active-filter metadata, totals and a paginated
  table whose header repeats across printed pages. PDF generation is loaded
  only when requested and downloads directly, without opening a print dialog.
- Summary, Weekly and Team use a small set of complementary, accessible HeroUI
  visualizations: `ProgressCircle` communicates proportions and concentration,
  while `ProgressBar` communicates ranked comparisons and daily activity.
  Detailed remains table-first with no chart. These primitives keep the
  dashboard light while giving each report a distinct visual reading instead
  of repeating one chart pattern. The report toolbar uses HeroUI `Button`,
  `Select`, `Popover`, `ListBox`, `Checkbox`, `Input` and `RangeCalendar`
  defaults consistently.

## Interaction and states

- Timer states are idle, running and paused. The current state must be obvious
  from text, color and available actions, not color alone.
- Forms should show their purpose through labels, preserve entered values and
  disable submission only when the input is invalid.
- Long forms keep the HeroUI modal header and footer available while the body
  scrolls inside the viewport; the scrollbar stays visually hidden without
  removing wheel, touch or keyboard scrolling.
- Form controls use HeroUI defaults for size, spacing, radius, focus and color.
  `TextField` composes labels, inputs, descriptions and field errors; persistent
  validation uses HeroUI `Alert`, while short confirmations use `Toast`.
- Input surfaces must remain visibly distinct from their canvas in both themes,
  and muted text must stay readable without relying on low-contrast gray-on-gray
  states or field shadows.
- Loading uses the shared HeroUI Spinner with a compact status surface; empty
  states explain what is missing and provide the next action; errors offer
  recovery or a safe return path.
- Toasts confirm completed local actions. Alerts are reserved for conditions
  that require attention.
- Motion is limited to menus, dialogs, timer state changes and short item
  transitions. Avoid animated panels or decorative movement in the weekly list.

## Accessibility

- Keep a visible focus indicator and a logical keyboard order.
- Provide labels for search, form controls, switches and icon buttons.
- Use semantic headings and table headers.
- Give scrollable table regions an accessible name and description, and expose
  `scope="col"` on data-table headers.
- Keep important status text available to assistive technology.
- Validate responsive behavior at desktop, tablet and mobile widths.

## Permissions and preview identity

- The product permission matrix is:

  | Capability                              |    Member     |     Admin      |     Owner      |
  | --------------------------------------- | :-----------: | :------------: | :------------: |
  | Start, pause and stop own timer         |      Yes      |      Yes       |      Yes       |
  | Create, edit and delete own entries     |      Yes      |      Yes       |      Yes       |
  | Edit or delete another person's entries |      No       |       No       |       No       |
  | View projects, clients and team         |      Yes      |      Yes       |      Yes       |
  | Change own role or remove own account   |      No       |       No       |       No       |
  | Use projects in tracking                | Assigned only |      All       |      All       |
  | Create, edit or archive projects        |      No       |      Yes       |      Yes       |
  | Change project billability              |      No       |      Yes       |      Yes       |
  | Assign members to projects              |      No       |      Yes       |      Yes       |
  | Create clients                          |      No       |      Yes       |      Yes       |
  | Delete clients without projects         |      No       |      Yes       |      Yes       |
  | View Reports                            |  Own records  | Full workspace | Full workspace |
  | Export Reports                          |  Own records  | Full workspace | Full workspace |
  | Invite Members                          |      No       |      Yes       |      Yes       |
  | Invite Admins                           |      No       |       No       |      Yes       |
  | Remove or restore Members               |      No       |      Yes       |      Yes       |
  | Remove or restore Admins                |      No       |       No       |      Yes       |
  | Promote Member to Admin                 |      No       |      Yes       |      Yes       |
  | Demote Admin                            |      No       |       No       |      Yes       |
  | Alter or remove Owner                   |      No       |       No       |       No       |
  | Workspace settings                      |      No       |      Yes       |      Yes       |
  | Personal preferences                    |      Yes      |      Yes       |      Yes       |
  | Connect or sync integrations            |      No       |      Yes       |      Yes       |

- Roles are enforced as capabilities in the store, not treated as display-only labels.
- The Owner's own row in Team is read-only. It keeps the `Owner` role, `Active`
  status and tracked time visible but has no action menu. The Owner cannot change
  its own role, remove its own account, or edit its name/email; personal
  preferences remain available in Settings.
  Members can track and manage only their own entries, see shared workspace records,
  and use only projects assigned to them. Admins can manage projects, clients,
  project assignments, Members, workspace settings and integrations. Owners can
  also manage Admins, while the Owner account itself remains protected.
- Reports and exports are scoped to the active identity for Members and to the
  complete workspace for Admins and the Owner. Entries created by another person
  remain read-only for every role.
- Project visibility is shared, but project selectors for Members show only assigned
  active projects plus `No project`. Removing a member removes current assignments
  without changing historical entries; restoring access does not reassign projects.
- Team management protects Owner and the last active Admin. Admins can invite,
  remove, restore and promote Members, but cannot change existing Admins or invite
  Admins. Only the Owner can manage Admin roles.
- The Workspaces edit modal owns workspace-wide defaults: workspace name, default
  billability and week start. These controls require Admin or Owner access;
  reminders, weekly digest and idle detection remain personal preferences in
  Settings.
- `Preview identity` in Settings is a local-only mock control for Marina (Owner),
  Caio (Admin) and Helena (Member). It is not authentication. Switching requires
  an idle timer and reloads the application; active timers are stored under the
  selected identity so one preview user cannot affect another.
- Workspace data, members, settings and per-member preferences use a versioned
  local snapshot with safe seed fallback and migration from the previous shape.
  Store guards remain authoritative even if a hidden UI action is called directly.

## Workspaces

- Workspaces are the product's isolation boundary. Each identity can create up
  to five workspaces, including archived ones; shared workspaces do not count
  toward that owned-workspace limit. Each workspace supports at most 50 active
  members or pending invitations.
- Clients, projects, members, entries, tracking defaults, preferences and
  integrations belong to the active workspace. New workspaces start empty and
  the creator receives the `Owner` membership for that workspace.
- The sidebar workspace switcher does not show a workspace logo or initials
  avatar. It uses the workspace name and role in the footer when expanded and
  a generic workspace icon when compact. The optional logo is used exclusively
  for PDF report branding. The profile avatar/menu is placed at the top, and
  its menu places `Workspaces` immediately above `Settings`.
- Owners can edit, archive and restore their own workspaces. Archived
  workspaces are read-only. Members can leave a workspace owned by someone
  else; an Owner must archive rather than leave. Switching away from a running
  timer requires an explicit `Pause and switch` confirmation, while paused
  timers remain in their original workspace.
- Workspace logos are processed locally as PNG, JPG or WebP files up to
  approximately 500 KB. PDF exports include the active workspace name and logo
  when available, with `TB` as the no-logo fallback; CSV and XLSX remain
  text-only.
- The local account snapshot is versioned and migrates the former single
  workspace without discarding data. Invalid storage falls back to safe seeds.
  Production uses Supabase for authentication, persistence and cross-device
  synchronization; the local adapter remains available in development and QA.
