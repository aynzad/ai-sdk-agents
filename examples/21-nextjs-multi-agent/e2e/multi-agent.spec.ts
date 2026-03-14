import { test, expect } from "@playwright/test";

function mockStreamResponse(text: string): string {
  const parts = [
    `0:${JSON.stringify({ messageId: "msg-1", role: "assistant", parts: [] })}\n`,
    `2:${JSON.stringify({ text })}\n`,
    `8:${JSON.stringify({ messageId: "msg-1" })}\n`,
  ];
  return parts.join("");
}

test.describe("Multi-Agent Customer Service", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockStreamResponse(
          "Hello! Welcome to our airline. I can help with baggage policies, seat changes, refunds, and more. How can I assist you?",
        ),
      });
    });
    await page.goto("/");
  });

  test("shows welcome message and suggestion chips", async ({ page }) => {
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByText("What's the baggage policy?")).toBeVisible();
    await expect(page.getByText("I'd like to change my seat")).toBeVisible();
    await expect(page.getByText("How do I get a refund?")).toBeVisible();
  });

  test("clicking a suggestion chip fills the input", async ({ page }) => {
    await page.getByText("What's the baggage policy?").click();
    await expect(page.getByTestId("chat-input")).toHaveValue(
      "What's the baggage policy?",
    );
  });

  test("sends message and receives agent response", async ({ page }) => {
    await page.getByTestId("chat-input").fill("What is your refund policy?");
    await page.getByTestId("send-button").click();

    const userMessage = page.getByTestId("message-user").first();
    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText("refund policy");

    const assistantMessage = page.getByTestId("message-assistant").first();
    await expect(assistantMessage).toBeVisible({ timeout: 10_000 });
    await expect(assistantMessage).toContainText("airline");
  });

  test("user and assistant messages render with correct styles", async ({
    page,
  }) => {
    await page.getByTestId("chat-input").fill("Hello");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("message-user").first()).toBeVisible();
    await expect(page.getByTestId("message-assistant").first()).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByTestId("message-user").first()).toHaveClass(
      /bg-blue-600/,
    );
    await expect(page.getByTestId("message-assistant").first()).toHaveClass(
      /bg-zinc-200/,
    );
  });

  test("input is cleared after sending", async ({ page }) => {
    const input = page.getByTestId("chat-input");
    await input.fill("Test message");
    await page.getByTestId("send-button").click();
    await expect(input).toHaveValue("");
  });
});
