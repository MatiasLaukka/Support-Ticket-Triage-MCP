export const approvalDeskHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Approval Desk</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f8fb;
        --panel: #ffffff;
        --panel-soft: #f0f5ff;
        --ink: #172033;
        --muted: #61708a;
        --line: #d9e1ef;
        --accent: #2557d6;
        --accent-dark: #173f9c;
        --danger: #b42318;
        --danger-soft: #fff1f0;
        --ok: #087443;
        --shadow: 0 16px 40px rgba(23, 32, 51, 0.08);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        border: 0;
        border-radius: 10px;
        background: var(--accent);
        color: white;
        cursor: pointer;
        font-weight: 700;
        padding: 0.72rem 0.95rem;
      }

      button:hover:not(:disabled) {
        background: var(--accent-dark);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      input,
      select,
      textarea {
        border: 1px solid var(--line);
        border-radius: 10px;
        color: var(--ink);
        padding: 0.65rem 0.75rem;
        width: 100%;
      }

      textarea {
        min-height: 8rem;
        resize: vertical;
      }

      .shell {
        margin: 0 auto;
        max-width: 1500px;
        padding: 1.5rem 1.5rem 8rem;
      }

      header {
        background: linear-gradient(135deg, #172033, #25448f);
        border-radius: 24px;
        box-shadow: var(--shadow);
        color: white;
        margin-bottom: 1.25rem;
        padding: 1.5rem;
      }

      header h1 {
        font-size: clamp(2rem, 4vw, 3.4rem);
        margin: 0 0 0.45rem;
      }

      header p {
        line-height: 1.55;
        margin: 0.2rem 0 0;
        max-width: 900px;
      }

      .layout {
        display: grid;
        gap: 1rem;
        grid-template-columns: minmax(240px, 0.75fr) minmax(360px, 1.25fr) minmax(360px, 1fr);
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: var(--shadow);
        min-width: 0;
        padding: 1rem;
      }

      .panel h2,
      .panel h3 {
        margin: 0 0 0.7rem;
      }

      .hint {
        color: var(--muted);
        line-height: 1.45;
        margin: 0 0 0.8rem;
      }

      .queue-header,
      .actions,
      .split {
        align-items: center;
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
      }

      .queue-list {
        display: grid;
        gap: 0.65rem;
        margin-top: 0.8rem;
      }

      .queue-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-top: 0.75rem;
      }

      .queue-filter {
        border: 1px solid var(--line);
        padding: 0.32rem 0.65rem;
      }

      .queue-filter.active {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
      }

      .ticket-button {
        background: white;
        border: 1px solid var(--line);
        color: var(--ink);
        display: block;
        padding: 0.8rem;
        text-align: left;
        width: 100%;
      }

      .ticket-button.state-active {
        border-color: #b8c7e6;
      }

      .ticket-button.state-draft-ready {
        background: #fff9e8;
        border-color: #f4c542;
      }

      .ticket-button.state-waiting {
        background: #ecfdf3;
        border-color: #23a06b;
      }

      .ticket-button.state-customer-replied {
        background: #f0f5ff;
        border-color: #6c8ee8;
      }

      .ticket-button.state-resolved {
        background: #f3f4f6;
        border-color: #cfd6e4;
      }

      .ticket-button.risk-security {
        background: #fff7f6;
        border-color: #f2a39b;
        box-shadow: inset 4px 0 0 var(--danger);
      }

      .ticket-button:hover,
      .ticket-button.active {
        background: var(--panel-soft);
        border-color: var(--accent);
      }

      .ticket-button.risk-security:hover,
      .ticket-button.risk-security.active {
        background: #fff0ee;
        border-color: var(--danger);
      }

      .ticket-id {
        color: var(--accent);
        display: block;
        font-weight: 800;
      }

      .ticket-subject-line {
        display: block;
        font-weight: 800;
        line-height: 1.18;
        margin-top: 0.18rem;
      }

      .ticket-meta-line {
        color: var(--muted);
        display: block;
        font-size: 0.86rem;
        line-height: 1.3;
        margin-top: 0.18rem;
      }

      .meta {
        color: var(--muted);
        font-size: 0.88rem;
      }

      .queue-badges,
      .setup-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-top: 0.65rem;
      }

      .queue-status-line {
        align-items: center;
        display: flex;
        gap: 0.35rem;
        margin-top: 0.65rem;
      }

      .queue-status-indicator {
        align-items: center;
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent-dark);
        display: inline-flex;
        font-size: 0.82rem;
        font-weight: 700;
        gap: 0.32rem;
        padding: 0.24rem 0.5rem;
      }

      .queue-status-indicator.ready-for-close {
        background: #ecfdf3;
        border-color: #23a06b;
        color: #087443;
      }

      .queue-status-info {
        align-items: center;
        background: white;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--muted);
        cursor: help;
        display: inline-flex;
        font-size: 0.74rem;
        font-weight: 800;
        height: 1.3rem;
        justify-content: center;
        width: 1.3rem;
      }

      .diagnosis-panel {
        margin-top: 0.75rem;
      }

      .diagnosis-panel textarea {
        min-height: 4.5rem;
      }

      .diagnosis-review-grid,
      .diagnosis-impact-list,
      .diagnosis-results {
        display: grid;
        gap: 0.65rem;
      }

      .diagnosis-impact-candidate {
        background: #fbfcff;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 0.7rem;
      }

      .diagnosis-impact-candidate label {
        align-items: center;
        display: flex;
        font-weight: 700;
        gap: 0.5rem;
      }

      .diagnosis-impact-candidate input[type="checkbox"] {
        height: 1rem;
        width: 1rem;
      }

      .workflow-action-stack {
        bottom: 1rem;
        display: grid;
        gap: 0.5rem;
        max-width: calc(100vw - 2rem);
        position: fixed;
        right: 1rem;
        width: min(520px, calc(100vw - 2rem));
        z-index: 20;
      }

      .recommendation-setup-bar {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 18px 44px rgba(23, 32, 51, 0.18);
        padding: 0.7rem;
      }

      .recommendation-setup-bar h3 {
        font-size: 0.95rem;
        margin: 0;
      }

      .bar-mode[hidden],
      .approval-stage-placeholder[hidden] {
        display: none;
      }

      .bar-topline {
        align-items: baseline;
        display: flex;
        gap: 0.65rem;
        justify-content: space-between;
      }

      .bar-topline .meta {
        text-align: right;
      }

      .bar-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        justify-content: flex-end;
        margin-top: 0.5rem;
      }

      .bar-actions button {
        min-height: 2.35rem;
        padding: 0.55rem 0.7rem;
      }

      .recommendation-setup-bar .secondary {
        background: var(--accent);
        color: white;
      }

      .recommendation-setup-bar .secondary:hover:not(:disabled) {
        background: var(--accent-dark);
      }

      .recommendation-setup-bar .accent-action {
        background: #7c3aed;
        box-shadow: 0 8px 18px rgba(124, 58, 237, 0.24);
      }

      .recommendation-setup-bar .accent-action:hover:not(:disabled) {
        background: #6d28d9;
      }

      .bar-chip-summary {
        margin-top: 0.4rem;
      }

      .bar-chip-summary .chip {
        font-size: 0.78rem;
        padding: 0.2rem 0.45rem;
      }

      .setup-grid {
        align-items: end;
        display: grid;
        gap: 0.65rem;
        grid-template-columns: minmax(150px, 1fr) minmax(170px, 1fr) auto;
        margin-top: 0.55rem;
      }

      .setup-grid label {
        min-width: 0;
      }

      .setup-grid input,
      .setup-grid select {
        min-height: 2.65rem;
      }

      .setup-grid button {
        min-height: 2.65rem;
        white-space: nowrap;
      }

      .decision-summary {
        margin: 0.3rem 0 0;
      }

      .compact-edit-grid {
        display: grid;
        gap: 0.5rem;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-top: 0.55rem;
      }

      .compact-edit-grid label.wide,
      .bar-mode details {
        grid-column: 1 / -1;
      }

      .bar-mode details {
        margin-top: 0.5rem;
      }

      .bar-mode textarea {
        min-height: 5.5rem;
      }

      .quick-reasons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-top: 0.5rem;
      }

      .quick-reason {
        padding: 0.45rem 0.65rem;
      }

      .reply-mode {
        margin-top: 0.55rem;
      }

      .customer-reply-focus {
        background: #f0f6ff;
        border: 1px solid #bfdbfe;
        border-radius: 14px;
        box-shadow: 0 12px 34px rgba(23, 32, 51, 0.14);
        color: var(--ink);
        font-size: 0.9rem;
        line-height: 1.45;
        max-height: min(42vh, 360px);
        overflow: auto;
        padding: 0.65rem 0.75rem;
      }

      .customer-reply-focus strong {
        color: var(--accent-dark);
        display: block;
        margin-bottom: 0.25rem;
      }

      .customer-reply-focus span {
        display: block;
        white-space: pre-wrap;
      }

      .reply-composer {
        margin-top: 0.45rem;
        padding: 0.55rem;
      }

      .reply-composer textarea {
        min-height: 4.75rem;
      }

      .bar-reply-preview {
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 12px;
        color: var(--muted);
        font-size: 0.86rem;
        line-height: 1.4;
        margin-top: 0.45rem;
        padding: 0.55rem 0.65rem;
      }

      .bar-reply-preview strong {
        color: var(--ink);
        display: block;
        margin-bottom: 0.2rem;
      }

      .details-grid {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .evidence-dashboard {
        margin-bottom: 1rem;
      }

      .evidence-grid {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .evidence-lists {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 1rem;
      }

      .card {
        background: #fbfcff;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.85rem;
      }

      .card strong {
        display: block;
        margin-bottom: 0.35rem;
      }

      .card p {
        margin: 0.35rem 0 0;
      }

      .conversation-context details {
        margin-top: 0.55rem;
      }

      .advanced-drawer {
        background: transparent;
        margin-top: 0.75rem;
        padding: 0.65rem;
      }

      .advanced-drawer summary {
        align-items: center;
        display: flex;
        gap: 0.55rem;
      }

      .advanced-icon {
        align-items: center;
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent-dark);
        display: inline-flex;
        font-size: 0.82rem;
        height: 1.65rem;
        justify-content: center;
        width: 1.65rem;
      }

      .advanced-section {
        margin-top: 0.75rem;
      }

      .advanced-section h4 {
        margin: 0 0 0.55rem;
      }

      .conversation-timeline .conversation-header {
        align-items: flex-start;
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
      }

      .conversation-state-strip {
        background: white;
        border: 1px solid var(--line);
        border-radius: 14px;
        margin: 0.75rem 0;
        padding: 0.75rem;
      }

      .timeline-item {
        border-left: 4px solid var(--line);
        margin-top: 0.65rem;
      }

      .timeline-item.customer-reply {
        border-left-color: var(--accent);
      }

      .timeline-item.support-response-sent {
        border-left-color: #23a06b;
      }

      .timeline-item.original-ticket {
        border-left-color: #f4c542;
      }

      .timeline-item.recommendation-event {
        border-left-color: var(--muted);
      }

      .timeline-item.diagnosis {
        border-left-color: #7c3aed;
      }

      .timeline-item.fix {
        border-left-color: #16a34a;
      }

      .conversation-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin: 0.65rem 0;
      }

      .conversation-controls button {
        padding: 0.45rem 0.65rem;
      }

      .conversation-controls .secondary {
        background: var(--accent);
        color: white;
      }

      .conversation-controls .secondary:hover:not(:disabled) {
        background: var(--accent-dark);
      }

      .reply-preview {
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.4;
      }

      .requester-card .requester-name {
        display: block;
        line-height: 1.35;
      }

      .requester-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.55rem;
      }

      .requester-pill {
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
        padding: 0.22rem 0.5rem;
      }

      .hero-card {
        background: #f8fbff;
        border: 1px solid var(--line);
        border-radius: 16px;
        margin-bottom: 0.75rem;
        padding: 1rem;
      }

      .hero-card strong {
        display: block;
        margin-bottom: 0.35rem;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-bottom: 0.75rem;
      }

      .chip {
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent-dark);
        font-size: 0.85rem;
        font-weight: 700;
        padding: 0.28rem 0.55rem;
      }

      .classifier-card {
        background: #f8fbff;
      }

      .classifier-card .chips {
        margin-bottom: 0.35rem;
      }

      .classifier-summary {
        display: grid;
        gap: 0.45rem;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        margin-bottom: 0.65rem;
      }

      .classifier-signal-group {
        border-top: 1px solid var(--line);
        margin-top: 0.75rem;
        padding-top: 0.75rem;
      }

      .classifier-signal-group h4 {
        font-size: 0.92rem;
        margin: 0 0 0.45rem;
      }

      .classifier-signal-row {
        background: white;
        border: 1px solid var(--line);
        border-radius: 12px;
        display: grid;
        gap: 0.3rem;
        margin-top: 0.45rem;
        padding: 0.65rem;
      }

      .classifier-signal-row code {
        color: var(--muted);
        font-size: 0.8rem;
        white-space: pre-wrap;
        word-break: break-word;
      }

      details {
        border: 1px solid var(--line);
        border-radius: 14px;
        margin-top: 0.75rem;
        padding: 0.75rem;
      }

      summary {
        cursor: pointer;
        font-weight: 800;
      }

      .description,
      pre {
        white-space: pre-wrap;
        word-break: break-word;
      }

      .warning {
        background: var(--danger-soft);
        border: 1px solid #ffcdc7;
        border-radius: 14px;
        color: var(--danger);
        font-weight: 700;
        line-height: 1.45;
        margin: 0.8rem 0;
        padding: 0.85rem;
      }

      .safety-note {
        background: var(--danger-soft);
        border-color: #ffcdc7;
        margin: 0.45rem 0 0.75rem;
        padding: 0.55rem 0.7rem;
      }

      .safety-note summary {
        align-items: center;
        color: var(--danger);
        display: flex;
        gap: 0.55rem;
      }

      .safety-note p {
        color: var(--danger);
        font-size: 0.88rem;
        font-weight: 600;
        line-height: 1.4;
        margin: 0.55rem 0 0;
      }

      .safety-icon {
        align-items: center;
        background: var(--danger);
        border-radius: 999px;
        color: white;
        display: inline-flex;
        flex: 0 0 auto;
        font-size: 0.82rem;
        height: 1.55rem;
        justify-content: center;
        width: 1.55rem;
      }

      .fields {
        display: grid;
        gap: 0.75rem;
        margin: 0.8rem 0;
      }

      .approval-row {
        background: #fbfcff;
        border: 1px solid var(--line);
        border-radius: 14px;
        display: grid;
        gap: 0.55rem;
        grid-template-columns: minmax(130px, 0.8fr) minmax(160px, 1fr);
        padding: 0.8rem;
      }

      .approval-row .check {
        align-items: flex-start;
        font-weight: 800;
      }

      .approval-row small {
        color: var(--muted);
        display: block;
        font-weight: 500;
        margin-top: 0.2rem;
      }

      .field-control {
        align-items: stretch;
        background: #fbfcff;
        border: 1px solid var(--line);
        border-radius: 14px;
        display: grid;
        gap: 0.65rem;
        grid-template-columns: 1fr;
        padding: 0.8rem;
      }

      .field-heading {
        align-items: center;
        display: flex;
        gap: 0.65rem;
        justify-content: space-between;
      }

      .field-title-group {
        align-items: baseline;
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 0.55rem;
      }

      .field-label {
        font-weight: 800;
      }

      .field-control .value-label {
        display: block;
        margin: 0;
      }

      .field-control .meta {
        align-self: center;
      }

      .field-approve-button {
        min-width: 5.5rem;
        width: auto;
      }

      .field-action-row {
        align-items: center;
        display: grid;
        gap: 0.65rem;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .info-button {
        align-self: center;
        background: var(--danger);
        border-radius: 999px;
        color: white;
        height: 2rem;
        padding: 0;
        width: 2rem;
      }

      .stage-actions {
        justify-content: flex-end;
        margin: 0.3rem 0 0.95rem;
      }

      .classifier-reference {
        align-items: center;
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 12px;
        display: flex;
        gap: 0.65rem;
        justify-content: space-between;
        margin-top: 0.75rem;
        padding: 0.65rem 0.75rem;
      }

      .inline-review-button {
        padding: 0.45rem 0.7rem;
        white-space: nowrap;
      }

      .check {
        align-items: center;
        display: flex;
        gap: 0.5rem;
      }

      .check input {
        width: auto;
      }

      .secondary {
        background: #e8eefc;
        color: var(--accent-dark);
      }

      .danger {
        background: var(--danger);
      }

      .result {
        background: #101828;
        border-radius: 14px;
        color: #d1fadf;
        max-height: 360px;
        overflow: auto;
        padding: 1rem;
      }

      .status {
        color: var(--ok);
        font-weight: 700;
        min-height: 1.5rem;
      }

      @media (max-width: 1100px) {
        .layout,
        .evidence-grid,
        .evidence-lists {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <h1>Approval Desk</h1>
        <p><strong>No ticket changes happen until approval succeeds.</strong> Review evidence, approve named fields, or reject with feedback so every ticket update has an explicit human decision.</p>
      </header>

      <section class="panel evidence-dashboard" aria-label="Automation Evidence">
        <div class="split">
          <div>
            <h2>Automation Evidence</h2>
            <p class="hint">Live guardrails, activity, and automation value from the local approval desk.</p>
          </div>
          <button id="refreshEvidence" type="button" class="secondary">Refresh evidence</button>
        </div>
        <div id="evidencePanel" class="evidence-grid">
          <p class="hint">Loading automation evidence...</p>
        </div>
        <div class="evidence-lists">
          <section class="card" aria-label="Guardrails Active">
            <h3>Guardrails Active</h3>
            <div id="guardrailsPanel">
              <p class="hint">Loading guardrails...</p>
            </div>
          </section>
          <section class="card" aria-label="Recent Activity">
            <h3>Recent Activity</h3>
            <div id="activityPanel">
              <p class="hint">Loading recent activity...</p>
            </div>
          </section>
        </div>
      </section>

      <main class="layout">
        <section class="panel" aria-label="Ticket queue">
          <div class="queue-header">
            <div>
              <h2>Queue</h2>
              <p class="hint">Triage tickets from local data.</p>
            </div>
            <button id="refreshQueue" type="button" class="secondary">Refresh</button>
          </div>
          <div id="queueStatus" class="status" role="status"></div>
          <div id="queueFilters" class="queue-filters" aria-label="Queue filters">
            <button type="button" class="chip queue-filter active" value="active">Active</button>
            <button type="button" class="chip queue-filter" value="draft-ready">Draft ready</button>
            <button type="button" class="chip queue-filter" value="waiting">Waiting</button>
            <button type="button" class="chip queue-filter" value="customer-replied">Customer replied</button>
            <button type="button" class="chip queue-filter" value="resolved">Closed</button>
            <button type="button" class="chip queue-filter" value="all">All</button>
          </div>
          <div id="ticketList" class="queue-list"></div>
        </section>

        <section class="panel" aria-label="Selected ticket">
          <div class="split">
            <h2>Ticket</h2>
          </div>
          <p class="hint">Select a ticket, then create a pending recommendation for reviewer approval.</p>
          <div id="ticketPanel">
            <p class="hint">No ticket selected.</p>
          </div>
          <section class="card diagnosis-panel" aria-label="Diagnosis review">
            <h3>Diagnosis review</h3>
            <div id="diagnosisPanel">
              <p class="hint">Select a ticket to review recorded diagnoses.</p>
            </div>
          </section>
          <section class="card conversation-context" aria-label="Conversation Context">
            <h3>Conversation context</h3>
            <div id="conversationContextPanel">
              <p class="hint">Select a ticket to review conversation context.</p>
            </div>
          </section>
          <details class="advanced-drawer">
            <summary><span class="advanced-icon">i</span><span>Advanced details</span></summary>
            <div id="ticketDetailsPanel">
              <section class="advanced-section">
                <h4>Technical ticket details</h4>
                <p class="hint">Select a ticket to inspect technical fields.</p>
              </section>
            </div>
            <section class="advanced-section">
              <h4>Developer/audit output</h4>
              <p class="hint">Raw local API result for debugging and audit verification.</p>
              <pre id="resultPanel" class="result">{}</pre>
            </section>
          </details>
          <div class="workflow-action-stack">
            <section id="customerReplyFocus" class="customer-reply-focus" aria-label="Latest customer reply" hidden></section>
            <section class="recommendation-setup-bar" aria-label="Workflow actions">
              <input id="confirmApproval" type="checkbox" hidden checked>
              <div class="bar-topline">
                <h3 id="actionBarTitle">Evaluate ticket</h3>
                <span id="actionBarHint" class="meta">Uses the full conversation timeline.</span>
              </div>
              <div id="setupControls" class="bar-mode">
                <div class="setup-grid">
                  <label>
                    Actor
                    <input id="actor" value="approval-desk" autocomplete="off">
                  </label>
                  <label>
                    Draft style
                    <select id="draftStyle">
                      <option value="auto" selected>Auto (Recommended)</option>
                      <option value="balanced">Balanced</option>
                      <option value="concise">Concise</option>
                      <option value="empathetic">Empathetic</option>
                      <option value="technical">Technical</option>
                      <option value="executive-update">Executive update</option>
                    </select>
                  </label>
                  <button id="createRecommendation" type="button" title="Evaluate ticket and draft response">Evaluate</button>
                </div>
              </div>
              <div id="decisionControls" class="bar-mode" hidden>
                <div id="decisionChips" class="chips bar-chip-summary"></div>
                <p id="decisionSummary" class="meta decision-summary">Review the response, then mark the task done.</p>
                <div class="bar-actions">
                  <button id="reviewDraftButton" type="button" class="secondary" title="Review response">Response</button>
                  <button id="markSentButton" type="button" title="Mark response as sent" hidden>Done</button>
                  <button id="createUpdatedRecommendation" type="button" title="Evaluate ticket again" hidden>Evaluate</button>
                  <button id="diagnoseButton" type="button" class="secondary" title="Record diagnosis" hidden>Diagnose</button>
                  <button id="fixButton" type="button" class="secondary accent-action" title="Record fix available" hidden>Fix</button>
                  <button id="closeTicketButton" type="button" class="secondary accent-action" title="Close ticket" hidden>Close</button>
                  <button id="continueApproval" type="button" class="secondary" title="Edit fields" hidden>Edit</button>
                  <button id="startRejectButton" type="button" class="secondary">Reject</button>
                  <button id="approveButton" type="button" title="Mark task done" disabled>Done</button>
                </div>
              </div>
              <div id="editApprovalControls" class="bar-mode" hidden>
                <div id="fieldChoices" hidden>
                  <button class="field-approve-button" type="button" value="category">Approve</button>
                  <button class="field-approve-button" type="button" value="priority">Approve</button>
                  <button class="field-approve-button" type="button" value="team">Approve</button>
                  <button class="field-approve-button" type="button" value="assignee">Approve</button>
                  <button class="field-approve-button" type="button" value="status">Approve</button>
                  <button class="field-approve-button" type="button" value="tags">Approve</button>
                  <button class="field-approve-button" type="button" value="customerResponse">Approve</button>
                </div>
                <div class="compact-edit-grid">
                  <label>Category<input id="categoryOverride" autocomplete="off"></label>
                  <label>Priority<input id="priorityOverride" autocomplete="off"></label>
                  <label>Team<input id="teamOverride" autocomplete="off"></label>
                  <label>Assignee<input id="assigneeOverride" autocomplete="off"></label>
                  <label>Status<input id="statusOverride" autocomplete="off"></label>
                  <label>Tags<input id="tagsOverride" autocomplete="off"></label>
                  <details>
                    <summary>Edit customer response</summary>
                    <textarea id="editedCustomerResponse" placeholder="Optional: edit the customer-facing draft before approval."></textarea>
                  </details>
                </div>
                <div class="bar-actions">
                  <button id="backToRecommendation" type="button" class="secondary" hidden>Cancel</button>
                  <button id="approveEditedButton" type="button" title="Mark edited task done">Done</button>
                </div>
              </div>
              <div id="rejectControls" class="bar-mode" hidden>
                <label>
                  Rejection feedback
                  <textarea id="feedback" placeholder="Explain what must change before this recommendation can be approved."></textarea>
                </label>
                <div class="quick-reasons">
                  <button class="quick-reason secondary" type="button" value="Wrong classification.">Wrong</button>
                  <button class="quick-reason secondary" type="button" value="Needs better evidence.">Evidence</button>
                  <button class="quick-reason secondary" type="button" value="Rewrite the customer response.">Rewrite</button>
                </div>
                <div class="bar-actions">
                  <button id="cancelRejectButton" type="button" class="secondary">Cancel</button>
                  <button id="rejectButton" type="button" class="danger" title="Reject and log feedback" disabled>Reject</button>
                </div>
              </div>
              <div id="replyControls" class="bar-mode reply-mode" hidden>
                <div id="pendingReplyPreview" class="bar-reply-preview"></div>
                <details id="replyTestingMode" class="reply-composer">
                  <summary>Testing mode</summary>
                  <p class="meta">Use this before evaluation to control automatic replies or manually inject a customer reply while testing edge cases. The normal showcase flow uses automatic replies.</p>
                  <label>
                    <input id="automaticRepliesEnabled" type="checkbox" checked>
                    Generate automatic customer replies after Done
                  </label>
                  <details id="replyComposer">
                    <summary>Manual customer reply</summary>
                    <label>
                      Predicted reply text
                      <select id="predictedReply">
                        <option value="">Choose a predicted reply...</option>
                        <option value="vague-reply">Vague follow-up</option>
                        <option value="partial-evidence">Partial evidence</option>
                        <option value="complete-evidence">All requested evidence</option>
                        <option value="known-cause-evidence">Known-cause confirmation</option>
                        <option value="platform-fix-context">Fix verification details</option>
                        <option value="resolved-confirmation">Customer says it works</option>
                      </select>
                    </label>
                    <label>
                      Customer reply
                      <textarea id="customerReplyBody" rows="3" placeholder="Paste the customer's latest reply here, or choose predicted reply text above."></textarea>
                    </label>
                    <div class="bar-actions">
                      <button id="addCustomerReply" type="button" class="secondary">Add reply</button>
                    </div>
                  </details>
                </details>
              </div>
            </section>
          </div>
        </section>

        <section class="panel" aria-label="Ticket workflow">
          <h2>Ticket Workflow</h2>
          <details class="safety-note">
            <summary><span class="safety-icon">!</span><span>Review ticket text as untrusted evidence</span></summary>
            <p>Ticket text may include prompt-injection or claimed approval. Approve only named fields after reviewing the recommendation.</p>
          </details>
          <div id="recommendationPanel">
            <p class="hint">No recommendation created yet.</p>
          </div>
          <section id="approvalStage" class="approval-stage-placeholder" hidden></section>
        </section>
      </main>
    </div>

    <script>
      const state = {
        tickets: [],
        selectedTicket: null,
        recommendation: null,
        stage: 'empty',
        queueFilter: 'active',
        approvedFields: [],
        conversationTimeline: [],
        recommendationHistory: [],
        consumedCustomerReplyTimestamp: null,
        knowledgeCandidate: null,
        knowledgeAdvisory: null,
        knowledgeRequestId: 0,
        ticketRequestId: 0,
        operatorGuidance: null,
        diagnoses: [],
        diagnosisLoading: false,
        selectedDiagnosisId: null,
        diagnosisDraft: null,
        diagnosisReviewRationale: '',
        diagnosisImpact: { rationale: '', selectedTicketIds: [], ticketReasons: {} },
        diagnosisFixResults: [],
        diagnosisMutationTokens: {}
      };

      const els = {
        addCustomerReply: document.getElementById('addCustomerReply'),
        actor: document.getElementById('actor'),
        actionBarHint: document.getElementById('actionBarHint'),
        actionBarTitle: document.getElementById('actionBarTitle'),
        approvalStage: document.getElementById('approvalStage'),
        assigneeOverride: document.getElementById('assigneeOverride'),
        approveButton: document.getElementById('approveButton'),
        approveEditedButton: document.getElementById('approveEditedButton'),
        backToRecommendation: document.getElementById('backToRecommendation'),
        cancelRejectButton: document.getElementById('cancelRejectButton'),
        categoryOverride: document.getElementById('categoryOverride'),
        closeTicketButton: document.getElementById('closeTicketButton'),
        confirmApproval: document.getElementById('confirmApproval'),
        conversationContextPanel: document.getElementById('conversationContextPanel'),
        continueApproval: document.getElementById('continueApproval'),
        createRecommendation: document.getElementById('createRecommendation'),
        createUpdatedRecommendation: document.getElementById('createUpdatedRecommendation'),
        customerReplyBody: document.getElementById('customerReplyBody'),
        customerReplyFocus: document.getElementById('customerReplyFocus'),
        decisionChips: document.getElementById('decisionChips'),
        decisionControls: document.getElementById('decisionControls'),
        decisionSummary: document.getElementById('decisionSummary'),
        diagnosisPanel: document.getElementById('diagnosisPanel'),
        diagnoseButton: document.getElementById('diagnoseButton'),
        draftStyle: document.getElementById('draftStyle'),
        editApprovalControls: document.getElementById('editApprovalControls'),
        editedCustomerResponse: document.getElementById('editedCustomerResponse'),
        evidencePanel: document.getElementById('evidencePanel'),
        feedback: document.getElementById('feedback'),
        fieldChoices: document.getElementById('fieldChoices'),
        fixButton: document.getElementById('fixButton'),
        guardrailsPanel: document.getElementById('guardrailsPanel'),
        activityPanel: document.getElementById('activityPanel'),
        automaticRepliesEnabled: document.getElementById('automaticRepliesEnabled'),
        markSentButton: document.getElementById('markSentButton'),
        queueFilters: document.getElementById('queueFilters'),
        queueStatus: document.getElementById('queueStatus'),
        pendingReplyPreview: document.getElementById('pendingReplyPreview'),
        predictedReply: document.getElementById('predictedReply'),
        recommendationPanel: document.getElementById('recommendationPanel'),
        priorityOverride: document.getElementById('priorityOverride'),
        refreshEvidence: document.getElementById('refreshEvidence'),
        refreshQueue: document.getElementById('refreshQueue'),
        rejectButton: document.getElementById('rejectButton'),
        rejectControls: document.getElementById('rejectControls'),
        replyComposer: document.getElementById('replyComposer'),
        replyControls: document.getElementById('replyControls'),
        replyTestingMode: document.getElementById('replyTestingMode'),
        resultPanel: document.getElementById('resultPanel'),
        reviewDraftButton: document.getElementById('reviewDraftButton'),
        setupControls: document.getElementById('setupControls'),
        startRejectButton: document.getElementById('startRejectButton'),
        statusOverride: document.getElementById('statusOverride'),
        tagsOverride: document.getElementById('tagsOverride'),
        teamOverride: document.getElementById('teamOverride'),
        ticketList: document.getElementById('ticketList'),
        ticketDetailsPanel: document.getElementById('ticketDetailsPanel'),
        ticketPanel: document.getElementById('ticketPanel')
      };

      function selectedFields() {
        if (state.approvedFields.length > 0) {
          return state.approvedFields.slice();
        }
        if (state.recommendation === null) {
          return [];
        }
        return defaultApprovedFields(state.recommendation);
      }

      function defaultApprovedFields(recommendation) {
        const fields = ['category', 'priority', 'team'];
        if (Array.isArray(recommendation.tags) && recommendation.tags.length > 0) {
          fields.push('tags');
        }
        fields.push('customerResponse');
        return fields;
      }

      function setResult(value) {
        els.resultPanel.textContent = JSON.stringify(value, null, 2);
      }

      function renderTicketList() {
        els.ticketList.innerHTML = '';
        if (state.tickets.length === 0) {
          els.queueStatus.textContent = 'Loaded 0 tickets.';
          els.ticketList.innerHTML = '<p class="hint">No tickets found.</p>';
          return;
        }
        const visibleTickets = filteredTickets();
        els.queueStatus.textContent = 'Showing ' + visibleTickets.length + ' of ' + state.tickets.length + ' tickets.';
        renderQueueFilters();
        if (visibleTickets.length === 0) {
          els.ticketList.innerHTML = '<p class="hint">No ' + escapeHtml(state.queueFilter) + ' tickets in this view.</p>';
          return;
        }
        for (const ticket of visibleTickets) {
          const button = document.createElement('button');
          button.type = 'button';
          const workflowState = ticketWorkflowState(ticket);
          button.className = 'ticket-button state-' + workflowState +
            (isSecurityTicket(ticket) ? ' risk-security' : '') +
            (state.selectedTicket?.id === ticket.id ? ' active' : '');
          button.innerHTML =
            '<span class="ticket-id">' + escapeHtml(ticket.id) + '</span>' +
            '<span class="ticket-subject-line">' + escapeHtml(ticket.subject) + '</span>' +
            '<span class="ticket-meta-line">' + escapeHtml(ticket.customer.name) + '</span>' +
            '<span class="ticket-meta-line">rev ' + escapeHtml(ticket.revision) + ' · ' + escapeHtml(workflowStateLabel(workflowState)) + '</span>' +
            renderQueueBadges(ticket);
          button.addEventListener('click', function () {
            void selectTicket(ticket.id);
          });
          els.ticketList.append(button);
        }
      }

      function filteredTickets() {
        if (state.queueFilter === 'all') {
          return state.tickets;
        }
        return state.tickets.filter(function (ticket) {
          return ticketWorkflowState(ticket) === state.queueFilter;
        });
      }

      function ticketWorkflowState(ticket) {
        return ticket.recommendationSummary?.workflowState ?? 'active';
      }

      function workflowStateLabel(value) {
        if (value === 'draft-ready') {
          return 'Draft ready';
        }
        if (value === 'customer-replied') {
          return 'Customer replied';
        }
        if (value === 'resolved') {
          return 'Closed';
        }
        return String(value ?? 'active').replace(/^./, function (letter) { return letter.toUpperCase(); });
      }

      function isSecurityTicket(ticket) {
        const summary = ticket.recommendationSummary ?? {};
        if (summary.securityRisk === 'possible' || summary.securityRisk === 'likely') {
          return true;
        }
        const searchable = [
          ticket.category,
          ticket.subject,
          ticket.description,
          ...(Array.isArray(ticket.tags) ? ticket.tags : [])
        ].filter(Boolean).join(' ').toLowerCase();
        return /security|secret|api key|credential|webhook signature|exposed|prompt-injection/.test(searchable);
      }

      function renderQueueFilters() {
        for (const button of els.queueFilters.querySelectorAll('.queue-filter')) {
          button.className = 'chip queue-filter' + (button.value === state.queueFilter ? ' active' : '');
        }
      }

      function setQueueFilter(value) {
        state.queueFilter = value;
        renderTicketList();
      }

      function renderTicket() {
        const ticket = state.selectedTicket;
        if (ticket === null) {
          els.ticketPanel.innerHTML = '<p class="hint">No ticket selected.</p>';
          els.ticketDetailsPanel.innerHTML =
            '<section class="advanced-section">' +
              '<h4>Technical ticket details</h4>' +
              '<p class="hint">Select a ticket to inspect technical fields.</p>' +
            '</section>';
          els.createRecommendation.disabled = true;
          renderDiagnosisPanel();
          return;
        }
        els.createRecommendation.disabled = !canCreateRecommendation();
        els.createRecommendation.textContent = createRecommendationLabel();
        els.ticketPanel.innerHTML =
          '<div class="chips">' +
            chip(ticket.id) +
            chip(ticket.priority ?? 'unset priority') +
            chip(ticket.status) +
            chip(workflowStateLabel(ticketWorkflowState(ticket))) +
            chip(ticket.team ?? 'unset team') +
          '</div>' +
          renderRequesterCard(ticket) +
          '<div class="hero-card description"><strong>Subject</strong>' + escapeHtml(ticket.subject) + '</div>' +
          '<div class="hero-card description"><strong>Description</strong>' + escapeHtml(ticket.description) + '</div>' +
          renderConversationTimeline(ticket);
        els.ticketDetailsPanel.innerHTML =
          '<section class="advanced-section">' +
            '<h4>Technical ticket details</h4>' +
            '<div class="details-grid">' +
              card('ID', ticket.id) +
              card('Revision', String(ticket.revision)) +
              card('Customer', ticket.customer.name + ' (' + ticket.customer.plan + ', ' + ticket.customer.region + ')') +
              card('Status', ticket.status) +
              card('Category', ticket.category ?? 'unset') +
              card('Priority', ticket.priority ?? 'unset') +
              card('Team', ticket.team ?? 'unset') +
              card('Tags', ticket.tags.join(', ')) +
            '</div>' +
          '</section>';
        renderDiagnosisPanel();
      }

      function resetDiagnosisInteraction() {
        state.selectedDiagnosisId = null;
        state.diagnosisDraft = null;
        state.diagnosisReviewRationale = '';
        state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
        state.diagnosisFixResults = [];
      }

      function selectedDiagnosisView() {
        if (!Array.isArray(state.diagnoses) || state.diagnoses.length === 0) {
          return null;
        }
        return state.diagnoses.find(function (view) {
          return view.originalDiagnosis?.id === state.selectedDiagnosisId;
        }) ?? state.diagnoses.at(-1) ?? null;
      }

      function diagnosisContextForView(view) {
        const review = view?.latestReview;
        return review?.decision === 'approve' || review?.decision === 'revalidate'
          ? review.editedDiagnosis
          : view?.originalDiagnosis?.after?.diagnosis ?? null;
      }

      function isCurrentTicketRequest(ticketId, requestId) {
        return state.ticketRequestId === requestId && state.selectedTicket?.id === ticketId;
      }

      function isCurrentDiagnosisRequest(ticketId, diagnosisId, requestId) {
        return isCurrentTicketRequest(ticketId, requestId) &&
          selectedDiagnosisView()?.originalDiagnosis?.id === diagnosisId;
      }

      function diagnosisMutationKey(ticketId, diagnosisId) {
        return ticketId + ':' + diagnosisId;
      }

      function beginDiagnosisMutation(ticketId, diagnosisId) {
        const key = diagnosisMutationKey(ticketId, diagnosisId);
        const nextToken = (state.diagnosisMutationTokens[key] ?? 0) + 1;
        state.diagnosisMutationTokens[key] = nextToken;
        return nextToken;
      }

      function isCurrentDiagnosisMutation(ticketId, diagnosisId, requestId, mutationToken) {
        return isCurrentDiagnosisRequest(ticketId, diagnosisId, requestId) &&
          state.diagnosisMutationTokens[diagnosisMutationKey(ticketId, diagnosisId)] === mutationToken;
      }

      function diagnosisDraftForView(view) {
        if (state.diagnosisDraft !== null) {
          return state.diagnosisDraft;
        }
        const source = diagnosisContextForView(view);
        if (source === null) {
          return null;
        }
        state.diagnosisDraft = JSON.parse(JSON.stringify(source));
        return state.diagnosisDraft;
      }

      function safeStaleReason(reason) {
        const labels = {
          'newer-customer-reply': 'A newer customer reply needs re-evaluation.',
          'newer-ticket-revision': 'The ticket changed after this diagnosis was recorded.',
          'contradictory-evidence': 'New evidence conflicts with this diagnosis.',
          'newer-diagnosis': 'A newer diagnosis is available for this ticket.',
          'newer-diagnosis-review': 'A newer diagnosis review is available for this ticket.',
          'invalidating-fix-signal': 'A later fix signal may have changed the diagnostic context.',
          'invalidating-event-signal': 'A later event signal may have changed the diagnostic context.',
          'knowledge-workflow-changed': 'The linked workflow changed and needs review.'
        };
        return labels[reason] ?? 'This diagnosis needs review before it can be used.';
      }

      function customerReplyWatermarkLabel(watermark) {
        if (watermark?.state !== 'reply') {
          return 'No customer reply was captured at review time.';
        }
        return 'Customer reply captured at ' + String(watermark.timestamp ?? 'an unknown time') + '.';
      }

      function renderDiagnosisPanel() {
        if (state.selectedTicket === null) {
          els.diagnosisPanel.innerHTML = '<p class="hint">Select a ticket to review recorded diagnoses.</p>';
          return;
        }
        if (state.diagnosisLoading === true) {
          els.diagnosisPanel.innerHTML = '<p class="hint">Loading diagnosis review...</p>';
          return;
        }
        const view = selectedDiagnosisView();
        if (view === null) {
          els.diagnosisPanel.innerHTML = '<p class="hint">No recorded diagnoses are available for this ticket yet.</p>';
          return;
        }
        const original = view.originalDiagnosis?.after?.diagnosis ?? {};
        const current = diagnosisContextForView(view) ?? {};
        const draft = diagnosisDraftForView(view) ?? {};
        const reviews = Array.isArray(view.reviews) ? view.reviews : [];
        const staleReasons = Array.isArray(view.staleReasons) ? view.staleReasons : [];
        const ticketId = state.selectedTicket.id;
        const selected = new Set(state.diagnosisImpact.selectedTicketIds ?? []);
        const sourceReason = state.diagnosisImpact.ticketReasons?.[ticketId] ?? '';
        const selector = state.diagnoses.length > 1
          ? '<div class="quick-reasons" aria-label="Recorded diagnoses">' + state.diagnoses.map(function (candidate) {
              const candidateId = candidate.originalDiagnosis?.id ?? '';
              return '<button type="button" class="secondary" data-action="select-diagnosis" data-diagnosis-id="' + escapeHtml(candidateId) + '">' +
                escapeHtml(candidate.originalDiagnosis?.timestamp ?? 'Recorded diagnosis') +
              '</button>';
            }).join('') + '</div>'
          : '';
        const reviewHistory = reviews.length === 0
          ? '<p class="hint">No review decisions recorded yet.</p>'
          : '<ul>' + reviews.map(function (review) {
              return '<li><strong>' + escapeHtml(review.decision) + '</strong> · ' +
                escapeHtml(review.actor) + ' · ' + escapeHtml(review.reviewedAt) +
                (review.rationale === undefined ? '' : '<br>' + escapeHtml(review.rationale)) +
              '</li>';
            }).join('') + '</ul>';
        const stale = view.stale === true
          ? '<div class="warning" role="status"><strong>Review required</strong><ul>' +
            staleReasons.map(function (reason) { return '<li>' + escapeHtml(safeStaleReason(reason)) + '</li>'; }).join('') +
          '</ul></div>'
          : '<p class="meta">Current against the server-provided review watermark.</p>';
        const results = Array.isArray(state.diagnosisFixResults) && state.diagnosisFixResults.length > 0
          ? '<section class="diagnosis-results" aria-label="Scoped fix results"><h4>Scoped fix results</h4>' +
            state.diagnosisFixResults.map(function (result) {
              return '<div class="card"><strong>' + escapeHtml(result.ticketId ?? 'Ticket') + ' · ' +
                escapeHtml(result.action ?? 'fix') + ' · ' + escapeHtml(result.result ?? 'recorded') + '</strong>' +
                '<p class="meta">Verification remains governed by the ticket workflow.</p></div>';
            }).join('') +
          '</section>'
          : '';
        els.diagnosisPanel.innerHTML =
          selector +
          '<div class="diagnosis-review-grid">' +
            stale +
            '<section class="card"><h4>Original diagnosis</h4>' +
              '<p>' + escapeHtml(original.customerSafeSummary ?? 'No customer-safe summary was recorded.') + '</p>' +
              '<p class="meta">Recorded by ' + escapeHtml(view.originalDiagnosis?.actor ?? 'unknown') + ' · ' +
                escapeHtml(view.originalDiagnosis?.timestamp ?? 'unknown time') + '</p>' +
            '</section>' +
            '<section class="card"><h4>Current reviewed diagnosis</h4>' +
              '<p>' + escapeHtml(current.customerSafeSummary ?? 'No current reviewed diagnosis is available.') + '</p>' +
              '<p class="meta">' + escapeHtml(current.causeType ?? 'unknown cause') + ' · ' +
                escapeHtml(current.confidence ?? 'unknown confidence') + ' · ' + escapeHtml(current.owner ?? 'unknown owner') + '</p>' +
              '<p class="meta">Evidence: ' + escapeHtml(Array.isArray(current.evidenceUsed) ? current.evidenceUsed.join(', ') : 'none recorded') + '</p>' +
              '<p class="meta">Workflow context: ' + escapeHtml(current.recommendedNextAction ?? 'No next action recorded.') + '</p>' +
              '<p class="meta">' + escapeHtml(customerReplyWatermarkLabel(view.sourceConversationWatermark)) + '</p>' +
            '</section>' +
            '<details><summary>Review history</summary>' + reviewHistory + '</details>' +
            '<section class="card"><h4>Review draft</h4>' +
              '<p class="hint">Edits remain local until an explicit review action succeeds. The original diagnosis is preserved in history.</p>' +
              '<label>Customer-safe summary<textarea data-diagnosis-draft-field="customerSafeSummary">' + escapeHtml(draft.customerSafeSummary ?? '') + '</textarea></label>' +
              '<label>Recommended next action<textarea data-diagnosis-draft-field="recommendedNextAction">' + escapeHtml(draft.recommendedNextAction ?? '') + '</textarea></label>' +
              '<label>Review rationale<textarea data-diagnosis-review-rationale="true" placeholder="Required for reject or revalidate.">' + escapeHtml(state.diagnosisReviewRationale) + '</textarea></label>' +
              '<div class="bar-actions">' +
                '<button type="button" class="secondary" data-action="review-diagnosis" data-decision="approve">Approve diagnosis</button>' +
                '<button type="button" class="secondary" data-action="review-diagnosis" data-decision="revalidate">Revalidate</button>' +
                '<button type="button" class="danger" data-action="review-diagnosis" data-decision="reject">Reject diagnosis</button>' +
              '</div>' +
            '</section>' +
            '<section class="card"><h4>Diagnosis-specific fix</h4>' +
              '<p>' + escapeHtml(current.recommendedNextAction ?? 'The service will determine whether a fix is available.') + '</p>' +
              '<p class="hint">Suggested impact candidates are never preselected. Related-ticket discovery is added in a later governed analysis slice; this route currently provides the source ticket only.</p>' +
              '<div class="diagnosis-impact-list"><div class="diagnosis-impact-candidate">' +
                '<label><input type="checkbox" data-impact-ticket="' + escapeHtml(ticketId) + '"' + (selected.has(ticketId) ? ' checked' : '') + '> ' +
                '<span>Suggested impact candidate: ' + escapeHtml(ticketId) + ' ' + (selected.has(ticketId) ? '(selected)' : '(not selected)') + '</span></label>' +
                '<label>Ticket rationale<input data-impact-ticket-reason="' + escapeHtml(ticketId) + '" value="' + escapeHtml(sourceReason) + '" placeholder="Why does this diagnosis apply?"></label>' +
              '</div></div>' +
              '<label>Operator impact-set rationale<textarea data-impact-field="rationale" placeholder="Explain why the explicitly selected tickets share this diagnosis.">' + escapeHtml(state.diagnosisImpact.rationale) + '</textarea></label>' +
              '<div class="bar-actions"><button type="button" class="accent-action" data-action="apply-diagnosis-fix">Apply scoped fix</button></div>' +
            '</section>' +
            results +
          '</div>';
      }

      async function loadDiagnoses(ticketId, ticketRequestId) {
        const data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses', undefined, {
          writeErrorToResult: false
        });
        if (!isCurrentTicketRequest(ticketId, ticketRequestId)) {
          return;
        }
        state.diagnoses = Array.isArray(data.diagnoses) ? data.diagnoses : [];
        state.diagnosisLoading = false;
        renderDiagnosisPanel();
      }

      async function reviewSelectedDiagnosis(decision) {
        const view = selectedDiagnosisView();
        const draft = diagnosisDraftForView(view);
        if (state.selectedTicket === null || view === null || draft === null) {
          return;
        }
        const ticketId = state.selectedTicket.id;
        const diagnosisId = view.originalDiagnosis.id;
        const ticketRequestId = state.ticketRequestId;
        const mutationToken = beginDiagnosisMutation(ticketId, diagnosisId);
        const body = {
          decision,
          sourceTicketRevision: view.sourceTicketRevision,
          sourceConversationWatermark: view.sourceConversationWatermark,
          editedDiagnosis: draft,
          actor: els.actor.value.trim() || 'approval-desk'
        };
        if (state.diagnosisReviewRationale.trim() !== '') {
          body.rationale = state.diagnosisReviewRationale.trim();
        }
        let data;
        try {
          data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses/' + encodeURIComponent(diagnosisId) + '/review', {
            method: 'POST',
            body: JSON.stringify(body)
          }, { writeErrorToResult: false });
        } catch (error) {
          if (isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketRequestId, mutationToken)) {
            setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
          }
          return;
        }
        if (!isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketRequestId, mutationToken)) {
          return;
        }
        state.diagnoses = Array.isArray(data.diagnoses) ? data.diagnoses : state.diagnoses;
        state.diagnosisDraft = null;
        state.diagnosisReviewRationale = '';
        state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
        state.diagnosisFixResults = [];
        renderDiagnosisPanel();
        setResult(data);
      }

      async function applySelectedDiagnosisFix() {
        const view = selectedDiagnosisView();
        if (state.selectedTicket === null || view === null) {
          return;
        }
        const ticketId = state.selectedTicket.id;
        const diagnosisId = view.originalDiagnosis.id;
        const ticketRequestId = state.ticketRequestId;
        const mutationToken = beginDiagnosisMutation(ticketId, diagnosisId);
        const actor = els.actor.value.trim() || 'approval-desk';
        const selectedTicketIds = Array.isArray(state.diagnosisImpact.selectedTicketIds)
          ? state.diagnosisImpact.selectedTicketIds
          : [];
        let data;
        try {
          data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses/' + encodeURIComponent(diagnosisId) + '/fix', {
            method: 'POST',
            body: JSON.stringify({
              actor,
              impactSet: {
                actor,
                rationale: state.diagnosisImpact.rationale,
                tickets: selectedTicketIds.map(function (ticketId) {
                  return { ticketId, reason: state.diagnosisImpact.ticketReasons?.[ticketId] ?? '' };
                })
              }
            })
          }, { writeErrorToResult: false });
        } catch (error) {
          if (isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketRequestId, mutationToken)) {
            setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
          }
          return;
        }
        if (!isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketRequestId, mutationToken)) {
          return;
        }
        state.diagnosisFixResults = Array.isArray(data.auditEvents) ? data.auditEvents : [];
        state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
        state.diagnosisDraft = null;
        state.diagnosisReviewRationale = '';
        renderDiagnosisPanel();
        setResult(data);
      }

      function createRecommendationLabel() {
        return ticketWorkflowState(state.selectedTicket ?? {}) === 'customer-replied'
          ? 'Evaluate again'
          : 'Evaluate ticket';
      }

      function canCreateRecommendation() {
        return state.selectedTicket !== null && !isApprovedAwaitingSend();
      }

      function createUpdatedRecommendationLabel() {
        return latestUnevaluatedWorkflowEvent() !== null ? 'Update' : 'Evaluate';
      }

      function isApprovedAwaitingSend() {
        const approved = state.recommendation?.resolution === 'approved';
        return approved && !isCurrentRecommendationSent();
      }

      function renderConversationContext() {
        if (state.selectedTicket === null) {
          els.conversationContextPanel.innerHTML = '<p class="hint">Select a ticket to review conversation context.</p>';
          return;
        }
        const latestReply = latestCustomerReply();
        els.conversationContextPanel.innerHTML =
          '<p class="hint">Customer replies are added from the action bar so the next evaluation can use the latest message.</p>' +
          (latestReply === null
            ? '<p class="meta">No customer reply has been added yet.</p>'
            : '<p class="meta"><strong>Latest customer reply</strong> ' + escapeHtml(previewRecommendationDraft(latestReply.body ?? latestReply.summary ?? '')) + '</p>');
      }

      function renderConversationTimeline(ticket) {
        const timeline = Array.isArray(state.conversationTimeline) && state.conversationTimeline.length > 0
          ? state.conversationTimeline
          : [{
              kind: 'original-ticket',
              timestamp: ticket.createdAt,
              actor: ticket.requester?.name ?? ticket.customer.name,
              title: ticket.subject,
              body: ticket.description
            }];
        return '<section class="hero-card conversation-timeline" aria-label="conversationTimeline">' +
          '<div class="conversation-header">' +
            '<div>' +
              '<strong>Conversation timeline</strong>' +
              '<p class="hint">Original ticket, customer replies, sent responses, and recommendation events in order.</p>' +
            '</div>' +
            '<span class="meta">' + escapeHtml(String(timeline.length)) + ' item' + (timeline.length === 1 ? '' : 's') + '</span>' +
          '</div>' +
          renderConversationStateStrip(ticket) +
          timeline.map(renderConversationTimelineItem).join('') +
        '</section>';
      }

      function renderConversationStateStrip(ticket) {
        const summary = ticket.recommendationSummary ?? {};
        return '<div class="conversation-state-strip">' +
          '<div class="chips">' +
            chip('Workflow: ' + workflowStateLabel(summary.workflowState ?? ticketWorkflowState(ticket))) +
            chip('Sent response: ' + (summary.hasSentResponse ? 'yes' : 'no')) +
            chip('Customer replied: ' + (summary.hasCustomerReply ? 'yes' : 'no')) +
            chip('Latest draft: ' + (summary.latestResolution ?? 'none')) +
          '</div>' +
          '<p class="hint">Use this timeline to show why each new recommendation changed.</p>' +
        '</div>';
      }

      function renderConversationTimelineItem(item) {
        const label = conversationTimelineLabel(item);
        const title = item.title === undefined ? '' : '<span class="meta">' + escapeHtml(item.title) + '</span>';
        return '<div class="card description timeline-item ' + escapeHtml(String(item.kind ?? 'recommendation-event')) + '">' +
          '<strong>' + escapeHtml(label) + '</strong>' +
          '<span class="meta">' + escapeHtml(item.timestamp ?? 'unknown time') + ' · ' + escapeHtml(item.actor ?? 'unknown actor') + '</span>' +
          title +
          renderTimelineBody(item.body ?? item.summary ?? '') +
        '</div>';
      }

      function conversationTimelineLabel(item) {
        if (item.kind === 'original-ticket') {
          return 'Original ticket';
        }
        if (item.kind === 'support-response-sent') {
          return 'Support response sent';
        }
        if (item.kind === 'customer-reply') {
          return 'Customer reply';
        }
        if (item.kind === 'diagnosis') {
          return 'Diagnosis completed';
        }
        if (item.kind === 'fix') {
          return 'Fix available';
        }
        return 'Recommendation event';
      }

      function renderTimelineBody(body) {
        const text = String(body ?? '');
        if (text.length > 180) {
          return '<details><summary>Read message</summary><p>' + escapeHtml(text) + '</p></details>';
        }
        return '<p>' + escapeHtml(text) + '</p>';
      }

      function renderQueueBadges(ticket) {
        const summary = ticket.recommendationSummary ?? {};
        const priority = summary.priority ?? ticket.priority ?? 'Priority unset';
        const supportState = summary.supportState;
        const readyForClose = supportState === 'ready-for-close';
        const workflow = readyForClose ? 'Ready to close' : workflowStateLabel(ticketWorkflowState(ticket));
        const label = priority + ' · ' + workflow;
        const detail = readyForClose
          ? 'The server marked the latest workflow response ready for an explicit closure action.'
          : 'Current queue status from the server workflow read model.';
        return '<span class="queue-status-line">' +
          '<span class="queue-status-indicator' + (readyForClose ? ' ready-for-close' : '') + '" role="status" aria-label="' + escapeHtml(label) + '">' +
            '<span aria-hidden="true">' + (readyForClose ? '✓' : '•') + '</span>' + escapeHtml(label) +
          '</span>' +
          '<span class="queue-status-info" role="img" aria-label="Queue status details" title="' + escapeHtml(detail) + '">i</span>' +
        '</span>';
      }

      function renderRequesterCard(ticket) {
        const requester = ticket.requester;
        if (requester === undefined || requester === null) {
          return card('Requester', 'Unknown requester');
        }
        return '<div class="card requester-card">' +
          '<strong>Requester</strong>' +
          '<span class="requester-name">' + escapeHtml(requester.name + ' · ' + requester.role) + '</span>' +
          '<span class="requester-meta">' +
            '<span class="requester-pill">' + escapeHtml(requester.department) + '</span>' +
            '<span class="requester-pill">' + escapeHtml(requester.technicalLevel) + '</span>' +
          '</span>' +
        '</div>';
      }

      function renderRecommendation(preserveApprovalInputs) {
        const recommendation = state.recommendation;
        if (recommendation === null) {
          els.recommendationPanel.innerHTML =
            '<section class="hero-card description"><strong>Step 1: Evaluate ticket</strong>' +
            '<p>Select a ticket, then use the action bar to evaluate classification, lifecycle state, evidence needs, and the next customer response.</p>' +
            '</section>' + renderKnowledgeReviewPanel();
          state.stage = 'empty';
          els.editedCustomerResponse.value = '';
          clearApprovalInputs();
          renderRecommendationStageControls();
          updateControls();
          return;
        }
        if (isApprovedWorkflow()) {
          els.recommendationPanel.innerHTML =
            renderWorkflowSteps(recommendation) +
            '<div id="customerResponseDraft" class="hero-card description"><strong>Customer Response Draft</strong>' + escapeHtml(recommendation.draftCustomerResponse) + '</div>' +
            renderRecommendationSummary(recommendation) +
            renderPreviousRecommendations() +
            '<details><summary>All proposed ticket values</summary>' +
              '<div class="details-grid">' +
              card('Category', recommendation.category) +
              card('Priority', recommendation.priority) +
              card('Team', recommendation.team) +
              card('Assignee', recommendation.assignee === undefined ? 'unchanged' : String(recommendation.assignee)) +
              card('Status', recommendation.ticketStatus ?? 'unchanged') +
              card('Tags', Array.isArray(recommendation.tags) ? recommendation.tags.join(', ') : 'unchanged') +
              '</div>' +
            '</details>';
        } else {
          els.recommendationPanel.innerHTML =
            renderWorkflowSteps(recommendation) +
            '<div id="customerResponseDraft" class="hero-card description"><strong>Customer Response Draft</strong>' + escapeHtml(recommendation.draftCustomerResponse) + '</div>' +
            renderRecommendationSummary(recommendation) +
            renderRecommendationChangeSummary(recommendation) +
            renderRecommendationReason(recommendation) +
            renderTechnicalEvidence(recommendation) +
            renderPreviousRecommendations() + renderKnowledgeReviewPanel();
        }
        if (!preserveApprovalInputs) {
          els.editedCustomerResponse.value = recommendation.draftCustomerResponse;
          populateApprovalInputs(recommendation);
        }
        renderRecommendationStageControls();
        updateControls();
      }

      function renderWorkflowSteps(recommendation) {
        const responseState = isTaskDoneWaitingForReply()
          ? 'Done. Waiting for the next customer reply.'
          : isApprovedWorkflow()
            ? 'Ready to mark done from the action bar.'
            : 'Ready for human review from the action bar.';
        return '<section class="hero-card description"><strong>Next Step</strong>' +
          '<p>' + escapeHtml(responseState) + '</p>' +
          '<details><summary>Full workflow guide</summary>' +
            '<p><strong>1. Evaluate</strong> Classify the ticket, check evidence, and draft a response from the full conversation.</p>' +
            '<p><strong>2. Review</strong> Inspect the customer response, recommendation summary, and evidence before marking the task done.</p>' +
            '<p><strong>3. Continue</strong> Automatic customer replies, diagnosis updates, fixes, and closing actions appear in the action bar as the ticket evolves.</p>' +
          '</details>' +
        '</section>';
      }

      function renderRecommendationSummary(recommendation) {
        const missing = Array.isArray(recommendation.missingEvidence) ? recommendation.missingEvidence : [];
        const evidenceState = missing.length === 0 ? 'complete' : missing.length + ' missing';
        return '<section class="hero-card"><strong>Recommendation Summary</strong>' +
          '<div class="chips">' +
            chip('Category: ' + recommendation.category) +
            chip('Priority: ' + recommendation.priority) +
            chip('Team: ' + recommendation.team) +
            chip('Lifecycle: ' + (recommendation.supportState ?? 'not assessed')) +
            chip('Evidence: ' + evidenceState) +
          '</div>' +
        '</section>';
      }

      function renderRecommendationReason(recommendation) {
        const reason = recommendation.rationale ?? 'The recommendation is based on the ticket text, conversation history, and retrieved support knowledge.';
        const nextAction = recommendation.recommendedNextAction ?? 'Review the recommendation before approval.';
        return '<section class="hero-card description"><strong>Why this recommendation?</strong>' +
          '<p>' + escapeHtml(reason) + '</p>' +
          '<p class="meta"><strong>Next step</strong> ' + escapeHtml(nextAction) + '</p>' +
        '</section>';
      }

      function renderTechnicalEvidence(recommendation) {
        return '<details><summary>Show technical evidence</summary>' +
          '<div class="details-grid">' +
            card('Confidence', String(recommendation.confidence)) +
            card('Knowledge used', formatList(recommendation.knowledgeArticleIds)) +
            card('Outage risk', recommendation.outageRisk) +
            card('Security risk', recommendation.securityRisk) +
            card('SLA risk', recommendation.slaRisk) +
            card('Known cause', recommendation.knownCause ?? 'none') +
            card('Escalation', recommendation.escalationRequired ? 'required' : 'not required') +
            card('Draft checks', formatDraftCheckSummary(recommendation.draftCustomerResponseChecks)) +
          '</div>' +
          '<div class="card description"><strong>Classifier signals</strong>' + escapeHtml(formatClassifierSignals(recommendation.classificationSignals)) + '</div>' +
          '<div class="card description"><strong>Evidence requirements</strong>' +
            '<p class="meta"><strong>Provided</strong> ' + escapeHtml(formatEvidenceLabels(recommendation.providedEvidence)) + '</p>' +
            '<p class="meta"><strong>Missing</strong> ' + escapeHtml(formatEvidenceLabels(recommendation.missingEvidence)) + '</p>' +
          '</div>' +
          '<div class="card description"><strong>Audit identifiers</strong>' +
            '<p class="meta">Recommendation ' + escapeHtml(recommendation.id) + ' from ticket revision ' + escapeHtml(String(recommendation.sourceRevision)) + '.</p>' +
          '</div>' +
        '</details>';
      }

      function formatClassifierSignals(signals) {
        if (!Array.isArray(signals) || signals.length === 0) {
          return 'No classifier signal snapshot stored for this recommendation.';
        }
        return signals.map(function (signal) {
          return signal.ruleId + ': ' + signal.reason;
        }).join('\\n');
      }

      function renderRecommendationStageControls() {
        const hasRecommendation = state.recommendation !== null;
        const approvedWorkflow = isApprovedWorkflow();
        const waitingForReply = isTaskDoneWaitingForReply();
        const customerReplyReady = latestUnconsumedCustomerReply() !== null;
        const closeReady = shouldShowCloseTicketAction();
        const diagnosisActionReady = shouldShowDiagnoseAction();
        const fixActionReady = shouldShowFixAction();
        const workflowActionReady = shouldShowCreateUpdatedRecommendation() || diagnosisActionReady || fixActionReady || closeReady;
        els.setupControls.hidden = hasRecommendation;
        els.decisionControls.hidden = (!hasRecommendation && !diagnosisActionReady && !fixActionReady) || (waitingForReply && !workflowActionReady) || state.stage === 'approval' || state.stage === 'reject';
        els.editApprovalControls.hidden = !(hasRecommendation && state.stage === 'approval');
        els.rejectControls.hidden = !(hasRecommendation && state.stage === 'reject');
        els.replyControls.hidden = !shouldShowReplyControls();
        els.approvalStage.hidden = true;
        els.actionBarTitle.textContent = actionBarTitle();
        els.actionBarHint.textContent = actionBarHint();
        els.customerReplyFocus.innerHTML = renderCustomerReplyFocus();
        els.customerReplyFocus.hidden = els.customerReplyFocus.innerHTML === '';
        els.continueApproval.textContent = 'Edit';
        els.reviewDraftButton.textContent = 'Response';
        els.approveButton.textContent = 'Done';
        els.approveEditedButton.textContent = 'Done';
        els.continueApproval.hidden = !hasRecommendation || approvedWorkflow || shouldShowCreateUpdatedRecommendation();
        els.markSentButton.hidden = true;
        els.createUpdatedRecommendation.hidden = !shouldShowCreateUpdatedRecommendation();
        els.diagnoseButton.hidden = !diagnosisActionReady;
        els.fixButton.hidden = !fixActionReady;
        els.closeTicketButton.hidden = !closeReady;
        els.approveButton.hidden = !hasRecommendation || shouldShowCreateUpdatedRecommendation() || closeReady;
        els.startRejectButton.hidden = !hasRecommendation || approvedWorkflow || closeReady;
        els.backToRecommendation.hidden = !(hasRecommendation && state.stage === 'approval');
        els.decisionChips.innerHTML = hasRecommendation ? renderDecisionChips(state.recommendation) : '';
        els.decisionSummary.textContent = hasRecommendation ? decisionSummaryText(state.recommendation) : 'Review the draft and evidence, then approve or edit.';
        els.pendingReplyPreview.innerHTML = renderPendingReplyPreview();
        if (customerReplyReady || latestUnevaluatedWorkflowEvent() !== null) {
          els.createUpdatedRecommendation.textContent = createUpdatedRecommendationLabel();
        }
      }

      function actionBarTitle() {
        if (state.recommendation === null) {
          return 'Evaluate ticket';
        }
        if (shouldShowCloseTicketAction()) {
          return 'Ready to close';
        }
        if (latestUnevaluatedWorkflowEvent() !== null && shouldShowCreateUpdatedRecommendation()) {
          return 'Diagnosis update';
        }
        if (shouldShowCreateUpdatedRecommendation()) {
          return 'Customer replied';
        }
        if (isTaskDoneWaitingForReply()) {
          return 'Waiting for customer';
        }
        if (isApprovedWorkflow()) {
          return 'Response ready';
        }
        if (state.stage === 'approval') {
          return 'Edit response';
        }
        if (state.stage === 'reject') {
          return 'Reject response';
        }
        return 'Response ready';
      }

      function actionBarHint() {
        if (state.knowledgeCandidate !== null) {
          return 'Potential knowledge pattern — review it separately. Approval affects future evaluations, not historical recommendations.';
        }
        if (state.recommendation === null) {
          return 'Classify the ticket and draft a response.';
        }
        if (shouldShowCloseTicketAction()) {
          return 'Customer confirmed the solution. Close preserves the audit trail.';
        }
        if (latestUnevaluatedWorkflowEvent() !== null && shouldShowCreateUpdatedRecommendation()) {
          return 'Draft the customer update from the latest diagnosis or fix.';
        }
        if (shouldShowCreateUpdatedRecommendation()) {
          return 'Evaluate again from the new customer reply.';
        }
        if (isTaskDoneWaitingForReply()) {
          return 'Add a reply when the customer responds.';
        }
        if (isApprovedWorkflow()) {
          return 'Done approves and sends the response.';
        }
        if (state.stage === 'approval') {
          return 'Adjust only what needs changing.';
        }
        if (state.stage === 'reject') {
          return 'Feedback is logged to the audit trail.';
        }
        return 'Review the response on the right, then mark done.';
      }

      function renderKnowledgeReviewPanel() {
        const candidate = state.knowledgeCandidate;
        if (candidate === null) {
          return '';
        }
        const support = Array.isArray(candidate.support) ? candidate.support : [];
        const evidence = candidate.evidencePolicy?.mode === 'required'
          ? formatList(candidate.evidencePolicy.evidenceIds)
          : 'No evidence required';
        const discoveryAdvisory = state.knowledgeAdvisory;
        const fallback = discoveryAdvisory?.fallbackReason === undefined
          ? ''
          : '<p class="warning"><strong>GPT fallback</strong> ' + escapeHtml(discoveryAdvisory.fallbackReason) +
            (Array.isArray(discoveryAdvisory.diagnostics) && discoveryAdvisory.diagnostics.length > 0
              ? ': ' + escapeHtml(discoveryAdvisory.diagnostics.join(' '))
              : '') + '</p>';
        const listText = function (value) { return Array.isArray(value) ? value.join('\\n') : ''; };
        const requiredEvidence = candidate.evidencePolicy?.mode === 'required'
          ? listText(candidate.evidencePolicy.evidenceIds)
          : '';
        return '<section class="hero-card description knowledge-review-panel"><strong>Potential knowledge pattern</strong>' +
          '<p class="hint">This is a separate, explicit review gate. Approval affects future evaluations only; it does not alter historical recommendations or customer responses.</p>' +
          '<div class="details-grid">' +
            card('Proposed name', candidate.name) +
            card('Evidence policy', evidence) +
            card('Deterministic score', String(candidate.deterministic?.score ?? 'unknown')) +
            card('Validation', candidate.validationStatus ?? 'unknown') +
          '</div>' +
          '<p><strong>Deterministic reasons</strong> ' + escapeHtml(formatList(candidate.deterministic?.reasons)) + '</p>' +
          '<p><strong>GPT advisory</strong> ' + escapeHtml(candidate.gptAdvisory?.status ?? 'not-used') +
            (candidate.gptAdvisory?.confidence === undefined ? '' : ' (advisory confidence: ' + escapeHtml(String(candidate.gptAdvisory.confidence)) + ')') +
            (candidate.gptAdvisory?.rationale ? ': ' + escapeHtml(candidate.gptAdvisory.rationale) : '') + '</p>' +
          fallback +
          '<p><strong>Support diagnoses/open tickets</strong> ' + escapeHtml(support.map(function (item) { return item.source + ': ' + (item.diagnosisId ?? item.ticketId); }).join(', ') || 'none') + '</p>' +
          '<p><strong>Contradictions</strong> ' + escapeHtml(formatList(candidate.contradictions)) + '</p>' +
          '<p><strong>Validation warnings</strong> ' + escapeHtml(formatList(candidate.validationWarnings)) + '</p>' +
          '<div class="details-grid"><label>Proposed name <input id="knowledgeName" value="' + escapeHtml(candidate.name ?? '') + '"></label>' +
          '<label>Owner team <input id="knowledgeOwner" value="' + escapeHtml(candidate.owner ?? '') + '"></label></div>' +
          '<label>Summary <textarea id="knowledgeSummary">' + escapeHtml(candidate.summary ?? '') + '</textarea></label>' +
          '<label>Trigger patterns <textarea id="knowledgeTriggerPatterns">' + escapeHtml(listText(candidate.triggerPatterns)) + '</textarea></label>' +
          '<div class="details-grid"><label>Evidence policy <select id="knowledgeEvidenceMode"><option value="none-required"' + (candidate.evidencePolicy?.mode === 'none-required' ? ' selected' : '') + '>None required</option><option value="required"' + (candidate.evidencePolicy?.mode === 'required' ? ' selected' : '') + '>Required</option></select></label>' +
          '<label>Required evidence IDs <textarea id="knowledgeEvidenceIds">' + escapeHtml(requiredEvidence) + '</textarea></label></div>' +
          '<label>Time constraints <textarea id="knowledgeTimeConstraints">' + escapeHtml(listText(candidate.timeConstraints)) + '</textarea></label>' +
          '<label>Diagnostic workflow <textarea id="knowledgeDiagnosticSteps">' + escapeHtml(listText(candidate.diagnosticSteps)) + '</textarea></label>' +
          '<label>Fix workflow <textarea id="knowledgeFixSteps">' + escapeHtml(listText(candidate.fixSteps)) + '</textarea></label>' +
          '<label>Verification workflow <textarea id="knowledgeVerificationSteps">' + escapeHtml(listText(candidate.verificationSteps)) + '</textarea></label>' +
          '<label>Customer-safe explanation <textarea id="knowledgeCustomerSafeExplanation">' + escapeHtml(candidate.customerSafeExplanation ?? '') + '</textarea></label>' +
          '<label>Operator rationale <textarea id="knowledgeOperatorRationale">' + escapeHtml(candidate.operatorRationale ?? '') + '</textarea></label>' +
          '<label>Rejection reason <textarea id="knowledgeRejectReason" placeholder="Explain why this candidate is not approved."></textarea></label>' +
          '<div class="actions"><button type="button" data-action="approve-knowledge">Approve for future evaluations</button><button type="button" class="secondary" data-action="draft-knowledge-with-gpt">Refresh with optional GPT</button><button type="button" class="secondary" data-action="defer-knowledge">Defer</button><button type="button" class="danger" data-action="reject-knowledge">Reject</button></div>' +
        '</section>';
      }

      function renderDecisionChips(recommendation) {
        const missing = Array.isArray(recommendation.missingEvidence) ? recommendation.missingEvidence : [];
        return [
          'Evaluation: ' + recommendation.category,
          'Priority: ' + recommendation.priority,
          'Team: ' + recommendation.team,
          missing.length === 0 ? 'Evidence complete' : missing.length + ' evidence items missing',
          'Response ready'
        ].map(chip).join('');
      }

      function decisionSummaryText(recommendation) {
        if (latestUnevaluatedWorkflowEvent() !== null && shouldShowCreateUpdatedRecommendation()) {
          return 'A workflow update is waiting. Draft the next customer response from the diagnosis or fix.';
        }
        if (shouldShowCreateUpdatedRecommendation()) {
          return 'A customer reply is waiting. Evaluate again to refresh classification, evidence, and response text.';
        }
        if (shouldShowCloseTicketAction()) {
          return 'The closing response has been sent. Close moves the ticket to Closed while keeping all logs.';
        }
        if (isApprovedWorkflow()) {
          return 'The response is ready. Done applies the proposed values and logs the response as sent.';
        }
        return 'Done applies the proposed triage values and the visible customer response draft.';
      }

      function renderMarkSentAction() {
        if (!shouldShowMarkSentAction()) {
          return '';
        }
        return '<div class="actions"><button type="button" data-action="mark-sent">Mark response as sent</button></div>';
      }

      function shouldShowMarkSentAction() {
        const summary = state.selectedTicket?.recommendationSummary ?? {};
        const approved = state.recommendation?.resolution === 'approved' || summary.latestResolution === 'approved';
        return approved && !isCurrentRecommendationSent();
      }

      function shouldShowCreateUpdatedRecommendation() {
        return state.selectedTicket !== null &&
          state.recommendation !== null &&
          (latestUnconsumedCustomerReply() !== null || latestUnevaluatedWorkflowEvent() !== null) &&
          canCreateRecommendation();
      }

      function shouldShowDiagnoseAction() {
        return state.selectedTicket !== null &&
          (state.operatorGuidance === null || state.operatorGuidance.nextAction === 'record-diagnosis');
      }

      function shouldShowFixAction() {
        return state.selectedTicket !== null &&
          (state.operatorGuidance === null || state.operatorGuidance.nextAction === 'mark-fix-available');
      }

      function shouldShowCloseTicketAction() {
        return state.selectedTicket !== null &&
          state.recommendation !== null &&
          ticketWorkflowState(state.selectedTicket) !== 'resolved' &&
          state.recommendation.supportState === 'ready-for-close' &&
          isTaskDoneWaitingForReply();
      }

      function renderPendingReplyPreview() {
        const latestReply = latestUnconsumedCustomerReply();
        if (latestReply !== null) {
          return '';
        }
        if (state.recommendation === null) {
          return '<strong>Testing mode available</strong><span>Open Testing mode to disable automatic replies or simulate a customer reply before evaluation.</span>';
        }
        const workflowEvent = latestUnevaluatedWorkflowEvent();
        if (workflowEvent !== null) {
          return '<strong>Workflow update waiting for evaluation</strong>' +
            '<span>' + escapeHtml(previewRecommendationDraft(workflowEvent.summary ?? workflowEvent.kind ?? '')) + '</span>';
        }
        if (isTaskDoneWaitingForReply()) {
          return '<strong>No automatic customer reply was generated</strong><span>The normal demo flow should move to the next workflow action or receive an automatic reply. Use Testing mode only for edge-case checks.</span>';
        }
        return '<strong>Customer reply</strong><span>Add a reply here whenever the customer sends new information.</span>';
      }

      function renderCustomerReplyFocus() {
        const latestReply = latestUnconsumedCustomerReply();
        if (latestReply === null) {
          return '';
        }
        return '<strong>Customer reply to evaluate</strong>' +
          '<span>' + escapeHtml(latestReply.body ?? latestReply.summary ?? '') + '</span>';
      }

      function shouldShowReplyControls() {
        return state.selectedTicket !== null &&
          !shouldShowCloseTicketAction() &&
          state.operatorGuidance?.nextAction !== 'record-diagnosis' &&
          state.operatorGuidance?.nextAction !== 'mark-fix-available';
      }

      function latestCustomerReply() {
        if (!Array.isArray(state.conversationTimeline)) {
          return null;
        }
        const replies = state.conversationTimeline.filter(function (item) {
          return item.kind === 'customer-reply';
        });
        return replies.length === 0 ? null : replies[replies.length - 1];
      }

      function latestTimelineItem(kind) {
        if (!Array.isArray(state.conversationTimeline)) {
          return null;
        }
        const items = state.conversationTimeline
          .filter(function (item) { return item.kind === kind; })
          .sort(function (left, right) {
            return String(right.timestamp ?? '').localeCompare(String(left.timestamp ?? ''));
          });
        return items[0] ?? null;
      }

      function latestUnevaluatedWorkflowEvent() {
        if (!Array.isArray(state.conversationTimeline) || state.recommendation?.createdAt === undefined) {
          return null;
        }
        const baseline = String(state.recommendation.createdAt);
        const items = state.conversationTimeline
          .filter(function (item) {
            return (item.kind === 'diagnosis' || item.kind === 'fix') &&
              String(item.timestamp ?? '') >= baseline;
          })
          .sort(function (left, right) {
            return String(right.timestamp ?? '').localeCompare(String(left.timestamp ?? ''));
          });
        return items[0] ?? null;
      }

      function latestUnconsumedCustomerReply() {
        const latestReply = latestCustomerReply();
        if (latestReply === null) {
          return null;
        }
        const latestTimestamp = String(latestReply.timestamp ?? '');
        const recommendationCreatedAt = String(state.recommendation?.createdAt ?? '');
        const consumedAt = String(state.consumedCustomerReplyTimestamp ?? '');
        const baseline = consumedAt > recommendationCreatedAt ? consumedAt : recommendationCreatedAt;
        return baseline === '' || latestTimestamp > baseline ? latestReply : null;
      }

      function latestCustomerReplyTimestamp() {
        const latestReply = latestCustomerReply();
        return latestReply === null ? null : String(latestReply.timestamp ?? '');
      }

      function isTaskDoneWaitingForReply() {
        const summary = state.selectedTicket?.recommendationSummary ?? {};
        const sent = isCurrentRecommendationSent() ||
          (summary.hasSentResponse === true && summary.latestRecommendationId === state.recommendation?.id);
        return state.recommendation !== null &&
          isApprovedWorkflow() &&
          sent &&
          latestUnconsumedCustomerReply() === null;
      }

      function isCurrentRecommendationSent() {
        const recommendationId = state.recommendation?.id ?? state.selectedTicket?.recommendationSummary?.latestRecommendationId;
        if (recommendationId === undefined) {
          return false;
        }
        return isCurrentRecommendationSentFor(recommendationId);
      }

      function isCurrentRecommendationSentFor(recommendationId) {
        const exactTimelineMatch = Array.isArray(state.conversationTimeline) && state.conversationTimeline.some(function (item) {
          return item.kind === 'support-response-sent' && item.recommendationId === recommendationId;
        });
        if (exactTimelineMatch) {
          return true;
        }
        const summary = state.selectedTicket?.recommendationSummary ?? {};
        return summary.hasSentResponse === true && summary.latestRecommendationId === recommendationId;
      }

      function renderPreviousRecommendations() {
        if (!Array.isArray(state.recommendationHistory) || state.recommendationHistory.length <= 1) {
          return '';
        }
        return '<details aria-label="recommendationHistory"><summary>Previous recommendations</summary>' +
          state.recommendationHistory.slice(1).map(function (recommendation) {
            return '<div class="card description">' +
              '<strong>' + escapeHtml(recommendation.createdAt ?? 'unknown time') + ' · ' + escapeHtml(recommendation.resolution ?? 'unknown') + '</strong>' +
              '<p>' + escapeHtml(previewRecommendationDraft(recommendation.draftCustomerResponse)) + '</p>' +
            '</div>';
          }).join('') +
        '</details>';
      }

      function renderRecommendationChangeSummary(recommendation) {
        if (!Array.isArray(state.recommendationHistory) || state.recommendationHistory.length < 2) {
          return '';
        }
        const previous = state.recommendationHistory[1];
        const changes = [];
        if (previous.category !== recommendation.category) {
          changes.push('Category: ' + previous.category + ' -> ' + recommendation.category);
        }
        if (previous.team !== recommendation.team) {
          changes.push('Team: ' + previous.team + ' -> ' + recommendation.team);
        }
        if (previous.priority !== recommendation.priority) {
          changes.push('Priority: ' + previous.priority + ' -> ' + recommendation.priority);
        }
        if (previous.supportState !== recommendation.supportState) {
          changes.push('State: ' + (previous.supportState ?? 'not assessed') + ' -> ' + (recommendation.supportState ?? 'not assessed'));
        }
        if (changes.length === 0) {
          return '';
        }
        return '<section class="card description"><strong>What changed</strong><ul>' +
          changes.map(function (change) { return '<li>' + escapeHtml(change) + '</li>'; }).join('') +
          '</ul></section>';
      }

      function previewRecommendationDraft(value) {
        const text = String(value ?? '');
        return text.length > 160 ? text.slice(0, 157) + '...' : text;
      }

      function updateControls() {
        const hasRecommendation = state.recommendation !== null;
        const approvedWorkflow = isApprovedWorkflow();
        const actorPresent = els.actor.value.trim().length > 0;
        const fields = selectedFields();
        const hasFields = fields.length > 0;
        const confirmed = true;
        const customerResponseReady =
          !fields.includes('customerResponse') ||
          els.editedCustomerResponse.value.trim().length > 0;
        const feedbackPresent = els.feedback.value.trim().length > 0;

        const doneReady = hasRecommendation &&
          actorPresent &&
          (
            (!approvedWorkflow && confirmed && hasFields && customerResponseReady) ||
            (approvedWorkflow && shouldShowMarkSentAction())
          );
        els.approveButton.disabled = !doneReady;
        els.approveEditedButton.disabled = els.approveButton.disabled;
        els.rejectButton.disabled = !(hasRecommendation && !approvedWorkflow && actorPresent && feedbackPresent);
        els.startRejectButton.disabled = !(hasRecommendation && !approvedWorkflow && actorPresent);
        els.markSentButton.disabled = !(hasRecommendation && approvedWorkflow && actorPresent && shouldShowMarkSentAction());
        els.diagnoseButton.disabled = !(actorPresent && shouldShowDiagnoseAction());
        els.fixButton.disabled = !(actorPresent && shouldShowFixAction());
        els.closeTicketButton.disabled = !(actorPresent && shouldShowCloseTicketAction());
        els.createRecommendation.disabled = !canCreateRecommendation();
        els.createUpdatedRecommendation.disabled = !shouldShowCreateUpdatedRecommendation();
        els.createRecommendation.textContent = 'Evaluate';
        els.createRecommendation.title = createRecommendationLabel();
        els.createUpdatedRecommendation.textContent = createUpdatedRecommendationLabel();
        els.createUpdatedRecommendation.title = createRecommendationLabel();
      }

      async function loadQueue() {
        els.queueStatus.textContent = 'Loading queue...';
        const data = await requestJson('/api/tickets?limit=50');
        state.tickets = data.items ?? [];
        renderTicketList();
        setResult(data);
      }

      async function loadMetrics(actionResult) {
        const metrics = await requestJson('/api/metrics');
        setResult(actionResult === undefined ? metrics : { action: actionResult, metrics });
      }

      async function loadEvidence(writeErrorToResult) {
        const report = await requestJson('/api/evidence', undefined, { writeErrorToResult });
        renderEvidence(report);
      }

      async function refreshEvidenceBestEffort() {
        try {
          await loadEvidence(false);
        } catch (error) {
          renderEvidenceError(error);
        }
      }

      function renderEvidence(report) {
        const summary = report.summary ?? {};
        els.evidencePanel.innerHTML =
          card('Open tickets', formatEvidenceValue(summary.openTickets)) +
          card('Pending recommendations', formatEvidenceValue(summary.pendingRecommendations)) +
          card('Approved recommendations', formatEvidenceValue(summary.approvedRecommendations)) +
          card('Rejected recommendations', formatEvidenceValue(summary.rejectedRecommendations)) +
          card('Estimated minutes saved', formatEvidenceValue(summary.estimatedMinutesSaved)) +
          card('Audit events', formatEvidenceValue(summary.auditEvents)) +
          card('Safety blocks', formatEvidenceValue(summary.safetyBlocks)) +
          card('Active guardrails', formatEvidenceValue(summary.activeGuardrails));

        renderGuardrails(report.guardrails);
        renderActivity(report.recentActivity);
      }

      function renderEvidenceError(error) {
        const message = error instanceof Error ? error.message : 'Evidence refresh failed.';
        els.evidencePanel.innerHTML = '<p class="warning">Automation evidence could not be refreshed: ' + escapeHtml(message) + '</p>';
      }

      function renderGuardrails(guardrails) {
        if (!Array.isArray(guardrails) || guardrails.length === 0) {
          els.guardrailsPanel.innerHTML = '<p class="hint">No active guardrail evidence yet.</p>';
          return;
        }

        els.guardrailsPanel.innerHTML = guardrails
          .map(function (guardrail) {
            return '<div class="card description">' +
              '<strong>' + escapeHtml(guardrail.label ?? guardrail.id ?? 'Guardrail') + '</strong>' +
              '<span class="meta">' + escapeHtml(guardrail.id ?? 'unknown') + ' · ' + escapeHtml(guardrail.status ?? 'unknown') + '</span>' +
              '<p>' + escapeHtml(guardrail.evidence ?? 'No evidence recorded.') + '</p>' +
            '</div>';
          })
          .join('');
      }

      function renderActivity(activity) {
        if (!Array.isArray(activity) || activity.length === 0) {
          els.activityPanel.innerHTML = '<p class="hint">No recent automation activity yet.</p>';
          return;
        }

        els.activityPanel.innerHTML = activity
          .map(function (event) {
            const details = [
              event.ticketId === undefined ? null : 'ticket ' + event.ticketId,
              event.recommendationId === undefined ? null : 'recommendation ' + event.recommendationId
            ].filter(Boolean).join(' · ');
            return '<div class="card description">' +
              '<strong>' + escapeHtml(event.action ?? 'activity') + '</strong>' +
              '<span class="meta">' + escapeHtml(event.timestamp ?? 'unknown time') + ' · ' + escapeHtml(event.result ?? 'unknown result') + '</span>' +
              '<p>' + escapeHtml(details || 'No ticket or recommendation reference.') + '</p>' +
            '</div>';
          })
          .join('');
      }

      async function selectTicket(id) {
        const previousTicketId = state.selectedTicket?.id;
        const newSelection = previousTicketId !== id;
        const switchingTickets = previousTicketId !== undefined && previousTicketId !== id;
        const ticketRequestId = ++state.ticketRequestId;
        if (newSelection) {
          resetDiagnosisInteraction();
          state.diagnoses = [];
          state.diagnosisLoading = true;
          state.operatorGuidance = null;
          state.selectedTicket = null;
          state.recommendation = null;
          state.stage = 'empty';
          renderTicketList();
          renderTicket();
          renderConversationContext();
          renderRecommendation();
          els.diagnosisPanel.innerHTML = '<p class="hint">Loading diagnosis review...</p>';
        }
        if (switchingTickets) {
          state.consumedCustomerReplyTimestamp = null;
        }
        const knowledgeRequestId = ++state.knowledgeRequestId;
        state.knowledgeCandidate = null;
        state.knowledgeAdvisory = null;
        if (switchingTickets) {
          els.recommendationPanel.innerHTML =
            '<section class="hero-card description"><strong>Loading ticket...</strong>' +
            '<p>Refreshing the ticket and knowledge review state.</p></section>';
        }
        let data;
        try {
          data = await requestJson('/api/tickets/' + encodeURIComponent(id), undefined, {
            writeErrorToResult: false
          });
        } catch (error) {
          if (state.ticketRequestId === ticketRequestId) {
            state.diagnosisLoading = false;
            els.diagnosisPanel.innerHTML = '<p class="warning">Ticket could not be loaded: ' +
              escapeHtml(error instanceof Error ? error.message : 'Request failed.') + '</p>';
            setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
          }
          return;
        }
        if (state.ticketRequestId !== ticketRequestId) {
          return;
        }
        state.selectedTicket = data.recommendationSummary === undefined
          ? data.ticket
          : { ...data.ticket, recommendationSummary: data.recommendationSummary };
        state.operatorGuidance = data.operatorGuidance ?? null;
        void loadDiagnoses(id, ticketRequestId).catch(function (error) {
          if (isCurrentTicketRequest(id, ticketRequestId)) {
            state.diagnosisLoading = false;
            els.diagnosisPanel.innerHTML = '<p class="warning">Diagnosis review could not be loaded: ' +
              escapeHtml(error instanceof Error ? error.message : 'Request failed.') + '</p>';
            setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
          }
        });
        state.conversationTimeline = Array.isArray(data.conversationTimeline) ? data.conversationTimeline : [];
        state.recommendationHistory = Array.isArray(data.recommendationHistory) ? data.recommendationHistory : [];
        state.recommendation = data.latestRecommendation ?? null;
        void loadKnowledgeCandidate(id, knowledgeRequestId).then(function () {
          if (state.selectedTicket?.id === id && state.knowledgeRequestId === knowledgeRequestId) {
            renderRecommendation(true);
            renderRecommendationStageControls();
          }
        });
        state.stage = state.recommendation === null
          ? 'empty'
          : isApprovedWorkflow()
            ? 'approved'
            : 'draft';
        renderTicketList();
        renderTicket();
        renderConversationContext();
        renderRecommendation();
        setResult(data);
      }

      async function loadKnowledgeCandidate(ticketId, knowledgeRequestId, includeGpt) {
        try {
          const actor = els.actor.value.trim() || 'approval-desk';
          const data = await requestJson('/api/knowledge-candidates', {
            method: 'POST',
            body: JSON.stringify({ ticketId, actor, includeGpt: includeGpt === true })
          }, { writeErrorToResult: false });
          if (state.selectedTicket?.id !== ticketId || state.knowledgeRequestId !== knowledgeRequestId) return;
          state.knowledgeAdvisory = data.gptAdvisory ?? null;
          const candidates = Array.isArray(data.candidates) ? data.candidates : [];
          state.knowledgeCandidate = candidates.find(function (candidate) {
            return candidate.id === data.gptAdvisory?.candidateId;
          }) ?? candidates.find(function (candidate) {
            return candidate.deterministic?.meetsAlertThreshold === true;
          }) ?? null;
        } catch (_) {
          if (state.selectedTicket?.id === ticketId && state.knowledgeRequestId === knowledgeRequestId) {
            state.knowledgeCandidate = null;
            state.knowledgeAdvisory = null;
          }
        }
      }

      function knowledgeListValue(id) {
        return (document.getElementById(id)?.value ?? '').split(/\\r?\\n/).map(function (value) {
          return value.trim();
        }).filter(Boolean);
      }

      function knowledgeEdits() {
        const evidenceMode = document.getElementById('knowledgeEvidenceMode')?.value ?? 'none-required';
        return {
          name: document.getElementById('knowledgeName')?.value.trim() ?? '',
          summary: document.getElementById('knowledgeSummary')?.value.trim() ?? '',
          triggerPatterns: knowledgeListValue('knowledgeTriggerPatterns'),
          evidencePolicy: evidenceMode === 'required'
            ? { mode: 'required', evidenceIds: knowledgeListValue('knowledgeEvidenceIds') }
            : { mode: 'none-required' },
          timeConstraints: knowledgeListValue('knowledgeTimeConstraints'),
          diagnosticSteps: knowledgeListValue('knowledgeDiagnosticSteps'),
          fixSteps: knowledgeListValue('knowledgeFixSteps'),
          verificationSteps: knowledgeListValue('knowledgeVerificationSteps'),
          customerSafeExplanation: document.getElementById('knowledgeCustomerSafeExplanation')?.value.trim() ?? '',
          operatorRationale: document.getElementById('knowledgeOperatorRationale')?.value.trim() ?? '',
          owner: document.getElementById('knowledgeOwner')?.value.trim() ?? ''
        };
      }

      async function reviewKnowledgeCandidate(action) {
        const candidate = state.knowledgeCandidate;
        if (candidate === null) return;
        const actor = els.actor.value.trim();
        if (actor === '') {
          setResult({ error: 'An actor is required for knowledge review.' });
          return;
        }
        const path = '/api/knowledge-candidates/' + encodeURIComponent(candidate.id) + '/' + action;
        const body = { actor, expectedVersion: candidate.version };
        if (action === 'approve') {
          body.edits = knowledgeEdits();
        }
        if (action === 'reject') {
          const reason = document.getElementById('knowledgeRejectReason')?.value.trim() ?? '';
          if (reason === '') { setResult({ error: 'A rejection reason is required.' }); return; }
          body.reason = reason;
        }
        const data = await requestJson(path, { method: 'POST', body: JSON.stringify(body) });
        state.knowledgeCandidate = null;
        renderRecommendation(true);
        setResult(data);
      }

      async function createRecommendation() {
        if (state.selectedTicket === null) {
          return;
        }
        if (isApprovedAwaitingSend()) {
          setResult({ error: 'Mark the approved response as sent before creating a new recommendation for this ticket.' });
          return;
        }
        if (state.recommendation?.resolution === 'pending' && !hasCustomerReplyAfterCurrentRecommendation()) {
          const confirmed = confirm('This ticket already has a pending recommendation. Create a new one and mark the old one superseded?');
          if (!confirmed) {
            return;
          }
          await rejectCurrentRecommendation('Superseded by a new recommendation from the Approval Desk.');
          state.recommendation = null;
          state.stage = 'empty';
        }
        els.recommendationPanel.innerHTML = renderRecommendationLoadingCard();
        els.createRecommendation.disabled = true;
        try {
          const data = await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/recommendations', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk',
              responseStyle: els.draftStyle.value
            })
          });
          state.recommendation = data.recommendation;
          state.stage = 'draft';
          state.consumedCustomerReplyTimestamp = latestCustomerReplyTimestamp();
          markSelectedTicketWorkflow(data.recommendation, 'draft-ready');
          renderRecommendation();
          setResult(data);
          if (state.selectedTicket?.id !== undefined) {
            await selectTicket(state.selectedTicket.id);
          }
          await refreshEvidenceBestEffort();
        } catch (error) {
          renderRecommendationError(error);
          setResult({ error: error instanceof Error ? error.message : 'Recommendation failed.' });
        } finally {
          els.createRecommendation.disabled = false;
        }
      }

      async function approveRecommendation() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        const approvedFields = selectedFields();
        const body = {
          ticketId: state.selectedTicket.id,
          expectedRevision: state.recommendation.sourceRevision,
          approvedFields,
          actor: els.actor.value.trim(),
          confirm: true
        };
        if (approvedFields.includes('customerResponse')) {
          body.editedCustomerResponse = els.editedCustomerResponse.value.trim();
        }
        const fieldOverrides = collectFieldOverrides(approvedFields);
        if (Object.keys(fieldOverrides).length > 0) {
          body.fieldOverrides = fieldOverrides;
        }
        const approvedRecommendation = state.recommendation;
        const data = await requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/approve', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        state.recommendation = { ...approvedRecommendation, resolution: 'approved' };
        state.stage = 'approved';
        state.selectedTicket = withRecommendationSummary(data.ticket, state.recommendation, 'draft-ready');
        replaceTicket(state.selectedTicket);
        resetApprovalControls();
        renderTicket();
        renderTicketList();
        renderRecommendation();
        await loadMetrics(data);
        await refreshEvidenceBestEffort();
      }

      async function rejectRecommendation() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        const data = await rejectCurrentRecommendation(els.feedback.value.trim());
        markSelectedTicketActive();
        resetRecommendationState();
        renderTicket();
        renderTicketList();
        renderRecommendation();
        await loadMetrics(data);
        await refreshEvidenceBestEffort();
      }

      async function rejectCurrentRecommendation(feedback) {
        if (state.recommendation === null || state.selectedTicket === null) {
          throw new Error('No recommendation selected.');
        }
        return requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/reject', {
          method: 'POST',
          body: JSON.stringify({
            ticketId: state.selectedTicket.id,
            actor: els.actor.value.trim(),
            feedback
          })
        });
      }

      async function cancelApprovedRecommendation() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        const data = await requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/cancel-approval', {
          method: 'POST',
          body: JSON.stringify({
            ticketId: state.selectedTicket.id,
            actor: els.actor.value.trim() || 'approval-desk',
            reason: 'Approval canceled from the Approval Desk before creating a replacement recommendation.'
          })
        });
        markSelectedTicketActive();
        state.recommendation = null;
        state.stage = 'empty';
        resetApprovalControls();
        renderTicket();
        renderTicketList();
        renderRecommendation();
        await loadMetrics(data);
        await refreshEvidenceBestEffort();
      }

      async function completeTask() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        const recommendationToComplete = state.recommendation;
        const ticketId = state.selectedTicket.id;
        const actor = els.actor.value.trim() || 'approval-desk';
        if (!isApprovedWorkflow()) {
          const approvedFields = selectedFields();
          const body = {
            ticketId,
            expectedRevision: recommendationToComplete.sourceRevision,
            approvedFields,
            actor,
            confirm: true
          };
          if (approvedFields.includes('customerResponse')) {
            body.editedCustomerResponse = els.editedCustomerResponse.value.trim();
          }
          const fieldOverrides = collectFieldOverrides(approvedFields);
          if (Object.keys(fieldOverrides).length > 0) {
            body.fieldOverrides = fieldOverrides;
          }
          const approvalData = await requestJson('/api/recommendations/' + encodeURIComponent(recommendationToComplete.id) + '/approve', {
            method: 'POST',
            body: JSON.stringify(body)
          });
          state.recommendation = { ...recommendationToComplete, resolution: 'approved' };
          state.stage = 'approved';
          state.selectedTicket = withRecommendationSummary(approvalData.ticket, state.recommendation, 'draft-ready');
          replaceTicket(state.selectedTicket);
          resetApprovalControls();
        }
        if (!isCurrentRecommendationSentFor(recommendationToComplete.id)) {
          const sentData = await requestJson('/api/recommendations/' + encodeURIComponent(recommendationToComplete.id) + '/mark-sent', {
            method: 'POST',
            body: JSON.stringify({
              ticketId,
              actor,
              automaticReplyEnabled: els.automaticRepliesEnabled.checked
            })
          });
          els.replyComposer.open = false;
          els.replyTestingMode.open = false;
          setResult(sentData);
          await refreshSelectedTicketQueueAndEvidence();
          await loadMetrics(sentData);
          return;
        }
        renderTicket();
        renderTicketList();
        renderRecommendation();
      }

      async function markResponseSent() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        const data = await requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/mark-sent', {
          method: 'POST',
          body: JSON.stringify({
            ticketId: state.selectedTicket.id,
            actor: els.actor.value.trim() || 'approval-desk',
            automaticReplyEnabled: els.automaticRepliesEnabled.checked
          })
        });
        setResult(data);
        await refreshSelectedTicketQueueAndEvidence();
      }

      async function recordDiagnosis() {
        if (state.selectedTicket === null) {
          return;
        }
        const data = await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/diagnosis', {
          method: 'POST',
          body: JSON.stringify({
            actor: els.actor.value.trim() || 'approval-desk'
          })
        });
        setResult(data);
        await refreshSelectedTicketQueueAndEvidence();
      }

      async function recordFix() {
        if (state.selectedTicket === null) {
          return;
        }
        const data = await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/fix', {
          method: 'POST',
          body: JSON.stringify({
            actor: els.actor.value.trim() || 'approval-desk'
          })
        });
        setResult(data);
        await refreshSelectedTicketQueueAndEvidence();
      }

      async function closeTicket() {
        if (state.selectedTicket === null) {
          return;
        }
        const data = await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/close', {
          method: 'POST',
          body: JSON.stringify({
            actor: els.actor.value.trim() || 'approval-desk'
          })
        });
        setResult(data);
        await refreshSelectedTicketQueueAndEvidence();
      }

      async function persistDemoCustomerReply(value) {
        if (state.selectedTicket === null) {
          return;
        }
        await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/customer-replies', {
          method: 'POST',
          body: JSON.stringify({
            actor: els.actor.value.trim() || 'approval-desk',
            body: conversationScenarioBody(value),
            source: 'demo-scenario'
          })
        });
        await refreshSelectedTicketQueueAndEvidence();
      }

      async function addManualCustomerReply() {
        if (state.selectedTicket === null) {
          return;
        }
        const body = els.customerReplyBody.value.trim();
        if (body === '') {
          setResult({ error: 'Customer reply cannot be empty.' });
          return;
        }
        await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/customer-replies', {
          method: 'POST',
          body: JSON.stringify({
            actor: els.actor.value.trim() || 'approval-desk',
            body,
            source: 'manual'
          })
        });
        els.customerReplyBody.value = '';
        els.predictedReply.value = '';
        els.replyComposer.open = false;
        els.replyTestingMode.open = false;
        await refreshSelectedTicketQueueAndEvidence();
      }

      function hasCustomerReplyAfterCurrentRecommendation() {
        if (state.recommendation?.createdAt === undefined) {
          return false;
        }
        return Array.isArray(state.conversationTimeline) && state.conversationTimeline.some(function (item) {
          return item.kind === 'customer-reply' && String(item.timestamp ?? '') > state.recommendation.createdAt;
        });
      }

      async function refreshSelectedTicketQueueAndEvidence() {
        const selectedId = state.selectedTicket?.id;
        if (selectedId !== undefined) {
          await selectTicket(selectedId);
        }
        await loadQueue();
        await refreshEvidenceBestEffort();
      }

      function resetRecommendationState() {
        state.recommendation = null;
        state.stage = 'empty';
        resetApprovalControls();
      }

      function resetApprovalControls() {
        state.approvedFields = [];
        els.confirmApproval.checked = false;
        els.feedback.value = '';
        clearApprovalInputs();
        renderFieldApprovalButtons();
      }

      function populateApprovalInputs(recommendation) {
        els.categoryOverride.value = recommendation.category;
        els.priorityOverride.value = recommendation.priority;
        els.teamOverride.value = recommendation.team;
        els.assigneeOverride.value = recommendation.assignee === undefined ? '' : String(recommendation.assignee ?? '');
        els.statusOverride.value = recommendation.ticketStatus ?? '';
        els.tagsOverride.value = Array.isArray(recommendation.tags) ? recommendation.tags.join(', ') : '';
        renderFieldApprovalButtons();
      }

      function clearApprovalInputs() {
        els.categoryOverride.value = '';
        els.priorityOverride.value = '';
        els.teamOverride.value = '';
        els.assigneeOverride.value = '';
        els.statusOverride.value = '';
        els.tagsOverride.value = '';
      }

      function collectFieldOverrides(approvedFields) {
        const overrides = {};
        if (approvedFields.includes('category') && els.categoryOverride.value.trim() !== state.recommendation.category) {
          overrides.category = els.categoryOverride.value.trim();
        }
        if (approvedFields.includes('priority') && els.priorityOverride.value.trim() !== state.recommendation.priority) {
          overrides.priority = els.priorityOverride.value.trim();
        }
        if (approvedFields.includes('team') && els.teamOverride.value.trim() !== state.recommendation.team) {
          overrides.team = els.teamOverride.value.trim();
        }
        if (approvedFields.includes('assignee')) {
          const assignee = els.assigneeOverride.value.trim();
          const proposed = state.recommendation.assignee === undefined ? '' : String(state.recommendation.assignee ?? '');
          if (assignee !== proposed) {
            overrides.assignee = assignee.length === 0 ? null : assignee;
          }
        }
        if (approvedFields.includes('status') && els.statusOverride.value.trim() !== (state.recommendation.ticketStatus ?? '')) {
          overrides.status = els.statusOverride.value.trim();
        }
        if (approvedFields.includes('tags')) {
          const tags = els.tagsOverride.value
            .split(',')
            .map(function (tag) { return tag.trim(); })
            .filter(Boolean);
          const proposedTags = Array.isArray(state.recommendation.tags) ? state.recommendation.tags : [];
          if (tags.join('\\n') !== proposedTags.join('\\n')) {
            overrides.tags = tags;
          }
        }
        return overrides;
      }

      function toggleFieldApproval(field) {
        state.approvedFields = state.approvedFields.includes(field)
          ? state.approvedFields.filter(function (approvedField) { return approvedField !== field; })
          : state.approvedFields.concat(field);
        renderFieldApprovalButtons();
        updateControls();
      }

      function renderFieldApprovalButtons() {
        for (const button of els.fieldChoices.querySelectorAll('.field-approve-button')) {
          const approved = state.approvedFields.includes(button.value);
          button.textContent = approved ? 'Cancel' : 'Approve';
          button.className = 'field-approve-button' + (approved ? ' danger' : '');
        }
      }

      function markSelectedTicketWorkflow(recommendation, workflowState) {
        if (state.selectedTicket === null) {
          return;
        }
        state.selectedTicket = withRecommendationSummary(state.selectedTicket, recommendation, workflowState);
        replaceTicket(state.selectedTicket);
        renderTicket();
        renderTicketList();
      }

      function markSelectedTicketActive() {
        if (state.selectedTicket === null) {
          return;
        }
        const ticket = { ...state.selectedTicket };
        delete ticket.recommendationSummary;
        state.selectedTicket = ticket;
        replaceTicket(ticket);
      }

      function isApprovedWorkflow() {
        return state.stage === 'approved' ||
          state.recommendation?.resolution === 'approved' ||
          state.selectedTicket?.recommendationSummary?.latestResolution === 'approved';
      }

      function withRecommendationSummary(ticket, recommendation, workflowState) {
        return {
          ...ticket,
          recommendationSummary: {
            workflowState,
            latestRecommendationId: recommendation.id,
            latestResolution: recommendation.resolution,
            hasPendingRecommendation: recommendation.resolution === 'pending',
            hasApprovedRecommendation: recommendation.resolution === 'approved',
            hasSentResponse: false,
            hasCustomerReply: false,
            category: recommendation.category,
            priority: recommendation.priority,
            team: recommendation.team,
            outageRisk: recommendation.outageRisk,
            securityRisk: recommendation.securityRisk,
            slaRisk: recommendation.slaRisk,
            escalationRequired: recommendation.escalationRequired
          }
        };
      }

      function replaceTicket(ticket) {
        state.tickets = state.tickets.map(function (item) {
          return item.id === ticket.id ? ticket : item;
        });
      }

      async function requestJson(path, init, options) {
        const response = await fetch(path, {
          headers: { 'content-type': 'application/json' },
          ...init
        });
        const data = await response.json();
        if (!response.ok) {
          if (options?.writeErrorToResult !== false) {
            setResult(data);
          }
          throw new Error(data.error?.message ?? 'Request failed.');
        }
        return data;
      }

      function card(label, value) {
        return '<div class="card"><strong>' + escapeHtml(label) + '</strong>' + escapeHtml(value) + '</div>';
      }

      function chip(value) {
        return '<span class="chip">' + escapeHtml(value) + '</span>';
      }

      function renderCurrentStateCard(recommendation) {
        const missing = Array.isArray(recommendation.missingEvidence) ? recommendation.missingEvidence : [];
        const evidenceState = missing.length === 0 ? 'complete' : missing.length + ' missing';
        return '<div class="hero-card current-state-card"><strong>Current state</strong>' +
          '<div class="chips">' +
            chip('Lifecycle: ' + (recommendation.supportState ?? 'not assessed')) +
            chip('Evidence: ' + evidenceState) +
            chip('Likely issue: ' + recommendation.category + ' / ' + recommendation.team) +
            chip('Draft source: ' + (recommendation.draftCustomerResponseSource ?? 'legacy')) +
          '</div>' +
          '<p class="hint">' + escapeHtml(recommendation.recommendedNextAction ?? 'Review the recommendation before approval.') + '</p>' +
          renderDraftStatusNote(recommendation) +
        '</div>';
      }

      function renderDraftStatusNote(recommendation) {
        const checks = Array.isArray(recommendation.draftCustomerResponseChecks)
          ? recommendation.draftCustomerResponseChecks
          : [];
        const fallback = checks.find(function (check) {
          return check.id === 'fallback-used' || check.label === 'Fallback used';
        });
        if (fallback === undefined) {
          return '<p class="meta">Draft completed through the configured provider and local validators.</p>';
        }
        return '<p class="warning"><strong>Fallback used</strong> ' + escapeHtml(fallback.message ?? 'The deterministic draft was used after provider validation.') + '</p>';
      }

      function renderRecommendationLoadingCard() {
        return '<div class="hero-card loading-card"><strong>Drafting recommendation...</strong>' +
          '<p class="hint">Creating a guarded recommendation from local ticket facts, conversation history, retrieved knowledge, and draft validators.</p>' +
          '<p class="meta">If GPT drafting is slow, the backend will fall back to deterministic wording instead of leaving the workflow blocked.</p>' +
        '</div>';
      }

      function renderRecommendationError(error) {
        const message = error instanceof Error ? error.message : 'Recommendation failed.';
        els.recommendationPanel.innerHTML =
          '<div class="hero-card warning-card"><strong>Recommendation failed</strong>' +
            '<p>' + escapeHtml(message) + '</p>' +
            '<p class="hint">Try again after checking the latest conversation context. The ticket has not been changed.</p>' +
          '</div>';
      }

      function renderClassifierEvidenceCard(recommendation) {
        const signals = Array.isArray(recommendation.classificationSignals)
          ? recommendation.classificationSignals
          : [];
        const summary =
          '<div class="classifier-summary" aria-label="Category: ' + escapeHtml(recommendation.category) + '; Priority: ' + escapeHtml(recommendation.priority) + '; Team: ' + escapeHtml(recommendation.team) + '; Confidence: ' + escapeHtml(String(recommendation.confidence)) + '">' +
            card('Category', recommendation.category) +
            card('Priority', recommendation.priority) +
            card('Team', recommendation.team) +
            card('Confidence', String(recommendation.confidence)) +
          '</div>';
        if (signals.length === 0) {
          return '<div class="hero-card classifier-card"><strong>Classifier evidence</strong>' +
            summary +
            '<p class="hint">No classifier signal snapshot stored for this recommendation.</p>' +
          '</div>';
        }
        const topChips = classifierTopChipLabels(signals)
          .map(chip)
          .join('');
        return '<div class="hero-card classifier-card"><strong>Classifier evidence</strong>' +
          summary +
          '<div class="chips">' + topChips + '</div>' +
          '<details><summary>Why this classification?</summary>' +
            renderClassifierSignalRows(signals) +
          '</details>' +
        '</div>';
      }

      function renderLifecycleSummaryCard(recommendation) {
        const provided = Array.isArray(recommendation.providedEvidence) ? recommendation.providedEvidence : [];
        const missing = Array.isArray(recommendation.missingEvidence) ? recommendation.missingEvidence : [];
        return '<div class="hero-card lifecycle-summary"><strong>Lifecycle summary</strong>' +
          '<div class="chips">' +
            chip('State: ' + (recommendation.supportState ?? 'not assessed')) +
            chip('Known cause: ' + (recommendation.knownCause ?? 'none')) +
            chip('Provided evidence: ' + provided.length) +
            chip('Missing evidence: ' + missing.length) +
          '</div>' +
          '<p class="hint">' + escapeHtml(recommendation.recommendedNextAction ?? 'Review the recommendation before approval.') + '</p>' +
          '<details><summary>Lifecycle evidence</summary>' +
            '<p class="meta"><strong>Provided</strong> ' + escapeHtml(formatEvidenceLabels(provided)) + '</p>' +
            '<p class="meta"><strong>Missing</strong> ' + escapeHtml(formatEvidenceLabels(missing)) + '</p>' +
          '</details>' +
        '</div>';
      }

      function classifierTopChipLabels(signals) {
        const labels = new Set();
        return signals
          .slice()
          .sort(function (left, right) {
            return classifierSignalRank(right) - classifierSignalRank(left);
          })
          .map(function (signal) {
            return classifierSignalLabel(signal);
          })
          .filter(function (label) {
            if (labels.has(label)) {
              return false;
            }
            labels.add(label);
            return true;
          })
          .slice(0, 3);
      }

      function renderClassifierEvidenceReference(recommendation) {
        const count = classificationSignalCount(recommendation);
        if (count === 0) {
          return '<div class="classifier-reference">' +
            '<span>' + escapeHtml('No classifier signal snapshot stored for this recommendation.') + '</span>' +
            '<button type="button" class="inline-review-button" data-action="review-classifier-evidence">Review</button>' +
          '</div>';
        }
        const label = count === 1
          ? 'Classification evidence available - 1 signal'
          : 'Classification evidence available - ' + count + ' signals';
        return '<div class="classifier-reference">' +
          '<span>' + escapeHtml(label) + '</span>' +
          '<button type="button" class="inline-review-button" data-action="review-classifier-evidence">Review</button>' +
        '</div>';
      }

      function classificationSignalCount(recommendation) {
        return Array.isArray(recommendation.classificationSignals)
          ? recommendation.classificationSignals.length
          : 0;
      }

      function renderClassifierSignalRows(signals) {
        const groups = [
          ['Customer text', signals.filter(function (signal) { return classifierSignalGroup(signal) === 'Customer text'; })],
          ['Submitted metadata', signals.filter(function (signal) { return classifierSignalGroup(signal) === 'Submitted metadata'; })],
          ['Safety rules', signals.filter(function (signal) { return classifierSignalGroup(signal) === 'Safety rules'; })],
          ['Known cause', signals.filter(function (signal) { return classifierSignalGroup(signal) === 'Known cause'; })],
          ['Other supporting rules', signals.filter(function (signal) { return classifierSignalGroup(signal) === 'Other supporting rules'; })]
        ];
        return groups
          .filter(function (entry) { return entry[1].length > 0; })
          .map(function (entry) {
            return '<section class="classifier-signal-group"><h4>' + escapeHtml(entry[0]) + '</h4>' +
              entry[1].map(renderClassifierSignalRow).join('') +
            '</section>';
          })
          .join('');
      }

      function renderClassifierSignalRow(signal) {
        return '<div class="classifier-signal-row">' +
          '<strong>' + escapeHtml(classifierSignalLabel(signal)) + ' · weight ' + escapeHtml(formatSignalWeight(signal.weight)) + '</strong>' +
          '<span>' + escapeHtml(signal.reason ?? 'No reason recorded.') + '</span>' +
          '<code>' + escapeHtml((signal.ruleId ?? 'unknown-rule') + ' -> ' + (signal.target ?? 'unknown-target')) + '</code>' +
        '</div>';
      }

      function classifierSignalGroup(signal) {
        const target = String(signal.target ?? '');
        const ruleId = String(signal.ruleId ?? '');
        if (target.startsWith('metadata:') || ruleId.startsWith('metadata-')) {
          return 'Submitted metadata';
        }
        if (target.startsWith('risk:') || target.startsWith('escalation:') || ruleId.startsWith('risk-') || ruleId.startsWith('escalation-')) {
          return 'Safety rules';
        }
        if (target.startsWith('knownCause:') || ruleId.startsWith('known-cause-')) {
          return 'Known cause';
        }
        if (target.startsWith('category:') || target.startsWith('team:') || target.startsWith('priority:')) {
          return 'Customer text';
        }
        return 'Other supporting rules';
      }

      function classifierSignalLabel(signal) {
        const target = String(signal.target ?? '');
        if (target.startsWith('risk:') || target.startsWith('escalation:')) {
          return 'Safety signal';
        }
        if (target.startsWith('knownCause:')) {
          return 'Known cause';
        }
        if (target.startsWith('disagreement:')) {
          return 'Metadata disagreement';
        }
        if (target.startsWith('metadata:')) {
          return 'Submitted metadata';
        }
        if (target.startsWith('category:')) {
          return 'Category reason';
        }
        if (target.startsWith('priority:')) {
          return 'Priority reason';
        }
        if (target.startsWith('team:')) {
          return 'Team reason';
        }
        if (target.startsWith('knowledge:')) {
          return 'Knowledge context';
        }
        return 'Supporting signal';
      }

      function classifierSignalRank(signal) {
        const target = String(signal.target ?? '');
        const base = Number(signal.weight ?? 0);
        if (target.startsWith('risk:') || target.startsWith('escalation:')) {
          return base + 10;
        }
        if (target.startsWith('knownCause:')) {
          return base + 8;
        }
        if (target.startsWith('category:') || target.startsWith('team:') || target.startsWith('priority:')) {
          return base + 5;
        }
        if (target.startsWith('disagreement:')) {
          return base + 4;
        }
        if (target.startsWith('metadata:')) {
          return base - 2;
        }
        return base;
      }

      function formatSignalWeight(value) {
        return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
      }

      function formatList(values) {
        return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'none';
      }

      function formatEvidenceValue(value) {
        return value === undefined || value === null ? 'unknown' : String(value);
      }

      function formatDuplicateCandidates(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
          return 'none';
        }
        return candidates
          .map(function (candidate) {
            return candidate.ticketId + ' (' + candidate.confidence + '): ' + candidate.evidence;
          })
          .join('\\n');
      }

      function formatDraftCheckSummary(checks) {
        if (!Array.isArray(checks) || checks.length === 0) {
          return 'none';
        }
        const warnings = checks.filter(function (check) { return check.status === 'warn'; }).length;
        return warnings === 0 ? checks.length + ' passed' : checks.length + ' checked, ' + warnings + ' warning(s)';
      }

      function formatDraftSafetyNarrative(recommendation) {
        const checks = recommendation.draftCustomerResponseChecks;
        const warnings = Array.isArray(checks)
          ? checks.filter(function (check) { return check.status === 'warn'; }).length
          : 0;
        if (recommendation.draftCustomerResponseSource === 'openai' && warnings === 0) {
          return 'GPT draft passed validator checks before reviewer approval.';
        }
        if (recommendation.draftCustomerResponseSource === 'fallback') {
          return 'Local fallback was used because the AI draft provider failed or validator checks warned.';
        }
        if (recommendation.draftCustomerResponseSource === 'deterministic') {
          return 'Deterministic local draft was generated without an external model call.';
        }
        return 'Draft is held for reviewer approval before any ticket update.';
      }

      function renderGptAssistCard(assist) {
        if (assist === undefined || assist === null) {
          return '';
        }
        return '<details class="description"><summary>GPT Assist</summary>' +
          '<div class="chips">' +
             chip('Source: ' + (assist.source ?? 'unknown')) +
             chip('Recommended: ' + (assist.recommendedTone ?? assist.tone ?? 'balanced')) +
             chip('Selected: ' + (assist.selectedTone ?? assist.tone ?? 'balanced')) +
             chip('Audience: ' + (assist.audience ?? 'merchant-admin')) +
             chip('Checks: ' + formatDraftCheckSummary(assist.checks)) +
          '</div>' +
          '<p class="meta"><strong>Tone reason</strong> ' + escapeHtml(assist.toneReason ?? 'Recommended from requester and ticket context.') + '</p>' +
          '<p class="meta"><strong>Likely missing info</strong> ' + escapeHtml(formatAssistList(assist.missingInfoSuggestions)) + '</p>' +
          '<p class="meta"><strong>Investigation steps</strong> ' + escapeHtml(formatAssistList(assist.investigationSteps)) + '</p>' +
          '<p class="meta">Advisory only. The customer response still requires reviewer approval.</p>' +
        '</details>';
      }

      function formatAssistList(values) {
        return Array.isArray(values) && values.length > 0 ? values.join(' | ') : 'none';
      }

      function formatEvidenceLabels(values) {
        return Array.isArray(values) && values.length > 0
          ? values.map(function (value) { return value.label ?? value.id; }).join(', ')
          : 'none';
      }

      function formatDraftChecks(checks) {
        if (!Array.isArray(checks) || checks.length === 0) {
          return 'none';
        }
        return checks
          .map(function (check) {
            return '[' + check.status + '] ' + check.label + ': ' + check.message;
          })
          .join('\\n');
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;');
      }

      function conversationScenarioBody(value) {
        const context = demoReplyContext();
        if (value === 'partial-evidence') {
          return evidenceReply(context, { mode: 'partial' });
        }
        if (value === 'complete-evidence') {
          return evidenceReply(context, { mode: 'complete' });
        }
        if (value === 'known-cause-evidence') {
          return knownCauseReply(context);
        }
        if (value === 'platform-fix-context') {
          return platformFixReply(context);
        }
        if (value === 'resolved-confirmation') {
          return 'This works now. The issue is resolved on our end.';
        }
        return vagueReply(context);
      }

      function demoReplyContext() {
        const recommendation = state.recommendation ?? {};
        const ticket = state.selectedTicket ?? {};
        const timelineText = Array.isArray(state.conversationTimeline)
          ? state.conversationTimeline
              .filter(function (item) { return item.kind === 'customer-reply'; })
              .map(function (item) { return String(item.body ?? ''); })
              .join('\\n')
              .toLowerCase()
          : '';
        const missingEvidence = Array.isArray(recommendation.missingEvidence)
          ? recommendation.missingEvidence
          : missingEvidenceFromRecommendation(recommendation);
        return {
          ticket,
          recommendation,
          missingEvidence,
          timelineText,
          searchableText: [
            ticket.subject,
            ticket.description,
            recommendation.category,
            recommendation.team,
            ...(Array.isArray(ticket.tags) ? ticket.tags : [])
          ].filter(Boolean).join(' ').toLowerCase()
        };
      }

      function missingEvidenceFromRecommendation(recommendation) {
        if (Array.isArray(recommendation.missingInformation) && recommendation.missingInformation.length > 0) {
          return recommendation.missingInformation.map(function (question, index) {
            return {
              id: 'missing-information-' + index,
              label: 'Missing information',
              customerQuestion: question
            };
          });
        }
        return [
          {
            id: 'problem-summary',
            label: 'Problem summary',
            customerQuestion: 'what you were trying to do, what happened, and where it happened'
          },
          {
            id: 'screenshot-or-error',
            label: 'Screenshot or error',
            customerQuestion: 'screenshot or exact message, if you can share one'
          }
        ];
      }

      function evidenceReply(context, options) {
        const remaining = remainingEvidence(context);
        const selected = options.mode === 'complete'
          ? remaining
          : remaining.slice(0, Math.min(2, remaining.length));
        if (selected.length === 0) {
          return 'I think I have already sent the details I can find. Please let me know if there is anything specific you still need me to check.';
        }
        const contextual = contextualEvidenceReply(context, selected);
        if (contextual !== null) {
          return contextual;
        }
        const sentences = selected.map(function (requirement) {
          return sampleEvidenceSentence(requirement, context);
        });
        return sentences.join(' ');
      }

      function contextualEvidenceReply(context, selected) {
        const ids = selected.map(function (requirement) {
          return String(requirement.id ?? '').toLowerCase();
        });
        function has(id) {
          return ids.includes(id);
        }
        function selectedSentence(id) {
          if (!has(id)) {
            return '';
          }
          return sampleEvidenceSentence({ id }, context);
        }
        function joinSentences(values) {
          return values.filter(function (value) { return value.trim() !== ''; }).join(' ');
        }

        if (context.searchableText.includes('track api') || context.searchableText.includes('timestamp')) {
          return joinSentences([
            'I checked the Track API example that is failing with the Europe/Helsinki timestamp.',
            selectedSentence('event-id'),
            selectedSentence('api-response-status'),
            selectedSentence('sample-payload')
          ]);
        }

        if (
          context.searchableText.includes('catalog') ||
          context.searchableText.includes('shopify') ||
          context.searchableText.includes('campaign product block')
        ) {
          return joinSentences([
            'I checked the Shopify catalog sync delay, and this is the product that still is not appearing in the campaign product block.',
            selectedSentence('store-url'),
            selectedSentence('object-id'),
            selectedSentence('catalog-sync-time'),
            selectedSentence('source-update-time'),
            selectedSentence('product-reference'),
            selectedSentence('expected-field')
          ]);
        }

        if (context.searchableText.includes('webhook') || context.searchableText.includes('signature')) {
          return joinSentences([
            'I checked the webhook delivery details for the failing endpoint.',
            selectedSentence('endpoint-url'),
            selectedSentence('delivery-id'),
            selectedSentence('failure-timestamp'),
            selectedSentence('signing-secret-rotation-time'),
            selectedSentence('timestamp-tolerance'),
            selectedSentence('endpoint-response-code'),
            selectedSentence('raw-body-change-status'),
            selectedSentence('retry-history')
          ]);
        }

        if (
          context.searchableText.includes('api key') ||
          context.searchableText.includes('private key') ||
          context.searchableText.includes('credential')
        ) {
          return joinSentences([
            'I checked the security details I can see without sharing the secret value.',
            selectedSentence('key-identifier'),
            selectedSentence('exposure-location'),
            selectedSentence('key-usage-status'),
            selectedSentence('rotation-status'),
            selectedSentence('audit-source'),
            selectedSentence('affected-scope')
          ]);
        }

        if (context.searchableText.includes('quiet-hour')) {
          return joinSentences([
            'This is about the SMS campaign that was blocked by quiet-hour protection.',
            selectedSentence('campaign-name'),
            selectedSentence('scheduled-send-time'),
            selectedSentence('recipient-region'),
            selectedSentence('compliance-banner')
          ]);
        }

        return null;
      }

      function remainingEvidence(context) {
        return context.missingEvidence.filter(function (requirement) {
          return !evidenceAlreadyMentioned(requirement, context.timelineText);
        });
      }

      function evidenceAlreadyMentioned(requirement, timelineText) {
        if (timelineText.trim() === '') {
          return false;
        }
        const id = String(requirement.id ?? '').toLowerCase();
        const markers = evidenceMarkers(id);
        if (markers.some(function (marker) { return timelineText.includes(marker); })) {
          return true;
        }
        const label = String(requirement.label ?? '').toLowerCase();
        return label !== '' && timelineText.includes(label);
      }

      function evidenceMarkers(id) {
        const markersById = {
          'affected-recipient-domains': ['recipient domains', 'gmail.com', 'outlook.com'],
          'audience-size': ['audience size', 'expected recipients', '2100'],
          'affected-scope': ['affected scope', 'affected profiles', '12 profiles'],
          'api-response-status': ['api response', 'response status', '400 validation'],
          'audit-source': ['audit source', 'source ip', '198.51.100.24'],
          'billing-account': ['billing account', 'workspace', 'account name'],
          'bounce-samples': ['bounce samples', 'bounce code', '550 5.1.1'],
          'browser-session-details': ['browser', 'session', 'signed out'],
          'campaign-name': ['campaign name', 'summer flash sale'],
          'catalog-sync-time': ['catalog sync time', 'last catalog sync'],
          'compliance-banner': ['compliance banner', 'quiet-hour protection'],
          'coupon-pool-name': ['coupon pool', 'summer-launch-2026'],
          'delivery-id': ['delivery id', 'deliv_7788'],
          'delivery-attempt-time': ['delivery attempt', '09:12 utc'],
          'endpoint-response-code': ['endpoint response code', 'http 401'],
          'endpoint-url': ['endpoint url', 'hooks.example.test'],
          'consent-timeline': ['consent timeline', 'opt-out history'],
          'error-banner': ['error banner', 'something went wrong'],
          'event-created-time': ['event creation time', 'source event creation'],
          'event-id': ['event id', 'evt_12345'],
          'expected-field': ['expected field', 'custom material field'],
          'exposure-location': ['log bundle', 'shared connector logs'],
          'failure-timestamp': ['failure timestamp', 'failed at'],
          'feature-description': ['feature request', 'would like', 'approval workflows'],
          'flow-id': ['flow id', 'browse abandonment'],
          'invoice-number': ['invoice number', 'invoice id', 'inv-2026'],
          'key-identifier': ['key identifier', 'last four'],
          'key-usage-status': ['key usage', 'used after exposure'],
          'masked-recipient': ['masked recipient', '+1 *** *** 0134'],
          'object-id': ['object id', 'sku-7788', 'order number'],
          'opt-out-timestamp': ['stop reply', 'opt-out timestamp'],
          'platform': ['shopify', 'magento', 'woocommerce', 'ecommerce platform'],
          'plan-or-promotion': ['plan', 'promotion', 'coupon', 'subscription'],
          'problem-summary': ['campaign editor', 'what happened', 'blank page'],
          'product-reference': ['product url', 'product id', 'cart url'],
          'profile-email': ['profile email', 'customer id', 'customer@example.test'],
          'raw-body-change-status': ['raw body handling', 'body parser'],
          'recipient-region': ['recipient region', 'us recipients'],
          'request-id': ['request id', 'req_12345'],
          'reproduction-steps': ['steps', 'opened', 'clicked'],
          'retry-history': ['retry history', 'eventually succeed'],
          'rotation-status': ['rotated', 'revoked'],
          'sample-payload': ['sample payload', 'payload'],
          'scheduled-send-time': ['scheduled send time', '8:30 pm'],
          'screenshot-or-error': ['screenshot', 'error message', 'page stayed blank'],
          'segment-name': ['segment name', 'engaged subscribers'],
          'sending-domain': ['sending domain', 'mail.example.test'],
          'signing-secret-rotation-time': ['signing secret', 'rotated'],
          'source-update-time': ['source update time', 'updated in shopify'],
          'store-url': ['store url', 'store.example.test'],
          'timestamp-tolerance': ['timestamp tolerance', 'five minutes'],
          'timeline-visibility': ['profile timeline', 'activity timeline'],
          'unused-coupon-status': ['unused coupon', 'codes remain available'],
          'use-case': ['use case', 'workflow', 'campaign launch review']
        };
        return markersById[id] ?? [id.replaceAll('-', ' ')];
      }

      function sampleEvidenceSentence(requirement, context) {
        const id = String(requirement.id ?? '').toLowerCase();
        const question = String(requirement.customerQuestion ?? requirement.label ?? 'the requested detail');
        const samples = {
          'affected-recipient-domains': 'The affected recipient domains I can see are gmail.com and outlook.com.',
          'audience-size': 'The expected audience size was about 2,100 profiles.',
          'affected-scope': 'The affected scope appears to be 12 profiles in the latest export.',
          'api-response-status': 'The API response status is 400 validation_error.',
          'audit-source': 'The audit source shown is IP 198.51.100.24.',
          'billing-account': 'The billing account is Demo Customer - US workspace.',
          'bounce-samples': 'A sample bounce code is 550 5.1.1 user unknown.',
          'browser-session-details': 'I use Chrome, and the page is still blank after signing out and back in.',
          'campaign-name': 'The campaign name is Summer Flash Sale.',
          'catalog-sync-time': 'The last catalog sync time I can see is 2026-06-10 09:20 UTC.',
          'compliance-banner': 'The dashboard banner says quiet-hour protection blocked delivery.',
          'coupon-pool-name': 'The coupon pool name is summer-launch-2026.',
          'delivery-id': 'The delivery ID is deliv_7788.',
          'delivery-attempt-time': 'The webhook delivery attempt time was 2026-06-10 09:12 UTC.',
          'endpoint-response-code': 'The endpoint response code is HTTP 401.',
          'endpoint-url': 'The endpoint URL is https://hooks.example.test/webhooks/orders.',
          'consent-timeline': 'The consent timeline shows the STOP reply, but the profile still appears eligible.',
          'error-banner': 'The error banner says "Something went wrong".',
          'event-created-time': 'The source event creation time was 2026-06-10 08:54 UTC.',
          'event-id': 'The event ID is evt_12345.',
          'expected-field': 'The expected custom field name is material.',
          'exposure-location': 'The key may have been shared in a connector log bundle attached to the ticket.',
          'failure-timestamp': 'The failure timestamp was 2026-06-10 09:15 UTC.',
          'feature-description': 'We would like reusable approval workflows for campaign launches.',
          'flow-id': 'The flow name is Browse Abandonment, flow ID flow_12345.',
          'invoice-number': 'The invoice number is INV-2026-1042.',
          'key-identifier': 'The key identifier ends in 4f8a; I am not sending the secret value.',
          'key-usage-status': 'I cannot see any post-exposure key usage in the audit view.',
          'masked-recipient': 'The masked recipient is +1 *** *** 0134.',
          'object-id': 'The affected object ID is sku-7788.',
          'opt-out-timestamp': 'The STOP reply timestamp was 2026-06-10 18:42 UTC.',
          'platform': platformSentence(context),
          'plan-or-promotion': 'The affected plan or promotion is the Summer Launch coupon campaign.',
          'problem-summary': 'I was trying to open the campaign editor, but the page stayed blank.',
          'product-reference': 'The product URL is https://store.example.test/products/linen-shirt.',
          'profile-email': 'One affected profile email is customer@example.test.',
          'raw-body-change-status': 'Raw body handling has not changed since yesterday.',
          'recipient-region': 'The recipient region is US.',
          'request-id': 'The request ID is req_12345.',
          'reproduction-steps': 'The steps were: I opened the campaign, clicked Edit, and then the page stayed blank.',
          'retry-history': 'The retry history shows the delivery eventually succeeded after three retries.',
          'rotation-status': 'The exposed key has been rotated and the old key was revoked.',
          'sample-payload': 'The redacted sample payload is {"event":"Checkout Started","timestamp":"2026-06-10T09:15:00Z","profile_id":"customer_123"}.',
          'scheduled-send-time': 'The scheduled send time was 8:30 PM US Eastern.',
          'screenshot-or-error': 'The message on screen says "Something went wrong"; I can attach a screenshot.',
          'segment-name': 'The segment name is Engaged Subscribers - 30 days.',
          'sending-domain': 'The sending domain is mail.example.test.',
          'signing-secret-rotation-time': 'We rotated the signing secret yesterday at 08:10 UTC.',
          'source-update-time': 'The source-system update time was 2026-06-10 07:30 UTC.',
          'store-url': 'The affected store URL is https://store.example.test.',
          'timestamp-tolerance': 'The timestamp tolerance configured for verification is five minutes.',
          'timeline-visibility': 'The event is still missing from the profile activity timeline.',
          'unused-coupon-status': 'Unused coupon codes remain available in the pool.',
          'use-case': 'The use case is letting a marketing manager review and approve campaign launch steps before send time.'
        };
        return samples[id] ?? ('For ' + question + ', the value I found is example detail for this ticket.');
      }

      function platformSentence(context) {
        if (context.searchableText.includes('shopify')) {
          return 'The ecommerce platform is Shopify.';
        }
        if (context.searchableText.includes('magento')) {
          return 'The ecommerce platform is Magento.';
        }
        if (context.searchableText.includes('woocommerce')) {
          return 'The ecommerce platform is WooCommerce.';
        }
        return 'The ecommerce platform is Shopify.';
      }

      function vagueReply(context) {
        if (context.searchableText.includes('track api') || context.searchableText.includes('timestamp')) {
          return 'The same Track API request still fails with a 400 timestamp validation error, but I am not sure which payload details you need.';
        }
        if (context.searchableText.includes('catalog') || context.searchableText.includes('shopify')) {
          return 'The Shopify catalog sync still looks delayed, and the new product still is not appearing in the campaign product block.';
        }
        if (context.searchableText.includes('webhook') || context.searchableText.includes('signature')) {
          return 'The webhook is still failing signature validation, but I am not sure which delivery details you need from the logs.';
        }
        if (context.searchableText.includes('api key') || context.searchableText.includes('private key')) {
          return 'I am still worried about the exposed key, but I am not sure which security details are safe to send.';
        }
        if (context.recommendation?.supportState === 'needs-information') {
          return 'It is still happening, but I am not sure where to find the details you asked for.';
        }
        return 'It is still happening on my side, but I do not have more details yet.';
      }

      function knownCauseReply(context) {
        if (context.searchableText.includes('webhook') || context.searchableText.includes('signature')) {
          const rotation = sampleEvidenceSentence({ id: 'signing-secret-rotation-time' }, context);
          const endpoint = evidenceAlreadyMentioned({ id: 'endpoint-url', label: 'Endpoint URL' }, context.timelineText)
            ? ''
            : ' ' + sampleEvidenceSentence({ id: 'endpoint-url' }, context);
          const delivery = evidenceAlreadyMentioned({ id: 'delivery-id', label: 'Delivery ID' }, context.timelineText)
            ? ''
            : ' ' + sampleEvidenceSentence({ id: 'delivery-id' }, context);
          const rawBody = evidenceAlreadyMentioned({ id: 'raw-body-change-status', label: 'Raw body handling changes' }, context.timelineText)
            ? ''
            : ' ' + sampleEvidenceSentence({ id: 'raw-body-change-status' }, context);
          return (rotation + endpoint + delivery + rawBody).trim();
        }
        if (context.searchableText.includes('quiet-hour')) {
          return 'The dashboard says quiet-hour protection blocked delivery, and the scheduled send time was 8:30 PM US Eastern.';
        }
        return evidenceReply(context, { mode: 'complete' });
      }

      function platformFixReply(context) {
        if (context.searchableText.includes('sms')) {
          return 'This is affecting US recipients, and the dashboard says quiet-hour protection blocked delivery.';
        }
        if (context.searchableText.includes('campaign') || context.searchableText.includes('audience')) {
          return 'This is affecting the campaign audience calculation, and the snapshot has been stuck for more than one hour.';
        }
        return 'This is affecting multiple EU stores. The affected store URL is https://eu-a.example.test. One affected customer ID is cus_8821. The event time was 2026-06-10 08:42 UTC. The request ID is req_1001 and the API response was 202 Accepted. The event is still missing from the profile activity timeline.';
      }

      els.actor.addEventListener('input', updateControls);
      els.addCustomerReply.addEventListener('click', function () {
        void addManualCustomerReply().catch(function (error) { setResult({ error: error.message }); });
      });
      els.backToRecommendation.addEventListener('click', function () {
        if (state.recommendation !== null) {
          state.stage = 'draft';
          renderRecommendation(true);
        }
      });
      els.cancelRejectButton.addEventListener('click', function () {
        if (state.recommendation !== null) {
          state.stage = 'draft';
          renderRecommendation(true);
        }
      });
      els.confirmApproval.addEventListener('change', updateControls);
      els.continueApproval.addEventListener('click', function () {
        if (state.recommendation !== null) {
          if (isApprovedWorkflow()) {
            void cancelApprovedRecommendation().catch(function (error) { setResult({ error: error.message }); });
          } else {
            state.stage = 'approval';
            renderRecommendation(true);
          }
        }
      });
      els.reviewDraftButton.addEventListener('click', function () {
        document.getElementById('customerResponseDraft')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      els.startRejectButton.addEventListener('click', function () {
        if (state.recommendation !== null && !isApprovedWorkflow()) {
          state.stage = 'reject';
          renderRecommendation(true);
        }
      });
      els.recommendationPanel.addEventListener('click', function (event) {
        if (event.target?.dataset?.action === 'review-classifier-evidence' && state.recommendation !== null) {
          state.stage = 'draft';
          renderRecommendation(true);
        }
        if (event.target?.dataset?.action === 'mark-sent' && state.recommendation !== null) {
          void markResponseSent().catch(function (error) { setResult({ error: error.message }); });
        }
        if (event.target?.dataset?.action === 'approve-knowledge') {
          void reviewKnowledgeCandidate('approve').catch(function (error) { setResult({ error: error.message }); });
        }
        if (event.target?.dataset?.action === 'draft-knowledge-with-gpt' && state.selectedTicket !== null) {
          const ticketId = state.selectedTicket.id;
          const requestId = ++state.knowledgeRequestId;
          void loadKnowledgeCandidate(ticketId, requestId, true).then(function () {
            if (state.selectedTicket?.id === ticketId && state.knowledgeRequestId === requestId) {
              renderRecommendation(true);
              renderRecommendationStageControls();
            }
          }).catch(function (error) { setResult({ error: error.message }); });
        }
        if (event.target?.dataset?.action === 'defer-knowledge') {
          void reviewKnowledgeCandidate('defer').catch(function (error) { setResult({ error: error.message }); });
        }
        if (event.target?.dataset?.action === 'reject-knowledge') {
          void reviewKnowledgeCandidate('reject').catch(function (error) { setResult({ error: error.message }); });
        }
      });
      els.diagnosisPanel.addEventListener('input', function (event) {
        const target = event.target;
        const draftField = target?.dataset?.diagnosisDraftField;
        if (draftField === 'customerSafeSummary' || draftField === 'recommendedNextAction') {
          const draft = diagnosisDraftForView(selectedDiagnosisView());
          if (draft !== null) {
            draft[draftField] = target.value;
          }
        }
        if (target?.dataset?.diagnosisReviewRationale === 'true') {
          state.diagnosisReviewRationale = target.value;
        }
        if (target?.dataset?.impactField === 'rationale') {
          state.diagnosisImpact.rationale = target.value;
        }
        const impactTicketId = target?.dataset?.impactTicketReason;
        if (impactTicketId !== undefined) {
          state.diagnosisImpact.ticketReasons = {
            ...state.diagnosisImpact.ticketReasons,
            [impactTicketId]: target.value
          };
        }
      });
      els.diagnosisPanel.addEventListener('change', function (event) {
        const target = event.target;
        const ticketId = target?.dataset?.impactTicket;
        if (ticketId === undefined) {
          return;
        }
        const selected = new Set(state.diagnosisImpact.selectedTicketIds);
        if (target.checked === true) {
          selected.add(ticketId);
        } else {
          selected.delete(ticketId);
        }
        state.diagnosisImpact.selectedTicketIds = Array.from(selected);
      });
      els.diagnosisPanel.addEventListener('click', function (event) {
        const action = event.target?.dataset?.action;
        if (action === 'select-diagnosis') {
          state.selectedDiagnosisId = event.target.dataset.diagnosisId;
          state.diagnosisDraft = null;
          state.diagnosisReviewRationale = '';
          state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
          state.diagnosisFixResults = [];
          renderDiagnosisPanel();
        }
        if (action === 'review-diagnosis') {
          void reviewSelectedDiagnosis(event.target.dataset.decision).catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'apply-diagnosis-fix') {
          void applySelectedDiagnosisFix().catch(function (error) { setResult({ error: error.message }); });
        }
      });
      els.conversationContextPanel.addEventListener('click', function (event) {
        if (event.target?.className?.includes('conversation-scenario')) {
          void persistDemoCustomerReply(event.target.value).catch(function (error) { setResult({ error: error.message }); });
        }
      });
      els.predictedReply.addEventListener('change', function () {
        if (els.predictedReply.value !== '') {
          els.customerReplyBody.value = conversationScenarioBody(els.predictedReply.value);
        }
      });
      els.editedCustomerResponse.addEventListener('input', updateControls);
      els.feedback.addEventListener('input', updateControls);
      for (const button of els.rejectControls.querySelectorAll('.quick-reason')) {
        button.addEventListener('click', function () {
          els.feedback.value = button.value;
          updateControls();
        });
      }
      for (const button of els.fieldChoices.querySelectorAll('.field-approve-button')) {
        button.addEventListener('click', function () {
          toggleFieldApproval(button.value);
        });
      }
      for (const button of els.queueFilters.querySelectorAll('.queue-filter')) {
        button.addEventListener('click', function () {
          setQueueFilter(button.value);
        });
      }
      els.refreshQueue.addEventListener('click', function () {
        void loadQueue()
          .then(refreshEvidenceBestEffort)
          .catch(function (error) { setResult({ error: error.message }); });
      });
      els.refreshEvidence.addEventListener('click', function () {
        void loadEvidence().catch(function (error) { setResult({ error: error.message }); });
      });
      els.createRecommendation.addEventListener('click', function () {
        void createRecommendation().catch(function (error) { setResult({ error: error.message }); });
      });
      els.createUpdatedRecommendation.addEventListener('click', function () {
        void createRecommendation().catch(function (error) { setResult({ error: error.message }); });
      });
      els.diagnoseButton.addEventListener('click', function () {
        void recordDiagnosis().catch(function (error) { setResult({ error: error.message }); });
      });
      els.fixButton.addEventListener('click', function () {
        void recordFix().catch(function (error) { setResult({ error: error.message }); });
      });
      els.closeTicketButton.addEventListener('click', function () {
        void closeTicket().catch(function (error) { setResult({ error: error.message }); });
      });
      els.approveButton.addEventListener('click', function () {
        void completeTask().catch(function (error) { setResult({ error: error.message }); });
      });
      els.approveEditedButton.addEventListener('click', function () {
        void completeTask().catch(function (error) { setResult({ error: error.message }); });
      });
      els.markSentButton.addEventListener('click', function () {
        void markResponseSent().catch(function (error) { setResult({ error: error.message }); });
      });
      els.rejectButton.addEventListener('click', function () {
        void rejectRecommendation().catch(function (error) { setResult({ error: error.message }); });
      });

      void Promise.all([
        loadQueue().then(loadMetrics),
        refreshEvidenceBestEffort()
      ])
        .catch(function (error) { setResult({ error: error.message }); });
      renderTicket();
      renderConversationContext();
      renderFieldApprovalButtons();
      updateControls();
    </script>
  </body>
</html>
`;
