# @sanity-labs/workflow-kit

## 0.2.0

### Minor Changes

- a2d3649: **New export**: `buildTaskViewPath(taskId)` from `@sanity-labs/workflow-kit/studio`. Builds a Studio-relative URL that opens the tasks sidebar focused on a given task (`?sidebar=tasks&viewMode=edit&selectedTask=<id>`). Returns `undefined` during SSR or when the current URL can't be parsed. Intended to be paired with the Studio router's `navigateUrl` to jump to a task's detail view.

  **New prop** on `WorkflowTransitionGatedDialog` / `WorkflowTransitionGatedDialogContent`: `onViewTask?: (taskId: string) => void`. Called when the user clicks the "View task" affordance on a blocking task row. Optional — when omitted, the affordance is not rendered.

  **Decoupling**: `WorkflowTransitionGatedDialog` no longer imports `sanity/router` and no longer navigates on its own. Parents that want the previous behaviour should pass `onViewTask={(taskId) => { const path = buildTaskViewPath(taskId); if (path) router.navigateUrl({path}) }}`. This is how the bundled `StatusPathInput` now wires it up; consumers using the dialog in non-Studio contexts (or with a different router) can now supply their own navigation.

  The plugin `@sanity-labs/sanity-plugin-workflows` uses both additions internally. Consumers on the plugin need to bump to the next minor of the plugin (which will require this version of `@sanity-labs/workflow-kit`).

  **Docs**: new `docs/reference.md` documenting every exported API, and a substantially expanded `README.md` covering the engine / react / studio / types entrypoints.
