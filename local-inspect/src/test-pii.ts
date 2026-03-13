import { inspect, printResult } from "./inspect.js";

export function testPii(): void {
  console.log("── PII Detection ──\n");

  const cases = [
    { label: "Email address", input: "Contact me at alice@example.com for details" },
    { label: "SSN", input: "My social security number is 123-45-6789" },
    { label: "Credit card", input: "Pay with card 4111-1111-1111-1111" },
    { label: "AWS access key", input: "Use key AKIAIOSFODNN7EXAMPLE to authenticate" },
    { label: "Private key header", input: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK..." },
  ];

  for (const { label, input } of cases) {
    printResult(label, input, inspect(input, "output"));
  }
}

if (process.argv[1]?.includes("test-pii")) testPii();
