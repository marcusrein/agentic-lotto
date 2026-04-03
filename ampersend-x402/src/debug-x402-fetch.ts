/**
 * Wraps `fetch` to log x402 payment flow when `X402_CLIENT_DEBUG=1` (or `true` / `yes`).
 * Clones responses so logging does not consume the body.
 *
 * Decodes base64 JSON from x402 headers (same format as @x402/core/http):
 * - Response: PAYMENT-REQUIRED (v2 puts the invoice here; body may be `{}`)
 * - Response: PAYMENT-RESPONSE / X-PAYMENT-RESPONSE (facilitator feedback)
 * - Request: PAYMENT-SIGNATURE / X-PAYMENT (outbound payment payload)
 */

import {
    decodePaymentRequiredHeader,
    decodePaymentResponseHeader,
    decodePaymentSignatureHeader,
} from "@x402/core/http";

const PAYMENT_HEADER_PREFIXES = ["x-payment", "payment"];

export function isX402ClientDebugEnabled(): boolean {
    const v = process.env.X402_CLIENT_DEBUG?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}

function getHeaderCI(headers: Headers, canonicalName: string): string | null {
    const want = canonicalName.toLowerCase();
    for (const [k, v] of headers.entries()) {
        if (k.toLowerCase() === want) return v;
    }
    return null;
}

function maskValue(name: string, value: string, max = 120): string {
    const lower = name.toLowerCase();
    if (
        lower.includes("payment") ||
        lower.includes("signature") ||
        lower === "authorization"
    ) {
        if (value.length <= max) return value;
        return `${value.slice(0, max)}… [${value.length} chars]`;
    }
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

function stringifyDecoded(obj: unknown, maxLen = 12_000): string {
    const s = JSON.stringify(obj, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n… (${s.length} chars total)`;
}

function logDecodedBlock(title: string, data: unknown): void {
    console.log(`[x402 debug] ${title}:\n${stringifyDecoded(data)}`);
}

function tryDecodeOutboundPayment(headers: Headers): void {
    const raw =
        getHeaderCI(headers, "payment-signature") ??
        getHeaderCI(headers, "x-payment");
    if (!raw) return;
    try {
        const decoded = decodePaymentSignatureHeader(raw);
        logDecodedBlock("Decoded outbound PAYMENT-SIGNATURE / X-PAYMENT", decoded);
    } catch (e) {
        console.warn(
            "[x402 debug] Could not decode payment-signature:",
            e instanceof Error ? e.message : e,
        );
    }
}

function tryDecodePaymentRequired(headers: Headers): void {
    const raw = getHeaderCI(headers, "payment-required");
    if (!raw) return;
    try {
        const decoded = decodePaymentRequiredHeader(raw);
        logDecodedBlock("Decoded PAYMENT-REQUIRED (v2 invoice / accepts[])", decoded);
    } catch (e) {
        console.warn(
            "[x402 debug] Could not decode PAYMENT-REQUIRED:",
            e instanceof Error ? e.message : e,
        );
    }
}

function tryDecodePaymentResponse(headers: Headers): void {
    const raw =
        getHeaderCI(headers, "payment-response") ??
        getHeaderCI(headers, "x-payment-response");
    if (!raw) return;
    try {
        const decoded = decodePaymentResponseHeader(raw);
        logDecodedBlock("Decoded PAYMENT-RESPONSE (facilitator / verify result)", decoded);
    } catch (e) {
        console.warn(
            "[x402 debug] Could not decode PAYMENT-RESPONSE:",
            e instanceof Error ? e.message : e,
        );
    }
}

function logRequestHeaders(label: string, headers: Headers): void {
    const lines: string[] = [];
    headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        const interesting =
            PAYMENT_HEADER_PREFIXES.some((p) => lower.startsWith(p)) ||
            lower === "authorization";
        if (interesting) {
            lines.push(`    ${name}: ${maskValue(name, value)}`);
        }
    });
    if (lines.length) {
        console.log(`[x402 debug] ${label} headers:\n${lines.join("\n")}`);
    }
    tryDecodeOutboundPayment(headers);
}

function logResponseMeta(seq: number, res: Response, bodyPreview: string): void {
    console.log(
        `[x402 debug] ← #${seq} ${res.status} ${res.statusText} ${res.url || ""}`,
    );

    if (res.status === 402) {
        const keys = [...res.headers.keys()].sort();
        console.log(`[x402 debug]   response header keys: ${keys.join(", ")}`);
    }

    tryDecodePaymentRequired(res.headers);
    tryDecodePaymentResponse(res.headers);

    const interesting = [
        "content-type",
        "x-payment-response",
        "payment-response",
        "access-control-expose-headers",
    ];
    for (const h of interesting) {
        const v = res.headers.get(h);
        if (v) console.log(`[x402 debug]   ${h}: ${maskValue(h, v, 200)}`);
    }

    const emptyJson = bodyPreview.trim() === "{}";
    if (res.headers.get("content-type")?.includes("json") && bodyPreview) {
        if (emptyJson && res.status === 402) {
            console.log(
                "[x402 debug]   body: {} — v2 often leaves JSON empty; see PAYMENT-REQUIRED above.",
            );
        } else {
            try {
                const parsed = JSON.parse(bodyPreview) as unknown;
                console.log(
                    `[x402 debug]   body (json):`,
                    JSON.stringify(parsed, null, 2).slice(0, 4000),
                    bodyPreview.length > 4000 ? "\n… (truncated)" : "",
                );
            } catch {
                console.log(
                    `[x402 debug]   body (text):`,
                    bodyPreview.slice(0, 2000),
                    bodyPreview.length > 2000 ? "…" : "",
                );
            }
        }
    } else if (bodyPreview && !emptyJson) {
        console.log(
            `[x402 debug]   body:`,
            bodyPreview.slice(0, 2000),
            bodyPreview.length > 2000 ? "…" : "",
        );
    }

    if (res.status === 402) {
        console.log(
            "[x402 debug] 402 = payment required (first hit) or verify/settle rejected (after payment retry).",
        );
    }
}

let debugSeq = 0;

export function wrapX402DebugFetch(baseFetch: typeof fetch): typeof fetch {
    if (!isX402ClientDebugEnabled()) return baseFetch;

    return async (
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> => {
        debugSeq += 1;
        const seq = debugSeq;
        const req = new Request(input, init);
        const url = req.url;
        const method = req.method;

        console.log(`\n[x402 debug] → #${seq} ${method} ${url}`);
        logRequestHeaders("request", req.headers);

        const res = await baseFetch(input, init);

        let bodyPreview = "";
        try {
            const clone = res.clone();
            const text = await clone.text();
            bodyPreview = text;
        } catch {
            bodyPreview = "(could not read body)";
        }

        logResponseMeta(seq, res, bodyPreview);

        return res;
    };
}
