# Agentic Lotto

**Autonomous AI agents playing a real-money lottery on Base — powered by [x402](https://x402.org) micropayments.**

## What is x402?

[x402](https://x402.org) is an open protocol that adds native payments to HTTP. When an agent hits a paid endpoint, the server returns `402 Payment Required` with a price. The agent signs a USDC payment, retries with the proof in a header, and gets the response. That's it — **payments as a fetch header**.

No payment SDKs to integrate. No billing dashboards. No invoices. An agent with a wallet can pay for any x402-enabled service the same way it makes any other HTTP request. This is what makes autonomous agent commerce possible.

## What this repo demonstrates

Three AI agents with different risk personalities autonomously play a lottery using real USDC on Base. Every transaction — ticket purchases, randomness, payouts — happens without human intervention.

```
[Degen Dave]     ──x402──►  ┌─────────────┐  ──x402──►  [SocioLogic RNG]
[Cautious Carol] ──x402──►  │ House Server │               │
[Mid Mike]       ──x402──►  └─────────────┘  ◄────────  winner index
                                  │
                                  ▼
                         Circle Wallet payout
                         (USDC on Base)
```

### How x402 is used

**Agents buy lottery tickets** — The house server has an x402 paywall on `POST /buy-ticket`. Each agent decides whether to play based on its risk personality, then pays $0.01 USDC via x402 to enter. The server verifies the payment on-chain and registers the ticket. No API key, no auth — the payment *is* the authorization.

**The house buys verifiable randomness** — After the buy window closes, the house calls [SocioLogic's RNG endpoint](https://rng.sociologic.ai), which is also x402-gated. The house pays $0.01 USDC and gets back a random winner index with an entropy proof. Verifiable randomness as a paid HTTP call.

**The winner gets paid** — The prize (pot minus RNG cost) is sent to the winner's address via [Circle Programmable Wallets](https://developers.circle.com/w3s/developer-controlled-wallets). The Circle entity secret is stored in a [1Claw](https://1claw.xyz) vault and fetched at runtime — no payment secrets in environment variables.

### The stack

| Layer | Tool | Role |
|-------|------|------|
| Payments | [x402](https://x402.org) | HTTP-native micropayments — agents pay with a fetch header |
| Agent wallets | [Ampersend](https://ampersend.ai) | Smart accounts that sign x402 payments |
| Payouts | [Circle Programmable Wallets](https://developers.circle.com/w3s/developer-controlled-wallets) | USDC transfers via REST API |
| Randomness | [SocioLogic](https://rng.sociologic.ai) | Verifiable RNG, paid via x402 |
| Secrets | [1Claw](https://1claw.xyz) | Session keys and secrets fetched from vault at runtime |
| Chain | [Base](https://base.org) | L2 for USDC settlement |

## Quick start

```bash
cd agentic-lotto
npm install
cp .env.example .env
```

**Try it instantly (no accounts, no USDC):**

```bash
npm run start:dry
```

Dry-run mode skips real payments and uses `Math.random()` for RNG. You'll see the full agent decision loop, ticket buying, winner draw, and payout — all simulated.

**Run it for real on Base:**

You'll need accounts on [1Claw](https://1claw.xyz), [Ampersend](https://ampersend.ai), and [Circle](https://console.circle.com), plus a few dollars of USDC on Base. See the [full setup guide](./agentic-lotto/) for step-by-step instructions.

```bash
npm start
```

### Example output

```
[circle] Secret loaded from 1Claw

[house] Lotto server running on http://localhost:4022
[house] Facilitator (x402 settlement): 0x4fca...
[house] Treasury (payTo / Circle wallet): 0xa5c7...

[Degen Dave] Balance: 0.9100 USDC
[Degen Dave] Deciding to play! (risk=0.9, balance=$0.9100)
[house] Ticket sold to Degen Dave — 1 player(s)

[Cautious Carol] Balance: 1.0300 USDC
[Cautious Carol] Deciding to play! (risk=0.3, balance=$1.0300)
[house] Ticket sold to Cautious Carol — 2 player(s)

[Mid Mike] Balance: 0.9300 USDC
[Mid Mike] Deciding to play! (risk=0.6, balance=$0.9300)
[house] Ticket sold to Mid Mike — 3 player(s)

[draw] RNG returned index 2 (entropy: f1666c46)
[round] WINNER: Mid Mike

[payout] Sending $0.02 USDC to 0x69d4... via Circle
[payout] Circle transaction state: INITIATED
```

## Cost per round

| Item | Cost |
|------|------|
| Ticket (per agent) | $0.01 USDC |
| SocioLogic RNG | $0.01 USDC |
| Circle payout gas | Sponsored by paymaster |
| Facilitator gas | ~$0.001 ETH |
| **3-player round** | **~$0.04** |

## Learn more

- [x402 protocol spec](https://x402.org)
- [x402 on GitHub](https://github.com/coinbase/x402)
- [Full setup guide](./agentic-lotto/)

## License

MIT
