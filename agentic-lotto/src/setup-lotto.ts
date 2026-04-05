/**
 * Setup script for agentic-lotto: stores Ampersend-generated agent keys
 * in the 1Claw vault.
 *
 * Ampersend generates the key pair when you click "+ Add" under Agent Keys
 * in the dashboard. Copy the "Key secret" and paste it here when prompted.
 *
 * The house (Prime Ranger) already has a key at keys/x402-session-key.
 * This script stores player keys at keys/lotto-agent-1, -2, -3.
 *
 * Run: npm run setup
 *
 * Requires a HUMAN API key (1ck_...) — set ONECLAW_FULL_API_KEY in .env
 * or pass interactively.
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const VAULT_ID = process.env.ONECLAW_VAULT_ID?.trim();

interface AgentSetup {
    name: string;
    keyPath: string;
}

const AGENTS: AgentSetup[] = [
    { name: "Degen Dave", keyPath: "keys/lotto-agent-1" },
    { name: "Cautious Carol", keyPath: "keys/lotto-agent-2" },
    { name: "Mid Mike", keyPath: "keys/lotto-agent-3" },
];

function die(msg: string): never {
    console.error(msg);
    process.exit(1);
}

async function main() {
    if (!VAULT_ID) {
        die("Set ONECLAW_VAULT_ID in .env");
    }

    const rl = readline.createInterface({ input, output });

    try {
        // Get user API key
        let userKey = process.env.ONECLAW_FULL_API_KEY?.trim();
        if (!userKey) {
            console.log("\n── Agentic Lotto Setup ──────────────────────────────────────\n");
            userKey = (
                await rl.question(
                    "User API key (1ck_... from 1claw.xyz → Settings → API Keys):\n  ",
                )
            ).trim();
        }

        if (!userKey) die("No user API key provided.");
        if (userKey.startsWith("ocv_")) die("Need a user key (1ck_...), not an agent key (ocv_...).");

        const client = createClient({ baseUrl: BASE_URL, apiKey: userKey });
        const auth = await client.auth.apiKeyToken({ api_key: userKey });
        if (auth.error || !auth.data?.access_token) {
            die(`Auth failed: ${auth.error?.message ?? "no token"}`);
        }

        console.log(`\nVault: ${VAULT_ID}`);
        console.log("\nFor each agent, go to Ampersend dashboard → agent → Agent Keys → + Add → Create Key");
        console.log("Then copy the Key secret and paste it below.\n");

        for (const agent of AGENTS) {
            // Check if key already exists
            const existing = await client.secrets.get(VAULT_ID, agent.keyPath);
            if (existing.data?.value) {
                const answer = (
                    await rl.question(
                        `[${agent.name}] Key already exists at "${agent.keyPath}". Overwrite? (y/N): `,
                    )
                ).trim().toLowerCase();
                if (answer !== "y") {
                    console.log(`  Skipped.\n`);
                    continue;
                }
            }

            const keySecret = (
                await rl.question(
                    `[${agent.name}] Paste Ampersend Key secret: `,
                )
            ).trim();

            if (!keySecret) {
                console.log(`  Skipped (empty).\n`);
                continue;
            }

            const put = await client.secrets.set(VAULT_ID, agent.keyPath, keySecret, {
                type: "private_key",
            });
            if (put.error) {
                die(`Failed to store key for ${agent.name}: ${put.error.message}`);
            }

            console.log(`  ✓ Stored at "${agent.keyPath}"\n`);
        }

        console.log("══════════════════════════════════════════════════════════");
        console.log("  All keys stored in 1Claw vault.");
        console.log("  Make sure each agent is funded with USDC in the Ampersend dashboard.");
        console.log("  Then run: npm start");
        console.log("══════════════════════════════════════════════════════════\n");
    } finally {
        rl.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
