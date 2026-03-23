import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/prompt.js";
import {
  createMinimalManifest,
  createCrmManifest,
  createManifestNoPersona,
  createManifestPartialUser,
  createManifestWithModals,
} from "./helpers/manifest-factory.js";
import type { ManifestMessage } from "../src/types.js";

describe("buildSystemPrompt", () => {
  // ── Identity Section ────────────────────────────────────────────────────

  describe("identity", () => {
    it("includes persona name and role when both present", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("You are Aria, CRM assistant.");
    });

    it("includes persona name only when role is absent", () => {
      const manifest = createManifestPartialUser();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("You are Helper.");
      expect(prompt).not.toContain("undefined");
    });

    it("falls back to generic identity when no persona", () => {
      const manifest = createManifestNoPersona();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain(
        "You are an AI assistant embedded in a software application.",
      );
    });

    it("falls back to generic identity when persona has no name", () => {
      const manifest: ManifestMessage = {
        ...createMinimalManifest(),
        persona: { role: "helper" },
      };
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain(
        "You are an AI assistant embedded in a software application.",
      );
    });
  });

  // ── Instructions Section ────────────────────────────────────────────────

  describe("instructions", () => {
    it("includes persona instructions when present", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain(
        "You are a CRM assistant that helps manage contacts, deals, and sales pipelines.",
      );
    });

    it("omits instructions section when absent", () => {
      const manifest = createManifestNoPersona();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).not.toContain("manage contacts");
    });
  });

  // ── User Context Section ────────────────────────────────────────────────

  describe("user context", () => {
    it("includes full user when all fields present", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("## User");
      expect(prompt).toContain("- Name: Alice Johnson");
      expect(prompt).toContain("- Organization: Acme Corp");
      expect(prompt).toContain("- Role: sales_manager");
    });

    it("includes partial user (name only)", () => {
      const manifest = createManifestPartialUser();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("## User");
      expect(prompt).toContain("- Name: Bob");
      expect(prompt).not.toContain("- Organization:");
      expect(prompt).not.toContain("- Role:");
    });

    it("omits user section when no user", () => {
      const manifest = createManifestNoPersona();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).not.toContain("## User");
    });

    it("omits user section when user has no recognized fields", () => {
      const manifest: ManifestMessage = {
        ...createMinimalManifest(),
        user: {},
      };
      const prompt = buildSystemPrompt(manifest);
      // The ## User header appears but has no content lines beyond it,
      // so the code skips it (lines.length > 1 check)
      expect(prompt).not.toContain("## User");
    });
  });

  // ── Application Context Section ─────────────────────────────────────────

  describe("application context", () => {
    it("includes context when present and non-empty", () => {
      const manifest: ManifestMessage = {
        ...createMinimalManifest(),
        context: { theme: "dark", locale: "pt-BR" },
      };
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("## Application Context");
      expect(prompt).toContain('"theme": "dark"');
      expect(prompt).toContain('"locale": "pt-BR"');
    });

    it("omits context when empty object", () => {
      const manifest: ManifestMessage = {
        ...createMinimalManifest(),
        context: {},
      };
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).not.toContain("## Application Context");
    });

    it("omits context when absent", () => {
      const manifest = createMinimalManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).not.toContain("## Application Context");
    });
  });

  // ── Screens & Capabilities Section ──────────────────────────────────────

  describe("screens", () => {
    it("lists all screen IDs and labels", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("### Screen: dashboard (Dashboard)");
      expect(prompt).toContain("### Screen: contacts (Contacts)");
      expect(prompt).toContain("### Screen: deals (New Deal)");
      expect(prompt).toContain("### Screen: settings (Settings)");
    });

    it("includes screen route when present", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("Route: /dashboard");
      expect(prompt).toContain("Route: /deals");
    });

    it("includes fields with type, label, and required flag", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("`contact` (autocomplete): Contact [REQUIRED]");
      expect(prompt).toContain("`stage` (select): Pipeline Stage [REQUIRED]");
      expect(prompt).toContain("`amount` (currency): Deal Amount [REQUIRED]");
      expect(prompt).toContain("`search` (text): Search");
      expect(prompt).not.toContain("`search` (text): Search [REQUIRED]");
    });

    it("includes field options when present", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("Options: lead=Lead, qualified=Qualified, proposal=Proposal Sent");
    });

    it("includes actions with confirmation and destructive flags", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("`create_deal`: Create Deal [REQUIRES_CONFIRMATION]");
      expect(prompt).toContain("`cancel_deal`: Cancel");
    });

    it("includes destructive flag", () => {
      const manifest = createManifestNoPersona();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("`go`: Go [DESTRUCTIVE]");
    });

    it("includes modals", () => {
      const manifest = createCrmManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("Modals:");
      expect(prompt).toContain("`contact_picker`: Select Contact");
    });

    it("handles screen with no fields/actions/modals", () => {
      const manifest = createMinimalManifest();
      const prompt = buildSystemPrompt(manifest);
      expect(prompt).toContain("### Screen: home (Home)");
      expect(prompt).not.toContain("Fields:");
      expect(prompt).not.toContain("Actions:");
      expect(prompt).not.toContain("Modals:");
    });
  });

  // ── Rules Section ───────────────────────────────────────────────────────

  describe("rules", () => {
    it("always includes rules section", () => {
      const prompt = buildSystemPrompt(createMinimalManifest());
      expect(prompt).toContain("## Rules");
    });

    it("includes typewriter animation rule", () => {
      const prompt = buildSystemPrompt(createMinimalManifest());
      expect(prompt).toContain('animate="typewriter"');
    });

    it("includes ask_confirm rule", () => {
      const prompt = buildSystemPrompt(createMinimalManifest());
      expect(prompt).toContain(
        "ALWAYS call `ask_confirm` before clicking any action marked [REQUIRES_CONFIRMATION]",
      );
    });

    it("includes batch fill rule", () => {
      const prompt = buildSystemPrompt(createMinimalManifest());
      expect(prompt).toContain("Do NOT fill one field at a time");
    });
  });

  // ── Snapshot ────────────────────────────────────────────────────────────

  describe("snapshot", () => {
    it("CRM manifest prompt matches snapshot", () => {
      const prompt = buildSystemPrompt(createCrmManifest());
      expect(prompt).toMatchSnapshot();
    });
  });
});
