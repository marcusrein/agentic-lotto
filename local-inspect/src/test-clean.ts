import { inspect, printResult } from "./inspect.js";

export function testClean(): void {
  console.log("── Clean Inputs (should all pass) ──\n");

  const cases = [
    { label: "Simple question", input: "What is the capital of France?" },
    { label: "Code request", input: "Write a Python function that sorts a list of integers." },
    { label: "Math", input: "Calculate the integral of x^2 from 0 to 1." },
    { label: "Greeting", input: "Hello! How can you help me today?" },
    { label: "JSON data", input: '{"name": "Alice", "role": "developer", "active": true}' },
  ];

  for (const { label, input } of cases) {
    printResult(label, input, inspect(input, "output"));
  }
}

if (process.argv[1]?.includes("test-clean")) testClean();
