import os from "node:os";
import {
  GLOBAL_BROADCAST_ADDRESS,
  IPV4_BITS_PER_OCTET,
  IPV4_OCTET_COUNT,
  IPV4_OCTET_MAX
} from "../constants.js";

export type NetworkInterfaceSnapshot = Record<string, os.NetworkInterfaceInfo[] | undefined>;

export const parseIpv4Address = (address: string): number | null => {
  const octets = address.split(".");
  if (octets.length !== IPV4_OCTET_COUNT) return null;
  const values = octets.map((octet) => Number.parseInt(octet, 10));
  if (values.some((value) => Number.isNaN(value) || value < 0 || value > IPV4_OCTET_MAX)) return null;
  const [first, second, third, fourth] = values as [number, number, number, number];
  return (
    ((first << (IPV4_BITS_PER_OCTET * 3)) >>> 0)
    + (second << (IPV4_BITS_PER_OCTET * 2))
    + (third << IPV4_BITS_PER_OCTET)
    + fourth
  );
};

export const formatIpv4Address = (value: number): string => [
  (value >>> (IPV4_BITS_PER_OCTET * 3)) & IPV4_OCTET_MAX,
  (value >>> (IPV4_BITS_PER_OCTET * 2)) & IPV4_OCTET_MAX,
  (value >>> IPV4_BITS_PER_OCTET) & IPV4_OCTET_MAX,
  value & IPV4_OCTET_MAX
].join(".");

export const calculateBroadcastAddress = (address: string, netmask: string): string | null => {
  const addressValue = parseIpv4Address(address);
  const netmaskValue = parseIpv4Address(netmask);
  if (addressValue === null || netmaskValue === null) return null;
  return formatIpv4Address((addressValue & netmaskValue) | ((~netmaskValue) >>> 0));
};

export const getBroadcastAddresses = (interfaces: NetworkInterfaceSnapshot): string[] => {
  const addresses = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4") continue;
      if (entry.internal) continue;
      const broadcastAddress = calculateBroadcastAddress(entry.address, entry.netmask);
      if (broadcastAddress) addresses.add(broadcastAddress);
    }
  }
  addresses.add(GLOBAL_BROADCAST_ADDRESS);
  return [...addresses];
};

export const getSystemBroadcastAddresses = (): string[] => getBroadcastAddresses(os.networkInterfaces());

export const getIpv4InterfaceAddresses = (interfaces: NetworkInterfaceSnapshot): string[] => {
  const addresses = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4") continue;
      if (entry.internal) continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses];
};

export const getSystemIpv4InterfaceAddresses = (): string[] => getIpv4InterfaceAddresses(os.networkInterfaces());
