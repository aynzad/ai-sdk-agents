import { test, expect } from "./fixtures/polly.fixture";
import { buildChatSSE, buildHandoffSSE } from "./fixtures/mock-stream";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "x-vercel-ai-ui-message-stream": "v1",
};

test.describe("21-nextjs-multi-agent — Agent handoffs via Runner.stream()", () => {
  test("shows welcome state with suggestion chips", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE("How can I help?"),
      });
    });
    await page.goto("/");

    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByText("What's the baggage policy?")).toBeVisible();
    await expect(page.getByText("I'd like to change my seat")).toBeVisible();
    await expect(page.getByText("How do I get a refund?")).toBeVisible();
  });

  test("clicking a suggestion chip fills the input", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE("Here is the info."),
      });
    });
    await page.goto("/");

    await page.getByText("What's the baggage policy?").click();
    await expect(page.getByTestId("chat-input")).toHaveValue(
      "What's the baggage policy?",
    );
  });

  test("sends message and receives a direct agent response", async ({
    page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE(
          "Hello! I'm the Triage Agent. I can help with FAQ, seats, and more.",
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
    await expect(assistantMsg).toContainText("Triage Agent");
  });

  test("displays handoff indicator when agent routes to specialist", async ({
    page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildHandoffSSE({
          fromAgent: "Triage Agent",
          toAgent: "FAQ Agent",
          response:
            "Carry-on: 1 bag up to 10kg. Checked: 1 bag up to 23kg included.",
        }),
      });
    });
    await page.goto("/");

    await page.getByTestId("chat-input").fill("What is the baggage policy?");
    await page.getByTestId("send-button").click();

    const assistantMsg = page.getByTestId("message-assistant").first();
    await expect(assistantMsg).toBeVisible({ timeout: 10_000 });
    await expect(assistantMsg).toContainText(
      "Handed off from Triage Agent to FAQ Agent",
    );
    await expect(assistantMsg).toContainText("Carry-on");
  });

  test("user and assistant messages render with correct styles", async ({
    page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: buildChatSSE("I can help you."),
      });
    });
    await page.goto("/");

    await page.getByTestId("chat-input").fill("Hi");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("message-user").first()).toHaveClass(
      /bg-blue-600/,
    );
    await expect(page.getByTestId("message-assistant").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("message-assistant").first()).toHaveClass(
      /bg-zinc-200/,
    );
  });
});
