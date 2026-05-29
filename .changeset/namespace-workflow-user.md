---
"@sanity-labs/workflow-kit": minor
---

Read workflow definitions from the namespaced `workflow.definition` document type and write audit history entries as `_type: 'workflow.setStatus'` with `completedBy._type: 'workflow.user'`.
