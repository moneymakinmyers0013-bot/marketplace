import { readFileSync } from "node:fs";
import { address, uint, fromU256, ApiError } from "./domain.mjs";

// Constants use Starknet Keccak (Keccak-256 masked to 250 bits), not Node SHA3.
const existingSelectors = JSON.parse(readFileSync(
  new URL("../../../config/marketplace/selectors.json", import.meta.url), "utf8",
));
export const NFT_SELECTORS = Object.freeze({
  Transfer: existingSelectors.Transfer,
  Approval: existingSelectors.Approval,
  ApprovalForAll: existingSelectors.ApprovalForAll,
  MetadataUpdate: existingSelectors.MetadataUpdate,
  BatchMetadataUpdate: existingSelectors.BatchMetadataUpdate,
  TransferSingle: "0x182d859c0807ba9db63baf8b9d9fdbfeb885d820be6e206b9dab626d995c433",
  TransferBatch: "0x2563683c757f3abe19c4b7237e2285d8993417ddffe0b54a19eb212ea574b08",
  URI: "0x278764b0e84f45a602e24e86f19a3e2af7956f2a9112d825c8b5ca7991c711f",
});
const names = new Map(Object.entries(NFT_SELECTORS).map(([name, value]) => [BigInt(value).toString(), name]));
export const STARKNET_FIELD_PRIME = (1n << 251n) + 17n * (1n << 192n) + 1n;

const erc721ReadMethods = Object.freeze({
  owner: ["owner_of", "ownerOf"], balance: ["balance_of", "balanceOf"],
  approval: ["get_approved", "getApproved"], operator: ["is_approved_for_all", "isApprovedForAll"],
  metadata: ["token_uri", "tokenURI"],
});
const oz2 = "f1c15a30a44311166e0368081c5f79ab5a02c1d3";
export const NFT_ADAPTERS = Object.freeze({
  "erc721-cairo1-oz-2": Object.freeze({
    standard: "ERC721", version: 1, layout: "cairo1-keyed", readMethods: erc721ReadMethods,
    evidence: {kind: "pinned_library_source", version: "v2.0.0", commit: oz2,
      url: `https://github.com/OpenZeppelin/cairo-contracts/blob/${oz2}/packages/token/src/erc721/erc721.cairo#L31-L68`},
  }),
  "erc721-cairo0-oz-0.6": Object.freeze({
    standard: "ERC721", version: 1, layout: "cairo0-data", readMethods: erc721ReadMethods,
    evidence: {kind: "pinned_library_source", version: "v0.6.1", commit: "1f9359219a92cdb1576f953db71ee993b8ef5f70",
      url: "https://github.com/OpenZeppelin/cairo-contracts/blob/1f9359219a92cdb1576f953db71ee993b8ef5f70/src/openzeppelin/token/erc721/library.cairo#L21-L34"},
  }),
  "erc721-reviewed-v1": Object.freeze({
    standard: "ERC721", version: 1, layout: "reviewed-key-or-data", readMethods: erc721ReadMethods,
    evidence: {kind: "existing_reviewed_receipts", fixture: "test/fixtures/realms-transfers.json",
      scope: "Frozen Realms Transfer receipts; other event types retain the existing reviewed decoder profile."},
  }),
  "erc1155-cairo1-oz-2": Object.freeze({
    standard: "ERC1155", version: 1, layout: "cairo1-keyed",
    readMethods: {balance: ["balance_of", "balanceOf"], operator: ["is_approved_for_all", "isApprovedForAll"], metadata: ["uri"]},
    evidence: {kind: "pinned_library_source", version: "v2.0.0", commit: oz2,
      url: `https://github.com/OpenZeppelin/cairo-contracts/blob/${oz2}/packages/token/src/erc1155/erc1155.cairo#L29-L82`},
  }),
});

function invalid(message, code = "INVALID_NFT_EVENT") {
  throw new ApiError(code, message);
}
export function nftFelt(value) {
  const n = BigInt(uint(value, 252));
  if (n >= STARKNET_FIELD_PRIME) invalid("Value exceeds the Starknet field.");
  return n.toString();
}
function sameFelt(a, b) { return nftFelt(a) === nftFelt(b); }
function height(value) { return Number(uint(value, 53)); }

/** A binding is evidence for a known NFT, never a classifier for a Transfer selector. */
export function selectNftDecoder(binding, context = {}) {
  if (!binding || typeof binding !== "object") invalid("Missing NFT decoder binding.", "UNKNOWN_NFT_DECODER");
  let selected = binding;
  if (binding.versions !== undefined) {
    if (!Array.isArray(binding.versions) || !binding.versions.length) invalid("Missing historical decoder intervals.", "UNKNOWN_NFT_DECODER");
    const intervals = binding.versions.map(v => ({...v, fromBlock: height(v.fromBlock),
      toBlock: v.toBlock == null ? Number.MAX_SAFE_INTEGER : height(v.toBlock)})).sort((a,b) => a.fromBlock-b.fromBlock);
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i].toBlock < intervals[i].fromBlock) invalid("Invalid historical decoder interval.", "UNKNOWN_NFT_DECODER");
      if (i && intervals[i].fromBlock <= intervals[i-1].toBlock) invalid("Historical decoder intervals overlap.", "UNKNOWN_NFT_DECODER");
    }
    const block = height(context.blockNumber);
    const version = intervals.find(v => v.fromBlock <= block && block <= v.toBlock);
    if (!version) invalid("No historical decoder at this block.", "UNKNOWN_NFT_DECODER");
    selected = {...binding, ...version};
  } else if (binding.fromBlock !== undefined || binding.toBlock !== undefined) {
    const block = height(context.blockNumber);
    if ((binding.fromBlock !== undefined && block < height(binding.fromBlock)) ||
      (binding.toBlock !== undefined && block > height(binding.toBlock))) invalid("Decoder outside historical interval.", "UNKNOWN_NFT_DECODER");
  }
  const adapter = NFT_ADAPTERS[selected.decoderId];
  if (!adapter) invalid(`Unknown NFT decoder ${selected.decoderId}.`, "UNKNOWN_NFT_DECODER");
  if (selected.standard !== adapter.standard) invalid("NFT standard differs from the selected adapter.", "NFT_STANDARD_MISMATCH");
  if (selected.classHash !== undefined && (context.classHash === undefined || !sameFelt(selected.classHash, context.classHash)))
    invalid("Historical contract class is missing or differs from decoder evidence.", "NFT_CLASS_MISMATCH");
  return selected;
}

function reader(values) {
  let offset = 0;
  const next = () => {
    if (offset >= values.length) invalid("Truncated NFT event.");
    return values[offset++];
  };
  const r = {
    addr: () => address(next()), u256: () => fromU256(next(), next()),
    bool: () => { const n = uint(next(), 1); return n === "1"; },
    length: () => Number(uint(next(), 32)), felt: () => nftFelt(next()),
    remaining: () => values.length - offset,
    end: () => { if (offset !== values.length) invalid("Unexpected NFT event fields."); },
  };
  return r;
}
function partition(keys, data, keyCount, dataCount) {
  if (keys.length !== keyCount || (dataCount !== null && data.length !== dataCount)) invalid("NFT event key/data layout differs from the bound adapter.");
}
function fixedFields(name, keys, data, adapter) {
  const fields = name === "ApprovalForAll" ? 3 : name === "BatchMetadataUpdate" ? 4 : name === "MetadataUpdate" ? 2 : 4;
  if (adapter.layout === "cairo0-data") partition(keys, data, 0, fields);
  else if (adapter.layout === "cairo1-keyed") partition(keys, data, name === "ApprovalForAll" ? 2 : fields, name === "ApprovalForAll" ? 1 : 0);
  else {
    const valid = (keys.length === 0 && data.length === fields) ||
      (keys.length === fields && data.length === 0) ||
      (name === "ApprovalForAll" && keys.length === 2 && data.length === 1);
    if (!valid) invalid("NFT event key/data layout differs from the reviewed adapter.");
  }
  return reader([...keys, ...data]);
}
function byteArray(r) {
  const words = r.length();
  if (words > r.remaining() - 2) invalid("Truncated URI ByteArray.");
  const chunks = [];
  for (let i = 0; i < words; i++) chunks.push(Buffer.from(BigInt(uint(r.felt(), 248)).toString(16).padStart(62,"0"),"hex"));
  const pending = BigInt(r.felt()), count = r.length();
  if (count > 30 || pending >= 1n << BigInt(8 * count)) invalid("Invalid URI pending word.");
  if (count) chunks.push(Buffer.from(pending.toString(16).padStart(count*2,"0"),"hex"));
  const bytes = Buffer.concat(chunks);
  let uri = null;
  try { uri = new TextDecoder("utf-8", {fatal:true}).decode(bytes); } catch { /* ByteArray bytes remain lossless. */ }
  return {uri, uriBytes: bytes.toString("hex")};
}
function transferAddresses(from, to) {
  if (BigInt(from) === 0n && BigInt(to) === 0n) invalid("Transfer has both sender and receiver zero.");
}

/** Decode one raw receipt event atomically; failures keep raw input and provenance. */
export function decodeNftEvent(raw, binding, context = {}) {
  let decoder = {id: binding?.decoderId ?? null, version: null};
  let savedRaw;
  try {
    savedRaw = structuredClone(raw);
    const selected = selectNftDecoder(binding, context), adapter = NFT_ADAPTERS[selected.decoderId];
    decoder = {id: selected.decoderId, version: adapter.version, standard: adapter.standard,
      classHash: selected.classHash ?? context.classHash ?? null, fromBlock: selected.fromBlock ?? null,
      toBlock: selected.toBlock ?? null, selectorPath: selected.selectorPath ?? [], evidence: adapter.evidence};
    if (!raw || !Array.isArray(raw.keys) || !raw.keys.length || !Array.isArray(raw.data)) invalid("Invalid NFT event envelope.");
    const collection = address(raw.from_address);
    if (collection !== address(binding.address)) invalid("Event source differs from bound collection.", "NFT_SOURCE_MISMATCH");
    raw.keys.forEach(nftFelt); raw.data.forEach(nftFelt);
    const path = selected.selectorPath ?? [];
    if (!Array.isArray(path) || path.length >= raw.keys.length || !path.every((key,i) => sameFelt(key,raw.keys[i]))) invalid("NFT component selector path differs from the bound adapter.");
    const leaf = raw.keys[path.length], name = names.get(nftFelt(leaf));
    const keys = raw.keys.slice(path.length + 1), data = raw.data;
    const supported = adapter.standard === "ERC721" ? ["Transfer","Approval","ApprovalForAll",...(adapter.layout === "reviewed-key-or-data" ? ["MetadataUpdate","BatchMetadataUpdate"] : [])] : ["TransferSingle","TransferBatch","ApprovalForAll","URI"];
    if (!supported.includes(name)) {
      if (!name && Array.isArray(selected.ignoredSelectors) && selected.ignoredSelectors.some(key => sameFelt(key, leaf)))
        return {status:"ignored",raw:savedRaw,decoder,events:[]};
      invalid(`Unsupported NFT event selector ${leaf}.`, "UNKNOWN_NFT_EVENT");
    }
    const base = {collection, standard: adapter.standard};
    let events;
    if (["Transfer","Approval","ApprovalForAll","MetadataUpdate","BatchMetadataUpdate"].includes(name)) {
      const r = fixedFields(name,keys,data,adapter);
      let event;
      if (name === "Transfer") { const from = r.addr(), to = r.addr(); transferAddresses(from,to); event = {type:"transfer",from,to,tokenId:r.u256()}; }
      else if (name === "Approval") event = {type:"approval",owner:r.addr(),spender:r.addr(),tokenId:r.u256()};
      else if (name === "ApprovalForAll") event = {type:"operator_approval",owner:r.addr(),operator:r.addr(),approved:r.bool()};
      else if (name === "MetadataUpdate") event = {type:"metadata_update",tokenId:r.u256()};
      else { const fromTokenId=r.u256(), toTokenId=r.u256(); if(BigInt(fromTokenId)>BigInt(toTokenId)) invalid("Metadata range is reversed."); event={type:"batch_metadata_update",fromTokenId,toTokenId}; }
      r.end(); events = [{...base,...event,subrecordIndex:0}];
    } else if (name === "URI") {
      partition(keys,data,2,null);
      const k = reader(keys), d = reader(data), tokenId = k.u256();
      const uri = byteArray(d); k.end(); d.end();
      events = [{...base,type:"metadata_update",tokenId,...uri,subrecordIndex:0}];
    } else {
      partition(keys,data,3,name === "TransferSingle" ? 4 : null);
      const k=reader(keys), d=reader(data), operator=k.addr(), from=k.addr(), to=k.addr();
      k.end();
      if (name === "TransferSingle") events=[{...base,type:"balance_transfer",operator,from,to,tokenId:d.u256(),quantity:d.u256(),subrecordIndex:0}];
      else {
        const count=d.length();
        if (count > Math.floor((d.remaining()-1)/2)) invalid("Truncated ERC1155 batch IDs.");
        const ids=Array.from({length:count},()=>d.u256()), valueCount=d.length();
        if (valueCount !== count || valueCount > Math.floor(d.remaining()/2)) invalid("ERC1155 batch array lengths differ.");
        events=ids.map((tokenId,subrecordIndex)=>({...base,type:"balance_transfer",operator,from,to,tokenId,quantity:d.u256(),subrecordIndex}));
      }
      d.end();
      // EIP-1155 permits from=to=0, value=0 to announce a token's existence.
      if (BigInt(from) === 0n && BigInt(to) === 0n && events.some(e=>BigInt(e.quantity)!==0n))
        invalid("ERC1155 zero-address existence announcement has a nonzero quantity.");
    }
    return {status:"decoded",raw:savedRaw,decoder,events};
  } catch (error) {
    return {status:"quarantined",raw:savedRaw ?? raw,decoder,events:[],error:{
      code:error.code ?? "INVALID_NFT_EVENT",message:error.message,
    }};
  }
}
