---
id: performance-troubleshooting
title: Performance Troubleshooting
tags: performance, loading, browser, investigation
---
# Performance troubleshooting

A symptom alone does not confirm a cause. Do not claim a fix without verification.
For a blank campaign editor, distinguish success in an isolated browser session
from failure across sessions and admins with console loading evidence.
ChunkLoadError is a clue, not proof by itself. Missing or conflicting isolation
results require comparison before choosing a cause. Only suggest continuing in
a working session when the same campaign actually opens there. Cross-session
failure supports frontend investigation; it does not specify a mitigation.
Any correction needs the governed workflow and a check of the affected campaign
before a fix claim. Other slow pages, timeouts, and expensive campaign or segment
loads still require object, timing, and impact evidence.

## Campaign editor evidence and scope

For editor loading failures, collect the campaign or page, failure time with time
zone, browser/session details, and affected users or accounts. Reuse supplied
facts. Compare the same campaign in a private window, another browser, and with
another admin. If it remains blank, collect the console loading error and retry
time; another screenshot of the same blank page does not distinguish the causes.
Record which checks worked, failed, or were not tried. Compare different objects
and time windows separately so unlike checks do not appear to agree.

## Campaign editor session-isolation branch

When the same campaign opens in a private window or another browser, session
state is a supported investigation path. Continuing in that working session is
a scoped next step, not evidence that a platform fix was applied. If clearing
site data is proposed through the support workflow, verify the editor afterward
before calling it resolved. A later failure or inconsistent comparison keeps
the cause open; record both results rather than selecting only the success.

## Campaign editor frontend-loading branch

When private-window, different-browser, and another-admin checks all fail for
the same campaign, compare the console error and retry time for frontend
investigation. ChunkLoadError alone does not establish platform fault. Successful
isolation contradicts a simple cross-session failure explanation. Hand off the
campaign, time, checks, and console evidence to engineering when that evidence
supports the path. Do not promise an unspecified frontend mitigation.

## Performance verification and unresolved checks

For an editor correction, verify that the affected campaign opens in the tested
session and record the result and time. Continued failure requires a handoff of
the failed checks, not a resolution claim. For other performance issues, compare
account configuration, expensive campaign or segment loads, browser state, and
platform activity using the affected object, time window, and impact scope.
Check platform telemetry or other trusted evidence before claiming a fix. Explain
the suspected area in plain language and request only evidence that changes the
next action. Follow the approval and evidence boundaries in the
[support operations playbook](support-operations-playbook.md).
