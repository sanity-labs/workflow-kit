import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  getCommentsDatasetName,
  isMissingCommentsDatasetError,
  resetMissingCommentsDatasetWarnings,
  warnMissingCommentsDataset,
} from './commentsDataset'

afterEach(() => {
  resetMissingCommentsDatasetWarnings()
  vi.restoreAllMocks()
})

describe('isMissingCommentsDatasetError', () => {
  it('detects 404 dataset-not-found responses', () => {
    expect(
      isMissingCommentsDatasetError(
        {message: 'Dataset "production-comments" not found', statusCode: 404},
        'production-comments',
      ),
    ).toBe(true)
  })

  it('detects message-only missing dataset errors', () => {
    expect(isMissingCommentsDatasetError(new Error('Unknown dataset production-comments'))).toBe(
      true,
    )
  })

  it('ignores unrelated failures', () => {
    expect(isMissingCommentsDatasetError(new Error('Insufficient permissions'))).toBe(false)
    expect(isMissingCommentsDatasetError({message: 'Boom', statusCode: 500})).toBe(false)
  })
})

describe('warnMissingCommentsDataset', () => {
  it('warns once per comments dataset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnMissingCommentsDataset({
      error: {message: 'Dataset "development-comments" not found', statusCode: 404},
      logPrefix: '[test]',
      mainDataset: 'development',
    })
    warnMissingCommentsDataset({
      error: {message: 'Dataset "development-comments" not found', statusCode: 404},
      logPrefix: '[test]',
      mainDataset: 'development',
    })

    expect(getCommentsDatasetName('development')).toBe('development-comments')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('add a comment or create a task')
    expect(warn.mock.calls[0]?.[0]).toContain('development-comments')
  })
})
