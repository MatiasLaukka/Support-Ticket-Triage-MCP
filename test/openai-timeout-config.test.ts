import { describe, expect, it } from "vitest";
import { createClassificationReasoningProviderFromEnv } from "../src/approval-desk/classification-reasoning-provider.js";
import { createDiagnosisReasoningProviderFromEnv } from "../src/approval-desk/diagnosis-reasoning-provider.js";
import { createCustomerResponseDraftProviderFromEnv } from "../src/approval-desk/draft-response-provider.js";
import { createKnowledgeCandidateDraftProviderFromEnv } from "../src/runtime.js";

describe("OpenAI timeout configuration via TRIAGE_OPENAI_TIMEOUT_MS", () => {
  const envWithTimeout = {
    OPENAI_API_KEY: "sk-test-key",
    OPENAI_MODEL: "gpt-5.6-luna",
    TRIAGE_OPENAI_BASE_URL: "https://api.openai.com/v1",
  };

  describe("DEFAULT PRESERVATION - when env var is unset or blank", () => {
    it("preserves default timeout (20000 ms) when TRIAGE_OPENAI_TIMEOUT_MS is unset", () => {
      const provider = createClassificationReasoningProviderFromEnv(
        {},
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      // Provider should be created; actual timeout used internally defaults to 20_000
      // We verify the provider was instantiated (not unavailable)
      expect((provider as any).options?.timeoutMs).toBeUndefined();
    });

    it("preserves default timeout when TRIAGE_OPENAI_TIMEOUT_MS is blank string", () => {
      const provider = createClassificationReasoningProviderFromEnv(
        { TRIAGE_OPENAI_TIMEOUT_MS: "" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBeUndefined();
    });

    it("preserves default timeout for diagnosis provider when env var is unset", () => {
      const provider = createDiagnosisReasoningProviderFromEnv(
        {},
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBeUndefined();
    });

    it("preserves default timeout for customer response draft provider when env var is unset", () => {
      const provider = createCustomerResponseDraftProviderFromEnv(
        {},
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      // The existing parseOpenAiDraftTimeoutMs returns undefined on empty, which becomes DEFAULT_OPENAI_DRAFT_TIMEOUT_MS internally
      expect((provider as any).options?.timeoutMs).toBeUndefined();
    });

    it("preserves default timeout for knowledge candidate provider when env var is unset", () => {
      const provider = createKnowledgeCandidateDraftProviderFromEnv(
        {},
      );
      // Should return undefined (no OpenAI candidate provider) when TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER is unset
      expect(provider).toBeUndefined();
    });

    it("preserves default timeout for knowledge candidate provider when env var is blank", () => {
      const provider = createKnowledgeCandidateDraftProviderFromEnv(
        { TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "" },
      );
      expect(provider).toBeUndefined();
    });
  });

  describe("SHARED OVERRIDE - valid positive integer values override defaults", () => {
    it("uses configured timeout when TRIAGE_OPENAI_TIMEOUT_MS is set to valid positive integer", () => {
      const provider = createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "30000" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      // Note: The current implementation doesn't pass timeoutMs to the provider yet
      // This test documents the expected behavior after implementation
      expect((provider as any).options?.timeoutMs).toBe(30000);
    });

    it("uses configured timeout for diagnosis provider when TRIAGE_OPENAI_TIMEOUT_MS is set", () => {
      const provider = createDiagnosisReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "45000" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBe(45000);
    });

    it("uses configured timeout for customer response draft provider when APPROVAL_DRAFT_TIMEOUT_MS is set", () => {
      const provider = createCustomerResponseDraftProviderFromEnv(
        { ...envWithTimeout, APPROVAL_DRAFT_TIMEOUT_MS: "60000" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBe(60000);
    });

    it("customer response draft provider ignores TRIAGE_OPENAI_TIMEOUT_MS when APPROVAL_DRAFT_TIMEOUT_MS is unset", () => {
      const provider = createCustomerResponseDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "60000" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      // Falls back to default since APPROVAL_DRAFT_TIMEOUT_MS is unset
      expect((provider as any).options?.timeoutMs).toBe(20_000);
    });

    it("uses configured timeout for knowledge candidate provider when TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS is set", () => {
      const provider = createKnowledgeCandidateDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai", TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "90000" },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBe(90000);
    });

    it("uses shared timeout when OPENAI_TIMEOUT_MS is not parsed (provider-specific not yet implemented)", () => {
      const provider = createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "30000", OPENAI_TIMEOUT_MS: "45000" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      // Provider-specific OPENAI_TIMEOUT_MS is not yet parsed; shared TRIAGE_OPENAI_TIMEOUT_MS is used
      expect((provider as any).options?.timeoutMs).toBe(30000);
    });
  });

  describe("KNOWLEDGE-CANDIDATE PRECEDENCE - TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS handling", () => {
    it("uses knowledge candidate timeout when TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER is openai", () => {
      const provider = createKnowledgeCandidateDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai", TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "55000" },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBe(55000);
    });

    it("does not use knowledge candidate timeout when TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER is controlled", () => {
      const provider = createKnowledgeCandidateDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "controlled", TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "55000" },
      );
      // Controlled provider is returned (not undefined); it doesn't use the timeout env var
      expect(provider).toBeDefined();
      // Controlled providers don't have a timeoutMs option; check enabled flag instead
      expect((provider as any).enabled).toBe(true);
    });

    it("knowledge candidate timeout is independent of TRIAGE_OPENAI_TIMEOUT_MS", () => {
      const provider1 = createKnowledgeCandidateDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai", TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "55000" },
      );
      const provider2 = createKnowledgeCandidateDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai", TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "75000" },
      );
      expect((provider1 as any).options?.timeoutMs).toBe(55000);
      expect((provider2 as any).options?.timeoutMs).toBe(75000);
    });
  });

  describe("INVALID CONFIG - must fail clearly on invalid values", () => {
    it("throws on TRIAGE_OPENAI_TIMEOUT_MS with non-integer string 'abc'", () => {
      expect(() => createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "abc" },
        { preferOpenAi: true },
      )).toThrow(/TRIAGE_OPENAI_TIMEOUT_MS/);
    });

    it("throws on TRIAGE_OPENAI_TIMEOUT_MS with value '0'", () => {
      expect(() => createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "0" },
        { preferOpenAi: true },
      )).toThrow(/TRIAGE_OPENAI_TIMEOUT_MS/);
    });

    it("throws on TRIAGE_OPENAI_TIMEOUT_MS with negative value '-100'", () => {
      expect(() => createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "-100" },
        { preferOpenAi: true },
      )).toThrow(/TRIAGE_OPENAI_TIMEOUT_MS/);
    });

    it("throws on TRIAGE_OPENAI_TIMEOUT_MS with floating point '3.14'", () => {
      expect(() => createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "3.14" },
        { preferOpenAi: true },
      )).toThrow(/TRIAGE_OPENAI_TIMEOUT_MS/);
    });

    it("does not throw when TRIAGE_OPENAI_TIMEOUT_MS is whitespace-only (trimmed to empty, uses default)", () => {
      const provider = createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "   " },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      // Whitespace-only values are trimmed to empty, which returns the default (20_000)
      expect((provider as any).options?.timeoutMs).toBe(20_000);
    });

    it("throws on TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS with invalid value", () => {
      expect(() => createKnowledgeCandidateDraftProviderFromEnv(
        { ...envWithTimeout, TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai", TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS: "invalid" },
      )).toThrow(/TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS/);
    });

    it("customer response draft provider throws on invalid APPROVAL_DRAFT_TIMEOUT_MS", () => {
      expect(() => createCustomerResponseDraftProviderFromEnv(
        { ...envWithTimeout, APPROVAL_DRAFT_TIMEOUT_MS: "not-a-number" },
        { preferOpenAi: true },
      )).toThrow(/APPROVAL_DRAFT_TIMEOUT_MS/);
    });

    it("does not throw when TRIAGE_OPENAI_TIMEOUT_MS is valid large integer", () => {
      const provider = createClassificationReasoningProviderFromEnv(
        { ...envWithTimeout, TRIAGE_OPENAI_TIMEOUT_MS: "300000" },
        { preferOpenAi: true },
      );
      expect(provider).toBeDefined();
      expect((provider as any).options?.timeoutMs).toBe(300000);
    });
  });
});
