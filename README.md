# Agentic Lotto

**Autonomous AI agents transacting with real money on Base — powered by [x402](https://x402.org) micropayments.**

This repo demonstrates what happens when you combine the new [x402 payment protocol](https://x402.org) with autonomous AI agents. Three agents — each with different risk personalities — play a lottery using real USDC on Base. They buy tickets via HTTP 402 micropayments, a verifiable RNG picks the winner, and the prize pays out automatically. No human touches any transaction.

x402 turns any HTTP endpoint into a paid API. An agent makes a request, gets back a `402 Payment Required` with a price, signs the payment, and retries. That's it — payments as a fetch header. This repo shows what you can build on top of that primitive.

## The flagship example

### [Agentic Lotto](./agentic-lotto/) — Multi-agent lottery on Base

Three autonomous agents buy $0.01 USDC tickets, [SocioLogic](https://rng.sociologic.ai) provides verifiable randomness (also paid via x402), and the winner receives the pot through [Circle Programmable Wallets](https://developers.circle.com/w3s/developer-controlled-wallets). All secrets live in [1Claw](https://1claw.xyz) vaults — nothing sensitive in `.env`.

```
[Degen Dave]     ──x402──►  ┌─────────────┐  ──x402──►  [SocioLogic RNG]
[Cautious Carol] ──x402──►  │ House Server │               │
[Mid Mike]       ──x402──►  └─────────────┘  ◄────────  winner index
                                  │
                                  ▼
                         Circle Wallet payout
                         (USDC on Base)
```

**[Get started →](./agentic-lotto/)**

## All examples

| Example | What it does | x402 role |
|---------|-------------|-----------|
| **[agentic-lotto](./agentic-lotto/)** | Multi-agent lottery with real USDC payouts | Agents pay for tickets and RNG via x402 |
| [ampersend-x402](./ampersend-x402/) | x402 paywall server + smart account client | Ampersend smart accounts sign x402 payments |
| [x402-payments](./x402-payments/) | Pay for API calls with USDC on Base | EOA signs x402 payments for 1Claw endpoints |
| [basic](./basic/) | 1Claw SDK fundamentals: vaults, secrets, billing | — |
| [langchain-agent](./langchain-agent/) | LangChain agent fetches secrets just-in-time | — |
| [fastmcp-tool-server](./fastmcp-tool-server/) | Custom MCP server with domain tools | — |
| [nextjs-agent-secret](./nextjs-agent-secret/) | AI chat app with server-side secret handling | — |
| [google-a2a](./google-a2a/) | Multi-agent communication via Google A2A protocol | — |
| [tx-simulation](./tx-simulation/) | On-chain transactions with guardrails | — |
| [local-inspect](./local-inspect/) | Detect prompt injection and PII locally | — |
| [shroud-demo](./shroud-demo/) | Shroud TEE proxy for LLM traffic | — |
| [shroud-llm](./shroud-llm/) | Shroud + LLM token billing via Stripe | — |
| [shroud-security](./shroud-security/) | Shroud threat detection filters | — |

## The x402 stack

[x402](https://x402.org) is an open payment protocol that adds native payments to HTTP. When a server returns `402 Payment Required`, the client signs a USDC payment and retries with the payment proof in a header. Settlement happens on-chain (Base, Ethereum, etc.) via a facilitator.

This repo shows x402 used three ways:

1. **Agent-to-server payments** — Agents buy lottery tickets by paying the house server's x402 paywall
2. **Server-to-service payments** — The house pays SocioLogic for verifiable randomness via x402
3. **API monetization** — 1Claw endpoints accept x402 payments when over quota

### How the pieces fit together

| Layer | Tool | What it does |
|-------|------|-------------|
| Payments | [x402](https://x402.org) | HTTP-native micropayments (agents pay with a fetch header) |
| Agent wallets | [Ampersend](https://ampersend.ai) | Smart accounts that sign x402 payments |
| Secret management | [1Claw](https://1claw.xyz) | Session keys and secrets fetched from vault at runtime |
| Payouts | [Circle Programmable Wallets](https://developers.circle.com/w3s/developer-controlled-wallets) | USDC transfers via REST API |
| Randomness | [SocioLogic](https://rng.sociologic.ai) | Verifiable RNG, paid via x402 |
| Chain | [Base](https://base.org) | L2 for USDC settlement |

## Quick start

```bash
# Try the lottery in dry-run mode (no real payments)
cd agentic-lotto
npm install
cp .env.example .env
# Fill in 1Claw credentials + agent addresses
npm run start:dry

# Or try x402 payments directly
cd ampersend-x402
npm install
cp .env.example .env
npm start
```

See each example's README for full setup instructions.

## Learn more

- [x402 protocol spec](https://x402.org)
- [x402 on GitHub](https://github.com/coinbase/x402)
- [Agentic Lotto deep dive](./agentic-lotto/)
- [1Claw docs](https://docs.1claw.xyz)
- [Ampersend docs](https://docs.ampersend.ai)
- [Circle Programmable Wallets](https://developers.circle.com/w3s/developer-controlled-wallets)

## License

MIT
