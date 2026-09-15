export type DiagnosticPlaybookDescriptor = { id: string; title: string; summary: string; symptoms: readonly string[]; evidenceGoals: readonly string[]; investigationSteps: readonly string[]; linkedKnowledgeArticleIds: readonly string[]; executablePath: string; taxonomy?: { productSurfaces: readonly string[]; problemClasses: readonly string[] } };

export const PLAYBOOK_DESCRIPTORS: readonly DiagnosticPlaybookDescriptor[] = [
  {
    id: "event-processing-delay", title: "Event processing delay",
    summary: "Investigate delayed event processing after a platform-fix wait using accepted-event evidence, missing profile timelines, and multiple affected stores.",
    symptoms: ["event delayed", "accepted events missing from profile timelines across multiple stores"],
    evidenceGoals: ["event identity and timing", "accepted response versus timeline appearance", "broad-impact evidence versus an isolated report"],
    investigationSteps: ["Compare event timing and delivery state across the affected examples before claiming platform impact.", "Distinguish absent events from events present but excluded by flow eligibility; request missing or contradictory evidence.", "Verify affected timelines after a governed correction; this descriptor does not define a mitigation."],
    linkedKnowledgeArticleIds: ["event-tracking-debugging", "flow-trigger-troubleshooting"],
    executablePath: "src/approval-desk/diagnostic-playbooks.ts#diagnoseEventProcessingDelay",
  },
  {
    id: "flow-trigger", title: "Flow trigger troubleshooting",
    summary: "Investigate missing flow triggers by distinguishing event presence from flow and message eligibility.",
    symptoms: ["flow did not trigger", "storefront event present but profile excluded"],
    evidenceGoals: ["event and profile identity and timestamp", "flow status, trigger and profile filters", "consent, smart sending, and prior entry qualification"],
    investigationSteps: ["Compare trigger conditions and event history; an accepted event does not establish eligibility.", "Compare observed exclusions with flow history before recommending a correction; keep missing or conflicting evidence explicit.", "Use accepted events, missing timelines, and affected-store scope to distinguish event-processing investigation from flow qualification."],
    linkedKnowledgeArticleIds: ["flow-trigger-troubleshooting", "event-tracking-debugging"],
    executablePath: "src/approval-desk/diagnostic-playbooks.ts#diagnoseFlowTriggerIssue",
  },
  {
    id: "campaign-editor", title: "Campaign editor loading",
    summary: "Investigate campaign editor loading failures through browser-session isolation and frontend-loading alternatives.",
    symptoms: ["editor does not load", "blank campaign editor", "ChunkLoadError"],
    evidenceGoals: ["same campaign in a private window and another browser", "another-admin outcome and console loading evidence", "missing or contradictory isolation checks"],
    investigationSteps: ["A working isolated session supports the browser-session path; continuing there requires observed success for the affected campaign.", "Failure across private-window, different-browser, and another-admin checks with console evidence supports frontend investigation; ChunkLoadError alone is not proof.", "Compare conflicting checks before choosing a cause and verify the affected campaign after a governed correction; do not promise an unspecified mitigation."],
    linkedKnowledgeArticleIds: ["performance-troubleshooting"],
    executablePath: "src/approval-desk/diagnostic-playbooks.ts#diagnoseCampaignEditorLoading",
  },
  {
    id: "article-backed", title: "Article-backed diagnosis",
    summary: "Investigate article-specific symptoms without asserting applicability, including security, deliverability, segmentation, campaign sending, coupon/catalog data, profile sync, ecommerce sync, SMS eligibility, and webhook delivery/signature validation.",
    symptoms: ["article-associated symptom", "webhook signature failure", "delayed webhook delivery"],
    evidenceGoals: ["case-specific evidence", "webhook delivery identity, endpoint response, rotation timing, and raw-body handling", "event creation, delivery attempts, and retry history"],
    investigationSteps: ["Collect the specified evidence before confirming; other article-backed branches retain their own evidence needs.", "For webhooks, compare exact raw body and signed headers; confirm current-secret use after rotation without collecting the secret.", "Compare dispatch timing with endpoint retries before assigning delay; missing or conflicting evidence leaves the cause provisional.", "Raw-body comparison describes investigation guidance, not an additional executable diagnosis branch or an approved code change."],
    linkedKnowledgeArticleIds: ["webhook-signature-validation"],
    executablePath: "src/approval-desk/diagnostic-playbooks.ts#diagnoseArticleBackedIssue",
  },
];
