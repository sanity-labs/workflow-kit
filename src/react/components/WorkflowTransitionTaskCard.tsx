import {Avatar, Box, Button, Card, Checkbox, Flex, Stack, Text, Tooltip} from '@sanity/ui'
import {CheckSquare2, Clock3, type LucideIcon} from 'lucide-react'
import type {ReactNode} from 'react'

import type {
  WorkflowTransitionDialogUser,
  WorkflowTransitionTaskRow,
  WorkflowTransitionTaskTemplatePreview,
} from '../../types/dialogs'
import {formatDueDate} from '../utils/formatDueDate'

interface WorkflowTransitionTaskCardProps {
  asLabel?: boolean
  children?: ReactNode
  title: string
  trailing?: ReactNode
}

function IconPill({
  Icon,
  label,
  tone = 'primary',
}: {
  Icon: LucideIcon
  label: string
  tone?: 'caution' | 'critical' | 'primary'
}) {
  const background =
    tone === 'caution'
      ? 'var(--card-badge-caution-bg-color)'
      : tone === 'critical'
        ? 'var(--card-badge-critical-bg-color)'
        : 'var(--card-badge-primary-bg-color)'

  const foreground =
    tone === 'caution'
      ? 'var(--card-badge-caution-fg-color)'
      : tone === 'critical'
        ? 'var(--card-badge-critical-fg-color)'
        : 'var(--card-badge-primary-fg-color)'

  return (
    <Flex
      align="center"
      gap={1}
      style={{
        borderRadius: '9999px',
        background,
        color: foreground,
        padding: '0.125rem 0.5rem',
      }}
    >
      <Icon size={12} />
      <Text size={1}>{label}</Text>
    </Flex>
  )
}

function WorkflowTransitionTaskCard({
  asLabel = false,
  children,
  title,
  trailing,
}: WorkflowTransitionTaskCardProps) {
  const content = (
    <Flex gap={2} align="center">
      <Box marginRight={2} style={{lineHeight: 0, display: 'flex', alignItems: 'center'}}>
        <Box
          style={{
            alignItems: 'center',
            backgroundColor: 'var(--card-badge-primary-bg-color)',
            borderRadius: '50%',
            color: 'var(--card-badge-primary-fg-color)',
            display: 'flex',
            flexShrink: 0,
            height: '2em',
            justifyContent: 'center',
            padding: '0.25em',
            width: '2em',
          }}
        >
          <CheckSquare2 size={16} />
        </Box>
      </Box>

      <Stack space={2} flex={1}>
        <Text size={2} weight="medium">
          {title || 'Untitled task'}
        </Text>

        {children ? (
          <Flex gap={2} align="center" wrap="wrap">
            {children}
          </Flex>
        ) : null}
      </Stack>

      {trailing ? <Box style={{flexShrink: 0}}>{trailing}</Box> : null}
    </Flex>
  )

  return (
    <Card padding={3} radius={2} border tone="neutral">
      {asLabel ? (
        <Box as="label" style={{display: 'block', cursor: 'pointer'}}>
          {content}
        </Box>
      ) : (
        content
      )}
    </Card>
  )
}

function WorkflowTransitionDueInDaysBadge({dueInDays}: {dueInDays: number}) {
  return (
    <Tooltip
      animate
      content={
        <Box padding={1}>
          <Text size={1}>
            Task will be created with a due date of{' '}
            {new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
          </Text>
        </Box>
      }
      placement="bottom"
      portal
    >
      <Box>
        <IconPill
          Icon={Clock3}
          label={`${dueInDays} day${dueInDays === 1 ? '' : 's'}`}
          tone="primary"
        />
      </Box>
    </Tooltip>
  )
}

function WorkflowTransitionDueDateBadge({dueDate}: {dueDate: string}) {
  const label = formatDueDate(dueDate)
  const tone = label.startsWith('overdue') || label === 'due today' ? 'caution' : 'primary'

  return <IconPill Icon={Clock3} label={label} tone={tone} />
}

export interface WorkflowTransitionTaskTemplateRowProps {
  onSelectAssignee: (userId: string) => void
  selectedAssigneeId?: string
  template: WorkflowTransitionTaskTemplatePreview
}

export function WorkflowTransitionTaskTemplateRow({
  onSelectAssignee,
  selectedAssigneeId,
  template,
}: WorkflowTransitionTaskTemplateRowProps) {
  return (
    <WorkflowTransitionTaskCard title={template.title}>
      {typeof template.dueInDays === 'number' ? (
        <WorkflowTransitionDueInDaysBadge dueInDays={template.dueInDays} />
      ) : null}

      <Flex gap={2} wrap="wrap">
        {template.eligibleUsers.length === 0 ? (
          <Text size={0} muted>
            No eligible team members
          </Text>
        ) : (
          template.eligibleUsers.map((user) => (
            <Tooltip
              key={user.id}
              animate
              delay={300}
              content={
                <Box padding={1}>
                  <Text size={1}>
                    {selectedAssigneeId === user.id
                      ? `Will be assigned to ${user.displayName ?? 'this user'}`
                      : `Assign this task to ${user.displayName ?? 'this user'}`}
                  </Text>
                </Box>
              }
              placement="bottom"
              portal
            >
              <Button
                fontSize={1}
                onClick={() => onSelectAssignee(user.id)}
                padding={1}
                style={{borderRadius: '9999px'}}
                tone={selectedAssigneeId === user.id ? 'primary' : 'neutral'}
              >
                <Flex gap={1} align="center">
                  <Avatar src={user.imageUrl} size={0} style={{borderRadius: '9999px'}} />
                  <Text size={1} style={{paddingInlineEnd: '0.5em'}}>
                    {user.displayName || 'Unknown'}
                  </Text>
                </Flex>
              </Button>
            </Tooltip>
          ))
        )}
      </Flex>
    </WorkflowTransitionTaskCard>
  )
}

export interface WorkflowTransitionTaskInstanceRowProps {
  currentUserCanOverride?: boolean
  onToggleClosed?: () => void
  task: WorkflowTransitionTaskRow
  user?: WorkflowTransitionDialogUser
}

export function WorkflowTransitionTaskInstanceRow({
  currentUserCanOverride = false,
  onToggleClosed,
  task,
  user,
}: WorkflowTransitionTaskInstanceRowProps) {
  const isOpen = task.status === 'open'

  return (
    <WorkflowTransitionTaskCard
      asLabel={currentUserCanOverride}
      title={task.title}
      trailing={
        currentUserCanOverride ? (
          <Checkbox checked={!isOpen} onChange={onToggleClosed} style={{flexShrink: 0}} />
        ) : null
      }
    >
      {task.dueDate ? <WorkflowTransitionDueDateBadge dueDate={task.dueDate} /> : null}

      <Flex gap={1} align="center">
        <Avatar src={user?.imageUrl} size={0} style={{borderRadius: '9999px', flexShrink: 0}} />
        <Text size={1}>{user?.displayName || 'Unassigned'}</Text>
      </Flex>
    </WorkflowTransitionTaskCard>
  )
}
