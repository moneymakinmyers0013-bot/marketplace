"use client"
import {formatCurrencyAmount} from "@/lib/marketplace/amount-display";

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { TokenSymbol } from "@/components/ui/token-symbol"
import { TokenMedia } from "@/components/marketplace/token-media"
import type { CartItem } from "@/features/cart/store/cart-store"
import { formatPriceForDisplay } from "@/lib/marketplace/token-display"

const MAX_VISIBLE_THUMBS = 8

type SweepBarProps = {
  candidates: CartItem[]
  count: number
  maxCount: number
  onCountChange: (nextCount: number) => void
  onSweep: () => void
}

function clampCount(count: number, maxCount: number) {
  return Math.min(Math.max(count, 0), maxCount)
}

function totalPrice(items: CartItem[]) {
  return items.reduce((sum, item) => {
    try {
      return sum + BigInt(item.price)
    } catch {
      return sum
    }
  }, BigInt(0))
}

function SweepThumbnails({ items }: { items: CartItem[] }) {
  if (items.length === 0) return null

  const visible = items.slice(0, MAX_VISIBLE_THUMBS)
  const overflow = items.length - MAX_VISIBLE_THUMBS

  return (
    <div className="flex items-end">
      <div className="flex">
        {visible.map((item, index) => (
          <div
            key={item.orderId}
            className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[6px] border border-[color:var(--realm-border-etched)] bg-muted shadow-[0_2px_8px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-bottom-2 duration-200 fill-mode-backwards hover:z-20 hover:shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-[box-shadow]"
            style={{
              marginLeft: index === 0 ? 0 : -8,
              zIndex: index + 1,
              animationDelay: `${index * 40}ms`,
            }}
            title={item.tokenName ?? `#${item.tokenId}`}
          >
            <TokenMedia
              alt={item.tokenName ?? `#${item.tokenId}`}
              fallbackLabel="NFT"
              sources={item.tokenImage ? [item.tokenImage] : []}
            />
          </div>
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-2 mb-0.5 text-xs font-medium text-muted-foreground animate-in fade-in duration-200">
          +{overflow}
        </span>
      )}
    </div>
  )
}

export function SweepBar({
  candidates,
  count,
  maxCount,
  onCountChange,
  onSweep,
}: SweepBarProps) {
  const disabled = candidates.length === 0 || maxCount <= 0
  const selectedCount = disabled ? 0 : clampCount(count, maxCount)
  const selectedCandidates = candidates.slice(0, selectedCount)
  const selectedTotal = totalPrice(selectedCandidates)
  const formattedTotal =
    candidates[0]?.orderId.includes(':') ? formatCurrencyAmount(selectedTotal,candidates[0].currency) : formatPriceForDisplay(selectedTotal.toString()) ?? '0'
  const currency = selectedCandidates[0]?.currency ?? candidates[0]?.currency ?? ""

  return (
    <div className="realm-panel sticky bottom-3 z-30 backdrop-blur-md">
      <div className="w-full px-4 sm:px-5">
        {selectedCount > 0 && (
          <div className="overflow-x-auto pt-2 pb-1">
            <SweepThumbnails items={selectedCandidates} />
          </div>
        )}
        <div className="flex items-center gap-3 py-2">
          <div className="min-w-20 shrink-0">
            <h2 className="market-section-title">Sweep</h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {selectedCount > 0 ? (
                <span className="flex items-center gap-1">
                  {selectedCount} &middot; {formattedTotal}
                  {currency ? <TokenSymbol address={currency} /> : null}
                </span>
              ) : (
                `${maxCount} available`
              )}
            </p>
          </div>
          <div className="min-w-24 flex-1">
            <Slider
              aria-label="Sweep count"
              disabled={disabled}
              max={disabled ? 1 : maxCount}
              min={0}
              onValueChange={(value) => onCountChange(value[0] ?? 0)}
              step={1}
              value={[selectedCount]}
            />
          </div>
          <Button
            disabled={disabled || selectedCount === 0}
            onClick={onSweep}
            size="sm"
            type="button"
          >
            {selectedCount > 0 ? `Add ${selectedCount} to cart` : "Sweep"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export type { SweepBarProps }
