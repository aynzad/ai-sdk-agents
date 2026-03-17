import { test, expect } from "./fixtures/polly.fixture";
import { buildChatSSE } from "./fixtures/mock-stream";

test.describe("21-nextjs-chat — Agent + Runner.stream()", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: buildChatSSE(
          "Hello! I'm a helpful assistant powered by ai-sdk-agents. How can I help you today?",
        ),
      });
    });
    await page.goto("/");
  });

  test("renders empty state when no messages exist", async ({ page }) => {
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeEnabled();
    await expect(page.getByTestId("send-button")).toBeDisabled();
  });

  test("send button enables when input has text and disables when empty", async ({
    page,
  }) => {
    const sendBtn = page.getByTestId("send-button");
    const input = page.getByTestId("chat-input");

    await expect(sendBtn).toBeDisabled();
    await input.fill("Hello");
    await expect(sendBtn).toBeEnabled();
    await input.fill("");
    await expect(sendBtn).toBeDisabled();
  });

  test("sends a message and displays streamed assistant response", async ({
    page,
  }) => {
    await page.getByTestId("chat-input").fill("Hello AI!");
    await page.getByTestId("send-button").click();

    const userMsg = page.getByTestId("message-user").first();
    await expect(userMsg).toBeVisible();
    await expect(userMsg).toContainText("Hello AI!");

    const assistantMsg = page.getByTestId("message-assistant").first();
    await expect(assistantMsg).toBeVisible({ timeout: 10_000 });
    await expect(assistantMsg).toContainText("ai-sdk-agents");
  });

  test("clears input field after sending a message", async ({ page }) => {
    const input = page.getByTestId("chat-input");
    await input.fill("Test message");
    await page.getByTestId("send-button").click();
    await expect(input).toHaveValue("");
  });

  test("user messages appear right-aligned, assistant left-aligned", async ({
    page,
  }) => {
    await page.getByTestId("chat-input").fill("Hi!");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("message-user").first()).toBeVisible();
    await expect(page.getByTestId("message-assistant").first()).toBeVisible({
      timeout: 10_000,
    });

    const userContainer = page
      .getByTestId("message-user")
      .first()
      .locator("..");
    const assistantContainer = page
      .getByTestId("message-assistant")
      .first()
      .locator("..");
    await expect(userContainer).toHaveClass(/justify-end/);
    await expect(assistantContainer).toHaveClass(/justify-start/);
  });

  test("empty state disappears after first message is sent", async ({
    page,
  }) => {
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await page.getByTestId("chat-input").fill("Hi");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("empty-state")).not.toBeVisible();
  });
});
