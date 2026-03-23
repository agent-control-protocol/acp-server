#!/usr/bin/env node
import OpenAI from "openai";
import { createServer } from "./server.js";

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.ACP_MODEL ?? "gpt-4o";
const port = parseInt(process.env.ACP_PORT ?? "3000", 10);

if (!apiKey) {
  console.error("Error: OPENAI_API_KEY environment variable is required.");
  console.error("");
  console.error("Usage:");
  console.error("  OPENAI_API_KEY=sk-... npx @acprotocol/server");
  console.error("");
  console.error("Options:");
  console.error("  OPENAI_BASE_URL   LLM base URL (default: OpenAI)");
  console.error("  ACP_MODEL         Model name (default: gpt-4o)");
  console.error("  ACP_PORT          WebSocket port (default: 3000)");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

const server = createServer({ openai, model, port });

server.start().then(() => {
  console.log("");
  console.log("  ACP Reference Server");
  console.log("  --------------------");
  console.log(`  WebSocket:  ws://localhost:${port}/connect`);
  console.log(`  Model:      ${model}`);
  if (baseURL) console.log(`  Base URL:   ${baseURL}`);
  console.log("");
});

const shutdown = () => {
  console.log("\nShutting down...");
  server.stop().then(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
