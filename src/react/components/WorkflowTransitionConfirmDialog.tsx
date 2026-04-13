import {PortableText} from '@portabletext/react'
import {Button, Card, Dialog, Flex, Heading, Label, Stack, Text, TextArea} from '@sanity/ui'
import {useEffect, useMemo, useState} from 'react'

import type {
  WorkflowTransitionCriteriaBlock,
  WorkflowTransitionTaskAssigneeOverride,
  WorkflowTransitionTaskTemplatePreview,
} from '../../types/dialogs'
import {WorkflowTransitionTaskTemplateRow} from './WorkflowTransitionTaskCard'

export interface WorkflowTransitionConfirmDialogContentProps {
  confirmText?: string
  criteria?: WorkflowTransitionCriteriaBlock[] | null
  isSubmitting?: boolean
  onCancel: () => void
  onConfirm: (
    overrides?: WorkflowTransitionTaskAssigneeOverride[],
    note?: string,
  ) => void | Promise<void>
  stageTitle: string
  submittingText?: string
  taskTemplates?: WorkflowTransitionTaskTemplatePreview[] | null
}

export interface WorkflowTransitionConfirmDialogProps extends WorkflowTransitionConfirmDialogContentProps {
  dialogId?: string
  open: boolean
  zOffset?: number
}

function getInitialOverrides(
  taskTemplates: WorkflowTransitionTaskTemplatePreview[] | null | undefined,
): Map<number, string | undefined> {
  const initial = new Map<number, string | undefined>()

  taskTemplates?.forEach((template, index) => {
    if (template.initialAssignedTo) {
      initial.set(index, template.initialAssignedTo)
    }
  })

  return initial
}

export function WorkflowTransitionConfirmDialogContent({
  confirmText,
  criteria,
  isSubmitting = false,
  onCancel,
  onConfirm,
  stageTitle,
  submittingText,
  taskTemplates,
}: WorkflowTransitionConfirmDialogContentProps) {
  const [assigneeOverrides, setAssigneeOverrides] = useState<Map<number, string | undefined>>(() =>
    getInitialOverrides(taskTemplates),
  )
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    setAssigneeOverrides(getInitialOverrides(taskTemplates))
    setNoteText('')
  }, [stageTitle, taskTemplates])

  const hasCriteria = Array.isArray(criteria) && criteria.length > 0
  const hasTemplates = Array.isArray(taskTemplates) && taskTemplates.length > 0
  const hasSupportingContent = hasCriteria || hasTemplates
  const resolvedConfirmText = confirmText ?? `Move to ${stageTitle}`
  const resolvedSubmittingText = submittingText ?? `Moving to ${stageTitle}...`

  const overrides = useMemo(
    () =>
      Array.from(assigneeOverrides.entries()).map(([templateIndex, assignedTo]) => ({
        assignedTo,
        templateIndex,
      })),
    [assigneeOverrides],
  )

  return (
    <Stack paddingX={4} paddingBottom={4} paddingTop={2} space={4}>
      {!hasSupportingContent && (
        <Card padding={4} border tone="positive" radius={2}>
          <Stack space={3}>
            <Heading size={1}>All required tasks are complete</Heading>
            <Text size={1}>Ready to move to {stageTitle}.</Text>
          </Stack>
        </Card>
      )}

      {hasCriteria && (
        <Card padding={4} border tone="primary" radius={2}>
          <Heading size={1}>Stage Guidelines for {stageTitle}</Heading>
          <PortableText value={criteria as WorkflowTransitionCriteriaBlock[]} />
        </Card>
      )}

      {hasTemplates && (
        <>
          <Heading size={1}>Tasks That Will Be Created</Heading>

          <Stack space={3}>
            {taskTemplates.map((template, index) => {
              const selectedId = assigneeOverrides.has(index)
                ? assigneeOverrides.get(index)
                : template.initialAssignedTo

              return (
                <WorkflowTransitionTaskTemplateRow
                  key={`${template.title}-${index}`}
                  onSelectAssignee={(userId) => {
                    setAssigneeOverrides((prev) => {
                      const next = new Map(prev)
                      next.set(index, userId)
                      return next
                    })
                  }}
                  selectedAssigneeId={selectedId}
                  template={template}
                />
              )
            })}
          </Stack>

          <Stack space={2}>
            <Label size={1}>Add a note for assignees (optional)</Label>
            <TextArea
              onChange={(event) => setNoteText(event.currentTarget.value)}
              placeholder="Context for the team..."
              rows={2}
              value={noteText}
            />
          </Stack>
        </>
      )}

      <Flex gap={3} justify="flex-end">
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
              overrides.length > 0 ? overrides : undefined,
              noteText.trim() || undefined,
            )
          }}
          padding={3}
          text={isSubmitting ? resolvedSubmittingText : resolvedConfirmText}
          tone="primary"
        />
      </Flex>
    </Stack>
  )
}

export function WorkflowTransitionConfirmDialog({
  dialogId = 'workflow-transition-confirm-dialog',
  open,
  zOffset = 1000,
  ...contentProps
}: WorkflowTransitionConfirmDialogProps) {
  if (!open) return null

  return (
    <Dialog
      header={`Move to ${contentProps.stageTitle}`}
      id={dialogId}
      onClose={contentProps.onCancel}
      width={1}
      zOffset={zOffset}
      animate
    >
      <WorkflowTransitionConfirmDialogContent {...contentProps} />
    </Dialog>
  )
}
