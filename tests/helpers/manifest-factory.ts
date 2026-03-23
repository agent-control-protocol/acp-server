import type { ManifestMessage } from "../../src/types.js";

/** Minimal manifest with 1 screen, no fields/actions/modals. */
export function createMinimalManifest(): ManifestMessage {
  return {
    type: "manifest",
    app: "test-app",
    currentScreen: "home",
    screens: {
      home: {
        id: "home",
        label: "Home",
      },
    },
  };
}

/** CRM manifest with 4 screens — matches conformance fixture 01-handshake.json. */
export function createCrmManifest(): ManifestMessage {
  return {
    type: "manifest",
    app: "crm-demo",
    version: "1.0.0",
    currentScreen: "dashboard",
    screens: {
      dashboard: {
        id: "dashboard",
        label: "Dashboard",
        route: "/dashboard",
        fields: [],
        actions: [],
        modals: [],
      },
      contacts: {
        id: "contacts",
        label: "Contacts",
        route: "/contacts",
        fields: [
          { id: "search", type: "text", label: "Search" },
          { id: "email", type: "email", label: "Email" },
        ],
        actions: [{ id: "new_contact", label: "New Contact" }],
        modals: [],
      },
      deals: {
        id: "deals",
        label: "New Deal",
        route: "/deals",
        fields: [
          {
            id: "contact",
            type: "autocomplete",
            label: "Contact",
            required: true,
            source: "api/contacts",
          },
          {
            id: "stage",
            type: "select",
            label: "Pipeline Stage",
            required: true,
            options: [
              { value: "lead", label: "Lead" },
              { value: "qualified", label: "Qualified" },
              { value: "proposal", label: "Proposal Sent" },
            ],
          },
          {
            id: "amount",
            type: "currency",
            label: "Deal Amount",
            required: true,
            min: 0.01,
          },
          {
            id: "notes",
            type: "textarea",
            label: "Notes",
            required: true,
            maxLength: 2000,
          },
        ],
        actions: [
          { id: "create_deal", label: "Create Deal", requiresConfirmation: true },
          { id: "cancel_deal", label: "Cancel" },
        ],
        modals: [{ id: "contact_picker", label: "Select Contact", searchable: true }],
      },
      settings: {
        id: "settings",
        label: "Settings",
        route: "/settings",
        fields: [
          { id: "company_name", type: "text", label: "Company Name" },
          {
            id: "timezone",
            type: "select",
            label: "Timezone",
            options: [
              { value: "utc", label: "UTC" },
              { value: "us_eastern", label: "US Eastern" },
              { value: "us_pacific", label: "US Pacific" },
            ],
          },
        ],
        actions: [],
        modals: [],
      },
    },
    user: {
      name: "Alice Johnson",
      email: "alice@example.com",
      org: "Acme Corp",
      role: "sales_manager",
    },
    persona: {
      name: "Aria",
      role: "CRM assistant",
      instructions:
        "You are a CRM assistant that helps manage contacts, deals, and sales pipelines.",
    },
  };
}

/** Manifest with modals but no actions requiring confirmation. */
export function createManifestWithModals(): ManifestMessage {
  return {
    type: "manifest",
    app: "modal-app",
    currentScreen: "main",
    screens: {
      main: {
        id: "main",
        label: "Main",
        fields: [
          { id: "name", type: "text", label: "Name", required: true },
        ],
        actions: [{ id: "submit", label: "Submit" }],
        modals: [
          { id: "picker", label: "Item Picker", searchable: true },
          { id: "confirm_dialog", label: "Confirm Dialog" },
        ],
      },
    },
  };
}

/** Manifest without persona and without user. */
export function createManifestNoPersona(): ManifestMessage {
  return {
    type: "manifest",
    app: "bare-app",
    currentScreen: "home",
    screens: {
      home: {
        id: "home",
        label: "Home Screen",
        fields: [
          { id: "input", type: "text", label: "Input" },
        ],
        actions: [
          { id: "go", label: "Go", destructive: true },
        ],
      },
    },
  };
}

/** Manifest with user that has only a name (partial user). */
export function createManifestPartialUser(): ManifestMessage {
  return {
    type: "manifest",
    app: "partial-app",
    currentScreen: "home",
    screens: {
      home: {
        id: "home",
        label: "Home",
        fields: [],
        actions: [],
      },
    },
    user: {
      name: "Bob",
    },
    persona: {
      name: "Helper",
    },
  };
}
