// NFT contract classification (issue #111). Evidence-based: class ABIs are inspected once per
// class hash and cached; interface probes are address-specific and pinned to a block.
// A Transfer selector alone is never treated as proof of NFT semantics.
import { selector } from "./starknet-keccak.mjs";

// Interface ids. SRC5 ids from OpenZeppelin cairo-contracts; legacy ids are ERC-165 values
// used by Cairo 0 contracts that implement `supportsInterface`.
export const INTERFACE_IDS = {
  SRC5_ERC721:
    "0x33eb2f84c309543403fd69f0d0f363781ef06ef6faeb0131ff16ea3175bd943",
  SRC5_ERC1155:
    "0x6114a8f75559e1b39fcba08ce02961a1aa082d9256a158dd3e64964e4b1b52",
  LEGACY_ERC721: "0x80ac58cd",
  LEGACY_ERC1155: "0xd9b67a26",
};
const ALIASES = {
  owner_of: ["owner_of", "ownerOf"],
  balance_of: ["balance_of", "balanceOf"],
  transfer_from: ["transfer_from", "transferFrom"],
  safe_transfer_from: ["safe_transfer_from", "safeTransferFrom"],
  balance_of_batch: ["balance_of_batch", "balanceOfBatch"],
  safe_batch_transfer_from: [
    "safe_batch_transfer_from",
    "safeBatchTransferFrom",
  ],
  token_uri: ["token_uri", "tokenURI", "tokenUri"],
  uri: ["uri"],
  decimals: ["decimals"],
  supports_interface: ["supports_interface", "supportsInterface"],
  implementation: [
    "get_implementation",
    "getImplementation",
    "implementation",
    "get_implementation_hash",
  ],
};
const lastSegment = (name) => String(name).split("::").pop();

/** Parse a Cairo 0 or Cairo 1 class into functions, event layouts and proxy hints. */
export function analyzeClass(contractClass) {
  let abi = contractClass?.abi ?? [];
  if (typeof abi === "string") abi = abi ? JSON.parse(abi) : [];
  const cairo = contractClass?.sierra_program ? 1 : 0;
  const functions = new Set();
  const events = [];
  const eventEnums = [];
  const walk = (items) => {
    for (const item of items ?? []) {
      if (item.type === "function" || item.type === "l1_handler")
        functions.add(item.name);
      else if (item.type === "interface") walk(item.items);
      else if (item.type === "event" && item.kind === "enum") eventEnums.push(item);
      else if (item.type === "event" && item.kind === "struct") {
        const members = item.members ?? [];
        events.push({
          name: lastSegment(item.name),
          path: item.name,
          selector: selector(lastSegment(item.name)),
          keys: members
            .filter((m) => m.kind === "key")
            .map((m) => ({ name: m.name, type: m.type })),
          data: members
            .filter((m) => m.kind !== "key")
            .map((m) => ({ name: m.name, type: m.type })),
        });
      } else if (item.type === "event" && !item.kind) {
        events.push({
          name: item.name,
          path: item.name,
          selector: selector(item.name),
          keys: (item.keys ?? []).map((m) => ({ name: m.name, type: m.type })),
          data: (item.data ?? []).map((m) => ({ name: m.name, type: m.type })),
        });
      }
    }
  };
  walk(abi);
  const methodAliases = {};
  for (const [canonical, names] of Object.entries(ALIASES)) {
    const found = names.find((n) => functions.has(n));
    if (found) methodAliases[canonical] = found;
  }
  const hasDefault = functions.has("__default__");
  return {
    cairoVersion: cairo,
    functionCount: functions.size,
    eventEnvelope: cairo === 0 ? "flat" : eventEnums.length &&
      eventEnums.every(e => e.variants?.every(v => v.kind === "flat" ||
        (events.some(s => s.path === v.type) && v.name === lastSegment(v.type)) )) ? "flat" : "unreviewed",
    methodAliases,
    eventLayouts: events.filter((e) =>
      [
        "Transfer",
        "Approval",
        "TransferSingle",
        "TransferBatch",
        "Upgraded",
        "ApprovalForAll",
        "URI",
      ].includes(e.name),
    ),
    proxyHint:
      hasDefault ||
      Boolean(methodAliases.implementation) ||
      events.some((e) => e.name === "Upgraded" && !methodAliases.owner_of),
    delegatesByDefault: hasDefault,
  };
}

/** Classify the Transfer event shape: a u256 id among keys/data vs. a fungible value. */
export function transferShape(layout) {
  if (!layout) return null;
  const fields = [...layout.keys, ...layout.data].map((f) =>
    f.name.toLowerCase().replace(/_/g, ""),
  );
  if (fields.some((f) => f === "tokenid")) return "nft";
  if (fields.some((f) => f === "value" || f === "amount")) return "fungible";
  return "unknown";
}

function decideFromAbi(info) {
  const a = info.methodAliases;
  const transfer = info.eventLayouts.find((e) => e.name === "Transfer");
  const shape = transferShape(transfer);
  if (a.decimals || shape === "fungible")
    return {
      standard: "erc20",
      basis: "abi: decimals or fungible Transfer(value)",
    };
  if (a.balance_of_batch && a.safe_batch_transfer_from)
    return {
      standard: "erc1155",
      basis: "abi: balance_of_batch + safe_batch_transfer_from",
    };
  if (a.owner_of && (a.transfer_from || a.safe_transfer_from))
    return { standard: "erc721", basis: "abi: owner_of + transfer function" };
  return {
    standard: "unknown",
    basis: "abi lacks a complete standard surface",
  };
}

async function probeInterface(rpc, address, blockId, entry, id) {
  const res = await rpc.call("starknet_call", [
    {
      contract_address: address,
      entry_point_selector: selector(entry),
      calldata: [id],
    },
    blockId,
  ]);
  if (!Array.isArray(res) || res.length !== 1 || ![0n, 1n].includes(BigInt(res[0])))
    throw new Error("Invalid interface Boolean response");
  return BigInt(res[0]) === 1n;
}

/**
 * Classify one contract at a pinned block. `cache` is a Map keyed by class hash holding
 * class-level evidence shared by every address deployed from that class.
 */
export async function classifyContract(
  rpc,
  address,
  { blockId = "latest", cache = new Map(), followProxy = true } = {},
) {
  const evidence = [],
    uncertainty = [],
    probeErrors = [];
  const classHash = await rpc.call("starknet_getClassHashAt", [
    blockId,
    address,
  ]);
  const loadClass = async (hash) => {
    if (!cache.has(hash))
      cache.set(
        hash,
        analyzeClass(await rpc.call("starknet_getClass", [blockId, hash])),
      );
    else evidence.push(`class ${hash} evidence reused from cache`);
    return cache.get(hash);
  };
  let info = await loadClass(classHash);
  let implementationClassHash = null;
  if (
    followProxy &&
    info.proxyHint &&
    !info.methodAliases.owner_of &&
    !info.methodAliases.balance_of_batch
  ) {
    uncertainty.push(
      "proxy: implementation can change; classification valid only at the pinned block",
    );
    if (info.methodAliases.implementation) {
      try {
        const r = await rpc.call("starknet_call", [
          {
            contract_address: address,
            entry_point_selector: selector(info.methodAliases.implementation),
            calldata: [],
          },
          blockId,
        ]);
        implementationClassHash = r?.[0] ?? null;
        if (implementationClassHash) {
          try {
            info = await loadClass(implementationClassHash);
            evidence.push(
              `proxy implementation class ${implementationClassHash}`,
            );
          } catch {
            uncertainty.push(
              "proxy implementation is not a declared class (may be an address)",
            );
          }
        }
      } catch (e) {
        probeErrors.push({ probe: "implementation", message: e.message });
      }
    }
    if (!implementationClassHash && info.delegatesByDefault) {
      // OpenZeppelin Cairo 0 proxies keep the class hash in storage var `Proxy_implementation_hash`.
      try {
        const v = await rpc.call("starknet_getStorageAt", [
          address,
          selector("Proxy_implementation_hash"),
          blockId,
        ]);
        if (BigInt(v ?? 0) !== 0n) {
          implementationClassHash = v;
          info = await loadClass(v);
          evidence.push(
            `proxy implementation class ${v} (Proxy_implementation_hash storage)`,
          );
        } else
          uncertainty.push(
            "proxy implementation slot empty or non-standard proxy layout",
          );
      } catch (e) {
        probeErrors.push({
          probe: "Proxy_implementation_hash",
          message: e.message,
        });
      }
    }
  }
  const abiDecision = decideFromAbi(info);
  evidence.push(abiDecision.basis);
  const probes = {};
  const entry = info.methodAliases.supports_interface;
  if (entry && abiDecision.standard !== "erc20") {
    const ids =
      info.cairoVersion === 1
        ? {
            erc721: INTERFACE_IDS.SRC5_ERC721,
            erc1155: INTERFACE_IDS.SRC5_ERC1155,
          }
        : {
            erc721: INTERFACE_IDS.LEGACY_ERC721,
            erc1155: INTERFACE_IDS.LEGACY_ERC1155,
          };
    for (const [std, id] of Object.entries(ids)) {
      try {
        probes[std] = await probeInterface(rpc, address, blockId, entry, id);
      } catch (e) {
        probeErrors.push({ probe: `${entry}(${id})`, message: e.message });
      }
    }
    // Cairo 1 contracts migrated from Cairo 0 sometimes answer only legacy ids.
    if (info.cairoVersion === 1 && !probes.erc721 && !probes.erc1155) {
      try {
        probes.erc721Legacy = await probeInterface(
          rpc,
          address,
          blockId,
          entry,
          INTERFACE_IDS.LEGACY_ERC721,
        );
      } catch (e) {
        probeErrors.push({ probe: "legacy erc721 id", message: e.message });
      }
    }
  } else if (!entry)
    uncertainty.push("no introspection entry point; ABI-only evidence");
  const introspected =
    probes.erc721 || probes.erc721Legacy
      ? "erc721"
      : probes.erc1155
        ? "erc1155"
        : null;
  if (introspected) evidence.push(`introspection reports ${introspected}`);
  let standard = abiDecision.standard,
    confidence;
  if (abiDecision.standard === "erc20") confidence = "rejected_fungible";
  else if (introspected && introspected === abiDecision.standard)
    confidence = "confirmed";
  else if (introspected && abiDecision.standard === "unknown") {
    standard = introspected;
    confidence = "introspection_only";
    uncertainty.push("introspection claims a standard the ABI does not show");
  } else if (introspected) {
    standard = "unknown";
    confidence = "conflict";
    uncertainty.push(
      `ABI suggests ${abiDecision.standard}, introspection ${introspected}`,
    );
  } else if (abiDecision.standard !== "unknown") {
    confidence = "abi_only";
    if (entry)
      uncertainty.push("introspection did not confirm the ABI surface");
  } else confidence = "unknown_retained";
  const transfer = info.eventLayouts.find((e) => e.name === "Transfer");
  if (standard === "erc721" && transfer && transfer.keys.length < 3)
    uncertainty.push(
      `legacy Transfer layout: ${transfer.keys.length} keys, ${transfer.data.length} data fields`,
    );
  return {
    address,
    blockId,
    classHash,
    implementationClassHash,
    cairoVersion: info.cairoVersion,
    standard,
    confidence,
    evidence,
    uncertainty,
    probeErrors,
    probes,
    methodAliases: info.methodAliases,
    eventLayouts: info.eventLayouts,
    eventEnvelope: info.eventEnvelope,
  };
}

/** Classify many candidates; one failure never stops the others (unknowns are retained). */
export async function classifyMany(rpc, addresses, options = {}) {
  const cache = options.cache ?? new Map();
  const out = [];
  for (const address of addresses) {
    try {
      out.push(await classifyContract(rpc, address, { ...options, cache }));
    } catch (e) {
      out.push({
        address,
        standard: "unknown",
        confidence: "probe_failed",
        probeErrors: [{ probe: "classify", message: e.message }],
        evidence: [],
        uncertainty: ["classification failed; retained for investigation"],
      });
    }
  }
  return out;
}

/**
 * Build class intervals from classifications at ascending pinned blocks (e.g. deployment
 * and upgrade blocks from discovery). Each interval names the decoder-relevant class.
 */
export function classIntervals(samples) {
  const sorted = [...samples].sort((a, b) => Number(a.block) - Number(b.block));
  const intervals = [];
  for (const s of sorted) {
    const key = s.implementationClassHash ?? s.classHash;
    const last = intervals.at(-1);
    if (last && last.classHash === key && last.standard === s.standard)
      continue;
    if (last) last.toBlock = Number(s.block) - 1;
    intervals.push({
      fromBlock: Number(s.block),
      toBlock: null,
      classHash: key,
      standard: s.standard,
      confidence: s.confidence,
    });
  }
  return intervals;
}
