import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { toolCallToUIAction } from "../src/tools.js";
import type { ServerMessage, UIAction } from "../src/types.js";

// ── Schema Setup ──────────────────────────────────────────────────────────

const SCHEMA_PATH = join(
  __dirname,
  "../../acp-protocol/spec/acp-v1.json",
);
const FIXTURES_DIR = join(
  __dirname,
  "../../acp-protocol/conformance/fixtures",
);

let validateClient: any;
let validateServer: any;
let validateUIAction: any;

beforeAll(() => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  // Add all $defs as schemas so we can reference them individually
  ajv.addSchema(schema, "acp-v1");

  // Compile validators for client and server messages
  validateClient = ajv.compile({ $ref: "acp-v1#/$defs/ClientMessage" });
  validateServer = ajv.compile({ $ref: "acp-v1#/$defs/ServerMessage" });
  validateUIAction = ajv.compile({ $ref: "acp-v1#/$defs/UIAction" });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function expectValid(validate: any, data: unknown, label: string) {
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors
      ?.map((e: any) => `${e.instancePath} ${e.message}`)
      .join("; ");
    expect.fail(`${label} failed validation: ${errors}\nData: ${JSON.stringify(data, null, 2)}`);
  }
}

// ── Server Message Conformance ────────────────────────────────────────────

describe("ACP Schema Conformance", () => {
  describe("server messages conform to schema", () => {
    const serverMessages: Array<{ label: string; msg: ServerMessage }> = [
      {
        label: "config",
        msg: {
          type: "config",
          sessionId: "sess-001",
          features: { chat: true },
          providers: [{ id: "default", name: "Default", model: "gpt-4o" }],
          current_provider: "default",
        },
      },
      {
        label: "status idle",
        msg: { type: "status", status: "idle" },
      },
      {
        label: "status thinking",
        msg: { type: "status", status: "thinking" },
      },
      {
        label: "status executing",
        msg: { type: "status", status: "executing" },
      },
      {
        label: "chat from agent",
        msg: { type: "chat", from: "agent", message: "Hello!", final: true },
      },
      {
        label: "chat_token",
        msg: { type: "chat_token", token: "Hel" },
      },
      {
        label: "error",
        msg: { type: "error", code: "parse_error", message: "Invalid JSON" },
      },
      {
        label: "command with navigate",
        msg: {
          type: "command",
          seq: 0,
          actions: [{ do: "navigate", screen: "deals" }],
        },
      },
      {
        label: "command with fill",
        msg: {
          type: "command",
          seq: 1,
          actions: [
            {
              do: "fill",
              field: "contact",
              value: "Acme Corp",
              animate: "typewriter",
              speed: 30,
            },
          ],
        },
      },
      {
        label: "command with ask_confirm",
        msg: {
          type: "command",
          seq: 2,
          actions: [{ do: "ask_confirm", message: "Are you sure?" }],
        },
      },
      {
        label: "command with show_toast",
        msg: {
          type: "command",
          seq: 3,
          actions: [
            {
              do: "show_toast",
              message: "Saved!",
              level: "success",
              duration: 3000,
            },
          ],
        },
      },
    ];

    for (const { label, msg } of serverMessages) {
      it(`validates: ${label}`, () => {
        expectValid(validateServer, msg, label);
      });
    }
  });

  // ── UIAction Conformance ────────────────────────────────────────────────

  describe("toolCallToUIAction outputs conform to UIAction schema", () => {
    const toolCalls: Array<{ name: string; args: string; label: string }> = [
      { name: "navigate", args: '{"screen":"home"}', label: "navigate" },
      {
        name: "fill_field",
        args: '{"field":"name","value":"Alice","animate":"typewriter","speed":30}',
        label: "fill with animation",
      },
      {
        name: "fill_field",
        args: '{"field":"amount","value":1000,"animate":"count_up"}',
        label: "fill with count_up",
      },
      { name: "clear_field", args: '{"field":"notes"}', label: "clear" },
      { name: "click_action", args: '{"action":"submit"}', label: "click" },
      {
        name: "highlight",
        args: '{"field":"email","duration":2000}',
        label: "highlight",
      },
      { name: "focus", args: '{"field":"search"}', label: "focus" },
      {
        name: "open_modal",
        args: '{"modal":"picker","query":"test"}',
        label: "open_modal",
      },
      { name: "close_modal", args: "{}",  label: "close_modal" },
      {
        name: "ask_confirm",
        args: '{"message":"Delete this?"}',
        label: "ask_confirm",
      },
      {
        name: "show_toast",
        args: '{"message":"Done!","level":"success","duration":5000}',
        label: "show_toast",
      },
    ];

    for (const { name, args, label } of toolCalls) {
      it(`validates: ${label}`, () => {
        const action = toolCallToUIAction(name, args);
        // Remove undefined values (schema doesn't expect them)
        const clean = JSON.parse(JSON.stringify(action));
        expectValid(validateUIAction, clean, label);
      });
    }
  });

  // ── Fixture Conformance ─────────────────────────────────────────────────

  describe("conformance fixtures validate against schema", () => {
    const fixtureFiles = readdirSync(FIXTURES_DIR).filter((f) =>
      f.endsWith(".json"),
    );

    for (const file of fixtureFiles) {
      describe(file, () => {
        const fixture = JSON.parse(
          readFileSync(join(FIXTURES_DIR, file), "utf-8"),
        );

        for (const step of fixture.steps) {
          const direction = step.direction as string;
          const description = step.description as string;

          it(`${direction}: ${description}`, () => {
            const msg = step.message;
            if (direction === "server_to_client") {
              expectValid(validateServer, msg, `${file} - ${description}`);
            } else {
              expectValid(validateClient, msg, `${file} - ${description}`);
            }
          });
        }
      });
    }
  });
});
