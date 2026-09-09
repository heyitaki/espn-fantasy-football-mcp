#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.ts";
import { createServer } from "./server.ts";

process.on("unhandledRejection", (error: unknown) => {
  console.error(`Unhandled rejection: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

try {
  const config = loadConfig(process.env);
  const server = createServer({ config });
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
