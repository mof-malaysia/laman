/**
 * Fetching a calendar feed: the one request Laman's server makes to the
 * outside world. An admin types the address, so it's held to `https` on a
 * public address (checked at connect time, so a name can't resolve to a
 * public address when saved and a private one when fetched), with a timeout,
 * a size limit and a few redirects.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Reads a feed's text; throws an Error whose message an admin can read. */
export type FeedFetcher = (url: string) => Promise<string>;

// Separate lists: a BlockList matches IPv4 addresses against IPv4-mapped IPv6 rules too.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  blocked4.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked6.addSubnet(net, prefix, "ipv6");

/** An address on a private, local or reserved network: never fetched. */
export function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    const v4 = address.slice(7);
    if (isIP(v4) === 4) return blocked4.check(v4, "ipv4");
  }
  return family === 4 ? blocked4.check(address, "ipv4") : blocked6.check(address, "ipv6");
}

/**
 * The address to store for what an admin typed: `webcal://` (what Outlook
 * offers) becomes `https://`. Null when it isn't an https address with a host.
 */
export function feedAddress(typed: string): string | null {
  let url: URL;
  try {
    url = new URL(typed.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) return null;
  return url.toString();
}

/**
 * What an admin sees of a stored address: its host and four characters to
 * tell two apart, from before the file name (Outlook's all end in
 * "calendar.ics"), never enough to read the calendar.
 */
export const maskAddress = (url: string) => {
  const { host, pathname } = new URL(url);
  const folder = pathname.replace(/\/[^/]*\.ics$/i, "");
  return `https://${host}/…${folder.length > 12 ? folder.slice(-4) : ""}`;
};

/** A DNS lookup that refuses names resolving to a private address. */
function publicLookup(
  hostname: string,
  options: object,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address)))
      return callback(Object.assign(new Error("private_address"), { code: "EPRIVATE" }), "");
    const wantsAll = (options as { all?: boolean }).all;
    return wantsAll ? callback(null, list) : callback(null, list[0]!.address, list[0]!.family);
  });
}

function once(url: string): Promise<{ redirect: string } | { body: string }> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        lookup: publicLookup as never,
        timeout: FETCH_TIMEOUT_MS,
        headers: { accept: "text/calendar, */*;q=0.5", "user-agent": "Laman calendar sync" },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ redirect: new URL(response.headers.location, url).toString() });
        }
        if (status !== 200) {
          response.resume();
          return reject(new Error(`The calendar answered ${status}`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_FEED_BYTES) {
            request.destroy(
              new Error(`The calendar is larger than ${MAX_FEED_BYTES / 1024 / 1024} MB`),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("The calendar took too long to answer")));
    request.on("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "EPRIVATE"
          ? new Error("The address is on a private network")
          : error.code === "ENOTFOUND"
            ? new Error("No such address")
            : error,
      ),
    );
  });
}

/** Fetches over https only, following a few redirects that stay on https. */
export const fetchFeed: FeedFetcher = async (url) => {
  let next = url;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    if (!feedAddress(next) || new URL(next).protocol !== "https:")
      throw new Error("The calendar redirected to an address that isn't https");
    const result = await once(next);
    if ("body" in result) return result.body;
    next = result.redirect;
  }
  throw new Error("The calendar redirected too many times");
};
