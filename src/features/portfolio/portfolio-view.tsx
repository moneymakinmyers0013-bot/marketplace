"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { useAccount } from "@starknet-react/core";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletProfileView } from "@/features/profile/wallet-profile-view";

type PortfolioViewProps = {
  initialAddress?: string;
};

function isValidAddress(value: string) {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

const subscribeHydration=()=>()=>{};
export function PortfolioView({ initialAddress = "" }: PortfolioViewProps) {
  const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
  const { isConnected, address: connectedAddress } = useAccount();
  const defaultAddress =
    initialAddress || (isConnected && connectedAddress ? connectedAddress : "");
  const [addressInput, setAddressInput] = useState(defaultAddress);
  const [activeAddress, setActiveAddress] = useState(defaultAddress);
  const [errorMessage, setErrorMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = addressInput.trim();
    if (!isValidAddress(normalized)) {
      setErrorMessage("Enter a valid wallet address.");
      return;
    }

    setErrorMessage("");
    setActiveAddress(normalized);
  }

  return (
    <main
      className="market-page mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col gap-6"
      data-testid="portfolio-view"
    >
      <h1 className="market-page-title">Portfolio</h1>

      {/* Lookup first, then whatever it loads: the empty prompt or the holdings. */}
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <div className="w-full space-y-1.5">
          <label className="market-label block" htmlFor="portfolio-address-input">
            Wallet address
          </label>
          <Input
            disabled={!hydrated}
            aria-label="Wallet address"
            id="portfolio-address-input"
            onChange={(event) => setAddressInput(event.target.value)}
            placeholder="0x..."
            value={addressInput}
            className="h-10 border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/80 text-foreground placeholder:text-muted-foreground/70"
          />
        </div>
        <Button className="h-10 sm:w-auto" type="submit" disabled={!hydrated}>
          Load holdings
        </Button>
      </form>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {!activeAddress && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-[8px] border border-[color:var(--realm-border-etched)] bg-muted/70 p-4">
            <Wallet className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="market-group-title mb-1">Explore any wallet</p>
          <p className="text-xs text-muted-foreground">Enter a wallet address to view NFT holdings</p>
        </div>
      )}

      {activeAddress ? (
        <WalletProfileView
          address={activeAddress}
          showHeader={false}
        />
      ) : null}
    </main>
  );
}
