import type {LucideIcon} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import {createElement, type ComponentType, type SVGProps} from 'react'

const kebabToPascal = (value: string): string =>
  value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

export function resolveWorkflowLucideIcon(iconName?: string): LucideIcon | undefined {
  if (!iconName) return undefined

  const pascalName = kebabToPascal(iconName)
  return LucideIcons[pascalName as keyof typeof LucideIcons] as unknown as LucideIcon | undefined
}

export function workflowDocumentActionIconAt1em(
  Icon: ComponentType<SVGProps<SVGSVGElement>>,
): ComponentType<SVGProps<SVGSVGElement>> {
  function WorkflowDocumentActionIconAt1em(props: SVGProps<SVGSVGElement>) {
    return createElement(Icon, {
      ...props,
      style: {
        width: '1em',
        height: '1em',
        flexShrink: 0,
        ...props.style,
      },
    })
  }

  WorkflowDocumentActionIconAt1em.displayName = `WorkflowDocumentActionIcon(${Icon.displayName ?? Icon.name ?? 'Icon'})`

  return WorkflowDocumentActionIconAt1em
}
