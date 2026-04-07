# Circle Programmable Wallets Payout Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct viem USDC `transfer()` payout with Circle Programmable Wallets, so the house treasury is a Circle developer-controlled wallet and payouts go through Circle's transfer API.

**Architecture:** The house x402 `payTo` address becomes a Circle wallet address. Ticket USDC still flows in via x402 facilitator settlement. When a winner is drawn, `payout.ts` calls Circle's `createTransaction()` instead of raw viem `writeContract()`. The facilitator EOA still handles x402 settlement (that's x402 infra, not payout), but the prize money lives in and pays out from the Circle wallet.

**Tech Stack:** `@circle-fin/developer-controlled-wallets` SDK, existing x402/Ampersend/1Claw stack unchanged.

---

## Prerequisites (manual, before code)

Before starting the code tasks, Marcus needs to:

1. **Create a Circle developer account** at [console.circle.com](https://console.circle.com)
2. **Get an API key** from the Circle console
3. **Generate a 32-byte entity secret** (hex-encoded) and register it in the Circle console
4. **Create a wallet set** via the console or API
5. **Create a developer-controlled wallet on Base** (`BASE` blockchain)
6. **Note the wallet ID and wallet address** — the address becomes the new `payTo`
7. **Fund the Circle wallet** with ~$1 USDC on Base (this is the prize pool)

The wallet address must be set as `CIRCLE_WALLET_ADDRESS` in `.env` so the house server uses it as `payTo`. The wallet ID is needed for the transfer API call.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/payout.ts` | **Rewrite** | Circle SDK transfer instead of viem transfer |
| `src/config.ts` | **Modify** | Add Circle env vars to config |
| `src/types.ts` | **Modify** | Add `CircleConfig` to `LottoConfig` |
| `src/house-server.ts` | **Modify** | Use Circle wallet address as `payTo` |
| `src/run-lotto.ts` | **Modify** | Pass Circle config to payout, remove facilitator key from payout call |
| `.env.example` | **Modify** | Add Circle env vars |
| `package.json` | **Modify** | Add `@circle-fin/developer-controlled-wallets` |

---

### Task 1: Add Circle SDK dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the Circle SDK**

```bash
cd /Users/marcusrein/Desktop/Projects/agentic-lotto/1claw-examples/agentic-lotto
npm install @circle-fin/developer-controlled-wallets
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@circle-fin/developer-controlled-wallets')" && echo "OK"
```

Expected: `OK` (no errors)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add Circle developer-controlled-wallets SDK"
```

---

### Task 2: Add Circle config to types and config loader

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add CircleConfig to types.ts**

Add the `CircleConfig` interface and include it in `LottoConfig`:

```typescript
// Add after the HouseConfig interface (after line 17)
export interface CircleConfig {
    apiKey: string;
    entitySecret: string;
    walletId: string;
    walletAddress: Address;
}
```

Update `LottoConfig` to include it:

```typescript
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
    circle: CircleConfig;
    dryRun: boolean;
}
```

- [ ] **Step 2: Load Circle env vars in config.ts**

Add Circle config loading inside `loadConfig()`, before the `return` statement:

```typescript
const circle: CircleConfig = {
    apiKey: reqEnv("CIRCLE_API_KEY"),
    entitySecret: reqEnv("CIRCLE_ENTITY_SECRET"),
    walletId: reqEnv("CIRCLE_WALLET_ID"),
    walletAddress: reqEnv("CIRCLE_WALLET_ADDRESS") as Address,
};
```

Add the import at the top of `config.ts`:

```typescript
import type { LottoConfig, AgentPersonality, CircleConfig } from "./types.js";
```

Add `circle` to the returned config object:

```typescript
return {
    house: { ... },
    agents,
    rng: { ... },
    ampersendApiUrl: ...,
    oneclaw: { ... },
    circle,
    dryRun,
};
```

- [ ] **Step 3: Add Circle vars to .env.example**

Add this block after the House Config section in `.env.example`:

```bash
# ── Circle Programmable Wallets ──────────────────────────────────────
# Get these from https://console.circle.com
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_32_byte_hex_entity_secret
CIRCLE_WALLET_ID=your_circle_wallet_uuid
CIRCLE_WALLET_ADDRESS=0x_your_circle_wallet_address
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No errors. (Will fail until payout.ts and run-lotto.ts are updated in later tasks — that's fine, note the errors and move on.)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/config.ts .env.example
git commit -m "feat: add Circle config to types and env loader"
```

---

### Task 3: Rewrite payout.ts to use Circle SDK

**Files:**
- Rewrite: `src/payout.ts`

- [ ] **Step 1: Replace payout.ts with Circle implementation**

Replace the entire contents of `src/payout.ts` with:

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { CircleConfig } from "./types.js";
import type { Address } from "viem";

// USDC token ID on Base mainnet — from Circle's monitored tokens registry
// https://developers.circle.com/w3s/developer-controlled-wallets/monitored-tokens
const USDC_BASE_TOKEN_ID = "fbd4cda4-0783-55c1-a947-7a29cf553de3";

export async function payoutWinner(
    circleConfig: CircleConfig,
    winnerAddress: Address,
    amountCents: number,
    dryRun: boolean,
): Promise<string | null> {
    const amountUsdc = (amountCents / 100).toFixed(2);

    console.log(
        `[payout] Sending $${amountUsdc} USDC to ${winnerAddress} via Circle`,
    );

    if (dryRun) {
        console.log(`[payout] Dry-run: skipping Circle transfer.`);
        return "0xdryrun";
    }

    const circleSdk = initiateDeveloperControlledWalletsClient({
        apiKey: circleConfig.apiKey,
        entitySecret: circleConfig.entitySecret,
    });

    const response = await circleSdk.createTransaction({
        walletId: circleConfig.walletId,
        tokenId: USDC_BASE_TOKEN_ID,
        destinationAddress: winnerAddress,
        amounts: [amountUsdc],
        fee: {
            type: "level",
            config: {
                feeLevel: "MEDIUM",
            },
        },
    });

    const tx = response.data?.transaction;
    if (!tx) {
        throw new Error(`[payout] Circle createTransaction returned no transaction data`);
    }

    console.log(`[payout] Circle transaction id: ${tx.id}`);
    console.log(`[payout] Circle transaction state: ${tx.state}`);

    // The txHash may not be immediately available — Circle processes async.
    // Log what we have.
    const txHash = tx.txHash ?? tx.id;
    console.log(`[payout] tx reference: ${txHash}`);

    return txHash;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: May still show errors in `run-lotto.ts` (it still calls the old signature). That's fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/payout.ts
git commit -m "feat: rewrite payout to use Circle Programmable Wallets"
```

---

### Task 4: Update run-lotto.ts to pass Circle config to payout

**Files:**
- Modify: `src/run-lotto.ts`

- [ ] **Step 1: Update the payoutWinner call in runRound()**

In `src/run-lotto.ts`, find the payout call (around line 124):

```typescript
        const txHash = await payoutWinner(
            houseKey,
            draw.winner.smartAccountAddress,
            prizeCents,
            config.dryRun,
        );
```

Replace it with:

```typescript
        const txHash = await payoutWinner(
            config.circle,
            draw.winner.smartAccountAddress,
            prizeCents,
            config.dryRun,
        );
```

That's the only change in this file. The `houseKey` is still used for the x402 facilitator and agent key resolution — only the payout call signature changes.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: Clean compile (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/run-lotto.ts
git commit -m "feat: pass Circle config to payout instead of facilitator key"
```

---

### Task 5: Update house-server.ts to use Circle wallet as payTo

**Files:**
- Modify: `src/house-server.ts`

- [ ] **Step 1: Change payTo from facilitator EOA to Circle wallet address**

In `src/house-server.ts`, find lines 41-43:

```typescript
    const facilitatorAccount = privateKeyToAccount(facilitatorKey);
    // payTo = facilitator EOA so ticket USDC and gas wallet are the same address
    const payTo = facilitatorAccount.address;
```

Replace with:

```typescript
    const facilitatorAccount = privateKeyToAccount(facilitatorKey);
    // payTo = Circle wallet so ticket USDC goes to Circle-managed treasury
    const payTo = config.house.circleWalletAddress ?? facilitatorAccount.address;
```

Wait — cleaner approach. The Circle wallet address is already in `config.circle.walletAddress`. Update the `startHouseServer` to read it from config:

Find line 43:

```typescript
    const payTo = facilitatorAccount.address;
```

Replace with:

```typescript
    // payTo = Circle wallet address (ticket USDC goes to Circle-managed treasury)
    // Falls back to facilitator EOA if no Circle wallet configured
    const payTo = config.circle.walletAddress ?? facilitatorAccount.address;
```

Also update the startup log (around line 175) to clarify:

```typescript
            console.log(`[house] Facilitator (x402 settlement): ${facilitatorAccount.address}`);
            console.log(`[house] Treasury (payTo / Circle wallet): ${payTo}`);
```

Replace the existing single line:

```typescript
            console.log(`[house] Facilitator / payTo: ${payTo}`);
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: Clean compile.

- [ ] **Step 3: Test dry-run still works**

```bash
npm run start:dry
```

Expected: Server starts, agents buy tickets, winner drawn, dry-run payout logged. The startup logs should now show separate "Facilitator" and "Treasury" lines.

- [ ] **Step 4: Commit**

```bash
git add src/house-server.ts
git commit -m "feat: use Circle wallet address as x402 payTo treasury"
```

---

### Task 6: Update README with Circle setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Circle to prerequisites**

In the Prerequisites section, add:

```markdown
- [Circle](https://console.circle.com) developer account with API key, entity secret, and a Base wallet
```

- [ ] **Step 2: Add Circle setup section**

After the existing "4. Update .env" section, add:

```markdown
### 5. Set up Circle Programmable Wallet (for payouts)

1. Create a developer account at [console.circle.com](https://console.circle.com)
2. Go to **API Keys** and create an API key
3. Generate a 32-byte entity secret and register it in the console
4. Create a **wallet set**, then create a **wallet** on the `BASE` blockchain
5. Note the **wallet ID** (UUID) and **wallet address** (0x...)
6. Fund the wallet with ~$1 USDC on Base
7. Add to `.env`:

```env
CIRCLE_API_KEY=your_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
CIRCLE_WALLET_ID=your_wallet_uuid
CIRCLE_WALLET_ADDRESS=0x_your_wallet_address
```

The Circle wallet receives ticket payments (via x402 `payTo`) and sends prize payouts via Circle's transfer API. The facilitator EOA still handles x402 settlement and needs ETH for gas, but no longer holds the prize pool.
```

- [ ] **Step 3: Update the Stack table**

Add a row to the Stack table:

```markdown
| Payout | `@circle-fin/developer-controlled-wallets` | Winner receives USDC via Circle transfer API |
```

- [ ] **Step 4: Update the Payout architecture section**

Replace the existing payout architecture paragraph with:

```markdown
### Payout architecture

Ticket payments flow to the Circle-managed wallet (set as x402 `payTo`). When a winner is drawn, the house calls Circle's Programmable Wallets `createTransaction()` API to send the prize USDC. The facilitator EOA still handles x402 payment settlement (it needs ETH for gas), but prize funds live in the Circle wallet — cleanly separating settlement infrastructure from the prize pool.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add Circle Programmable Wallets setup to README"
```

---

### Task 7: Verify the USDC token ID for Base mainnet

**Files:**
- Modify: `src/payout.ts` (only if the token ID is wrong)

This task is a verification step. The token ID `fbd4cda4-0783-55c1-a947-7a29cf553de3` was not in the Circle docs table I found (that table listed Ethereum, Polygon, Arbitrum, Avalanche, Solana but the Base row may have been truncated). The token ID needs to be confirmed.

- [ ] **Step 1: Query the Circle API for the correct Base USDC token ID**

After setting up Circle creds in `.env`, run:

```bash
npx tsx --env-file=.env -e "
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const sdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});
const res = await sdk.getWalletTokenBalance({ id: process.env.CIRCLE_WALLET_ID });
console.log(JSON.stringify(res.data, null, 2));
"
```

This will list all tokens in the Circle wallet with their token IDs. Find the USDC entry for Base and confirm the token ID.

- [ ] **Step 2: If the token ID differs, update payout.ts**

In `src/payout.ts`, update the `USDC_BASE_TOKEN_ID` constant:

```typescript
const USDC_BASE_TOKEN_ID = "<correct-token-id-from-step-1>";
```

- [ ] **Step 3: Commit if changed**

```bash
git add src/payout.ts
git commit -m "fix: correct Circle USDC token ID for Base mainnet"
```

---

### Task 8: End-to-end test with real Circle payout

**Files:** None (runtime test)

- [ ] **Step 1: Verify .env has all Circle values set**

Confirm these are all populated in `.env`:

```
CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...
CIRCLE_WALLET_ID=...
CIRCLE_WALLET_ADDRESS=...
```

- [ ] **Step 2: Verify Circle wallet has USDC**

```bash
npx tsx --env-file=.env -e "
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const sdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});
const res = await sdk.getWalletTokenBalance({ id: process.env.CIRCLE_WALLET_ID });
const usdc = res.data?.tokenBalances?.find(t => t.token.symbol === 'USDC');
console.log('USDC balance:', usdc?.amount ?? '0');
"
```

Expected: Shows a non-zero USDC balance.

- [ ] **Step 3: Run a real single round**

```bash
npm start
```

Expected output includes:
- `[house] Treasury (payTo / Circle wallet): 0x...` (Circle wallet address)
- Agents buy tickets
- Winner drawn via SocioLogic
- `[payout] Sending $X.XX USDC to 0x... via Circle`
- `[payout] Circle transaction id: ...`
- `[payout] Circle transaction state: ...`
- Round result JSON with a non-null `payoutTxHash`

- [ ] **Step 4: Verify the payout on-chain**

Check the winner's address on [basescan.org](https://basescan.org) to confirm they received the USDC.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(agentic-lotto): Circle Programmable Wallets payout integration complete"
```

---

## Notes

- **What changed:** Only the payout path. x402 ticket buying (Ampersend), SocioLogic RNG, 1Claw key management, Express house server — all unchanged.
- **The facilitator EOA is still needed** for x402 settlement. It still needs ETH for gas. But it no longer holds prize USDC — that lives in the Circle wallet.
- **Circle transactions are async.** The `createTransaction()` call may return a `PENDING` state. For the demo this is fine — the transaction will settle. For production you'd poll `getTransaction()` until `COMPLETE`.
- **Dry-run mode** is unaffected. It skips the Circle call entirely and returns `"0xdryrun"` as before.
