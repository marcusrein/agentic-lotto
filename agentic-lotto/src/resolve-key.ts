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
