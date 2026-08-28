/**
 * Produce the complete Responses API URL from a baseUrl option.
 * - undefined / empty baseUrl -> https://api.openai.com/v1/responses
 * - http://localhost:11434/v1 -> http://localhost:11434/v1/responses
 * - http://localhost:11434/v1/ -> http://localhost:11434/v1/responses
 */
export function makeOpenAiResponsesUrl(baseUrl?: string): string {
  if (!baseUrl) return "https://api.openai.com/v1/responses";
  // Remove trailing slashes and append /responses
  return `${baseUrl.replace(/\/+$/, "")}/responses`;
}
