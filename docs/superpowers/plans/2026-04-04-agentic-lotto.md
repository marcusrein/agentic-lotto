# Agentic Lotto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-agent lottery where 3-5 agents buy tickets via x402, SocioLogic provides verifiable randomness for the draw, and the winner receives the pot as a USDC transfer.

**Architecture:** Express server with x402 paywall for ticket purchases. Agent runner spawns N agents in-process, each with its own Ampersend smart account and 1Claw-managed session key. House facilitator EOA collects ticket payments and pays out the winner directly via USDC transfer. SocioLogic x402 RNG picks the winner.

**Tech Stack:** TypeScript, Express, @x402/*, @ampersend_ai/ampersend-sdk, @1claw/sdk, viem, SocioLogic RNG API

---

### Task 1: Project Scaffold

**Files:**
- Create: `agentic-lotto/package.json`
- Create: `agentic-lotto/tsconfig.json`
- Create: `agentic-lotto/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
    "name": "agentic-lotto",
    "version": "0.1.0",
    "private": true,
    "license": "MIT",
    "type": "module",
    "engines": {
        "node": ">=20"
    },
    "scripts": {
        "start": "npx tsx --env-file=.env src/run-lotto.ts",
        "start:dry": "npx tsx --env-file=.env src/run-lotto.ts --dry-run",
        "server": "npx tsx --env-file=.env src/house-server.ts",
        "setup": "npx tsx src/setup-lotto.ts"
    },
    "dependencies": {
        "@1claw/sdk": "^0.16.0",
        "@ampersend_ai/ampersend-sdk": "^0.0.16",
        "@x402/core": "^2.9.0",
        "@x402/evm": "^2.9.0",
        "@x402/express": "^2.9.0",
        "@x402/fetch": "^2.9.0",
        "express": "^4.21.0",
        "viem": "^2.0.0"
    },
    "devDependencies": {
        "@types/express": "^5.0.0",
        "@types/node": "^22.0.0",
        "tsx": "^4.0.0",
        "typescript": "^5.0.0"
    }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "outDir": "dist",
        "rootDir": "src"
    },
    "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create .env.example**

```bash
# ── 1Claw Credentials ─────────────────────────────────────────────────
ONECLAW_API_KEY=ocv_your_agent_key_here
ONECLAW_VAULT_ID=your-vault-uuid
ONECLAW_AGENT_ID=your-agent-uuid
# ONECLAW_BASE_URL=https://api.1claw.xyz

# ── House Config ───────────────────────────────────────────────────────
# The facilitator EOA also receives ticket payments (payTo = facilitator).
# Needs Base ETH for gas (~$0.01) and will accumulate USDC from tickets.
HOUSE_SESSION_KEY_PATH=keys/lotto-house
HOUSE_SMART_ACCOUNT_ADDRESS=0x_house_smart_account
# LOTTO_SERVER_PORT=4022
# TICKET_PRICE_CENTS=1
# BUY_WINDOW_SECONDS=30

# ── Agent 1: Degen Dave ───────────────────────────────────────────────
AGENT_1_NAME=Degen Dave
AGENT_1_SMART_ACCOUNT_ADDRESS=0x_agent_1_smart_account
AGENT_1_SESSION_KEY_PATH=keys/lotto-agent-1
AGENT_1_RISK_TOLERANCE=0.9
AGENT_1_MIN_BALANCE=0.01

# ── Agent 2: Cautious Carol ──────────────────────────────────────────
AGENT_2_NAME=Cautious Carol
AGENT_2_SMART_ACCOUNT_ADDRESS=0x_agent_2_smart_account
AGENT_2_SESSION_KEY_PATH=keys/lotto-agent-2
AGENT_2_RISK_TOLERANCE=0.3
AGENT_2_MIN_BALANCE=0.50

# ── Agent 3: Mid Mike ────────────────────────────────────────────────
AGENT_3_NAME=Mid Mike
AGENT_3_SMART_ACCOUNT_ADDRESS=0x_agent_3_smart_account
AGENT_3_SESSION_KEY_PATH=keys/lotto-agent-3
AGENT_3_RISK_TOLERANCE=0.6
AGENT_3_MIN_BALANCE=0.10

# ── Ampersend ─────────────────────────────────────────────────────────
# AMPERSEND_API_URL=https://api.ampersend.ai

# ── Debug ─────────────────────────────────────────────────────────────
# X402_CLIENT_DEBUG=1
```

- [ ] **Step 4: Install dependencies**

Run: `cd agentic-lotto && npm install`
Expected: Clean install, node_modules created.

- [ ] **Step 5: Commit**

```bash
git add agentic-lotto/package.json agentic-lotto/tsconfig.json agentic-lotto/.env.example
git commit -m "feat(agentic-lotto): scaffold project with deps and env template"
```

---

### Task 2: Types and Config

**Files:**
- Create: `agentic-lotto/src/types.ts`
- Create: `agentic-lotto/src/config.ts`

- [ ] **Step 1: Create types.ts**

```ts
import type { Hex, Address } from "viem";

export interface AgentPersonality {
    name: string;
    smartAccountAddress: Address;
    sessionKeyPath: string;
    riskTolerance: number; // 0-1: will play if ticketPrice < riskTolerance * balance
    minBalance: number;    // USD: won't play if balance below this
}

export interface HouseConfig {
    port: number;
    ticketPriceCents: number; // in USDC cents (1 = $0.01)
    buyWindowSeconds: number;
    smartAccountAddress: Address;
    sessionKeyPath: string;
}

export interface LottoConfig {
    house: HouseConfig;
    agents: AgentPersonality[];
    rng: { endpoint: string };
    ampersendApiUrl: string;
    oneclaw: {
        apiKey: string;
        vaultId: string;
        baseUrl: string;
        agentId?: string;
    };
    dryRun: boolean;
}

export interface RoundPlayer {
    name: string;
    smartAccountAddress: Address;
}

export interface RoundResult {
    roundId: string;
    players: RoundPlayer[];
    potCents: number;
    rngCostCents: number;
    prizeCents: number;
    winner: RoundPlayer | null;
    entropy: { raw: number[]; hex: string } | null;
    payoutTxHash: string | null;
    error: string | null;
}

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_CHAIN_ID = 8453;
```

- [ ] **Step 2: Create config.ts**

```ts
import type { LottoConfig, AgentPersonality } from "./types.js";
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
        dryRun,
    };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors. (Will warn about unused exports, that's fine.)

- [ ] **Step 4: Commit**

```bash
git add agentic-lotto/src/types.ts agentic-lotto/src/config.ts
git commit -m "feat(agentic-lotto): add types and env-based config loader"
```

---

### Task 3: Resolve Buyer Key (1Claw integration)

**Files:**
- Create: `agentic-lotto/src/resolve-key.ts`

- [ ] **Step 1: Create resolve-key.ts**

Adapted from `ampersend-x402/src/resolve-buyer-key.ts` but takes a label for clearer multi-agent logging.

```ts
import { createClient } from "@1claw/sdk";
import type { Hex } from "viem";

interface ResolveOptions {
    apiKey: string;
    vaultId: string;
    baseUrl: string;
    agentId?: string;
    secretPath: string;
    label: string; // e.g. "house" or "Degen Dave"
}

export async function resolveKey(opts: ResolveOptions): Promise<Hex> {
    console.log(`[${opts.label}] Fetching session key from 1Claw vault at "${opts.secretPath}"`);

    const sdk = createClient({ baseUrl: opts.baseUrl });

    if (opts.agentId) {
        await sdk.auth.agentToken({
            api_key: opts.apiKey,
            agent_id: opts.agentId,
        });
    } else {
        await sdk.auth.apiKeyToken({ api_key: opts.apiKey });
    }

    const res = await sdk.secrets.get(opts.vaultId, opts.secretPath);

    if (res.error) {
        throw new Error(
            `[${opts.label}] Failed to fetch key from 1Claw: ${res.error.message}. ` +
            `Store a session key at "${opts.secretPath}" in vault ${opts.vaultId}.`
        );
    }

    const value = res.data!.value;
    if (!value || !value.startsWith("0x")) {
        throw new Error(
            `[${opts.label}] Secret at "${opts.secretPath}" doesn't look like a private key (must start with 0x).`
        );
    }

    console.log(`[${opts.label}] Session key loaded from 1Claw`);
    return value as Hex;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add agentic-lotto/src/resolve-key.ts
git commit -m "feat(agentic-lotto): add resolve-key helper for 1Claw vault lookups"
```

---

### Task 4: House Server

**Files:**
- Create: `agentic-lotto/src/house-server.ts`

This is the x402 paywall server. It exposes `/buy-ticket` (paid), `/status` (free), and `/draw` (internal). The facilitator EOA is also the `payTo` address — ticket USDC lands in the same wallet that has ETH for gas.

- [ ] **Step 1: Create house-server.ts**

```ts
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
    // payTo = facilitator EOA so ticket USDC and gas wallet are the same address
    const payTo = facilitatorAccount.address;

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

    app.use(paymentMiddleware(routes, server));

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
            console.log(`[house] Facilitator / payTo: ${payTo}`);
            console.log(`[house] Ticket price: ${priceDollar} USDC on Base`);
            console.log(`[house] Buy window: ${config.house.buyWindowSeconds}s\n`);
            resolve({
                close: () => httpServer.close(),
            });
        });
    });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add agentic-lotto/src/house-server.ts
git commit -m "feat(agentic-lotto): house server with x402 ticket paywall"
```

---

### Task 5: Agent Logic

**Files:**
- Create: `agentic-lotto/src/agent.ts`

Each agent: checks balance, applies heuristic, buys ticket if conditions met.

- [ ] **Step 1: Create agent.ts**

```ts
import { createAmpersendHttpClient } from "@ampersend_ai/ampersend-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import type { Hex, Address } from "viem";
import type { AgentPersonality, LottoConfig, USDC_BASE } from "./types.js";
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add agentic-lotto/src/agent.ts
git commit -m "feat(agentic-lotto): agent with heuristic-based ticket buying"
```

---

### Task 6: Draw (SocioLogic RNG)

**Files:**
- Create: `agentic-lotto/src/draw.ts`

Calls SocioLogic's x402 RNG API to pick a winner. In dry-run mode, uses Math.random().

- [ ] **Step 1: Create draw.ts**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add agentic-lotto/src/draw.ts
git commit -m "feat(agentic-lotto): draw module using SocioLogic x402 RNG"
```

---

### Task 7: Payout

**Files:**
- Create: `agentic-lotto/src/payout.ts`

Sends USDC from the facilitator EOA to the winner's smart account using a direct ERC-20 transfer via viem.

- [ ] **Step 1: Create payout.ts**

```ts
import {
    createWalletClient,
    createPublicClient,
    http,
    encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { Hex, Address } from "viem";
import { USDC_BASE } from "./types.js";

const transferAbi = [
    {
        name: "transfer",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
    },
] as const;

export async function payoutWinner(
    facilitatorKey: Hex,
    winnerAddress: Address,
    amountCents: number,
    dryRun: boolean,
): Promise<string | null> {
    // amountCents is in USDC cents; USDC has 6 decimals.
    // 1 cent = 0.01 USDC = 10_000 units (10^4)
    const amountUnits = BigInt(amountCents) * 10_000n;

    console.log(
        `[payout] Sending $${(amountCents / 100).toFixed(3)} USDC to ${winnerAddress}`,
    );

    if (dryRun) {
        console.log(`[payout] Dry-run: skipping on-chain transfer.`);
        return "0xdryrun";
    }

    const account = privateKeyToAccount(facilitatorKey);
    const baseTransport = process.env.BASE_RPC_URL?.trim()
        ? http(process.env.BASE_RPC_URL.trim())
        : http();

    const walletClient = createWalletClient({
        account,
        chain: base,
        transport: baseTransport,
    });

    const publicClient = createPublicClient({
        chain: base,
        transport: baseTransport,
    });

    const txHash = await walletClient.writeContract({
        address: USDC_BASE,
        abi: transferAbi,
        functionName: "transfer",
        args: [winnerAddress, amountUnits],
    });

    console.log(`[payout] USDC transfer tx: ${txHash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status === "reverted") {
        throw new Error(`[payout] Transaction reverted: ${txHash}`);
    }

    console.log(`[payout] Confirmed in block ${receipt.blockNumber}`);
    return txHash;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add agentic-lotto/src/payout.ts
git commit -m "feat(agentic-lotto): payout module - USDC transfer via facilitator EOA"
```

---

### Task 8: Run Lotto (Orchestrator)

**Files:**
- Create: `agentic-lotto/src/run-lotto.ts`

Ties everything together: starts house, runs agents, triggers draw, pays winner.

- [ ] **Step 1: Create run-lotto.ts**

```ts
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { resolveKey } from "./resolve-key.js";
import { startHouseServer, getPlayers, closeRound, resetRound } from "./house-server.js";
import { runAgent } from "./agent.js";
import { drawWinner } from "./draw.js";
import { payoutWinner } from "./payout.js";
import type { RoundResult } from "./types.js";
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

    const decisions = await Promise.all(
        config.agents.map((agent, i) => runAgent(agent, agentKeys[i], config)),
    );

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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd agentic-lotto && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add agentic-lotto/src/run-lotto.ts
git commit -m "feat(agentic-lotto): orchestrator - ties house, agents, draw, payout together"
```

---

### Task 9: Dry-Run Test

**Files:**
- Modify: `agentic-lotto/.env.example` (copy to `.env` with test values)

Test the full flow without real payments.

- [ ] **Step 1: Create a test .env for dry-run**

Copy `.env.example` to `.env` and fill in your existing 1Claw credentials plus placeholder addresses. For dry-run, the smart account addresses don't need to be real Ampersend accounts — they just need to be valid Ethereum addresses (the heuristic will check real on-chain balances though, so use your existing Prime Ranger address for at least one agent to see a real balance check).

For a pure dry-run without any on-chain reads, temporarily hardcode balances or use `--dry-run` which still reads balances but skips payments.

- [ ] **Step 2: Run dry-run**

Run: `cd agentic-lotto && npm run start:dry`

Expected output pattern:
```
[config] Dry-run mode: no real payments, local RNG.

[house] Fetching session key from 1Claw vault at "keys/lotto-house"
[house] Session key loaded from 1Claw

[house] Lotto server running on http://localhost:4022
...

==================================================
  ROUND abc12345
==================================================

[round] Resolving agent session keys...
[Degen Dave] Fetching session key from 1Claw vault at "keys/lotto-agent-1"
...

[round] Buy window open (30s)...

[Degen Dave] Balance: X.XXXX USDC
[Degen Dave] Deciding to play!
[Degen Dave] Ticket purchased (dry-run)!
...

[round] Drawing winner...
[draw] Dry-run RNG: picked index N of M

[round] WINNER: <name> (<address>)

[payout] Sending $0.0XX USDC to <address>
[payout] Dry-run: skipping on-chain transfer.

==================================================
  ROUND abc12345 RESULT
==================================================
{ ... JSON summary ... }
```

- [ ] **Step 3: Fix any issues found during dry-run**

If compilation or runtime errors occur, fix them and re-run.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A agentic-lotto/
git commit -m "fix(agentic-lotto): fixes from dry-run testing"
```

---

### Task 10: Ampersend Agent Setup + Real Run

This task is done manually in the Ampersend dashboard + 1Claw, then validated with a real run.

- [ ] **Step 1: Create Ampersend agents**

In https://ampersend.ai dashboard:
1. Create "Lotto House" agent → note its smart account address
2. Create "Degen Dave" agent → note address, fund with $0.20 USDC
3. Create "Cautious Carol" agent → note address, fund with $0.20 USDC
4. Create "Mid Mike" agent → note address, fund with $0.20 USDC
5. Fund "Lotto House" with $0.50 USDC + send ~$0.01 ETH on Base to the facilitator EOA for gas

- [ ] **Step 2: Generate and store session keys in 1Claw**

For each agent, generate a session key and store it:
- `keys/lotto-house`
- `keys/lotto-agent-1`
- `keys/lotto-agent-2`
- `keys/lotto-agent-3`

You can reuse the existing `setup-ampersend.ts` pattern or do it manually via 1Claw dashboard/CLI.

- [ ] **Step 3: Register session keys with Ampersend**

Each session key's public address must be registered as an authorized signer on the corresponding Ampersend smart account. This is done in the Ampersend dashboard under each agent's "Set up agent" section.

- [ ] **Step 4: Update .env with real values**

Fill in all `AGENT_*_SMART_ACCOUNT_ADDRESS` and `HOUSE_SMART_ACCOUNT_ADDRESS` values.

- [ ] **Step 5: Real run**

Run: `cd agentic-lotto && npm start`

Expected: Same flow as dry-run but with real x402 payments, real SocioLogic RNG call, and real USDC payout to the winner. Verify:
- Ampersend dashboard shows spending on each agent that played
- BaseScan shows the RNG payment and payout transfer
- Winner's balance increased

- [ ] **Step 6: Commit final .env.example updates if needed**

```bash
git add agentic-lotto/.env.example
git commit -m "docs(agentic-lotto): update env example with setup notes"
```
