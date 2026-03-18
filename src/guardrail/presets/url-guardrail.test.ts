import { describe, it, expect } from "vitest";
import { urlGuardrail } from "./url-guardrail";
import { createRunContext, createGuardrailInput } from "ai-sdk-agents/test";

describe("urlGuardrail", () => {
  const ctx = createRunContext();

  it("should have the name 'url_guardrail'", () => {
    const guard = urlGuardrail();
    expect(guard.name).toBe("url_guardrail");
  });

  // --- Basic URL detection ---
  it("should detect http URLs by default", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [
        { role: "user", content: "Visit http://example.com for info" },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect(result.metadata?.detectedUrls).toContain("http://example.com");
  });

  it("should detect https URLs by default", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Go to https://example.com/path" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Allowed domains ---
  it("should not trip on allowed domains", async () => {
    const guard = urlGuardrail({ allowedDomains: ["example.com"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "See https://example.com/docs" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should trip on domains not in the allow list", async () => {
    const guard = urlGuardrail({ allowedDomains: ["example.com"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "See https://evil.com/payload" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Blocked domains ---
  it("should trip on blocked domains", async () => {
    const guard = urlGuardrail({ blockedDomains: ["evil.com"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Go to https://evil.com/bad" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should not trip on non-blocked domains when blockedDomains is set", async () => {
    const guard = urlGuardrail({ blockedDomains: ["evil.com"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "See https://safe.com/page" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Blocked schemes ---
  it("should block javascript: scheme by default", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Click javascript:alert(1)" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should block data: scheme by default", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Image: data:text/html,<script>alert(1)</script>",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Custom allowed schemes ---
  it("should allow custom schemes when domain is also allowed", async () => {
    const guard = urlGuardrail({
      allowedSchemes: ["https", "http", "ftp"],
      allowedDomains: ["files.example.com"],
    });
    const input = createGuardrailInput({
      messages: [
        { role: "user", content: "Download ftp://files.example.com/doc.pdf" },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should block disallowed schemes even when domain is allowed", async () => {
    const guard = urlGuardrail({
      allowedSchemes: ["https"],
      allowedDomains: ["example.com"],
    });
    const input = createGuardrailInput({
      messages: [
        { role: "user", content: "Download ftp://example.com/doc.pdf" },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Credential injection (userinfo) ---
  it("should block URLs with credentials by default", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Login at https://admin:password@example.com",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should allow credentials when blockUserInfo is false", async () => {
    const guard = urlGuardrail({
      blockUserInfo: false,
      allowedDomains: ["example.com"],
    });
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "See https://user:pass@example.com",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- No URLs ---
  it("should not trip on text without URLs", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Hello, how are you today?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Empty ---
  it("should not trip on empty messages", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({ messages: [] });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  // --- Structured content ---
  it("should handle structured content parts", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Visit http://example.com" }],
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Custom name ---
  it("should support custom name", () => {
    const guard = urlGuardrail({ name: "my-url-check" });
    expect(guard.name).toBe("my-url-check");
  });

  // --- Subdomain matching ---
  it("should allow subdomains of allowed domains", async () => {
    const guard = urlGuardrail({ allowedDomains: ["example.com"] });
    const input = createGuardrailInput({
      messages: [
        { role: "user", content: "See https://docs.example.com/guide" },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should block subdomains of blocked domains", async () => {
    const guard = urlGuardrail({ blockedDomains: ["evil.com"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "See https://sub.evil.com/bad" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  // --- Multiple URLs ---
  it("should detect multiple URLs and report all", async () => {
    const guard = urlGuardrail();
    const input = createGuardrailInput({
      messages: [
        {
          role: "user",
          content: "Check http://a.com and https://b.com",
        },
      ],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
    expect((result.metadata?.detectedUrls as string[]).length).toBe(2);
  });
});
