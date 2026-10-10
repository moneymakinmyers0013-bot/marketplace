import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { createMarketplaceClient, type MarketplaceClient } from "@biblio/marketplace";
import { MarketplaceProvider } from "@biblio/marketplace-react";
import { server } from "@/test/msw/server";
import DiscoveryPage from "@/app/discovery/page";
import { collectionPage, discoveryStatus, exampleAccount, exampleCollection, holdingPage, tokenPage } from "./fixtures";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => navigation.params, usePathname: () => "/discovery", useRouter: () => ({ push: navigation.push }) }));
let client: MarketplaceClient;
const requests: URL[] = [];
beforeEach(() => {
  navigation.params = new URLSearchParams(); navigation.push.mockReset(); requests.length = 0;
  client = createMarketplaceClient({ apiUrl: "http://discovery.test", chain: "SN_MAIN", chainId: "0x534e5f4d41494e" });
  server.use(http.get("http://discovery.test/v1/chains/SN_MAIN/discovery/*", ({ request }) => {
    const url = new URL(request.url); requests.push(url);
    if (url.pathname.endsWith("/status")) return HttpResponse.json({ data: discoveryStatus });
    if (url.pathname.endsWith("/tokens")) return HttpResponse.json({ data: tokenPage });
    if (url.pathname.endsWith("/holdings")) return HttpResponse.json({ data: holdingPage });
    return HttpResponse.json({ data: collectionPage });
  }));
});
afterEach(() => client.dispose());
const app = () => <MarketplaceProvider client={client}><DiscoveryPage /></MarketplaceProvider>;

it("loads the actual SDK discovery API and resets cursors when collection search changes", async () => {
  const user = userEvent.setup();
  navigation.params = new URLSearchParams("q=abc&cursor=page-two&foo=retained");
  const { rerender } = render(app());
  await screen.findAllByRole("button", { name: "Browse indexed tokens" });
  expect(requests.find(url => url.pathname.endsWith("/collections"))?.searchParams.get("cursor")).toBe("page-two");
  const input = screen.getByRole("textbox", { name: "Search contract address" });
  await user.clear(input); await user.type(input, "def");
  await user.click(screen.getByRole("button", { name: "Search collections" }));
  const target = navigation.push.mock.lastCall?.[0] as string;
  expect(target).toContain("q=def"); expect(target).not.toContain("cursor="); expect(target).toContain("foo=retained");
  navigation.params = new URLSearchParams(target.split("?")[1]); rerender(app());
  await waitFor(() => expect(requests.some(url => url.pathname.endsWith("/collections") && url.searchParams.get("q") === "def" && !url.searchParams.has("cursor"))).toBe(true));
});

it("uses a token-specific query without leaking the collections cursor or search", async () => {
  const user = userEvent.setup();
  navigation.params = new URLSearchParams("q=abc&cursor=old-cursor");
  const { rerender } = render(app());
  await screen.findAllByRole("button", { name: "Browse indexed tokens" });
  await user.click(screen.getAllByRole("button", { name: "Browse indexed tokens" })[0]);
  const target = navigation.push.mock.lastCall?.[0] as string;
  expect(target).toContain("view=tokens"); expect(target).not.toMatch(/cursor=|q=/);
  navigation.params = new URLSearchParams(target.split("?")[1]); rerender(app());
  await screen.findByText(tokenPage.items[0].tokenId);
  const request = requests.find(url => url.pathname.endsWith("/tokens"));
  expect(request?.pathname).toContain(exampleCollection); expect(request?.searchParams.has("cursor")).toBe(false);
  expect(screen.queryByRole("link")).toBeNull();
});

it("does not request an account until valid input is submitted and keeps balances lossless", async () => {
  navigation.params = new URLSearchParams("view=holdings");
  const user = userEvent.setup(); const { rerender } = render(app());
  expect(screen.getByText("Enter an address to browse indexed observations.")).toBeVisible();
  await user.type(screen.getByRole("textbox", { name: "Account address" }), "not-a-felt");
  await user.click(screen.getByRole("button", { name: "Load holdings" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid Starknet account address.");
  expect(requests.some(url => url.pathname.endsWith("/holdings"))).toBe(false);
  await user.clear(screen.getByRole("textbox", { name: "Account address" }));
  await user.type(screen.getByRole("textbox", { name: "Account address" }), exampleAccount);
  await user.click(screen.getByRole("button", { name: "Load holdings" }));
  navigation.params = new URLSearchParams((navigation.push.mock.lastCall?.[0] as string).split("?")[1]); rerender(app());
  await screen.findByText(holdingPage.items[0].balance);
  expect(requests.find(url => url.pathname.endsWith("/holdings"))?.pathname).toContain(exampleAccount);
});

it("shows unsupported publication without an empty-inventory claim", async () => {
  navigation.params = new URLSearchParams(`view=tokens&collection=${exampleCollection}`);
  server.use(http.get("http://discovery.test/v1/chains/SN_MAIN/discovery/collections/:address/tokens", () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "Discovered collection is not published" } }, { status: 404 })));
  render(app());
  expect(await screen.findByRole("alert")).toHaveTextContent("Collection unavailable");
  expect(screen.queryByText(/No indexed tokens/)).toBeNull();
});

it("lets an expired generation cursor return to the first page", async () => {
  navigation.params = new URLSearchParams("q=abc&cursor=stale-generation");
  server.use(http.get("http://discovery.test/v1/chains/SN_MAIN/discovery/collections", () => HttpResponse.json({ error: { code: "CURSOR_MISMATCH", message: "Discovery cursor belongs to another query or generation" } }, { status: 400 })));
  const user = userEvent.setup(); render(app());
  expect(await screen.findByRole("alert")).toHaveTextContent("This page expired");
  await user.click(screen.getByRole("button", { name: "Return to first page" }));
  expect(navigation.push).toHaveBeenLastCalledWith("/discovery?q=abc", { scroll: false });
});
