// ACP v1 Protocol Types
// Derived from acp-protocol/spec/acp-v1.json

// ── Field & Screen Descriptors ──────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'masked'
  | 'select'
  | 'autocomplete'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'file'
  | 'hidden';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDescriptor {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  mask?: string;
  placeholder?: string;
  options?: SelectOption[];
  source?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  readOnly?: boolean;
}

export interface ActionDescriptor {
  id: string;
  label: string;
  requiresConfirmation?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ModalDescriptor {
  id: string;
  label: string;
  searchable?: boolean;
}

export interface ScreenDescriptor {
  id: string;
  label: string;
  route?: string;
  fields?: FieldDescriptor[];
  actions?: ActionDescriptor[];
  modals?: ModalDescriptor[];
}

// ── User & Persona ──────────────────────────────────────────────────────────

export interface UserInfo {
  name?: string;
  email?: string;
  org?: string;
  role?: string;
  [key: string]: unknown;
}

export interface Persona {
  name?: string;
  role?: string;
  instructions?: string;
  [key: string]: unknown;
}

// ── Provider ────────────────────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  model: string;
}

// ── Field State ─────────────────────────────────────────────────────────────

export interface FieldState {
  value?: unknown;
  valid?: boolean;
  error?: string;
  dirty?: boolean;
}

export interface InlineState {
  screen?: string;
  fields?: Record<string, FieldState>;
  canSubmit?: boolean;
}

// ── Action Result ───────────────────────────────────────────────────────────

export interface ActionResult {
  index: number;
  success: boolean;
  error?: string;
}

// ── UI Action ───────────────────────────────────────────────────────────────

export type UIActionDo =
  | 'navigate'
  | 'set_field'
  | 'clear'
  | 'click'
  | 'show_toast'
  | 'ask_confirm'
  | 'open_modal'
  | 'close_modal';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface UIAction {
  do: UIActionDo;
  screen?: string;
  field?: string;
  action?: string;
  modal?: string;
  value?: unknown;
  query?: string;
  message?: string;
  duration?: number;
  level?: ToastLevel;
}

// ── Client Messages (SDK → Engine) ──────────────────────────────────────────

export interface ManifestMessage {
  type: 'manifest';
  app: string;
  version?: string;
  currentScreen?: string;
  screens: Record<string, ScreenDescriptor>;
  user?: UserInfo;
  context?: Record<string, unknown>;
  persona?: Persona;
}

export interface TextMessage {
  type: 'text';
  message: string;
}

export interface StateMessage {
  type: 'state';
  screen: string;
  fields?: Record<string, FieldState>;
  canSubmit?: boolean;
}

export interface ResultMessage {
  type: 'result';
  seq: number;
  results: ActionResult[];
  state?: InlineState;
}

export interface ConfirmMessage {
  type: 'confirm';
  seq: number;
  confirmed: boolean;
}

export interface LlmConfigMessage {
  type: 'llm_config';
  provider: string;
}

export interface ResponseLangConfigMessage {
  type: 'response_lang_config';
  language: string;
}

export type ClientMessage =
  | ManifestMessage
  | TextMessage
  | StateMessage
  | ResultMessage
  | ConfirmMessage
  | LlmConfigMessage
  | ResponseLangConfigMessage;

// ── Server Messages (Engine → SDK) ──────────────────────────────────────────

export interface ConfigResponse {
  type: 'config';
  sessionId: string;
  features?: { chat?: boolean; [key: string]: unknown };
  providers?: ProviderInfo[];
  current_provider?: string;
}

export interface CommandMessage {
  type: 'command';
  seq: number;
  actions: UIAction[];
}

export interface ChatMessage {
  type: 'chat';
  from: 'agent' | 'user' | 'system';
  message: string;
  delta?: boolean;
  final?: boolean;
}

export type AgentStatus = 'idle' | 'thinking' | 'executing';

export interface StatusMessage {
  type: 'status';
  status: AgentStatus;
}

export interface ErrorMessage {
  type: 'error';
  code?: string;
  message: string;
}

export type ServerMessage =
  | ConfigResponse
  | CommandMessage
  | ChatMessage
  | StatusMessage
  | ErrorMessage;
