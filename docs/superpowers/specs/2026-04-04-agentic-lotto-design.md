# Agentic Lotto — Design Spec

## Overview

A multi-agent lottery game where 3-5 autonomous agents buy tickets via x402 micropayments, a verifiable random draw (SocioLogic x402 RNG) picks a winner, and the prize is paid out via Ampersend smart account transfer. Built as a learning exercise for agent wallets, x402 payments, and autonomous spending.

## Stack

| Component | Tech | Role |
|-----------|------|------|
| Payment protocol | x402 (`@x402/*`) | Agents pay for tickets via HTTP 402 flow |
| Agent wallets | Ampersend (`@ampersend_ai/ampersend-sdk`) | Each agent has a smart account with session keys and spending controls |
| Secret management | 1Claw (`@1claw/sdk`) | Session keys fetched from vault at runtime, never in files |
| Randomness | SocioLogic (`rng.sociologic.ai`) | x402-paid verifiable RNG for the draw |
| Server framework | Express + `@x402/express` | House server with payment middleware |
| Chain | Base mainnet | USDC payments, smart account deployment |

## Directory Structure

```
1claw-examples/
├── ampersend-x402/          # existing demo (reference)
└── agentic-lotto/           # new
    ├── src/
    │   ├── house-server.ts      # Express x402 paywall — the lotto game
    │   ├── agent-runner.ts      # Spawns house + N agents, orchestrates rounds
    │   ├── agent.ts             # Single agent: heuristic + x402 ticket purchase
    │   ├── draw.ts              # Calls SocioLogic x402 RNG to pick winner
    │   ├── payout.ts            # Sends USDC prize to winner via Ampersend
    │   ├── resolve-buyer-key.ts # Fetch session key from 1Claw vault
    │   ├── config.ts            # Agent personalities, game params from env
    │   └── types.ts             # Shared types
    ├── .env.example
    ├── package.json
    └── tsconfig.json
```

## Game Flow

### Single Round

1. **House server starts** on `localhost:4022` with endpoints:
   - `POST /buy-ticket` — $0.01 USDC via x402 paywall. The x402 payment response includes the payer's smart account address (`payer` field) — the house uses this to register the agent as a player. No separate auth needed.
   - `GET /status` — Free. Returns current round info: registered players, pot size, time remaining.
   - `POST /draw` — Free, internal only. Triggers the draw sequence.

2. **Agent runner spawns 3-5 agents**, each with:
   - Own Ampersend smart account (separate address, separate USDC balance)
   - Own session key fetched from 1Claw vault
   - A personality config: `{ name, riskTolerance, minBalance }`

3. **Each agent evaluates and acts:**
   - Fetches `GET /status` to see round info
   - Reads own USDC balance from Base
   - Applies heuristic: `canAfford && ticketPrice < riskTolerance * balance`
   - If yes: `POST /buy-ticket` (x402 handles payment automatically)
   - If no: logs reason, sits out

4. **Buy window closes** (configurable timeout, default 30s, or all agents have decided).

5. **House triggers draw:**
   - Calls SocioLogic: `GET https://rng.sociologic.ai/random/int?min=0&max={playerCount-1}`
   - Pays $0.01 USDC for the RNG call via x402
   - Receives winning index + entropy proof
   - Logs winner selection with entropy data for verifiability

6. **House pays winner:**
   - Prize = (playerCount * $0.01) - $0.01 RNG cost
   - Sends USDC from house smart account to winner's smart account via Ampersend SDK
   - Logs transaction hash

7. **Round complete.** Full results logged.

### Example (5 players)

- 5 agents buy tickets: pot = $0.05
- RNG cost: $0.01
- Winner receives: $0.04
- House net: $0.00 (break-even by design for the demo)

## Agent Personalities

| Name | Risk Tolerance | Min Balance | Behavior |
|------|---------------|-------------|----------|
| Degen Dave | 0.9 | $0.01 | Almost always plays, even when nearly broke |
| Cautious Carol | 0.3 | $0.50 | Only plays with a comfortable cushion |
| Mid Mike | 0.6 | $0.10 | Balanced — plays most rounds |

Risk tolerance means: agent plays if `ticketPrice < riskTolerance * currentBalance`. A tolerance of 0.9 means Dave will spend up to 90% of his balance on a ticket.

## Config

```ts
{
  house: {
    port: 4022,
    ticketPrice: "$0.01",
    buyWindowSeconds: 30,
    smartAccountAddress: "0x...",   // from env
    sessionKeyPath: "keys/lotto-house",
  },
  agents: [
    {
      name: "Degen Dave",
      riskTolerance: 0.9,
      minBalance: 0.01,
      sessionKeyPath: "keys/lotto-agent-1",
      smartAccountAddress: "0x...",  // from env
    },
    // ... Carol, Mike
  ],
  rng: {
    endpoint: "https://rng.sociologic.ai/random/int",
  }
}
```

All smart account addresses and 1Claw credentials come from `.env`. Config.ts reads env vars and structures them.

## Ampersend Setup (Pre-requisites)

Each participant needs an Ampersend agent created in the dashboard:

| Agent | Dashboard Name | Funding | Notes |
|-------|---------------|---------|-------|
| House | "Lotto House" | $0.50 USDC + small ETH for gas | Receives tickets, pays RNG, sends prizes |
| Agent 1 | "Degen Dave" | $0.20 USDC | Player |
| Agent 2 | "Cautious Carol" | $0.20 USDC | Player |
| Agent 3 | "Mid Mike" | $0.20 USDC | Player |

Each agent needs a session key generated and stored in 1Claw vault at its configured path.

## Error Handling

| Failure | Response |
|---------|----------|
| Agent can't afford ticket | Heuristic skips before payment attempt. Logs "sitting out." |
| x402 payment fails | Agent logs failure, does not enter round. Round continues. |
| SocioLogic RNG fails | House retries once. If still failing, round voided — pot carries to next round. |
| Payout to winner fails | House logs debt (winner address + amount). Can be retried. |
| Fewer than 2 players | House skips draw, logs "not enough players." |

## Testing Strategy

- **Dry-run mode** (`--dry-run` flag): Skips real x402 payments and uses `Math.random()` instead of SocioLogic. Tests full flow without spending USDC.
- **Real run**: Flip to real payments. $0.01 tickets keep mistakes cheap.
- **Manual verification**: Check Ampersend dashboard balances before/after. Check BaseScan for RNG and payout transactions.

## Dependencies

```json
{
  "@1claw/sdk": "^0.16.0",
  "@ampersend_ai/ampersend-sdk": "^0.0.16",
  "@x402/core": "^2.9.0",
  "@x402/evm": "^2.9.0",
  "@x402/express": "^2.9.0",
  "@x402/fetch": "^2.9.0",
  "express": "^4.21.0",
  "viem": "^2.0.0"
}
```

Same as the existing `ampersend-x402` demo — no new dependencies needed.

## Out of Scope (v1)

- Multi-round automation (run one round at a time for now)
- On-chain lotto contract (house is a trusted server)
- LLM-driven agent decisions (heuristic only)
- Web UI (terminal output only)
- Multiple ticket purchases per agent per round
