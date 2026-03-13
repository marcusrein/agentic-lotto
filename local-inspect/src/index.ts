import { testInjection } from "./test-injection.js";
import { testSocial } from "./test-social.js";
import { testPii } from "./test-pii.js";
import { testEncoding } from "./test-encoding.js";
import { testNetwork } from "./test-network.js";
import { testClean } from "./test-clean.js";

console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  1claw MCP — Local Security Inspector               ║");
console.log("║  No account, no API keys, no network calls          ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

testInjection();
testSocial();
testPii();
testEncoding();
testNetwork();
testClean();

console.log("── All checks complete ──\n");
console.log("To use this in your MCP config (Claude, Cursor, etc.):\n");
console.log(`  {
    "mcpServers": {
      "1claw": {
        "command": "npx",
        "args": ["-y", "@1claw/mcp"],
        "env": { "ONECLAW_LOCAL_ONLY": "true" }
      }
    }
  }\n`);
console.log("The inspect_content tool will be available to your AI agent.");
