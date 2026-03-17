import { describe, it, expect } from "vitest";
import { piiGuardrail } from "./pii-guardrail";
import { createRunContext, createGuardrailInput } from "ai-sdk-agents/test";

describe("piiGuardrail", () => {
  const ctx = createRunContext();

  it("should have the name 'pii_guardrail'", () => {
    const guard = piiGuardrail();
    expect(guard.name).toBe("pii_guardrail");
  });

  // --- US Social Security Numbers ---
  it("should detect US SSNs (XXX-XX-XXXX)", async () => {
    const guard = piiGuardrail({ entities: ["US_SSN"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "My SSN is 123-45-6789" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedEntities).toContain("US_SSN");
  });

  it("should not trip on non-SSN number patterns", async () => {
    const guard = piiGuardrail({ entities: ["US_SSN"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Phone is 123-456-7890" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Email ---
  it("should detect email addresses", async () => {
    const guard = piiGuardrail({ entities: ["EMAIL"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Email me at user@example.com" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedEntities).toContain("EMAIL");
  });

  // --- Credit Card ---
  it("should detect credit card numbers (16 digits with optional separators)", async () => {
    const guard = piiGuardrail({ entities: ["CREDIT_CARD"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "My card is 4111-1111-1111-1111" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedEntities).toContain("CREDIT_CARD");
  });

  it("should detect credit card numbers with spaces", async () => {
    const guard = piiGuardrail({ entities: ["CREDIT_CARD"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Card: 4111 1111 1111 1111" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Phone ---
  it("should detect US phone numbers", async () => {
    const guard = piiGuardrail({ entities: ["PHONE_US"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Call me at (555) 123-4567" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedEntities).toContain("PHONE_US");
  });

  it("should detect US phone numbers with +1 prefix", async () => {
    const guard = piiGuardrail({ entities: ["PHONE_US"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Call +1-555-123-4567" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- IP Address ---
  it("should detect IPv4 addresses", async () => {
    const guard = piiGuardrail({ entities: ["IP_ADDRESS"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Server at 192.168.1.100" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedEntities).toContain("IP_ADDRESS");
  });

  // --- Passport ---
  it("should detect US passport numbers", async () => {
    const guard = piiGuardrail({ entities: ["US_PASSPORT"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Passport number: C12345678" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Date of Birth ---
  it("should detect dates of birth (MM/DD/YYYY)", async () => {
    const guard = piiGuardrail({ entities: ["DATE_OF_BIRTH"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Born on 01/15/1990" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- IBAN ---
  it("should detect IBAN numbers", async () => {
    const guard = piiGuardrail({ entities: ["IBAN"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "IBAN: DE89370400440532013000" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Multiple entities ---
  it("should detect multiple entity types in one message", async () => {
    const guard = piiGuardrail({ entities: ["EMAIL", "US_SSN"] });
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "SSN 123-45-6789 email user@test.com",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedEntities).toContain("EMAIL");
    expect(result.metadata?.detectedEntities).toContain("US_SSN");
  });

  // --- Default (all entities) ---
  it("should check all entities when none specified", async () => {
    const guard = piiGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "My SSN is 123-45-6789" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Clean text ---
  it("should not trip on clean text", async () => {
    const guard = piiGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Hello, how are you today?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Empty messages ---
  it("should not trip on empty messages", async () => {
    const guard = piiGuardrail();
    const input = createGuardrailInput({ messages: [] });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- ContentPart format ---
  it("should handle structured content parts", async () => {
    const guard = piiGuardrail({ entities: ["EMAIL"] });
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Email: test@example.com" }],
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Custom name ---
  it("should support custom name", () => {
    const guard = piiGuardrail({ name: "my-pii-check" });
    expect(guard.name).toBe("my-pii-check");
  });

  // --- Reason includes entity types ---
  it("should include detected entity types in reason", async () => {
    const guard = piiGuardrail({ entities: ["EMAIL"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Email: foo@bar.com" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.reason).toContain("EMAIL");
  });
});
