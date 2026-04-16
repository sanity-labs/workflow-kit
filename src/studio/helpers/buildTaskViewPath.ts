/**
 * Build a Studio-relative URL that opens the tasks sidebar focused on the
 * given task. Intended to be used from Studio-side consumers that have access
 * to the Studio router and the current `window.location`.
 *
 * Returns `undefined` when there is no `window` (SSR) or when the current URL
 * cannot be parsed.
 */
export function buildTaskViewPath(taskId: string): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("sidebar", "tasks");
    url.searchParams.set("viewMode", "edit");
    url.searchParams.set("selectedTask", taskId);
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}
