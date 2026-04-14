const MANAGEMENT_API_BASE_URL = 'https://api.sanity.io'
const MANAGEMENT_API_VERSION = 'vX'

export interface ManagementApiRequestOptions extends Omit<RequestInit, 'credentials'> {
  apiVersion?: string
  searchParams?: Record<string, null | number | string | undefined>
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

export async function requestManagementApi<T>(
  path: string,
  options: ManagementApiRequestOptions = {},
): Promise<T> {
  const {apiVersion = MANAGEMENT_API_VERSION, headers, searchParams, ...requestInit} = options

  const response = await fetch(buildManagementApiUrl(path, apiVersion, searchParams), {
    ...requestInit,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
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
