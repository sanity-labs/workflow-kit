import type {SanityClient} from 'sanity'

import type {
  WorkflowDefinition,
  WorkflowStatusAuditEntry,
  WorkflowTaskTemplate,
  WorkflowTransitionDocument,
  WorkflowTransitionStage,
} from '../types/transition'
import {workflowRoleSlugMatches} from './roleMatching'

const workflowDefinitionPromiseCache = new Map<string, Promise<null | WorkflowDefinition>>()

export const WORKFLOW_QUERY = `*[_type == "workflowDefinition" && documentType == $docType][0] {
  forwardOnly,
  stages[] {
    stageCriteria,
    enableCompletionGating,
    gatingOverrideRoles,
    enablePublishing,
    label,
    "slug": slug.current,
    color,
    icon,
    taskTemplates[] { title, description, assigneeRole, dueInDays, required }
  },
  offRamps[] {
    stageCriteria,
    label,
    "slug": slug.current,
    color,
    icon,
    tone,
    enablePublishing,
    unpublishOnEntry,
    allowedRoles,
    taskTemplates[] { title, description, assigneeRole, dueInDays, required }
  },
  roles[] { label, "slug": slug.current, projectRoles }
}`

function generateStatusAuditKey(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

function getPendingTransitionReason(
  document: null | WorkflowTransitionDocument | undefined,
  reason?: string,
): string | undefined {
  const trimmedReason = reason?.trim()
  if (trimmedReason) {
    return trimmedReason
  }

  const pendingReason = document?.pendingTransitionReason
  if (typeof pendingReason === 'string') {
    const trimmedPendingReason = pendingReason.trim()
    return trimmedPendingReason || undefined
  }

  return undefined
}

export function stripDraftsPrefix(id: string): string {
  return id.replace(/^drafts\./, '')
}

export async function fetchWorkflowDefinition(
  client: SanityClient,
  documentType: string,
): Promise<null | WorkflowDefinition> {
  return client.fetch<null | WorkflowDefinition>(WORKFLOW_QUERY, {docType: documentType})
}

export function getCachedWorkflowDefinition(
  client: SanityClient,
  documentType: string,
): Promise<null | WorkflowDefinition> {
  const {dataset, projectId} = client.config()
  const cacheKey = `${projectId || 'unknown'}:${dataset || 'unknown'}:${documentType}`
  const cachedDefinition = workflowDefinitionPromiseCache.get(cacheKey)

  if (cachedDefinition) {
    return cachedDefinition
  }

  const definitionPromise = fetchWorkflowDefinition(client, documentType).finally(() => {
    workflowDefinitionPromiseCache.delete(cacheKey)
  })

  workflowDefinitionPromiseCache.set(cacheKey, definitionPromise)

  return definitionPromise
}

export function findWorkflowTransitionTarget(
  workflowDefinition: null | WorkflowDefinition | undefined,
  statusSlug: string,
): WorkflowTransitionStage | undefined {
  return [...(workflowDefinition?.stages || []), ...(workflowDefinition?.offRamps || [])].find(
    (stage) => stage.slug === statusSlug,
  )
}

export function findNextWorkflowStage(
  workflowDefinition: null | WorkflowDefinition | undefined,
  currentStatusSlug: string | undefined,
): WorkflowTransitionStage | undefined {
  if (!currentStatusSlug) return undefined

  const happyPathStages = workflowDefinition?.stages || []
  const currentIndex = happyPathStages.findIndex((stage) => stage.slug === currentStatusSlug)
  if (currentIndex < 0) return undefined

  return happyPathStages[currentIndex + 1]
}

export function resolveAssigneeForTaskTemplate(
  document: null | WorkflowTransitionDocument | undefined,
  assigneeRole: string | undefined,
): string | undefined {
  if (!assigneeRole || !Array.isArray(document?.assignments)) return undefined

  const match = document.assignments.find((assignment) =>
    workflowRoleSlugMatches(assigneeRole, assignment.assignmentType),
  )

  return typeof match?.userId === 'string' ? match.userId : undefined
}

export function buildStatusAuditEntry({
  completedAt = new Date().toISOString(),
  currentUserId,
  reason,
  statusIcon,
  statusLabel,
  statusSlug,
}: {
  completedAt?: string
  currentUserId: string
  reason?: string
  statusIcon?: string
  statusLabel: string
  statusSlug: string
}): WorkflowStatusAuditEntry {
  const pendingReason = reason?.trim()

  return {
    _key: generateStatusAuditKey(),
    _type: 'setStatus',
    completedAt,
    completedBy: {
      _type: 'user',
      userId: currentUserId,
    },
    ...(pendingReason ? {reason: pendingReason} : {}),
    ...(statusIcon ? {statusIcon} : {}),
    statusLabel,
    statusSlug,
  }
}

export function getLatestWorkflowStatusAuditEntry(
  statuses: null | undefined | WorkflowTransitionDocument['statuses'],
): undefined | {completedAt?: string; statusSlug?: string} {
  if (!Array.isArray(statuses)) return undefined

  for (let index = statuses.length - 1; index >= 0; index -= 1) {
    const entry = statuses[index]
    if (entry && typeof entry === 'object') {
      return entry
    }
  }

  return undefined
}

export function shouldSkipPublishAuditEntry(
  statuses: null | undefined | WorkflowTransitionDocument['statuses'],
  statusSlug: string | undefined,
): boolean {
  if (!statusSlug) return false

  const latestEntry = getLatestWorkflowStatusAuditEntry(statuses)
  return latestEntry?.statusSlug === statusSlug
}

async function createTaskNote({
  addonClient,
  currentUserId,
  note,
  taskId,
}: {
  addonClient: SanityClient
  currentUserId: string
  note: string
  taskId: string
}) {
  await addonClient.create({
    _type: 'tasks.comment' as const,
    authorId: currentUserId,
    message: [{_type: 'block', _key: 'note', children: [{_type: 'span', _key: 's', text: note}]}],
    parentCommentId: '',
    target: {_type: 'reference', _ref: taskId},
  })
}

export interface CreateTasksForWorkflowTemplatesParams {
  client: SanityClient
  currentUserId: string
  document: null | WorkflowTransitionDocument | undefined
  documentId: string
  documentType: string
  logPrefix?: string
  note?: string
  skipIfTasksExist?: boolean
  taskAssigneeOverrides?: Map<number, string | undefined>
  templates: WorkflowTaskTemplate[]
}

export interface CreateTasksForWorkflowTemplatesResult {
  createdTaskIds: string[]
  skippedExistingTasks: boolean
}

export async function createTasksForWorkflowTemplates({
  client,
  currentUserId,
  document,
  documentId,
  documentType,
  logPrefix = '[workflowTransition]',
  note,
  skipIfTasksExist = false,
  taskAssigneeOverrides,
  templates,
}: CreateTasksForWorkflowTemplatesParams): Promise<CreateTasksForWorkflowTemplatesResult> {
  const clientConfig = client.config()
  const mainDataset = clientConfig.dataset
  const projectId = clientConfig.projectId
  const cleanId = stripDraftsPrefix(documentId)

  if (!mainDataset || !projectId || !cleanId) {
    console.error(`${logPrefix} Missing dataset, projectId, or document id - cannot create tasks`)
    return {createdTaskIds: [], skippedExistingTasks: false}
  }

  const addonClient = client.withConfig({dataset: `${mainDataset}-comments`})

  if (skipIfTasksExist && templates.length > 0) {
    const templateTitles = Array.from(new Set(templates.map((template) => template.title)))
    try {
      const existingCount = await addonClient.fetch<number>(
        `count(*[_type == "tasks.task" && target.document._ref == $docId && title in $titles])`,
        {docId: cleanId, titles: templateTitles},
      )

      if (existingCount > 0) {
        return {createdTaskIds: [], skippedExistingTasks: true}
      }
    } catch (error) {
      console.error(`${logPrefix} Failed to check for existing workflow tasks:`, error)
    }
  }

  const now = new Date().toISOString()
  const target = {
    document: {
      _dataset: mainDataset,
      _projectId: projectId,
      _ref: cleanId,
      _type: 'crossDatasetReference' as const,
      _weak: true,
    },
    documentType,
  }

  const createdTaskIds = (
    await Promise.all(
      templates.map(async (template, index) => {
        const assignedTo = taskAssigneeOverrides?.has(index)
          ? taskAssigneeOverrides.get(index)
          : resolveAssigneeForTaskTemplate(document, template.assigneeRole)
        const dueBy =
          typeof template.dueInDays === 'number'
            ? new Date(Date.now() + template.dueInDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined

        try {
          const task = await addonClient.create({
            _type: 'tasks.task' as const,
            authorId: currentUserId,
            createdByUser: now,
            status: 'open',
            subscribers: assignedTo ? [currentUserId, assignedTo] : [currentUserId],
            target,
            title: template.title,
            ...(template.description ? {description: template.description} : {}),
            ...(assignedTo ? {assignedTo} : {}),
            ...(dueBy ? {dueBy} : {}),
          })

          if (note && task._id) {
            try {
              await createTaskNote({
                addonClient,
                currentUserId,
                note,
                taskId: task._id,
              })
            } catch (error) {
              console.error(`${logPrefix} Failed to create note on task ${task._id}:`, error)
            }
          }

          return typeof task._id === 'string' ? task._id : undefined
        } catch (error) {
          console.error(`${logPrefix} Failed to create task "${template.title}":`, error)
          return undefined
        }
      }),
    )
  ).filter((taskId): taskId is string => typeof taskId === 'string')

  return {createdTaskIds, skippedExistingTasks: false}
}

export interface AppendStatusAuditEntryParams {
  clearPendingTransitionReason?: boolean
  client: SanityClient
  currentUserId: string
  document?: null | WorkflowTransitionDocument | undefined
  documentId: string
  documentType: string
  logPrefix?: string
  reason?: string
  statusSlug: string
  workflowDefinition?: null | WorkflowDefinition
}

export async function appendStatusAuditEntry({
  clearPendingTransitionReason = true,
  client,
  currentUserId,
  document,
  documentId,
  documentType,
  reason,
  statusSlug,
  workflowDefinition,
}: AppendStatusAuditEntryParams): Promise<WorkflowStatusAuditEntry> {
  const resolvedWorkflowDefinition =
    workflowDefinition ?? (await fetchWorkflowDefinition(client, documentType))
  const targetStage = findWorkflowTransitionTarget(resolvedWorkflowDefinition, statusSlug)
  const pendingReason = getPendingTransitionReason(document, reason)

  const auditEntry = buildStatusAuditEntry({
    currentUserId,
    reason: pendingReason,
    statusIcon: targetStage?.icon,
    statusLabel: targetStage?.label || statusSlug,
    statusSlug,
  })

  const patch = client
    .patch(documentId)
    .setIfMissing({statuses: []})
    .insert('after', 'statuses[-1]', [auditEntry])

  if (clearPendingTransitionReason) {
    patch.unset(['pendingTransitionReason'])
  }

  await patch.commit()

  return auditEntry
}

export interface PerformWorkflowTransitionSideEffectsParams {
  clearPendingTransitionReason?: boolean
  client: SanityClient
  currentUserId: string
  document?: null | WorkflowTransitionDocument | undefined
  documentId: string
  documentType: string
  logPrefix?: string
  note?: string
  reason?: string
  targetStatusSlug: string
  taskAssigneeOverrides?: Map<number, string | undefined>
  workflowDefinition?: null | WorkflowDefinition
}

export async function performWorkflowTransitionSideEffects({
  clearPendingTransitionReason = true,
  client,
  currentUserId,
  document,
  documentId,
  documentType,
  logPrefix = '[workflowTransition]',
  note,
  reason,
  targetStatusSlug,
  taskAssigneeOverrides,
  workflowDefinition,
}: PerformWorkflowTransitionSideEffectsParams): Promise<{
  targetStage?: WorkflowTransitionStage
  workflowDefinition: null | WorkflowDefinition
}> {
  const resolvedWorkflowDefinition =
    workflowDefinition ?? (await fetchWorkflowDefinition(client, documentType))
  const targetStage = findWorkflowTransitionTarget(resolvedWorkflowDefinition, targetStatusSlug)

  try {
    await appendStatusAuditEntry({
      clearPendingTransitionReason,
      client,
      currentUserId,
      document,
      documentId,
      documentType,
      reason,
      statusSlug: targetStatusSlug,
      workflowDefinition: resolvedWorkflowDefinition,
    })
  } catch (error) {
    console.error(`${logPrefix} Failed to append workflow audit entry:`, error)
  }

  if (targetStage?.taskTemplates?.length) {
    try {
      await createTasksForWorkflowTemplates({
        client,
        currentUserId,
        document,
        documentId,
        documentType,
        logPrefix,
        note,
        taskAssigneeOverrides,
        templates: targetStage.taskTemplates,
      })
    } catch (error) {
      console.error(`${logPrefix} Task creation batch failed:`, error)
    }
  }

  return {
    targetStage,
    workflowDefinition: resolvedWorkflowDefinition,
  }
}

export interface PerformWorkflowTransitionParams extends PerformWorkflowTransitionSideEffectsParams {}

export async function performWorkflowTransition({
  client,
  documentId,
  targetStatusSlug,
  ...sideEffects
}: PerformWorkflowTransitionParams): Promise<{
  targetStage?: WorkflowTransitionStage
  workflowDefinition: null | WorkflowDefinition
}> {
  await client.patch(documentId).set({status: targetStatusSlug}).commit()

  return performWorkflowTransitionSideEffects({
    ...sideEffects,
    client,
    documentId,
    targetStatusSlug,
  })
}
