const MANAGEMENT_API_BASE_URL = 'https://api.sanity.io'
const MANAGEMENT_API_VERSION = 'vX'
const STUDIO_AUTH_TOKEN_STORAGE_PREFIX = '__studio_auth_token_'

export interface ManagementApiRequestOptions extends Omit<RequestInit, 'credentials'> {
  apiVersion?: string
  /**
   * Project id used to resolve the Studio session token from localStorage when
   * `token` is omitted. Hosted Studios (`*.sanity.studio`) require Bearer auth
   * for Management API CORS; cookie-only requests are blocked there.
   */
  projectId?: string
  searchParams?: Record<string, null | number | string | undefined>
  /**
   * Studio session token (e.g. `client.config().token`). Preferred over reading
   * localStorage when available.
   */
  token?: (() => null | string | undefined) | null | string | undefined
}

function buildManagementApiUrl(
  path: string,
  apiVersion: string,
  searchParams?: Record<string, null | number | string | undefined>,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${MANAGEMENT_API_BASE_URL}/${apiVersion}${normalizedPath}`)

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

function getManagementApiErrorMessage(body: unknown, status: number, statusText: string): string {
  if (typeof body === 'string' && body.trim()) {
    return body
  }

  if (body && typeof body === 'object') {
    const maybeError = body as {error?: string; message?: string}
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return maybeError.message
    }

    if (typeof maybeError.error === 'string' && maybeError.error.trim()) {
      return maybeError.error
    }
  }

  return `Management API request failed with ${status}${statusText ? ` ${statusText}` : ''}.`
}

async function readManagementApiBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text || null
}

function normalizeAuthToken(token: unknown): string | undefined {
  if (typeof token === 'function') {
    try {
      return normalizeAuthToken(token())
    } catch {
      return undefined
    }
  }

  if (typeof token === 'string') {
    const trimmed = token.trim()
    return trimmed || undefined
  }

  return undefined
}

function readStoredStudioAuthToken(projectId: string): string | undefined {
  if (typeof localStorage === 'undefined') return undefined

  try {
    const raw = localStorage.getItem(`${STUDIO_AUTH_TOKEN_STORAGE_PREFIX}${projectId}`)
    if (!raw) return undefined
    return normalizeAuthToken((JSON.parse(raw) as {token?: unknown} | null)?.token)
  } catch {
    return undefined
  }
}

/**
 * Resolve a Studio session token for Management API requests.
 *
 * Hosted Studios cannot rely on cookie credentials alone — Management API CORS
 * only allows cookie auth from localhost / manage.sanity.io. Bearer tokens work
 * from `*.sanity.studio`.
 */
export function resolveStudioAuthToken(
  options: {
    projectId?: string
    token?: (() => null | string | undefined) | null | string | undefined
  } = {},
): string | undefined {
  const explicit = normalizeAuthToken(options.token)
  if (explicit) return explicit

  if (options.projectId) {
    return readStoredStudioAuthToken(options.projectId)
  }

  return undefined
}

export async function requestManagementApi<T>(
  path: string,
  options: ManagementApiRequestOptions = {},
): Promise<T> {
  const {
    apiVersion = MANAGEMENT_API_VERSION,
    headers,
    projectId,
    searchParams,
    token,
    ...requestInit
  } = options

  const resolvedToken = resolveStudioAuthToken({projectId, token})

  const response = await fetch(buildManagementApiUrl(path, apiVersion, searchParams), {
    ...requestInit,
    // Keep cookies for localhost dual-auth; Bearer is required on hosted Studios.
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(resolvedToken ? {Authorization: `Bearer ${resolvedToken}`} : {}),
      ...headers,
    },
  })

  const body = await readManagementApiBody(response)
  if (!response.ok) {
    const error = new Error(
      getManagementApiErrorMessage(body, response.status, response.statusText),
    ) as Error & {
      body?: unknown
      response: {statusCode: number}
      status: number
      statusCode: number
    }

    error.body = body
    error.response = {statusCode: response.status}
    error.status = response.status
    error.statusCode = response.status

    throw error
  }

  return body as T
}
