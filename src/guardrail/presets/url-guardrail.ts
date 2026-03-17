// Guardrail design inspired by OpenAI's guardrails approach
// (https://guardrails.openai.com/). All patterns are independently authored.

import type { Guardrail } from "@/types";
import { extractTextContent } from "../guardrail";

export interface UrlGuardrailConfig {
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedSchemes?: string[];
  blockUserInfo?: boolean;
  name?: string;
}

const DEFAULT_ALLOWED_SCHEMES = ["https", "http"];

// Matches URLs with explicit schemes including dangerous ones
const URL_PATTERN =
  /\b(?:https?|ftp|data|javascript):\/?\/?[^\s,)<>"']+|(?:javascript|data):[^\s,)<>"']+/gi;

function extractDomain(url: string): string | null {
  try {
    // Handle javascript: and data: schemes that URL constructor may reject
    if (/^(?:javascript|data):/i.test(url)) return null;
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    // Try adding a scheme for schemeless URLs
    try {
      const parsed = new URL(`https://${url}`);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

function hasUserInfo(url: string): boolean {
  try {
    if (/^(?:javascript|data):/i.test(url)) return false;
    const parsed = new URL(url);
    return parsed.username !== "" || parsed.password !== "";
  } catch {
    return false;
  }
}

function getScheme(url: string): string | null {
  const match = url.match(/^([a-z][a-z0-9+.-]*?):/i);
  return match ? match[1].toLowerCase() : null;
}

export function urlGuardrail(config?: UrlGuardrailConfig): Guardrail {
  const allowedDomains = config?.allowedDomains?.map((d) => d.toLowerCase());
  const blockedDomains = config?.blockedDomains?.map((d) => d.toLowerCase());
  const allowedSchemes = config?.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES;
  const blockUserInfo = config?.blockUserInfo ?? true;
  const name = config?.name ?? "url_guardrail";

  return {
    name,
    execute: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      const detectedUrls: string[] = [];
      const blockedUrls: string[] = [];
      const blockedReasons: string[] = [];

      for (const text of texts) {
        const matches = text.matchAll(URL_PATTERN);
        for (const m of matches) {
          const url = m[0];
          detectedUrls.push(url);

          const scheme = getScheme(url);

          // Check scheme
          if (scheme && !allowedSchemes.includes(scheme)) {
            blockedUrls.push(url);
            blockedReasons.push(`Blocked scheme: ${scheme}`);
            continue;
          }

          // Check userinfo
          if (blockUserInfo && hasUserInfo(url)) {
            blockedUrls.push(url);
            blockedReasons.push("URL contains credentials");
            continue;
          }

          const domain = extractDomain(url);

          // Check allowed domains (allowlist mode)
          if (allowedDomains && domain) {
            if (
              !allowedDomains.some(
                (d) => domain === d || domain.endsWith(`.${d}`),
              )
            ) {
              blockedUrls.push(url);
              blockedReasons.push(`Domain not allowed: ${domain}`);
              continue;
            }
          }

          // Check blocked domains (blocklist mode)
          if (blockedDomains && domain) {
            if (
              blockedDomains.some(
                (d) => domain === d || domain.endsWith(`.${d}`),
              )
            ) {
              blockedUrls.push(url);
              blockedReasons.push(`Blocked domain: ${domain}`);
              continue;
            }
          }

          // If no allowedDomains and no blockedDomains, any URL trips
          if (!allowedDomains && !blockedDomains) {
            blockedUrls.push(url);
            blockedReasons.push("URL detected");
          }
        }
      }

      if (blockedUrls.length > 0) {
        return Promise.resolve({
          tripwired: true,
          reason: `Blocked URL(s): ${blockedReasons.join("; ")}`,
          metadata: { detectedUrls, blockedUrls, blockedReasons },
        });
      }

      return Promise.resolve({ tripwired: false });
    },
  };
}
