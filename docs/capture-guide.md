# Screenshot And Demo Capture Guide

Use this guide to capture clean project visuals without exposing secrets or
personal local state.

## Before Capturing

1. Start a clean deterministic demo:

```powershell
npm ci
npm run build
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:APPROVAL_DRAFT_PROVIDER -ErrorAction SilentlyContinue
npm run demo:showcase
```

The optional OpenAI mode is useful for a separate experiment, but the primary
portfolio recording should use deterministic local rules so every viewer can
reproduce it without an API key or network access.

The action bar also has a **Testing mode** with a manual customer-reply
composer for edge-case testing. It is intentionally not part of the primary
recording; use the automatic reply generated after **Done** instead.

2. Do not show terminals containing `OPENAI_API_KEY`.
3. Keep the browser on the local Approval Desk URL.
4. Use synthetic tickets only. Do not paste real customer data into the demo.

Conversation Context is a read-only timeline. If you need to simulate a
customer providing new information, open the action bar's **Testing mode** and
use its manual reply composer; do not look for an editor in Conversation
Context.

## Suggested Still Screenshots

Capture these in order:

1. **Automation Evidence dashboard**
   - Shows guardrails, activity, estimated minutes saved, and audit counts.
2. **Conversation workspace**
   - Shows `TKT-1010`, the original vague ticket, the generated customer
     response draft, and the conversation timeline.
3. **Adaptive recommendation panel**
   - Shows classifier evidence, lifecycle state, Draft Customer Response,
     **What changed**, and **Why this draft is safe**.
4. **Approval controls**
   - Shows named-field approval and editable customer response.
5. **Post-approval result**
   - Shows updated ticket revision and audit JSON readback.

## Suggested GIF Flow

Keep the GIF under 45 seconds:

1. Select `TKT-1001`.
2. Choose a draft style.
3. Click **Create recommendation**.
4. Briefly hover or pause on **Why this draft is safe**.
5. Approve category and customer response with an actor, then click **Done**.
6. Show the automatic customer reply in the conversation timeline and evaluate
   the next recommendation.
7. Show the refreshed dashboard/audit result.

## Suggested README Placement

If screenshots are added later, place them under:

```text
docs/assets/
```

Recommended filenames:

```text
approval-desk-evidence.png
approval-desk-conversation.png
approval-desk-recommendation.png
approval-desk-approval-audit.png
approval-desk-showcase.gif
```

Then link them from `README.md` near **Use The Local Approval Desk**.

## Redaction Checklist

- No API keys in terminal history or screenshots.
- No real emails, domains, customer names, or payloads.
- No local absolute filesystem paths unless intentionally showing setup.
- No browser tabs with unrelated personal content.

