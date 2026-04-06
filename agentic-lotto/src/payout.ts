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
        amount: [amountUsdc],
        fee: {
            type: "level",
            config: {
                feeLevel: "MEDIUM",
            },
        },
    });

    const txData = response.data;
    if (!txData) {
        throw new Error(`[payout] Circle createTransaction returned no transaction data`);
    }

    console.log(`[payout] Circle transaction id: ${txData.id}`);
    console.log(`[payout] Circle transaction state: ${txData.state}`);

    // txHash is not immediately available — Circle processes async.
    // Return the Circle transaction ID as the reference.
    return txData.id;
}
