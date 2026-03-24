import { describe, it, expect } from 'vitest';
import { manifestToTools, toolCallToUIAction } from '../src/tools.js';
import {
  createCrmManifest,
  createMinimalManifest,
  createManifestWithModals,
  createManifestNoPersona,
} from './helpers/manifest-factory.js';

describe('manifestToTools', () => {
  it('returns 8 base tools when no modals', () => {
    const manifest = createMinimalManifest();
    const tools = manifestToTools(manifest);
    expect(tools).toHaveLength(8);
    const names = tools.map((t) => t.function.name);
    expect(names).toEqual([
      'navigate',
      'fill_field',
      'clear_field',
      'click_action',
      'highlight',
      'focus',
      'ask_confirm',
      'show_toast',
    ]);
  });

  it('returns 10 tools when modals are present', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    expect(tools).toHaveLength(10);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('open_modal');
    expect(names).toContain('close_modal');
  });

  it('navigate tool has screen enum from manifest', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const nav = tools.find((t) => t.function.name === 'navigate')!;
    const params = nav.function.parameters as any;
    expect(params.properties.screen.enum).toEqual(['dashboard', 'contacts', 'deals', 'settings']);
  });

  it('navigate description lists screen labels', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const nav = tools.find((t) => t.function.name === 'navigate')!;
    expect(nav.function.description).toContain('dashboard (Dashboard)');
    expect(nav.function.description).toContain('deals (New Deal)');
  });

  it('fill_field lists all field IDs in description', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const fill = tools.find((t) => t.function.name === 'fill_field')!;
    expect(fill.function.description).toContain('search');
    expect(fill.function.description).toContain('contact');
    expect(fill.function.description).toContain('amount');
  });

  it('fill_field has animate enum', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const fill = tools.find((t) => t.function.name === 'fill_field')!;
    const params = fill.function.parameters as any;
    expect(params.properties.animate.enum).toEqual(['typewriter', 'count_up', 'fade_in', 'none']);
  });

  it('click_action lists action IDs in description', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const click = tools.find((t) => t.function.name === 'click_action')!;
    expect(click.function.description).toContain('new_contact');
    expect(click.function.description).toContain('create_deal');
    expect(click.function.description).toContain('cancel_deal');
  });

  it('click_action warns about requiresConfirmation', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const click = tools.find((t) => t.function.name === 'click_action')!;
    expect(click.function.description).toContain('ask_confirm');
  });

  it('open_modal lists modal IDs in description', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const modal = tools.find((t) => t.function.name === 'open_modal')!;
    expect(modal.function.description).toContain('contact_picker');
  });

  it('deduplicates field IDs across screens', () => {
    // contacts has 'search' and 'email', deals has 'contact', 'stage', 'amount', 'notes',
    // settings has 'company_name' and 'timezone'
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const fill = tools.find((t) => t.function.name === 'fill_field')!;
    const desc = fill.function.description!;
    // Check each field appears only once by counting occurrences
    const searchMatches = desc.match(/\bsearch\b/g);
    expect(searchMatches).toHaveLength(1);
  });

  it('deduplicates action IDs across screens', () => {
    const manifest = createCrmManifest();
    const tools = manifestToTools(manifest);
    const click = tools.find((t) => t.function.name === 'click_action')!;
    const desc = click.function.description!;
    const matches = desc.match(/\bnew_contact\b/g);
    expect(matches).toHaveLength(1);
  });

  it('all tools have type=function', () => {
    const tools = manifestToTools(createCrmManifest());
    for (const tool of tools) {
      expect(tool.type).toBe('function');
    }
  });

  it('show_toast has level enum', () => {
    const tools = manifestToTools(createMinimalManifest());
    const toast = tools.find((t) => t.function.name === 'show_toast')!;
    const params = toast.function.parameters as any;
    expect(params.properties.level.enum).toEqual(['info', 'success', 'warning', 'error']);
  });
});

describe('toolCallToUIAction', () => {
  it('converts navigate', () => {
    const action = toolCallToUIAction('navigate', JSON.stringify({ screen: 'deals' }));
    expect(action).toEqual({ do: 'navigate', screen: 'deals' });
  });

  it('converts fill_field with default animation', () => {
    const action = toolCallToUIAction(
      'fill_field',
      JSON.stringify({ field: 'name', value: 'Alice' }),
    );
    expect(action).toEqual({
      do: 'fill',
      field: 'name',
      value: 'Alice',
      animate: 'typewriter',
      speed: undefined,
    });
  });

  it('converts fill_field with explicit animation and speed', () => {
    const action = toolCallToUIAction(
      'fill_field',
      JSON.stringify({ field: 'amount', value: 2500, animate: 'count_up', speed: 50 }),
    );
    expect(action).toEqual({
      do: 'fill',
      field: 'amount',
      value: 2500,
      animate: 'count_up',
      speed: 50,
    });
  });

  it('converts clear_field', () => {
    const action = toolCallToUIAction('clear_field', JSON.stringify({ field: 'notes' }));
    expect(action).toEqual({ do: 'clear', field: 'notes' });
  });

  it('converts click_action', () => {
    const action = toolCallToUIAction('click_action', JSON.stringify({ action: 'create_deal' }));
    expect(action).toEqual({ do: 'click', action: 'create_deal' });
  });

  it('converts highlight with duration', () => {
    const action = toolCallToUIAction(
      'highlight',
      JSON.stringify({ field: 'email', duration: 3000 }),
    );
    expect(action).toEqual({ do: 'highlight', field: 'email', duration: 3000 });
  });

  it('converts highlight without duration', () => {
    const action = toolCallToUIAction('highlight', JSON.stringify({ field: 'email' }));
    expect(action).toEqual({ do: 'highlight', field: 'email', duration: undefined });
  });

  it('converts focus', () => {
    const action = toolCallToUIAction('focus', JSON.stringify({ field: 'search' }));
    expect(action).toEqual({ do: 'focus', field: 'search' });
  });

  it('converts open_modal with query', () => {
    const action = toolCallToUIAction(
      'open_modal',
      JSON.stringify({ modal: 'contact_picker', query: 'Globex' }),
    );
    expect(action).toEqual({ do: 'open_modal', modal: 'contact_picker', query: 'Globex' });
  });

  it('converts open_modal without query', () => {
    const action = toolCallToUIAction('open_modal', JSON.stringify({ modal: 'picker' }));
    expect(action).toEqual({ do: 'open_modal', modal: 'picker', query: undefined });
  });

  it('converts close_modal', () => {
    const action = toolCallToUIAction('close_modal', JSON.stringify({}));
    expect(action).toEqual({ do: 'close_modal' });
  });

  it('converts ask_confirm', () => {
    const action = toolCallToUIAction('ask_confirm', JSON.stringify({ message: 'Are you sure?' }));
    expect(action).toEqual({ do: 'ask_confirm', message: 'Are you sure?' });
  });

  it('converts show_toast with all options', () => {
    const action = toolCallToUIAction(
      'show_toast',
      JSON.stringify({ message: 'Saved!', level: 'success', duration: 5000 }),
    );
    expect(action).toEqual({
      do: 'show_toast',
      message: 'Saved!',
      level: 'success',
      duration: 5000,
    });
  });

  it('converts show_toast with defaults', () => {
    const action = toolCallToUIAction('show_toast', JSON.stringify({ message: 'Info' }));
    expect(action).toEqual({
      do: 'show_toast',
      message: 'Info',
      level: undefined,
      duration: undefined,
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  it('throws on unknown tool name', () => {
    expect(() => toolCallToUIAction('unknown_tool', '{}')).toThrow('Unknown tool: unknown_tool');
  });

  it('handles invalid JSON gracefully (args become empty)', () => {
    const action = toolCallToUIAction('navigate', 'not-json');
    expect(action).toEqual({ do: 'navigate', screen: '' });
  });

  it('handles empty args object', () => {
    const action = toolCallToUIAction('fill_field', '{}');
    expect(action).toEqual({
      do: 'fill',
      field: '',
      value: undefined,
      animate: 'typewriter',
      speed: undefined,
    });
  });

  it('coerces non-string field to empty string', () => {
    const action = toolCallToUIAction('focus', JSON.stringify({ field: 123 }));
    expect(action).toEqual({ do: 'focus', field: '' });
  });

  it('coerces non-number speed to undefined (via 0)', () => {
    const action = toolCallToUIAction(
      'fill_field',
      JSON.stringify({ field: 'x', value: 'y', speed: 'fast' }),
    );
    expect(action.speed).toBeUndefined();
  });
});
