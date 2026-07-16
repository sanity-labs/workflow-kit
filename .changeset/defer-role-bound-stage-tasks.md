---
'@sanity-labs/workflow-kit': minor
---

Defer role-bound stage task creation until an assignee is known, and add helpers to enroll / heal tasks when assignments become ready.

- `createTasksForWorkflowTemplates` skips templates with an `assigneeRole` when no document assignment (and no confirm-dialog override) resolves a user — so first-stage tasks are not created as floating unassigned work.
- `skipIfTasksExist` is now per-template, so later ensure calls can still create remaining templates once assignees appear.
- **New exports**: `shouldDeferTaskTemplateCreation`, `assignOpenWorkflowTasksFromAssignments`, `ensureWorkflowStageTasks`. Prefer `ensureWorkflowStageTasks` when assignments are filled; do not rely on publish (stages may gate publishing).
