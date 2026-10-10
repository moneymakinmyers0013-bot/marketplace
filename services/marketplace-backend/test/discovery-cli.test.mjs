import test from "node:test";
import assert from "node:assert/strict";
import { parseDiscoveryArgs } from "../src/discovery-cli.mjs";
test("scan requires explicit bounded coverage and never starts indefinite history implicitly", () => {
  assert.deepEqual(parseDiscoveryArgs(["scan", "--chain", "SN_MAIN", "--start", "0", "--stop", "4", "--window", "5"]),
    { command: "scan", chain: "SN_MAIN", start: 0, stop: 4, window: 5 });
  for (const args of [["scan"], ["scan", "--chain", "SN_MAIN", "--start", "0"],
    ["scan", "--chain", "SN_MAIN", "--start", "0", "--stop", "10", "--window", "101"],
    ["scan", "--chain", "SN_MAIN", "--chain", "LOCAL", "--start", "0", "--stop", "4"]])
    assert.throws(() => parseDiscoveryArgs(args));
});
test("unknown commands/options and invalid source addresses fail before networking", () => {
  assert.throws(() => parseDiscoveryArgs(["activate", "--chain", "SN_MAIN"]));
  assert.throws(() => parseDiscoveryArgs(["report", "--chain", "SN_MAIN", "--secret", "x"]));
  assert.throws(() => parseDiscoveryArgs(["replay", "--chain", "SN_MAIN", "--source", "invalid"]));
});
