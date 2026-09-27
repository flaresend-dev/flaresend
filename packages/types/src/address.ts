export interface ParsedAddress {
  /** Bare address, lowercased. */
  address: string;
  /** Display name, or null when none was given. */
  name: string | null;
}

// Deliberately simple: local@domain.tld, no spaces, no angle brackets, at least one dot in the domain.
const ADDRESS_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidAddress(address: string): boolean {
  if (address.length > 254) return false;
  const at = address.lastIndexOf("@");
  if (at < 1 || at > 64) return false;
  return ADDRESS_RE.test(address);
}

/**
 * Parse "Name <a@b.c>", "\"Last, First\" <a@b.c>", "<a@b.c>" or "a@b.c".
 * Throws an Error when no valid address can be found.
 */
export function parseDisplayAddress(input: string): ParsedAddress {
  const raw = input.trim();
  let name: string | null = null;
  let address: string;

  const open = raw.lastIndexOf("<");
  if (open !== -1) {
    if (!raw.endsWith(">")) throw new Error(`invalid address: ${input}`);
    address = raw.slice(open + 1, -1).trim();
    let n = raw.slice(0, open).trim();
    if (n.length >= 2 && n.startsWith('"') && n.endsWith('"')) {
      n = n.slice(1, -1).replace(/\\(["\\])/g, "$1");
    }
    name = n.length > 0 ? n : null;
  } else {
    if (raw.includes(">")) throw new Error(`invalid address: ${input}`);
    address = raw;
  }

  if (!isValidAddress(address)) throw new Error(`invalid address: ${input}`);
  if (name !== null && /[\r\n]/.test(name)) throw new Error(`invalid display name: ${input}`);
  return { address: address.toLowerCase(), name };
}

/** Format back to "Name <addr>" (quoting the name when needed). */
export function formatDisplayAddress(p: { address: string; name?: string | null }): string {
  if (!p.name) return p.address;
  const needsQuotes = /[",<>@:;()\[\]\\]/.test(p.name);
  const name = needsQuotes ? `"${p.name.replace(/(["\\])/g, "\\$1")}"` : p.name;
  return `${name} <${p.address}>`;
}

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}
