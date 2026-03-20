/**
 * Shroud LLM + Stripe AI Gateway path — for orgs with LLM Token Billing enabled.
 *
 * 1. Exchanges agent API key for JWT and decodes llm_token_billing / stripe_customer_id.
 * 2. Optionally verifies org setting via user API key + GET /v1/billing/llm-token-billing.
 * 3. POST /v1/chat/completions to Shroud (Stripe routes when claims are present on Shroud).
 */
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.xyz").trim().replace(
  /\/$/,
  "",
);
const API_URL = (process.env.ONECLAW_API_URL || "https://api.1claw.xyz").trim().replace(/\/$/, "");
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const USER_API_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();

function getAgentCreds(): { agentId: string; apiKey: string } | null {
  const id = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  const key = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  if (!id || !key || id === "your-agent-uuid" || key.includes("your_")) return null;
  return { agentId: id, apiKey: key };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function exchangeAgentJwt(agentId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, api_key: apiKey }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function checkOrgLlmBillingFromUserKey(): Promise<{ enabled: boolean } | null> {
  if (!USER_API_KEY || USER_API_KEY.includes("your_")) return null;
  const auth = await fetch(`${API_URL}/v1/auth/api-key-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: USER_API_KEY }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!auth.ok) return null;
  const { access_token: bearer } = (await auth.json()) as { access_token?: string };
  if (!bearer) return null;
  const res = await fetch(`${API_URL}/v1/billing/llm-token-billing`, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { enabled?: boolean };
  return { enabled: Boolean(data.enabled) };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  1Claw — Shroud LLM (LLM Token Billing path)");
  console.log("═══════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const creds = getAgentCreds();
  if (!creds) {
    console.log("[SKIP] Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY (run npm run setup)\n");
    process.exit(0);
  }

  const orgBilling = await checkOrgLlmBillingFromUserKey();
  if (orgBilling !== null) {
    console.log("── Org LLM Token Billing (user API key) ──");
    if (orgBilling.enabled) {
      console.log("[OK]   GET /v1/billing/llm-token-billing → enabled: true");
      passed++;
    } else {
      console.log(
        "[WARN] Org LLM Token Billing is not enabled. Enable at Settings → Billing, then re-run.",
      );
      console.log("       Agent JWT may still lack llm_token_billing until billing is active.\n");
    }
  } else {
    console.log("── Org LLM billing (optional) ──");
    console.log("[SKIP] Set ONECLAW_API_KEY in .env to verify org billing status via API\n");
  }

  console.log("── Agent JWT claims ──");
  const jwt = await exchangeAgentJwt(creds.agentId, creds.apiKey);
  if (!jwt) {
    console.log("[FAIL] Agent token exchange failed");
    process.exit(1);
  }
  const payload = decodeJwtPayload(jwt);
  if (!payload) {
    console.log("[FAIL] Could not decode agent JWT payload");
    process.exit(1);
  }

  const llmBill = payload["llm_token_billing"];
  const stripeCust = payload["stripe_customer_id"];
  console.log("       llm_token_billing:", llmBill);
  console.log("       stripe_customer_id:", stripeCust ?? "(none)");

  if (llmBill === true && stripeCust && typeof stripeCust === "string") {
    console.log("[OK]   Agent JWT includes LLM billing claims (Stripe AI Gateway path eligible)\n");
    passed++;
  } else {
    console.log(
      "[SKIP] Agent JWT missing LLM billing — enable LLM Token Billing for this org and ensure Stripe customer exists.",
    );
    console.log("       Shroud will use direct provider routing until claims are present.\n");
    skipped++;
  }

  console.log("── Shroud POST /v1/chat/completions ──");
  const hasLlmBilling = llmBill === true && stripeCust && typeof stripeCust === "string";
  
  if (hasLlmBilling) {
    console.log("       Note: LLM billing enabled → Stripe AI Gateway handles provider keys (no OPENAI_API_KEY needed)");
  } else if (!OPENAI_API_KEY) {
    console.log("       Note: Without LLM billing, you need OPENAI_API_KEY or key in vault at providers/openai/api-key");
  }

  const headers: Record<string, string> = {
    "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}`,
    "Content-Type": "application/json",
    "X-Shroud-Provider": "openai",
    "X-Shroud-Model": "gpt-4o-mini",
  };
  // Only send X-Shroud-Api-Key if LLM billing is NOT enabled (Stripe handles keys when billing is on)
  if (!hasLlmBilling && OPENAI_API_KEY) {
    headers["X-Shroud-Api-Key"] = OPENAI_API_KEY;
  }

  const body = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    max_tokens: 10,
  });

  const res = await fetch(`${SHROUD_URL}/v1/chat/completions`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(45_000),
  });

  if (res.status === 200) {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (content.toUpperCase().includes("OK")) {
      console.log("[OK]   Chat completion → 200");
      passed++;
    } else {
      console.log("[FAIL] Unexpected content:", content.slice(0, 80));
      failed++;
    }
  } else if (res.status === 401) {
    if (hasLlmBilling) {
      console.log(
        "[FAIL] 401 with LLM billing enabled — Shroud should use Stripe keys. Check Shroud STRIPE_SECRET_KEY config.",
      );
      failed++;
    } else {
      console.log(
        "[SKIP] 401 — set OPENAI_API_KEY or store key at providers/openai/api-key (agent read)",
      );
      skipped++;
    }
  } else {
    const text = await res.text();
    console.log("[FAIL] →", res.status, text.slice(0, 120));
    failed++;
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  Done: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
