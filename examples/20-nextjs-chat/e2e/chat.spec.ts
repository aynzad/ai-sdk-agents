import { test, expect } from "@playwright/test";

function mockStreamResponse(text: string): string {
  const parts = [
    `0:${JSON.stringify({ messageId: "msg-1", role: "assistant", parts: [] })}\n`,
    `2:${JSON.stringify({ text })}\n`,
    `8:${JSON.stringify({ messageId: "msg-1" })}\n`,
  ];
  return parts.join("");
}

test.describe("Chat Interface", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockStreamResponse(
          "Hello! I am a helpful assistant. How can I help you today?",
        ),
      });
    });
    await page.goto("/");
  });

  test("shows empty state on load", async ({ page }) => {
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("send-button")).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await expect(page.getByTestId("send-button")).toBeDisabled();
  });

  test("send button enables when input has text", async ({ page }) => {
    await page.getByTestId("chat-input").fill("Hello");
    await expect(page.getByTestId("send-button")).toBeEnabled();
  });

  test("sends a message and shows user message", async ({ page }) => {
    await page.getByTestId("chat-input").fill("Hello AI!");
    await page.getByTestId("send-button").click();

    const userMessage = page.getByTestId("message-user").first();
    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText("Hello AI!");
  });

  test("receives and displays assistant response", async ({ page }) => {
    await page.getByTestId("chat-input").fill("Hello!");
    await page.getByTestId("send-button").click();

    const assistantMessage = page.getByTestId("message-assistant").first();
    await expect(assistantMessage).toBeVisible({ timeout: 10_000 });
    await expect(assistantMessage).toContainText("helpful assistant");
  });

  test("clears input after sending", async ({ page }) => {
    const input = page.getByTestId("chat-input");
    await input.fill("Hello!");
    await page.getByTestId("send-button").click();
    await expect(input).toHaveValue("");
  });

  test("user and assistant messages have different styles", async ({
    page,
  }) => {
    await page.getByTestId("chat-input").fill("Hi!");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("message-user").first()).toBeVisible();
    await expect(page.getByTestId("message-assistant").first()).toBeVisible({
      timeout: 10_000,
    });

    const userMsg = page.getByTestId("message-user").first();
    const assistantMsg = page.getByTestId("message-assistant").first();

    await expect(userMsg).toHaveClass(/bg-blue-600/);
    await expect(assistantMsg).toHaveClass(/bg-zinc-200/);
  });
});
