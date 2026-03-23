import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";

describe("public API exports", () => {
  it("exports createServer", () => {
    expect(api.createServer).toBeTypeOf("function");
  });

  it("exports Session class", () => {
    expect(api.Session).toBeTypeOf("function");
    const session = new api.Session("test");
    expect(session.id).toBe("test");
  });

  it("exports buildSystemPrompt", () => {
    expect(api.buildSystemPrompt).toBeTypeOf("function");
  });

  it("exports manifestToTools", () => {
    expect(api.manifestToTools).toBeTypeOf("function");
  });

  it("exports toolCallToUIAction", () => {
    expect(api.toolCallToUIAction).toBeTypeOf("function");
  });

  it("exports runAgentLoop", () => {
    expect(api.runAgentLoop).toBeTypeOf("function");
  });
});
