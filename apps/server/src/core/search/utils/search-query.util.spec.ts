import {
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  buildSubstringHighlight,
  clampSearchLimit,
  escapeIlikePattern,
  hasCjk,
  normalizeHighlight,
  prepareSearchQuery,
  unicodeLength,
} from './search-query.util';

describe('search-query.util', () => {
  describe('hasCjk', () => {
    it('detects Chinese characters', () => {
      expect(hasCjk('认证')).toBe(true);
      expect(hasCjk('用户认证流程')).toBe(true);
      expect(hasCjk('OAuth2')).toBe(false);
      expect(hasCjk('a')).toBe(false);
    });
  });

  describe('escapeIlikePattern', () => {
    it('escapes ILIKE wildcards and escape char', () => {
      expect(escapeIlikePattern('a%b_c!d')).toBe('a!%b!_c!!d');
    });
  });

  describe('unicodeLength', () => {
    it('counts unicode code points', () => {
      expect(unicodeLength('认证')).toBe(2);
      expect(unicodeLength('ab')).toBe(2);
    });
  });

  describe('clampSearchLimit', () => {
    it('defaults and caps limits', () => {
      expect(clampSearchLimit(undefined)).toBe(SEARCH_LIMIT_DEFAULT);
      expect(clampSearchLimit(0)).toBe(SEARCH_LIMIT_DEFAULT);
      expect(clampSearchLimit(3)).toBe(3);
      expect(clampSearchLimit(999)).toBe(SEARCH_LIMIT_MAX);
    });
  });

  describe('prepareSearchQuery', () => {
    it('rejects empty and too-short latin queries', () => {
      expect(prepareSearchQuery('')).toEqual({ ok: false });
      expect(prepareSearchQuery('   ')).toEqual({ ok: false });
      expect(prepareSearchQuery('a')).toEqual({ ok: false });
    });

    it('accepts single CJK character', () => {
      const prepared = prepareSearchQuery('认');
      expect(prepared.ok).toBe(true);
      if (prepared.ok) {
        expect(prepared.query).toBe('认');
        expect(prepared.ilikePattern).toBe('%认%');
      }
    });

    it('accepts Chinese multi-char queries and builds ILIKE pattern', () => {
      const prepared = prepareSearchQuery('  用户认证  ');
      expect(prepared.ok).toBe(true);
      if (prepared.ok) {
        expect(prepared.query).toBe('用户认证');
        expect(prepared.ilikePattern).toBe('%用户认证%');
      }
    });

    it('accepts latin queries of length >= 2', () => {
      const prepared = prepareSearchQuery('OAuth2');
      expect(prepared.ok).toBe(true);
      if (prepared.ok) {
        expect(prepared.query).toBe('OAuth2');
        expect(prepared.ilikePattern).toBe('%OAuth2%');
        expect(prepared.tsQuery).toBeTruthy();
      }
    });

    it('escapes wildcards in ILIKE pattern', () => {
      const prepared = prepareSearchQuery('100%_off');
      expect(prepared.ok).toBe(true);
      if (prepared.ok) {
        expect(prepared.ilikePattern).toBe('%100!%!_off%');
      }
    });
  });

  describe('buildSubstringHighlight', () => {
    it('marks the first match with surrounding context', () => {
      const text = '前言。统一登录网关用于企业内部系统。结尾。';
      const highlight = buildSubstringHighlight(text, '统一登录', 4);
      expect(highlight).toContain('<mark>统一登录</mark>');
      expect(highlight).toContain('网关');
    });

    it('returns empty when there is no match', () => {
      expect(buildSubstringHighlight('hello world', '认证')).toBe('');
    });
  });

  describe('normalizeHighlight', () => {
    it('collapses whitespace', () => {
      expect(normalizeHighlight('a\n\n b\t c')).toBe('a b c');
      expect(normalizeHighlight(null)).toBe('');
    });
  });
});
