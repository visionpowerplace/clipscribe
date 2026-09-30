import net from 'node:net';

/**
 * Basic SSRF guard: only http(s), no credentials, no localhost/private/link-local IP literals.
 * (DNS-rebinding is not covered — also isolate the worker's network; see README.)
 */
export function validateMediaUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Please enter a valid link starting with http:// or https://' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Only http(s) links are supported.' };
  if (u.username || u.password) return { ok: false, error: 'Links with embedded credentials are not allowed.' };
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') || !host.includes('.') && !net.isIP(host))
    return { ok: false, error: 'That address is not allowed.' };
  const ipHost = host.replace(/^\[|\]$/g, '');
  if (net.isIP(ipHost)) {
    if (net.isIPv4(ipHost)) {
      const [a, b] = ipHost.split('.').map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127))
        return { ok: false, error: 'That address is not allowed.' };
    } else {
      const v = ipHost.toLowerCase();
      if (v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:'))
        return { ok: false, error: 'That address is not allowed.' };
    }
  }
  return { ok: true, url: u.toString() };
}
