import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import starlightLlmsTxt from "starlight-llms-txt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://aynzad.github.io",
  base: "/ai-sdk-agents",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: "AI SDK Agents",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      description:
        "Multi-agent orchestration for Vercel AI SDK — handoffs, guardrails, and tracing.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/aynzad/ai-sdk-agents",
        },
        {
          icon: "npm",
          label: "npm",
          href: "https://www.npmjs.com/package/@aynzad/ai-sdk-agents",
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../src/index.ts"],
          tsconfig: "../tsconfig.json",
          typeDoc: {
            parametersFormat: "table",
            enumMembersFormat: "table",
            typeDeclarationFormat: "table",
          },
        }),
        starlightLlmsTxt({
          projectName: "ai-sdk-agents",
          description:
            "Multi-agent orchestration for Vercel AI SDK — handoffs, guardrails, and tracing.",
          entries: [
            {
              label: "Guides",
              items: ["guides/*"],
            },
          ],
        }),
      ],
      sidebar: [
        { label: "Overview", slug: "" },
        { label: "Why AI SDK Agents?", slug: "guides/why" },
        { label: "Quickstart", slug: "guides/quickstart" },
        {
          label: "Guides",
          items: [
            { label: "Agents", slug: "guides/agents" },
            { label: "Tools", slug: "guides/tools" },
            { label: "Guardrails", slug: "guides/guardrails" },
            { label: "Running Agents", slug: "guides/running-agents" },
            { label: "Streaming", slug: "guides/streaming" },
            { label: "Agent Orchestration", slug: "guides/multi-agent" },
            { label: "Handoffs", slug: "guides/handoffs" },
            { label: "Results", slug: "guides/results" },
            { label: "Context Management", slug: "guides/context" },
            { label: "Tracing", slug: "guides/tracing" },
          ],
        },
        typeDocSidebarGroup,
      ],
      customCss: ["./src/styles/global.css"],
    }),
  ],
});
