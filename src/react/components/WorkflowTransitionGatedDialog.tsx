import {Button, Card, Dialog, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useRouter} from 'sanity/router'

import type {
  WorkflowTransitionDialogUser,
  WorkflowTransitionTaskRow,
  WorkflowTransitionTaskStatusOverride,
} from '../../types/dialogs'
import {WorkflowTransitionTaskInstanceRow} from './WorkflowTransitionTaskCard'

export interface WorkflowTransitionGatedDialogContentProps {
  currentUserCanOverride: boolean
  isSubmitting?: boolean
  onCancel: () => void
  onConfirm: (overrides: WorkflowTransitionTaskStatusOverride[]) => void | Promise<void>
  sourceStageName: string
  submittingText?: string
  targetStageTitle: string
  tasks: WorkflowTransitionTaskRow[]
  users?: WorkflowTransitionDialogUser[]
}

export interface WorkflowTransitionGatedDialogProps extends WorkflowTransitionGatedDialogContentProps {
  dialogId?: string
  open: boolean
  zOffset?: number
}

function getVisibleTasks(
  tasks: WorkflowTransitionTaskRow[],
  overrides: Map<string, 'closed' | 'open'>,
): WorkflowTransitionTaskRow[] {
  return [...tasks]
    .map((task) => ({
      ...task,
      status: overrides.get(task._id) ?? task.status,
    }))
    .filter((task) => task.status === 'open')
    .sort((left, right) => {
      return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime()
    })
}

function buildTaskViewPath(taskId: string): string | undefined {
  if (typeof window === 'undefined') return undefined

  try {
    const url = new URL(window.location.href)
    url.searchParams.set('sidebar', 'tasks')
    url.searchParams.set('viewMode', 'edit')
    url.searchParams.set('selectedTask', taskId)
    return `${url.pathname}${url.search}`
  } catch {
    return undefined
  }
}

export function WorkflowTransitionGatedDialogContent({
  currentUserCanOverride,
  isSubmitting = false,
  onCancel,
  onConfirm,
  sourceStageName,
  submittingText,
  targetStageTitle,
  tasks,
  users = [],
}: WorkflowTransitionGatedDialogContentProps) {
  const router = useRouter()
  const [overrides, setOverrides] = useState<Map<string, 'closed' | 'open'>>(new Map())

  useEffect(() => {
    setOverrides(new Map())
  }, [sourceStageName, targetStageTitle])

  useEffect(() => {
    setOverrides((prev) => {
      const activeTaskIds = new Set(tasks.map((task) => task._id))
      let changed = false
      const next = new Map(prev)

      prev.forEach((_status, taskId) => {
        if (!activeTaskIds.has(taskId)) {
          next.delete(taskId)
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [tasks])

  const visibleTasks = useMemo(() => getVisibleTasks(tasks, overrides), [tasks, overrides])
  const remainingTaskCount = visibleTasks.length
  const allTasksClosed = remainingTaskCount === 0
  const resolvedSubmittingText = submittingText ?? `Moving to ${targetStageTitle}...`
  const handleViewTask = useCallback(
    (taskId: string) => {
      const path = buildTaskViewPath(taskId)
      if (!path) return
      router.navigateUrl({path})
    },
    [router],
  )

  return (
    <Stack padding={4} space={4}>
      {allTasksClosed ? (
        <Card padding={3} radius={2} border tone="positive">
          All tasks completed for {sourceStageName} stage. Ready to advance.
        </Card>
      ) : currentUserCanOverride ? (
        <Card padding={3} radius={2} border tone="suggest">
          <Stack space={3}>
            <Heading size={1}>
              {remainingTaskCount} required task{remainingTaskCount === 1 ? '' : 's'} still
              incomplete for {sourceStageName} stage
            </Heading>
            <Text size={1}>Mark the remaining tasks as complete?</Text>
          </Stack>
        </Card>
      ) : (
        <Card padding={3} radius={2} border tone="caution">
          <Stack space={3}>
            <Heading size={1}>
              {remainingTaskCount} required task{remainingTaskCount === 1 ? '' : 's'} still
              incomplete for {sourceStageName} stage
            </Heading>
            <Text size={1}>
              The following required tasks must be completed before this document can advance:
            </Text>
          </Stack>
        </Card>
      )}

      {currentUserCanOverride && !allTasksClosed && (
        <Card padding={3} radius={2} border tone="caution">
          <Text size={1}>Warning: you have permission to override this gate.</Text>
        </Card>
      )}

      <Stack space={2}>
        {visibleTasks.map((task) => {
          const assignee = users.find((user) => user.id === task.assignedTo)

          return (
            <WorkflowTransitionTaskInstanceRow
              key={task._id}
              currentUserCanOverride={currentUserCanOverride}
              onToggleClosed={() => {
                setOverrides((prev) => {
                  const next = new Map(prev)
                  const originalStatus = tasks.find(
                    (candidate) => candidate._id === task._id,
                  )?.status
                  const newStatus = task.status === 'open' ? 'closed' : 'open'

                  if (originalStatus === newStatus) {
                    next.delete(task._id)
                  } else {
                    next.set(task._id, newStatus)
                  }

                  return next
                })
              }}
              task={task}
              user={assignee}
              onViewTask={() => handleViewTask(task._id)}
            />
          )
        })}
      </Stack>

      <Flex gap={3} justify="flex-end">
        {currentUserCanOverride ? (
          <>
            <Button
              disabled={isSubmitting}
              fontSize={1}
              mode="ghost"
              onClick={onCancel}
              padding={3}
              text="Cancel"
            />
            <Button
              disabled={isSubmitting}
              fontSize={1}
              onClick={() => {
                void onConfirm(
                  Array.from(overrides.entries()).map(([taskId, status]) => ({status, taskId})),
                )
              }}
              padding={3}
              text={
                isSubmitting
                  ? resolvedSubmittingText
                  : allTasksClosed
                    ? `Move to ${targetStageTitle}`
                    : `Override & Move to ${targetStageTitle}`
              }
              tone={allTasksClosed ? 'positive' : 'caution'}
            />
          </>
        ) : (
          <Button fontSize={1} mode="ghost" onClick={onCancel} padding={3} text="Close" />
        )}
      </Flex>
    </Stack>
  )
}

export function WorkflowTransitionGatedDialog({
  currentUserCanOverride,
  dialogId = 'workflow-transition-gated-dialog',
  open,
  sourceStageName,
  targetStageTitle,
  zOffset = 1000,
  ...contentProps
}: WorkflowTransitionGatedDialogProps) {
  if (!open) return null

  const header = currentUserCanOverride
    ? `Move to ${targetStageTitle}`
    : "Can't advance - open tasks remaining"

  return (
    <Dialog
      header={header}
      id={dialogId}
      onClose={contentProps.onCancel}
      width={1}
      zOffset={zOffset}
      animate
    >
      <WorkflowTransitionGatedDialogContent
        {...contentProps}
        currentUserCanOverride={currentUserCanOverride}
        sourceStageName={sourceStageName}
        targetStageTitle={targetStageTitle}
      />
    </Dialog>
  )
}
