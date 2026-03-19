export type {
  AgentHooks,
  AsToolOptions,
  AgentConfig,
  AgentInstance,
} from "./agent/types";

export type { HandoffConfig, HandoffTarget } from "./handoff/types";

export type { TraceSpan, TraceProcessor, TracingConfig } from "./tracing/types";

export type {
  RunContext,
  ModelSettings,
  CallSettings,
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
  LanguageModelUsage,
} from "./types";

export type {
  RunHooks,
  RunConfig,
  RunStep,
  RunResult,
  StreamEvent,
  StreamResult,
} from "./runner/types";

export { MaxTurnsExceededError } from "./runner/types";

export type {
  GuardrailInput,
  GuardrailResult,
  Guardrail,
  ToolGuardrailBehavior,
  ToolInputGuardrailData,
  ToolOutputGuardrailData,
  ToolInputGuardrail,
  ToolOutputGuardrail,
} from "./guardrail/types";

export {
  GuardrailTripwiredError,
  ToolGuardrailTripwiredError,
} from "./guardrail/types";
export { HandoffError } from "./handoff/types";

export type { UIMessage } from "ai";

export { Agent } from "./agent/agent";

export { handoff, handoffFilters } from "./handoff/handoff";

export {
  guardrail,
  llmGuardrail,
  keywordGuardrail,
  maxLengthGuardrail,
  regexGuardrail,
} from "./guardrail/guardrail";

export type { LlmGuardrailConfig } from "./guardrail/guardrail";

// Guardrail presets — pattern-based
export { piiGuardrail } from "./guardrail/presets/pii-guardrail";
export type {
  PiiGuardrailConfig,
  PiiEntity,
} from "./guardrail/presets/pii-guardrail";

export { secretKeyGuardrail } from "./guardrail/presets/secret-key-guardrail";
export type { SecretKeyGuardrailConfig } from "./guardrail/presets/secret-key-guardrail";

export { urlGuardrail } from "./guardrail/presets/url-guardrail";
export type { UrlGuardrailConfig } from "./guardrail/presets/url-guardrail";

// Guardrail presets — LLM-based
export { jailbreakGuardrail } from "./guardrail/presets/jailbreak-guardrail";
export type { JailbreakGuardrailConfig } from "./guardrail/presets/jailbreak-guardrail";

export { moderationGuardrail } from "./guardrail/presets/moderation-guardrail";
export type {
  ModerationGuardrailConfig,
  ModerationCategory,
} from "./guardrail/presets/moderation-guardrail";

export { nsfwGuardrail } from "./guardrail/presets/nsfw-guardrail";
export type { NsfwGuardrailConfig } from "./guardrail/presets/nsfw-guardrail";

export { promptInjectionGuardrail } from "./guardrail/presets/prompt-injection-guardrail";
export type { PromptInjectionGuardrailConfig } from "./guardrail/presets/prompt-injection-guardrail";

export { topicGuardrail } from "./guardrail/presets/topic-guardrail";
export type { TopicGuardrailConfig } from "./guardrail/presets/topic-guardrail";

export {
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailBehaviorFactory,
  guardedTool,
  isGuardedTool,
} from "./guardrail/tool-guardrail";

export { Runner } from "./runner/runner";

export {
  trace,
  Trace,
  addTraceProcessor,
  removeTraceProcessor,
  clearTraceProcessors,
  consoleTraceProcessor,
  memoryTraceProcessor,
} from "./tracing/tracing";

export type { SpanHandle, SpanConfig } from "./tracing/tracing";
