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
        font-size: 0.9rem;
      }

      .diagnosis-panel textarea {
        min-height: 3.4rem;
        padding: 0.5rem 0.6rem;
      }

      .diagnosis-review-grid,
      .diagnosis-impact-list,
      .diagnosis-results {
        display: grid;
        gap: 0.45rem;
      }

      .diagnosis-panel .card {
        padding: 0.42rem 0.5rem;
      }

      .diagnosis-panel h4 {
        font-size: 0.88rem;
        margin: 0 0 0.35rem;
      }

      .diagnosis-panel p {
        margin: 0.28rem 0;
      }

      .diagnosis-collapsible {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 0.45rem 0.55rem;
      }

      .diagnosis-collapsible > summary {
        color: var(--ink);
        cursor: pointer;
        font-size: 0.82rem;
        font-weight: 800;
        list-style-position: outside;
      }

      .diagnosis-decision-actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.45rem;
      }

      .diagnosis-decision-actions button {
        font-size: 0.8rem;
        padding: 0.5rem 0.65rem;
      }

      .diagnosis-history-inline {
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        border-radius: 999px;
        color: #30438b;
        display: inline-flex;
        font-size: 0.7rem;
        font-weight: 800;
        gap: 0.25rem;
        margin-left: auto;
        min-width: max-content;
        padding: 0.35rem 0.55rem;
      }

      .diagnosis-fix-waiting {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 700;
        margin-left: auto;
      }

      .diagnosis-history-inline > summary {
        align-items: center;
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        border-radius: 999px;
        color: #30438b;
        cursor: pointer;
        display: inline-flex;
        font-size: 0.7rem;
        font-weight: 800;
        gap: 0.25rem;
        list-style: none;
        padding: 0.35rem 0.55rem;
      }

      .diagnosis-history-inline > summary::-webkit-details-marker {
        display: none;
      }

      .diagnosis-history-inline[open] {
        flex-basis: 100%;
        margin-left: 0;
      }

      .diagnosis-history-inline .diagnosis-history-body {
        border: 1px solid var(--line);
        border-radius: 0.6rem;
        color: var(--muted);
        margin-top: 0.35rem;
        padding: 0.45rem 0.6rem;
      }

      .diagnosis-summary-meta {
        color: var(--muted);
        display: block;
        font-size: 0.76rem;
        font-weight: 600;
        margin-top: 0.16rem;
      }

      .diagnosis-collapsible[open] > summary {
        margin-bottom: 0.45rem;
      }

      .diagnosis-panel .bar-actions {
        gap: 0.35rem;
        margin-top: 0.45rem;
      }

      .diagnosis-panel .bar-actions button {
        font-size: 0.8rem;
        padding: 0.5rem 0.65rem;
      }

      .diagnosis-phase-panel {
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 0.7rem;
        margin-top: 0.22rem;
        padding: 0.7rem;
      }

      .diagnosis-phase-panel > header {
        background: transparent;
        border-radius: 0;
        box-shadow: none;
        color: var(--ink);
        margin: 0 0 0.4rem;
        padding: 0;
      }

      .diagnosis-phase-panel > header {
        align-items: baseline;
        display: flex;
        gap: 0.45rem;
        justify-content: space-between;
        margin-bottom: 0.4rem;
      }

      .diagnosis-phase-panel > header h4 {
        color: var(--ink);
        font-size: 1.08rem;
        margin: 0;
      }

      .diagnosis-phase-panel > header .meta {
        font-size: 0.78rem;
      }

      .diagnosis-phase-panel .diagnosis-phase-actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.5rem;
      }

      .diagnosis-phase-panel .diagnosis-phase-actions button {
        font-size: 0.9rem;
        min-height: 2.35rem;
        padding: 0.55rem 0.82rem;
      }

      .diagnosis-status-chips {
        gap: 0.25rem;
        margin: 0.38rem 0 0.38rem;
      }

      .diagnosis-status-chips .chip {
        font-size: 0.7rem;
        padding: 0.18rem 0.42rem;
      }

      .diagnosis-theory-card {
        background: #fbfcff;
      }

      .diagnosis-theory-card h4,
      .diagnosis-phase-panel .card h4 {
        margin: 0 0 0.28rem;
      }

      .diagnosis-phase-panel textarea {
        font-size: 0.875rem;
        min-height: 2.8rem;
      }

      .diagnosis-phase-panel [data-diagnosis-draft-field] {
        min-height: 5.1rem;
      }

      .diagnosis-phase-panel [data-diagnosis-review-rationale] {
        min-height: 4.2rem;
      }

      .diagnosis-phase-panel .diagnosis-review-grid > .card > p:not(.meta) {
        font-size: 0.875rem;
        line-height: 1.35;
      }

      .diagnosis-inspection-grid label {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 700;
        gap: 0.25rem;
      }

      .diagnosis-inspection-grid textarea {
        font-weight: 400;
      }

      .diagnosis-inspection-grid {
        display: grid;
        gap: 0.65rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 0.35rem;
      }

      .diagnosis-inspection-intro {
        color: var(--muted);
        font-size: 0.84rem;
        line-height: 1.4;
        margin: 0 0 0.35rem;
      }

      .diagnosis-inspection-grid label:last-child {
        grid-column: 1 / -1;
      }

      .diagnosis-fix-panel {
        border-color: #c4b5fd;
        box-shadow: 0 4px 14px rgba(109, 40, 217, 0.08);
      }

      .diagnosis-fix-panel .diagnosis-impact-candidate {
        padding: 0.45rem;
      }

      .diagnosis-fix-panel .diagnosis-fix-diagnosis {
        color: #172033;
        font-size: 14.4px;
        line-height: 1.35;
        margin: 0 0 0.55rem;
      }

      .diagnosis-fix-panel .diagnosis-fix-action {
        color: #61708a;
        font-size: 13.4px;
        line-height: 1.4;
        margin: 0 0 0.55rem;
      }

      .diagnosis-fix-panel .diagnosis-fix-note {
        color: #61708a;
        font-size: 12.4px;
        line-height: 1.3;
        margin: 0 0 0.55rem;
      }

      .diagnosis-fix-panel .diagnosis-impact-candidate > strong {
        color: #61708a;
        font-size: 13.4px;
      }

      .diagnosis-fix-panel .diagnosis-fix-rationale {
        display: grid;
        gap: 0.25rem;
        margin-top: 0.4rem;
      }

      .diagnosis-fix-panel .diagnosis-fix-rationale-label {
        color: #172033;
        font-size: 14.4px;
        font-weight: 600;
      }

      .diagnosis-fix-panel .diagnosis-impact-candidate input,
      .diagnosis-fix-panel textarea {
        font-size: 0.86rem;
        font-weight: 400;
      }

      .diagnosis-fix-error {
        background: #fff1f2;
        border: 1px solid #fecdd3;
        border-radius: 0.55rem;
        color: #9f1239;
        font-size: 0.82rem;
        line-height: 1.35;
        margin: 0 0 0.55rem;
        padding: 0.45rem 0.55rem;
      }

      @media (max-width: 720px) {
        .diagnosis-inspection-grid {
          grid-template-columns: 1fr;
        }

        .diagnosis-inspection-grid label:last-child {
          grid-column: auto;
        }
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

      .workflow-action-stack[data-dock="bottom-left"] {
        left: 1rem;
        right: auto;
      }

      .workflow-action-stack[data-dock="bottom-center"] {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
      }

      .workflow-action-stack[data-dock="top-right"] {
        bottom: auto;
        top: 1rem;
      }

      .workflow-action-stack[data-dock="top-left"] {
        bottom: auto;
        left: 1rem;
        right: auto;
        top: 1rem;
      }

      .workflow-action-stack[data-dock="top-center"] {
        bottom: auto;
        left: 50%;
        right: auto;
        top: 1rem;
        transform: translateX(-50%);
      }

      .action-bar-position {
        align-items: center;
        display: flex;
        gap: 0.35rem;
        white-space: nowrap;
      }

      .action-bar-position label {
        color: var(--muted);
        font-size: 0.78rem;
      }

      .action-bar-position select {
        min-height: 2rem;
        padding: 0.3rem 0.45rem;
        width: auto;
      }

      .advanced-settings {
        border-top: 1px solid var(--line);
        margin-top: 0.65rem;
        padding-top: 0.55rem;
      }

      .advanced-settings > summary {
        color: var(--muted);
        cursor: pointer;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .advanced-settings-content {
        display: grid;
        gap: 0.65rem;
        margin-top: 0.65rem;
      }

      .advanced-setting-row {
        align-items: center;
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 10px;
        display: flex;
        gap: 0.65rem;
        justify-content: space-between;
        min-height: 2.3rem;
        padding: 0.35rem 0.55rem;
      }

      .advanced-setting-label {
        color: var(--ink);
        font-size: 0.8rem;
        font-weight: 700;
      }

      .advanced-setting-value {
        color: var(--muted);
        font-size: 0.78rem;
        text-align: right;
      }

      .advanced-settings-content .action-bar-position {
        justify-content: space-between;
      }

      .advanced-settings-content .advanced-setting-row button,
      .advanced-settings-content .advanced-setting-row select {
        flex: 0 0 auto;
        min-height: 1.9rem;
        padding: 0.28rem 0.55rem;
      }

      .advanced-settings-content .toggle-setting,
      .advanced-settings-content .action-bar-position label,
      .advanced-settings-content .reply-composer > label {
        color: var(--muted);
      }

      .advanced-settings-content .action-bar-position label {
        color: var(--ink);
        font-size: 0.8rem;
        font-weight: 700;
      }

      .advanced-settings-content .action-bar-position select {
        font-size: 0.8rem;
      }

      .advanced-settings-content .action-bar-position select,
      .advanced-settings-content .reply-composer > label select {
        color: var(--muted);
      }

      .advanced-settings-content .reply-composer > summary {
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
      }

      .advanced-settings-content .reply-composer {
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 10px;
        margin-top: -0.2rem;
      }

      .manual-replies-button {
        min-width: 4.6rem;
      }

      .advanced-settings-content .reply-mode {
        margin-top: 0;
      }

      .toggle-setting {
        align-items: center;
        display: flex;
        gap: 0.5rem;
        line-height: 1.35;
      }

      .toggle-setting input[type="checkbox"] {
        flex: 0 0 auto;
        margin: 0;
        width: 1rem;
      }

      .recommendation-setup-bar {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 18px 44px rgba(23, 32, 51, 0.18);
        padding: 0.7rem;
      }

      .pattern-action-bar {
        background: rgba(248, 247, 255, 0.98);
        border: 1px solid #c4b5fd;
        border-radius: 18px;
        box-shadow: 0 14px 34px rgba(79, 70, 229, 0.18);
        padding: 0.7rem;
      }

      .pattern-action-bar[hidden],
      .diagnosis-action-panel[hidden] {
        display: none;
      }

      .pattern-action-bar .knowledge-review-panel {
        box-shadow: none;
        margin-top: 0.55rem;
      }

      .candidate-editor,
      .candidate-rejection {
        border-top: 1px solid var(--line);
        margin-top: 0.65rem;
        padding-top: 0.55rem;
      }

      .candidate-editor > summary,
      .candidate-rejection > summary {
        color: var(--muted);
        cursor: pointer;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .candidate-editor > label,
      .candidate-editor details,
      .candidate-rejection label {
        display: block;
        margin-top: 0.55rem;
      }

      .candidate-editor textarea,
      .candidate-rejection textarea {
        min-height: 3.4rem;
      }

      .evidence-choice-list {
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem 0.7rem;
        margin-top: 0.55rem;
        padding: 0.55rem;
      }

      .evidence-choice-list label {
        align-items: center;
        color: var(--muted);
        display: inline-flex;
        font-size: 0.82rem;
        gap: 0.3rem;
      }

      .diagnosis-action-panel {
        border-top: 0;
        margin-top: 0;
        padding-top: 0;
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
        flex-wrap: wrap;
        gap: 0.65rem;
        justify-content: space-between;
      }

      .bar-topline .meta {
        flex: 1 1 12rem;
        min-width: 0;
        text-align: right;
      }

      .recommendation-setup-bar.phase-mode .bar-topline {
        display: none;
      }

      .knowledge-journey-bar {
        background: linear-gradient(135deg, #f5f3ff, #eef2ff);
        border: 1px solid #c4b5fd;
        border-radius: 16px;
        box-shadow: 0 10px 26px rgba(79, 70, 229, 0.14);
        margin-bottom: 0.55rem;
        padding: 0.65rem 0.75rem;
      }

      .pattern-action-bar {
        min-height: 0;
        position: static;
      }

      .knowledge-journey-rail {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        margin: 0;
        max-height: min(30rem, calc(100vh - 2rem));
        overflow-y: auto;
        padding: 0.65rem;
        position: absolute;
        right: calc(100% + 0.45rem);
        top: auto;
        bottom: 0;
        width: clamp(10.5rem, 18vw, 12rem);
      }

      .knowledge-journey-rail .knowledge-journey-header {
        display: block;
      }

      .knowledge-journey-rail .knowledge-journey-header strong,
      .knowledge-journey-rail .knowledge-journey-header span {
        display: block;
        font-size: 0.74rem;
        line-height: 1.2;
      }

      .knowledge-journey-rail .knowledge-journey-status,
      .knowledge-journey-rail #knowledgeJourneyStatus {
        margin-top: 0.2rem;
      }

      .knowledge-journey-rail .knowledge-journey-steps {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin-top: 0.35rem;
      }

      .knowledge-journey-rail .knowledge-journey-step {
        align-items: center;
        display: flex;
        font-size: 0.72rem;
        line-height: 1.25;
        min-height: 2.35rem;
        padding: 0.38rem 0.42rem;
      }

      .knowledge-journey-rail .bar-actions {
        margin-top: 0.3rem;
      }

      @media (max-width: 840px) {
        .knowledge-journey-rail {
          position: static;
          width: auto;
        }

        .knowledge-journey-rail .knowledge-journey-steps {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      .knowledge-journey-bar[hidden] {
        display: none;
      }

      .knowledge-journey-header {
        align-items: baseline;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: space-between;
      }

      .knowledge-journey-header strong {
        color: #4338ca;
      }

      .knowledge-journey-header span {
        color: var(--muted);
        font-size: 0.82rem;
      }

      .knowledge-journey-steps {
        display: grid;
        gap: 0.35rem;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        list-style: none;
        margin: 0.55rem 0 0;
        padding: 0;
      }

      .knowledge-journey-step {
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid #c7d2fe;
        border-radius: 10px;
        color: var(--muted);
        font-size: 0.72rem;
        line-height: 1.25;
        padding: 0.35rem 0.4rem;
      }

      .knowledge-journey-step.current {
        border-color: #6366f1;
        color: #3730a3;
        font-weight: 700;
      }

      .knowledge-journey-step.complete {
        background: #eefdf5;
        border-color: #86efac;
        color: #166534;
      }

      .knowledge-journey-bar .bar-actions {
        justify-content: flex-start;
        margin-top: 0.45rem;
      }

      #knowledgeDiscoveryStatus {
        flex: 0 1 auto;
        text-align: left;
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

      .diagnosis-history-selector {
        gap: 0.35rem;
        margin-top: 0.2rem;
      }

      .diagnosis-history-selector button {
        align-items: center;
        display: inline-flex;
        gap: 0.35rem;
        min-height: 2.35rem;
        padding: 0.55rem 0.7rem;
      }

      .diagnosis-history-selector button .meta {
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.7rem;
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

      .decision-timeline {
        margin-top: 0.75rem;
      }

      .decision-timeline-header,
      .decision-timeline-filters,
      .decision-milestone-meta {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .decision-timeline-header {
        justify-content: space-between;
      }

      .decision-timeline-header h3 {
        margin: 0;
      }

      .decision-timeline-filters {
        margin: 0.55rem 0;
      }

      .timeline-category-filter,
      .timeline-actor-filter {
        background: white;
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.76rem;
        padding: 0.24rem 0.48rem;
      }

      .timeline-category-filter.active,
      .timeline-actor-filter.active {
        background: var(--panel-soft);
        border-color: var(--accent);
        color: var(--accent-dark);
      }

      .decision-milestone {
        border-left-color: #7c3aed;
        padding: 0.65rem;
      }

      .decision-milestone p {
        margin: 0.35rem 0 0;
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
          <section class="card diagnosis-panel" aria-label="Diagnosis summary">
            <h3>Diagnosis summary</h3>
            <div id="diagnosisSummaryPanel">
              <p class="hint">Select a ticket to review recorded diagnoses.</p>
            </div>
          </section>
          <section class="card conversation-context" aria-label="Conversation Context">
            <h3>Conversation context</h3>
            <div id="conversationContextPanel">
              <p class="hint">Select a ticket to review conversation context.</p>
            </div>
          </section>
          <section id="decisionTimelinePanel" class="card decision-timeline" aria-label="Decision Timeline">
            <div class="decision-timeline-header">
              <h3>Decision Timeline</h3>
              <span class="meta">Read-only causal milestones</span>
            </div>
            <p class="hint">Select a ticket to inspect its persisted decision trail.</p>
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
          <div id="workflowActionStack" class="workflow-action-stack" data-dock="bottom-right">
            <section id="customerReplyFocus" class="customer-reply-focus" aria-label="Latest customer reply" hidden></section>
            <section id="workflowActionBar" class="recommendation-setup-bar" aria-label="Workflow actions">
              <input id="confirmApproval" type="checkbox" hidden checked>
              <div class="bar-topline">
                <h3 id="actionBarTitle">Evaluate ticket</h3>
                <span id="actionBarHint" class="meta">Uses the full conversation timeline.</span>
                <span id="knowledgeDiscoveryStatus" class="meta" aria-live="polite"></span>
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
                  <button id="closeTicketButton" type="button" class="secondary accent-action" title="Resolve ticket" hidden>Resolve</button>
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
              <section id="diagnosisActionPanel" class="diagnosis-action-panel" aria-label="Diagnosis workflow" hidden>
                <div id="diagnosisPanel">
                  <p class="hint">Select a ticket to review recorded diagnoses.</p>
                </div>
              </section>
              <details id="advancedSettings" class="advanced-settings">
                <summary>Advanced settings</summary>
                <div class="advanced-settings-content">
                  <div class="advanced-setting-row">
                    <span class="advanced-setting-label">Pattern discovery</span>
                    <span class="advanced-setting-value">Available after diagnosis review</span>
                  </div>
                  <div class="advanced-setting-row">
                    <span class="advanced-setting-label">Discover pattern</span>
                    <button id="discoverKnowledgeButton" type="button" class="secondary" title="Search for a reusable knowledge pattern">Discover</button>
                  </div>
                  <div class="advanced-setting-row action-bar-position">
                    <label for="actionBarPosition">Move action bar</label>
                    <select id="actionBarPosition" aria-label="Move action bar">
                      <option value="bottom-right">Bottom right</option>
                      <option value="bottom-left">Bottom left</option>
                      <option value="bottom-center">Bottom center</option>
                      <option value="top-left">Top left</option>
                      <option value="top-center">Top center</option>
                      <option value="top-right">Top right</option>
                    </select>
                  </div>
                  <div id="replyControls" class="bar-mode reply-mode advanced-setting-row" hidden>
                    <span class="advanced-setting-label">Customer Replies</span>
                    <button id="manualRepliesButton" type="button" class="secondary manual-replies-button">Manual</button>
                    <input id="disableAutomaticReplies" type="checkbox" aria-label="Enable manual customer replies" hidden>
                  </div>
                  <details id="replyComposer" class="reply-composer" hidden>
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
                          <button id="simulateConfirmationButton" type="button" class="secondary" title="Add a deterministic demo reply containing the confirmation signals for this ticket">Simulate confirmation</button>
                        </div>
                  </details>
                </div>
              </details>
            </section>
            <section id="knowledgeJourneyBar" class="knowledge-journey-bar knowledge-journey-rail" aria-label="Knowledge evolution journey" hidden>
              <div class="knowledge-journey-header">
                <strong>Knowledge evolution</strong>
                <span id="knowledgeJourneyStatus" aria-live="polite">Evaluate a ticket to begin.</span>
              </div>
              <ol id="knowledgeJourneySteps" class="knowledge-journey-steps"></ol>
              <div class="bar-actions">
                <button id="reviewKnowledgePatternButton" type="button" class="secondary" hidden>Review pattern</button>
              </div>
            </section>
            <section id="patternActionBar" class="pattern-action-bar" aria-label="Pattern actions" hidden>
              <div id="patternReviewPanel"></div>
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
        decisionTimeline: [],
        decisionTimelineCategory: 'all',
        decisionTimelineActor: 'all',
        recommendationHistory: [],
        consumedCustomerReplyTimestamp: null,
        knowledgeCandidate: null,
        knowledgeAdvisory: null,
        knowledgeDiscoveryStatus: '',
        knowledgeDiscoveryPending: false,
        knowledgeJourneyState: 'idle',
        knowledgeRequestId: 0,
        ticketRequestId: 0,
        ticketSelectionToken: 0,
        evaluationPendingTicketId: null,
        governedMutationToken: null,
        nextGovernedMutationToken: 0,
        operatorGuidance: null,
        lifecycle: null,
        diagnoses: [],
        diagnosisLoading: false,
        selectedDiagnosisId: null,
        diagnosisUiPhase: 'auto',
        diagnosisDraft: null,
        diagnosisDraftId: null,
        diagnosisReviewRationale: '',
        diagnosisReviewDecision: null,
        diagnosisReviewError: null,
        diagnosisImpact: { rationale: '', selectedTicketIds: [], ticketReasons: {} },
        diagnosisFixResults: [],
        diagnosisFixError: null,
        diagnosisFixPending: false,
        diagnosisMutationTokens: {}
      };

      const els = {
        addCustomerReply: document.getElementById('addCustomerReply'),
        simulateConfirmationButton: document.getElementById('simulateConfirmationButton'),
        actor: document.getElementById('actor'),
        actionBarPosition: document.getElementById('actionBarPosition'),
        actionBarHint: document.getElementById('actionBarHint'),
        actionBarTitle: document.getElementById('actionBarTitle'),
        advancedSettings: document.getElementById('advancedSettings'),
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
        discoverKnowledgeButton: document.getElementById('discoverKnowledgeButton'),
        knowledgeDiscoveryStatus: document.getElementById('knowledgeDiscoveryStatus'),
        knowledgeJourneyBar: document.getElementById('knowledgeJourneyBar'),
        knowledgeJourneyStatus: document.getElementById('knowledgeJourneyStatus'),
        knowledgeJourneySteps: document.getElementById('knowledgeJourneySteps'),
        manualRepliesButton: document.getElementById('manualRepliesButton'),
        reviewKnowledgePatternButton: document.getElementById('reviewKnowledgePatternButton'),
        customerReplyBody: document.getElementById('customerReplyBody'),
        customerReplyFocus: document.getElementById('customerReplyFocus'),
        decisionChips: document.getElementById('decisionChips'),
        decisionControls: document.getElementById('decisionControls'),
        decisionSummary: document.getElementById('decisionSummary'),
        decisionTimelinePanel: document.getElementById('decisionTimelinePanel'),
        diagnosisPanel: document.getElementById('diagnosisPanel'),
        diagnosisSummaryPanel: document.getElementById('diagnosisSummaryPanel'),
        diagnosisActionPanel: document.getElementById('diagnosisActionPanel'),
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
        disableAutomaticReplies: document.getElementById('disableAutomaticReplies'),
        markSentButton: document.getElementById('markSentButton'),
        queueFilters: document.getElementById('queueFilters'),
        queueStatus: document.getElementById('queueStatus'),
        predictedReply: document.getElementById('predictedReply'),
        recommendationPanel: document.getElementById('recommendationPanel'),
        patternActionBar: document.getElementById('patternActionBar'),
        patternReviewPanel: document.getElementById('patternReviewPanel'),
        priorityOverride: document.getElementById('priorityOverride'),
        refreshEvidence: document.getElementById('refreshEvidence'),
        refreshQueue: document.getElementById('refreshQueue'),
        rejectButton: document.getElementById('rejectButton'),
        rejectControls: document.getElementById('rejectControls'),
        replyComposer: document.getElementById('replyComposer'),
        replyControls: document.getElementById('replyControls'),
        resultPanel: document.getElementById('resultPanel'),
        reviewDraftButton: document.getElementById('reviewDraftButton'),
        setupControls: document.getElementById('setupControls'),
        startRejectButton: document.getElementById('startRejectButton'),
        statusOverride: document.getElementById('statusOverride'),
        tagsOverride: document.getElementById('tagsOverride'),
        teamOverride: document.getElementById('teamOverride'),
        ticketList: document.getElementById('ticketList'),
        ticketDetailsPanel: document.getElementById('ticketDetailsPanel'),
        ticketPanel: document.getElementById('ticketPanel'),
        workflowActionStack: document.getElementById('workflowActionStack'),
        workflowActionBar: document.getElementById('workflowActionBar')
      };

      const actionBarDocks = new Set(['bottom-right', 'bottom-left', 'bottom-center', 'top-left', 'top-center', 'top-right']);

      function setActionBarDock(position) {
        const dock = actionBarDocks.has(String(position)) ? String(position) : 'bottom-right';
        els.workflowActionStack.dataset.dock = dock;
        els.actionBarPosition.value = dock;
      }

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

      function adoptAuthoritativeWorkflow(value) {
        if (value === null || typeof value !== 'object') return;
        if (value.lifecycle !== undefined) {
          state.lifecycle = value.lifecycle;
          if (value.lifecycle.primaryAction?.kind === 'resolve-ticket') {
            els.closeTicketButton.hidden = false;
          }
        }
        if (value.operatorGuidance !== undefined) {
          state.operatorGuidance = value.operatorGuidance;
        }
      }

      function setResult(value) {
        adoptAuthoritativeWorkflow(value);
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
          const queueState = ticketQueueFilterState(ticket);
          const lifecycleClass = ticket.lifecycleSummary?.phase === undefined
            ? ''
            : ' lifecycle-' + ticket.lifecycleSummary.phase;
          button.className = 'ticket-button state-' + queueState + lifecycleClass +
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
          return ticketQueueFilterState(ticket) === state.queueFilter;
        });
      }

      function ticketWorkflowState(ticket) {
        if (ticket.lifecycleSummary?.phase !== undefined) {
          return ticket.lifecycleSummary.phase;
        }
        return ticket.recommendationSummary?.workflowState ?? 'active';
      }

      function ticketQueueFilterState(ticket) {
        const phase = ticket.lifecycleSummary?.phase;
        if (phase === undefined) {
          return ticket.recommendationSummary?.workflowState ?? 'active';
        }
        if (phase === 'evaluation-needed' && ticket.recommendationSummary?.hasCustomerReply === true) {
          return 'customer-replied';
        }
        if (phase === 'resolved') return 'resolved';
        if (phase === 'recommendation-review') return 'draft-ready';
        if (phase === 'waiting-for-customer') return 'waiting';
        return 'active';
      }

      function workflowStateLabel(value) {
        const lifecycleLabels = {
          'evaluation-needed': 'Evaluation needed',
          'recommendation-review': 'Recommendation review',
          'waiting-for-customer': 'Waiting for customer',
          'diagnosis-ready': 'Diagnosis ready',
          'diagnosis-review': 'Diagnosis review',
          'awaiting-confirmation': 'Awaiting confirmation',
          'awaiting-fix': 'Awaiting fix',
          'fix-ready': 'Fix ready',
          'verification': 'Verification',
          'ready-for-close': 'Ready to resolve',
          'escalated': 'Specialist review',
          'resolved': 'Closed'
        };
        if (lifecycleLabels[value] !== undefined) {
          return lifecycleLabels[value];
        }
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
          renderDecisionTimeline();
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
        renderDecisionTimeline();
        renderDiagnosisPanel();
      }

      function renderDecisionTimeline() {
        const entries = Array.isArray(state.decisionTimeline) ? state.decisionTimeline : [];
        const categories = Array.from(new Set(entries.map(function (entry) { return entry.category; }).filter(Boolean)));
        const actors = Array.from(new Set(entries.map(function (entry) { return entry.actor; }).filter(Boolean)));
        const visible = entries.filter(function (entry) {
          return (state.decisionTimelineCategory === 'all' || entry.category === state.decisionTimelineCategory) &&
            (state.decisionTimelineActor === 'all' || entry.actor === state.decisionTimelineActor);
        });
        const categoryFilters = ['all'].concat(categories).map(function (category) {
          return '<button type="button" class="chip timeline-category-filter' +
            (state.decisionTimelineCategory === category ? ' active' : '') +
            '" data-timeline-category="' + escapeHtml(category) + '">' +
            escapeHtml(category === 'all' ? 'All events' : titleCase(category)) + '</button>';
        }).join('');
        const actorFilters = ['all'].concat(actors).map(function (actor) {
          return '<button type="button" class="chip timeline-actor-filter' +
            (state.decisionTimelineActor === actor ? ' active' : '') +
            '" data-timeline-actor="' + escapeHtml(actor) + '">' +
            escapeHtml(actor === 'all' ? 'All actors' : actor) + '</button>';
        }).join('');
        els.decisionTimelinePanel.innerHTML =
          '<div class="decision-timeline-header"><h3>Decision Timeline</h3>' +
            '<span class="meta">' + escapeHtml(String(entries.length)) + ' causal milestone' + (entries.length === 1 ? '' : 's') + '</span></div>' +
          '<p class="hint">Read-only milestones ordered by persisted event sequence.</p>' +
          '<div class="decision-timeline-filters" aria-label="Timeline category filters">' + categoryFilters + '</div>' +
          '<div class="decision-timeline-filters" aria-label="Timeline actor filters">' + actorFilters + '</div>' +
          (visible.length === 0
            ? '<p class="meta">No decision milestones match these filters.</p>'
            : visible.map(renderDecisionMilestone).join(''));
      }

      function renderDecisionMilestone(entry) {
        const evidence = Array.isArray(entry.evidenceIds) && entry.evidenceIds.length > 0
          ? '<p class="meta">Evidence: ' + escapeHtml(entry.evidenceIds.join(', ')) + '</p>'
          : '';
        const missing = Array.isArray(entry.missingEvidenceIds) && entry.missingEvidenceIds.length > 0
          ? '<p class="meta">Missing: ' + escapeHtml(entry.missingEvidenceIds.join(', ')) + '</p>'
          : '';
        const approval = entry.approval === undefined
          ? ''
          : '<p class="meta">Approval: ' + escapeHtml(entry.approval.decision ?? 'recorded') +
            (Array.isArray(entry.approval.fields) && entry.approval.fields.length > 0
              ? ' · ' + escapeHtml(entry.approval.fields.join(', '))
              : '') + '</p>';
        const approvalReason = entry.approval?.reason === undefined
          ? ''
          : '<p class="meta">Approval reason: ' + escapeHtml(entry.approval.reason) + '</p>';
        const knowledgeObject = entry.knowledge?.object === undefined
          ? ''
          : '<p class="meta">Knowledge: ' + escapeHtml(entry.knowledge.object.objectId) +
            ' v' + escapeHtml(String(entry.knowledge.object.version)) + '</p>';
        const articles = Array.isArray(entry.knowledge?.articleIds) && entry.knowledge.articleIds.length > 0
          ? '<p class="meta">Articles: ' + escapeHtml(entry.knowledge.articleIds.join(', ')) + '</p>'
          : '';
        const reasons = Array.isArray(entry.reasons) && entry.reasons.length > 0
          ? entry.reasons
          : entry.reason === undefined ? [] : [entry.reason];
        const renderedReasons = reasons.length === 0
          ? ''
          : '<p class="meta">Reasons: ' + escapeHtml(reasons.join(' · ')) + '</p>';
        const outcome = '<p class="meta">Outcome: ' + escapeHtml(entry.outcome ?? 'unknown') + '</p>';
        const references = entry.references ?? {};
        const renderedReferences = [
          references.ticketRevision === undefined ? '' : 'Ticket revision: ' + String(references.ticketRevision),
          references.recommendationId === undefined ? '' : 'Recommendation: ' + references.recommendationId,
          references.diagnosisId === undefined ? '' : 'Diagnosis: ' + references.diagnosisId,
          references.messageId === undefined ? '' : 'Message: ' + references.messageId
        ].filter(Boolean).map(function (reference) {
          return '<p class="meta">' + escapeHtml(reference) + '</p>';
        }).join('');
        const fallback = entry.fallbackReason === undefined
          ? ''
          : '<p class="meta">Fallback: ' + escapeHtml(entry.fallbackReason) + '</p>';
        const telemetry = Array.isArray(entry.providerTelemetry) && entry.providerTelemetry.length > 0
          ? '<p class="meta">Provider: ' + entry.providerTelemetry.map(function (item) {
              return escapeHtml(item.provider + ' · ' + item.status +
                (item.latencyMs === undefined ? '' : ' · ' + item.latencyMs + 'ms'));
            }).join(', ') + '</p>'
          : '';
        return '<article class="card timeline-item decision-milestone ' + escapeHtml(entry.category ?? 'evaluation') + '">' +
          '<strong>' + escapeHtml(decisionTimelineLabel(entry.action)) + '</strong>' +
          '<div class="decision-milestone-meta"><span class="chip">' + escapeHtml(titleCase(entry.category ?? 'evaluation')) + '</span>' +
            '<span class="meta">#' + escapeHtml(String(entry.sequence ?? '?')) + ' · ' +
              escapeHtml(entry.occurredAt ?? 'unknown time') + ' · ' + escapeHtml(entry.actor ?? 'unknown actor') + '</span></div>' +
          outcome + renderedReasons + evidence + missing + approval + approvalReason +
          knowledgeObject + articles + renderedReferences + fallback + telemetry +
        '</article>';
      }

      function decisionTimelineLabel(action) {
        return String(action ?? 'decision milestone').split('-').map(titleCase).join(' ');
      }

      function titleCase(value) {
        const text = String(value ?? '');
        return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
      }

      function diagnosisRecordedTimestamp(candidate) {
        const recordedAt = candidate?.originalDiagnosis?.timestamp ??
          candidate?.originalDiagnosis?.occurredAt ??
          candidate?.originalDiagnosis?.createdAt;
        if (typeof recordedAt !== 'string' || recordedAt.trim() === '') {
          return 'recorded time unavailable';
        }
        const parsed = Date.parse(recordedAt);
        if (!Number.isFinite(parsed)) {
          return 'recorded time unavailable';
        }
        return new Date(parsed).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
      }

      function resetDiagnosisInteraction() {
        state.selectedDiagnosisId = null;
        state.diagnosisUiPhase = 'auto';
        state.diagnosisDraft = null;
        state.diagnosisDraftId = null;
        state.diagnosisReviewRationale = '';
        state.diagnosisReviewDecision = null;
        state.diagnosisReviewError = null;
        state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
        state.diagnosisFixResults = [];
        state.diagnosisFixError = null;
        state.diagnosisFixPending = false;
      }

      function selectedDiagnosisView() {
        if (!Array.isArray(state.diagnoses) || state.diagnoses.length === 0) {
          return null;
        }
        return state.diagnoses.find(function (view) {
          return view.originalDiagnosis?.id === state.selectedDiagnosisId;
        }) ?? state.diagnoses.at(-1) ?? null;
      }

      function latestDiagnosisView() {
        return Array.isArray(state.diagnoses) && state.diagnoses.length > 0
          ? state.diagnoses.at(-1)
          : null;
      }

      function isHistoricalDiagnosisView(view) {
        const latest = latestDiagnosisView();
        return view !== null && latest !== null &&
          view.originalDiagnosis?.id !== latest.originalDiagnosis?.id;
      }

      function isHistoricalDiagnosisSelection() {
        return isHistoricalDiagnosisView(selectedDiagnosisView());
      }

      function diagnosisNeedsFreshEvaluation(view) {
        return view?.stale === true && Array.isArray(view.staleReasons) &&
          view.staleReasons.includes('newer-customer-reply');
      }

      function diagnosisClarificationForView(view) {
        const current = diagnosisContextForView(view);
        const diagnosticState = String(
          current?.diagnosticState?.state ?? state.lifecycle?.diagnosticInvestigation?.state ?? '',
        );
        if (diagnosticState !== 'ambiguous' && diagnosticState !== 'escalated') {
          return null;
        }
        const lifecycleQuestions = state.lifecycle?.diagnosticInvestigation?.evidenceToRequest;
        const sourceQuestions = Array.isArray(current?.diagnosticState?.evidenceToRequest)
          ? current.diagnosticState.evidenceToRequest
          : lifecycleQuestions;
        const questions = Array.isArray(sourceQuestions)
          ? sourceQuestions.filter(function (question) {
              return String(question ?? '').trim() !== '';
            }).map(function (question) { return String(question); })
          : [];
        return {
          state: diagnosticState,
          questions,
          message: 'This diagnosis is ' + diagnosticState + ' and cannot be approved yet. Ask for the missing clarification, then evaluate the ticket again.'
        };
      }

      function canReevaluateCurrentDiagnosis() {
        const view = selectedDiagnosisView();
        if (hasLifecycleDescriptor()) {
          return state.selectedTicket !== null && lifecycleActionIsAvailable('evaluate-ticket');
        }
        return lifecycleActionIsAvailable('evaluate-ticket') ||
          view?.latestReview?.decision === 'reject' ||
          diagnosisClarificationForView(view) !== null ||
          diagnosisNeedsFreshEvaluation(view) ||
          latestUnconsumedCustomerReply() !== null;
      }

      function diagnosisNeedsResponseBeforeFix() {
        return latestUnevaluatedWorkflowEvent()?.kind === 'diagnosis';
      }

      function diagnosisBlockerText(current) {
        if (state.operatorGuidance?.reason !== undefined &&
            state.operatorGuidance.reason.trim() !== '') {
          return state.operatorGuidance.reason;
        }
        if (
          hasLifecycleDescriptor() &&
          state.lifecycle?.fix?.state === 'none' &&
          Array.isArray(state.lifecycle?.fix?.reasonCodes) &&
          state.lifecycle.fix.reasonCodes.includes('no-platform-fix-required') &&
          typeof current?.recommendedNextAction === 'string' &&
          current.recommendedNextAction.trim() !== ''
        ) {
          return current.recommendedNextAction;
        }
        if (current?.confidence !== 'confirmed') {
          return 'The likely diagnosis needs more evidence before a fix can be applied.';
        }
        if (diagnosisNeedsResponseBeforeFix()) {
          return 'Send the diagnosis update before applying a fix.';
        }
        return 'Waiting for an internal platform confirmation before applying the fix.';
      }

      function resetDiagnosisAfterCustomerReply() {
        state.diagnosisUiPhase = 'normal';
        state.diagnosisDraft = null;
        state.diagnosisDraftId = null;
        state.diagnosisReviewRationale = '';
        state.diagnosisReviewDecision = null;
        state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
      }

      function diagnosisContextForView(view) {
        const review = view?.latestReview;
        return review?.decision === 'approve' || review?.decision === 'revalidate'
          ? review.editedDiagnosis
          : view?.originalDiagnosis?.after?.diagnosis ?? null;
      }

      function isDiagnosisApproved(view) {
        return view?.stale !== true &&
          (view?.latestReview?.decision === 'approve' || view?.latestReview?.decision === 'revalidate');
      }

      function isCurrentTicketRequest(ticketId, requestId) {
        return state.ticketRequestId === requestId && state.selectedTicket?.id === ticketId;
      }

      function isCurrentTicketSelection(ticketId, selectionToken) {
        return state.ticketSelectionToken === selectionToken && state.selectedTicket?.id === ticketId;
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

      function isCurrentDiagnosisMutation(ticketId, diagnosisId, selectionToken, mutationToken) {
        return isCurrentTicketSelection(ticketId, selectionToken) &&
          state.diagnosisMutationTokens[diagnosisMutationKey(ticketId, diagnosisId)] === mutationToken;
      }

      function diagnosisDraftForView(view) {
        const diagnosisId = view?.originalDiagnosis?.id ?? null;
        if (state.diagnosisDraft !== null && state.diagnosisDraftId === diagnosisId) {
          return state.diagnosisDraft;
        }
        const source = diagnosisContextForView(view);
        if (source === null) {
          state.diagnosisDraft = null;
          state.diagnosisDraftId = null;
          return null;
        }
        state.diagnosisDraft = JSON.parse(JSON.stringify(source));
        state.diagnosisDraftId = diagnosisId;
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

      function diagnosisEmptyState() {
        return state.operatorGuidance?.requiredReview?.kind === 'diagnosis'
          ? '<p class="warning">Diagnosis state could not be loaded.</p>'
          : '<p class="hint">No recorded diagnoses are available for this ticket yet.</p>';
      }

      function diagnosisStatusChips(current) {
        const recommendation = state.recommendation ?? {};
        const ticket = state.selectedTicket ?? {};
        const values = [
          ['Category', current.category ?? recommendation.category ?? ticket.category],
          ['Priority', current.priority ?? recommendation.priority ?? ticket.priority],
          ['Team', current.team ?? recommendation.team ?? ticket.team],
          ['Cause', current.causeType],
          ['Confidence', current.confidence],
          ['Assessment', current.diagnosticState?.state],
          ['Owner', current.owner]
        ].filter(function (entry) { return entry[1] !== undefined && entry[1] !== null && String(entry[1]).trim() !== ''; });
        return '<div class="chips diagnosis-status-chips" aria-label="Diagnosis status">' +
          values.map(function (entry) { return chip(entry[0] + ': ' + String(entry[1])); }).join('') +
          '</div>';
      }

      function originalTheoryForDiagnosis(current) {
        const history = Array.isArray(state.recommendationHistory) ? state.recommendationHistory : [];
        const currentRecommendation = state.recommendation ?? history[0];
        if (currentRecommendation === undefined || history.length < 2) {
          return null;
        }
        const earlier = history.slice(1).find(function (recommendation) {
          return recommendation.category !== currentRecommendation.category ||
            recommendation.priority !== currentRecommendation.priority ||
            recommendation.team !== currentRecommendation.team;
        });
        if (earlier === undefined) {
          return null;
        }
        return earlier;
      }

      function renderDiagnosisPanel() {
        renderDiagnosisSummary();
        if (state.selectedTicket === null) {
          els.diagnosisActionPanel.hidden = true;
          els.diagnosisPanel.innerHTML = '<p class="hint">Select a ticket to review recorded diagnoses.</p>';
          return;
        }
        if (state.diagnosisLoading === true) {
          els.diagnosisActionPanel.hidden = true;
          els.diagnosisPanel.innerHTML = '<p class="hint">Loading diagnosis review...</p>';
          return;
        }
        const view = selectedDiagnosisView();
        if (view === null) {
          els.diagnosisActionPanel.hidden = true;
          els.diagnosisPanel.innerHTML = diagnosisEmptyState();
          return;
        }
        els.diagnosisActionPanel.hidden = false;
        const original = view.originalDiagnosis?.after?.diagnosis ?? {};
        const current = diagnosisContextForView(view) ?? {};
        const draft = diagnosisDraftForView(view) ?? {};
        const reviews = Array.isArray(view.reviews) ? view.reviews : [];
        const historicalDiagnosis = isHistoricalDiagnosisView(view);
        const staleReasons = Array.isArray(view.staleReasons) ? view.staleReasons : [];
        const diagnosisConfirmed = isDiagnosisApproved(view);
        const diagnosisRejected = view.latestReview?.decision === 'reject';
        const diagnosisClarification = diagnosisClarificationForView(view);
        const ticketId = state.selectedTicket.id;
        const selectedTicketIds = state.diagnosisImpact.selectedTicketIds ?? [];
        if (diagnosisConfirmed && !selectedTicketIds.includes(ticketId)) {
          state.diagnosisImpact = {
            ...state.diagnosisImpact,
            selectedTicketIds: [ticketId, ...selectedTicketIds]
          };
        }
        const sourceReason = state.diagnosisImpact.ticketReasons?.[ticketId] ?? '';
        const defaultFixRationale = 'The reviewed diagnosis applies to the source ticket.';
        const fixRationale = state.diagnosisImpact.rationale || sourceReason || defaultFixRationale;
        const selector = state.diagnoses.length > 1
          ? '<div class="quick-reasons diagnosis-history-selector" aria-label="Recorded diagnoses">' + state.diagnoses.map(function (candidate) {
              const candidateId = candidate.originalDiagnosis?.id ?? '';
              const diagnosisNumber = state.diagnoses.indexOf(candidate) + 1;
              const timestampLabel = diagnosisRecordedTimestamp(candidate);
              return '<button type="button" class="secondary" data-action="select-diagnosis" data-diagnosis-id="' + escapeHtml(candidateId) + '">' +
                '<span>Diagnosis ' + escapeHtml(String(diagnosisNumber)) + '</span><span class="meta">' + escapeHtml(timestampLabel) + '</span>' +
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
        const lifecycleRequiresDiagnosisReview = hasLifecycleDescriptor() &&
          ['review-diagnosis', 'revalidate-diagnosis'].includes(state.lifecycle?.primaryAction?.kind);
        const effectivePhase = state.diagnosisUiPhase === 'auto'
          ? (lifecycleRequiresDiagnosisReview ? 'diagnosis' : diagnosisConfirmed ? 'approved' : 'diagnosis')
          : state.diagnosisUiPhase;
        const history = '<span class="diagnosis-history-inline" data-diagnosis-section="review-history" title="Diagnosis review history">◷ Reviews · ' + reviews.length + '</span>';
        const originalTheory = originalTheoryForDiagnosis(current);
        const originalTheoryPanel = originalTheory === null
          ? ''
          : '<div class="card diagnosis-theory-card"><h4>Original theory</h4>' +
            diagnosisStatusChips({ category: originalTheory.category, priority: originalTheory.priority, team: originalTheory.team }) +
            '</div>';
        const historicalPhase = historicalDiagnosis
          ? '<section class="diagnosis-phase-panel diagnosis-history-view" data-diagnosis-phase="history" aria-label="Historical diagnosis" role="region">' +
            '<header><h4>Historical diagnosis</h4><span class="meta">Read-only</span></header>' +
            '<div class="card"><h4>Recorded diagnosis</h4>' +
              diagnosisStatusChips(current) +
              '<p>' + escapeHtml(current.customerSafeSummary ?? 'No diagnosis summary is available.') + '</p>' +
              '<p class="meta">This diagnosis is historical. The current lifecycle remains authoritative.</p></div>' +
            '<div class="diagnosis-phase-actions"><button type="button" class="secondary" data-action="back-to-current-diagnosis">Back to current diagnosis</button></div>' +
          '</section>'
          : '';
        const revalidateControl = !diagnosisRejected &&
          !diagnosisClarification &&
          lifecycleMutationAvailable('revalidate-diagnosis') &&
          (view.stale === true || reviews.length > 0 || state.operatorGuidance?.requiredReview?.kind === 'diagnosis')
          ? '<button type="button" class="secondary" data-action="open-diagnosis-inspection" data-review-decision="revalidate">Revalidate</button>'
          : '';
        const reEvaluateControl = diagnosisClarification !== null && lifecycleMutationAvailable('evaluate-ticket')
          ? '<button type="button" class="secondary" data-action="reopen-diagnosis-evaluation">Clarify</button>'
          : (diagnosisRejected || diagnosisNeedsFreshEvaluation(view)) && lifecycleMutationAvailable('evaluate-ticket')
            ? '<button type="button" class="secondary" data-action="reopen-diagnosis-evaluation">Re-evaluate</button>'
          : '';
        const diagnosisReviewError = state.diagnosisReviewError === null
          ? ''
          : '<p class="warning diagnosis-review-error" role="alert"><strong>Review could not be recorded.</strong> ' + escapeHtml(state.diagnosisReviewError) + '</p>';
        const diagnosisNextControl = diagnosisRejected || diagnosisNeedsFreshEvaluation(view) || diagnosisClarification !== null ||
          !lifecycleMutationAvailable('review-diagnosis')
          ? ''
          : '<button type="button" class="secondary" data-action="open-diagnosis-inspection">Review</button>';
        const diagnosisClarificationNotice = diagnosisClarification === null
          ? ''
          : '<div class="warning diagnosis-clarification" role="status"><strong>Approval is unavailable.</strong><p>' + escapeHtml(diagnosisClarification.message) + '</p>' +
            (diagnosisClarification.questions.length === 0
              ? ''
              : '<p><strong>Ask the customer:</strong></p><ul>' + diagnosisClarification.questions.map(function (question) {
                  return '<li>' + escapeHtml(question) + '</li>';
                }).join('') + '</ul>') +
            '</div>';
        const diagnosisPhase = !historicalDiagnosis && effectivePhase === 'diagnosis'
          ?
          '<section class="diagnosis-phase-panel" data-diagnosis-phase="diagnosis" aria-label="Diagnosis">' +
            '<header><h4>Diagnosis</h4><span class="meta">Review the diagnosis before continuing.</span></header>' +
            stale +
            diagnosisClarificationNotice +
            diagnosisReviewError +
            '<div class="diagnosis-review-grid">' +
              originalTheoryPanel +
              '<div class="card"><h4>Current diagnosis</h4>' +
                diagnosisStatusChips(current) +
                '<p>' + escapeHtml(current.customerSafeSummary ?? 'No current reviewed diagnosis is available.') + '</p>' +
                '<p class="meta">Evidence: ' + escapeHtml(Array.isArray(current.evidenceUsed) ? current.evidenceUsed.join(', ') : 'none recorded') + '</p>' +
                '<p class="meta">Workflow context: ' + escapeHtml(current.recommendedNextAction ?? 'No next action recorded.') + '</p>' +
                '<p class="meta">' + escapeHtml(customerReplyWatermarkLabel(view.sourceConversationWatermark)) + '</p></div>' +
            '</div>' +
              '<div class="diagnosis-phase-actions">' +
              '<button type="button" class="secondary" data-action="back-to-normal-action-bar">Back</button>' +
              reEvaluateControl +
              revalidateControl +
              diagnosisNextControl +
              history +
            '</div>' +
          '</section>'
          : '';
        const inspectionReviewKind = state.diagnosisReviewDecision === 'revalidate' ? 'revalidate-diagnosis' : 'review-diagnosis';
        const inspectionReviewAvailable = lifecycleMutationAvailable(inspectionReviewKind);
        const inspectionClarifyAvailable = lifecycleMutationAvailable('evaluate-ticket');
        const inspectionReviewControl = diagnosisClarification !== null || !inspectionReviewAvailable
          ? inspectionClarifyAvailable
            ? '<button type="button" class="secondary" data-action="reopen-diagnosis-evaluation">Clarify</button>'
            : '<span class="diagnosis-fix-waiting" role="status">' + escapeHtml(lifecycleActionReason('evaluate-ticket') || lifecycleActionReason(inspectionReviewKind) || 'No governed inspection action is available.') + '</span>'
          : '<button type="button" data-action="review-diagnosis" data-decision="' + (state.diagnosisReviewDecision === 'revalidate' ? 'revalidate' : 'approve') + '">' + (state.diagnosisReviewDecision === 'revalidate' ? 'Revalidate' : 'Approve') + '</button>';
        const inspectionRejectControl = diagnosisClarification !== null || !lifecycleMutationAvailable('reject-diagnosis')
          ? ''
          : '<button type="button" class="danger" data-action="review-diagnosis" data-decision="reject">Reject</button>';
        const inspectionIntro = current.confidence === 'confirmed'
          ? 'This diagnosis is confirmed. Inspect the drafted fields, review them, and approve to continue to the scoped fix.'
          : 'This diagnosis is likely, not confirmed. Review the drafted fields, then gather more evidence and evaluate again if the theory is not ready.';
        const inspectionPhase = !historicalDiagnosis && effectivePhase === 'inspection'
          ? '<section class="diagnosis-phase-panel" data-diagnosis-phase="inspection" aria-label="Inspection">' +
              '<header><h4>Inspection</h4><span class="meta">' + escapeHtml(diagnosisClarification === null ? 'Edit the fields, then approve or reject.' : 'Clarification is required before approval.') + '</span></header>' +
              '<p class="diagnosis-inspection-intro">' + escapeHtml(inspectionIntro) + '</p>' +
              diagnosisClarificationNotice +
              diagnosisReviewError +
              '<div class="diagnosis-inspection-grid">' +
                '<label>Customer-safe summary<textarea data-diagnosis-draft-field="customerSafeSummary">' + escapeHtml(draft.customerSafeSummary ?? '') + '</textarea></label>' +
                '<label>Recommended next action<textarea data-diagnosis-draft-field="recommendedNextAction">' + escapeHtml(draft.recommendedNextAction ?? '') + '</textarea></label>' +
                '<label>Review rationale<textarea data-diagnosis-review-rationale="true" placeholder="Required for reject or revalidate.">' + escapeHtml(state.diagnosisReviewRationale) + '</textarea></label>' +
              '</div>' +
              '<div class="diagnosis-phase-actions"><button type="button" class="secondary" data-action="back-to-diagnosis">Back</button>' + inspectionRejectControl + inspectionReviewControl + '</div>' +
            '</section>'
          : '';
        const confirmedDiagnosis = diagnosisConfirmed && current.confidence === 'confirmed';
        const diagnosisResponsePending = diagnosisNeedsResponseBeforeFix();
        const scopedFixReady = hasLifecycleDescriptor()
          ? lifecycleActionIsAvailable('apply-scoped-fix')
          : shouldShowFixAction();
        const fixAvailabilityReady = hasLifecycleDescriptor()
          ? lifecycleActionIsAvailable('record-fix-available')
          : shouldShowFixAction();
        const lifecycleApprovedNextControl = scopedFixReady
          ? '<button type="button" data-action="open-scoped-fix">Open Scoped Fix</button>'
          : fixAvailabilityReady
            ? '<button type="button" class="accent-action" data-action="record-fix-available">Fix</button>'
            : lifecycleActionIsAvailable('evaluate-ticket')
              ? '<button type="button" class="secondary" data-action="reopen-diagnosis-evaluation">Re-evaluate</button>'
              : '<span class="diagnosis-fix-waiting" role="status">' + escapeHtml(lifecycleActionReason('apply-scoped-fix') || lifecycleActionReason('record-fix-available') || lifecycleActionReason('evaluate-ticket') || 'No governed next action is available.') + '</span>';
        const legacyApprovedNextControl = scopedFixReady
          ? '<button type="button" data-action="open-scoped-fix">Open Scoped Fix</button>'
          : fixAvailabilityReady
            ? '<button type="button" class="accent-action" data-action="record-fix-available">Fix</button>'
            : canReevaluateCurrentDiagnosis()
              ? '<button type="button" class="secondary" data-action="reopen-diagnosis-evaluation">Re-evaluate</button>'
              : current.confidence !== 'confirmed'
                ? '<button type="button" class="secondary" data-action="simulate-confirmation">Simulate confirmation</button>'
                : diagnosisResponsePending
                  ? '<button type="button" class="secondary" data-action="prepare-diagnosis-response">Prepare response</button>'
                  : '<button type="button" class="accent-action" data-action="simulate-solution">Simulate solution</button>';
        const approvedNextControl = hasLifecycleDescriptor()
          ? lifecycleApprovedNextControl
          : legacyApprovedNextControl;
        const approvedPhase = !historicalDiagnosis && effectivePhase === 'approved'
          ? '<section class="diagnosis-phase-panel" data-diagnosis-phase="approved-diagnosis" aria-label="Approved diagnosis">' +
              '<header><h4>Approved diagnosis</h4><span class="meta">' + escapeHtml(confirmedDiagnosis ? 'Follow the next governed lifecycle step.' : 'More evidence is needed before a fix can be applied.') + '</span></header>' +
              diagnosisReviewError +
              '<div class="card diagnosis-approved-summary"><h4>Current diagnosis</h4>' +
                diagnosisStatusChips(current) +
                '<p>' + escapeHtml(current.customerSafeSummary ?? 'No approved diagnosis summary is available.') + '</p>' +
              '</div>' +
              '<div class="diagnosis-phase-actions"><button type="button" class="secondary" data-action="back-to-normal-action-bar">Back</button><button type="button" class="secondary" data-action="open-diagnosis-inspection">Edit</button>' +
                (shouldShowFixAction() ? '' : '<span class="diagnosis-fix-waiting" role="status">' + escapeHtml(current.confidence !== 'confirmed' && !canReevaluateCurrentDiagnosis() ? 'Waiting for confirmation. ' : '') + escapeHtml(diagnosisBlockerText(current)) + '</span>') +
                approvedNextControl +
                history + '</div>' +
            '</section>'
          : '';
        const results = Array.isArray(state.diagnosisFixResults) && state.diagnosisFixResults.length > 0
          ? '<section class="diagnosis-results" aria-label="Scoped fix results"><h4>Scoped fix results</h4>' +
            state.diagnosisFixResults.map(function (result) {
              return '<div class="card"><strong>' + escapeHtml(result.ticketId ?? 'Ticket') + ' · ' +
                escapeHtml(result.action ?? 'fix') + ' · ' + escapeHtml(result.result ?? 'recorded') + '</strong>' +
                '<p class="meta">Verification remains governed by the ticket workflow.</p></div>';
            }).join('') +
          '</section>'
          : '';
        const fixPhase = !historicalDiagnosis && effectivePhase === 'fix'
          ? '<section class="diagnosis-phase-panel diagnosis-fix-panel" data-diagnosis-phase="scoped-fix" aria-label="Scoped fix">' +
              '<header><h4>Scoped fix</h4><span class="meta">Apply the reviewed solution</span></header>' +
              '<p class="diagnosis-fix-diagnosis meta"><strong>Reviewed diagnosis:</strong> ' + escapeHtml(current.customerSafeSummary ?? 'No reviewed diagnosis summary.') + '</p>' +
              '<p class="diagnosis-fix-action">' + escapeHtml(current.recommendedNextAction ?? 'Apply the reviewed fix to the source ticket.') + '</p>' +
              '<p class="diagnosis-fix-note hint">The source ticket is included automatically. Related tickets appear only after governed discovery provides explicit candidates.</p>' +
              '<div class="diagnosis-impact-candidate"><strong>Source ticket: ' + escapeHtml(ticketId) + ' (included)</strong></div>' +
              '<label class="diagnosis-fix-rationale"><span class="diagnosis-fix-rationale-label">Why does this fix apply?</span><textarea data-impact-field="rationale" placeholder="Explain why the reviewed diagnosis applies to this ticket.">' + escapeHtml(fixRationale) + '</textarea></label>' +
              (state.diagnosisFixError === null ? '' : '<p class="diagnosis-fix-error" role="alert"><strong>Fix could not be applied.</strong> ' + escapeHtml(state.diagnosisFixError) + '</p>') +
              '<div class="diagnosis-phase-actions"><button type="button" class="secondary" data-action="back-to-approved-diagnosis">Back</button>' +
                (lifecycleMutationAvailable('apply-scoped-fix')
                  ? '<button type="button" class="accent-action" data-action="apply-diagnosis-fix"' + (state.diagnosisFixPending ? ' disabled' : '') + '>' + (state.diagnosisFixPending ? 'Applying…' : 'Fix') + '</button>'
                  : '<span class="diagnosis-fix-waiting" role="status">' + escapeHtml(lifecycleActionReason('apply-scoped-fix') || 'The scoped fix is not available in the current lifecycle state.') + '</span>') +
              '</div>' +
              results +
            '</section>'
          : '';
        els.diagnosisPanel.innerHTML = selector + historicalPhase + diagnosisPhase + inspectionPhase + approvedPhase + fixPhase;
        renderRecommendationStageControls();
      }

      function renderDiagnosisSummary() {
        if (els.diagnosisSummaryPanel === undefined) return;
        if (state.selectedTicket === null) {
          els.diagnosisSummaryPanel.innerHTML = '<p class="hint">Select a ticket to review recorded diagnoses.</p>';
          return;
        }
        if (state.diagnosisLoading === true) {
          els.diagnosisSummaryPanel.innerHTML = '<p class="hint">Loading diagnosis review...</p>';
          return;
        }
        const view = selectedDiagnosisView();
        if (view === null) {
          els.diagnosisSummaryPanel.innerHTML = diagnosisEmptyState();
          return;
        }
        const current = diagnosisContextForView(view) ?? {};
        const stale = view.stale === true
          ? '<p class="warning"><strong>Review required.</strong> ' + escapeHtml((view.staleReasons ?? []).map(safeStaleReason).join(' ')) + '</p>'
          : '';
        els.diagnosisSummaryPanel.innerHTML = stale +
          '<div class="chips">' +
            chip('Cause: ' + (current.causeType ?? 'unknown')) +
            chip('Confidence: ' + (current.confidence ?? 'unknown')) +
            chip('Owner: ' + (current.owner ?? 'unknown')) +
          '</div>' +
          '<p class="hint">' + escapeHtml(current.customerSafeSummary ?? 'No current reviewed diagnosis is available.') + '</p>' +
          '<p class="meta">Diagnosis actions and fix controls are in the Workflow Bar.</p>';
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
        const draft = decision === 'revalidate' && view?.latestReview !== null && view?.latestReview !== undefined
          ? JSON.parse(JSON.stringify(view.latestReview.editedDiagnosis))
          : diagnosisDraftForView(view);
        if (state.selectedTicket === null || view === null || draft === null) {
          state.diagnosisReviewError = 'The diagnosis review could not be prepared. Reload the ticket and try again.';
          renderDiagnosisPanel();
          return;
        }
        const clarification = diagnosisClarificationForView(view);
        const mutationKind = decision === 'reject'
          ? 'reject-diagnosis'
          : decision === 'revalidate'
            ? 'revalidate-diagnosis'
            : 'review-diagnosis';
        if (clarification !== null || !lifecycleMutationAvailable(mutationKind)) {
          state.diagnosisReviewError = clarification?.message ?? 'This diagnosis review action is not available in the current lifecycle state.';
          renderDiagnosisPanel();
          return;
        }
        const ticketId = state.selectedTicket.id;
        const diagnosisId = view.originalDiagnosis.id;
        const ticketSelectionToken = state.ticketSelectionToken;
        const mutationToken = beginDiagnosisMutation(ticketId, diagnosisId);
        const body = {
          decision,
          sourceTicketRevision: state.lifecycle?.current.ticketRevision ?? view.sourceTicketRevision,
          sourceConversationWatermark: state.lifecycle?.current.conversationWatermark ?? view.sourceConversationWatermark,
          editedDiagnosis: draft,
          actor: els.actor.value.trim() || 'approval-desk'
        };
        if (state.diagnosisReviewRationale.trim() !== '') {
          body.rationale = state.diagnosisReviewRationale.trim();
        }
        if (!hasLifecycleDescriptor()) {
          let data;
          try {
            data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses/' + encodeURIComponent(diagnosisId) + '/review', {
              method: 'POST',
              body: JSON.stringify(body)
            }, { writeErrorToResult: false });
          } catch (error) {
            if (isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketSelectionToken, mutationToken)) {
              state.diagnosisReviewError = error instanceof Error ? error.message : 'The diagnosis review request failed.';
              try {
                await refreshSelectedTicketQueueAndEvidence({ waitForDiagnoses: true });
              } catch (_) {
                // Preserve the inline domain failure when refresh reconciliation is unavailable.
              }
              renderDiagnosisPanel();
              setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
            }
            return;
          }
          if (!isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketSelectionToken, mutationToken)) {
            return;
          }
          state.diagnosisReviewError = null;
          state.diagnosisDraft = null;
          state.diagnosisDraftId = null;
          state.diagnosisReviewRationale = '';
          state.diagnosisReviewDecision = null;
          state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
          state.diagnosisFixResults = [];
          state.diagnosisUiPhase = 'auto';
          await refreshSelectedTicketQueueAndEvidence({ waitForDiagnoses: true });
          setResult(data);
          return;
        }
        await runGovernedMutation(mutationKind, async function () {
          return requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses/' + encodeURIComponent(diagnosisId) + '/review', {
            method: 'POST',
            body: JSON.stringify(body)
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true,
          isCurrent: function () {
            return isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketSelectionToken, mutationToken);
          },
          setInlineError: function (message) {
            state.diagnosisReviewError = message;
          },
          clearInlineError: function () {
            state.diagnosisReviewError = null;
          },
          render: function () {
            renderDiagnosisPanel();
          },
          beforeRefreshSuccess: function () {
            state.diagnosisDraft = null;
            state.diagnosisDraftId = null;
            state.diagnosisReviewRationale = '';
            state.diagnosisReviewDecision = null;
            state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
            state.diagnosisFixResults = [];
          },
          afterRefresh: function () {
            renderDiagnosisPanel();
            renderRecommendationStageControls();
            updateControls();
          }
        });
      }

      async function applySelectedDiagnosisFix() {
        const view = selectedDiagnosisView();
        if (state.selectedTicket === null || view === null || !lifecycleMutationAvailable('apply-scoped-fix')) {
          return;
        }
        const ticketId = state.selectedTicket.id;
        const diagnosisId = view.originalDiagnosis.id;
        const ticketSelectionToken = state.ticketSelectionToken;
        const mutationToken = beginDiagnosisMutation(ticketId, diagnosisId);
        const actor = els.actor.value.trim() || 'approval-desk';
        const selectedTicketIds = Array.isArray(state.diagnosisImpact.selectedTicketIds)
          ? state.diagnosisImpact.selectedTicketIds
          : [];
        const impactRationale = state.diagnosisImpact.rationale.trim() ||
          'The reviewed diagnosis applies to the source ticket.';
        const sourceReason = state.diagnosisImpact.ticketReasons?.[ticketId]?.trim() || impactRationale;
        const impactTicketIds = selectedTicketIds.includes(ticketId)
          ? selectedTicketIds
          : [ticketId, ...selectedTicketIds];
        state.diagnosisFixError = null;
        state.diagnosisFixPending = true;
        renderDiagnosisPanel();
        if (!hasLifecycleDescriptor()) {
          let data;
          try {
            data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses/' + encodeURIComponent(diagnosisId) + '/fix', {
              method: 'POST',
              body: JSON.stringify({
                actor,
                impactSet: {
                  actor,
                  rationale: impactRationale,
                  tickets: impactTicketIds.map(function (impactTicketId) {
                    return {
                      ticketId: impactTicketId,
                      reason: impactTicketId === ticketId
                        ? sourceReason
                        : state.diagnosisImpact.ticketReasons?.[impactTicketId] ?? ''
                    };
                  })
                }
              })
            }, { writeErrorToResult: false });
          } catch (error) {
            if (isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketSelectionToken, mutationToken)) {
              state.diagnosisFixPending = false;
              state.diagnosisFixError = error instanceof Error ? error.message : 'The scoped fix request failed.';
              renderDiagnosisPanel();
              setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
            }
            return;
          }
          if (!isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketSelectionToken, mutationToken)) {
            return;
          }
          adoptLifecycle(data);
          state.diagnosisFixPending = false;
          state.diagnosisFixError = null;
          state.diagnosisFixResults = Array.isArray(data.auditEvents) ? data.auditEvents : [];
          state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
          state.diagnosisDraft = null;
          state.diagnosisDraftId = null;
          state.diagnosisReviewRationale = '';
          state.diagnosisUiPhase = 'normal';
          await refreshSelectedTicketQueueAndEvidence({ waitForDiagnoses: true });
          setResult(data);
          return;
        }
        await runGovernedMutation('apply-scoped-fix', async function () {
          return requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/diagnoses/' + encodeURIComponent(diagnosisId) + '/fix', {
            method: 'POST',
            body: JSON.stringify({
              actor,
              impactSet: {
                actor,
                rationale: impactRationale,
                tickets: impactTicketIds.map(function (impactTicketId) {
                  return {
                    ticketId: impactTicketId,
                    reason: impactTicketId === ticketId
                      ? sourceReason
                      : state.diagnosisImpact.ticketReasons?.[impactTicketId] ?? ''
                  };
                })
              }
            })
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true,
          isCurrent: function () {
            return isCurrentDiagnosisMutation(ticketId, diagnosisId, ticketSelectionToken, mutationToken);
          },
          setInlineError: function (message) {
            state.diagnosisFixPending = false;
            state.diagnosisFixError = message;
          },
          clearInlineError: function () {
            state.diagnosisFixError = null;
          },
          beforeRefreshSuccess: function (data) {
            state.diagnosisFixPending = false;
            state.diagnosisFixResults = Array.isArray(data.auditEvents) ? data.auditEvents : [];
            state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
            state.diagnosisDraft = null;
            state.diagnosisDraftId = null;
            state.diagnosisReviewRationale = '';
            state.diagnosisUiPhase = 'normal';
          },
          preservePresentationOnError: true,
          afterRefresh: function (result) {
            if (result.error !== null) {
              state.diagnosisUiPhase = 'fix';
            } else if (state.selectedTicket?.id === ticketId &&
                (state.lifecycle?.primaryAction?.kind === 'apply-scoped-fix' || lifecycleActionIsAvailable('apply-scoped-fix'))) {
              state.diagnosisUiPhase = 'fix';
            }
            renderDiagnosisPanel();
            renderRecommendationStageControls();
            updateControls();
          }
        });
      }

      function createRecommendationLabel() {
        return ticketWorkflowState(state.selectedTicket ?? {}) === 'customer-replied'
          ? 'Evaluate again'
          : 'Evaluate ticket';
      }

      function isEvaluationPendingForTicket(ticketId) {
        return ticketId !== undefined && state.evaluationPendingTicketId === ticketId;
      }

      function isEvaluationPendingForSelectedTicket() {
        return isEvaluationPendingForTicket(state.selectedTicket?.id);
      }

      function canCreateRecommendation() {
        return state.selectedTicket !== null &&
          state.governedMutationToken === null &&
          (!isApprovedAwaitingSend() || lifecycleActionIsAvailable('evaluate-ticket'));
      }

      function createUpdatedRecommendationLabel() {
        if (hasLifecycleDescriptor()) {
          const primary = state.lifecycle?.primaryAction?.kind;
          if (primary === 'evaluate-ticket') {
            return ['awaiting-confirmation', 'verification'].includes(state.lifecycle?.phase)
              ? 'Re-evaluate'
              : 'Evaluate';
          }
          if (primary === 'review-recommendation' || primary === 'review-diagnosis') return 'Review';
          if (primary === 'send-customer-response') return 'Send';
          if (primary === 'record-diagnosis') return 'Diagnose';
          if (primary === 'record-fix-available' || primary === 'apply-scoped-fix') return 'Fix';
          if (primary === 'resolve-ticket') return 'Resolve';
          if (primary === 'none' || primary === 'specialist-review') return 'Further investigation required';
        }
        if (latestUnconsumedCustomerReply() !== null) {
          return 'Evaluate';
        }
        const event = latestUnevaluatedWorkflowEvent();
        return event?.kind === 'fix' ? 'Send' : 'Evaluate';
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
        const readyForClose = ticket.lifecycleSummary?.phase === 'ready-for-close' ||
          (ticket.lifecycleSummary === undefined && summary.supportState === 'ready-for-close');
        const workflow = readyForClose ? 'Ready to resolve' : workflowStateLabel(ticketWorkflowState(ticket));
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
            '</section>';
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
            renderPreviousRecommendations();
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
        const requiredReview = state.operatorGuidance?.requiredReview;
        const reviewGateActive = requiredReview !== undefined ||
          (hasLifecycleDescriptor() && state.lifecycle?.primaryAction?.kind === 'review-recommendation');
        const waitingForReply = isTaskDoneWaitingForReply();
        const customerReplyReady = latestUnconsumedCustomerReply() !== null;
        const closeReady = shouldShowCloseTicketAction();
        const diagnosisActionReady = shouldShowDiagnoseAction();
        const fixActionReady = shouldShowFixAction();
        const historicalDiagnosis = isHistoricalDiagnosisSelection();
        const legacyGuidedDiagnosisPhase = !hasLifecycleDescriptor() && (
          requiredReview?.kind === 'diagnosis' ||
          state.operatorGuidance?.nextAction === 'record-diagnosis' ||
          state.operatorGuidance?.nextAction === 'mark-fix-available'
        );
        const autoDiagnosisPhaseEligible = state.diagnosisUiPhase !== 'auto' ||
          !hasLifecycleDescriptor() ||
          state.lifecycle?.phase === 'diagnosis-review' ||
          lifecycleActionIsAvailable('review-diagnosis') ||
          lifecycleActionIsAvailable('revalidate-diagnosis') ||
          legacyGuidedDiagnosisPhase;
        const diagnosisPhaseActive = !historicalDiagnosis && state.diagnosisUiPhase !== 'normal' && autoDiagnosisPhaseEligible && (
          selectedDiagnosisView() !== null ||
          ['diagnosis-ready', 'diagnosis-review', 'awaiting-confirmation', 'awaiting-fix', 'fix-ready', 'verification'].includes(state.lifecycle?.phase) ||
          lifecycleActionIsAvailable('record-diagnosis') ||
          lifecycleActionIsAvailable('record-fix-available') ||
          lifecycleActionIsAvailable('apply-scoped-fix') ||
          legacyGuidedDiagnosisPhase
        );
        const explicitDiagnosisPhaseActive = ['diagnosis', 'inspection', 'approved', 'fix'].includes(state.diagnosisUiPhase);
        const phaseOwnsWorkflowActions =
          !historicalDiagnosis && diagnosisPhaseActive && (['diagnosis-review', 'awaiting-confirmation', 'awaiting-fix', 'fix-ready', 'verification'].includes(state.lifecycle?.phase) ||
          lifecycleActionIsAvailable('record-diagnosis') ||
          lifecycleActionIsAvailable('record-fix-available') ||
          lifecycleActionIsAvailable('apply-scoped-fix') ||
          legacyGuidedDiagnosisPhase);
        const phaseControlsVisible = diagnosisActionReady || fixActionReady;
        const currentDiagnosis = selectedDiagnosisView();
        const confirmedDiagnosisPresentation = !historicalDiagnosis &&
          state.diagnosisUiPhase !== 'normal' &&
          currentDiagnosis !== null &&
          diagnosisContextForView(currentDiagnosis)?.confidence === 'confirmed' &&
          (diagnosisActionReady || fixActionReady || ['diagnosis-review', 'awaiting-confirmation', 'awaiting-fix', 'fix-ready', 'verification'].includes(state.lifecycle?.phase));
        const lifecycleNoAction = hasLifecycleDescriptor() &&
          ['none', 'specialist-review'].includes(state.lifecycle?.primaryAction?.kind);
        const suppressGenericActions = phaseOwnsWorkflowActions || lifecycleNoAction;
        const workflowActionReady = shouldShowCreateUpdatedRecommendation() || diagnosisActionReady || fixActionReady || closeReady;
        els.setupControls.hidden = hasRecommendation;
        els.decisionControls.hidden = (phaseOwnsWorkflowActions && !phaseControlsVisible) || (!hasRecommendation && !diagnosisActionReady && !fixActionReady) || (waitingForReply && !workflowActionReady) || state.stage === 'approval' || state.stage === 'reject';
        els.editApprovalControls.hidden = !(hasRecommendation && state.stage === 'approval');
        els.rejectControls.hidden = !(hasRecommendation && state.stage === 'reject');
        els.replyControls.hidden = !shouldShowReplyControls();
        els.approvalStage.hidden = true;
        els.actionBarTitle.textContent = actionBarTitle();
        els.actionBarHint.textContent = diagnosisPhaseActive ? '' : actionBarHint();
        if (els.workflowActionBar !== undefined && els.workflowActionBar !== null) {
          els.workflowActionBar.className = diagnosisPhaseActive
            ? 'recommendation-setup-bar phase-mode'
            : 'recommendation-setup-bar';
        }
        els.customerReplyFocus.innerHTML = renderCustomerReplyFocus();
        els.customerReplyFocus.hidden = els.customerReplyFocus.innerHTML === '';
        els.continueApproval.textContent = 'Edit';
        els.reviewDraftButton.textContent = 'Response';
        els.approveButton.textContent = 'Done';
        els.approveEditedButton.textContent = 'Done';
        els.reviewDraftButton.hidden = suppressGenericActions || !hasRecommendation;
        els.continueApproval.hidden = suppressGenericActions || !hasRecommendation || approvedWorkflow || shouldShowCreateUpdatedRecommendation() || reviewGateActive;
        els.markSentButton.hidden = true;
        els.createUpdatedRecommendation.hidden = suppressGenericActions || !shouldShowCreateUpdatedRecommendation();
        els.diagnoseButton.hidden = !diagnosisActionReady || explicitDiagnosisPhaseActive;
        els.fixButton.hidden = !fixActionReady || explicitDiagnosisPhaseActive;
        // Resolve is a lifecycle primary action, not a diagnosis-panel
        // mutation; keep it visible even while a readable diagnosis remains
        // open in the presentation column.
        els.closeTicketButton.hidden = !closeReady;
        els.closeTicketButton.textContent = 'Resolve';
        els.closeTicketButton.title = 'Resolve ticket';
        els.approveButton.hidden = suppressGenericActions || !hasRecommendation || shouldShowCreateUpdatedRecommendation() || closeReady ||
          (approvedWorkflow && isCurrentRecommendationSent());
        const primaryActionLabel = reviewGateActive
          ? 'Review'
          : hasLifecycleDescriptor() && state.lifecycle?.primaryAction?.kind === 'send-customer-response'
            ? 'Send'
          : isCollectingEvidenceWorkflow()
            ? 'Send'
            : 'Done';
        els.approveButton.textContent = primaryActionLabel;
        els.approveEditedButton.textContent = primaryActionLabel;
        els.approveButton.title = reviewGateActive
          ? 'Review the required diagnosis or pattern action before continuing'
          : primaryActionLabel === 'Send'
            ? hasLifecycleDescriptor() && state.lifecycle?.primaryAction?.kind === 'send-customer-response'
              ? 'Send the approved response to the customer'
              : 'Approve and send the evidence request to the customer'
            : 'Mark task done';
        els.startRejectButton.hidden = suppressGenericActions || !hasRecommendation || approvedWorkflow || closeReady || reviewGateActive;
        els.backToRecommendation.hidden = !(hasRecommendation && state.stage === 'approval');
        els.decisionChips.hidden = confirmedDiagnosisPresentation;
        els.decisionSummary.hidden = confirmedDiagnosisPresentation;
        els.decisionChips.innerHTML = hasRecommendation ? renderDecisionChips(state.recommendation) : '';
        els.decisionSummary.textContent = hasRecommendation ? decisionSummaryText(state.recommendation) : 'Review the draft and evidence, then approve or edit.';
        els.discoverKnowledgeButton.disabled = state.selectedTicket === null || state.knowledgeDiscoveryPending;
        els.knowledgeDiscoveryStatus.textContent = state.knowledgeDiscoveryStatus;
        renderKnowledgeJourney();
        if (!isEvaluationPendingForSelectedTicket() && (customerReplyReady || latestUnevaluatedWorkflowEvent() !== null)) {
          els.createUpdatedRecommendation.textContent = createUpdatedRecommendationLabel();
        }
        renderDiagnosisActionVisibility();
        renderPatternActionBar();
      }

      function humanizeIdentifier(value) {
        return String(value ?? '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
      }

      function renderDiagnosisActionVisibility() {
        if (els.diagnosisActionPanel === undefined) return;
        const view = selectedDiagnosisView();
        const hasDiagnosis = state.diagnosisLoading === false && view !== null;
        const autoDiagnosisPhaseEligible = state.diagnosisUiPhase !== 'auto' ||
          !hasLifecycleDescriptor() ||
          state.lifecycle?.phase === 'diagnosis-review' ||
          lifecycleActionIsAvailable('review-diagnosis') ||
          lifecycleActionIsAvailable('revalidate-diagnosis') ||
          state.operatorGuidance?.requiredReview?.kind === 'diagnosis';
        els.diagnosisActionPanel.hidden = !hasDiagnosis || state.diagnosisUiPhase === 'normal' ||
          (state.diagnosisUiPhase === 'auto' && !autoDiagnosisPhaseEligible && !isHistoricalDiagnosisView(view));
      }

      function renderPatternActionBar() {
        if (els.patternActionBar === undefined || els.patternReviewPanel === undefined) return;
        const visible = state.selectedTicket !== null && state.knowledgeCandidate !== null;
        els.patternActionBar.hidden = !visible;
        els.patternReviewPanel.innerHTML = state.knowledgeCandidate === null
          ? ''
          : renderKnowledgeReviewPanel();
      }

      function renderKnowledgeJourney() {
        if (els.knowledgeJourneyBar === undefined) {
          return;
        }
        const hasTicket = state.selectedTicket !== null;
        const hasPatternActivity = state.knowledgeCandidate !== null ||
          state.knowledgeDiscoveryPending ||
          state.knowledgeDiscoveryStatus !== '';
        els.knowledgeJourneyBar.hidden = !hasTicket;
        if (!hasTicket) {
          return;
        }
        const journey = state.knowledgeJourneyState;
        const hasRecommendation = state.recommendation !== null;
        const currentStep = journey === 'approved'
          ? 4
          : journey === 'candidate'
            ? 3
            : journey === 'searching' || journey === 'none' || journey === 'reviewed'
              ? 2
              : hasRecommendation
                ? 1
                : 1;
        const status = journey === 'candidate'
          ? 'Candidate ready for review. Inspect its evidence before approval.'
          : journey === 'searching'
            ? 'Comparing completed diagnoses and open-ticket signals...'
            : journey === 'approved'
              ? 'Approved knowledge will guide future evaluations only; a later match remains evidence-gated until its requirements are supplied.'
              : journey === 'none'
                ? 'No pattern yet. Another similar completed diagnosis is needed before a reusable cause can be proposed.'
                : journey === 'reviewed'
                  ? 'Pattern review recorded. Historical recommendations remain unchanged.'
                  : hasRecommendation
                    ? 'Review the diagnosis, then search for a reusable pattern.'
                    : 'Evaluate this ticket to establish the diagnosis first.';
        const labels = [
          'Review diagnosis',
          'Find pattern',
          'Approve for future evaluations',
          'Reuse with evidence',
        ];
        els.knowledgeJourneyStatus.textContent = status;
        els.knowledgeJourneySteps.innerHTML = labels.map(function (label, index) {
          const step = index + 1;
          const stateClass = step < currentStep ? ' complete' : step === currentStep ? ' current' : '';
          return '<li class="knowledge-journey-step' + stateClass + '">' + escapeHtml(String(step) + '. ' + label) + '</li>';
        }).join('');
        els.reviewKnowledgePatternButton.hidden = state.knowledgeCandidate === null;
      }

      function focusKnowledgePattern() {
        const panel = document.getElementById('knowledgePatternReview');
        if (panel == null) {
          return;
        }
        if (typeof panel.scrollIntoView === 'function') {
          panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const firstField = panel.querySelector('input, textarea, select');
        if (firstField !== null && typeof firstField.focus === 'function') {
          firstField.focus();
        }
      }

      function actionBarTitle() {
        const noActionPresentation = lifecycleNoActionPresentation();
        if (noActionPresentation !== null) {
          return noActionPresentation.title;
        }
        const lifecyclePresentation = lifecyclePrimaryActionPresentation();
        if (lifecyclePresentation !== null) {
          return lifecyclePresentation.title;
        }
        if (state.diagnosisUiPhase === 'inspection') {
          return 'Inspection';
        }
        if (state.diagnosisUiPhase === 'fix') {
          return 'Scoped fix';
        }
        // The lifecycle owns the workflow phase. A re-evaluation may leave the
        // local diagnosis interaction in its reset/auto state while the new
        // recommendation is being reconciled; do not let that navigation state
        // reclaim the action bar from the authoritative recommendation-review
        // phase.
        if (hasLifecycleDescriptor() && state.lifecycle?.phase === 'recommendation-review') {
          return 'Review recommendation';
        }
        if (hasLifecycleDescriptor() && lifecycleActionIsAvailable('evaluate-ticket') &&
          (state.diagnosisUiPhase === 'normal' || state.diagnosisUiPhase === 'auto')) {
          return state.lifecycle?.phase === 'awaiting-confirmation'
            ? 'Waiting for confirmation'
            : 'Re-evaluate';
        }
        if (state.diagnosisUiPhase !== 'normal' && selectedDiagnosisView() !== null) {
          return 'Diagnosis';
        }
        if (state.diagnosisUiPhase === 'normal' && latestTimelineItem('fix') !== null) {
          return 'Fixed — response ready';
        }
        if (state.diagnosisUiPhase === 'normal' &&
          (canReevaluateCurrentDiagnosis() || hasCustomerReplyAfterCurrentRecommendation())) {
          return 'Customer replied';
        }
        if (state.diagnosisUiPhase === 'normal' && selectedDiagnosisView() !== null &&
          latestUnevaluatedWorkflowEvent() === null && !shouldShowCreateUpdatedRecommendation()) {
          return 'Response ready';
        }
        if (state.recommendation === null) {
          return 'Evaluate ticket';
        }
        if (state.operatorGuidance?.requiredReview?.kind === 'diagnosis' ||
          state.operatorGuidance?.nextAction === 'record-diagnosis') {
          return 'Waiting for diagnosis';
        }
        if (shouldShowCloseTicketAction()) {
          return 'Ready to resolve';
        }
        if (latestUnevaluatedWorkflowEvent() !== null && shouldShowCreateUpdatedRecommendation()) {
          return latestUnevaluatedWorkflowEvent()?.kind === 'fix' ? 'Fixed — response ready' : 'Diagnosis update';
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
        const noActionPresentation = lifecycleNoActionPresentation();
        if (noActionPresentation !== null) {
          return noActionPresentation.hint;
        }
        const lifecyclePresentation = lifecyclePrimaryActionPresentation();
        if (lifecyclePresentation !== null) {
          return lifecyclePresentation.hint;
        }
        if (isHistoricalDiagnosisSelection()) {
          return 'Viewing a historical diagnosis. Return to the current diagnosis to continue.';
        }
        if (hasLifecycleDescriptor() && state.lifecycle?.phase === 'recommendation-review') {
          return 'Review the new evaluation before continuing.';
        }
        if (hasLifecycleDescriptor() && lifecycleActionIsAvailable('evaluate-ticket') &&
          (state.diagnosisUiPhase === 'normal' || state.diagnosisUiPhase === 'auto')) {
          return state.lifecycle?.phase === 'awaiting-confirmation'
            ? 'Evaluate the current confirmation evidence before continuing.'
            : 'Re-evaluate the ticket after clarification or the rejected diagnosis.';
        }
        if (state.diagnosisUiPhase === 'normal' && latestTimelineItem('fix') !== null) {
          return 'The scoped fix is recorded. Draft the customer verification update.';
        }
        if (state.diagnosisUiPhase === 'normal' && selectedDiagnosisView() !== null &&
          latestUnevaluatedWorkflowEvent() === null && !shouldShowCreateUpdatedRecommendation()) {
          return 'Review the response or reopen diagnosis.';
        }
        if (state.knowledgeCandidate !== null) {
          return 'Potential knowledge pattern — review it separately. Approval affects future evaluations, not historical recommendations.';
        }
        if (state.recommendation === null) {
          return 'Classify the ticket and draft a response.';
        }
        if (shouldShowCloseTicketAction()) {
          return 'Customer confirmed the solution. Resolve preserves the audit trail.';
        }
        if (latestUnevaluatedWorkflowEvent() !== null && shouldShowCreateUpdatedRecommendation()) {
          return latestUnevaluatedWorkflowEvent()?.kind === 'fix'
            ? 'The scoped fix is recorded. Draft the customer verification update.'
            : 'Draft the customer update from the latest diagnosis or fix.';
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
          : candidate.evidencePolicy?.mode === 'none-required'
            ? 'None required: ' + (candidate.evidencePolicy.rationale ?? 'Rationale required')
            : 'Evidence policy undecided';
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
        const evidenceRationale = candidate.evidencePolicy?.mode === 'none-required'
          ? (candidate.evidencePolicy.rationale ?? '')
          : '';
        const evidenceOptions = [];
        const addEvidenceOption = function (id) {
          if (typeof id === 'string' && id.trim() !== '' && !evidenceOptions.includes(id.trim())) {
            evidenceOptions.push(id.trim());
          }
        };
        (candidate.evidencePolicy?.evidenceIds ?? []).forEach(addEvidenceOption);
        (state.recommendation?.providedEvidence ?? []).forEach(function (item) { addEvidenceOption(item.id); });
        (state.recommendation?.missingEvidence ?? []).forEach(function (item) { addEvidenceOption(item.id); });
        const selectedEvidence = new Set((candidate.evidencePolicy?.evidenceIds ?? []).map(function (id) { return String(id); }));
        const evidenceChoices = evidenceOptions.length === 0
          ? '<p class="hint">No catalogued evidence is linked yet. Add an evidence ID below if the operator can verify one.</p>'
          : '<div class="evidence-choice-list" aria-label="Potential evidence">' + evidenceOptions.map(function (id) {
              return '<label><input type="checkbox" data-knowledge-evidence="true" value="' + escapeHtml(id) + '"' + (selectedEvidence.has(id) ? ' checked' : '') + '> ' + escapeHtml(humanizeIdentifier(id)) + '</label>';
            }).join('') + '</div>';
        return '<section id="knowledgePatternReview" class="hero-card description knowledge-review-panel"><strong>Potential knowledge pattern</strong>' +
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
          '<details class="candidate-editor" open><summary>Review and edit the proposed object</summary>' +
            '<div class="details-grid"><label>Proposed name <input id="knowledgeName" value="' + escapeHtml(candidate.name ?? '') + '"></label>' +
            '<label>Owner team <input id="knowledgeOwner" value="' + escapeHtml(candidate.owner ?? '') + '"></label></div>' +
            '<label>Summary <textarea id="knowledgeSummary" rows="2">' + escapeHtml(candidate.summary ?? '') + '</textarea></label>' +
            '<label>Trigger patterns <textarea id="knowledgeTriggerPatterns" rows="2">' + escapeHtml(listText(candidate.triggerPatterns)) + '</textarea></label>' +
            '<div class="details-grid"><label>Evidence policy <select id="knowledgeEvidenceMode"><option value="undecided"' + (candidate.evidencePolicy?.mode === 'undecided' ? ' selected' : '') + '>Undecided</option><option value="none-required"' + (candidate.evidencePolicy?.mode === 'none-required' ? ' selected' : '') + '>None required</option><option value="required"' + (candidate.evidencePolicy?.mode === 'required' ? ' selected' : '') + '>Required</option></select></label>' +
            '<label>Selected evidence <input id="knowledgeEvidenceIds" aria-label="Selected evidence" value="' + escapeHtml(requiredEvidence.replaceAll('\\n', ', ')) + '"></label></div>' +
            evidenceChoices +
            '<label>None-required rationale <textarea id="knowledgeEvidenceRationale" rows="2" placeholder="Explain why this known cause needs no additional evidence.">' + escapeHtml(evidenceRationale) + '</textarea></label>' +
            '<details><summary>Workflow and communication fields</summary>' +
              '<label>Time constraints <textarea id="knowledgeTimeConstraints" rows="2">' + escapeHtml(listText(candidate.timeConstraints)) + '</textarea></label>' +
              '<label>Diagnostic workflow <textarea id="knowledgeDiagnosticSteps" rows="2">' + escapeHtml(listText(candidate.diagnosticSteps)) + '</textarea></label>' +
              '<label>Fix workflow <textarea id="knowledgeFixSteps" rows="2">' + escapeHtml(listText(candidate.fixSteps)) + '</textarea></label>' +
              '<label>Verification workflow <textarea id="knowledgeVerificationSteps" rows="2">' + escapeHtml(listText(candidate.verificationSteps)) + '</textarea></label>' +
              '<label>Customer-safe explanation <textarea id="knowledgeCustomerSafeExplanation" rows="2">' + escapeHtml(candidate.customerSafeExplanation ?? '') + '</textarea></label>' +
              '<label>Operator rationale <textarea id="knowledgeOperatorRationale" rows="2">' + escapeHtml(candidate.operatorRationale ?? '') + '</textarea></label>' +
            '</details>' +
          '</details>' +
          '<details class="candidate-rejection"><summary>Reject candidate</summary><label>Rejection reason <textarea id="knowledgeRejectReason" rows="2" placeholder="Explain why this candidate is not approved."></textarea></label></details>' +
          '<div class="actions"><button type="button" data-action="approve-knowledge">Approve</button><button type="button" class="secondary" data-action="draft-knowledge-with-gpt">Refresh</button><button type="button" class="secondary" data-action="defer-knowledge">Defer</button><button type="button" class="danger" data-action="reject-knowledge">Reject</button></div>' +
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
          return 'The closing response has been sent. Resolve moves the ticket to Resolved while keeping all logs.';
        }
        if (isApprovedWorkflow()) {
          return 'The response is ready. Done applies the proposed values and logs the response as sent.';
        }
        if (isCollectingEvidenceWorkflow()) {
          return 'Send the evidence request to the customer, then continue when the reply arrives.';
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
        return (approved || state.lifecycle?.primaryAction?.kind === 'send-customer-response') &&
          !isCurrentRecommendationSent();
      }

      function shouldShowCreateUpdatedRecommendation() {
        if (hasLifecycleDescriptor()) {
          return state.selectedTicket !== null &&
            lifecycleActionIsAvailable('evaluate-ticket') &&
            canCreateRecommendation();
        }
        if (!hasLifecycleDescriptor() && state.operatorGuidance?.nextAction === 'record-diagnosis') {
          return false;
        }
        if (!hasLifecycleDescriptor() && state.operatorGuidance?.nextAction === 'mark-fix-available' && latestTimelineItem('fix') === null) {
          return false;
        }
        return state.selectedTicket !== null &&
          state.recommendation !== null &&
          (!hasRequiredReviewGate() || canReevaluateCurrentDiagnosis() || lifecycleActionIsAvailable('evaluate-ticket')) &&
          (lifecycleActionIsAvailable('evaluate-ticket') || latestUnconsumedCustomerReply() !== null || latestUnevaluatedWorkflowEvent() !== null) &&
          canCreateRecommendation();
      }

      function focusRequiredReview() {
        const kind = state.operatorGuidance?.requiredReview?.kind;
        if (kind === 'knowledge-pattern') {
          focusKnowledgePattern();
          return;
        }
        if (kind === 'diagnosis') {
          const panel = els.diagnosisActionPanel;
          if (panel != null && typeof panel.scrollIntoView === 'function') {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          const firstField = els.diagnosisPanel?.querySelector?.('textarea, input, select');
          if (firstField !== null && firstField !== undefined && typeof firstField.focus === 'function') {
            firstField.focus();
          }
        }
      }

      function hasRequiredReviewGate() {
        return state.operatorGuidance?.requiredReview !== undefined;
      }

      function lifecycleActionDescriptor(kind) {
        if (state.lifecycle?.primaryAction?.kind === kind) {
          return state.lifecycle.primaryAction;
        }
        return Array.isArray(state.lifecycle?.actions)
          ? state.lifecycle.actions.find(function (action) { return action.kind === kind; }) ?? null
          : null;
      }

      function lifecycleActionIsAvailable(kind) {
        const action = lifecycleActionDescriptor(kind);
        return action !== null && (action.availability === 'primary' || action.availability === 'available');
      }

      function lifecycleActionReason(kind) {
        const action = lifecycleActionDescriptor(kind);
        return action === null || !Array.isArray(action.reasonCodes) || action.reasonCodes.length === 0
          ? ''
          : action.reasonCodes.map(humanizeIdentifier).join('. ') + '.';
      }

      function lifecycleMutationAvailable(kind) {
        if (!hasLifecycleDescriptor()) {
          return true;
        }
        return lifecycleActionIsAvailable(kind);
      }

      function adoptLifecycle(data) {
        if (data !== null && typeof data === 'object' && data.lifecycle !== undefined) {
          state.lifecycle = data.lifecycle;
          if (data.lifecycle.primaryAction?.kind === 'resolve-ticket') {
            els.closeTicketButton.hidden = false;
          }
        }
      }

      function hasLifecycleDescriptor() {
        return state.lifecycle !== null && typeof state.lifecycle === 'object';
      }

      function shouldShowDiagnoseAction() {
        if (hasLifecycleDescriptor()) {
          return state.selectedTicket !== null && lifecycleActionIsAvailable('record-diagnosis');
        }
        return state.selectedTicket !== null &&
          (state.diagnosisUiPhase === 'normal' && selectedDiagnosisView() !== null ||
            state.diagnosisUiPhase === 'normal' ||
            state.operatorGuidance === null || state.operatorGuidance.nextAction === 'record-diagnosis');
      }

      function shouldShowFixAction() {
        if (hasLifecycleDescriptor()) {
          return state.selectedTicket !== null && (
            lifecycleActionIsAvailable('record-fix-available') ||
            lifecycleActionIsAvailable('apply-scoped-fix')
          );
        }
        return state.selectedTicket !== null &&
          (state.operatorGuidance === null || state.operatorGuidance.nextAction === 'mark-fix-available');
      }

      function shouldShowCloseTicketAction() {
        if (hasLifecycleDescriptor()) {
          return state.selectedTicket !== null && lifecycleActionIsAvailable('resolve-ticket');
        }
        return state.selectedTicket !== null &&
          state.recommendation !== null &&
          !hasRequiredReviewGate() &&
          ticketWorkflowState(state.selectedTicket) !== 'resolved' &&
          state.recommendation.supportState === 'ready-for-close' &&
          isTaskDoneWaitingForReply();
      }

      function lifecycleNoActionPresentation() {
        if (!hasLifecycleDescriptor()) return null;
        if (state.lifecycle?.phase === 'resolved') {
          return {
            title: 'Resolved',
            hint: 'This ticket is resolved. No governed operator action is available.'
          };
        }
        if (state.lifecycle?.phase === 'waiting-for-customer') {
          return {
            title: 'Waiting for customer',
            hint: 'Waiting for the customer to provide the requested evidence or reply.'
          };
        }
        if (state.lifecycle?.phase === 'escalated' || state.lifecycle?.primaryAction?.kind === 'specialist-review') {
          return {
            title: 'Specialist review required',
            hint: 'Specialist review is required before another governed action can proceed.'
          };
        }
        if (state.lifecycle?.primaryAction?.kind === 'none') {
          return {
            title: 'Further investigation required',
            hint: lifecycleActionReason('none') || 'No governed operator action is available in this state. Further investigation is required.'
          };
        }
        return null;
      }

      function lifecyclePrimaryActionPresentation() {
        if (!hasLifecycleDescriptor()) return null;
        const primary = state.lifecycle?.primaryAction?.kind;
        if (primary === 'evaluate-ticket') {
          return state.lifecycle?.phase === 'awaiting-confirmation'
            ? {
                title: 'Waiting for confirmation',
                hint: 'Evaluate the current confirmation evidence before continuing.'
              }
            : {
                title: 'Re-evaluate',
                hint: 'Re-evaluate the ticket after clarification or the rejected diagnosis.'
              };
        }
        if (primary === 'review-diagnosis') {
          return {
            title: 'Review diagnosis',
            hint: 'Review the current diagnosis before continuing.'
          };
        }
        if (primary === 'revalidate-diagnosis') {
          return {
            title: 'Revalidate diagnosis',
            hint: 'Revalidate the diagnosis against the current ticket evidence.'
          };
        }
        if (primary === 'record-diagnosis') {
          return {
            title: 'Diagnose ticket',
            hint: 'Record the governed diagnosis before continuing.'
          };
        }
        if (primary === 'record-fix-available') {
          return {
            title: 'Fix available',
            hint: 'Record the governed fix before preparing the customer update.'
          };
        }
        if (primary === 'apply-scoped-fix') {
          return {
            title: 'Scoped fix',
            hint: 'Apply the reviewed scoped fix to the current ticket.'
          };
        }
        if (primary === 'resolve-ticket') {
          return {
            title: 'Ready to resolve',
            hint: 'Customer confirmation is recorded. Resolve preserves the audit trail.'
          };
        }
        return null;
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
        if (hasLifecycleDescriptor() &&
            ['review-diagnosis', 'revalidate-diagnosis', 'record-diagnosis', 'record-fix-available', 'apply-scoped-fix', 'resolve-ticket', 'none', 'specialist-review'].includes(state.lifecycle?.primaryAction?.kind)) {
          return false;
        }
        return state.selectedTicket !== null &&
          !hasRequiredReviewGate() &&
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
        const evaluationPending = isEvaluationPendingForSelectedTicket();
        const governedMutationPending = state.governedMutationToken !== null;
        const approvedWorkflow = isApprovedWorkflow();
        const actorPresent = els.actor.value.trim().length > 0;
        const fields = selectedFields();
        const hasFields = fields.length > 0;
        const confirmed = true;
        const customerResponseReady =
          !fields.includes('customerResponse') ||
          els.editedCustomerResponse.value.trim().length > 0;
        const feedbackPresent = els.feedback.value.trim().length > 0;
        const manualRepliesEnabled = els.disableAutomaticReplies.checked === true;

        const doneReady = hasRecommendation &&
          actorPresent &&
          (
            (!approvedWorkflow && confirmed && hasFields && customerResponseReady) ||
            (approvedWorkflow && shouldShowMarkSentAction())
          );
        els.approveButton.disabled = governedMutationPending || !doneReady;
        els.approveEditedButton.disabled = els.approveButton.disabled;
        els.rejectButton.disabled = governedMutationPending || !(hasRecommendation && !approvedWorkflow && actorPresent && feedbackPresent);
        els.startRejectButton.disabled = governedMutationPending || !(hasRecommendation && !approvedWorkflow && actorPresent);
        els.markSentButton.disabled = governedMutationPending || !(hasRecommendation && approvedWorkflow && actorPresent && shouldShowMarkSentAction());
        els.diagnoseButton.disabled = governedMutationPending || !(actorPresent && shouldShowDiagnoseAction());
        els.fixButton.disabled = governedMutationPending || !(actorPresent && shouldShowFixAction());
        els.closeTicketButton.disabled = governedMutationPending || !(actorPresent && shouldShowCloseTicketAction());
        if (hasLifecycleDescriptor() && lifecycleActionIsAvailable('resolve-ticket')) {
          els.closeTicketButton.hidden = false;
        }
        els.createRecommendation.disabled = governedMutationPending || evaluationPending || !canCreateRecommendation();
        els.createUpdatedRecommendation.disabled = governedMutationPending || evaluationPending || !shouldShowCreateUpdatedRecommendation();
        els.createRecommendation.textContent = evaluationPending ? 'Evaluating…' : 'Evaluate';
        els.createRecommendation.title = createRecommendationLabel();
        els.createUpdatedRecommendation.textContent = evaluationPending ? 'Evaluating…' : createUpdatedRecommendationLabel();
        els.createUpdatedRecommendation.title = createRecommendationLabel();
        els.manualRepliesButton.textContent = manualRepliesEnabled ? 'Automatic' : 'Manual';
        els.manualRepliesButton.title = manualRepliesEnabled
          ? 'Switch back to automatic customer replies'
          : 'Open the manual customer reply composer';
        els.replyComposer.hidden = !manualRepliesEnabled;
        els.addCustomerReply.disabled = !manualRepliesEnabled || state.selectedTicket === null;
        if (!manualRepliesEnabled) {
          els.replyComposer.open = false;
        }
      }

      async function loadQueue(options) {
        els.queueStatus.textContent = 'Loading queue...';
        const data = await requestJson('/api/tickets?limit=50', undefined, {
          writeErrorToResult: options?.writeErrorToResult
        });
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
          card('Estimated minutes saved (realized approval estimate)', formatEvidenceValue(summary.estimatedMinutesSaved)) +
          card('Potential minutes saved', formatEvidenceValue(summary.potentialMinutesSaved)) +
          card('Average confidence', formatEvidencePercentage(summary.averageConfidence)) +
          card('Average approved confidence', formatEvidencePercentage(summary.averageApprovedConfidence)) +
          card('Low-confidence recommendations', formatEvidenceValue(summary.lowConfidenceCount)) +
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

      async function selectTicket(id, options) {
        const previousTicketId = state.selectedTicket?.id;
        const newSelection = previousTicketId !== id;
        const switchingTickets = previousTicketId !== undefined && previousTicketId !== id;
        const ticketRequestId = ++state.ticketRequestId;
        if (newSelection) {
          state.ticketSelectionToken += 1;
        }
        if (newSelection) {
          resetDiagnosisInteraction();
          state.diagnoses = [];
          state.diagnosisLoading = true;
          state.operatorGuidance = null;
          state.lifecycle = null;
          state.selectedTicket = null;
          state.recommendation = null;
          state.stage = 'empty';
          renderTicketList();
          renderTicket();
          renderConversationContext();
          renderRecommendation();
          els.diagnosisPanel.innerHTML = '<p class="hint">Loading diagnosis review...</p>';
        } else if (options?.preservePresentation !== true && state.diagnosisUiPhase !== 'normal') {
          // A same-ticket refresh reconciles the visible panel with the new
          // authoritative lifecycle; it must not leave a stale diagnosis or
          // inspection phase hiding the lifecycle primary action.
          state.selectedDiagnosisId = null;
          state.diagnosisUiPhase = 'auto';
        }
        if (switchingTickets) {
          state.consumedCustomerReplyTimestamp = null;
        }
        const knowledgeRequestId = ++state.knowledgeRequestId;
        state.knowledgeCandidate = null;
        state.knowledgeAdvisory = null;
        state.knowledgeDiscoveryStatus = '';
        state.knowledgeDiscoveryPending = false;
        state.knowledgeJourneyState = 'idle';
        els.patternReviewPanel.innerHTML = '';
        els.patternActionBar.hidden = true;
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
          if (options?.propagateError === true) {
            throw error;
          }
          return;
        }
        if (state.ticketRequestId !== ticketRequestId) {
          return undefined;
        }
        state.selectedTicket = data.recommendationSummary === undefined
          ? data.ticket
          : { ...data.ticket, recommendationSummary: data.recommendationSummary };
        state.operatorGuidance = data.operatorGuidance ?? null;
        state.lifecycle = data.lifecycle ?? null;
        if (options?.preservePresentation !== true &&
            ['record-diagnosis', 'review-diagnosis', 'revalidate-diagnosis', 'record-fix-available', 'apply-scoped-fix'].includes(state.lifecycle?.primaryAction?.kind)) {
          state.selectedDiagnosisId = null;
          state.diagnosisUiPhase = 'auto';
        }
        if (state.lifecycle?.primaryAction?.kind === 'resolve-ticket') {
          els.closeTicketButton.hidden = false;
        }
        const diagnosisLoad = loadDiagnoses(id, ticketRequestId).catch(function (error) {
          if (isCurrentTicketRequest(id, ticketRequestId)) {
            state.diagnosisLoading = false;
            els.diagnosisPanel.innerHTML = '<p class="warning">Diagnosis review could not be loaded: ' +
              escapeHtml(error instanceof Error ? error.message : 'Request failed.') + '</p>';
            setResult({ error: error instanceof Error ? error.message : 'Request failed.' });
          }
        });
        state.conversationTimeline = Array.isArray(data.conversationTimeline) ? data.conversationTimeline : [];
        state.decisionTimeline = Array.isArray(data.decisionTimeline) ? data.decisionTimeline : [];
        state.decisionTimelineCategory = 'all';
        state.decisionTimelineActor = 'all';
        state.recommendationHistory = Array.isArray(data.recommendationHistory) ? data.recommendationHistory : [];
        state.recommendation = data.latestRecommendation ?? null;
        void loadKnowledgeCandidate(id, knowledgeRequestId).then(function () {
          if (state.selectedTicket?.id === id && state.knowledgeRequestId === knowledgeRequestId) {
            renderRecommendation(true);
            renderRecommendationStageControls();
          }
        });
        const refreshedRecommendationApproved =
          state.recommendation?.resolution === 'approved' ||
          state.selectedTicket?.recommendationSummary?.latestResolution === 'approved' ||
          state.lifecycle?.primaryAction?.kind === 'send-customer-response';
        state.stage = state.recommendation === null
          ? 'empty'
          : refreshedRecommendationApproved
            ? 'approved'
            : 'draft';
        renderTicketList();
        renderTicket();
        renderConversationContext();
        renderRecommendation();
        renderRecommendationStageControls();
        updateControls();
        setResult(data);
        if (options?.waitForDiagnoses === true) {
          await diagnosisLoad;
          // Diagnosis loading can finish after the lifecycle projection has
          // rendered. Reconcile only the terminal Resolve presentation here;
          // other states already render their selected panel during loading.
          if (state.lifecycle?.primaryAction?.kind === 'resolve-ticket') {
            renderDiagnosisPanel();
            renderRecommendationStageControls();
            updateControls();
          }
        }
        return ticketRequestId;
      }

      async function loadKnowledgeCandidate(ticketId, knowledgeRequestId, includeGpt) {
        state.knowledgeDiscoveryPending = true;
        state.knowledgeJourneyState = 'searching';
        state.knowledgeDiscoveryStatus = includeGpt === true
          ? 'Refreshing knowledge pattern with optional GPT...'
          : 'Searching for a reusable knowledge pattern...';
        renderRecommendationStageControls();
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
          state.knowledgeDiscoveryStatus = state.knowledgeCandidate === null
            ? 'No pattern yet. Complete another similar diagnosis before a reusable knowledge cause can be proposed.'
            : 'Potential knowledge pattern found — review it below.';
          state.knowledgeJourneyState = state.knowledgeCandidate === null ? 'none' : 'candidate';
        } catch (_) {
          if (state.selectedTicket?.id === ticketId && state.knowledgeRequestId === knowledgeRequestId) {
            state.knowledgeCandidate = null;
            state.knowledgeAdvisory = null;
            state.knowledgeDiscoveryStatus = 'Knowledge discovery is unavailable right now.';
            state.knowledgeJourneyState = 'none';
          }
        } finally {
          if (state.selectedTicket?.id === ticketId && state.knowledgeRequestId === knowledgeRequestId) {
            state.knowledgeDiscoveryPending = false;
            renderRecommendationStageControls();
          }
        }
      }

      async function discoverKnowledgePattern() {
        if (state.selectedTicket === null || state.knowledgeDiscoveryPending) return;
        const ticketId = state.selectedTicket.id;
        const knowledgeRequestId = ++state.knowledgeRequestId;
        state.knowledgeCandidate = null;
        state.knowledgeAdvisory = null;
        renderRecommendation(true);
        await loadKnowledgeCandidate(ticketId, knowledgeRequestId, false);
        if (state.selectedTicket?.id === ticketId && state.knowledgeRequestId === knowledgeRequestId) {
          renderRecommendation(true);
          renderRecommendationStageControls();
        }
      }

      function knowledgeListValue(id) {
        return (document.getElementById(id)?.value ?? '').split(/[,\\r\\n]+/).map(function (value) {
          return value.trim();
        }).filter(Boolean);
      }

      function knowledgeEdits() {
        const evidenceMode = document.getElementById('knowledgeEvidenceMode')?.value ?? 'none-required';
        const evidenceRationale = document.getElementById('knowledgeEvidenceRationale')?.value.trim() ?? '';
        return {
          name: document.getElementById('knowledgeName')?.value.trim() ?? '',
          summary: document.getElementById('knowledgeSummary')?.value.trim() ?? '',
          triggerPatterns: knowledgeListValue('knowledgeTriggerPatterns'),
          evidencePolicy: evidenceMode === 'required'
            ? { mode: 'required', evidenceIds: knowledgeListValue('knowledgeEvidenceIds') }
            : evidenceMode === 'undecided'
              ? { mode: 'undecided' }
              : { mode: 'none-required', rationale: evidenceRationale },
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
        const ticketId = state.selectedTicket?.id;
        const knowledgeRequestId = state.knowledgeRequestId;
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
        if (state.selectedTicket?.id !== ticketId || state.knowledgeRequestId !== knowledgeRequestId) {
          return;
        }
        try {
          const workflow = await requestJson('/api/tickets/' + encodeURIComponent(ticketId), undefined, { writeErrorToResult: false });
          if (state.selectedTicket?.id === ticketId && state.knowledgeRequestId === knowledgeRequestId) {
            state.operatorGuidance = workflow.operatorGuidance ?? state.operatorGuidance;
            if (workflow.recommendationSummary !== undefined) {
              state.selectedTicket = { ...state.selectedTicket, recommendationSummary: workflow.recommendationSummary };
            }
          }
        } catch (_) {
          // The review action itself succeeded; keep the local state and let the next refresh reconcile guidance.
        }
        state.knowledgeCandidate = null;
        state.knowledgeJourneyState = action === 'approve' ? 'approved' : 'reviewed';
        state.knowledgeDiscoveryStatus = action === 'approve'
          ? 'Knowledge object approved for future evaluations.'
          : 'Pattern review recorded.';
        renderRecommendation(true);
        setResult(data);
      }

      async function createRecommendation() {
        if (state.selectedTicket === null) {
          return;
        }
        if (state.governedMutationToken !== null) {
          return;
        }
        if (hasLifecycleDescriptor() && !lifecycleActionIsAvailable('evaluate-ticket')) {
          setResult({ error: lifecycleActionReason('evaluate-ticket') || 'Evaluating this ticket is not available in the current lifecycle state.' });
          return;
        }
        const ticketId = state.selectedTicket.id;
        let ticketRequestId = state.ticketRequestId;
        const actor = els.actor.value.trim() || 'approval-desk';
        if (isEvaluationPendingForTicket(ticketId)) {
          return;
        }
        if (hasRequiredReviewGate() && !canReevaluateCurrentDiagnosis() && !lifecycleActionIsAvailable('evaluate-ticket')) {
          focusRequiredReview();
          return;
        }
        if (isApprovedAwaitingSend() && !lifecycleActionIsAvailable('evaluate-ticket')) {
          setResult({ error: 'Mark the approved response as sent before creating a new recommendation for this ticket.' });
          return;
        }
        const replacePendingRecommendation =
          state.recommendation?.resolution === 'pending' &&
          !hasCustomerReplyAfterCurrentRecommendation();
        if (replacePendingRecommendation) {
          const confirmed = confirm('This ticket already has a pending recommendation. Create a new one?');
          if (!confirmed) {
            return;
          }
        }
        state.evaluationPendingTicketId = ticketId;
        els.recommendationPanel.innerHTML = renderRecommendationLoadingCard();
        updateControls();
        try {
          const data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/recommendations', {
            method: 'POST',
            body: JSON.stringify({
              actor,
              responseStyle: els.draftStyle.value
            })
          }, { writeErrorToResult: false });
          if (!isCurrentTicketRequest(ticketId, ticketRequestId)) {
            return;
          }
          resetDiagnosisInteraction();
          const reconciledRequestId = await selectTicket(ticketId, { waitForDiagnoses: true });
          if (reconciledRequestId === undefined || !isCurrentTicketRequest(ticketId, reconciledRequestId)) {
            return;
          }
          ticketRequestId = reconciledRequestId;
          state.consumedCustomerReplyTimestamp = latestCustomerReplyTimestamp();
          renderRecommendationStageControls();
          updateControls();
          await loadQueue({ writeErrorToResult: false }).catch(function () {
            // Queue freshness is useful but cannot change the outcome of a durable evaluation POST.
            renderTicketList();
          });
          await refreshEvidenceBestEffort();
        } catch (error) {
          if (!isCurrentTicketRequest(ticketId, ticketRequestId)) {
            return;
          }
          if (isEvaluationConflict(error)) {
            renderRecommendation(true);
            setResult({
              error: error instanceof Error ? error.message : 'An evaluation is already in progress for this ticket.',
              code: error?.code ?? 'EVALUATION_IN_PROGRESS'
            });
          } else {
            renderRecommendationError(error);
            setResult({ error: error instanceof Error ? error.message : 'Recommendation failed.' });
          }
        } finally {
          if (state.evaluationPendingTicketId === ticketId) {
            state.evaluationPendingTicketId = null;
          }
          updateControls();
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
        if (!hasLifecycleDescriptor()) {
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
          return;
        }
        await runGovernedMutation('review-recommendation', async function () {
          return requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/approve', {
            method: 'POST',
            body: JSON.stringify(body)
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true,
          afterSuccess: async function (data) {
            resetApprovalControls();
            await loadMetrics(data);
          }
        });
      }

      async function rejectRecommendation() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        const feedback = els.feedback.value.trim();
        if (!hasLifecycleDescriptor()) {
          const data = await rejectCurrentRecommendation(feedback);
          markSelectedTicketActive();
          resetRecommendationState();
          renderTicket();
          renderTicketList();
          renderRecommendation();
          await loadMetrics(data);
          await refreshEvidenceBestEffort();
          return;
        }
        await runGovernedMutation('review-recommendation', async function () {
          return rejectCurrentRecommendation(feedback);
        }, {
          waitForDiagnoses: true,
          blockedMessage: 'Recommendation review is not available in the current lifecycle state.',
          afterSuccess: async function (data) {
            markSelectedTicketActive();
            resetRecommendationState();
            renderTicket();
            renderTicketList();
            renderRecommendation();
            await loadMetrics(data);
          }
        });
      }

      async function rejectCurrentRecommendation(feedback) {
        if (state.recommendation === null || state.selectedTicket === null) {
          throw new Error('No recommendation selected.');
        }
        return rejectRecommendationById(
          state.recommendation.id,
          state.selectedTicket.id,
          els.actor.value.trim(),
          feedback
        );
      }

      async function rejectRecommendationById(recommendationId, ticketId, actor, feedback) {
        return requestJson('/api/recommendations/' + encodeURIComponent(recommendationId) + '/reject', {
          method: 'POST',
          body: JSON.stringify({
            ticketId,
            actor,
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
        if (isApprovedWorkflow()) {
          await markResponseSent();
          return;
        }
        await approveRecommendation();
      }

      async function markResponseSent() {
        if (state.recommendation === null || state.selectedTicket === null) {
          return;
        }
        if (!hasLifecycleDescriptor()) {
          const data = await requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/mark-sent', {
            method: 'POST',
            body: JSON.stringify({
              ticketId: state.selectedTicket.id,
              actor: els.actor.value.trim() || 'approval-desk',
              automaticReplyEnabled: !els.disableAutomaticReplies.checked
            })
          });
          setResult(data);
          await refreshSelectedTicketQueueAndEvidence();
          return;
        }
        await runGovernedMutation('send-customer-response', async function () {
          return requestJson('/api/recommendations/' + encodeURIComponent(state.recommendation.id) + '/mark-sent', {
            method: 'POST',
            body: JSON.stringify({
              ticketId: state.selectedTicket.id,
              actor: els.actor.value.trim() || 'approval-desk',
              automaticReplyEnabled: !els.disableAutomaticReplies.checked
            })
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true,
          afterSuccess: function () {
            els.replyComposer.open = false;
          }
        });
      }

      async function recordDiagnosis() {
        if (state.selectedTicket === null) {
          return;
        }
        if (!hasLifecycleDescriptor()) {
          const data = await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/diagnosis', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk'
            })
          });
          setResult(data);
          await refreshSelectedTicketQueueAndEvidence();
          return;
        }
        await runGovernedMutation('record-diagnosis', async function () {
          return requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/diagnosis', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk'
            })
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true
        });
      }

      async function recordFix() {
        if (state.selectedTicket === null) {
          return;
        }
        const ticketId = state.selectedTicket.id;
        if (!hasLifecycleDescriptor()) {
          const data = await requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/fix', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk'
            })
          });
          setResult(data);
          state.diagnosisUiPhase = 'normal';
          await refreshSelectedTicketQueueAndEvidence();
          if (state.selectedTicket?.id === ticketId &&
              lifecycleActionIsAvailable('apply-scoped-fix')) {
            state.diagnosisUiPhase = 'fix';
            renderDiagnosisPanel();
            renderRecommendationStageControls();
            updateControls();
          }
          return;
        }
        await runGovernedMutation('record-fix-available', async function () {
          return requestJson('/api/tickets/' + encodeURIComponent(ticketId) + '/fix', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk'
            })
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true,
          beforeRefreshSuccess: function () {
            state.diagnosisUiPhase = 'normal';
          },
          afterRefresh: function (result) {
            if (result.error === null && state.selectedTicket?.id === ticketId &&
                (state.lifecycle?.primaryAction?.kind === 'apply-scoped-fix' || lifecycleActionIsAvailable('apply-scoped-fix'))) {
              state.diagnosisUiPhase = 'fix';
            }
            renderDiagnosisPanel();
            renderRecommendationStageControls();
            updateControls();
          }
        });
      }

      async function closeTicket() {
        if (state.selectedTicket === null) {
          return;
        }
        if (!hasLifecycleDescriptor()) {
          const data = await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/close', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk'
            })
          });
          setResult(data);
          await refreshSelectedTicketQueueAndEvidence();
          return;
        }
        await runGovernedMutation('resolve-ticket', async function () {
          return requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/close', {
            method: 'POST',
            body: JSON.stringify({
              actor: els.actor.value.trim() || 'approval-desk'
            })
          }, { writeErrorToResult: false });
        }, {
          waitForDiagnoses: true
        });
      }

      async function persistDemoCustomerReply(value) {
        if (state.selectedTicket === null) {
          return;
        }
        await persistCustomerReply(conversationScenarioBody(value), 'demo-scenario');
      }

      function confirmationReplyForTicket() {
        const ticket = state.selectedTicket ?? {};
        const searchable = [ticket.subject, ticket.description, ...(Array.isArray(ticket.tags) ? ticket.tags : [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (String(ticket.id) === 'TKT-1001' || /checkout events|activity timeline|event processing/.test(searchable)) {
          return 'This is affecting multiple EU stores. The affected store URL is https://eu-a.example.test. One affected customer ID is cus_8821. The event time was 2026-06-10 08:42 UTC. The request ID is req_1001 and the API response was 202 Accepted. The event is still missing from the profile activity timeline.';
        }
        return conversationScenarioBody('complete-evidence');
      }

      async function simulateConfirmationReply() {
        if (state.selectedTicket === null) {
          return;
        }
        await persistCustomerReply(confirmationReplyForTicket(), 'demo-confirmation');
      }

      async function persistCustomerReply(body, source) {
        if (state.selectedTicket === null) {
          return;
        }
        await requestJson('/api/tickets/' + encodeURIComponent(state.selectedTicket.id) + '/customer-replies', {
          method: 'POST',
          body: JSON.stringify({
            actor: els.actor.value.trim() || 'approval-desk',
            body,
            source
          })
        });
        resetDiagnosisAfterCustomerReply();
        await refreshSelectedTicketQueueAndEvidence();
      }

      async function addManualCustomerReply() {
        if (state.selectedTicket === null || !els.disableAutomaticReplies.checked) {
          return;
        }
        const body = els.customerReplyBody.value.trim();
        if (body === '') {
          setResult({ error: 'Customer reply cannot be empty.' });
          return;
        }
        els.customerReplyBody.value = '';
        els.predictedReply.value = '';
        els.replyComposer.open = false;
        await persistCustomerReply(body, 'manual');
      }

      function hasCustomerReplyAfterCurrentRecommendation() {
        if (state.recommendation?.createdAt === undefined) {
          return false;
        }
        return Array.isArray(state.conversationTimeline) && state.conversationTimeline.some(function (item) {
          return item.kind === 'customer-reply' && String(item.timestamp ?? '') > state.recommendation.createdAt;
        });
      }

      async function refreshSelectedTicketQueueAndEvidence(options) {
        const selectedId = state.selectedTicket?.id;
        if (selectedId !== undefined) {
          await selectTicket(selectedId, options);
        }
        await loadQueue();
        await refreshEvidenceBestEffort();
      }

      function governedMutationUnavailableMessage(kind, fallbackMessage) {
        const message = lifecycleActionReason(kind) || fallbackMessage || 'This action is not available in the current lifecycle state.';
        return message.length === 0
          ? message
          : message.charAt(0).toUpperCase() + message.slice(1);
      }

      async function refreshGovernedMutationState(options) {
        const selectedId = options.ticketId;
        const queueRefresh = loadQueue({ writeErrorToResult: false }).catch(function () {
          // Queue freshness is useful but cannot change the outcome of a durable POST.
        });
        const evidenceRefresh = refreshEvidenceBestEffort();
        await selectTicket(selectedId, {
          waitForDiagnoses: options?.waitForDiagnoses === true,
          preservePresentation: options?.preservePresentation === true,
          propagateError: true
        });
        await queueRefresh;
        await evidenceRefresh;
      }

      async function refreshCurrentSelectionAfterMutationSelectionChange(ticketId, selectionToken, options) {
        if (state.ticketSelectionToken === selectionToken) {
          return;
        }
        const selectedId = state.selectedTicket?.id;
        if (selectedId === undefined || selectedId === ticketId) {
          return;
        }
        await selectTicket(selectedId, {
          waitForDiagnoses: options?.waitForDiagnoses === true
        });
      }

      async function runGovernedMutation(kind, post, options) {
        if (state.selectedTicket === null) {
          return null;
        }
        if (state.governedMutationToken !== null) {
          return null;
        }
        if (hasLifecycleDescriptor() && !lifecycleActionIsAvailable(kind)) {
          const message = governedMutationUnavailableMessage(kind, options?.blockedMessage);
          if (typeof options?.setInlineError === 'function') {
            options.setInlineError(message);
          }
          if (typeof options?.render === 'function') {
            options.render();
          }
          setResult({ error: message });
          return null;
        }
        if (typeof options?.isCurrent === 'function' && !options.isCurrent()) {
          return null;
        }
        const ticketId = state.selectedTicket.id;
        const selectionToken = state.ticketSelectionToken;
        const mutationToken = ++state.nextGovernedMutationToken;
        state.governedMutationToken = mutationToken;
        const isCurrent = function () {
          return state.governedMutationToken === mutationToken &&
            isCurrentTicketSelection(ticketId, selectionToken) &&
            (typeof options?.isCurrent !== 'function' || options.isCurrent());
        };
        updateControls();
        let data = null;
        let mutationError = null;
        try {
          try {
            data = await post();
          } catch (error) {
            mutationError = error instanceof Error ? error : new Error('Request failed.');
          }
          if (!isCurrent()) {
            await refreshCurrentSelectionAfterMutationSelectionChange(ticketId, selectionToken, options);
            return null;
          }
          if (mutationError === null) {
            if (typeof options?.clearInlineError === 'function') {
              options.clearInlineError();
            }
            if (typeof options?.beforeRefreshSuccess === 'function') {
              options.beforeRefreshSuccess(data);
            }
          } else if (typeof options?.setInlineError === 'function') {
            options.setInlineError(mutationError.message, mutationError);
          }
          try {
            await refreshGovernedMutationState({
              ticketId,
              waitForDiagnoses: options?.waitForDiagnoses === true,
              preservePresentation: mutationError !== null && options?.preservePresentationOnError === true
            });
          } catch (refreshError) {
            if (mutationError === null) {
              return null;
            }
          }
          if (!isCurrent()) {
            await refreshCurrentSelectionAfterMutationSelectionChange(ticketId, selectionToken, options);
            return null;
          }
          if (typeof options?.afterRefresh === 'function') {
            options.afterRefresh({ data, error: mutationError });
          }
          if (mutationError !== null) {
            setResult({ error: mutationError.message, code: mutationError.code });
            return null;
          }
          if (typeof options?.afterSuccess === 'function') {
            await options.afterSuccess(data);
            if (!isCurrent()) {
              await refreshCurrentSelectionAfterMutationSelectionChange(ticketId, selectionToken, options);
              return null;
            }
          }
          setResult(data);
          return data;
        } finally {
          if (state.governedMutationToken === mutationToken) {
            state.governedMutationToken = null;
          }
          updateControls();
        }
      }

      function presentationPhaseAfterBack(phase) {
        const primary = state.lifecycle?.primaryAction?.kind;
        if (hasLifecycleDescriptor()) {
          if (primary === 'review-diagnosis' || primary === 'revalidate-diagnosis') {
            return 'diagnosis';
          }
          if (phase === 'approved' && (primary === 'record-fix-available' || primary === 'apply-scoped-fix')) {
            return 'approved';
          }
          return 'normal';
        }
        if (phase === 'normal') return 'normal';
        if (phase === 'approved') return primary === 'record-fix-available' || primary === 'apply-scoped-fix'
          ? 'approved'
          : 'auto';
        if (phase === 'diagnosis') return ['review-diagnosis', 'revalidate-diagnosis'].includes(primary)
          ? 'diagnosis'
          : 'auto';
        return 'auto';
      }

      async function refreshAfterPresentationBack(phase) {
        const ticketId = state.selectedTicket?.id;
        state.selectedDiagnosisId = null;
        if (ticketId === undefined) return;
        await refreshSelectedTicketQueueAndEvidence({ waitForDiagnoses: true, preservePresentation: true });
        if (state.selectedTicket?.id !== ticketId) return;
        state.diagnosisUiPhase = presentationPhaseAfterBack(phase);
        renderDiagnosisPanel();
        renderRecommendationStageControls();
        updateControls();
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
          state.selectedTicket?.recommendationSummary?.latestResolution === 'approved' ||
          state.lifecycle?.primaryAction?.kind === 'send-customer-response';
      }

      function isCollectingEvidenceWorkflow() {
        return state.recommendation !== null &&
          Array.isArray(state.recommendation.missingEvidence) &&
          state.recommendation.missingEvidence.length > 0;
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
        const method = String(init?.method ?? 'GET').toUpperCase();
        const commandId = method === 'GET' || method === 'HEAD'
          ? null
          : crypto.randomUUID();
        const headers = {
          'content-type': 'application/json',
          ...(commandId === null ? {} : { 'Idempotency-Key': commandId }),
          ...(init?.headers ?? {})
        };
        const request = { ...init, headers };
        // A user action creates this request once; any transport retry reuses
        // the same immutable Idempotency-Key rather than minting another ID.
        const response = await fetch(path, request);
        const data = await response.json();
        if (!response.ok) {
          if (options?.writeErrorToResult !== false) {
            setResult(data);
          }
          const error = new Error(data.error?.message ?? 'Request failed.');
          error.code = data.error?.code;
          error.status = response.status;
          throw error;
        }
        return data;
      }

      function isRecommendationStillPending(recommendationId) {
        return (state.recommendation?.id === recommendationId && state.recommendation.resolution === 'pending') ||
          state.recommendationHistory.some(function (recommendation) {
            return recommendation.id === recommendationId && recommendation.resolution === 'pending';
          });
      }

      function isEvaluationConflict(error) {
        return error?.status === 409 || error?.code === 'EVALUATION_IN_PROGRESS';
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

      function formatEvidencePercentage(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? (numeric * 100).toFixed(1) + '%' : 'unknown';
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

      els.actionBarPosition.addEventListener('change', function () {
        setActionBarDock(els.actionBarPosition.value);
      });
      els.disableAutomaticReplies.addEventListener('change', updateControls);
      els.manualRepliesButton.addEventListener('click', function () {
        els.disableAutomaticReplies.checked = !els.disableAutomaticReplies.checked;
        els.replyComposer.open = els.disableAutomaticReplies.checked;
        updateControls();
      });
      els.actor.addEventListener('input', updateControls);
      els.addCustomerReply.addEventListener('click', function () {
        void addManualCustomerReply().catch(function (error) { setResult({ error: error.message }); });
      });
      els.simulateConfirmationButton.addEventListener('click', function () {
        void simulateConfirmationReply().catch(function (error) { setResult({ error: error.message }); });
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
      els.patternActionBar.addEventListener('click', function (event) {
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
      els.patternActionBar.addEventListener('change', function (event) {
        if (event.target?.dataset?.knowledgeEvidence !== 'true') return;
        const checked = typeof document.querySelectorAll === 'function'
          ? Array.from(document.querySelectorAll('[data-knowledge-evidence="true"]:checked')).map(function (item) { return item.value; })
          : [];
        const evidenceField = document.getElementById('knowledgeEvidenceIds');
        if (evidenceField !== undefined && evidenceField !== null) {
          evidenceField.value = checked.join(', ');
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
        const actionTarget = event.target?.dataset?.action === undefined && typeof event.target?.closest === 'function'
          ? event.target.closest('[data-action]')
          : event.target;
        const action = actionTarget?.dataset?.action;
        if (action === 'select-diagnosis') {
          state.selectedDiagnosisId = actionTarget.dataset.diagnosisId;
          state.diagnosisDraft = null;
          state.diagnosisDraftId = null;
          state.diagnosisReviewRationale = '';
          state.diagnosisReviewDecision = null;
          state.diagnosisReviewError = null;
          state.diagnosisImpact = { rationale: '', selectedTicketIds: [], ticketReasons: {} };
          state.diagnosisFixResults = [];
          renderDiagnosisPanel();
        }
        if (action === 'review-diagnosis') {
          void reviewSelectedDiagnosis(actionTarget.dataset.decision).catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'open-diagnosis-inspection') {
          const latest = latestDiagnosisView();
          const selected = selectedDiagnosisView();
          if (latest !== null && selected?.originalDiagnosis?.id !== latest.originalDiagnosis?.id &&
              diagnosisContextForView(latest)?.confidence === 'confirmed') {
            state.selectedDiagnosisId = latest.originalDiagnosis.id;
            state.diagnosisDraft = null;
            state.diagnosisDraftId = null;
          }
          state.diagnosisReviewDecision = actionTarget.dataset.reviewDecision ?? null;
          state.diagnosisReviewError = null;
          state.diagnosisUiPhase = 'inspection';
          renderDiagnosisPanel();
          updateControls();
        }
        if (action === 'reopen-diagnosis-evaluation') {
          state.diagnosisUiPhase = 'normal';
          renderDiagnosisPanel();
          renderRecommendationStageControls();
          updateControls();
          void createRecommendation().catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'back-to-diagnosis') {
          void refreshAfterPresentationBack('diagnosis').catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'back-to-current-diagnosis') {
          void refreshAfterPresentationBack('auto').catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'back-to-approved-diagnosis') {
          void refreshAfterPresentationBack('approved').catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'open-scoped-fix') {
          if (!lifecycleMutationAvailable('apply-scoped-fix')) return;
          state.diagnosisUiPhase = 'fix';
          renderDiagnosisPanel();
          renderRecommendationStageControls();
          updateControls();
        }
        if (action === 'open-approved-diagnosis') {
          state.diagnosisUiPhase = 'approved';
          renderDiagnosisPanel();
          renderRecommendationStageControls();
          updateControls();
        }
        if (action === 'back-to-normal-action-bar') {
          void refreshAfterPresentationBack('normal').catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'prepare-diagnosis-response') {
          state.diagnosisUiPhase = 'normal';
          renderDiagnosisPanel();
          renderRecommendationStageControls();
          updateControls();
        }
        if (action === 'simulate-solution') {
          void recordFix().catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'record-fix-available') {
          void recordFix().catch(function (error) { setResult({ error: error.message }); });
        }
        if (action === 'simulate-confirmation') {
          void simulateConfirmationReply().catch(function (error) { setResult({ error: error.message }); });
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
       els.decisionTimelinePanel.addEventListener('click', function (event) {
         const category = event.target?.dataset?.timelineCategory;
         const actor = event.target?.dataset?.timelineActor;
         if (category !== undefined) {
           state.decisionTimelineCategory = category;
           renderDecisionTimeline();
         }
         if (actor !== undefined) {
           state.decisionTimelineActor = actor;
           renderDecisionTimeline();
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
      els.discoverKnowledgeButton.addEventListener('click', function () {
        void discoverKnowledgePattern().catch(function (error) { setResult({ error: error.message }); });
      });
      els.reviewKnowledgePatternButton.addEventListener('click', focusKnowledgePattern);
      els.diagnoseButton.addEventListener('click', function () {
        const existingDiagnosis = selectedDiagnosisView();
        if (state.diagnosisUiPhase === 'normal' && existingDiagnosis !== null) {
          // Reopening the readable diagnosis is local navigation. Only the
          // record-diagnosis lifecycle action may invoke the mutation below.
          state.diagnosisUiPhase = isDiagnosisApproved(existingDiagnosis) ? 'approved' : 'diagnosis';
          renderDiagnosisPanel();
          renderRecommendationStageControls();
          updateControls();
          return;
        }
        void recordDiagnosis().catch(function (error) { setResult({ error: error.message }); });
      });
      els.fixButton.addEventListener('click', function () {
        if (hasLifecycleDescriptor() && lifecycleActionIsAvailable('apply-scoped-fix')) {
          state.diagnosisUiPhase = 'fix';
          renderDiagnosisPanel();
          renderRecommendationStageControls();
          updateControls();
          return;
        }
        void recordFix().catch(function (error) { setResult({ error: error.message }); });
      });
      els.closeTicketButton.addEventListener('click', function () {
        void closeTicket().catch(function (error) { setResult({ error: error.message }); });
      });
      els.approveButton.addEventListener('click', function () {
        if (hasRequiredReviewGate()) {
          focusRequiredReview();
          return;
        }
        void completeTask().catch(function (error) { setResult({ error: error.message }); });
      });
      els.approveEditedButton.addEventListener('click', function () {
        if (hasRequiredReviewGate()) {
          focusRequiredReview();
          return;
        }
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
