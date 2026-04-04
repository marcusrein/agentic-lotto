import type { Hex, Address } from "viem";

export interface AgentPersonality {
    name: string;
    smartAccountAddress: Address;
    sessionKeyPath: string;
    riskTolerance: number; // 0-1: will play if ticketPrice < riskTolerance * balance
    minBalance: number;    // USD: won't play if balance below this
}

export interface HouseConfig {
    port: number;
    ticketPriceCents: number; // in USDC cents (1 = $0.01)
    buyWindowSeconds: number;
    smartAccountAddress: Address;
    sessionKeyPath: string;
}

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
    dryRun: boolean;
}

export interface RoundPlayer {
    name: string;
    smartAccountAddress: Address;
}

export interface RoundResult {
    roundId: string;
    players: RoundPlayer[];
    potCents: number;
    rngCostCents: number;
    prizeCents: number;
    winner: RoundPlayer | null;
    entropy: { raw: number[]; hex: string } | null;
    payoutTxHash: string | null;
    error: string | null;
}

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_CHAIN_ID = 8453;
