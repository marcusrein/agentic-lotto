import {
    createWalletClient,
    createPublicClient,
    http,
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
