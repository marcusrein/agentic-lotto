import type { LottoConfig, AgentPersonality, CircleConfig } from "./types.js";
import type { Address } from "viem";

function reqEnv(key: string): string {
    const v = process.env[key]?.trim();
    if (!v) {
        console.error(`Missing required env var: ${key}`);
        process.exit(1);
    }
    return v;
}

function optEnv(key: string, fallback: string): string {
    return process.env[key]?.trim() || fallback;
}

function loadAgents(): AgentPersonality[] {
    const agents: AgentPersonality[] = [];
    for (let i = 1; i <= 10; i++) {
        const addr = process.env[`AGENT_${i}_SMART_ACCOUNT_ADDRESS`]?.trim();
        if (!addr) break;
        agents.push({
            name: optEnv(`AGENT_${i}_NAME`, `Agent ${i}`),
            smartAccountAddress: addr as Address,
            sessionKeyPath: optEnv(`AGENT_${i}_SESSION_KEY_PATH`, `keys/lotto-agent-${i}`),
            riskTolerance: Number(optEnv(`AGENT_${i}_RISK_TOLERANCE`, "0.5")),
            minBalance: Number(optEnv(`AGENT_${i}_MIN_BALANCE`, "0.05")),
        });
    }
    return agents;
}

export function loadConfig(): LottoConfig {
    const agents = loadAgents();
    if (agents.length < 2) {
        console.error("Need at least 2 agents (AGENT_1_*, AGENT_2_*) in .env");
        process.exit(1);
    }

    const dryRun = process.argv.includes("--dry-run");
    if (dryRun) {
        console.log("[config] Dry-run mode: no real payments, local RNG.\n");
    }

    const circle: CircleConfig = dryRun
        ? { apiKey: "", entitySecret: "", entitySecretPath: "", walletId: "", walletAddress: "0x0" as Address }
        : {
            apiKey: reqEnv("CIRCLE_API_KEY"),
            entitySecret: process.env.CIRCLE_ENTITY_SECRET?.trim() ?? "",
            entitySecretPath: optEnv("CIRCLE_ENTITY_SECRET_PATH", "keys/circle-entity-secret"),
            walletId: reqEnv("CIRCLE_WALLET_ID"),
            walletAddress: reqEnv("CIRCLE_WALLET_ADDRESS") as Address,
        };

    return {
        house: {
            port: Number(optEnv("LOTTO_SERVER_PORT", "4022")),
            ticketPriceCents: Number(optEnv("TICKET_PRICE_CENTS", "1")),
            buyWindowSeconds: Number(optEnv("BUY_WINDOW_SECONDS", "30")),
            smartAccountAddress: reqEnv("HOUSE_SMART_ACCOUNT_ADDRESS") as Address,
            sessionKeyPath: optEnv("HOUSE_SESSION_KEY_PATH", "keys/lotto-house"),
        },
        agents,
        rng: {
            endpoint: optEnv("RNG_ENDPOINT", "https://rng.sociologic.ai/random/int"),
        },
        ampersendApiUrl: optEnv("AMPERSEND_API_URL", "https://api.ampersend.ai"),
        oneclaw: {
            apiKey: reqEnv("ONECLAW_API_KEY"),
            vaultId: reqEnv("ONECLAW_VAULT_ID"),
            baseUrl: optEnv("ONECLAW_BASE_URL", "https://api.1claw.xyz"),
            agentId: process.env.ONECLAW_AGENT_ID?.trim(),
        },
        circle,
        dryRun,
    };
}
