import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TokenMedia } from "./token-media";

describe("TokenMedia", () => {
  it("serves responsive bundled artwork without downloading the original", () => {
    render(<TokenMedia alt="Realm" sources={["/banners/realms.png", "https://example.org/fallback.png"]} sizes="40px" />);
    const image = screen.getByRole("img", { name: "Realm" });
    expect(image.getAttribute("src")).toMatch(/\/optimized\/banners\/realms-\d+\.webp$/);
    expect(image.getAttribute("srcset")).toContain("/optimized/banners/realms-64.webp 64w");
    expect(image).toHaveAttribute("sizes", "40px");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", "https://example.org/fallback.png");
    expect(image).not.toHaveAttribute("srcset");
  });

  it("loads lazily from the first candidate", () => {
    render(<TokenMedia alt="Realm #1" sources={["/a.png", "/b.png"]} />);
    const image = screen.getByRole("img", { name: "Realm #1" });
    expect(image).toHaveAttribute("src", "/a.png");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("falls through to the next candidate when a source fails", () => {
    render(<TokenMedia alt="Realm #1" sources={["/a.png", "/b.png"]} />);
    fireEvent.error(screen.getByRole("img", { name: "Realm #1" }));
    expect(screen.getByRole("img", { name: "Realm #1" })).toHaveAttribute("src", "/b.png");
  });

  it("shows a labelled placeholder once every candidate fails", () => {
    render(<TokenMedia alt="Realm #1" sources={["/a.png"]} fallbackLabel="Artwork unavailable" />);
    fireEvent.error(screen.getByRole("img", { name: "Realm #1" }));
    expect(screen.getByTestId("token-media-fallback")).toHaveAccessibleName(
      "Realm #1: Artwork unavailable",
    );
  });

  it("renders the placeholder immediately when there is nothing to load", () => {
    render(<TokenMedia alt="Realm #1" sources={[]} />);
    expect(screen.getByTestId("token-media-fallback")).toBeVisible();
    expect(screen.queryByRole("img", { name: "Realm #1" })).toBeNull();
  });

  it("loads eagerly when marked as priority", () => {
    render(<TokenMedia alt="Hero" sources={["/hero.png"]} priority />);
    expect(screen.getByRole("img", { name: "Hero" })).toHaveAttribute("loading", "eager");
  });
});

it("shows loading feedback until artwork loads and resets it for a new source", () => {
  const {rerender} = render(<TokenMedia alt="Asset" sources={["/a.png"]} />);
  const image = screen.getByRole("img", {name: "Asset"});
  expect(image).toHaveAttribute("aria-busy", "true");
  fireEvent.load(image);
  expect(image).toHaveAttribute("aria-busy", "false");
  rerender(<TokenMedia alt="Asset" sources={["/b.png"]} />);
  expect(image).toHaveAttribute("aria-busy", "true");
});
