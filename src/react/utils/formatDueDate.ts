export function formatDueDate(dueDate: string): string {
  const due = new Date(dueDate)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return `overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`
  }

  if (diffDays === 0) return 'due today'
  if (diffDays === 1) return 'due tomorrow'

  return `due in ${diffDays} day${diffDays === 1 ? '' : 's'}`
}
