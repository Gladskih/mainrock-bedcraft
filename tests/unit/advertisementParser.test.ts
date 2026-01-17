import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAdvertisementString } from "../../src/bedrock/advertisementParser.js";

void test("parseAdvertisementString returns data for valid advertisement", () => {
  const advertisement = "MCPE;My Server;754;1.21.80;3;20;123456;World;Survival;1;19132;19133;";
  const parsed = parseAdvertisementString(advertisement);
  assert.ok(parsed);
  assert.equal(parsed.motd, "My Server");
  assert.equal(parsed.levelName, "World");
  assert.equal(parsed.protocol, 754);
  assert.equal(parsed.version, "1.21.80");
  assert.equal(parsed.playersOnline, 3);
  assert.equal(parsed.playersMax, 20);
  assert.equal(parsed.portV4, 19132);
  assert.equal(parsed.portV6, 19133);
});

void test("parseAdvertisementString rejects invalid header", () => {
  const parsed = parseAdvertisementString("MCXX;Test;1;1.21.80;0;0;id;World;Survival;1;19132;");
  assert.equal(parsed, null);
});

void test("parseAdvertisementString rejects missing fields", () => {
  const parsed = parseAdvertisementString("MCPE;OnlyName");
  assert.equal(parsed, null);
});

void test("parseAdvertisementString rejects invalid numbers", () => {
  const parsed = parseAdvertisementString("MCPE;Server;bad;1.21.80;x;y;id;World;Survival;1;19132;");
  assert.equal(parsed, null);
});

void test("parseAdvertisementString rejects empty required numbers", () => {
  const parsed = parseAdvertisementString("MCPE;Server;;1.21.80;1;10;id;World;Survival;1;19132;");
  assert.equal(parsed, null);
});

void test("parseAdvertisementString rejects missing server id", () => {
  const parsed = parseAdvertisementString("MCPE;Server;754;1.21.80;1;10;;World;Survival;1;19132;");
  assert.equal(parsed, null);
});

void test("parseAdvertisementString rejects missing version", () => {
  const parsed = parseAdvertisementString("MCPE;Server;754;;1;10;id;World;Survival;1;19132;");
  assert.equal(parsed, null);
});

void test("parseAdvertisementString allows optional numbers to be null", () => {
  const parsed = parseAdvertisementString("MCPE;Server;754;1.21.80;1;10;id;World;Survival;bad;;;");
  assert.ok(parsed);
  assert.equal(parsed.gamemodeId, null);
  assert.equal(parsed.portV4, null);
  assert.equal(parsed.portV6, null);
});
