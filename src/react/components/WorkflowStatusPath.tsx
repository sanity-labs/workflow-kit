import {Box, Button, Flex, Skeleton, Stack, Text, Tooltip} from '@sanity/ui'
import {Check} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import styled, {css, keyframes} from 'styled-components'

import {resolveWorkflowLucideIcon} from '../../engine/lucideIcon'
import type {WorkflowDefinition, WorkflowTransitionStage} from '../../types/transition'

const ARROW_WIDTH = 14
const SEGMENT_HEIGHT = 44
const COMPACT_BREAKPOINT = '500px'

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 var(--glow-color); }
  50% { box-shadow: 0 0 8px 2px var(--glow-color); }
`

const FUTURE_SEGMENT_SURFACE = 'var(--card-bg2-color, var(--card-muted-bg-color, #f0f0f0))'
const FUTURE_SEGMENT_BORDER = 'var(--card-border-color, rgba(128, 130, 133, 0.45))'
const FUTURE_SEGMENT_BORDER_STROKE_WIDTH = 1
const CHEVRON_CORNER_RADIUS = 4

const PathContainer = styled.div`
  container-type: inline-size;
`

const ChevronRow = styled.div`
  position: relative;
`

const ChevronBorderSvg = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
`

function getActiveSegmentBorderColor(color: string): string {
  return `color-mix(in srgb, ${color} 82%, black)`
}

interface ChevronGeomOpts {
  height: number
  inset?: number
  isFirst: boolean
  isLast: boolean
  width: number
  x?: number
  y?: number
}

function getChevronBounds({x = 0, y = 0, width, height, inset = 0}: ChevronGeomOpts) {
  const leftEdge = x + inset
  const topEdge = y + inset
  const centerY = y + height / 2
  const rightEdge = Math.max(x + width - inset, leftEdge)
  const bottomEdge = Math.max(y + height - inset, topEdge)
  const safeArrowWidth = Math.min(ARROW_WIDTH, Math.max((width - inset * 2) / 2, 0))
  const leftNotchX = leftEdge + safeArrowWidth
  const rightInsetX = Math.max(rightEdge - safeArrowWidth, leftEdge)

  return {bottomEdge, centerY, leftEdge, leftNotchX, rightEdge, rightInsetX, topEdge}
}

function getChevronBorderPathD(opts: ChevronGeomOpts): string {
  const {bottomEdge, centerY, leftEdge, leftNotchX, rightEdge, rightInsetX, topEdge} =
    getChevronBounds(opts)
  const radius = Math.max(
    0,
    Math.min(
      CHEVRON_CORNER_RADIUS,
      (bottomEdge - topEdge) / 2 - 0.5,
      (rightEdge - leftEdge) / 2 - 0.5,
    ),
  )

  if (opts.isFirst && opts.isLast) {
    if (radius <= 0.5) {
      return `M ${leftEdge} ${topEdge} L ${rightEdge} ${topEdge} L ${rightEdge} ${bottomEdge} L ${leftEdge} ${bottomEdge} Z`
    }

    return [
      `M ${leftEdge + radius} ${topEdge}`,
      `L ${rightEdge - radius} ${topEdge}`,
      `Q ${rightEdge} ${topEdge} ${rightEdge} ${topEdge + radius}`,
      `L ${rightEdge} ${bottomEdge - radius}`,
      `Q ${rightEdge} ${bottomEdge} ${rightEdge - radius} ${bottomEdge}`,
      `L ${leftEdge + radius} ${bottomEdge}`,
      `Q ${leftEdge} ${bottomEdge} ${leftEdge} ${bottomEdge - radius}`,
      `L ${leftEdge} ${topEdge + radius}`,
      `Q ${leftEdge} ${topEdge} ${leftEdge + radius} ${topEdge}`,
      'Z',
    ].join(' ')
  }

  if (opts.isFirst) {
    if (radius <= 0.5) {
      return `M ${leftEdge} ${topEdge} L ${rightInsetX} ${topEdge} L ${rightEdge} ${centerY} L ${rightInsetX} ${bottomEdge} L ${leftEdge} ${bottomEdge} Z`
    }

    return [
      `M ${leftEdge + radius} ${topEdge}`,
      `L ${rightInsetX} ${topEdge}`,
      `L ${rightEdge} ${centerY}`,
      `L ${rightInsetX} ${bottomEdge}`,
      `L ${leftEdge + radius} ${bottomEdge}`,
      `Q ${leftEdge} ${bottomEdge} ${leftEdge} ${bottomEdge - radius}`,
      `L ${leftEdge} ${topEdge + radius}`,
      `Q ${leftEdge} ${topEdge} ${leftEdge + radius} ${topEdge}`,
      'Z',
    ].join(' ')
  }

  if (opts.isLast) {
    if (radius <= 0.5) {
      return `M ${leftEdge} ${topEdge} L ${leftNotchX} ${centerY} L ${leftEdge} ${bottomEdge} L ${rightEdge} ${bottomEdge} L ${rightEdge} ${topEdge} Z`
    }

    return [
      `M ${leftEdge} ${topEdge}`,
      `L ${leftNotchX} ${centerY}`,
      `L ${leftEdge} ${bottomEdge}`,
      `L ${rightEdge - radius} ${bottomEdge}`,
      `Q ${rightEdge} ${bottomEdge} ${rightEdge} ${bottomEdge - radius}`,
      `L ${rightEdge} ${topEdge + radius}`,
      `Q ${rightEdge} ${topEdge} ${rightEdge - radius} ${topEdge}`,
      `L ${leftEdge} ${topEdge}`,
      'Z',
    ].join(' ')
  }

  return [
    `M ${leftEdge} ${topEdge}`,
    `L ${leftNotchX} ${centerY}`,
    `L ${leftEdge} ${bottomEdge}`,
    `L ${rightInsetX} ${bottomEdge}`,
    `L ${rightEdge} ${centerY}`,
    `L ${rightInsetX} ${topEdge}`,
    'Z',
  ].join(' ')
}

const ChevronSegment = styled.button<{
  $bgColor: string
  $compact: boolean
  $disabled: boolean
  $isFirst: boolean
  $isLast: boolean
  $state: 'completed' | 'current' | 'future'
}>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 0 ${({$isFirst}) => ($isFirst ? '12px' : `${ARROW_WIDTH + 8}px`)};
  height: ${SEGMENT_HEIGHT}px;
  min-width: 0;
  flex: 1;
  box-sizing: border-box;
  border: none;
  cursor: ${({$disabled}) => ($disabled ? 'not-allowed' : 'pointer')};
  transition: opacity 0.15s ease;
  font-family: inherit;
  border-radius: 4px;
  margin-left: ${({$isFirst}) => ($isFirst ? '0' : `-${ARROW_WIDTH - 4}px`)};
  clip-path: ${({$isFirst, $isLast}) => {
    const left = $isFirst ? '0% 0%, 0% 100%' : `0% 0%, ${ARROW_WIDTH}px 50%, 0% 100%`
    const right = $isLast
      ? '100% 100%, 100% 0%'
      : `calc(100% - ${ARROW_WIDTH}px) 100%, 100% 50%, calc(100% - ${ARROW_WIDTH}px) 0%`
    return `polygon(${left}, ${right})`
  }};

  ${({$state, $bgColor}) => {
    if ($state === 'completed' || $state === 'current') {
      return css`
        --segment-bg: ${$bgColor};
        background-color: ${$bgColor};
        color: white;
      `
    }

    return css`
      --segment-bg: ${FUTURE_SEGMENT_SURFACE};
      background-color: ${FUTURE_SEGMENT_SURFACE};
      color: var(--card-muted-fg-color, #666);
    `
  }}

  ${({$state, $bgColor}) =>
    $state === 'current' &&
    css`
      --glow-color: ${$bgColor}40;
      animation: ${pulseGlow} 2s ease-in-out infinite;
      font-weight: 700;
    `}

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.6;
  }

  ${({$compact}) =>
    $compact &&
    css`
      padding-left: 0;
      padding-right: 0;
      justify-content: center;
      gap: 0;
      height: 36px;
    `}

  @container (max-width: ${COMPACT_BREAKPOINT}) {
    padding-left: ${({$isFirst}) => ($isFirst ? '0' : `${ARROW_WIDTH - 4}px`)};
    padding-right: ${({$isLast}) => ($isLast ? '0' : `${ARROW_WIDTH - 4}px`)};
    padding-top: 0;
    padding-bottom: 0;
    justify-content: center;
    gap: 0;
    height: 36px;
  }
`

const TruncatedLabel = styled.span<{$compact: boolean}>`
  position: relative;
  display: ${({$compact}) => ($compact ? 'none' : 'flex')};
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  line-height: 1;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 24px;
    background: linear-gradient(
      to right,
      transparent,
      var(--segment-bg, ${FUTURE_SEGMENT_SURFACE})
    );
    pointer-events: none;
  }

  @container (max-width: ${COMPACT_BREAKPOINT}) {
    display: none;
  }
`

const IconCircle = styled.span<{$color: string; $state: 'completed' | 'current' | 'future'}>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 50%;
  flex-shrink: 0;

  ${({$state, $color}) => {
    if ($state === 'completed' || $state === 'current') {
      return css`
        background: rgba(255, 255, 255, 0.25);
      `
    }

    return css`
      background: ${$color};
    `
  }}
`

function getStageColor(stage: WorkflowTransitionStage): string {
  return stage.color || '#8B8B8B'
}

function isCurrentStatusOnHappyPath(
  workflow: WorkflowDefinition,
  currentStatus: string | undefined,
): boolean {
  return (workflow.stages || []).some((stage) => stage.slug === currentStatus)
}

export interface WorkflowStatusPathProps {
  currentStatus?: string
  workflow: WorkflowDefinition
  disabled?: boolean
  loading?: boolean
  onSelectOffRamp?: (stage: WorkflowTransitionStage) => void
  onSelectStage?: (stage: WorkflowTransitionStage) => void
  size?: 'default' | 'compact'
}

export function WorkflowStatusPath({
  currentStatus,
  workflow,
  disabled = false,
  loading = false,
  onSelectOffRamp,
  onSelectStage,
  size = 'default',
}: WorkflowStatusPathProps) {
  const stageDisplays = workflow.stages || []
  const offRampDisplays = workflow.offRamps || []
  const compact = size === 'compact'

  const pathStageValues = useMemo(
    () =>
      stageDisplays.map((stage) => stage.slug).filter((value): value is string => Boolean(value)),
    [stageDisplays],
  )
  const currentPathIndex = pathStageValues.indexOf(currentStatus || '')
  const isOnHappyPath = currentPathIndex >= 0 && isCurrentStatusOnHappyPath(workflow, currentStatus)

  const segmentStates = useMemo(
    () =>
      stageDisplays.map((_, index) => {
        if (!isOnHappyPath) return 'future' as const
        if (index < currentPathIndex) return 'completed' as const
        if (index === currentPathIndex) return 'current' as const
        return 'future' as const
      }),
    [currentPathIndex, isOnHappyPath, stageDisplays],
  )
  const stageRowRef = useRef<HTMLDivElement | null>(null)
  const stageSegmentRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [stageRowOverlaySize, setStageRowOverlaySize] = useState({height: 0, width: 0})
  const [stageBorderPaths, setStageBorderPaths] = useState<
    Array<{d: string; key: string; stroke: string}>
  >([])

  const syncStageBorderPaths = useCallback(() => {
    const rowElement = stageRowRef.current
    if (!rowElement) {
      setStageRowOverlaySize({height: 0, width: 0})
      setStageBorderPaths([])
      return
    }

    const rowRect = rowElement.getBoundingClientRect()
    setStageRowOverlaySize({height: rowRect.height, width: rowRect.width})

    setStageBorderPaths(
      stageDisplays.flatMap((stage, index) => {
        const segmentState = segmentStates[index]
        if (segmentState !== 'future' && segmentState !== 'current') return []

        const segmentElement = stageSegmentRefs.current[index]
        if (!segmentElement) return []

        const segmentRect = segmentElement.getBoundingClientRect()
        const color = getStageColor(stage)

        return [
          {
            key: stage.slug || `stage-${index}`,
            d: getChevronBorderPathD({
              height: segmentRect.height,
              isFirst: index === 0,
              isLast: index === stageDisplays.length - 1,
              width: segmentRect.width,
              x: segmentRect.left - rowRect.left,
              y: segmentRect.top - rowRect.top,
            }),
            stroke:
              segmentState === 'current'
                ? getActiveSegmentBorderColor(color)
                : FUTURE_SEGMENT_BORDER,
          },
        ]
      }),
    )
  }, [segmentStates, stageDisplays])

  useEffect(() => {
    stageSegmentRefs.current = stageSegmentRefs.current.slice(0, stageDisplays.length)
    syncStageBorderPaths()

    const rowElement = stageRowRef.current
    if (!rowElement || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      syncStageBorderPaths()
    })

    observer.observe(rowElement)
    stageSegmentRefs.current.forEach((segmentElement) => {
      if (segmentElement) {
        observer.observe(segmentElement)
      }
    })

    return () => observer.disconnect()
  }, [stageDisplays.length, syncStageBorderPaths])

  if (loading) {
    const segmentCount = Math.max(stageDisplays.length || 0, 5)

    return (
      <PathContainer>
        <Stack space={3}>
          <Flex style={{minHeight: compact ? 36 : SEGMENT_HEIGHT}}>
            {Array.from({length: segmentCount}, (_, index) => (
              <Skeleton
                key={index}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: compact ? 36 : SEGMENT_HEIGHT,
                  marginLeft: index === 0 ? 0 : -ARROW_WIDTH + 4,
                  borderRadius: 4,
                }}
                radius={1}
                animated
              />
            ))}
          </Flex>
          {offRampDisplays.length > 0 ? (
            <>
              <Box style={{borderTop: '1px solid var(--card-border-color, #333)'}} />
              <Flex gap={2}>
                {offRampDisplays.map((_, index) => (
                  <Skeleton key={index} style={{height: 32, width: 88}} radius={2} animated />
                ))}
              </Flex>
            </>
          ) : null}
        </Stack>
      </PathContainer>
    )
  }

  return (
    <PathContainer>
      <Stack space={3}>
        <ChevronRow ref={stageRowRef}>
          <Flex>
            {stageDisplays.map((stage, index) => {
              const state = segmentStates[index] ?? 'future'
              const color = getStageColor(stage)
              const title = stage.label || stage.slug || 'Untitled stage'
              const StatusIcon = resolveWorkflowLucideIcon(stage.icon)
              const isForwardOnlyDisabled =
                disabled ||
                (workflow.forwardOnly === true && state === 'completed' && isOnHappyPath)

              const displayIcon =
                state === 'completed' ? (
                  <Check size={13} color="white" strokeWidth={3} />
                ) : StatusIcon ? (
                  <StatusIcon size={13} color="white" />
                ) : null

              return (
                <Tooltip
                  key={stage.slug || `${title}-${index}`}
                  content={
                    <Box padding={2}>
                      <Text size={1}>
                        {isForwardOnlyDisabled && workflow.forwardOnly && state === 'completed'
                          ? 'This workflow only allows forward progression'
                          : title}
                      </Text>
                    </Box>
                  }
                  portal
                  placement="top"
                >
                  <ChevronSegment
                    $bgColor={color}
                    $compact={compact}
                    $disabled={isForwardOnlyDisabled}
                    $isFirst={index === 0}
                    $isLast={index === stageDisplays.length - 1}
                    $state={state}
                    disabled={isForwardOnlyDisabled}
                    onClick={() => {
                      if (!stage.slug || !onSelectStage || isForwardOnlyDisabled) return
                      onSelectStage(stage)
                    }}
                    ref={(element) => {
                      stageSegmentRefs.current[index] = element
                    }}
                    type="button"
                  >
                    <IconCircle $color={color} $state={state}>
                      {displayIcon}
                    </IconCircle>
                    <TruncatedLabel $compact={compact}>
                      <Text
                        size={1}
                        weight={state === 'current' ? 'bold' : 'regular'}
                        style={{
                          color:
                            state === 'future'
                              ? 'var(--card-muted-fg-color, var(--card-fg-color, #666))'
                              : 'white',
                          lineHeight: 4,
                        }}
                      >
                        {title}
                      </Text>
                    </TruncatedLabel>
                  </ChevronSegment>
                </Tooltip>
              )
            })}
          </Flex>
          {stageBorderPaths.length > 0 &&
          stageRowOverlaySize.width > 0 &&
          stageRowOverlaySize.height > 0 ? (
            <ChevronBorderSvg
              aria-hidden="true"
              focusable="false"
              preserveAspectRatio="none"
              viewBox={`0 0 ${stageRowOverlaySize.width} ${stageRowOverlaySize.height}`}
            >
              {stageBorderPaths.map((segment) => (
                <path
                  key={segment.key}
                  d={segment.d}
                  fill="none"
                  shapeRendering="geometricPrecision"
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                  strokeMiterlimit="2"
                  style={{stroke: segment.stroke}}
                  strokeWidth={FUTURE_SEGMENT_BORDER_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </ChevronBorderSvg>
          ) : null}
        </ChevronRow>

        {offRampDisplays.length > 0 ? (
          <>
            <Box style={{borderTop: '1px solid var(--card-border-color, #333)'}} />
            <Flex gap={2}>
              {offRampDisplays.map((offRamp, index) => {
                const isActive = currentStatus === offRamp.slug
                const RampIcon = resolveWorkflowLucideIcon(offRamp.icon)
                const tone =
                  (offRamp.tone as 'caution' | 'critical' | 'positive' | 'primary' | undefined) ||
                  'caution'

                return (
                  <Button
                    key={offRamp.slug || `${offRamp.label || 'off-ramp'}-${index}`}
                    disabled={disabled || !offRamp.slug}
                    onClick={() => {
                      if (!offRamp.slug || !onSelectOffRamp || disabled) return
                      onSelectOffRamp(offRamp)
                    }}
                    tone={tone}
                    mode={isActive ? 'default' : 'ghost'}
                    fontSize={1}
                    padding={2}
                    icon={RampIcon ? <RampIcon size={14} /> : undefined}
                    text={offRamp.label || offRamp.slug || 'Off-ramp'}
                  />
                )
              })}
            </Flex>
          </>
        ) : null}
      </Stack>
    </PathContainer>
  )
}
