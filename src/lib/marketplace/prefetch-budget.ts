export type NetworkPreference = { saveData?: boolean; effectiveType?: string };

/** At most two new public destinations per second, with a bounded 30s dedupe window. */
export function createPrefetchBudget(now = () => Date.now()) {
  const recent = new Map<string, number>();
  let starts: number[] = [];
  return (href: string, network: NetworkPreference = {}) => {
    if (network.saveData || ["slow-2g", "2g"].includes(network.effectiveType ?? "")) return false;
    if (href.length > 2048 || !/^\/collections\/0x[\da-f]+(?:\/(?:\d+|0x[\da-f]+))?(?:\?[^#]*)?$/i.test(href)) return false;
    const time = now();
    for (const [key, expires] of recent) if (expires <= time) recent.delete(key);
    starts = starts.filter(start => time - start < 1000);
    if (recent.has(href) || starts.length >= 2) return false;
    if (recent.size >= 64) recent.delete(recent.keys().next().value!);
    recent.set(href, time + 30_000);
    starts.push(time);
    return true;
  };
}

export const admitNavigationPrefetch = createPrefetchBudget();
