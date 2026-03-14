import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner } from "ai-sdk-agents";
import { createMockModel, makeGenerateTextResult } from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn() };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AiModule = typeof import("ai");

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return { ...actual, generateText: mockGenerateText };
});

function createAgents() {
  const model = createMockModel();

  const optimist = new Agent({
    name: "Optimist",
    instructions:
      "You are an optimist. Analyze the given topic from a positive perspective. Keep it to 2-3 sentences.",
    model,
  });

  const pessimist = new Agent({
    name: "Pessimist",
    instructions:
      "You are a pessimist. Analyze the given topic from a negative perspective. Keep it to 2-3 sentences.",
    model,
  });

  const realist = new Agent({
    name: "Realist",
    instructions:
      "You are a realist. Analyze the given topic from a balanced, factual perspective. Keep it to 2-3 sentences.",
    model,
  });

  const synthesizer = new Agent({
    name: "Synthesizer",
    instructions:
      "Synthesize the following three perspectives into a balanced 3-sentence summary.",
    model,
  });

  return { optimist, pessimist, realist, synthesizer };
}

describe("parallel-agents", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should run all agents in parallel", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "AI boosts productivity and creativity.",
        }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "AI threatens jobs and autonomy." }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "AI changes workflows with trade-offs.",
        }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "AI transforms development with both benefits and risks.",
        }),
      );

    const { optimist, pessimist, realist, synthesizer } = createAgents();
    const topic = "The impact of AI on software development";

    const [opt, pess, real] = await Promise.all([
      Runner.run(optimist, topic),
      Runner.run(pessimist, topic),
      Runner.run(realist, topic),
    ]);

    expect(opt.output).toBe("AI boosts productivity and creativity.");
    expect(pess.output).toBe("AI threatens jobs and autonomy.");
    expect(real.output).toBe("AI changes workflows with trade-offs.");

    const synthesis = await Runner.run(
      synthesizer,
      `Optimist: ${opt.output}\n\nPessimist: ${pess.output}\n\nRealist: ${real.output}`,
    );

    expect(synthesis.output).toBe(
      "AI transforms development with both benefits and risks.",
    );
  });

  it("should combine results in synthesizer", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Positive view." }))
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Negative view." }))
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Balanced view." }))
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "A balanced summary of all perspectives.",
        }),
      );

    const { optimist, pessimist, realist, synthesizer } = createAgents();

    const [opt, pess, real] = await Promise.all([
      Runner.run(optimist, "topic"),
      Runner.run(pessimist, "topic"),
      Runner.run(realist, "topic"),
    ]);

    const synthesis = await Runner.run(
      synthesizer,
      `Optimist: ${opt.output}\n\nPessimist: ${pess.output}\n\nRealist: ${real.output}`,
    );

    expect(synthesis.output).toContain("balanced");
  });

  it("should call generateText for each agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Optimistic." }))
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Pessimistic." }))
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Realistic." }))
      .mockResolvedValueOnce(makeGenerateTextResult({ text: "Synthesized." }));

    const { optimist, pessimist, realist, synthesizer } = createAgents();
    const topic = "AI";

    const [opt, pess, real] = await Promise.all([
      Runner.run(optimist, topic),
      Runner.run(pessimist, topic),
      Runner.run(realist, topic),
    ]);

    await Runner.run(
      synthesizer,
      `Optimist: ${opt.output}\n\nPessimist: ${pess.output}\n\nRealist: ${real.output}`,
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(4);
  });
});
