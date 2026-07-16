import {describe, expect, it, vi} from 'vitest'

import {
  assignOpenWorkflowTasksFromAssignments,
  createTasksForWorkflowTemplates,
  ensureWorkflowStageTasks,
  resolveAssigneeForTaskTemplate,
  shouldDeferTaskTemplateCreation,
} from './transition'

function createMockClient(options?: {
  existingTasks?: Array<{_id?: string; assignedTo?: string; subscribers?: string[]; title?: string}>
  workflowDefinition?: {
    stages?: Array<{
      slug?: string
      taskTemplates?: Array<{assigneeRole?: string; title: string}>
    }>
  } | null
}) {
  const created: Array<Record<string, unknown>> = []
  const patches: Array<{id: string; set: Record<string, unknown>}> = []
  const existingTasks = options?.existingTasks ?? []
  let nextTaskId = 1

  const addonClient = {
    create: vi.fn(async (doc: Record<string, unknown>) => {
      const id = `task-${nextTaskId++}`
      created.push({...doc, _id: id})
      return {_id: id}
    }),
    fetch: vi.fn(async (query: string) => {
      if (query.includes('!defined(assignedTo)')) {
        return existingTasks.filter((task) => !task.assignedTo)
      }
      if (query.includes('title in $titles')) {
        return existingTasks.map((task) => ({title: task.title}))
      }
      return []
    }),
    patch: vi.fn((id: string) => ({
      set: (set: Record<string, unknown>) => ({
        commit: async () => {
          patches.push({id, set})
          return {_id: id}
        },
      }),
    })),
  }

  const client = {
    config: () => ({dataset: 'production', projectId: 'proj'}),
    fetch: vi.fn(async () => options?.workflowDefinition ?? null),
    withConfig: vi.fn(() => addonClient),
  }

  return {addonClient, client, created, patches}
}

describe('shouldDeferTaskTemplateCreation', () => {
  it('defers role-bound templates without an assignee or override', () => {
    expect(
      shouldDeferTaskTemplateCreation({
        assigneeRole: 'reporter',
        assignedTo: undefined,
        hasAssigneeOverride: false,
      }),
    ).toBe(true)
  })

  it('does not defer when an assignee is resolved', () => {
    expect(
      shouldDeferTaskTemplateCreation({
        assigneeRole: 'reporter',
        assignedTo: 'user-1',
        hasAssigneeOverride: false,
      }),
    ).toBe(false)
  })

  it('does not defer templates without assigneeRole', () => {
    expect(
      shouldDeferTaskTemplateCreation({
        assigneeRole: undefined,
        assignedTo: undefined,
        hasAssigneeOverride: false,
      }),
    ).toBe(false)
  })

  it('does not defer when an override entry exists, even if unassigned', () => {
    expect(
      shouldDeferTaskTemplateCreation({
        assigneeRole: 'reporter',
        assignedTo: undefined,
        hasAssigneeOverride: true,
      }),
    ).toBe(false)
  })
})

describe('resolveAssigneeForTaskTemplate', () => {
  it('resolves matching assignment user ids', () => {
    expect(
      resolveAssigneeForTaskTemplate(
        {
          assignments: [
            {assignmentType: 'reporter', userId: 'user-1'},
            {assignmentType: 'section_editor', userId: 'user-2'},
          ],
        },
        'author',
      ),
    ).toBe('user-1')
  })
})

describe('createTasksForWorkflowTemplates', () => {
  it('skips role-bound templates without assignees and creates the rest', async () => {
    const {client, created} = createMockClient()

    const result = await createTasksForWorkflowTemplates({
      client: client as never,
      currentUserId: 'author-1',
      document: {
        assignments: [{assignmentType: 'reporter', userId: 'reporter-1'}],
      },
      documentId: 'drafts.doc-1',
      documentType: 'article',
      templates: [
        {assigneeRole: 'reporter', title: 'Write draft'},
        {assigneeRole: 'section_editor', title: 'Assign editor'},
        {title: 'Optional checklist'},
      ],
    })

    expect(result.createdTaskIds).toEqual(['task-1', 'task-2'])
    expect(result.skippedMissingAssigneeTitles).toEqual(['Assign editor'])
    expect(created).toHaveLength(2)
    expect(created[0]).toMatchObject({assignedTo: 'reporter-1', title: 'Write draft'})
    expect(created[1]).toMatchObject({title: 'Optional checklist'})
    expect(created[1].assignedTo).toBeUndefined()
  })

  it('respects intentional unassign overrides', async () => {
    const {client, created} = createMockClient()
    const overrides = new Map<number, string | undefined>([[0, undefined]])

    const result = await createTasksForWorkflowTemplates({
      client: client as never,
      currentUserId: 'author-1',
      document: {
        assignments: [{assignmentType: 'reporter', userId: 'reporter-1'}],
      },
      documentId: 'doc-1',
      documentType: 'article',
      taskAssigneeOverrides: overrides,
      templates: [{assigneeRole: 'reporter', title: 'Write draft'}],
    })

    expect(result.createdTaskIds).toEqual(['task-1'])
    expect(result.skippedMissingAssigneeTitles).toEqual([])
    expect(created[0].assignedTo).toBeUndefined()
  })

  it('skips existing titles per template so remaining templates can still create', async () => {
    const {client, created} = createMockClient({
      existingTasks: [{title: 'Write draft'}],
    })

    const result = await createTasksForWorkflowTemplates({
      client: client as never,
      currentUserId: 'author-1',
      document: {
        assignments: [
          {assignmentType: 'reporter', userId: 'reporter-1'},
          {assignmentType: 'section_editor', userId: 'editor-1'},
        ],
      },
      documentId: 'doc-1',
      documentType: 'article',
      skipIfTasksExist: true,
      templates: [
        {assigneeRole: 'reporter', title: 'Write draft'},
        {assigneeRole: 'section_editor', title: 'Edit story'},
      ],
    })

    expect(result.skippedExistingTasks).toBe(true)
    expect(result.createdTaskIds).toEqual(['task-1'])
    expect(created[0]).toMatchObject({assignedTo: 'editor-1', title: 'Edit story'})
  })
})

describe('assignOpenWorkflowTasksFromAssignments', () => {
  it('patches open unassigned tasks when assignments resolve', async () => {
    const {client, patches} = createMockClient({
      existingTasks: [
        {_id: 'task-a', subscribers: ['author-1'], title: 'Write draft'},
        {_id: 'task-b', assignedTo: 'someone', title: 'Already assigned'},
      ],
    })

    const result = await assignOpenWorkflowTasksFromAssignments({
      client: client as never,
      document: {
        assignments: [{assignmentType: 'reporter', userId: 'reporter-1'}],
      },
      documentId: 'doc-1',
      templates: [
        {assigneeRole: 'reporter', title: 'Write draft'},
        {assigneeRole: 'reporter', title: 'Already assigned'},
      ],
    })

    expect(result.assignedTaskIds).toEqual(['task-a'])
    expect(patches).toEqual([
      {
        id: 'task-a',
        set: {assignedTo: 'reporter-1', subscribers: ['author-1', 'reporter-1']},
      },
    ])
  })
})

describe('ensureWorkflowStageTasks', () => {
  it('creates deferred stage tasks once assignees exist', async () => {
    const {client, created} = createMockClient({
      workflowDefinition: {
        stages: [
          {
            slug: 'drafting',
            taskTemplates: [
              {assigneeRole: 'reporter', title: 'Write draft'},
              {assigneeRole: 'section_editor', title: 'Edit story'},
            ],
          },
        ],
      },
    })

    const result = await ensureWorkflowStageTasks({
      client: client as never,
      currentUserId: 'author-1',
      document: {
        assignments: [
          {assignmentType: 'reporter', userId: 'reporter-1'},
          {assignmentType: 'section_editor', userId: 'editor-1'},
        ],
        status: 'drafting',
      },
      documentId: 'doc-1',
      documentType: 'article',
    })

    expect(result.createdTaskIds).toEqual(['task-1', 'task-2'])
    expect(result.skippedMissingAssigneeTitles).toEqual([])
    expect(created).toHaveLength(2)
  })
})
