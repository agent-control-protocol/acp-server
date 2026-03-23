import type { ManifestMessage } from "./types.js";

/**
 * Builds the LLM system prompt from an ACP manifest.
 *
 * The prompt includes the following sections:
 * 1. **Identity** — from `persona.name` and `persona.role`, or a generic fallback
 * 2. **Instructions** — from `persona.instructions` (if present)
 * 3. **User context** — from `user.name`, `user.org`, `user.role`
 * 4. **Application context** — from `manifest.context` (JSON)
 * 5. **Screens & capabilities** — fields (with types, required flags, options), actions, modals
 * 6. **Rules** — 10 behavioral rules for UI control
 *
 * @param manifest - The ACP manifest message describing the application UI.
 * @returns A multi-section system prompt string for the LLM.
 *
 * @example
 * ```ts
 * import { buildSystemPrompt } from "@acprotocol/server";
 *
 * const prompt = buildSystemPrompt(manifest);
 * // => "You are Aria, CRM assistant.\n\n..."
 * ```
 */
export function buildSystemPrompt(manifest: ManifestMessage): string {
  const parts: string[] = [];

  // Identity
  if (manifest.persona?.name) {
    let identity = `You are ${manifest.persona.name}`;
    if (manifest.persona.role) identity += `, ${manifest.persona.role}`;
    identity += ".";
    parts.push(identity);
  } else {
    parts.push(
      "You are an AI assistant embedded in a software application.",
    );
  }

  // Persona instructions
  if (manifest.persona?.instructions) {
    parts.push(manifest.persona.instructions);
  }

  // User context
  if (manifest.user) {
    const lines: string[] = ["## User"];
    if (manifest.user.name) lines.push(`- Name: ${manifest.user.name}`);
    if (manifest.user.org) lines.push(`- Organization: ${manifest.user.org}`);
    if (manifest.user.role) lines.push(`- Role: ${manifest.user.role}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }

  // App context
  if (manifest.context && Object.keys(manifest.context).length > 0) {
    parts.push(
      "## Application Context\n" + JSON.stringify(manifest.context, null, 2),
    );
  }

  // Screens & capabilities
  const screenLines: string[] = [
    "## Application Screens",
    "You can control the application UI using the available tools. Here are the screens and their fields:",
    "",
  ];

  for (const [id, screen] of Object.entries(manifest.screens)) {
    screenLines.push(`### Screen: ${id} (${screen.label})`);
    if (screen.route) screenLines.push(`Route: ${screen.route}`);

    if (screen.fields?.length) {
      screenLines.push("Fields:");
      for (const f of screen.fields) {
        const req = f.required ? " [REQUIRED]" : "";
        screenLines.push(`  - \`${f.id}\` (${f.type}): ${f.label}${req}`);
        if (f.options?.length) {
          const opts = f.options.map((o) => `${o.value}=${o.label}`).join(", ");
          screenLines.push(`    Options: ${opts}`);
        }
      }
    }

    if (screen.actions?.length) {
      screenLines.push("Actions:");
      for (const act of screen.actions) {
        let flags = "";
        if (act.requiresConfirmation) flags += " [REQUIRES_CONFIRMATION]";
        if (act.destructive) flags += " [DESTRUCTIVE]";
        screenLines.push(`  - \`${act.id}\`: ${act.label}${flags}`);
      }
    }

    if (screen.modals?.length) {
      screenLines.push("Modals:");
      for (const md of screen.modals) {
        screenLines.push(`  - \`${md.id}\`: ${md.label}`);
      }
    }

    screenLines.push("");
  }
  parts.push(screenLines.join("\n"));

  // Rules
  parts.push(
    [
      "## Rules",
      "- When the user provides information that matches available fields, IMMEDIATELY fill those fields using tools — do not wait for an explicit request to fill the form.",
      "- Your primary job is to operate the UI. Whenever you can act, act — don't just acknowledge.",
      '- Use `fill_field` with animate="typewriter" so the user can see values being entered.',
      "- ALWAYS call `ask_confirm` before clicking any action marked [REQUIRES_CONFIRMATION].",
      "- If the user's request is missing essential information, ask briefly and generically — do NOT list specific field names.",
      "- Do NOT narrate individual fields being filled. Just confirm the action briefly when done.",
      "- If a command fails (you'll see the error in the next message), explain and try to fix it.",
      "- Respond in the same language the user speaks.",
      "- Be concise. Keep responses short — prefer brief confirmations.",
      "- Navigate to the correct screen before filling fields.",
      "- When filling multiple fields on the same screen, combine ALL fill_field calls in a single response.",
      "- Do NOT fill one field at a time — batch them together.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}
