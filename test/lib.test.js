import { describe, it, expect } from 'vitest';
import {
  generateId,
  parseRelayThreadId,
  baseLocalPart,
  isAllowedAlias,
  addressesEqual,
  isAutoSubmitted,
  rewriteHeaders,
  THREAD_TTL_SECONDS,
  isValidEmailAddress,
  normalizeAliasList,
  normalizeContactUrl,
} from '../src/lib.js';

describe('generateId', () => {
  it('produces a 16-char lowercase hex string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic with an injected RNG', () => {
    const rng = (arr) => arr.fill(0xab);
    expect(generateId(rng)).toBe('abababababababab');
  });

  it('produces distinct ids across calls', () => {
    expect(generateId()).not.toBe(generateId());
  });
});

describe('parseRelayThreadId', () => {
  it('extracts a thread id from a relay address', () => {
    expect(parseRelayThreadId('relay+deadbeef12345678@trackmytime.today')).toBe(
      'deadbeef12345678'
    );
  });

  it('lowercases the id and is case-insensitive on the prefix', () => {
    expect(parseRelayThreadId('Relay+DEADBEEF@trackmytime.today')).toBe('deadbeef');
  });

  it('returns null for non-relay or malformed addresses', () => {
    expect(parseRelayThreadId('cla@trackmytime.today')).toBeNull();
    expect(parseRelayThreadId('relay@trackmytime.today')).toBeNull();
    // non-hex local-part (no hex run directly before '@') does not match
    expect(parseRelayThreadId('relay+nothex!@trackmytime.today')).toBeNull();
    expect(parseRelayThreadId('')).toBeNull();
    expect(parseRelayThreadId(undefined)).toBeNull();
  });
});

describe('baseLocalPart', () => {
  it('strips the domain, subaddress, and lowercases', () => {
    expect(baseLocalPart('Cla+Foo@Example.com')).toBe('cla');
    expect(baseLocalPart('licensing@trackmytime.today')).toBe('licensing');
    expect(baseLocalPart('')).toBe('');
  });
});

describe('isAllowedAlias', () => {
  const allowed = 'cla,licensing,cve,abuse';

  it('accepts known aliases and their subaddresses', () => {
    expect(isAllowedAlias('cla@trackmytime.today', allowed)).toBe(true);
    expect(isAllowedAlias('cve+report@trackmytime.today', allowed)).toBe(true);
    expect(isAllowedAlias('ABUSE@trackmytime.today', allowed)).toBe(true);
  });

  it('rejects unknown aliases', () => {
    expect(isAllowedAlias('random@trackmytime.today', allowed)).toBe(false);
    expect(isAllowedAlias('relay@trackmytime.today', allowed)).toBe(false);
  });

  it('rejects everything when the allowlist is empty', () => {
    expect(isAllowedAlias('cla@trackmytime.today', '')).toBe(false);
    expect(isAllowedAlias('cla@trackmytime.today', undefined)).toBe(false);
  });
});

describe('addressesEqual', () => {
  it('compares case-insensitively and unwraps display names', () => {
    expect(addressesEqual('A@B.com', 'a@b.com')).toBe(true);
    expect(addressesEqual('Rob <rob@gmail.com>', 'rob@gmail.com')).toBe(true);
  });

  it('rejects mismatches and empty input', () => {
    expect(addressesEqual('a@b.com', 'c@b.com')).toBe(false);
    expect(addressesEqual('', '')).toBe(false);
    expect(addressesEqual(null, undefined)).toBe(false);
  });

  it('extracts the first <addr> and tolerates malformed brackets quickly', () => {
    expect(addressesEqual('Name <a@b.com> <c@d.com>', 'a@b.com')).toBe(true);
    // No closing bracket / empty brackets fall back to the raw value, and a
    // pathological all-`<` value must not hang (polynomial-ReDoS regression).
    expect(addressesEqual('a@b.com <', 'a@b.com <')).toBe(true);
    expect(addressesEqual('<>', '<>')).toBe(true);
    expect(addressesEqual('<'.repeat(100000), 'a@b.com')).toBe(false);
  });
});

describe('isAutoSubmitted', () => {
  const h = (obj) => ({ get: (k) => obj[k.toLowerCase()] ?? null });

  it('flags Auto-Submitted other than "no"', () => {
    expect(isAutoSubmitted(h({ 'auto-submitted': 'auto-replied' }))).toBe(true);
    expect(isAutoSubmitted(h({ 'auto-submitted': 'no' }))).toBe(false);
  });

  it('flags bulk/list precedence and autoreply markers', () => {
    expect(isAutoSubmitted(h({ precedence: 'bulk' }))).toBe(true);
    expect(isAutoSubmitted(h({ 'x-autoreply': 'yes' }))).toBe(true);
    expect(isAutoSubmitted(h({ 'x-auto-response-suppress': 'All' }))).toBe(true);
  });

  it('returns false for ordinary mail', () => {
    expect(isAutoSubmitted(h({ subject: 'hi' }))).toBe(false);
    expect(isAutoSubmitted(null)).toBe(false);
  });
});

describe('rewriteHeaders', () => {
  const raw = [
    'From: Real Sender <owner@example.com>',
    'To: relay+abc123@trackmytime.today',
    'Reply-To: owner@example.com',
    'Return-Path: <owner@example.com>',
    'Sender: owner@example.com',
    'DKIM-Signature: v=1; a=rsa-sha256;',
    ' bh=abc; b=def',
    'Received: by 2002:0:0 with SMTP id x; Tue, 03 Jun 2026 12:00:00 -0700',
    'Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=owner@example.com',
    'ARC-Authentication-Results: i=1; mx; dkim=pass header.i=@example.com',
    'ARC-Message-Signature: i=1; a=rsa-sha256;',
    ' b=zzz',
    'ARC-Seal: i=1; a=rsa-sha256; b=yyy',
    'X-Google-Smtp-Source: ABC123',
    'X-Gm-Message-State: DEF456',
    'Date: Tue, 03 Jun 2026 12:00:00 -0700',
    'Subject: Re: hello',
    'Message-ID: <123@mail.gmail.com>',
    'In-Reply-To: <orig@trackmytime.today>',
    'References: <orig@trackmytime.today>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    'the body stays',
  ].join('\r\n');

  it('replaces From/To and strips sender-bound headers', () => {
    const out = rewriteHeaders(raw, 'cla@trackmytime.today', 'partner@corp.com');
    expect(out).toContain('From: cla@trackmytime.today');
    expect(out).toContain('To: partner@corp.com');
    expect(out).not.toMatch(/^Reply-To:/m);
    expect(out).not.toMatch(/^Return-Path:/m);
    expect(out).not.toMatch(/^Sender:/m);
    expect(out).not.toMatch(/^DKIM-Signature:/m);
    // folded continuation of DKIM must not survive either
    expect(out).not.toContain('bh=abc');
  });

  it('strips trace and authentication headers that could leak the inbox', () => {
    const out = rewriteHeaders(raw, 'cla@trackmytime.today', 'partner@corp.com');
    expect(out).not.toMatch(/^Received:/m);
    expect(out).not.toMatch(/^Authentication-Results:/m);
    expect(out).not.toMatch(/^ARC-Authentication-Results:/m);
    expect(out).not.toMatch(/^ARC-Message-Signature:/m);
    expect(out).not.toMatch(/^ARC-Seal:/m);
    expect(out).not.toMatch(/^X-Google-Smtp-Source:/m);
    expect(out).not.toMatch(/^X-Gm-Message-State:/m);
    // the relaying inbox address must not appear anywhere in the output
    expect(out).not.toContain('owner@example.com');
  });

  it('preserves threading, rendering, and body headers', () => {
    const out = rewriteHeaders(raw, 'cla@trackmytime.today', 'partner@corp.com');
    expect(out).toContain('Subject: Re: hello');
    expect(out).toContain('Date: Tue, 03 Jun 2026 12:00:00 -0700');
    expect(out).toContain('Message-ID: <123@mail.gmail.com>');
    expect(out).toContain('In-Reply-To: <orig@trackmytime.today>');
    expect(out).toContain('References: <orig@trackmytime.today>');
    expect(out).toContain('MIME-Version: 1.0');
    expect(out).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(out).toContain('\r\n\r\nthe body stays');
  });

  it('handles messages with no body delimiter', () => {
    const out = rewriteHeaders('Subject: x', 'a@b.com', 'c@d.com');
    expect(out).toContain('From: a@b.com');
    expect(out).toContain('To: c@d.com');
    expect(out).toContain('Subject: x');
  });
});

describe('THREAD_TTL_SECONDS', () => {
  it('is 30 days', () => {
    expect(THREAD_TTL_SECONDS).toBe(2592000);
  });
});

describe('isValidEmailAddress', () => {
  it('accepts plausible addresses', () => {
    expect(isValidEmailAddress('you@example.com')).toBe(true);
    expect(isValidEmailAddress('a.b+tag@sub.example.co.uk')).toBe(true);
  });
  it('rejects junk', () => {
    expect(isValidEmailAddress('')).toBe(false);
    expect(isValidEmailAddress('no-at-sign')).toBe(false);
    expect(isValidEmailAddress('a@b')).toBe(false);
    expect(isValidEmailAddress('two@@example.com')).toBe(false);
    expect(isValidEmailAddress('has space@example.com')).toBe(false);
    expect(isValidEmailAddress(42)).toBe(false);
  });
});

describe('normalizeAliasList', () => {
  it('cleans, lowercases, dedupes, and sorts (string or array)', () => {
    expect(normalizeAliasList('CVE, cla,  abuse ,cla')).toBe('abuse,cla,cve');
    expect(normalizeAliasList(['cla', 'Licensing'])).toBe('cla,licensing');
  });
  it('rejects the reserved relay prefix and bad tokens', () => {
    expect(() => normalizeAliasList('cla,relay')).toThrow(/reserved/);
    expect(() => normalizeAliasList('cla,bad!token')).toThrow(/Invalid alias/);
    expect(() => normalizeAliasList('cla,a+b')).toThrow(/Invalid alias/);
  });
  it('requires at least one alias', () => {
    expect(() => normalizeAliasList('')).toThrow(/At least one/);
    expect(() => normalizeAliasList('  , ')).toThrow(/At least one/);
  });
});

describe('normalizeContactUrl', () => {
  it('allows empty and valid http(s) URLs', () => {
    expect(normalizeContactUrl('')).toBe('');
    expect(normalizeContactUrl('  https://trackmytime.today  ')).toBe('https://trackmytime.today');
  });
  it('rejects non-http(s) or malformed URLs', () => {
    expect(() => normalizeContactUrl('not a url')).toThrow();
    expect(() => normalizeContactUrl('ftp://x.y')).toThrow(/http/);
    expect(() => normalizeContactUrl('javascript:alert(1)')).toThrow();
  });
});
