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

const PlanSchema = z.object({
  searchTerms: z.array(z.string()),
  topic: z.string(),
});

const SearchResultSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()),
});

const samplePlan = {
  searchTerms: [
    "quantum error correction",
    "quantum supremacy milestones",
    "quantum computing applications",
  ],
  topic: "The future of quantum computing",
};

const sampleSearchResults = [
  {
    summary:
      "Quantum error correction uses redundant qubits to protect information.",
    keyFacts: [
      "Surface codes are leading approach",
      "Logical qubit threshold nearly reached",
    ],
  },
  {
    summary: "Quantum supremacy was first claimed by Google in 2019.",
    keyFacts: [
      "Sycamore processor solved sampling problem",
      "IBM disputed the claim",
    ],
  },
  {
    summary:
      "Quantum computing has potential applications in drug discovery and cryptography.",
    keyFacts: [
      "Shor's algorithm threatens RSA encryption",
      "Molecular simulation is a key use case",
    ],
  },
];

function createPlanner() {
  return new Agent({
    name: "Planner",
    model: createMockModel(),
    instructions:
      "Given a research topic, suggest 3 search terms to investigate.",
    outputSchema: PlanSchema,
  });
}

function createSearcher() {
  return new Agent({
    name: "Searcher",
    model: createMockModel(),
    instructions: "Given a search term, produce a brief summary and key facts.",
    outputSchema: SearchResultSchema,
  });
}

function createWriter() {
  return new Agent({
    name: "Writer",
    model: createMockModel(),
    instructions:
      "Given research summaries, write a coherent 3-paragraph report.",
  });
}

describe("research-bot", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("planner should produce search terms", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: JSON.stringify(samplePlan),
        output: samplePlan,
      }),
    );

    const planner = createPlanner();
    const result = await Runner.run(
      planner,
      "Research topic: quantum computing",
    );

    expect(result.output.searchTerms).toHaveLength(3);
    expect(result.output.topic).toBe("The future of quantum computing");
    expect(result.output.searchTerms).toContain("quantum error correction");
  });

  it("searcher should produce summaries for each term", async () => {
    for (const sr of sampleSearchResults) {
      mockGenerateText.mockResolvedValueOnce(
        makeGenerateTextResult({
          text: JSON.stringify(sr),
          output: sr,
        }),
      );
    }

    const searcherAgent = createSearcher();
    const terms = samplePlan.searchTerms;

    const results = await Promise.all(
      terms.map((term) => Runner.run(searcherAgent, `Research: ${term}`)),
    );

    expect(results).toHaveLength(3);
    expect(results[0].output.summary).toContain("error correction");
    expect(results[1].output.keyFacts).toContain("IBM disputed the claim");
    expect(results[2].output.keyFacts).toContain(
      "Molecular simulation is a key use case",
    );
  });

  it("writer should produce final report", async () => {
    const reportText =
      "Quantum computing is advancing rapidly. Error correction and supremacy milestones mark key progress. Applications in cryptography and drug discovery are emerging.";

    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: reportText }),
    );

    const writerAgent = createWriter();
    const result = await Runner.run(
      writerAgent,
      "Write a report on quantum computing.",
    );

    expect(result.output).toContain("Quantum computing");
    expect(result.output).toContain("cryptography");
  });

  it("full pipeline should execute planner → searchers → writer", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({
        text: JSON.stringify(samplePlan),
        output: samplePlan,
      }),
    );

    for (const sr of sampleSearchResults) {
      mockGenerateText.mockResolvedValueOnce(
        makeGenerateTextResult({
          text: JSON.stringify(sr),
          output: sr,
        }),
      );
    }

    const reportText =
      "Quantum computing stands at a pivotal juncture. Breakthroughs in error correction and landmark supremacy demonstrations have validated the technology. Industries from pharmaceuticals to cybersecurity are poised for transformation.";

    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({ text: reportText }),
    );

    const plannerAgent = createPlanner();
    const searcherAgent = createSearcher();
    const writerAgent = createWriter();

    const planResult = await Runner.run(
      plannerAgent,
      "Research: quantum computing",
    );
    const { searchTerms } = planResult.output;

    const searchResults = await Promise.all(
      searchTerms.map((term) => Runner.run(searcherAgent, `Research: ${term}`)),
    );

    const context = searchResults
      .map((r) => `${r.output.summary}\n${r.output.keyFacts.join("; ")}`)
      .join("\n\n");

    const report = await Runner.run(writerAgent, `Write report:\n\n${context}`);

    expect(mockGenerateText).toHaveBeenCalledTimes(5);
    expect(planResult.output.searchTerms).toHaveLength(3);
    expect(searchResults).toHaveLength(3);
    expect(report.output).toContain("Quantum computing");
  });
});
