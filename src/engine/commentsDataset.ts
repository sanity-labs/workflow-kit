const warnedCommentsDatasets = new Set<string>()

export function getCommentsDatasetName(mainDataset: string): string {
  return `${mainDataset}-comments`
}

/**
 * Detect Sanity API failures that mean the `<dataset>-comments` addon dataset
 * has not been created yet.
 */
export function isMissingCommentsDatasetError(
  error: unknown,
  commentsDataset?: string,
): boolean {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as {statusCode?: unknown}).statusCode)
      : typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as {status?: unknown}).status)
        : undefined

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as {message?: unknown}).message ?? '')
        : String(error ?? '')

  const normalized = message.toLowerCase()
  const mentionsDataset =
    normalized.includes('dataset') ||
    (typeof commentsDataset === 'string' &&
      commentsDataset.length > 0 &&
      normalized.includes(commentsDataset.toLowerCase()))

  const looksMissing =
    normalized.includes('not found') ||
    normalized.includes('does not exist') ||
    normalized.includes('unknown dataset') ||
    normalized.includes('dataset not found')

  if (statusCode === 404 && (mentionsDataset || looksMissing)) {
    return true
  }

  return mentionsDataset && looksMissing
}

/**
 * Warn once per comments-dataset name when task/gating APIs fail because the
 * addon dataset was never created.
 */
export function warnMissingCommentsDataset({
  error,
  logPrefix,
  mainDataset,
}: {
  error?: unknown
  logPrefix: string
  mainDataset: string
}): void {
  const commentsDataset = getCommentsDatasetName(mainDataset)

  if (error !== undefined && !isMissingCommentsDatasetError(error, commentsDataset)) {
    return
  }

  if (warnedCommentsDatasets.has(commentsDataset)) {
    return
  }

  warnedCommentsDatasets.add(commentsDataset)

  console.warn(
    [
      `${logPrefix} Workflow tasks require the "${commentsDataset}" comments/tasks addon dataset, but it is not initialised.`,
      'Open Studio, open any document, and add a comment or create a task once to provision it',
      '(a bare `sanity dataset create …-comments` is not enough).',
      'See @sanity-labs/sanity-plugin-workflows README → Quickstart.',
    ].join(' '),
  )
}

/** @internal test helper */
export function resetMissingCommentsDatasetWarnings(): void {
  warnedCommentsDatasets.clear()
}
