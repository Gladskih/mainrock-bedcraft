import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeServerName, selectServerByName } from "../../src/bedrock/serverSelection.js";

const servers = [
  { advertisement: { motd: "\u00a7aMy Server" } },
  { advertisement: { motd: "Another" } }
];

void test("normalizeServerName strips formatting", () => {
  assert.equal(normalizeServerName("\u00a7aHello"), "hello");
});

void test("selectServerByName returns match", () => {
  const selection = selectServerByName(servers, "my");
  assert.equal(selection.selected?.advertisement.motd, "\u00a7aMy Server");
  assert.equal(selection.matches.length, 1);
});

void test("selectServerByName handles multiple matches", () => {
  const selection = selectServerByName([{ advertisement: { motd: "Alpha" } }, { advertisement: { motd: "Alpha Two" } }], "alpha");
  assert.equal(selection.selected, null);
  assert.equal(selection.matches.length, 2);
});
