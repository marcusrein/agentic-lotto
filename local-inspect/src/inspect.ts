/**
 * Calls the same inspection engine used by the 1claw MCP inspect_content tool.
 * No vault credentials, no network calls — everything runs locally.
 */
import {
  inspectInput,
  inspectOutput,
  normalizeUnicode,
  type ThreatDetection,
} from "@1claw/mcp/security";

export interface InspectResult {
  verdict: string;
  safe: boolean;
  threat_count: number;
  threats: Array<{
    type: string;
    pattern: string;
    severity: string;
    match?: string;
  }>;
  unicode_normalized: boolean;
  normalized_content?: string;
  redacted_content?: string;
}

export function inspect(
  content: string,
  context: "input" | "output" = "output",
): InspectResult {
  const result =
    context === "input"
      ? inspectInput("inspect_content", { content })
      : inspectOutput("inspect_content", content);

  const { normalized, modified } = normalizeUnicode(content);

  const threats = result.threats.map((t) => ({
    type: t.type,
    pattern: t.pattern,
    severity: t.severity,
    ...(t.location ? { match: t.location.slice(0, 80) } : {}),
  }));

  const verdict = deriveVerdict(result.threats);

  return {
    verdict,
    safe: result.threats.length === 0,
    threat_count: result.threats.length,
    threats,
    unicode_normalized: modified,
    ...(modified ? { normalized_content: normalized } : {}),
    ...(result.redacted ? { redacted_content: result.redacted } : {}),
  };
}

function deriveVerdict(threats: ThreatDetection[]): string {
  if (threats.length === 0) return "clean";
  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  const max = threats.reduce(
    (m, t) => (rank[t.severity] > rank[m] ? t.severity : m),
    "low" as ThreatDetection["severity"],
  );
  if (max === "critical") return "malicious";
  if (max === "high") return "suspicious";
  return "warning";
}

export function printResult(label: string, input: string, r: InspectResult): void {
  const icon =
    r.verdict === "clean" ? "✓" :
    r.verdict === "warning" ? "⚡" :
    r.verdict === "suspicious" ? "⚠" : "✗";
  const color =
    r.verdict === "clean" ? "\x1b[32m" :
    r.verdict === "warning" ? "\x1b[33m" :
    r.verdict === "suspicious" ? "\x1b[33m" : "\x1b[31m";
  const reset = "\x1b[0m";

  console.log(`  [${label}]`);
  console.log(`    Input:   "${input.length > 70 ? input.slice(0, 67) + "..." : input}"`);
  console.log(`    Verdict: ${color}${icon} ${r.verdict}${reset} (${r.threat_count} threat${r.threat_count !== 1 ? "s" : ""})`);
  if (r.threats.length > 0) {
    for (const t of r.threats) {
      console.log(`    → ${t.type}: ${t.pattern} [${t.severity}]${t.match ? ` — "${t.match}"` : ""}`);
    }
  }
  if (r.unicode_normalized) {
    console.log(`    → Normalized: "${r.normalized_content}"`);
  }
  console.log();
}
