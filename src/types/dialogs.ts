export interface WorkflowTransitionCriteriaBlock {
  _type: string
  [key: string]: unknown
}

export interface WorkflowTransitionDialogUser {
  displayName?: string
  id: string
  imageUrl?: string
}

export interface WorkflowTransitionTaskRow {
  _id: string
  assignedTo?: string
  createdAt?: string
  dueDate?: string
  status: 'closed' | 'open'
  title: string
}

export interface WorkflowTransitionTaskStatusOverride {
  status: 'closed' | 'open'
  taskId: string
}

export interface WorkflowTransitionTaskTemplatePreview {
  assigneeRole?: string
  dueInDays?: number
  eligibleUsers: WorkflowTransitionDialogUser[]
  initialAssignedTo?: string
  title: string
}

export interface WorkflowTransitionTaskAssigneeOverride {
  assignedTo: string | undefined
  templateIndex: number
}
