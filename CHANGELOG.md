# @sanity-labs/workflow-kit

## 0.5.1

### Patch Changes

- 117cc43: Warn once in the console when workflow task or gating APIs fail because the `<dataset>-comments` comments/tasks addon dataset has not been initialised, telling developers to add a comment or create a task in Studio.

## 0.5.0

### Minor Changes

- 1be6aa3: Defer role-bound stage task creation until an assignee is known, and add helpers to enroll / heal tasks when assignments become ready.

  - `createTasksForWorkflowTemplates` skips templates with an `assigneeRole` when no document assignment (and no confirm-dialog override) resolves a user — so first-stage tasks are not created as floating unassigned work.
  - `skipIfTasksExist` is now per-template, so later ensure calls can still create remaining templates once assignees appear.
  - **New exports**: `shouldDeferTaskTemplateCreation`, `assignOpenWorkflowTasksFromAssignments`, `ensureWorkflowStageTasks`. Prefer `ensureWorkflowStageTasks` when assignments are filled; do not rely on publish (stages may gate publishing).

### Patch Changes

- 1be6aa3: Authenticate Management API requests with the Studio session Bearer token so project-user lookups work on hosted Studios (`*.sanity.studio`), where cookie-only CORS is blocked.

## 0.4.0

### Minor Changes

- 5f52e55: Support `@sanity/color-input` color objects in `WORKFLOW_QUERY`. Stage and off-ramp `color` values are now projected with `coalesce(color.hex, color)`, so definitions authored with the new color picker resolve to a hex string while legacy hex-string values keep working unchanged.

## 0.3.0

### Minor Changes

- e93f5d4: Read workflow definitions from the namespaced `workflow.definition` document type and write audit history entries as `_type: 'workflow.setStatus'` with `completedBy._type: 'workflow.user'`.

## 0.2.1

### Patch Changes

- 8e4dd87: Disable `StatusPathInput` stage controls when the current user lacks Sanity update permission for the document.

## 0.2.0

### Minor Changes

- a2d3649: **New export**: `buildTaskViewPath(taskId)` from `@sanity-labs/workflow-kit/studio`. Builds a Studio-relative URL that opens the tasks sidebar focused on a given task (`?sidebar=tasks&viewMode=edit&selectedTask=<id>`). Returns `undefined` during SSR or when the current URL can't be parsed. Intended to be paired with the Studio router's `navigateUrl` to jump to a task's detail view.

  **New prop** on `WorkflowTransitionGatedDialog` / `WorkflowTransitionGatedDialogContent`: `onViewTask?: (taskId: string) => void`. Called when the user clicks the "View task" affordance on a blocking task row. Optional — when omitted, the affordance is not rendered.

  **Decoupling**: `WorkflowTransitionGatedDialog` no longer imports `sanity/router` and no longer navigates on its own. Parents that want the previous behaviour should pass `onViewTask={(taskId) => { const path = buildTaskViewPath(taskId); if (path) router.navigateUrl({path}) }}`. This is how the bundled `StatusPathInput` now wires it up; consumers using the dialog in non-Studio contexts (or with a different router) can now supply their own navigation.

  The plugin `@sanity-labs/sanity-plugin-workflows` uses both additions internally. Consumers on the plugin need to bump to the next minor of the plugin (which will require this version of `@sanity-labs/workflow-kit`).

  **Docs**: new `docs/reference.md` documenting every exported API, and a substantially expanded `README.md` covering the engine / react / studio / types entrypoints.
