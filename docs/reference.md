# API reference

Full public surface of `@sanity-labs/workflow-kit`. For quickstart and usage guidance see the [README](../README.md).

Four entrypoints:

- [`/engine`](#engine-entrypoint) — pure functions for fetching, transitioning, gating, and role matching.
- [`/react`](#react-entrypoint) — dialog components, `WorkflowStatusPath`, task rows, and utilities.
- [`/studio`](#studio-entrypoint) — `StatusPathInput`, `buildTaskViewPath`, `useWorkflowProjectUsers`.
- [`/types`](#types-entrypoint) — a re-export of every type used across the kit.

---

## Engine entrypoint

```ts
import {
  WORKFLOW_QUERY,
  fetchWorkflowDefinition,
  getCachedWorkflowDefinition,
  findNextWorkflowStage,
  findWorkflowTransitionTarget,
  performWorkflowTransition,
  performWorkflowTransitionSideEffects,
  appendStatusAuditEntry,
  buildStatusAuditEntry,
  createTasksForWorkflowTemplates,
  resolveAssigneeForTaskTemplate,
  evaluateWorkflowStageGating,
  subscribeWorkflowStageGating,
  userHasWorkflowRoleAccess,
  canUseOffRampStage,
  getWorkflowRoleLabels,
  getOffRampDisabledTitle,
  findProjectUserForCurrentSanityMember,
  workflowRoleSlugMatches,
  normalizeWorkflowRoleSlug,
  getWorkflowRoleMatchCandidates,
  getLatestWorkflowStatusAuditEntry,
  shouldSkipPublishAuditEntry,
  stripDraftsPrefix,
  type AppendStatusAuditEntryParams,
  type CreateTasksForWorkflowTemplatesParams,
  type CreateTasksForWorkflowTemplatesResult,
  type PerformWorkflowTransitionParams,
  type PerformWorkflowTransitionSideEffectsParams,
  type WorkflowStageGatingResult,
  type WorkflowStageGatingTask,
  type WorkflowDefinition,
  type WorkflowTransitionStage,
  type WorkflowTransitionRole,
  type WorkflowTransitionDocument,
  type WorkflowTaskTemplate,
  type WorkflowStatusAuditEntry,
  type WorkflowAssignmentValue,
} from '@sanity-labs/workflow-kit/engine'
```

### Workflow definition fetching

#### `WORKFLOW_QUERY`

```ts
const WORKFLOW_QUERY: string
```

The GROQ query used by every definition fetch. Projects stages, off-ramps, and roles with the shape the rest of the engine expects. Parameter: `{docType: string}`.

#### `fetchWorkflowDefinition(client, documentType)`

```ts
function fetchWorkflowDefinition(
  client: SanityClient,
  documentType: string,
): Promise<WorkflowDefinition | null>
```

Uncached `client.fetch(WORKFLOW_QUERY, {docType: documentType})`.

#### `getCachedWorkflowDefinition(client, documentType)`

```ts
function getCachedWorkflowDefinition(
  client: SanityClient,
  documentType: string,
): Promise<WorkflowDefinition | null>
```

Same as `fetchWorkflowDefinition`, but dedupes in-flight requests keyed by `projectId:dataset:documentType`. The cached entry is cleared once the promise settles, so the next call refetches. Use this in the UI to avoid N fetches when many components mount at once.

### Stage lookup

#### `findWorkflowTransitionTarget(workflow, statusSlug)`

```ts
function findWorkflowTransitionTarget(
  workflowDefinition: WorkflowDefinition | null | undefined,
  statusSlug: string,
): WorkflowTransitionStage | undefined
```

Searches both `stages[]` and `offRamps[]` for a stage with `slug === statusSlug`. Returns `undefined` if not found.

#### `findNextWorkflowStage(workflow, currentStatusSlug)`

```ts
function findNextWorkflowStage(
  workflowDefinition: WorkflowDefinition | null | undefined,
  currentStatusSlug: string | undefined,
): WorkflowTransitionStage | undefined
```

Looks at `stages[]` (happy path only — off-ramps are never "next"). Returns the stage after `currentStatusSlug`, or `undefined` if the current status is not on the happy path or is already the last stage.

### Transitions

#### `performWorkflowTransition(params)`

```ts
function performWorkflowTransition(params: PerformWorkflowTransitionParams): Promise<{
  targetStage?: WorkflowTransitionStage
  workflowDefinition: WorkflowDefinition | null
}>
```

The high-level "move the document to a new stage" primitive:

1. Patches `status` on the document (`client.patch(documentId).set({status: targetStatusSlug}).commit()`).
2. Calls `performWorkflowTransitionSideEffects` to append the audit entry and create stage tasks.

```ts
interface PerformWorkflowTransitionParams {
  client: SanityClient
  currentUserId: string
  documentId: string
  documentType: string
  targetStatusSlug: string
  document?: WorkflowTransitionDocument | null
  workflowDefinition?: WorkflowDefinition | null
  reason?: string
  note?: string
  taskAssigneeOverrides?: Map<number, string | undefined>
  clearPendingTransitionReason?: boolean
  logPrefix?: string
}
```

`taskAssigneeOverrides` is a map from `taskTemplates[]` index to the user id that should be assigned, overriding `resolveAssigneeForTaskTemplate`. `note` is attached as a `tasks.comment` on every generated task.

#### `performWorkflowTransitionSideEffects(params)`

```ts
function performWorkflowTransitionSideEffects(
  params: PerformWorkflowTransitionSideEffectsParams,
): Promise<{
  targetStage?: WorkflowTransitionStage
  workflowDefinition: WorkflowDefinition | null
}>
```

The same shape as `PerformWorkflowTransitionParams` but does _not_ patch `status`. Use it when you've already set the status some other way (e.g. via a Sanity action) and only need the audit entry and tasks.

### Audit entries

#### `buildStatusAuditEntry(params)`

```ts
function buildStatusAuditEntry(params: {
  currentUserId: string
  statusLabel: string
  statusSlug: string
  completedAt?: string  // default: new Date().toISOString()
  reason?: string
  statusIcon?: string
}): WorkflowStatusAuditEntry
```

Builds the object shape that lives in `document.statuses[]`. Generates a 12-char `_key` via `crypto.randomUUID()`. Pure, no network.

#### `appendStatusAuditEntry(params)`

```ts
function appendStatusAuditEntry(params: AppendStatusAuditEntryParams): Promise<WorkflowStatusAuditEntry>
```

Fetches the workflow definition (if not passed), resolves `statusLabel`/`statusIcon` from the stage, builds an entry, and commits `patch(documentId).setIfMissing({statuses: []}).insert('after', 'statuses[-1]', [entry])`. When `clearPendingTransitionReason !== false`, also unsets `pendingTransitionReason`.

```ts
interface AppendStatusAuditEntryParams {
  client: SanityClient
  currentUserId: string
  documentId: string
  documentType: string
  statusSlug: string
  document?: WorkflowTransitionDocument | null
  workflowDefinition?: WorkflowDefinition | null
  reason?: string
  clearPendingTransitionReason?: boolean
  logPrefix?: string
}
```

#### `getLatestWorkflowStatusAuditEntry(statuses)`

```ts
function getLatestWorkflowStatusAuditEntry(
  statuses: WorkflowTransitionDocument['statuses'] | null | undefined,
): {completedAt?: string; statusSlug?: string} | undefined
```

Returns the last entry in the `statuses[]` array (iterating from the end), or `undefined` if empty.

#### `shouldSkipPublishAuditEntry(statuses, statusSlug)`

```ts
function shouldSkipPublishAuditEntry(
  statuses: WorkflowTransitionDocument['statuses'] | null | undefined,
  statusSlug: string | undefined,
): boolean
```

Helper for the publish-hook path: returns `true` when the latest audit entry already has `statusSlug === statusSlug`, so republishing without a status change doesn't create a duplicate entry.

### Tasks

#### `createTasksForWorkflowTemplates(params)`

```ts
function createTasksForWorkflowTemplates(
  params: CreateTasksForWorkflowTemplatesParams,
): Promise<CreateTasksForWorkflowTemplatesResult>
```

Creates one `tasks.task` in the `<dataset>-comments` addon dataset per template. Each task is linked to the document via a `crossDatasetReference`.

```ts
interface CreateTasksForWorkflowTemplatesParams {
  client: SanityClient
  currentUserId: string
  documentId: string
  documentType: string
  templates: WorkflowTaskTemplate[]
  document?: WorkflowTransitionDocument | null
  note?: string  // creates a tasks.comment on each task
  taskAssigneeOverrides?: Map<number, string | undefined>
  skipIfTasksExist?: boolean  // skips all if any task with a matching title already exists
  logPrefix?: string
}

interface CreateTasksForWorkflowTemplatesResult {
  createdTaskIds: string[]
  skippedExistingTasks: boolean
}
```

Assignee resolution order for each task: `taskAssigneeOverrides.get(index)` → `resolveAssigneeForTaskTemplate(document, template.assigneeRole)` → unassigned.

#### `resolveAssigneeForTaskTemplate(document, assigneeRole)`

```ts
function resolveAssigneeForTaskTemplate(
  document: WorkflowTransitionDocument | null | undefined,
  assigneeRole: string | undefined,
): string | undefined
```

Finds the first `document.assignments[]` entry whose `assignmentType` matches `assigneeRole` via `workflowRoleSlugMatches`, and returns its `userId`.

### Gating

#### `evaluateWorkflowStageGating(params)`

```ts
function evaluateWorkflowStageGating(params: {
  client: SanityClient
  documentId: string
  stage: Pick<WorkflowTransitionStage, 'enableCompletionGating' | 'taskTemplates'> | null | undefined
}): Promise<WorkflowStageGatingResult>
```

One-shot check: returns `{blocked, requiredOpenCount, requiredTaskCount, tasks}`. `blocked === true` when there's at least one open task whose title matches a `required !== false` template. Tasks are fetched from the `<dataset>-comments` addon dataset.

#### `subscribeWorkflowStageGating(params)`

```ts
function subscribeWorkflowStageGating(params: {
  client: SanityClient
  documentId: string
  stage: Pick<WorkflowTransitionStage, 'enableCompletionGating' | 'taskTemplates'> | null | undefined
  onResult: (result: WorkflowStageGatingResult) => void
  onError?: (error: unknown) => void
}): () => void
```

Live version of `evaluateWorkflowStageGating` — fetches once, then subscribes via `client.listen` to task mutations and re-emits. Returns an unsubscribe function. When `stage.enableCompletionGating` is false, returns a no-op unsubscriber and never fires.

#### `WorkflowStageGatingResult`

```ts
interface WorkflowStageGatingResult {
  blocked: boolean
  requiredOpenCount: number
  requiredTaskCount: number
  tasks: WorkflowStageGatingTask[]  // only open blockers, not all tasks
}

interface WorkflowStageGatingTask {
  _id: string
  title: string
  status: 'closed' | 'open'
  assignedTo?: string
  createdAt?: string
  dueDate?: string
}
```

### Roles and project users

#### `workflowRoleSlugMatches(requested, candidate)`

```ts
function workflowRoleSlugMatches(
  requested: string | null | undefined,
  candidate: string | null | undefined,
): boolean
```

Compares two role slugs using the kit's alias table (`reporter` ↔ `author`, `section_editor` ↔ `editor`/`section-editor`, etc.). Also accepts `*_reporter` suffixes for reporter matches and `section_editor`/`section-editor` substrings for editor matches.

#### `normalizeWorkflowRoleSlug(value)`

```ts
function normalizeWorkflowRoleSlug(value: string): string
```

Returns the canonical token for a role: `author`/`reporter` → `reporter`; `editor`/`section_editor` → `section_editor`; any other value is lowercased, trimmed, and hyphens/whitespace collapsed to `_`.

#### `getWorkflowRoleMatchCandidates(value)`

```ts
function getWorkflowRoleMatchCandidates(value: string): string[]
```

Returns the list of alias slugs `value` could match, ordered so the exact form comes first.

#### `userHasWorkflowRoleAccess(params)`

```ts
function userHasWorkflowRoleAccess(params: {
  aclData: WorkflowProjectAclEntry[]
  projectUsers: WorkflowProjectUser[]
  workflowRoles: WorkflowTransitionRole[] | null | undefined
  requestedWorkflowRoleSlugs: string[]
  currentUserSanityId: string | null | undefined
  currentUserEmail?: string | null | undefined
}): boolean
```

Returns `true` when the current user is mapped to a project-user whose project roles satisfy at least one of the requested workflow roles. Used by the transition action's gating-override check.

#### `canUseOffRampStage(params)`

```ts
function canUseOffRampStage(params: {
  aclData: WorkflowProjectAclEntry[]
  projectUsers: WorkflowProjectUser[]
  workflowRoles: WorkflowTransitionRole[] | null | undefined
  allowedRoles: string[] | null | undefined
  currentUserSanityId: string | null | undefined
  currentUserEmail?: string | null | undefined
}): boolean
```

Permits off-ramp use when `allowedRoles` is empty/nullable, otherwise delegates to `userHasWorkflowRoleAccess({requestedWorkflowRoleSlugs: allowedRoles})`.

#### `getWorkflowRoleLabels(params)`

```ts
function getWorkflowRoleLabels(params: {
  requestedWorkflowRoleSlugs: string[] | null | undefined
  workflowRoles: WorkflowTransitionRole[] | null | undefined
}): string[]
```

Returns the unique labels (falling back to slug) of every workflow role matching any requested slug.

#### `getOffRampDisabledTitle(params)`

```ts
function getOffRampDisabledTitle(params: {
  allowedRoles: string[] | null | undefined
  workflowRoles: WorkflowTransitionRole[] | null | undefined
}): string
```

Returns `"Only <role1, role2> roles can use this off-ramp"`, or `"Only authorized roles can use this off-ramp"` when the role list is empty.

#### `findProjectUserForCurrentSanityMember(projectUsers, sanityId, email?)`

```ts
function findProjectUserForCurrentSanityMember(
  projectUsers: WorkflowProjectUser[],
  currentUserSanityId: string | null | undefined,
  currentUserEmail?: string | null | undefined,
): WorkflowProjectUser | undefined
```

Resolves a `currentUser.id` (or email) to a `WorkflowProjectUser`. Tries exact Sanity id match, then case-insensitive, then email.

### Miscellaneous

#### `stripDraftsPrefix(id)`

```ts
function stripDraftsPrefix(id: string): string
```

Removes the `drafts.` prefix if present. Safe to call on published ids.

---

## React entrypoint

```ts
import {
  WorkflowStatusPath,
  WorkflowTransitionConfirmDialog,
  WorkflowTransitionConfirmDialogContent,
  WorkflowTransitionGatedDialog,
  WorkflowTransitionGatedDialogContent,
  WorkflowTransitionOffRampDialog,
  WorkflowTransitionOffRampDialogContent,
  WorkflowTransitionTaskInstanceRow,
  WorkflowTransitionTaskTemplateRow,
  formatDueDate,
  type WorkflowStatusPathProps,
  type WorkflowTransitionConfirmDialogProps,
  type WorkflowTransitionConfirmDialogContentProps,
  type WorkflowTransitionGatedDialogProps,
  type WorkflowTransitionGatedDialogContentProps,
  type WorkflowTransitionOffRampDialogProps,
  type WorkflowTransitionOffRampDialogContentProps,
  type WorkflowTransitionTaskInstanceRowProps,
  type WorkflowTransitionTaskTemplateRowProps,
  type WorkflowTransitionCriteriaBlock,
  type WorkflowTransitionDialogUser,
  type WorkflowTransitionTaskAssigneeOverride,
  type WorkflowTransitionTaskRow,
  type WorkflowTransitionTaskStatusOverride,
  type WorkflowTransitionTaskTemplatePreview,
} from '@sanity-labs/workflow-kit/react'
```

### `WorkflowStatusPath`

```tsx
function WorkflowStatusPath(props: WorkflowStatusPathProps): JSX.Element

interface WorkflowStatusPathProps {
  workflow: WorkflowDefinition
  currentStatus?: string
  disabled?: boolean
  loading?: boolean
  size?: 'default' | 'compact'
  onSelectStage?: (stage: WorkflowTransitionStage) => void
  onSelectOffRamp?: (stage: WorkflowTransitionStage) => void
}
```

Chevron-style progress bar rendering `workflow.stages[]` on the happy path and `workflow.offRamps[]` as a button row. Uses CSS container queries to switch to a compact layout below 500px container width. Stages without a `slug` are filtered out.

States per segment:

- `completed` — `index < currentPathIndex` and the current status is on the happy path.
- `active` — `index === currentPathIndex`.
- `future` — everything else (off-path status, or forward stages from current).

### Dialog components

Each dialog ships as two exports: `XxxDialog` (the full Sanity UI `Dialog` wrapper with `open`/`dialogId`/`zOffset` props) and `XxxDialogContent` (the inner content only — useful when you're already inside a `Dialog` or want to embed it in a document action's `dialog` result).

#### `WorkflowTransitionConfirmDialog` / `WorkflowTransitionConfirmDialogContent`

```ts
interface WorkflowTransitionConfirmDialogContentProps {
  stageTitle: string
  criteria?: WorkflowTransitionCriteriaBlock[] | null
  taskTemplates?: WorkflowTransitionTaskTemplatePreview[] | null
  isSubmitting?: boolean
  confirmText?: string
  submittingText?: string
  onCancel: () => void
  onConfirm: (
    overrides?: WorkflowTransitionTaskAssigneeOverride[],
    note?: string,
  ) => void | Promise<void>
}

interface WorkflowTransitionConfirmDialogProps extends WorkflowTransitionConfirmDialogContentProps {
  open: boolean
  dialogId?: string  // default 'workflow-transition-confirm-dialog'
  zOffset?: number   // default 1000
}
```

The confirmation dialog shown when entering a stage with `stageCriteria` or `taskTemplates`. Lets the user pick an assignee per template (from `template.eligibleUsers`) and leave a note. `onConfirm(overrides, note)` is called with any overrides the user made.

#### `WorkflowTransitionGatedDialog` / `WorkflowTransitionGatedDialogContent`

```ts
interface WorkflowTransitionGatedDialogContentProps {
  sourceStageName: string
  targetStageTitle: string
  tasks: WorkflowTransitionTaskRow[]
  currentUserCanOverride: boolean
  users?: WorkflowTransitionDialogUser[]
  isSubmitting?: boolean
  submittingText?: string
  onCancel: () => void
  onConfirm: (overrides: WorkflowTransitionTaskStatusOverride[]) => void | Promise<void>
  onViewTask?: (taskId: string) => void
}
```

Shown when leaving a stage with `enableCompletionGating: true` but open required tasks remain. When `currentUserCanOverride` is `true`, users can toggle tasks closed inline; otherwise the dialog is read-only with a "Can't advance" header.

#### `WorkflowTransitionOffRampDialog` / `WorkflowTransitionOffRampDialogContent`

```ts
interface WorkflowTransitionOffRampDialogContentProps {
  stageTitle: string
  criteria?: WorkflowTransitionCriteriaBlock[] | null
  unpublishOnEntry?: boolean
  isSubmitting?: boolean
  confirmText?: string
  submittingText?: string
  onCancel: () => void
  onConfirm: (reason: string) => void | Promise<void>
}
```

Off-ramp confirmation. Always requires the user to enter a `reason`. Confirm-button label switches to "Move to X & Unpublish" when `unpublishOnEntry === true`.

### Task rows

#### `WorkflowTransitionTaskTemplateRow`

```ts
interface WorkflowTransitionTaskTemplateRowProps {
  template: WorkflowTransitionTaskTemplatePreview
  selectedAssigneeId?: string
  onSelectAssignee: (userId: string) => void
}
```

Renders a single task-template row inside the confirm dialog with a due-date badge and an assignee picker.

#### `WorkflowTransitionTaskInstanceRow`

```ts
interface WorkflowTransitionTaskInstanceRowProps {
  task: WorkflowTransitionTaskRow
  currentUserCanOverride?: boolean
  user?: WorkflowTransitionDialogUser
  onToggleClosed?: () => void
  onViewTask?: () => void
}
```

Renders a single task-instance row inside the gated dialog.

### `formatDueDate(dueDate)`

```ts
function formatDueDate(dueDate: string): string
```

Returns human-relative strings: `"due today"`, `"due tomorrow"`, `"due in N days"`, `"overdue by N days"`.

### Types

```ts
interface WorkflowTransitionCriteriaBlock {
  _type: string
  [key: string]: unknown
}

interface WorkflowTransitionDialogUser {
  id: string
  displayName?: string
  imageUrl?: string
}

interface WorkflowTransitionTaskRow {
  _id: string
  title: string
  status: 'closed' | 'open'
  assignedTo?: string
  createdAt?: string
  dueDate?: string
}

interface WorkflowTransitionTaskStatusOverride {
  taskId: string
  status: 'closed' | 'open'
}

interface WorkflowTransitionTaskTemplatePreview {
  title: string
  assigneeRole?: string
  dueInDays?: number
  initialAssignedTo?: string
  eligibleUsers: WorkflowTransitionDialogUser[]
}

interface WorkflowTransitionTaskAssigneeOverride {
  templateIndex: number
  assignedTo: string | undefined
}
```

---

## Studio entrypoint

```ts
import {
  StatusPathInput,
  buildTaskViewPath,
  useWorkflowProjectUsers,
  type StatusPathOptions,
  type StatusPathIconConfig,
  type StatusPathSchemaType,
  type WorkflowProjectAclEntry,
  type WorkflowProjectUser,
} from '@sanity-labs/workflow-kit/studio'
```

### `StatusPathInput`

```ts
function StatusPathInput(props: StringInputProps<StatusPathSchemaType>): JSX.Element
```

A Sanity `string` input that renders a `WorkflowStatusPath` wired up to the live document. Behavior:

- Reads the document id (`['_id']`), type (`['_type']`), and assignments (`['assignments']`) via `useFormValue`.
- Fetches the matching workflow definition using `options.workflowDocumentType` as the query parameter.
- When the user clicks a stage, opens the appropriate dialog (confirm / gated / off-ramp) and on confirm calls `performWorkflowTransition` followed by a patch of the `status` field via `props.onChange`.

#### `StatusPathOptions`

```ts
interface StatusPathOptions extends StringOptions {
  workflowDocumentType?: string   // REQUIRED — without it the input can't locate its workflow
  pathStages?: string[]           // optional override for the happy path
  offRamps?: string[]             // optional override for the off-ramps
  size?: 'default' | 'compact'
  iconConfig?: Record<string, StatusPathIconConfig>
}

interface StatusPathIconConfig {
  Icon: LucideIcon
  color: string
  tone?: 'caution' | 'critical' | 'positive' | 'primary'
}

interface StatusPathSchemaType extends StringSchemaType {
  options?: StatusPathOptions
}
```

Without a published `workflowDefinition` in the dataset, the input falls back to building a static workflow from `options.list`.

### `buildTaskViewPath(taskId)`

```ts
function buildTaskViewPath(taskId: string): string | undefined
```

Builds a Studio-relative URL that opens the tasks sidebar focused on a given task:

```
<current-path>?sidebar=tasks&viewMode=edit&selectedTask=<taskId>
```

Returns `undefined` during SSR (no `window`) or if the current URL can't be parsed. Intended to be used with `useRouter().navigateUrl({path})` from Studio-side consumers.

### `useWorkflowProjectUsers(client)`

```ts
function useWorkflowProjectUsers(client: SanityClient): {
  aclData: WorkflowProjectAclEntry[]
  projectUsers: WorkflowProjectUser[]
  loaded: boolean
}
```

React hook that:

1. Reads the project id from `client.config()`.
2. Fetches `/projects/:id/acl` from the Sanity management API.
3. Fetches user records (200 at a time) for every non-robot ACL entry.
4. Caches the result (per project id) in module-level promise and result maps, so all consumers share one fetch.

Returns empty arrays and `loaded: true` when there's no project id.

#### `WorkflowProjectAclEntry`

```ts
interface WorkflowProjectAclEntry {
  projectUserId: string
  isRobot?: boolean
  roles?: Array<{name: string; title: string}>
}
```

#### `WorkflowProjectUser`

```ts
interface WorkflowProjectUser {
  id: string
  displayName?: string
  email?: string
  imageUrl?: string
  sanityUserId?: string
}
```

---

## Types entrypoint

```ts
import type {
  WorkflowDefinition,
  WorkflowTransitionStage,
  WorkflowTransitionRole,
  WorkflowTransitionDocument,
  WorkflowTaskTemplate,
  WorkflowStatusAuditEntry,
  WorkflowAssignmentValue,
  WorkflowTransitionCriteriaBlock,
  WorkflowTransitionDialogUser,
  WorkflowTransitionTaskAssigneeOverride,
  WorkflowTransitionTaskRow,
  WorkflowTransitionTaskStatusOverride,
  WorkflowTransitionTaskTemplatePreview,
  WorkflowProjectAclEntry,
  WorkflowProjectUser,
} from '@sanity-labs/workflow-kit/types'
```

Pure re-exports from `types/transition.ts`, `types/dialogs.ts`, and `types/projectUsers.ts` — nothing new, nothing renamed. Import from here if you only need types and don't want to pull in the engine, React, or Studio sub-modules.

### Core workflow types

```ts
interface WorkflowDefinition {
  stages?: WorkflowTransitionStage[]
  offRamps?: WorkflowTransitionStage[]
  roles?: WorkflowTransitionRole[]
  forwardOnly?: boolean
}

interface WorkflowTransitionStage {
  slug?: string
  label?: string
  icon?: string
  color?: string
  tone?: string
  stageCriteria?: Array<{_type: string; [key: string]: unknown}>
  taskTemplates?: WorkflowTaskTemplate[]
  enableCompletionGating?: boolean
  gatingOverrideRoles?: string[]
  enablePublishing?: boolean
  unpublishOnEntry?: boolean
  allowedRoles?: string[]
}

interface WorkflowTransitionRole {
  slug?: string
  label?: string
  projectRoles?: string[]
}

interface WorkflowTaskTemplate {
  title: string
  description?: Array<{_type: string; [key: string]: unknown}>
  assigneeRole?: string
  dueInDays?: number
  required?: boolean
}

interface WorkflowStatusAuditEntry {
  _key: string
  _type: 'setStatus'
  statusSlug: string
  statusLabel: string
  statusIcon?: string
  completedAt: string
  completedBy: {_type: 'user'; userId: string}
  reason?: string
}

interface WorkflowAssignmentValue {
  assignmentType?: string
  userId?: string
}

interface WorkflowTransitionDocument {
  assignments?: WorkflowAssignmentValue[]
  pendingTransitionReason?: string
  statuses?: Array<{completedAt?: string; statusSlug?: string}>
}
```

---

## See also

- [README](../README.md) — quickstart and entrypoint overview.
- [`@sanity-labs/sanity-plugin-workflows` reference](https://github.com/sanity-labs/sanity-plugin-workflows/blob/main/docs/reference.md) — the batteries-included plugin that wraps this kit.
