import { describe, it, expect } from "vitest";
import { secretKeyGuardrail } from "./secret-key-guardrail";
import { createRunContext, createGuardrailInput } from "ai-sdk-agents/test";

describe("secretKeyGuardrail", () => {
  const ctx = createRunContext();

  it("should have the name 'secret_key_guardrail'", () => {
    const guard = secretKeyGuardrail();
    expect(guard.name).toBe("secret_key_guardrail");
  });

  // --- Known prefixes ---
  it("should detect OpenAI API keys (sk-)", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content:
            "My key is sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedTypes).toContain("sk-");
  });

  it("should detect GitHub personal access tokens (ghp_)", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Token: ghp_1234567890abcdefghijABCDEFGHIJ12345678",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedTypes).toContain("ghp_");
  });

  it("should detect AWS access keys (AKIA)", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "AWS key: AKIAIOSFODNN7EXAMPLE",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedTypes).toContain("AKIA");
  });

  it("should detect Stripe keys (sk_live_)", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Stripe: sk_live_4eC39HqLyjWDarjtT1zdp7dc",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should detect Slack tokens (xoxb-)", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content:
            "Bot token: xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuvwx",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Sensitivity levels ---
  it("should be less sensitive in 'permissive' mode", async () => {
    const guard = secretKeyGuardrail({ sensitivity: "permissive" });
    // Short random-looking string — should not trip in permissive mode
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Code: abc123def456" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should still detect known prefixes in 'permissive' mode", async () => {
    const guard = secretKeyGuardrail({ sensitivity: "permissive" });
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Clean text ---
  it("should not trip on normal text", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How do I configure my project?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should not trip on short random strings", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "ID: abc123" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Empty ---
  it("should not trip on empty messages", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({ messages: [] });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Structured content ---
  it("should handle structured content parts", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234",
            },
          ],
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Custom name ---
  it("should support custom name", () => {
    const guard = secretKeyGuardrail({ name: "my-secret-check" });
    expect(guard.name).toBe("my-secret-check");
  });

  // --- Entropy-based detection ---
  it("should detect high-entropy tokens with mixed character diversity", async () => {
    const guard = secretKeyGuardrail({ sensitivity: "strict" });
    // A 20-char token with mixed upper, lower, and digits — high entropy
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Token: aB3dE7gH1jK9mN5pQ8rS",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedTypes).toContain("high-entropy-token");
  });

  it("should not detect tokens that lack character diversity (all lowercase)", async () => {
    const guard = secretKeyGuardrail({ sensitivity: "strict" });
    // Long but only lowercase — diversity < 2
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Token: abcdefghijklmnopqrstuvwxyz",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should skip entropy check for tokens already caught by prefix matching", async () => {
    const guard = secretKeyGuardrail({ sensitivity: "strict" });
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    // Should be detected as prefix, not as high-entropy-token
    expect(result.metadata?.detectedTypes).toContain("sk-");
  });

  it("should skip entropy-based detection in permissive mode", async () => {
    const guard = secretKeyGuardrail({ sensitivity: "permissive" });
    // High-entropy token that would be caught in balanced/strict mode
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Token: aB3dE7gH1jK9mN5pQ8rS",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Reason ---
  it("should include detected key type in reason", async () => {
    const guard = secretKeyGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "ghp_1234567890abcdefghijABCDEFGHIJ12345678",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.reason).toBeDefined();
  });
});
