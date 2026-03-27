import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ManifestMessage, UIAction, FieldDescriptor } from './types.js';

/**
 * Converts an ACP manifest into OpenAI-compatible tool definitions.
 *
 * Generates 6 base tools (navigate, set_field, clear_field, click_action,
 * ask_confirm, show_toast) plus 2 modal tools
 * (open_modal, close_modal) when the manifest contains modal descriptors.
 *
 * Field, action, and modal IDs are deduplicated across all screens.
 * Screen IDs and labels are included as enums in the navigate tool.
 *
 * @param manifest - The ACP manifest describing available screens and UI elements.
 * @returns An array of OpenAI-compatible tool definitions.
 *
 * @example
 * ```ts
 * const tools = manifestToTools(manifest);
 * // Pass to OpenAI: openai.chat.completions.create({ tools, ... })
 * ```
 */
export function manifestToTools(manifest: ManifestMessage): ChatCompletionTool[] {
  const screenIDs: string[] = [];
  const screenLabels: string[] = [];
  for (const [id, s] of Object.entries(manifest.screens)) {
    screenIDs.push(id);
    screenLabels.push(`${id} (${s.label})`);
  }

  const allFields = collectFields(manifest);
  const allFieldIDs = allFields.map((f) => f.id);
  const allActionIDs = collectActionIDs(manifest);
  const allModalIDs = collectModalIDs(manifest);

  const tools: ChatCompletionTool[] = [
    navigateTool(screenIDs, screenLabels),
    setFieldTool(allFields),
    clearFieldTool(allFieldIDs),
    clickActionTool(allActionIDs),
    askConfirmTool(),
    showToastTool(),
  ];

  if (allModalIDs.length > 0) {
    tools.push(openModalTool(allModalIDs), closeModalTool());
  }

  return tools;
}

/**
 * Converts an OpenAI tool call into an ACP UIAction.
 *
 * Supports all 8 tool names: navigate, set_field, clear_field, click_action,
 * open_modal, close_modal, ask_confirm, show_toast.
 *
 * @param name - The tool function name from the LLM response.
 * @param argsJSON - The JSON-encoded arguments string from the LLM response.
 * @returns A UIAction object ready to be sent in a command message.
 * @throws {Error} If the tool name is not recognized.
 *
 * @example
 * ```ts
 * const action = toolCallToUIAction("set_field", '{"field":"name","value":"Alice"}');
 * // => { do: "set_field", field: "name", value: "Alice" }
 * ```
 */
export function toolCallToUIAction(name: string, argsJSON: string): UIAction {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJSON);
  } catch {
    args = {};
  }

  switch (name) {
    case 'navigate':
      return { do: 'navigate', screen: str(args.screen) };

    case 'set_field':
      return {
        do: 'set_field',
        field: str(args.field),
        value: args.value,
      };

    case 'clear_field':
      return { do: 'clear', field: str(args.field) };

    case 'click_action':
      return { do: 'click', action: str(args.action) };

    case 'open_modal':
      return {
        do: 'open_modal',
        modal: str(args.modal),
        query: str(args.query) || undefined,
      };

    case 'close_modal':
      return { do: 'close_modal' };

    case 'ask_confirm':
      return { do: 'ask_confirm', message: str(args.message) };

    case 'show_toast':
      return {
        do: 'show_toast',
        message: str(args.message),
        level: (str(args.level) as UIAction['level']) || undefined,
        duration: num(args.duration) || undefined,
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Tool Builders ───────────────────────────────────────────────────────────

function makeTool(name: string, description: string, parameters: object): ChatCompletionTool {
  return {
    type: 'function',
    function: { name, description, parameters },
  } as ChatCompletionTool;
}

function navigateTool(screenIDs: string[], screenLabels: string[]): ChatCompletionTool {
  return makeTool('navigate', `Navigate to a screen. Available: ${screenLabels.join(', ')}`, {
    type: 'object',
    properties: {
      screen: { type: 'string', enum: screenIDs, description: 'Screen ID to navigate to' },
    },
    required: ['screen'],
  });
}

function setFieldTool(fields: FieldDescriptor[]): ChatCompletionTool {
  const fieldDescriptions = fields.map((f) => {
    let desc = `${f.id} (${f.type})`;
    if (f.options?.length) {
      const opts = f.options.map((o) => o.value).join(', ');
      desc += ` — valid values: [${opts}]`;
    }
    if (f.required) desc += ' REQUIRED';
    return desc;
  });

  return makeTool(
    'set_field',
    `Set a form field value. Available fields:\n${fieldDescriptions.join('\n')}`,
    {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'Field ID to set' },
        value: {
          description:
            'Value to set. For select fields, use one of the valid option values listed above.',
        },
      },
      required: ['field', 'value'],
    },
  );
}

function clearFieldTool(fieldIDs: string[]): ChatCompletionTool {
  return makeTool('clear_field', 'Clear a form field value', {
    type: 'object',
    properties: {
      field: { type: 'string', description: 'Field ID to clear' },
    },
    required: ['field'],
  });
}

function clickActionTool(actionIDs: string[]): ChatCompletionTool {
  return makeTool(
    'click_action',
    `Click a button or trigger an action. Available: ${actionIDs.join(', ')}. IMPORTANT: if the action has requiresConfirmation=true, you MUST call ask_confirm first and wait for the user's response before clicking.`,
    {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action ID to click' },
      },
      required: ['action'],
    },
  );
}

function openModalTool(modalIDs: string[]): ChatCompletionTool {
  return makeTool('open_modal', `Open a modal/dialog. Available: ${modalIDs.join(', ')}`, {
    type: 'object',
    properties: {
      modal: { type: 'string', description: 'Modal ID to open' },
      query: { type: 'string', description: 'Optional search query to pre-fill in the modal' },
    },
    required: ['modal'],
  });
}

function closeModalTool(): ChatCompletionTool {
  return makeTool('close_modal', 'Close the currently open modal', {
    type: 'object',
    properties: {},
  });
}

function askConfirmTool(): ChatCompletionTool {
  return makeTool(
    'ask_confirm',
    'Ask the user for confirmation before proceeding with a destructive or important action.',
    {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Confirmation question to ask the user' },
      },
      required: ['message'],
    },
  );
}

function showToastTool(): ChatCompletionTool {
  return makeTool('show_toast', 'Show a temporary notification/toast message in the app', {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Toast message text' },
      level: { type: 'string', enum: ['info', 'success', 'warning', 'error'], default: 'info' },
      duration: { type: 'integer', default: 3000 },
    },
    required: ['message'],
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectFields(m: ManifestMessage): FieldDescriptor[] {
  const seen = new Set<string>();
  const fields: FieldDescriptor[] = [];
  for (const s of Object.values(m.screens)) {
    for (const f of s.fields ?? []) {
      if (!seen.has(f.id)) {
        fields.push(f);
        seen.add(f.id);
      }
    }
  }
  return fields;
}

function collectActionIDs(m: ManifestMessage): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of Object.values(m.screens)) {
    for (const a of s.actions ?? []) {
      if (!seen.has(a.id)) {
        ids.push(a.id);
        seen.add(a.id);
      }
    }
  }
  return ids;
}

function collectModalIDs(m: ManifestMessage): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of Object.values(m.screens)) {
    for (const md of s.modals ?? []) {
      if (!seen.has(md.id)) {
        ids.push(md.id);
        seen.add(md.id);
      }
    }
  }
  return ids;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
