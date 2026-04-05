import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { resolveKey } from "./resolve-key.js";
import { startHouseServer, getPlayers, closeRound, resetRound } from "./house-server.js";
import { runAgent } from "./agent.js";
import { drawWinner } from "./draw.js";
import { payoutWinner } from "./payout.js";
import type { RoundResult, LottoConfig } from "./types.js";
import type { Hex } from "viem";

async function main() {
    const config = loadConfig();

    // ── Resolve house session key ──
    const houseKey = await resolveKey({
        ...config.oneclaw,
        secretPath: config.house.sessionKeyPath,
        label: "house",
    });

    // ── Start house server ──
    const house = await startHouseServer(config, houseKey);

    try {
        await runRound(config, houseKey);
    } finally {
        house.close();
    }
}

async function runRound(config: LottoConfig, houseKey: Hex): Promise<void> {
    const roundId = randomUUID().slice(0, 8);
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  ROUND ${roundId}`);
    console.log(`${"=".repeat(50)}\n`);

    // ── Resolve all agent keys ──
    console.log("[round] Resolving agent session keys...\n");
    const agentKeys: Hex[] = [];
    for (const agent of config.agents) {
        const key = await resolveKey({
            ...config.oneclaw,
            secretPath: agent.sessionKeyPath,
            label: agent.name,
        });
        agentKeys.push(key);
    }

    // ── Buy phase ──
    console.log(`\n[round] Buy window open (${config.house.buyWindowSeconds}s)...\n`);

    // Run agents sequentially — concurrent x402 payments race on facilitator settlement
    const decisions = [];
    for (let i = 0; i < config.agents.length; i++) {
        decisions.push(await runAgent(config.agents[i], agentKeys[i], config));
    }

    // Log decisions
    console.log("\n[round] Agent decisions:");
    config.agents.forEach((agent, i) => {
        const d = decisions[i];
        const icon = d.played ? "+" : "-";
        console.log(`  ${icon} ${agent.name}: ${d.reason}`);
    });

    closeRound();

    // ── Draw phase ──
    const players = getPlayers();
    console.log(`\n[round] ${players.length} player(s) registered.`);

    if (players.length < 2) {
        console.log("[round] Not enough players. Round voided.\n");
        resetRound();
        return;
    }

    const rngCostCents = config.dryRun ? 0 : 1; // SocioLogic charges $0.01
    const potCents = players.length * config.house.ticketPriceCents;
    const prizeCents = potCents - rngCostCents;

    console.log(`[round] Pot: $${(potCents / 100).toFixed(3)} | RNG cost: $${(rngCostCents / 100).toFixed(3)} | Prize: $${(prizeCents / 100).toFixed(3)}`);
    console.log(`\n[round] Drawing winner...\n`);

    let result: RoundResult;
    try {
        const draw = await drawWinner(players, config, houseKey);

        console.log(`\n[round] WINNER: ${draw.winner.name} (${draw.winner.smartAccountAddress})`);
        if (draw.entropy) {
            console.log(`[round] Entropy proof: ${draw.entropy.hex}`);
        }

        // ── Payout phase ──
        console.log("");
        const txHash = await payoutWinner(
            houseKey,
            draw.winner.smartAccountAddress,
            prizeCents,
            config.dryRun,
        );

        result = {
            roundId,
            players,
            potCents,
            rngCostCents,
            prizeCents,
            winner: draw.winner,
            entropy: draw.entropy,
            payoutTxHash: txHash,
            error: null,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`\n[round] Round failed: ${msg}`);
        result = {
            roundId,
            players,
            potCents,
            rngCostCents,
            prizeCents,
            winner: null,
            entropy: null,
            payoutTxHash: null,
            error: msg,
        };
    }

    // ── Summary ──
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  ROUND ${roundId} RESULT`);
    console.log(`${"=".repeat(50)}`);
    console.log(JSON.stringify(result, null, 2));
    console.log("");

    resetRound();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
