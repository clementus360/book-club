import "server-only";
import { BlockList, isIP } from "node:net";

// Nowhere private: this network, the cloud's metadata service, the machine itself.
const blocked = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  blocked.addSubnet(net, bits, "ipv6");
}

/** True only for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address.
  const mapped = family === 6 ? address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) : null;
  if (mapped) return isPublicAddress(mapped[1]!);
  if (family === 6 && /^::ffff:/i.test(address)) return false; // the hex spelling of the same thing
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}
