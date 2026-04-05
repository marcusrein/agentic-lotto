# Agentic Lotto

Multi-agent lottery on Base. Three autonomous agents buy $0.01 USDC tickets via [x402](https://x402.org) micropayments, [SocioLogic](https://rng.sociologic.ai) provides verifiable randomness for the draw, and the winner receives the pot as a direct USDC transfer.

```
[Degen Dave]  ──x402──►  ┌─────────────┐  ──x402──►  [SocioLogic RNG]
[Cautious Carol] ──x402──► │ House Server │               │
[Mid Mike]    ──x402──►  └─────────────┘  ◄────────  winner index
                               │
                               ▼
                      USDC transfer to winner
                      (facilitator EOA → viem)
```

## How it works

Each agent has its own [Ampersend](https://ampersend.ai) smart account, session key (stored in [1Claw](https://1claw.xyz) vault), and personality config that determines whether it plays:

| Agent | Risk Tolerance | Min Balance | Behavior |
|-------|---------------|-------------|----------|
| Degen Dave | 0.9 | $0.01 | Almost always plays |
| Cautious Carol | 0.3 | $0.50 | Only with a cushion |
| Mid Mike | 0.6 | $0.10 | Balanced |

An agent plays if `ticketPrice < riskTolerance * balance` and `balance >= minBalance`.

### Round lifecycle

1. House server starts with x402 paywall on `POST /buy-ticket`
2. Each agent checks its on-chain USDC balance, applies heuristic, buys ticket (or sits out)
3. House calls SocioLogic RNG ($0.01 via x402) to pick a winner index
4. Facilitator EOA sends USDC prize to winner via `transfer()`
5. Round result logged as JSON

### Payout architecture

Ampersend SDK is pull-based only (x402 payment flow) — no programmatic send/transfer API. Payout uses a direct viem USDC `transfer()` from the facilitator EOA, which is also the `payTo` address for ticket payments. This means ticket revenue and gas funds live in the same wallet.

## Prerequisites

- Node.js >= 20
- [1Claw](https://1claw.xyz) account with vault + agent API key
- [Ampersend](https://ampersend.ai) account with 4 agents (house + 3 players)
- USDC on Base (< $5 total for many rounds)
- Small amount of ETH on Base for facilitator gas (~$0.01)

## Setup

```bash
cd agentic-lotto
npm install
cp .env.example .env
# Fill in 1Claw credentials and house smart account address
```

### 1. Create Ampersend agents

In the [Ampersend dashboard](https://ampersend.ai):
- Create agents: "Degen Dave", "Cautious Carol", "Mid Mike"
- Note each smart account address
- Fund each with USDC via "Top up" ($0.20+ each)
- Use an existing agent as the house (needs $0.50+ USDC)

### 2. Generate and store session keys

For each player agent, go to Agent Keys → "+ Add" → "Create Key". Copy each key secret.

```bash
npm run setup
# Prompts for your 1ck_ user API key, then each agent's key secret
# Stores them in 1Claw vault at keys/lotto-agent-{1,2,3}
```

The house reuses an existing session key (e.g. from the ampersend-x402 demo).

### 3. Fund the facilitator EOA

The facilitator EOA (derived from the house session key) needs USDC for payouts and ETH for gas. Send ~$1 USDC and ~$0.01 ETH to the address logged at startup:

```
[house] Facilitator / payTo: 0x...
```

### 4. Update .env

Fill in all `AGENT_*_SMART_ACCOUNT_ADDRESS` values and `HOUSE_SMART_ACCOUNT_ADDRESS`.

## Run

```bash
# Real run — x402 payments, SocioLogic RNG, on-chain payout
npm start

# Dry run — no payments, Math.random() RNG, no payout
npm run start:dry
```

### Example output

```
[Degen Dave] Balance: 1.0000 USDC
[Degen Dave] Deciding to play! (risk=0.9, balance=$1.0000)
[house] Ticket sold to Degen Dave (0xD42c...) — 1 player(s)
[Degen Dave] Ticket purchased!

[Cautious Carol] Balance: 0.9900 USDC
[Cautious Carol] Deciding to play! (risk=0.3, balance=$0.9900)
[house] Ticket sold to Cautious Carol (0x9eE5...) — 2 player(s)
[Cautious Carol] Ticket purchased!

[Mid Mike] Balance: 1.0000 USDC
[Mid Mike] Deciding to play! (risk=0.6, balance=$1.0000)
[house] Ticket sold to Mid Mike (0x69d4...) — 3 player(s)
[Mid Mike] Ticket purchased!

[draw] RNG returned index 0 (entropy: 62ef9cd1)
[round] WINNER: Degen Dave (0xD42c...)
[payout] USDC transfer tx: 0x05c0...
[payout] Confirmed in block 44294567
```

## Stack

| Component | Tech | Role |
|-----------|------|------|
| Payment protocol | `@x402/*` | Agents pay for tickets via HTTP 402 |
| Agent wallets | `@ampersend_ai/ampersend-sdk` | Each agent has a smart account with session keys |
| Secret management | `@1claw/sdk` | Session keys fetched from vault at runtime |
| Randomness | SocioLogic (`rng.sociologic.ai`) | x402-paid verifiable RNG |
| Server | Express + `@x402/express` | House server with payment middleware |
| Chain | Base mainnet | USDC payments and transfers |

## Project structure

```
agentic-lotto/
├── src/
│   ├── run-lotto.ts        # Orchestrator — runs a single round
│   ├── house-server.ts     # Express x402 paywall (POST /buy-ticket)
│   ├── agent.ts            # Agent heuristic + ticket purchase
│   ├── draw.ts             # SocioLogic RNG call
│   ├── payout.ts           # Direct USDC transfer via viem
│   ├── resolve-key.ts      # 1Claw vault key fetch
│   ├── config.ts           # Env-based config loader
│   ├── types.ts            # Shared types and constants
│   └── setup-lotto.ts      # Store Ampersend keys in 1Claw
├── .env.example
├── package.json
└── tsconfig.json
```

## Cost per round

| Item | Cost |
|------|------|
| Ticket (per agent) | $0.01 USDC |
| SocioLogic RNG | $0.01 USDC |
| Facilitator gas | ~$0.001 ETH |
| **3-player round total** | **~$0.04** |

House breaks even by design — prize = pot - RNG cost.
