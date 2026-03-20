# Shroud LLM — LLM Token Billing (Stripe AI Gateway)

> **Reference only** — not for production. This example targets organizations that have **LLM Token Billing** enabled in the dashboard (**Settings → Billing**). It verifies agent JWT claims (`llm_token_billing`, `stripe_customer_id`) and sends a minimal chat request through **Shroud** so traffic can be metered via **Stripe AI Gateway** when Shroud is configured with `STRIPE_SECRET_KEY`.

## What you'll learn

- Confirm your org has **LLM Token Billing** enabled and your agent JWT includes `llm_token_billing` and `stripe_customer_id`
- Send a chat completion through **Shroud** so traffic is metered via Stripe AI Gateway (no need to send provider API keys from the client)
- Use the same Shroud LLM path as [shroud-demo](../shroud-demo/) but with a focus on billing claims

## Prerequisites

1. **Org:** Same organization as your user API key must have **LLM Token Billing** active (complete Stripe checkout in the dashboard).
2. **Stripe customer:** The org should have a Stripe customer id (created when you first use billing or checkout).
3. **Agent:** An agent with **Shroud** enabled (`shroud_enabled: true`). Use `npm run setup` or create one in the dashboard.
4. **OpenAI key:** **NOT required** when LLM Token Billing is enabled (Stripe AI Gateway handles provider keys). Only needed if billing is disabled and you're not storing the key in the vault.

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/shroud-llm
npm install
cp .env.example .env
```

Edit `.env`: set `ONECLAW_API_KEY` (user key from [1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys)). For `npm start` you also need agent credentials: set `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` (or run `npm run setup` to create an agent and have it written to `.env`).

### Step 2 — Create an agent (if needed)

```bash
npm run setup
```

This creates an agent with Shroud enabled and writes `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` to `.env`. In the dashboard, ensure **Settings → Billing → LLM Token Billing** is enabled for your org.

### Step 3 — Run the demo

```bash
npm start
```

**Expected behavior:** The script exchanges agent credentials for a JWT, decodes it to verify `llm_token_billing` and `stripe_customer_id`, then sends a minimal `POST https://shroud.1claw.xyz/v1/chat/completions` request with `X-Shroud-Agent-Key` and `X-Shroud-Provider: openai`. If claims are present, Shroud routes to Stripe's AI Gateway and sets `X-Stripe-Customer-ID` server-side. You should see success (or a skip if agent credentials are missing, e.g. in CI).

## Quick start (summary)

```bash
cd examples/shroud-llm
npm install
cp .env.example .env
# Edit .env: ONECLAW_API_KEY (user key from https://1claw.xyz/settings/api-keys)
npm run setup
# In the dashboard: Settings → Billing → enable LLM Token Billing if not already
npm start
```

## What `npm start` does

| Step | Description |
|------|-------------|
| Org check (optional) | If `ONECLAW_API_KEY` is set, `GET /v1/billing/llm-token-billing` confirms the org toggle. |
| Agent JWT | `POST /v1/auth/agent-token` then decode payload for `llm_token_billing` and `stripe_customer_id`. |
| Shroud LLM | `POST https://shroud.1claw.xyz/v1/chat/completions` with `X-Shroud-Agent-Key`, `X-Shroud-Provider: openai`. |

When claims are present, **Shroud** routes to Stripe's AI Gateway (`llm.stripe.com`) and sets `X-Stripe-Customer-ID` server-side. **Stripe AI Gateway handles the provider API keys** — you do **not** need to provide `OPENAI_API_KEY` or store keys in the vault when LLM billing is enabled. You do not send `X-Stripe-Customer-ID` from the client.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_AGENT_ID` | Yes | Agent UUID |
| `ONECLAW_AGENT_API_KEY` | Yes | Agent key (`ocv_...`) |
| `ONECLAW_API_KEY` | Optional | User API key — org billing check + `npm run setup` |
| `ONECLAW_API_URL` | No | Default `https://api.1claw.xyz` |
| `ONECLAW_SHROUD_URL` | No | Default `https://shroud.1claw.xyz` |
| `OPENAI_API_KEY` | No | **Not needed** when LLM billing is enabled (Stripe handles keys). Only if billing disabled + no vault key. |

## Testing with a dedicated account

Use any org where you have enabled **LLM Token Billing** (e.g. a staging org or your production org). Point `.env` at that org's user API key for setup/verification and an agent that belongs to the same org. There is no separate "demo-only" flag — billing state is entirely from the dashboard + Stripe.

## Exit codes

- **0** — Success, or missing agent credentials (skipped for CI).
- **1** — Agent token exchange failed, JWT decode failed, or Shroud chat completion failed (non-401).

See also **[shroud-demo](../shroud-demo/)** for health, Intents API, and LLM proxy without focusing on billing claims.
