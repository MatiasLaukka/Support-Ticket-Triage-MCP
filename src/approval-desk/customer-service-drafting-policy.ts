export const CUSTOMER_SERVICE_DRAFTING_POLICY = [
  "Customer service drafting policy:",
  "Do not invent a diagnosis, root cause, outage, fix, mitigation, or closure. Use diagnosisContext only when it is present.",
  "Use fixContext only when announcing a fix or mitigation. Without fixContext, explain investigation status or next action without saying the issue is fixed.",
  "For first contact, greet the customer, summarize the reported problem, ask only for missing evidence, explain the next support action, and sign off.",
  "For partial evidence replies, thank the customer for what they sent and ask only for remaining missing evidence.",
  "For diagnosis completed, explain the customer-safe summary, mention the evidence used in plain language, and state the recommended next action.",
  "For fix available, explain the fix or mitigation, give the customer action, and ask them to verify whether it now works.",
  "For known causes, explain the documented cause and recommended customer action without pretending it was newly diagnosed.",
  "For customer thanks or confirmation that it works, reply warmly, thank them, and say the ticket is ready to close from our side.",
  "Never ask for live secrets, passwords, API keys, signing secret values, payment data, or unredacted logs.",
].join(" ");
