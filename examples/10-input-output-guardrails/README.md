# 10 - Input/Output Guardrails

Demonstrates input and output guardrails using the `guardrail()` factory function.

- **Input guardrail** — detects prompt injection attempts (e.g. "ignore all previous instructions")
- **Output guardrail** — blocks responses containing sensitive data patterns (e.g. SSN)

When a guardrail trips, the runner throws a `GuardrailTripwiredError` with the guardrail name and reason.

## Run

```bash
pnpm install
pnpm start
```

## Test

```bash
pnpm test
```
