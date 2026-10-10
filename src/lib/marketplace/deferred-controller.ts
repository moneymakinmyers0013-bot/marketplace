import { Connector } from "@starknet-react/core";

/** Keep Controller's implementation off the browsing path, including its iframe. */
export class DeferredControllerConnector extends Connector {
  private pending?: Promise<Connector>;

  constructor(private readonly create: () => Promise<Connector>) { super(); }

  get id() { return "controller"; }
  get name() { return "Controller"; }
  get icon() { return "/wallets/controller.svg"; }
  available() { return true; }

  private load() {
    if (!this.pending) {
      this.pending = this.create().then(connector => {
        connector.on("change", data => this.emit("change", data));
        connector.on("connect", data => this.emit("connect", data));
        connector.on("disconnect", () => this.emit("disconnect"));
        return connector;
      }).catch(error => {
        this.pending = undefined;
        throw error;
      });
    }
    return this.pending;
  }

  // starknet-react calls ready() only for the last used connector during reconnect.
  async ready() { return (await this.load()).ready(); }
  async connect(args: Parameters<Connector["connect"]>[0]) { return (await this.load()).connect(args); }
  async disconnect() { if (this.pending) await (await this.pending).disconnect(); }
  async account(...args: Parameters<Connector["account"]>) { return (await this.load()).account(...args); }
  async chainId() { return (await this.load()).chainId(); }
  request: Connector["request"] = async call => (await this.load()).request(call);
}
