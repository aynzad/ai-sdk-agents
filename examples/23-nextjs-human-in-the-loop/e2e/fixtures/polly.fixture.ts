import { test as base, expect } from "@playwright/test";
import { Polly } from "@pollyjs/core";
import { PlaywrightAdapter } from "polly-adapter-playwright";
import FSPersister from "@pollyjs/persister-fs";
import path from "path";

Polly.register(PlaywrightAdapter);
Polly.register(FSPersister);

const RECORDINGS_DIR = path.join(import.meta.dirname, "../../recordings");

type PollyFixtures = {
  polly: Polly;
};

export const test = base.extend<PollyFixtures>({
  polly: async ({ page }, use, testInfo) => {
    const recordingName = testInfo.titlePath
      .filter(Boolean)
      .join("_")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "");

    const polly = new Polly(recordingName, {
      adapters: ["playwright"],
      adapterOptions: {
        playwright: { context: page },
      },
      persister: "fs",
      persisterOptions: {
        fs: { recordingsDir: RECORDINGS_DIR },
      },
      mode: process.env.POLLY_MODE === "record" ? "record" : "passthrough",
      recordIfMissing: process.env.POLLY_MODE === "record",
    });

    await use(polly);
    await polly.stop();
  },
});

export { expect };
