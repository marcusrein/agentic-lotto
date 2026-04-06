import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactEvmScheme as ExactEvmFacilitatorScheme } from "@x402/evm/exact/facilitator";
import { x402Facilitator } from "@x402/core/facilitator";
import {
    createWalletClient,
    createPublicClient,
    http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { LottoConfig, RoundPlayer } from "./types.js";
import type { Hex } from "viem";

/** In-memory round state managed by the house. */
let players: RoundPlayer[] = [];
let roundOpen = true;

export function getPlayers(): RoundPlayer[] {
    return [...players];
}

export function isRoundOpen(): boolean {
    return roundOpen;
}

export function closeRound(): void {
    roundOpen = false;
}

export function resetRound(): void {
    players = [];
    roundOpen = true;
}

export async function startHouseServer(
    config: LottoConfig,
    facilitatorKey: Hex,
): Promise<{ close: () => void }> {
    const facilitatorAccount = privateKeyToAccount(facilitatorKey);
    // payTo = Circle wallet address (ticket USDC goes to Circle-managed treasury)
    // Falls back to facilitator EOA if no Circle wallet configured
    const payTo = config.circle.walletAddress ?? facilitatorAccount.address;

    const baseTransport = process.env.BASE_RPC_URL?.trim()
        ? http(process.env.BASE_RPC_URL.trim())
        : http();

    const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain: base,
        transport: baseTransport,
    });

    const publicClient = createPublicClient({
        chain: base,
        transport: baseTransport,
    });

    const evmSigner = {
        ...publicClient,
        ...walletClient,
        address: facilitatorAccount.address,
        getAddresses: () => [facilitatorAccount.address],
    };

    const facilitator = new x402Facilitator();
    facilitator.register(
        "eip155:8453",
        new ExactEvmFacilitatorScheme(
            evmSigner as any,
            { deployERC4337WithEIP6492: true },
        ),
    );

    const app = express();
    app.use(express.json());

    const server = new x402ResourceServer(facilitator as any).register(
        "eip155:8453",
        new ExactEvmScheme(),
    );

    const priceDollar = `$${(config.house.ticketPriceCents / 100).toFixed(3)}`;
    const priceRaw = String(config.house.ticketPriceCents * 10_000); // USDC has 6 decimals; 1 cent = 10000 units

    const routes = {
        "POST /buy-ticket": {
            accepts: [
                {
                    scheme: "exact" as const,
                    price: `$${(config.house.ticketPriceCents / 100).toFixed(3)}`,
                    network: "eip155:8453" as const,
                    payTo,
                },
            ],
            description: `Buy a lotto ticket (${priceDollar} USDC on Base)`,
            mimeType: "application/json",
        },
    };

    // In dry-run mode, skip the x402 payment middleware so agents can POST without payment
    if (!config.dryRun) {
        app.use(paymentMiddleware(routes, server));
    }

    // ── Paid endpoint: buy ticket ──
    app.post("/buy-ticket", (req, res) => {
        if (!roundOpen) {
            res.status(409).json({ error: "Round closed. Wait for next round." });
            return;
        }

        // Extract payer from the x402 payment-response header
        const paymentResponseRaw = req.headers["payment-response"] as string | undefined;
        let payerAddress: string | undefined;

        if (paymentResponseRaw) {
            try {
                const decoded = JSON.parse(
                    Buffer.from(paymentResponseRaw, "base64").toString("utf8"),
                );
                payerAddress = decoded.payer;
            } catch {
                // Fall through to body
            }
        }

        // Allow body override for dry-run mode
        if (!payerAddress && req.body?.smartAccountAddress) {
            payerAddress = req.body.smartAccountAddress;
        }

        if (!payerAddress) {
            res.status(400).json({ error: "Could not determine payer address." });
            return;
        }

        // Prevent double-buy
        if (players.some((p) => p.smartAccountAddress.toLowerCase() === payerAddress!.toLowerCase())) {
            res.status(409).json({ error: "Already registered for this round." });
            return;
        }

        const name = req.body?.name || `Unknown (${payerAddress.slice(0, 8)})`;
        players.push({ name, smartAccountAddress: payerAddress as `0x${string}` });

        console.log(`[house] Ticket sold to ${name} (${payerAddress}) — ${players.length} player(s)`);
        res.json({
            registered: true,
            name,
            playerCount: players.length,
        });
    });

    // ── Free endpoint: round status ──
    app.get("/status", (_req, res) => {
        res.json({
            roundOpen,
            playerCount: players.length,
            players: players.map((p) => ({ name: p.name, address: p.smartAccountAddress })),
            ticketPrice: priceDollar,
            potCents: players.length * config.house.ticketPriceCents,
        });
    });

    // ── Free endpoint: health check ──
    app.get("/", (_req, res) => {
        res.json({ service: "agentic-lotto", status: "ok" });
    });

    return new Promise((resolve) => {
        const httpServer = app.listen(config.house.port, () => {
            console.log(`\n[house] Lotto server running on http://localhost:${config.house.port}`);
            console.log(`[house] Facilitator (x402 settlement): ${facilitatorAccount.address}`);
            console.log(`[house] Treasury (payTo / Circle wallet): ${payTo}`);
            console.log(`[house] Ticket price: ${priceDollar} USDC on Base`);
            console.log(`[house] Buy window: ${config.house.buyWindowSeconds}s\n`);
            resolve({
                close: () => httpServer.close(),
            });
        });
    });
}
