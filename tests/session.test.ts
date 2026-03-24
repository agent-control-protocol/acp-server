import { describe, it, expect } from 'vitest';
import { Session } from '../src/session.js';
import { createCrmManifest, createMinimalManifest } from './helpers/manifest-factory.js';

describe('Session', () => {
  // ── Constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('sets id from argument', () => {
      const s = new Session('test-123');
      expect(s.id).toBe('test-123');
    });

    it('initializes manifest as null', () => {
      const s = new Session('s1');
      expect(s.manifest).toBeNull();
    });

    it('initializes currentScreen as empty string', () => {
      const s = new Session('s1');
      expect(s.currentScreen).toBe('');
    });

    it('initializes history as empty', () => {
      const s = new Session('s1');
      expect(s.getHistory()).toEqual([]);
    });

    it('initializes seq at 0', () => {
      const s = new Session('s1');
      expect(s.nextSeq()).toBe(0);
    });
  });

  // ── setManifest ─────────────────────────────────────────────────────────

  describe('setManifest', () => {
    it('stores the manifest', () => {
      const s = new Session('s1');
      const manifest = createCrmManifest();
      s.setManifest(manifest);
      expect(s.manifest).toBe(manifest);
    });

    it('sets currentScreen from manifest.currentScreen', () => {
      const s = new Session('s1');
      const manifest = createCrmManifest();
      s.setManifest(manifest);
      expect(s.currentScreen).toBe('dashboard');
    });

    it('does not change currentScreen if manifest has no currentScreen', () => {
      const s = new Session('s1');
      s.setScreen('existing');
      const manifest = createMinimalManifest();
      // Remove currentScreen
      delete (manifest as any).currentScreen;
      s.setManifest(manifest);
      expect(s.currentScreen).toBe('existing');
    });

    it('builds a system prompt and adds it to history', () => {
      const s = new Session('s1');
      s.setManifest(createCrmManifest());
      const history = s.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
      expect((history[0] as any).content).toContain('You are Aria');
    });
  });

  // ── setScreen ───────────────────────────────────────────────────────────

  describe('setScreen', () => {
    it('updates currentScreen', () => {
      const s = new Session('s1');
      s.setScreen('contacts');
      expect(s.currentScreen).toBe('contacts');
    });
  });

  // ── addMessage + sliding window ─────────────────────────────────────────

  describe('addMessage', () => {
    it('appends messages to history', () => {
      const s = new Session('s1');
      s.addMessage({ role: 'user', content: 'hello' });
      s.addMessage({ role: 'assistant', content: 'hi' });
      expect(s.getHistory()).toHaveLength(2);
    });

    it('keeps history under MAX_HISTORY=40 by trimming oldest after system', () => {
      const s = new Session('s1');
      // Set up system prompt
      s.setManifest(createMinimalManifest());
      // Add 45 more messages (total = 46 with system)
      for (let i = 0; i < 45; i++) {
        s.addMessage({ role: 'user', content: `msg-${i}` });
      }
      const history = s.getHistory();
      // Should be exactly 40
      expect(history).toHaveLength(40);
    });

    it('preserves system prompt at index 0 during trim', () => {
      const s = new Session('s1');
      s.setManifest(createMinimalManifest());
      for (let i = 0; i < 50; i++) {
        s.addMessage({ role: 'user', content: `msg-${i}` });
      }
      const history = s.getHistory();
      expect(history[0].role).toBe('system');
      expect((history[0] as any).content).toContain('You are an AI assistant');
    });

    it('keeps most recent messages after trim', () => {
      const s = new Session('s1');
      s.setManifest(createMinimalManifest());
      for (let i = 0; i < 50; i++) {
        s.addMessage({ role: 'user', content: `msg-${i}` });
      }
      const history = s.getHistory();
      const lastContent = (history[history.length - 1] as any).content;
      expect(lastContent).toBe('msg-49');
    });

    it('does not trim when at exactly MAX_HISTORY', () => {
      const s = new Session('s1');
      s.setManifest(createMinimalManifest());
      // system prompt = 1, add 39 more = 40 total
      for (let i = 0; i < 39; i++) {
        s.addMessage({ role: 'user', content: `msg-${i}` });
      }
      expect(s.getHistory()).toHaveLength(40);
      // All 39 user messages + system prompt
      expect(s.getHistory()[1].role).toBe('user');
      expect((s.getHistory()[1] as any).content).toBe('msg-0');
    });

    it('trims when at MAX_HISTORY + 1', () => {
      const s = new Session('s1');
      s.setManifest(createMinimalManifest());
      // system prompt = 1, add 40 more = 41 total → trim
      for (let i = 0; i < 40; i++) {
        s.addMessage({ role: 'user', content: `msg-${i}` });
      }
      const history = s.getHistory();
      expect(history).toHaveLength(40);
      // First user message should be msg-1, not msg-0 (msg-0 was trimmed)
      expect((history[1] as any).content).toBe('msg-1');
    });
  });

  // ── getHistory ──────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns a copy (mutation-safe)', () => {
      const s = new Session('s1');
      s.addMessage({ role: 'user', content: 'hello' });
      const h1 = s.getHistory();
      h1.push({ role: 'user', content: 'injected' });
      expect(s.getHistory()).toHaveLength(1);
    });
  });

  // ── updateSystemPrompt ──────────────────────────────────────────────────

  describe('updateSystemPrompt', () => {
    it('replaces existing system message', () => {
      const s = new Session('s1');
      s.setManifest(createMinimalManifest());
      s.updateSystemPrompt('New system prompt');
      const history = s.getHistory();
      expect(history[0].role).toBe('system');
      expect((history[0] as any).content).toBe('New system prompt');
    });

    it('prepends system message when none exists', () => {
      const s = new Session('s1');
      s.addMessage({ role: 'user', content: 'hi' });
      s.updateSystemPrompt('System prompt');
      const history = s.getHistory();
      expect(history[0].role).toBe('system');
      expect((history[0] as any).content).toBe('System prompt');
      expect(history[1].role).toBe('user');
    });
  });

  // ── nextSeq ─────────────────────────────────────────────────────────────

  describe('nextSeq', () => {
    it('returns sequential values starting from 0', () => {
      const s = new Session('s1');
      expect(s.nextSeq()).toBe(0);
      expect(s.nextSeq()).toBe(1);
      expect(s.nextSeq()).toBe(2);
      expect(s.nextSeq()).toBe(3);
    });

    it('is independent between sessions', () => {
      const s1 = new Session('s1');
      const s2 = new Session('s2');
      s1.nextSeq();
      s1.nextSeq();
      expect(s2.nextSeq()).toBe(0);
    });
  });
});
