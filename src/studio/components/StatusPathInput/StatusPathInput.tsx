import { useToast } from "@sanity/ui";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StringInputProps, StringOptions, StringSchemaType } from "sanity";
import { set, useClient, useCurrentUser, useFormValue } from "sanity";
import { useRouter } from "sanity/router";

import {
  canUseOffRampStage,
  getOffRampDisabledTitle,
} from "../../../engine/roleAccess";
import { workflowRoleSlugMatches } from "../../../engine/roleMatching";
import {
  evaluateWorkflowStageGating,
  subscribeWorkflowStageGating,
  type WorkflowStageGatingResult,
} from "../../../engine/stageGating";
import {
  findWorkflowTransitionTarget,
  performWorkflowTransitionSideEffects,
  resolveAssigneeForTaskTemplate,
  WORKFLOW_QUERY,
} from "../../../engine/transition";
import { WorkflowStatusPath } from "../../../react/components/WorkflowStatusPath";
import { WorkflowTransitionConfirmDialog } from "../../../react/components/WorkflowTransitionConfirmDialog";
import { WorkflowTransitionGatedDialog } from "../../../react/components/WorkflowTransitionGatedDialog";
import { WorkflowTransitionOffRampDialog } from "../../../react/components/WorkflowTransitionOffRampDialog";
import type {
  WorkflowTransitionTaskAssigneeOverride,
  WorkflowTransitionTaskRow,
  WorkflowTransitionTaskStatusOverride,
  WorkflowTransitionTaskTemplatePreview,
} from "../../../types/dialogs";
import type {
  WorkflowDefinition,
  WorkflowTransitionStage,
} from "../../../types/transition";
import { buildTaskViewPath } from "../../helpers/buildTaskViewPath";
import { useWorkflowProjectUsers } from "../../hooks/useWorkflowProjectUsers";

const DEFAULT_API_VERSION = "2026-04-12";

export interface StatusPathIconConfig {
  Icon: LucideIcon;
  color: string;
  tone?: "caution" | "critical" | "positive" | "primary";
}

export interface StatusPathOptions extends StringOptions {
  iconConfig?: Record<string, StatusPathIconConfig>;
  offRamps?: string[];
  pathStages?: string[];
  size?: "default" | "compact";
  workflowDocumentType?: string;
}

export interface StatusPathSchemaType extends StringSchemaType {
  options?: StatusPathOptions;
}

function buildStaticWorkflow(
  options?: StatusPathOptions,
): WorkflowDefinition | null {
  const listOptions = options?.list || [];
  const optionValues = listOptions.map((option) =>
    typeof option === "string"
      ? { title: option, value: option }
      : {
          title: option.title ?? option.value ?? "",
          value: option.value ?? "",
        },
  );
  const titleMap = new Map(
    optionValues.map((option) => [option.value, option.title]),
  );
  const iconConfig = options?.iconConfig;
  const pathStages =
    options?.pathStages || optionValues.map((option) => option.value);
  const offRamps = options?.offRamps || [];

  const stages = pathStages.filter(Boolean).map((value) => ({
    color: iconConfig?.[value]?.color,
    label: titleMap.get(value) || value,
    slug: value,
  }));
  const ramps = offRamps.filter(Boolean).map((value) => ({
    color: iconConfig?.[value]?.color,
    label: titleMap.get(value) || value,
    slug: value,
    tone: iconConfig?.[value]?.tone,
  }));

  if (stages.length === 0 && ramps.length === 0) {
    return null;
  }

  return {
    offRamps: ramps,
    stages,
  };
}

export function StatusPathInput(props: StringInputProps<StatusPathSchemaType>) {
  const { onChange, readOnly, schemaType, value } = props;
  const options = schemaType.options;
  const workflowDocumentType = options?.workflowDocumentType;
  const size = options?.size ?? "default";
  const client = useClient({ apiVersion: DEFAULT_API_VERSION });
  const currentUser = useCurrentUser();
  const router = useRouter();
  const toast = useToast();
  const documentId = useFormValue(["_id"]) as string | undefined;
  const documentType = useFormValue(["_type"]) as string | undefined;
  const assignments = useFormValue(["assignments"]) as
    | Array<{ assignmentType?: string; userId?: string }>
    | undefined;
  const draftDocumentId = documentId
    ? documentId.startsWith("drafts.")
      ? documentId
      : `drafts.${documentId}`
    : undefined;

  const { aclData, projectUsers } = useWorkflowProjectUsers(client);
  const [workflowDefinition, setWorkflowDefinition] =
    useState<null | WorkflowDefinition>(null);
  const [workflowLoaded, setWorkflowLoaded] = useState(false);
  const [modalType, setModalType] = useState<
    "confirm" | "gated" | "offramp" | null
  >(null);
  const [pendingStage, setPendingStage] =
    useState<null | WorkflowTransitionStage>(null);
  const [pendingTaskTemplates, setPendingTaskTemplates] = useState<
    WorkflowTransitionTaskTemplatePreview[] | null
  >(null);
  const [gatedTasks, setGatedTasks] = useState<WorkflowTransitionTaskRow[]>([]);
  const [gatedStageName, setGatedStageName] = useState("");
  const [gatingStage, setGatingStage] =
    useState<null | WorkflowTransitionStage>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!workflowDocumentType) {
      setWorkflowDefinition(null);
      setWorkflowLoaded(true);
      return;
    }

    let cancelled = false;
    setWorkflowLoaded(false);

    client
      .fetch<WorkflowDefinition | null>(WORKFLOW_QUERY, {
        docType: workflowDocumentType,
      })
      .then((result) => {
        if (cancelled) return;
        setWorkflowDefinition(result);
        setWorkflowLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkflowDefinition(null);
        setWorkflowLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [client, workflowDocumentType]);

  const staticWorkflow = useMemo(() => buildStaticWorkflow(options), [options]);
  const workflow = workflowDefinition ?? staticWorkflow;

  const currentStage = useMemo(
    () => (value ? findWorkflowTransitionTarget(workflow, value) : undefined),
    [value, workflow],
  );

  const currentUserCanOverride = useMemo(() => {
    if (!currentStage?.gatingOverrideRoles?.length) return false;

    return canUseOffRampStage({
      aclData,
      allowedRoles: currentStage.gatingOverrideRoles,
      currentUserEmail: (currentUser as { email?: string } | null | undefined)
        ?.email,
      currentUserSanityId: currentUser?.id,
      projectUsers,
      workflowRoles: workflow?.roles,
    });
  }, [
    aclData,
    currentStage?.gatingOverrideRoles,
    currentUser,
    projectUsers,
    workflow?.roles,
  ]);

  const closeModal = useCallback(() => {
    setModalType(null);
    setPendingStage(null);
    setPendingTaskTemplates(null);
    setGatedTasks([]);
    setGatedStageName("");
    setGatingStage(null);
  }, []);

  const buildPendingTaskTemplates = useCallback(
    (templates: NonNullable<WorkflowTransitionStage["taskTemplates"]>) => {
      return templates.map((template) => {
        const resolvedFromDocument = resolveAssigneeForTaskTemplate(
          { assignments },
          template.assigneeRole,
        );
        const workflowRole = workflow?.roles?.find((role) =>
          workflowRoleSlugMatches(template.assigneeRole, role.slug),
        );
        const projectRoleSet = new Set(workflowRole?.projectRoles || []);
        const eligibleIds =
          typeof resolvedFromDocument === "string" &&
          resolvedFromDocument.length > 0
            ? [resolvedFromDocument]
            : aclData
                .filter((entry) =>
                  entry.roles?.some((aclRole) =>
                    projectRoleSet.has(aclRole.name),
                  ),
                )
                .map((entry) => entry.projectUserId);

        return {
          assigneeRole: template.assigneeRole,
          dueInDays: template.dueInDays,
          eligibleUsers: eligibleIds
            .map((id) => projectUsers.find((user) => user.id === id))
            .filter((user): user is NonNullable<typeof user> => Boolean(user))
            .map((user) => ({
              displayName: user.displayName,
              id: user.id,
              imageUrl: user.imageUrl,
            })),
          initialAssignedTo: resolvedFromDocument,
          title: template.title,
        } satisfies WorkflowTransitionTaskTemplatePreview;
      });
    },
    [aclData, assignments, projectUsers, workflow?.roles],
  );

  const openConfirmModal = useCallback(
    (stage: WorkflowTransitionStage) => {
      setGatedTasks([]);
      setGatingStage(null);
      setPendingStage(stage);
      setPendingTaskTemplates(
        stage.taskTemplates?.length
          ? buildPendingTaskTemplates(stage.taskTemplates)
          : null,
      );
      setModalType("confirm");
    },
    [buildPendingTaskTemplates],
  );

  useEffect(() => {
    if (
      modalType !== "gated" ||
      !gatingStage ||
      !draftDocumentId ||
      !pendingStage
    ) {
      return;
    }

    return subscribeWorkflowStageGating({
      client,
      documentId: draftDocumentId,
      onError: (error: unknown) => {
        console.error(
          "[StatusPathInput] Failed to refresh gated tasks:",
          error,
        );
      },
      onResult: (result: WorkflowStageGatingResult) => {
        if (result.blocked) {
          setGatedTasks(result.tasks);
          return;
        }

        openConfirmModal(pendingStage);
      },
      stage: gatingStage,
    });
  }, [
    client,
    draftDocumentId,
    gatingStage,
    modalType,
    openConfirmModal,
    pendingStage,
  ]);

  const applyTransition = useCallback(
    async (
      nextStage: WorkflowTransitionStage,
      overrides?: Map<number, string | undefined>,
      note?: string,
      reason?: string,
    ) => {
      if (!nextStage.slug) return;

      onChange(set(nextStage.slug));

      if (!draftDocumentId || !documentType || !currentUser?.id) {
        closeModal();
        return;
      }

      setIsTransitioning(true);

      try {
        await performWorkflowTransitionSideEffects({
          client,
          currentUserId: currentUser.id,
          document: { assignments },
          documentId: draftDocumentId,
          documentType,
          logPrefix: "[StatusPathInput]",
          note,
          reason,
          targetStatusSlug: nextStage.slug,
          taskAssigneeOverrides: overrides,
          workflowDefinition: workflow,
        });

        if (nextStage.unpublishOnEntry && documentId) {
          const publishedId = documentId.replace(/^drafts\./, "");
          try {
            const published = await client.fetch<{ _id: string } | null>(
              `*[_id == $publishedId][0]{_id}`,
              { publishedId },
            );

            if (published) {
              await client.action({
                actionType: "sanity.action.document.unpublish",
                draftId: draftDocumentId,
                publishedId,
              });
            }
          } catch {
            // Ignore unpublish failures here; publish gating still prevents accidental re-publish.
          }
        }
      } finally {
        setIsTransitioning(false);
        closeModal();
      }
    },
    [
      assignments,
      client,
      closeModal,
      currentUser?.id,
      documentId,
      documentType,
      draftDocumentId,
      onChange,
      workflow,
    ],
  );

  const handleStageSelect = useCallback(
    async (stage: WorkflowTransitionStage) => {
      if (readOnly || !stage.slug || stage.slug === value || !workflow) return;

      if (currentStage?.enableCompletionGating && draftDocumentId) {
        const { blocked, tasks } = await evaluateWorkflowStageGating({
          client,
          documentId: draftDocumentId,
          stage: currentStage,
        });

        if (blocked) {
          setGatedTasks(tasks);
          setGatingStage(currentStage);
          setGatedStageName(
            currentStage.label || currentStage.slug || "Current stage",
          );
          setPendingStage(stage);
          setModalType("gated");
          return;
        }
      }

      const pathStageValues = (workflow.stages || [])
        .map((candidate) => candidate.slug)
        .filter((candidate): candidate is string => Boolean(candidate));
      const currentIndex = value ? pathStageValues.indexOf(value) : -1;
      const targetIndex = stage.slug ? pathStageValues.indexOf(stage.slug) : -1;

      if (
        workflow.forwardOnly &&
        currentIndex >= 0 &&
        targetIndex >= 0 &&
        targetIndex <= currentIndex
      ) {
        return;
      }

      const hasCriteria = Boolean(stage.stageCriteria?.length);
      const hasTemplates = Boolean(stage.taskTemplates?.length);
      if (hasCriteria || hasTemplates) {
        setPendingStage(stage);
        setPendingTaskTemplates(
          stage.taskTemplates?.length
            ? buildPendingTaskTemplates(stage.taskTemplates)
            : null,
        );
        setModalType("confirm");
        return;
      }

      await applyTransition(stage);
    },
    [
      applyTransition,
      buildPendingTaskTemplates,
      client,
      currentStage,
      draftDocumentId,
      readOnly,
      value,
      workflow,
    ],
  );

  const handleOffRampSelect = useCallback(
    (stage: WorkflowTransitionStage) => {
      if (readOnly || !stage.slug) return;

      const canUseOffRamp = canUseOffRampStage({
        aclData,
        allowedRoles: stage.allowedRoles,
        currentUserEmail: (currentUser as { email?: string } | null | undefined)
          ?.email,
        currentUserSanityId: currentUser?.id,
        projectUsers,
        workflowRoles: workflow?.roles,
      });

      if (!canUseOffRamp) {
        toast.push({
          description: getOffRampDisabledTitle({
            allowedRoles: stage.allowedRoles,
            workflowRoles: workflow?.roles,
          }),
          status: "warning",
          title: "Workflow access required",
        });
        return;
      }

      setPendingStage(stage);
      setModalType("offramp");
    },
    [aclData, currentUser, projectUsers, readOnly, toast, workflow?.roles],
  );

  const handleConfirmDialogConfirm = useCallback(
    async (
      overrides?: WorkflowTransitionTaskAssigneeOverride[],
      note?: string,
    ) => {
      if (!pendingStage) return;

      await applyTransition(
        pendingStage,
        overrides?.length
          ? new Map(
              overrides.map(
                (override) =>
                  [override.templateIndex, override.assignedTo] as const,
              ),
            )
          : undefined,
        note,
      );
    },
    [applyTransition, pendingStage],
  );

  const handleGatedDialogConfirm = useCallback(
    async (overrides: WorkflowTransitionTaskStatusOverride[]) => {
      setGatingStage(null);
      const mainDataset = client.config().dataset;
      if (mainDataset) {
        const addonClient = client.withConfig({
          dataset: `${mainDataset}-comments`,
        });
        await Promise.all(
          overrides.map((override) =>
            addonClient
              .patch(override.taskId)
              .set({ status: override.status })
              .commit()
              .catch(() => {}),
          ),
        );
      }

      if (pendingStage) {
        await applyTransition(pendingStage);
      }
    },
    [applyTransition, client, pendingStage],
  );

  const handleOffRampConfirm = useCallback(
    async (reason: string) => {
      if (!pendingStage) return;
      await applyTransition(pendingStage, undefined, undefined, reason);
    },
    [applyTransition, pendingStage],
  );

  if (!workflow && workflowLoaded) {
    return null;
  }

  return (
    <>
      <WorkflowStatusPath
        currentStatus={value}
        disabled={Boolean(readOnly || !currentUser)}
        loading={Boolean(workflowDocumentType && !workflowLoaded)}
        onSelectOffRamp={handleOffRampSelect}
        onSelectStage={handleStageSelect}
        size={size}
        workflow={workflow || { offRamps: [], stages: [] }}
      />

      <WorkflowTransitionGatedDialog
        currentUserCanOverride={currentUserCanOverride}
        dialogId="status-path-gated-dialog"
        isSubmitting={isTransitioning}
        onCancel={closeModal}
        onConfirm={handleGatedDialogConfirm}
        onViewTask={(taskId) => {
          const path = buildTaskViewPath(taskId);
          if (path) router.navigateUrl({ path });
        }}
        open={modalType === "gated" && Boolean(pendingStage)}
        sourceStageName={gatedStageName}
        targetStageTitle={
          pendingStage?.label || pendingStage?.slug || "Next stage"
        }
        tasks={gatedTasks}
        users={projectUsers}
      />

      <WorkflowTransitionConfirmDialog
        criteria={pendingStage?.stageCriteria}
        dialogId="status-path-confirm-dialog"
        isSubmitting={isTransitioning}
        onCancel={closeModal}
        onConfirm={handleConfirmDialogConfirm}
        open={modalType === "confirm" && Boolean(pendingStage)}
        stageTitle={pendingStage?.label || pendingStage?.slug || "Next stage"}
        taskTemplates={pendingTaskTemplates}
      />

      <WorkflowTransitionOffRampDialog
        criteria={pendingStage?.stageCriteria}
        dialogId="status-path-offramp-dialog"
        isSubmitting={isTransitioning}
        onCancel={closeModal}
        onConfirm={handleOffRampConfirm}
        open={modalType === "offramp" && Boolean(pendingStage)}
        stageTitle={pendingStage?.label || pendingStage?.slug || "Off-ramp"}
        unpublishOnEntry={Boolean(pendingStage?.unpublishOnEntry)}
      />
    </>
  );
}
