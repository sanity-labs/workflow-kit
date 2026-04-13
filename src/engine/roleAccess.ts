import type {WorkflowProjectAclEntry, WorkflowProjectUser} from '../types/projectUsers'
import type {WorkflowTransitionRole} from '../types/transition'
import {workflowRoleSlugMatches} from './roleMatching'

interface UserHasWorkflowRoleAccessParams {
  aclData: WorkflowProjectAclEntry[]
  currentUserEmail?: null | string | undefined
  currentUserSanityId: null | string | undefined
  projectUsers: WorkflowProjectUser[]
  requestedWorkflowRoleSlugs: string[]
  workflowRoles: null | undefined | WorkflowTransitionRole[]
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase()
}

export function findProjectUserForCurrentSanityMember(
  projectUsers: WorkflowProjectUser[],
  currentUserSanityId: null | string | undefined,
  currentUserEmail?: null | string | undefined,
): WorkflowProjectUser | undefined {
  if (!currentUserSanityId && !currentUserEmail?.trim()) {
    return undefined
  }

  if (currentUserSanityId) {
    const exact = projectUsers.find((user) => user.sanityUserId === currentUserSanityId)
    if (exact) {
      return exact
    }

    const normalizedSessionId = normalizeComparable(currentUserSanityId)
    const caseInsensitive = projectUsers.find(
      (user) => user.sanityUserId && normalizeComparable(user.sanityUserId) === normalizedSessionId,
    )
    if (caseInsensitive) {
      return caseInsensitive
    }
  }

  if (currentUserEmail?.trim()) {
    const normalizedEmail = normalizeComparable(currentUserEmail)
    return projectUsers.find(
      (user) => user.email && normalizeComparable(user.email) === normalizedEmail,
    )
  }

  return undefined
}

export function userHasWorkflowRoleAccess({
  aclData,
  currentUserEmail,
  currentUserSanityId,
  projectUsers,
  requestedWorkflowRoleSlugs,
  workflowRoles,
}: UserHasWorkflowRoleAccessParams): boolean {
  if (
    (!currentUserSanityId && !currentUserEmail?.trim()) ||
    !requestedWorkflowRoleSlugs.length ||
    !workflowRoles?.length
  ) {
    return false
  }

  const currentProjectUser = findProjectUserForCurrentSanityMember(
    projectUsers,
    currentUserSanityId,
    currentUserEmail,
  )
  if (!currentProjectUser) {
    return false
  }

  const aclEntry = aclData.find((entry) => entry.projectUserId === currentProjectUser.id)
  if (!aclEntry?.roles?.length) {
    return false
  }

  return workflowRoles.some((workflowRole) => {
    if (!workflowRole.slug) {
      return false
    }

    const slugMatchesRequest = requestedWorkflowRoleSlugs.some((requestedRoleSlug) =>
      workflowRoleSlugMatches(requestedRoleSlug, workflowRole.slug),
    )
    if (!slugMatchesRequest) {
      return false
    }

    const projectRoles = workflowRole.projectRoles ?? []
    return projectRoles.some((projectRole) =>
      aclEntry.roles?.some((aclRole) => aclRole.name === projectRole),
    )
  })
}

export function canUseOffRampStage({
  aclData,
  allowedRoles,
  currentUserEmail,
  currentUserSanityId,
  projectUsers,
  workflowRoles,
}: Omit<UserHasWorkflowRoleAccessParams, 'requestedWorkflowRoleSlugs'> & {
  allowedRoles: null | string[] | undefined
}): boolean {
  if (!allowedRoles?.length) return true

  return userHasWorkflowRoleAccess({
    aclData,
    currentUserEmail,
    currentUserSanityId,
    projectUsers,
    requestedWorkflowRoleSlugs: allowedRoles,
    workflowRoles,
  })
}

export function getWorkflowRoleLabels({
  requestedWorkflowRoleSlugs,
  workflowRoles,
}: {
  requestedWorkflowRoleSlugs: null | string[] | undefined
  workflowRoles: null | undefined | WorkflowTransitionRole[]
}): string[] {
  if (!requestedWorkflowRoleSlugs?.length || !workflowRoles?.length) return []

  return Array.from(
    new Set(
      workflowRoles
        .filter(
          (workflowRole) =>
            workflowRole.slug &&
            requestedWorkflowRoleSlugs.some((requestedRoleSlug) =>
              workflowRoleSlugMatches(requestedRoleSlug, workflowRole.slug),
            ),
        )
        .map((workflowRole) => workflowRole.label || workflowRole.slug)
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

export function getOffRampDisabledTitle({
  allowedRoles,
  workflowRoles,
}: {
  allowedRoles: null | string[] | undefined
  workflowRoles: null | undefined | WorkflowTransitionRole[]
}): string {
  const roleLabels = getWorkflowRoleLabels({
    requestedWorkflowRoleSlugs: allowedRoles,
    workflowRoles,
  }).join(', ')

  return `Only ${roleLabels || 'authorized'} roles can use this off-ramp`
}
