# @sanity-labs/workflow-kit

> [!IMPORTANT]
> This package was created before Sanity's official [Editorial Workflows](https://www.sanity.io/docs/editorial-workflows) feature was available in public beta.
> I _strongly_ recommend using that rather than this package (and the workflows plugin built on it) as it will be officially supported by the Sanity team.
> Once Editorial Workflows goes GA, this package will go into maintenance mode.
> — Sam

Reusable workflow engine and UI primitives for Sanity-powered applications.

`workflow-kit` is the foundation that [`@sanity-labs/sanity-plugin-workflows`](https://github.com/sanity-labs/sanity-plugin-workflows) is built on. It ships:

- A dataset-agnostic **engine** (`/engine`) for fetching workflow definitions, computing the next stage, evaluating completion gating, performing transitions, creating tasks, and matching workflow roles to Sanity project roles.
- **React UI primitives** (`/react`) — the transition confirm/gated/off-ramp dialogs, a `WorkflowStatusPath` progress bar for frontends or Studio panels, and task row components.
- **Studio primitives** (`/studio`) — the `StatusPathInput` string input, `buildTaskViewPath` helper, and the `useWorkflowProjectUsers` hook.
- **Types** (`/types`) — `WorkflowDefinition`, `WorkflowTransitionStage`, `WorkflowStatusAuditEntry`, dialog types, and project-user types.

For concepts (workflow definition, stages, off-ramps, roles, task templates, gating, audit trail) see the [plugin README](https://github.com/sanity-labs/sanity-plugin-workflows/blob/main/README.md#concepts). This README assumes those concepts and focuses on what `workflow-kit` exposes.

- **Full API reference** → [docs/reference.md](docs/reference.md)

---

## When to use `workflow-kit` directly vs the plugin

Use [`@sanity-labs/sanity-plugin-workflows`](https://www.npmjs.com/package/@sanity-labs/sanity-plugin-workflows) when:

- You want opinionated, one-line Studio wiring (injected `status` field, transition action, audit inspector, off-ramp slots) without writing custom document actions.
- You're fine with the plugin's default UX for the transition confirm/gated/off-ramp dialogs.

Use `@sanity-labs/workflow-kit` directly when:

- You're rendering workflow state on a frontend (Next.js, Nuxt, Astro) and need `WorkflowStatusPath`.
- You're writing a custom Studio document action, input, or dashboard that needs `performWorkflowTransition`, `evaluateWorkflowStageGating`, or role-access helpers.
- You want the dialog components (`WorkflowTransitionConfirmDialog`, `WorkflowTransitionGatedDialog`, `WorkflowTransitionOffRampDialog`) in a place the plugin doesn't reach.
- You're building another Sanity plugin on top of these primitives.

The plugin and the kit share their type definitions — nothing gets lost when you graduate from plugin to kit.

---

## Installation

```sh
pnpm add @sanity-labs/workflow-kit
```

Peer dependencies: `sanity@^6.9.2`, `react@^19`, `@sanity/ui@^4.0.1`,
`styled-components@^6`.

This release line supports Sanity Studio 6.9.2 and later 6.x releases. Use Node.js
22.12 or newer.

For Sanity Studio 5, use `@sanity-labs/workflow-kit@^0.5.1` with `@sanity/ui` 3.
The 0.5.x line may run on Sanity 6.0–6.9.1 when its peer declarations are
overridden, but that combination is not supported or covered by clean consumer
builds. Upgrade Studio to 6.9.2 or later instead. The workflows plugin README
documents a temporary, unsupported override approach for teams that cannot
upgrade immediately.

---

## Quickstart

Two common patterns — each one copy-paste-runnable.

### Render a status path on a Next.js page

`WorkflowStatusPath` is an uncontrolled chevron-style progress bar. Feed it the workflow definition and the current document's `status`, and it renders the happy path (past stages filled, current stage highlighted, future stages muted) plus a row of off-ramps.

```tsx
// app/articles/[slug]/status.tsx
'use client'

import {WorkflowStatusPath} from '@sanity-labs/workflow-kit/react'
import type {WorkflowDefinition} from '@sanity-labs/workflow-kit/types'

export function ArticleStatus({
  workflow,
  currentStatus,
}: {
  workflow: WorkflowDefinition
  currentStatus: string
}) {
  return (
    <WorkflowStatusPath
      workflow={workflow}
      currentStatus={currentStatus}
      size="compact"
      onSelectStage={(stage) => console.log('clicked stage', stage.slug)}
    />
  )
}
```

Fetch the workflow definition server-side with the `WORKFLOW_QUERY` export from `/engine`:

```ts
import {WORKFLOW_QUERY} from '@sanity-labs/workflow-kit/engine'
import {client} from '@/sanity/client'

const workflow = await client.fetch(WORKFLOW_QUERY, {docType: 'article'})
```

### Transition a document from a custom action

```tsx
import {
  getCachedWorkflowDefinition,
  findNextWorkflowStage,
  performWorkflowTransition,
} from '@sanity-labs/workflow-kit/engine'
import {useClient, useCurrentUser, type DocumentActionProps} from 'sanity'

const API_VERSION = '2026-04-12'

export function MyAdvanceAction(props: DocumentActionProps) {
  const client = useClient({apiVersion: API_VERSION})
  const currentUser = useCurrentUser()

  return {
    label: 'Advance workflow',
    onHandle: async () => {
      if (!currentUser || !props.id) return

      const workflow = await getCachedWorkflowDefinition(client, props.type)
      const current = (props.draft?.status ?? props.published?.status) as string | undefined
      const next = findNextWorkflowStage(workflow, current)
      if (!next?.slug) return

      await performWorkflowTransition({
        client,
        currentUserId: currentUser.id,
        document: props.draft ?? props.published ?? undefined,
        documentId: props.id,
        documentType: props.type,
        targetStatusSlug: next.slug,
        workflowDefinition: workflow,
      })

      props.onComplete()
    },
  }
}
```

`performWorkflowTransition` patches `status`, appends a `workflow.setStatus` audit entry, and (if the target stage has task templates) creates tasks in the `-comments` addon dataset.

---

## Entrypoints

| Entrypoint                             | Contents                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sanity-labs/workflow-kit/engine`     | Pure functions: transition, audit-entry building, task creation, role matching, stage-gating evaluation and subscription. Also `WORKFLOW_QUERY` and engine types.                         |
| `@sanity-labs/workflow-kit/react`      | `WorkflowStatusPath`, `WorkflowTransitionConfirmDialog`/`Content`, `WorkflowTransitionGatedDialog`/`Content`, `WorkflowTransitionOffRampDialog`/`Content`, task row components, `formatDueDate`. |
| `@sanity-labs/workflow-kit/studio`     | `StatusPathInput` (+ `StatusPathOptions`, `StatusPathIconConfig`, `StatusPathSchemaType`), `buildTaskViewPath`, `useWorkflowProjectUsers`, project-user types.                            |
| `@sanity-labs/workflow-kit/types`      | Re-export of every type (`WorkflowDefinition`, `WorkflowTransitionStage`, `WorkflowTaskTemplate`, dialog types, project-user types).                                                     |

See [docs/reference.md](docs/reference.md) for every export with signatures and behavior notes.

---

## Troubleshooting

**`StatusPathInput` doesn't resolve the workflow definition.**

The input expects `options.workflowDocumentType` on the schema field so it can query `*[_type == "workflow.definition" && documentType == $workflowDocumentType][0]`. The plugin's `withWorkflow` decorator sets this automatically; in a custom input, make sure the schema is built like:

```ts
defineField({
  name: 'status',
  type: 'string',
  options: {workflowDocumentType: 'article'} satisfies StatusPathOptions,
  components: {input: StatusPathInput},
})
```

**`buildTaskViewPath` returns `undefined`.**

It's SSR-aware and returns `undefined` when `window` is not defined, or when the current `window.location.href` can't be parsed. Call it from an event handler in the browser only.

**`performWorkflowTransition` throws "Missing dataset, projectId, or document id".**

Tasks (and gating) live in the `<dataset>-comments` addon dataset. You need a `SanityClient` whose `config()` returns both `dataset` and `projectId`.

If the addon dataset was never initialised, open Studio, open any document, and **add a comment** or **create a task** once — that is what provisions the comments/tasks addon correctly (a bare `sanity dataset create …-comments` is not enough). Task create / gating calls also log a one-time `console.warn` pointing at that Studio setup step.

**Peer-dep mismatch on install.**

`workflow-kit` 0.6.x supports React 19, Sanity Studio 6.9.2 or later in the 6.x
line, `@sanity/ui` 4.0.1 or later, and `styled-components` 6. For Studio 5,
install `workflow-kit@^0.5.1` and UI 3. Sanity 6.0–6.9.1 is not formally
supported by either release line.

**Role matching is returning unexpected results.**

`workflow.roleSlugMatches` has aliasing rules for common role slugs (`reporter` matches `author`, `section_editor` matches `editor` and `section-editor`, etc.). If you're using custom slugs, `normalizeWorkflowRoleSlug` shows the canonical form. See [`src/engine/roleMatching.ts`](src/engine/roleMatching.ts).

---

## Develop

```sh
pnpm install
pnpm build          # tsdown
pnpm build:watch
pnpm typecheck
pnpm lint
pnpm smoke:compat   # build the packed package in a clean Studio
```

Publish workflow-kit before packages that consume its new compatibility range.
Its CI matrix builds packed consumers at the Studio 6.9.2/UI 4.0.1 minimum and
against the current Studio 6/UI 4 release.

## License

[MIT](LICENSE) © Sanity Labs
