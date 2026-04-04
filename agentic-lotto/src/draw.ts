import { createAmpersendHttpClient } from "@ampersend_ai/ampersend-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { Hex } from "viem";
import type { LottoConfig, RoundPlayer } from "./types.js";

interface RngResponse {
    value: number;
    min: number;
    max: number;
    timestamp: string;
    entropy: {
        raw: number[];
        hex: string;
    };
}

export interface DrawResult {
    winnerIndex: number;
    winner: RoundPlayer;
    entropy: { raw: number[]; hex: string } | null;
}

export async function drawWinner(
    players: RoundPlayer[],
    config: LottoConfig,
    houseSessionKey: Hex,
): Promise<DrawResult> {
    if (players.length < 2) {
        throw new Error("Need at least 2 players for a draw");
    }

    const maxIndex = players.length - 1;

    if (config.dryRun) {
        const winnerIndex = Math.floor(Math.random() * players.length);
        console.log(`[draw] Dry-run RNG: picked index ${winnerIndex} of ${players.length}`);
        return {
            winnerIndex,
            winner: players[winnerIndex],
            entropy: null,
        };
    }

    // Real mode: call SocioLogic via x402
    console.log(`[draw] Calling SocioLogic RNG (${config.rng.endpoint}?min=0&max=${maxIndex})...`);

    const ampersendClient = createAmpersendHttpClient({
        smartAccountAddress: config.house.smartAccountAddress,
        sessionKeyPrivateKey: houseSessionKey,
        apiUrl: config.ampersendApiUrl,
        network: "base",
    });

    const paymentFetch = wrapFetchWithPayment(fetch, ampersendClient);
    const url = `${config.rng.endpoint}?min=0&max=${maxIndex}`;

    let rngData: RngResponse;

    // Try once, retry once on failure
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await paymentFetch(url);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`RNG returned ${res.status}: ${text}`);
            }
            rngData = await res.json() as RngResponse;
            console.log(`[draw] RNG returned index ${rngData.value} (entropy: ${rngData.entropy.hex})`);

            return {
                winnerIndex: rngData.value,
                winner: players[rngData.value],
                entropy: rngData.entropy,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (attempt === 1) {
                console.warn(`[draw] RNG attempt ${attempt} failed: ${msg}. Retrying...`);
            } else {
                throw new Error(`[draw] RNG failed after ${attempt} attempts: ${msg}`);
            }
        }
    }

    // TypeScript needs this — the loop always returns or throws
    throw new Error("[draw] Unreachable");
}
