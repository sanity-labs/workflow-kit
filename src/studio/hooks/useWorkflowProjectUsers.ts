import {useEffect, useState} from 'react'
import type {SanityClient} from 'sanity'

import {requestManagementApi} from '../../internal/managementApi/requestManagementApi'
import type {WorkflowProjectAclEntry, WorkflowProjectUser} from '../../types/projectUsers'

interface WorkflowProjectUsersResult {
  aclData: WorkflowProjectAclEntry[]
  projectUsers: WorkflowProjectUser[]
}

const workflowProjectUsersPromiseCache = new Map<string, Promise<WorkflowProjectUsersResult>>()
const workflowProjectUsersResultCache = new Map<string, WorkflowProjectUsersResult>()

async function fetchWorkflowProjectUsers(projectId: string): Promise<WorkflowProjectUsersResult> {
  const acl = await requestManagementApi<WorkflowProjectAclEntry[]>(`/projects/${projectId}/acl`)
  const nonRobotIds = acl.filter((entry) => !entry.isRobot).map((entry) => entry.projectUserId)

  if (nonRobotIds.length === 0) {
    return {
      aclData: acl,
      projectUsers: [],
    }
  }

  let users: WorkflowProjectUser[] = []

  for (let index = 0; index < nonRobotIds.length; index += 200) {
    const chunk = nonRobotIds.slice(index, index + 200)
    const response = await requestManagementApi<
      Array<{
        displayName?: string
        email?: string
        id: string
        imageUrl?: string
        sanityUserId?: string
      }>
    >(`/projects/${projectId}/users/${chunk.join(',')}`)

    users = [
      ...users,
      ...response.map((user) => ({
        displayName: user.displayName,
        email: user.email,
        id: user.id,
        imageUrl: user.imageUrl,
        sanityUserId: user.sanityUserId,
      })),
    ]
  }

  return {
    aclData: acl,
    projectUsers: users,
  }
}

function getCachedWorkflowProjectUsers(projectId: string): Promise<WorkflowProjectUsersResult> {
  const cachedResult = workflowProjectUsersResultCache.get(projectId)
  if (cachedResult) {
    return Promise.resolve(cachedResult)
  }

  const cachedPromise = workflowProjectUsersPromiseCache.get(projectId)
  if (cachedPromise) {
    return cachedPromise
  }

  const request = fetchWorkflowProjectUsers(projectId)
    .then((result) => {
      workflowProjectUsersResultCache.set(projectId, result)
      return result
    })
    .finally(() => {
      workflowProjectUsersPromiseCache.delete(projectId)
    })

  workflowProjectUsersPromiseCache.set(projectId, request)
  return request
}

export function useWorkflowProjectUsers(client: SanityClient) {
  const [aclData, setAclData] = useState<WorkflowProjectAclEntry[]>([])
  const [projectUsers, setProjectUsers] = useState<WorkflowProjectUser[]>([])
  const [loaded, setLoaded] = useState(false)
  const {projectId} = client.config()

  useEffect(() => {
    if (!projectId) {
      setAclData([])
      setProjectUsers([])
      setLoaded(true)
      return
    }

    let cancelled = false
    setLoaded(false)

    void getCachedWorkflowProjectUsers(projectId)
      .then((result) => {
        if (cancelled) return
        setAclData(result.aclData)
        setProjectUsers(result.projectUsers)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setAclData([])
        setProjectUsers([])
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  return {aclData, loaded, projectUsers}
}
