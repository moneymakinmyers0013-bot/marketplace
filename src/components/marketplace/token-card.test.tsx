import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { ResourceTraitIcons } from "@/components/marketplace/resource-trait-icons";
import type { NormalizedToken } from "@/lib/marketplace/types";

function token(
  tokenId: string,
  metadata: Record<string, unknown>,
): NormalizedToken {
  return {
    token_id: tokenId,
    metadata,
  } as unknown as NormalizedToken;
}

describe("MarketplaceTokenCard", () => {
  it("renders_base_token_details", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/7"
        price="1000000000000000000"
        token={token("7", { name: "Token #7", image_url: "https://cdn.example/7.png" })}
      />,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/collections/0xabc/7");
    expect(screen.getByText("Token #7")).toBeVisible();
    // The name already carries the id, so no separate "#7" line repeats it.
    expect(screen.queryByText("#7")).toBeNull();
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getByAltText("Token #7").parentElement).toHaveClass("aspect-[4/5]");
  });

  it("shows_the_id_line_when_the_name_does_not_carry_it", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/21"
        token={token("21", { name: "Ember Drake" })}
      />,
    );

    expect(screen.getByText("Ember Drake")).toBeVisible();
    expect(screen.getByText("#21")).toBeVisible();
    expect(screen.getByText("Not listed")).toBeVisible();
  });

  it("renders_a_note_inside_the_card_body", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/22"
        cardContentRole="article"
        cardContentAriaLabel="token-22"
        note="Sold 3d ago"
        token={token("22", { name: "Token #22" })}
      />,
    );

    const body = screen.getByRole("article", { name: "token-22" });
    expect(within(body).getByText("Sold 3d ago")).toBeVisible();
  });

  it("includes_hover_and_focus_attribute_table_overlay", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/8"
        token={token("8", {
          name: "Token #8",
          attributes: [
            { trait_type: "Background", value: "Blue" },
            { trait_type: "Eyes", value: "Laser" },
          ],
        })}
      />,
    );

    const table = screen.getByTestId("token-attributes-table");
    const overlay = screen.getByTestId("token-attributes-overlay");
    expect(overlay.className).toContain("group-hover:opacity-100");
    expect(overlay.className).toContain("group-focus-visible:opacity-100");
    expect(within(table).getByRole("columnheader", { name: /trait/i })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: /value/i })).toBeVisible();
    expect(within(table).getByText("Background")).toBeVisible();
    expect(within(table).getByText("Blue")).toBeVisible();
    expect(within(table).getByText("Eyes")).toBeVisible();
    expect(within(table).getByText("Laser")).toBeVisible();
  });

  it("groups_duplicate_trait_names_on_single_row", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/10"
        token={token("10", {
          name: "Token #10",
          attributes: [
            { trait_type: "Resource", value: "Coal" },
            { trait_type: "Resource", value: "Stone" },
            { trait_type: "Resource", value: "Wood" },
            { trait_type: "Order", value: "North" },
          ],
        })}
      />,
    );

    const table = screen.getByTestId("token-attributes-table");
    expect(within(table).getAllByText("Resource")).toHaveLength(1);
    expect(within(table).getByText("Coal, Stone, Wood")).toBeVisible();
    expect(within(table).getByText("Order")).toBeVisible();
    expect(within(table).getByText("North")).toBeVisible();
  });

  it("uses_scroll_container_for_long_attribute_lists", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/11"
        token={token("11", {
          name: "Token #11",
          attributes: Array.from({ length: 25 }, (_, index) => ({
            trait_type: `Trait ${index + 1}`,
            value: `Value ${index + 1}`,
          })),
        })}
      />,
    );

    const scroll = screen.getByTestId("token-attributes-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.className).toContain("max-h");
  });

  it("shows_empty_attribute_row_when_metadata_has_no_attributes", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/9"
        token={token("9", { name: "Token #9" })}
      />,
    );

    const table = screen.getByTestId("token-attributes-table");
    expect(within(table).getByText("No attributes")).toBeVisible();
  });

  it("renders_buy_now_and_view_buttons_at_card_bottom", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/12"
        showActions
        onBuyNow={() => undefined}
        token={token("12", { name: "Token #12" })}
      />,
    );

    expect(screen.getByRole("button", { name: /buy now/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute(
      "href",
      "/collections/0xabc/12",
    );
  });

  it("calls_on_buy_now_when_clicked", async () => {
    const user = userEvent.setup();
    const onBuyNow = vi.fn();

    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/13"
        showActions
        onBuyNow={onBuyNow}
        token={token("13", { name: "Token #13" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /buy now/i }));

    expect(onBuyNow).toHaveBeenCalledTimes(1);
  });

  it("does_not_render_buy_now_when_no_listing_action_is_provided", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/14"
        showActions
        token={token("14", { name: "Token #14" })}
      />,
    );

    expect(screen.queryByRole("button", { name: /buy now/i })).toBeNull();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute(
      "href",
      "/collections/0xabc/14",
    );
  });

  it("renders_inline_resource_icons_when_provided", () => {
    render(
      <MarketplaceTokenCard
        href="/collections/0xabc/15"
        inlineTraits={<ResourceTraitIcons resources={["Coal", "Stone", "Wood"]} />}
        token={token("15", { name: "Token #15" })}
      />,
    );

    const traitIcons = screen.getByTestId("resource-trait-icons");
    expect(within(traitIcons).getByRole("img", { name: "Coal" })).toBeVisible();
    expect(within(traitIcons).getByRole("img", { name: "Stone" })).toBeVisible();
    expect(within(traitIcons).getByRole("img", { name: "Wood" })).toBeVisible();
  });
});
