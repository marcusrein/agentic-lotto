/**
 * Starts the local x402 paywall server, waits until healthy, runs the client,
 * then stops the server.
 *
 * Usage: npm run paywall
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function die(msg: string): never {
    console.error(msg);
    process.exit(1);
}

function envFileHasNonEmpty(key: string): boolean {
    const path = join(pkgRoot, ".env");
    if (!existsSync(path)) return false;
    const raw = readFileSync(path, "utf8");
    const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!m) return false;
    const v = m[1].trim().replace(/^["']|["']$/g, "");
    return v.length > 0 && !v.startsWith("#");
}

async function waitForServer(
    server: ChildProcess,
    port: number,
    maxMs: number,
): Promise<void> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`server exited (${server.exitCode})`);
        }
        try {
            const r = await fetch(`http://127.0.0.1:${port}/`);
            if (r.ok) return;
        } catch {
            /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("timeout");
}

function runServer(): ChildProcess {
    return spawn("npx", ["tsx", "--env-file=.env", "src/x402-server.ts"], {
        cwd: pkgRoot,
        stdio: ["ignore", "inherit", "inherit"],
        env: process.env,
    });
}

async function main() {
    if (!envFileHasNonEmpty("X402_PAY_TO_ADDRESS")) {
        die(
            `Cannot run paywall demo. Add to examples/ampersend-x402/.env:\n` +
                `  X402_PAY_TO_ADDRESS=0x...  (any Base address you control — receives USDC)\n`,
        );
    }

    const port = Number(process.env.X402_SERVER_PORT ?? 4021);
    console.log("Starting x402 server…\n");
    const server = runServer();

    let exitEarly: number | null = null;
    server.on("exit", (code) => {
        exitEarly = code;
    });

    try {
        await waitForServer(server, port, 45_000);
    } catch {
        server.kill("SIGTERM");
        die(
            "Server did not start in time. Check .env and logs above.",
        );
    }

    if (exitEarly !== null) {
        die(`Server exited with code ${exitEarly}. Fix .env and retry.`);
    }

    console.log("\nRunning x402 client…\n");
    const client = spawn("npx", ["tsx", "--env-file=.env", "src/x402-client.ts"], {
        cwd: pkgRoot,
        stdio: "inherit",
        env: {
            ...process.env,
            X402_SERVER_URL: process.env.X402_SERVER_URL ?? `http://localhost:${port}/joke`,
        },
    });

    const code = await new Promise<number>((resolve) => {
        client.on("close", (c) => resolve(c ?? 1));
    });

    server.kill("SIGTERM");
    process.exit(code);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
