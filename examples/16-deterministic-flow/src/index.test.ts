import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
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

const ResearchOutput = z.object({
  facts: z.array(z.string()),
  topic: z.string(),
  confidence: z.number().min(0).max(1),
});

const QualityCheckOutput = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
  score: z.number().min(0).max(10),
});

const sampleResearch = {
  facts: ["ARPANET was created in 1969", "TCP/IP was standardized in 1983"],
  topic: "History of the Internet",
  confidence: 0.9,
};

const sampleQCApproved = {
  approved: true,
  issues: [],
  score: 8,
};

const sampleQCRejected = {
  approved: false,
  issues: ["Missing key milestones", "Dates need verification"],
  score: 4,
};

function createResearchAgent() {
  return new Agent({
    name: "Research Agent",
    model: createMockModel(),
    instructions: "Research the given topic.",
    outputSchema: ResearchOutput,
  });
}

function createQualityCheckAgent() {
  return new Agent({
    name: "Quality Check Agent",
    model: createMockModel(),
    instructions: "Review research quality.",
    outputSchema: QualityCheckOutput,
  });
}

function createWriterAgent() {
  return new Agent({
    name: "Writer Agent",
    model: createMockModel(),
    instructions: "Write a summary from approved research.",
  });
}

describe("deterministic-flow", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should execute pipeline stages in order", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleResearch) }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleQCApproved) }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "The Internet began with ARPANET in 1969.",
        }),
      );

    const researchAgent = createResearchAgent();
    const qcAgent = createQualityCheckAgent();
    const writerAgent = createWriterAgent();

    const researchResult = await Runner.run(
      researchAgent,
      "Research the Internet",
    );
    const qcResult = await Runner.run(
      qcAgent,
      `Review: ${JSON.stringify(researchResult.output)}`,
    );
    const writerResult = await Runner.run(
      writerAgent,
      `Write about: ${JSON.stringify(researchResult.output.facts)}`,
    );

    expect(researchResult.output).toEqual(sampleResearch);
    expect(qcResult.output.approved).toBe(true);
    expect(typeof writerResult.output).toBe("string");
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("should pass structured output between stages", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleResearch) }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleQCApproved) }),
      );

    const researchAgent = createResearchAgent();
    const qcAgent = createQualityCheckAgent();

    const researchResult = await Runner.run(
      researchAgent,
      "Research the Internet",
    );
    expect(researchResult.output.facts).toEqual(sampleResearch.facts);
    expect(researchResult.output.topic).toBe("History of the Internet");

    const prompt = `Review facts: ${researchResult.output.facts.join(", ")}`;
    await Runner.run(qcAgent, prompt);

    const qcCall = mockGenerateText.mock.calls[1][0] as {
      messages: Array<{ content: string }>;
    };
    expect(qcCall.messages[0].content).toContain("ARPANET was created in 1969");
  });

  it("should produce final text output from writer", async () => {
    const finalText = "The Internet revolutionized global communication.";

    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleResearch) }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleQCApproved) }),
      )
      .mockResolvedValueOnce(makeGenerateTextResult({ text: finalText }));

    const researchResult = await Runner.run(createResearchAgent(), "Research");
    await Runner.run(createQualityCheckAgent(), "Review");
    const writerResult = await Runner.run(
      createWriterAgent(),
      `Write: ${JSON.stringify(researchResult.output.facts)}`,
    );

    expect(writerResult.output).toBe(finalText);
    expect(typeof writerResult.output).toBe("string");
  });

  it("should halt pipeline if quality check fails", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleResearch) }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: JSON.stringify(sampleQCRejected) }),
      );

    const researchResult = await Runner.run(createResearchAgent(), "Research");
    const qcResult = await Runner.run(
      createQualityCheckAgent(),
      `Review: ${JSON.stringify(researchResult.output)}`,
    );

    expect(qcResult.output.approved).toBe(false);
    expect(qcResult.output.issues).toEqual([
      "Missing key milestones",
      "Dates need verification",
    ]);
    expect(qcResult.output.score).toBe(4);
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });
});
