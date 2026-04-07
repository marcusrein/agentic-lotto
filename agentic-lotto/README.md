# Agentic Lotto

**Autonomous AI agents playing a real-money lottery on Base, powered by x402 micropayments, Circle Programmable Wallets, and verifiable on-chain randomness.**

This is a working demo of what happens when you give AI agents wallets, spending heuristics, and let them transact on their own. Three agents — each with a different risk personality — decide whether to buy $0.01 USDC lottery tickets. A verifiable RNG picks the winner. The prize pays out through Circle's Programmable Wallets API. No human touches any transaction.

## Why this exists

We built this to explore a specific question: **what does it look like when AI agents manage real money autonomously?**

The answer requires stitching together several pieces that didn't exist until recently:
- **Agent wallets** (Ampersend) — smart accounts agents can spend from
- **Micropayments** (x402) — HTTP-native payment protocol, so agents can pay for services with a standard `fetch()` call
- **Secret management** (1Claw) — session keys and secrets fetched from a vault at runtime, never stored in `.env`
- **Programmable payouts** (Circle) — developer-controlled wallets with a transfer API, so the house can send winnings without touching raw private keys
- **Verifiable randomness** (SocioLogic) — on-chain RNG paid via x402, so the draw is provably fair

Each piece solves one problem. Together they form a stack where agents can earn, spend, and receive money with no human in the loop.

```
[Degen Dave]     ──x402──►  ┌─────────────┐  ──x402──►  [SocioLogic RNG]
[Cautious Carol] ──x402──►  │ House Server │               │
[Mid Mike]       ──x402──►  └─────────────┘  ◄────────  winner index
                                  │
                                  ▼
                         Circle Wallet payout
                         (USDC on Base)
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

1. House server starts with an x402 paywall on `POST /buy-ticket`
2. Each agent checks its on-chain USDC balance, applies its heuristic, and buys a ticket (or sits out)
3. House calls SocioLogic RNG ($0.01 via x402) to pick a winner index
4. House sends the prize to the winner via Circle's `createTransaction()` API
5. Round result logged as JSON

### Payout architecture

Ticket payments flow to the Circle-managed wallet (set as the x402 `payTo` address). When a winner is drawn, the house calls Circle's Programmable Wallets API to send the prize USDC. The facilitator EOA handles x402 payment settlement separately (it needs ETH for gas), while prize funds live in the Circle wallet — cleanly separating settlement infrastructure from the prize pool.

The Circle entity secret is stored in 1Claw and fetched at runtime. No payment secrets live in environment variables.

## Quick start (dry run)

Try it without spending anything:

```bash
cd agentic-lotto
npm install
cp .env.example .env
# Fill in 1Claw credentials (ONECLAW_API_KEY, ONECLAW_VAULT_ID)
# Fill in agent + house smart account addresses
npm run start:dry
```

Dry-run mode skips x402 payments, uses `Math.random()` for RNG, and logs a mock payout. No Circle account needed.

## Full setup (real money)

### Prerequisites

- Node.js >= 20
- [1Claw](https://1claw.xyz) account with vault + agent API key
- [Ampersend](https://ampersend.ai) account with 4 agents (house + 3 players)
- [Circle](https://console.circle.com) developer account (mainnet API key, entity secret, Base wallet)
- USDC on Base (< $5 total for many rounds)
- Small amount of ETH on Base for facilitator gas (~$0.01)

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

### 3. Fund the facilitator EOA

The facilitator EOA (derived from the house session key) needs ETH for x402 settlement gas. Send ~$0.01 ETH to the address logged at startup:

```
[house] Facilitator (x402 settlement): 0x...
```

### 4. Set up Circle Programmable Wallet

1. Create a developer account at [console.circle.com](https://console.circle.com)
2. Create a **mainnet** API key
3. Generate a 32-byte entity secret and register it in the console (for mainnet)
4. Store the entity secret in your 1Claw vault at `keys/circle-entity-secret`
5. Set up a **gas policy** (paymaster) for Base in the Circle console
6. Create a **wallet set**, then create a **wallet** on `BASE` (SCA account type)
7. Fund the Circle wallet with ~$1 USDC on Base
8. Add to `.env`:

```env
CIRCLE_API_KEY=your_mainnet_api_key
CIRCLE_WALLET_ID=your_wallet_uuid
CIRCLE_WALLET_ADDRESS=0x_your_wallet_address
```

The entity secret is fetched from 1Claw at runtime — it does not go in `.env`.

### 5. Update .env

Fill in all `AGENT_*_SMART_ACCOUNT_ADDRESS` values and `HOUSE_SMART_ACCOUNT_ADDRESS`.

## Run

```bash
# Real run — x402 payments, SocioLogic RNG, Circle payout
npm start

# Multiple rounds
npm run start:multi

# Dry run — no payments, Math.random() RNG, no payout
npm run start:dry
```

### Example output

```
[circle] Fetching secret from 1Claw vault at "keys/circle-entity-secret"
[circle] Secret loaded from 1Claw

[house] Lotto server running on http://localhost:4022
[house] Facilitator (x402 settlement): 0x4fca...
[house] Treasury (payTo / Circle wallet): 0xa5c7...

[Degen Dave] Balance: 0.9100 USDC
[Degen Dave] Deciding to play! (risk=0.9, balance=$0.9100)
[house] Ticket sold to Degen Dave (0xD42c...) — 1 player(s)

[Cautious Carol] Balance: 1.0300 USDC
[Cautious Carol] Deciding to play! (risk=0.3, balance=$1.0300)
[house] Ticket sold to Cautious Carol (0x9eE5...) — 2 player(s)

[Mid Mike] Balance: 0.9300 USDC
[Mid Mike] Deciding to play! (risk=0.6, balance=$0.9300)
[house] Ticket sold to Mid Mike (0x69d4...) — 3 player(s)

[draw] RNG returned index 2 (entropy: f1666c46)
[round] WINNER: Mid Mike (0x69d4...)

[payout] Sending $0.02 USDC to 0x69d4... via Circle
[payout] Circle transaction id: 7cb905c3-d2e5-5021-97f2-d44184076e6e
[payout] Circle transaction state: INITIATED
```

## Stack

| Component | Tech | Role |
|-----------|------|------|
| Payment protocol | [`x402`](https://x402.org) | Agents pay for tickets and RNG via HTTP 402 |
| Agent wallets | [Ampersend](https://ampersend.ai) | Each agent has a smart account with session keys |
| Secret management | [1Claw](https://1claw.xyz) | Session keys + Circle entity secret fetched from vault at runtime |
| Payout | [Circle Programmable Wallets](https://developers.circle.com/w3s/developer-controlled-wallets) | Winner receives USDC via Circle transfer API |
| Randomness | [SocioLogic](https://rng.sociologic.ai) | x402-paid verifiable RNG |
| Server | Express + `@x402/express` | House server with x402 payment middleware |
| Chain | Base mainnet | USDC payments and transfers |

## Project structure

```
agentic-lotto/
├── src/
│   ├── run-lotto.ts        # Orchestrator — resolves keys, runs rounds
│   ├── house-server.ts     # Express x402 paywall (POST /buy-ticket)
│   ├── agent.ts            # Agent heuristic + ticket purchase
│   ├── draw.ts             # SocioLogic RNG call via x402
│   ├── payout.ts           # Circle Programmable Wallets payout
│   ├── resolve-key.ts      # 1Claw vault key/secret fetch
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
| Circle payout gas | Sponsored by Circle paymaster |
| **3-player round total** | **~$0.04** |

House breaks even by design — prize = pot - RNG cost.

## License

MIT
