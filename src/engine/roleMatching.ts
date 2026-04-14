const REPORTER_ALIASES = ['reporter', 'author'] as const
const SECTION_EDITOR_ALIASES = ['section_editor', 'section-editor', 'editor'] as const
const LEAD_EDITOR_ALIASES = ['lead_editor', 'lead-editor'] as const
const FACT_CHECKER_ALIASES = ['fact_checker', 'fact-checker'] as const
const AD_OPS_ALIASES = ['ad_ops', 'ad-ops'] as const

type AliasGroup = readonly string[]

function toCanonicalToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function getAliasGroup(token: string): AliasGroup | null {
  switch (token) {
    case 'author':
    case 'reporter':
      return REPORTER_ALIASES
    case 'editor':
    case 'section_editor':
      return SECTION_EDITOR_ALIASES
    case 'lead_editor':
      return LEAD_EDITOR_ALIASES
    case 'fact_checker':
      return FACT_CHECKER_ALIASES
    case 'ad_ops':
      return AD_OPS_ALIASES
    default:
      return null
  }
}

export function getWorkflowRoleMatchCandidates(value: string): string[] {
  const token = toCanonicalToken(value)
  const group = getAliasGroup(token)

  if (!group) {
    return unique([token, token.replace(/_/g, '-')])
  }

  const exactFirst =
    token === 'section_editor'
      ? ['section_editor', 'section-editor', 'editor']
      : token === 'editor'
        ? ['editor', 'section_editor', 'section-editor']
        : token === 'reporter'
          ? ['reporter', 'author']
          : token === 'author'
            ? ['author', 'reporter']
            : Array.from(group)

  return unique(exactFirst)
}

export function normalizeWorkflowRoleSlug(value: string): string {
  const token = toCanonicalToken(value)

  switch (token) {
    case 'author':
    case 'reporter':
      return 'reporter'
    case 'editor':
    case 'section_editor':
      return 'section_editor'
    default:
      return token
  }
}

export function workflowRoleSlugMatches(
  requested: null | string | undefined,
  candidate: null | string | undefined,
): boolean {
  if (!requested || !candidate) return false

  const requestedCandidates = new Set(getWorkflowRoleMatchCandidates(requested))
  if (getWorkflowRoleMatchCandidates(candidate).some((value) => requestedCandidates.has(value))) {
    return true
  }

  const req = toCanonicalToken(requested)
  const cand = toCanonicalToken(candidate)

  if (
    (req === 'reporter' || req === 'author') &&
    (cand === 'reporter' || cand.endsWith('_reporter'))
  ) {
    return true
  }

  if (
    (req === 'section_editor' || req === 'editor') &&
    (cand.includes('section_editor') || cand.includes('section-editor'))
  ) {
    return true
  }

  if ((req === 'section_editor' || req === 'editor') && cand === 'ed_editor') {
    return true
  }

  return false
}
