import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateBroadcastAddress, formatIpv4Address, getBroadcastAddresses, getIpv4InterfaceAddresses, parseIpv4Address, type NetworkInterfaceSnapshot } from "../../src/util/network.js";

const emptyInterfaces: NetworkInterfaceSnapshot = {};

void test("parseIpv4Address and formatIpv4Address round trip", () => {
  const parsed = parseIpv4Address("192.168.1.10");
  assert.ok(parsed !== null);
  assert.equal(formatIpv4Address(parsed), "192.168.1.10");
});

void test("parseIpv4Address rejects invalid input", () => {
  assert.equal(parseIpv4Address("999.1.1"), null);
});

void test("parseIpv4Address rejects invalid octets", () => {
  assert.equal(parseIpv4Address("256.0.0.1"), null);
});

void test("parseIpv4Address rejects invalid length", () => {
  assert.equal(parseIpv4Address("10.0.0"), null);
});

void test("calculateBroadcastAddress returns broadcast", () => {
  assert.equal(calculateBroadcastAddress("192.168.1.10", "255.255.255.0"), "192.168.1.255");
});

void test("calculateBroadcastAddress rejects invalid input", () => {
  assert.equal(calculateBroadcastAddress("not.an.ip", "255.255.255.0"), null);
});

void test("getBroadcastAddresses falls back to global broadcast", () => {
  const addresses = getBroadcastAddresses(emptyInterfaces);
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0], "255.255.255.255");
});

void test("getBroadcastAddresses skips undefined interface entries", () => {
  const addresses = getBroadcastAddresses({ wifi: undefined });
  assert.equal(addresses.includes("255.255.255.255"), true);
});

void test("getBroadcastAddresses collects interface broadcasts", () => {
  const addresses = getBroadcastAddresses({
    ethernet: [
      {
        address: "10.0.0.5",
        netmask: "255.255.255.0",
        family: "IPv4",
        internal: false,
        mac: "00:00:00:00:00:00",
        cidr: "10.0.0.5/24"
      },
      {
        address: "fe80::1",
        netmask: "ffff:ffff:ffff:ffff::",
        family: "IPv6",
        internal: false,
        mac: "00:00:00:00:00:00",
        cidr: "fe80::1/64",
        scopeid: 0
      }
    ]
  });
  assert.equal(addresses.includes("10.0.0.255"), true);
});

void test("getBroadcastAddresses skips internal interfaces", () => {
  const addresses = getBroadcastAddresses({
    loopback: [
      {
        address: "127.0.0.1",
        netmask: "255.0.0.0",
        family: "IPv4",
        internal: true,
        mac: "00:00:00:00:00:00",
        cidr: "127.0.0.1/8"
      }
    ]
  });
  assert.equal(addresses.includes("127.255.255.255"), false);
});

void test("getIpv4InterfaceAddresses collects non-internal ipv4 addresses", () => {
  const addresses = getIpv4InterfaceAddresses({
    ethernet: [
      {
        address: "10.0.0.5",
        netmask: "255.255.255.0",
        family: "IPv4",
        internal: false,
        mac: "00:00:00:00:00:00",
        cidr: "10.0.0.5/24"
      }
    ]
  });
  assert.equal(addresses.includes("10.0.0.5"), true);
});

void test("getIpv4InterfaceAddresses skips internal and ipv6 entries", () => {
  const addresses = getIpv4InterfaceAddresses({
    loopback: [
      {
        address: "127.0.0.1",
        netmask: "255.0.0.0",
        family: "IPv4",
        internal: true,
        mac: "00:00:00:00:00:00",
        cidr: "127.0.0.1/8"
      }
    ],
    wifi: [
      {
        address: "fe80::1",
        netmask: "ffff:ffff:ffff:ffff::",
        family: "IPv6",
        internal: false,
        mac: "00:00:00:00:00:00",
        cidr: "fe80::1/64",
        scopeid: 0
      }
    ]
  });
  assert.equal(addresses.length, 0);
});

void test("getIpv4InterfaceAddresses skips undefined interface entries", () => {
  const addresses = getIpv4InterfaceAddresses({
    ethernet: undefined,
    wifi: [
      {
        address: "10.0.0.5",
        netmask: "255.255.255.0",
        family: "IPv4",
        internal: false,
        mac: "00:00:00:00:00:00",
        cidr: "10.0.0.5/24"
      }
    ]
  });
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0], "10.0.0.5");
});
