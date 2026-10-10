import { InjectedConnector } from "@starknet-react/core";
import { expect, it, vi } from "vitest";
import { DeferredControllerConnector } from "./deferred-controller";

function fixture() {
  const connector = new InjectedConnector({ options: { id: "controller", name: "Controller" } });
  vi.spyOn(connector, "ready").mockResolvedValue(true);
  vi.spyOn(connector, "connect").mockResolvedValue({ account: "0x123", chainId: 1n });
  vi.spyOn(connector, "disconnect").mockImplementation(async () => { connector.emit("disconnect"); });
  return connector;
}

it("does not load a wallet for browsing or displaying the wallet choice", async () => {
  const load = vi.fn(async () => fixture());
  const deferred = new DeferredControllerConnector(load);
  expect(deferred.id).toBe("controller");
  expect(deferred.name).toBe("Controller");
  expect(deferred.available()).toBe(true);
  expect(deferred.icon).toBe("/wallets/controller.svg");
  await deferred.disconnect();
  expect(load).not.toHaveBeenCalled();
});

it("initializes once for remembered-session readiness and forwards account/network/disconnect events", async () => {
  const actual = fixture();
  const load = vi.fn(async () => actual);
  const deferred = new DeferredControllerConnector(load);
  const changed = vi.fn(), disconnected = vi.fn();
  deferred.on("change", changed);
  deferred.on("disconnect", disconnected);
  const [ready, connected] = await Promise.all([deferred.ready(), deferred.connect({ chainIdHint: 1n })]);
  expect(ready).toBe(true);
  expect(connected).toEqual({ account: "0x123", chainId: 1n });
  expect(load).toHaveBeenCalledTimes(1);
  expect(actual.connect).toHaveBeenCalledWith({ chainIdHint: 1n });
  actual.emit("change", { account: "0x456", chainId: 2n });
  expect(changed).toHaveBeenCalledWith({ account: "0x456", chainId: 2n });
  await deferred.disconnect();
  expect(disconnected).toHaveBeenCalledOnce();
});

it("allows another attempt after the connector chunk fails to load", async () => {
  const actual = fixture();
  const load = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(actual);
  const deferred = new DeferredControllerConnector(load);
  await expect(deferred.connect({})).rejects.toThrow("Offline");
  await expect(deferred.connect({})).resolves.toMatchObject({ account: "0x123" });
  expect(load).toHaveBeenCalledTimes(2);
});
