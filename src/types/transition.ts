export interface WorkflowAssignmentValue {
  assignmentType?: string
  userId?: string
}

export interface WorkflowStatusAuditEntry {
  _key: string
  _type: 'setStatus'
  completedAt: string
  completedBy: {_type: 'user'; userId: string}
  reason?: string
  statusIcon?: string
  statusLabel: string
  statusSlug: string
}

export interface WorkflowTaskTemplate {
  assigneeRole?: string
  description?: Array<{_type: string; [key: string]: unknown}>
  dueInDays?: number
  required?: boolean
  title: string
}

export interface WorkflowTransitionRole {
  label?: string
  projectRoles?: string[]
  slug?: string
}

export interface WorkflowTransitionStage {
  allowedRoles?: string[]
  color?: string
  enableCompletionGating?: boolean
  enablePublishing?: boolean
  gatingOverrideRoles?: string[]
  icon?: string
  label?: string
  slug?: string
  stageCriteria?: Array<{_type: string; [key: string]: unknown}>
  taskTemplates?: WorkflowTaskTemplate[]
  tone?: string
  unpublishOnEntry?: boolean
}

export interface WorkflowDefinition {
  forwardOnly?: boolean
  offRamps?: WorkflowTransitionStage[]
  roles?: WorkflowTransitionRole[]
  stages?: WorkflowTransitionStage[]
}

export interface WorkflowTransitionDocument {
  assignments?: WorkflowAssignmentValue[]
  pendingTransitionReason?: string
  statuses?: Array<{completedAt?: string; statusSlug?: string}>
}
