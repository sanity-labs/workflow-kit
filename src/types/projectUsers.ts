export interface WorkflowProjectAclEntry {
  isRobot?: boolean
  projectUserId: string
  roles?: Array<{name: string; title: string}>
}

export interface WorkflowProjectUser {
  displayName?: string
  email?: string
  id: string
  imageUrl?: string
  sanityUserId?: string
}
