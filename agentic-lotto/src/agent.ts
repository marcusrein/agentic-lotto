import { createAmpersendHttpClient } from "@ampersend_ai/ampersend-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import type { Hex, Address } from "viem";
import type { AgentPersonality, LottoConfig } from "./types.js";
import { USDC_BASE as USDC_ADDRESS } from "./types.js";

const erc20BalanceAbi = [
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
    },
] as const;

export interface AgentDecision {
    played: boolean;
    reason: string;
}

export async function runAgent(
    personality: AgentPersonality,
    sessionKey: Hex,
    config: LottoConfig,
): Promise<AgentDecision> {
    const tag = `[${personality.name}]`;
    const serverUrl = `http://localhost:${config.house.port}`;

    // 1. Check balance
    const publicClient = createPublicClient({
        chain: base,
        transport: process.env.BASE_RPC_URL?.trim() ? http(process.env.BASE_RPC_URL.trim()) : http(),
    });

    let balanceRaw = 0n;
    try {
        balanceRaw = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: erc20BalanceAbi,
            functionName: "balanceOf",
            args: [personality.smartAccountAddress],
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`${tag} Could not read balance: ${msg}`);
        return { played: false, reason: "balance check failed" };
    }

    const balanceUsd = Number(formatUnits(balanceRaw, 6));
    const ticketPriceUsd = config.house.ticketPriceCents / 100;

    console.log(`${tag} Balance: ${balanceUsd.toFixed(4)} USDC`);

    // 2. Apply heuristic
    if (balanceUsd < personality.minBalance) {
        const reason = `balance ($${balanceUsd.toFixed(4)}) < minBalance ($${personality.minBalance})`;
        console.log(`${tag} Sitting out: ${reason}`);
        return { played: false, reason };
    }

    if (ticketPriceUsd >= personality.riskTolerance * balanceUsd) {
        const reason = `ticket ($${ticketPriceUsd}) >= riskTolerance (${personality.riskTolerance}) * balance ($${balanceUsd.toFixed(4)})`;
        console.log(`${tag} Sitting out: ${reason}`);
        return { played: false, reason };
    }

    console.log(`${tag} Deciding to play! (risk=${personality.riskTolerance}, balance=$${balanceUsd.toFixed(4)})`);

    // 3. Buy ticket
    if (config.dryRun) {
        // Dry run: just POST with body, no real payment
        try {
            const res = await fetch(`${serverUrl}/buy-ticket`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: personality.name,
                    smartAccountAddress: personality.smartAccountAddress,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                console.log(`${tag} Ticket purchase failed: ${JSON.stringify(data)}`);
                return { played: false, reason: `server error: ${res.status}` };
            }
            console.log(`${tag} Ticket purchased (dry-run)!`);
            return { played: true, reason: "bought ticket (dry-run)" };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`${tag} Ticket purchase threw: ${msg}`);
            return { played: false, reason: msg };
        }
    }

    // Real mode: use Ampersend x402 payment
    const ampersendClient = createAmpersendHttpClient({
        smartAccountAddress: personality.smartAccountAddress,
        sessionKeyPrivateKey: sessionKey,
        apiUrl: config.ampersendApiUrl,
        network: "base",
    });

    const paymentFetch = wrapFetchWithPayment(fetch, ampersendClient);

    try {
        const res = await paymentFetch(`${serverUrl}/buy-ticket`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: personality.name,
                smartAccountAddress: personality.smartAccountAddress,
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            console.log(`${tag} Ticket purchase failed: ${JSON.stringify(data)}`);
            return { played: false, reason: `server error: ${res.status}` };
        }
        console.log(`${tag} Ticket purchased!`);
        return { played: true, reason: "bought ticket" };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`${tag} Payment failed: ${msg}`);
        return { played: false, reason: msg };
    }
}
