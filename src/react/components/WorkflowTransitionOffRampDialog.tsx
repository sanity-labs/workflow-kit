import {PortableText} from '@portabletext/react'
import {Box, Button, Card, Dialog, Flex, Stack, Text, TextArea} from '@sanity/ui'
import {useEffect, useState} from 'react'

import type {WorkflowTransitionCriteriaBlock} from '../../types/dialogs'

export interface WorkflowTransitionOffRampDialogContentProps {
  confirmText?: string
  criteria?: WorkflowTransitionCriteriaBlock[] | null
  isSubmitting?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void | Promise<void>
  stageTitle: string
  submittingText?: string
  unpublishOnEntry?: boolean
}

export interface WorkflowTransitionOffRampDialogProps extends WorkflowTransitionOffRampDialogContentProps {
  dialogId?: string
  open: boolean
  zOffset?: number
}

export function WorkflowTransitionOffRampDialogContent({
  confirmText,
  criteria,
  isSubmitting = false,
  onCancel,
  onConfirm,
  stageTitle,
  submittingText,
  unpublishOnEntry = false,
}: WorkflowTransitionOffRampDialogContentProps) {
  const [reason, setReason] = useState('')
  const resolvedConfirmText =
    confirmText ||
    (unpublishOnEntry ? `Move to ${stageTitle} & Unpublish` : `Move to ${stageTitle}`)
  const resolvedSubmittingText =
    submittingText ||
    (unpublishOnEntry ? `Moving to ${stageTitle} & Unpublishing...` : `Moving to ${stageTitle}...`)

  useEffect(() => {
    setReason('')
  }, [stageTitle, unpublishOnEntry, criteria])

  return (
    <Stack padding={4} space={4}>
      {unpublishOnEntry && (
        <Card padding={3} radius={2} tone="critical">
          <Flex gap={2} align="flex-start">
            <Text size={1}>!</Text>
            <Stack space={2}>
              <Text size={1} weight="semibold">
                This will unpublish the document.
              </Text>
              <Text size={1} muted>
                It will be removed from all live surfaces until it is moved back into the workflow.
              </Text>
            </Stack>
          </Flex>
        </Card>
      )}

      {criteria && criteria.length > 0 && (
        <Box paddingX={2}>
          <PortableText value={criteria} />
        </Box>
      )}

      <Stack space={2}>
        <Text size={1} weight="semibold">
          Reason <span style={{color: 'var(--card-badge-critical-bg-color, red)'}}>*</span>
        </Text>
        <TextArea
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder="e.g. Partner requested hold pending legal review"
          rows={3}
          value={reason}
        />
      </Stack>

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
          disabled={isSubmitting || !reason.trim()}
          fontSize={1}
          onClick={() => {
            void onConfirm(reason.trim())
          }}
          padding={3}
          text={isSubmitting ? resolvedSubmittingText : resolvedConfirmText}
          tone="critical"
        />
      </Flex>
    </Stack>
  )
}

export function WorkflowTransitionOffRampDialog({
  dialogId = 'workflow-transition-offramp-dialog',
  open,
  zOffset = 1000,
  ...contentProps
}: WorkflowTransitionOffRampDialogProps) {
  if (!open) return null

  return (
    <Dialog
      header={contentProps.stageTitle}
      id={dialogId}
      onClose={contentProps.onCancel}
      width={1}
      zOffset={zOffset}
      animate
    >
      <WorkflowTransitionOffRampDialogContent {...contentProps} />
    </Dialog>
  )
}
