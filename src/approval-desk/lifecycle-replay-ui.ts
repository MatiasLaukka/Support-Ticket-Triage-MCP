/** A self-contained, read-only browser surface for replaying evaluation snapshots. */
export const lifecycleReplayHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lifecycle Replay | Approval Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0d1117; color: #e6edf3; }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 1080px; background: #0d1117; }
      button, select { color: inherit; font: inherit; }
      button { cursor: pointer; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 28px; border-bottom: 1px solid #30363d; background: #161b22; }
      .topbar h1 { margin: 0; font-size: 1.3rem; letter-spacing: .01em; }
      .topbar p { margin: 5px 0 0; color: #8b949e; font-size: .85rem; }
      .topbar-controls { display: flex; align-items: center; gap: 12px; color: #8b949e; font-size: .8rem; }
      select { border: 1px solid #484f58; border-radius: 6px; background: #0d1117; padding: 7px 9px; }
      .workspace { display: grid; grid-template-columns: 225px 270px minmax(460px, 1fr) 315px; min-height: calc(100vh - 76px); }
      .rail, .inspector { padding: 18px 14px; border-right: 1px solid #30363d; background: #11161d; overflow: auto; }
      .inspector { border-right: 0; border-left: 1px solid #30363d; background: #161b22; }
      .rail h2, .inspector h2 { margin: 0 0 12px; font-size: .76rem; text-transform: uppercase; letter-spacing: .12em; color: #8b949e; }
      .list { display: grid; gap: 8px; }
      .list button { display: grid; gap: 4px; width: 100%; padding: 10px; border: 1px solid transparent; border-radius: 7px; text-align: left; background: transparent; }
      .list button:hover, .list button.selected { border-color: #388bfd; background: #1c2735; }
      .list strong { font-size: .86rem; }
      .list small { color: #8b949e; line-height: 1.35; }
      .ticket-divider { margin: 18px 0 7px; color: #8b949e; font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; }
      .content { padding: 24px 28px 60px; overflow: auto; }
      .content h2 { margin: 0; font-size: 1.15rem; }
      .content .subtitle { margin: 5px 0 22px; color: #8b949e; font-size: .88rem; }
      .notice { padding: 16px; border: 1px solid #6e7681; border-radius: 8px; color: #c9d1d9; background: #161b22; }
      .notice.warning { border-color: #d29922; }
      .notice.error { border-color: #f85149; }
      .timeline { display: grid; gap: 14px; }
      .event, .lane-card, .inspector-card { border: 1px solid #30363d; border-radius: 8px; background: #161b22; }
      .event { padding: 14px 16px; }
      .event h3, .lane-card h3 { margin: 0 0 8px; font-size: .87rem; }
      .event p, .lane-card p { margin: 0; white-space: pre-wrap; line-height: 1.5; font-size: .88rem; }
      .event .meta, .lane-card .meta { margin-bottom: 8px; color: #8b949e; font-size: .72rem; }
      .lanes { display: grid; gap: 12px; margin-top: 14px; }
      .lane-card { padding: 14px 16px; }
      .lane-card.pass { border-color: #238636; }
      .lane-card.fail { border-color: #da3633; }
      .lane-card.unavailable { border-color: #6e7681; }
      .badge { display: inline-block; padding: 3px 7px; border-radius: 999px; background: #30363d; color: #c9d1d9; font-size: .68rem; }
      .badge.pass { background: #1f6f36; color: #aff5b4; }
      .badge.fail { background: #7d2424; color: #ffb4ab; }
      .provenance { display: grid; gap: 8px; margin-top: 16px; }
      .inspector-card { padding: 12px; }
      .inspector-card h3 { margin: 0 0 8px; font-size: .8rem; }
      .inspector-card pre { margin: 0; color: #c9d1d9; white-space: pre-wrap; overflow-wrap: anywhere; font: .73rem/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
      .muted { color: #8b949e; }
      .customer-only { border-color: #388bfd; }
      @media (max-width: 1200px) { body { min-width: 900px; } .workspace { grid-template-columns: 190px 230px minmax(400px, 1fr) 270px; } .content { padding-left: 18px; padding-right: 18px; } }
    </style>
  </head>
  <body>
    <main id="lifecycle-replay-root">
      <header class="topbar">
        <div><h1>Lifecycle Replay</h1><p>Read-only evaluation snapshots for reviewing customer-facing behavior.</p></div>
        <div class="topbar-controls"><label for="lifecycle-replay-view-toggle">View</label><select id="lifecycle-replay-view-toggle"><option value="operator">Operator view</option><option value="customer">Customer view</option></select><span id="lifecycle-replay-status">Loading…</span></div>
      </header>
      <section class="workspace">
        <aside class="rail"><h2>Tickets</h2><div id="lifecycle-replay-ticket-list" class="list"></div></aside>
        <aside class="rail"><h2>Snapshots</h2><div id="lifecycle-replay-snapshot-list" class="list"></div></aside>
        <section class="content"><div id="lifecycle-replay-timeline" class="timeline"></div></section>
        <aside class="inspector"><h2>Provenance</h2><div id="lifecycle-replay-inspector"></div></aside>
      </section>
    </main>
    <script>
      (() => {
        const state = { model: null, ticketId: null, snapshotId: null, lane: null, view: 'operator' };
        const byId = (id) => document.getElementById(id);
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        const json = (value) => esc(JSON.stringify(value ?? {}, null, 2));
        const selectedTicket = () => state.model?.tickets.find((ticket) => ticket.ticketId === state.ticketId) ?? null;
        const selectedSnapshot = () => selectedTicket()?.snapshots.find((snapshot) => snapshot.snapshotId === state.snapshotId) ?? null;
        const selectedLane = () => selectedSnapshot()?.lanes.find((lane) => lane.lane === state.lane) ?? selectedSnapshot()?.lanes[0] ?? null;
        function setInitialSelection() {
          const ticket = state.model?.tickets[0];
          const snapshot = ticket?.snapshots[0];
          state.ticketId ??= ticket?.ticketId ?? null;
          state.snapshotId ??= snapshot?.snapshotId ?? null;
          if (!selectedSnapshot()?.lanes.some((lane) => lane.lane === state.lane)) state.lane = selectedSnapshot()?.lanes[0]?.lane ?? null;
        }
        function render() {
          const model = state.model;
          byId('lifecycle-replay-status').textContent = model?.available ? 'Replay loaded' : 'No replay loaded';
          if (!model?.available) {
            byId('lifecycle-replay-ticket-list').innerHTML = '';
            byId('lifecycle-replay-snapshot-list').innerHTML = '';
            byId('lifecycle-replay-timeline').innerHTML = '<div class="notice warning"><strong>Replay unavailable</strong><p>' + esc(model?.unavailableReason ?? 'unknown') + '. Run the evaluation first, then refresh.</p></div>';
            byId('lifecycle-replay-inspector').innerHTML = '<p class="muted">No provenance is available.</p>';
            return;
          }
          setInitialSelection();
          const ticket = selectedTicket();
          const snapshot = selectedSnapshot();
          byId('lifecycle-replay-ticket-list').innerHTML = model.tickets.map((item) => '<button class="' + (item.ticketId === state.ticketId ? 'selected' : '') + '" data-ticket="' + esc(item.ticketId) + '"><strong>' + esc(item.ticketId) + '</strong><small>' + esc(item.subject) + '</small><small>' + item.snapshots.length + ' snapshot(s)</small></button>').join('');
          byId('lifecycle-replay-snapshot-list').innerHTML = ticket ? ticket.snapshots.map((item) => '<button class="' + (item.snapshotId === state.snapshotId ? 'selected' : '') + '" data-snapshot="' + esc(item.snapshotId) + '"><strong>' + esc(item.label) + '</strong><small>' + esc(item.operatorStage ?? 'stage unavailable') + '</small></button>').join('') : '<p class="muted">Choose a ticket.</p>';
          byId('lifecycle-replay-timeline').innerHTML = snapshot ? timelineHtml(ticket, snapshot) : '<div class="notice">Choose a snapshot to begin.</div>';
          byId('lifecycle-replay-inspector').innerHTML = snapshot ? inspectorHtml(snapshot, selectedLane()) : '<p class="muted">Select a snapshot.</p>';
          document.querySelectorAll('[data-lane]').forEach((element) => element.addEventListener('change', (event) => { state.lane = event.target.value; render(); }));
        }
        function timelineHtml(ticket, snapshot) {
          const replies = snapshot.customerReplies.map((reply) => '<article class="event"><div class="meta">Customer reply · ' + esc(reply.createdAt) + '</div><h3>' + esc(ticket.customerName) + '</h3><p>' + esc(reply.body) + '</p></article>').join('');
          const previous = snapshot.previousSupportResponse ? '<article class="event"><div class="meta">Previous support response · sent</div><h3>Support</h3><p>' + esc(snapshot.previousSupportResponse.body) + '</p></article>' : '';
          const lane = selectedLane();
          const laneSelect = snapshot.lanes.length ? '<label class="muted" for="lifecycle-replay-lane-select">Evaluation lane</label> <select id="lifecycle-replay-lane-select" data-lane>' + snapshot.lanes.map((item) => '<option value="' + esc(item.lane) + '" ' + (item.lane === lane?.lane ? 'selected' : '') + '>' + esc(item.lane) + '</option>').join('') + '</select>' : '';
          return '<div><h2>' + esc(snapshot.ticket.subject) + '</h2><p class="subtitle">' + esc(snapshot.label) + ' · ' + esc(snapshot.family) + ' · Snapshot order is not inferred.</p><div class="event"><div class="meta">Ticket ' + esc(snapshot.ticket.id) + ' · ' + esc(snapshot.ticket.status) + '</div><h3>Original request</h3><p>' + esc(snapshot.ticket.description) + '</p></div>' + replies + previous + (state.view === 'customer' ? customerLaneHtml(lane) : '<div class="lanes"><div>' + laneSelect + '</div>' + snapshot.lanes.map(laneCardHtml).join('') + '</div>') + '</div>';
        }
        function customerLaneHtml(lane) {
          if (!lane) return '<div class="notice customer-only">No customer response draft is available for this snapshot.</div>';
          return '<article class="event customer-only"><div class="meta">Customer-facing draft · ' + esc(lane.lane) + '</div><h3>What the customer would see</h3><p>' + esc(lane.actualDraft ?? 'No draft available.') + '</p><p class="muted" style="margin-top:10px">Explicit approval is required before any response is sent.</p></article>';
        }
        function laneCardHtml(lane) {
          return '<article class="lane-card ' + esc(lane.result) + '"><div class="meta"><span class="badge ' + esc(lane.result) + '">' + esc(lane.result) + '</span> ' + esc(lane.lane) + '</div><h3>Draft response</h3><p>' + esc(lane.actualDraft ?? 'No draft available.') + '</p>' + (lane.deterministicBaselineDraft ? '<p class="muted" style="margin-top:10px"><strong>Deterministic baseline:</strong> ' + esc(lane.deterministicBaselineDraft) + '</p>' : '') + (lane.failureReasons.length ? '<p class="muted" style="margin-top:10px"><strong>Failure reasons:</strong> ' + esc(lane.failureReasons.join('; ')) + '</p>' : '') + '</article>';
        }
        function inspectorHtml(snapshot, lane) {
          if (state.view === 'customer') return '<p class="muted">Operator provenance is hidden in Customer view.</p>';
          if (!lane) return '<p class="muted">No evaluation lane is available.</p>';
          return '<div class="provenance"><article class="inspector-card"><h3>Selected lane</h3><pre>' + esc(lane.lane) + '</pre></article><article class="inspector-card"><h3>Classification agreement</h3><pre>' + json(lane.classificationAgreement) + '</pre></article><article class="inspector-card"><h3>Classification delta</h3><pre>' + json(lane.classificationDelta) + '</pre></article><article class="inspector-card"><h3>Provider provenance</h3><pre>' + json(lane.providerProvenance) + '</pre></article><article class="inspector-card"><h3>Quality breakdown</h3><pre>' + json(lane.qualityBreakdown) + '</pre></article><article class="inspector-card"><h3>Failure reasons</h3><pre>' + json(lane.failureReasons) + '</pre></article><article class="inspector-card"><h3>Approval boundary</h3><pre>Explicit approval is required. Replay never sends or mutates a ticket.</pre></article></div>';
        }
        byId('lifecycle-replay-view-toggle').addEventListener('change', (event) => { state.view = event.target.value; render(); });
        byId('lifecycle-replay-ticket-list').addEventListener('click', (event) => { const button = event.target.closest('[data-ticket]'); if (!button) return; state.ticketId = button.dataset.ticket; state.snapshotId = null; state.lane = null; render(); });
        byId('lifecycle-replay-snapshot-list').addEventListener('click', (event) => { const button = event.target.closest('[data-snapshot]'); if (!button) return; state.snapshotId = button.dataset.snapshot; state.lane = null; render(); });
        fetch('/api/lifecycle-replay', { headers: { accept: 'application/json' } }).then((response) => response.json()).then((model) => { state.model = model; render(); }).catch(() => { state.model = { available: false, unavailableReason: 'invalid-report' }; render(); });
      })();
    </script>
  </body>
</html>`;
