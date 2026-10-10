import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroBanner } from "@/features/home/hero-banner";

describe("HeroBanner", () => {
  it("prioritizes a responsive local hero", () => {
    render(<HeroBanner name="Realms" address="0xabc" imageUrl="/banners/realms.png" />);
    const image = screen.getByAltText("Realms banner");
    expect(image).toHaveAttribute("fetchpriority", "high");
    expect(image).toHaveAttribute("sizes", "100vw");
    expect(image.getAttribute("srcset")).toContain("/optimized/banners/realms-640.webp 640w");
  });

  it("renders_collection_name_as_heading", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
      />,
    );

    expect(screen.getByRole("heading", { name: "Genesis" })).toBeVisible();
  });

  it("renders_hero_image", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
        imageUrl="https://cdn.example/hero.png"
      />,
    );

    expect(screen.getByAltText("Genesis banner")).toHaveAttribute(
      "src",
      "https://cdn.example/hero.png",
    );
  });

  it("renders_floor_price_stat", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
        floorPrice="2.5"
      />,
    );

    expect(screen.getByText("Floor")).toBeVisible();
    expect(screen.getByText("2.5")).toBeVisible();
  });

  it("renders_total_supply_stat", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
        totalSupply="123"
      />,
    );

    expect(screen.getByText("Supply")).toBeVisible();
    expect(screen.getByText("123")).toBeVisible();
  });

  it("renders_listing_count_stat", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
        listingCount="44"
      />,
    );

    expect(screen.getByText("Listed")).toBeVisible();
    expect(screen.getByText("44")).toBeVisible();
  });

  it("links_to_collection_page", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
      />,
    );

    expect(screen.getByRole("link", { name: /view collection/i })).toHaveAttribute(
      "href",
      "/collections/0xabc",
    );
  });

  it("renders_skeletons_when_loading", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
        isLoading
      />,
    );

    expect(screen.getAllByTestId("hero-banner-skeleton").length).toBeGreaterThan(0);
  });

  it("renders_gradient_fallback_when_no_image", () => {
    render(
      <HeroBanner
        name="Genesis"
        address="0xabc"
      />,
    );

    expect(screen.getByTestId("hero-banner-gradient-fallback")).toBeVisible();
  });
});
