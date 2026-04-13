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

function normalizeTaskTitle(title?: string): string {
  return title?.trim() || ''
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
  const mainDataset = client.config().dataset
  const projectId = client.config().projectId
  const cleanId = stripDraftsPrefix(documentId)

  if (!mainDataset || !projectId || !cleanId) {
    return []
  }

  return client
    .withConfig({dataset: `${mainDataset}-comments`})
    .fetch<WorkflowStageGatingTask[]>(DOCUMENT_TASKS_FOR_GATING_QUERY, {docId: cleanId})
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
