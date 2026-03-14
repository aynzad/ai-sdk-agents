import { test, expect } from "@playwright/test";

function mockStreamResponse(text: string): string {
  const parts = [
    `0:${JSON.stringify({ messageId: "msg-1", role: "assistant", parts: [] })}\n`,
    `2:${JSON.stringify({ text })}\n`,
    `8:${JSON.stringify({ messageId: "msg-1" })}\n`,
  ];
  return parts.join("");
}

test.describe("Human-in-the-Loop", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockStreamResponse(
          "I can help you look up and update database records. What would you like to do?",
        ),
      });
    });
    await page.goto("/");
  });

  test("shows empty state with suggestions", async ({ page }) => {
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByText("Look up record #123")).toBeVisible();
    await expect(
      page.getByText("Update the email for record #123"),
    ).toBeVisible();
  });

  test("clicking suggestion fills input", async ({ page }) => {
    await page.getByText("Look up record #123").click();
    await expect(page.getByTestId("chat-input")).toHaveValue(
      "Look up record #123",
    );
  });

  test("sends a message and receives response", async ({ page }) => {
    await page.getByTestId("chat-input").fill("Look up record #123");
    await page.getByTestId("send-button").click();

    const userMessage = page.getByTestId("message-user").first();
    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText("Look up record #123");

    const assistantMessage = page.getByTestId("message-assistant").first();
    await expect(assistantMessage).toBeVisible({ timeout: 10_000 });
    await expect(assistantMessage).toContainText("database records");
  });

  test("input clears after sending", async ({ page }) => {
    const input = page.getByTestId("chat-input");
    await input.fill("Test");
    await page.getByTestId("send-button").click();
    await expect(input).toHaveValue("");
  });

  test("send button is disabled when empty", async ({ page }) => {
    await expect(page.getByTestId("send-button")).toBeDisabled();
  });
});
