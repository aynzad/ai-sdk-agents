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

const MovieRecommendation = z.object({
  title: z.string(),
  year: z.number(),
  genre: z.string(),
  synopsis: z.string(),
  rating: z.number().min(1).max(10),
});

const sampleMovie = {
  title: "Inception",
  year: 2010,
  genre: "Sci-Fi",
  synopsis:
    "A thief who steals corporate secrets through dream-sharing technology.",
  rating: 9,
};

function createMovieAgent() {
  return new Agent({
    name: "Movie Recommender",
    model: createMockModel(),
    instructions: "You are a movie recommendation expert.",
    outputSchema: MovieRecommendation,
  });
}

describe("structured-output", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should return output matching the Zod schema", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: JSON.stringify(sampleMovie),
        output: sampleMovie,
      }),
    );

    const agent = createMovieAgent();
    const result = await Runner.run(agent, "Recommend a sci-fi movie.");

    expect(result.output).toEqual(sampleMovie);
    expect(result.output.title).toBe("Inception");
    expect(result.output.year).toBe(2010);
    expect(result.output.genre).toBe("Sci-Fi");
    expect(result.output.rating).toBe(9);
  });

  it("should have fully typed output properties", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: JSON.stringify(sampleMovie),
        output: sampleMovie,
      }),
    );

    const agent = createMovieAgent();
    const result = await Runner.run(agent, "Recommend a movie.");

    const title: string = result.output.title;
    const year: number = result.output.year;
    expect(typeof title).toBe("string");
    expect(typeof year).toBe("number");
  });

  it("should pass Output.object to generateText when outputSchema is set", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ output: sampleMovie }),
    );

    const agent = createMovieAgent();
    await Runner.run(agent, "Recommend a movie.");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs.output).toBeDefined();
  });

  it("should return undefined output when AI SDK returns no object", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ output: undefined }),
    );

    const agent = createMovieAgent();
    const result = await Runner.run(agent, "Recommend a movie.");
    expect(result.output).toBeUndefined();
  });
});
