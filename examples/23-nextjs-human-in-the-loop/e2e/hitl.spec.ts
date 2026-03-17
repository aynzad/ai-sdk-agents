import { test, expect } from "./fixtures/polly.fixture";
import { buildChatSSE, buildToolCallSSE } from "./fixtures/mock-stream";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "x-vercel-ai-ui-message-stream": "v1",
};

test.describe("23-nextjs-human-in-the-loop — Agent with tool approval", () => {
  test("shows empty state with suggestion chips", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE("How can I help you?"),
      });
    });
    await page.goto("/");

    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByText("Look up record #123")).toBeVisible();
    await expect(
      page.getByText("Update the email for record #123"),
    ).toBeVisible();
  });

  test("sends message and receives a text response", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE(
          "I can help you look up and update database records. What would you like to do?",
        ),
      });
    });
    await page.goto("/");

    await page.getByTestId("chat-input").fill("Hello!");
    await page.getByTestId("send-button").click();

    const userMsg = page.getByTestId("message-user").first();
    await expect(userMsg).toContainText("Hello!");

    const assistantMsg = page.getByTestId("message-assistant").first();
    await expect(assistantMsg).toBeVisible({ timeout: 10_000 });
    await expect(assistantMsg).toContainText("database records");
  });

  test("displays approval card when updateRecord tool is invoked", async ({
    page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildToolCallSSE({
          toolCallId: "call-update-1",
          toolName: "updateRecord",
          input: {
            id: "123",
            field: "email",
            value: "new@acme.com",
          },
        }),
      });
    });
    await page.goto("/");

    await page.getByTestId("chat-input").fill("Update email for record #123");
    await page.getByTestId("send-button").click();

    const approvalCard = page.getByTestId("approval-card");
    await expect(approvalCard).toBeVisible({ timeout: 10_000 });
    await expect(approvalCard).toContainText("Approval Required");
    await expect(approvalCard).toContainText("updateRecord");
    await expect(approvalCard).toContainText("123");
    await expect(approvalCard).toContainText("email");
    await expect(approvalCard).toContainText("new@acme.com");

    await expect(page.getByTestId("approve-button")).toBeVisible();
    await expect(page.getByTestId("reject-button")).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE("Hello"),
      });
    });
    await page.goto("/");

    await expect(page.getByTestId("send-button")).toBeDisabled();
    await page.getByTestId("chat-input").fill("Test");
    await expect(page.getByTestId("send-button")).toBeEnabled();
  });

  test("clicking suggestion chip fills the input field", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE("Looking up..."),
      });
    });
    await page.goto("/");

    await page.getByText("Look up record #123").click();
    await expect(page.getByTestId("chat-input")).toHaveValue(
      "Look up record #123",
    );
  });
});
