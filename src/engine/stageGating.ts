import type {SanityClient} from 'sanity'

import type {WorkflowTransitionStage} from '../types/transition'
import {stripDraftsPrefix} from './transition'

export interface WorkflowStageGatingTask {
  _id: string
  assignedTo?: string
  createdAt?: string
  dueDate?: string
  status: 'closed' | 'open'
  title: string
}

export interface WorkflowStageGatingResult {
  blocked: boolean
  requiredOpenCount: number
  requiredTaskCount: number
  tasks: WorkflowStageGatingTask[]
}

interface WorkflowStageGatingTaskDocument {
  _createdAt?: string
  _id: string
  assignedTo?: string
  dueBy?: string
  dueDate?: string
  status?: 'closed' | 'open'
  title?: string
}

type WorkflowStageForGating = Pick<
  WorkflowTransitionStage,
  'enableCompletionGating' | 'taskTemplates'
>

const DOCUMENT_TASKS_FOR_GATING_QUERY = `*[
  _type == "tasks.task"
  && target.document._ref == $docId
] | order(_createdAt asc) {
  _id,
  title,
  status,
  assignedTo,
  "dueDate": coalesce(dueBy, dueDate),
  "createdAt": _createdAt
}`

const DOCUMENT_TASKS_FOR_GATING_LISTEN_QUERY = `*[
  _type == "tasks.task"
  && target.document._ref == $docId
]`

function normalizeTaskTitle(title?: string): string {
  return title?.trim() || ''
}

function mapTaskDocumentToGatingTask(
  task: WorkflowStageGatingTaskDocument,
): WorkflowStageGatingTask | undefined {
  if (!task._id || !task.title || (task.status !== 'open' && task.status !== 'closed')) {
    return undefined
  }

  return {
    _id: task._id,
    assignedTo: task.assignedTo,
    createdAt: task._createdAt,
    dueDate: task.dueBy || task.dueDate,
    status: task.status,
    title: task.title,
  }
}

function buildWorkflowStageGatingResult(
  stage: WorkflowStageForGating,
  tasks: WorkflowStageGatingTask[],
): WorkflowStageGatingResult {
  const requiredTitles = getRequiredTaskTemplateTitles(stage)
  const requiredTasks = filterTasksForGating(tasks, requiredTitles)
  const openRequiredTasks = requiredTasks.filter((task) => task.status === 'open')

  return {
    blocked: openRequiredTasks.length > 0,
    requiredOpenCount: openRequiredTasks.length,
    requiredTaskCount: requiredTasks.length,
    tasks: openRequiredTasks,
  }
}

function getDocumentTasksForGatingTarget(
  client: SanityClient,
  documentId: string,
): {addonClient: SanityClient; cleanId: string} | null {
  const mainDataset = client.config().dataset
  const cleanId = stripDraftsPrefix(documentId)

  if (!mainDataset || !cleanId) {
    return null
  }

  return {
    addonClient: client.withConfig({dataset: `${mainDataset}-comments`}),
    cleanId,
  }
}

export function getRequiredTaskTemplateTitles(
  stage: WorkflowStageForGating | null | undefined,
): Set<string> {
  return new Set(
    (stage?.taskTemplates || [])
      .filter((template) => template.required !== false)
      .map((template) => normalizeTaskTitle(template.title))
      .filter(Boolean),
  )
}

export function filterTasksForGating(
  tasks: WorkflowStageGatingTask[],
  requiredTitles: Set<string>,
): WorkflowStageGatingTask[] {
  if (requiredTitles.size === 0) {
    return []
  }

  return tasks.filter((task) => requiredTitles.has(normalizeTaskTitle(task.title)))
}

async function fetchDocumentTasksForGating(
  client: SanityClient,
  documentId: string,
): Promise<WorkflowStageGatingTask[]> {
  const target = getDocumentTasksForGatingTarget(client, documentId)
  if (!target) {
    return []
  }

  return target.addonClient.fetch<WorkflowStageGatingTask[]>(DOCUMENT_TASKS_FOR_GATING_QUERY, {
    docId: target.cleanId,
  })
}

async function fetchTaskForGatingById(
  addonClient: SanityClient,
  taskId: string,
): Promise<undefined | WorkflowStageGatingTask> {
  const task = (await addonClient
    .getDocument(taskId)
    .catch(() => null)) as WorkflowStageGatingTaskDocument | null

  if (!task || task._id !== taskId) {
    return undefined
  }

  return mapTaskDocumentToGatingTask(task)
}

export function subscribeWorkflowStageGating({
  client,
  documentId,
  onError,
  onResult,
  stage,
}: {
  client: SanityClient
  documentId: string
  onError?: (error: unknown) => void
  onResult: (result: WorkflowStageGatingResult) => void
  stage: WorkflowStageForGating | null | undefined
}): () => void {
  const target = getDocumentTasksForGatingTarget(client, documentId)

  if (!stage?.enableCompletionGating || !target) {
    return () => {}
  }

  let disposed = false
  let latestRequest = 0
  let currentTasks: WorkflowStageGatingTask[] = []

  const emitDerivedResult = () => {
    const result = buildWorkflowStageGatingResult(stage, currentTasks)
    onResult(result)
  }

  const upsertTask = (task: WorkflowStageGatingTask) => {
    const index = currentTasks.findIndex((candidate) => candidate._id === task._id)

    if (index === -1) {
      currentTasks = [...currentTasks, task]
      return
    }

    currentTasks = currentTasks.map((candidate, candidateIndex) =>
      candidateIndex === index ? task : candidate,
    )
  }

  const removeTask = (taskId: string) => {
    currentTasks = currentTasks.filter((candidate) => candidate._id !== taskId)
  }

  const refreshAllTasks = async () => {
    const requestId = ++latestRequest

    try {
      currentTasks = await fetchDocumentTasksForGating(client, documentId)
      if (!disposed && requestId === latestRequest) {
        emitDerivedResult()
      }
    } catch (error) {
      if (!disposed) {
        console.error('[workflowStageGating] Gate evaluation failed', {
          documentId,
          error,
          requestId,
        })
        onError?.(error)
      }
    }
  }

  void refreshAllTasks()

  const subscription = target.addonClient
    .listen<Record<string, unknown>>(
      DOCUMENT_TASKS_FOR_GATING_LISTEN_QUERY,
      {docId: target.cleanId},
      {includeResult: false, visibility: 'query'},
    )
    .subscribe({
      error: (error) => {
        if (!disposed) {
          console.error('[workflowStageGating] Task subscription error', {
            documentId,
            error,
          })
          onError?.(error)
        }
      },
      next: (event) => {
        const eventType =
          event && typeof event === 'object' && 'type' in event
            ? (event as {type?: string}).type
            : undefined
        const taskId =
          event && typeof event === 'object' && 'documentId' in event
            ? (event as {documentId?: string}).documentId
            : undefined
        const transition =
          event && typeof event === 'object' && 'transition' in event
            ? (event as {transition?: 'appear' | 'disappear' | 'update'}).transition
            : undefined

        if (eventType === 'reconnect') {
          void refreshAllTasks()
          return
        }

        if (eventType === 'mutation' && taskId) {
          if (transition === 'disappear') {
            removeTask(taskId)
            emitDerivedResult()
            return
          }

          void fetchTaskForGatingById(target.addonClient, taskId)
            .then((task) => {
              if (disposed) return

              if (task) {
                upsertTask(task)
                emitDerivedResult()
                return
              }

              removeTask(taskId)
              emitDerivedResult()
            })
            .catch((error) => {
              if (!disposed) {
                console.error('[workflowStageGating] Failed to refresh mutated task', {
                  documentId,
                  error,
                  taskId,
                })
                void refreshAllTasks()
              }
            })
        }
      },
    })

  return () => {
    disposed = true
    subscription.unsubscribe()
  }
}

export async function evaluateWorkflowStageGating({
  client,
  documentId,
  stage,
}: {
  client: SanityClient
  documentId: string
  stage: WorkflowStageForGating | null | undefined
}): Promise<WorkflowStageGatingResult> {
  if (!stage?.enableCompletionGating) {
    return {blocked: false, requiredOpenCount: 0, requiredTaskCount: 0, tasks: []}
  }

  const requiredTitles = getRequiredTaskTemplateTitles(stage)
  if (requiredTitles.size === 0) {
    return {blocked: false, requiredOpenCount: 0, requiredTaskCount: 0, tasks: []}
  }

  try {
    const documentTasks = await fetchDocumentTasksForGating(client, documentId)
    const requiredTasks = filterTasksForGating(documentTasks, requiredTitles)
    const openRequiredTasks = requiredTasks.filter((task) => task.status === 'open')

    return {
      blocked: openRequiredTasks.length > 0,
      requiredOpenCount: openRequiredTasks.length,
      requiredTaskCount: requiredTasks.length,
      tasks: openRequiredTasks,
    }
  } catch {
    return {blocked: false, requiredOpenCount: 0, requiredTaskCount: 0, tasks: []}
  }
}
