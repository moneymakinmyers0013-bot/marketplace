import { address, uint, MAX_U256, ApiError } from "./domain.mjs";
import { decodeNftEvent, nftFelt } from "./nft-decoders.mjs";

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = values => [...values].sort((a,b) => compare(a.id,b.id));
const hash = value => `0x${BigInt(nftFelt(value)).toString(16)}`;
const safeIndex = value => Number(uint(value,53));
function fail(code,message) { throw new ApiError(code,message); }
export function nftEventIdentity(row) {
  if (!["LOCAL","SN_MAIN","SN_SEPOLIA"].includes(row.chain)) fail("INVALID_CHAIN","Unknown NFT journal chain.");
  return [row.chain,hash(row.blockHash),hash(row.transactionHash),safeIndex(row.eventIndex)].join(":");
}
function provenance(row, decoder) {
  return {chain:row.chain,blockNumber:safeIndex(row.blockNumber),blockHash:hash(row.blockHash),
    transactionHash:hash(row.transactionHash),transactionIndex:safeIndex(row.transactionIndex),
    eventIndex:safeIndex(row.eventIndex),decoder};
}
function sourceState() {
  return {tokens:new Map(),holdings:new Map(),approvals:new Map(),operators:new Map(),
    metadataJobs:new Map(),activity:new Map()};
}
function valuesBase(e,p) {
  return {collection:e.collection,standard:e.standard,coverage:"event_replay",
    settlementEligible:false,updatedAt:p};
}
function holdingKey(e,account) { return `${e.collection}:${e.tokenId}:${account}`; }
function holdingBalance(state,e,account) {
  return BigInt(state.holdings.get(holdingKey(e,account))?.balance ?? "0");
}
function putBalance(state,e,account,value,p) {
  if (BigInt(account) === 0n) return;
  if (value < 0n) fail("NFT_BALANCE_UNDERFLOW","Transfer exceeds recorded NFT holdings; history or pinned balance evidence is missing.");
  if (value > MAX_U256) fail("NFT_BALANCE_OVERFLOW","NFT account balance exceeds u256.");
  const id=holdingKey(e,account);
  state.holdings.set(id,{id,...valuesBase(e,p),tokenId:e.tokenId,account,balance:value.toString()});
}
function project(state,e,p,eventId) {
  const id=`${e.collection}:${e.tokenId}`;
  if (e.type === "transfer") {
    const previous=state.tokens.get(id), fromZero=BigInt(e.from)===0n, toZero=BigInt(e.to)===0n;
    if (fromZero && previous && !previous.burned) fail("NFT_DUPLICATE_MINT","ERC721 mint reuses a live token ID.");
    if (!fromZero && (!previous || previous.burned)) fail("MISSING_NFT_HISTORY","ERC721 transfer has no recorded live owner; replay requires earlier mint or pinned state evidence.");
    if (!fromZero && previous.owner !== e.from) fail("NFT_OWNER_MISMATCH","ERC721 sender differs from the recorded owner.");
    if (!fromZero) putBalance(state,e,e.from,holdingBalance(state,e,e.from)-1n,p);
    if (!toZero) putBalance(state,e,e.to,holdingBalance(state,e,e.to)+1n,p);
    state.tokens.set(id,{id,...valuesBase(e,p),tokenId:e.tokenId,owner:e.to,burned:toZero,
      supply:toZero ? "0" : "1",firstSeenBlock:previous?.firstSeenBlock ?? p.blockNumber});
    state.approvals.set(id,{id,...valuesBase(e,p),tokenId:e.tokenId,spender:address("0")});
  } else if (e.type === "balance_transfer") {
    const previous=state.tokens.get(id), quantity=BigInt(uint(e.quantity)), fromZero=BigInt(e.from)===0n, toZero=BigInt(e.to)===0n;
    const supply=BigInt(previous?.supply ?? "0") + (fromZero ? quantity : 0n) - (toZero ? quantity : 0n);
    if (supply < 0n) fail("NFT_SUPPLY_UNDERFLOW","ERC1155 burn exceeds replayed supply; earlier history or pinned evidence is missing.");
    if (!fromZero) putBalance(state,e,e.from,holdingBalance(state,e,e.from)-quantity,p);
    if (!toZero) putBalance(state,e,e.to,holdingBalance(state,e,e.to)+quantity,p);
    state.tokens.set(id,{id,...valuesBase(e,p),tokenId:e.tokenId,supply:supply.toString(),supplyEvidence:"sum_of_transfer_events",
      firstSeenBlock:previous?.firstSeenBlock ?? p.blockNumber});
  } else if (e.type === "approval") {
    const token=state.tokens.get(id);
    if (!token || token.burned || token.owner !== e.owner) fail("NFT_APPROVAL_OWNER_MISMATCH","ERC721 approval lacks matching recorded ownership.");
    state.approvals.set(id,{id,...valuesBase(e,p),tokenId:e.tokenId,owner:e.owner,spender:e.spender});
  } else if (e.type === "operator_approval") {
    const key=`${e.collection}:${e.owner}:${e.operator}`;
    state.operators.set(key,{id:key,...valuesBase(e,p),owner:e.owner,operator:e.operator,approved:e.approved});
  } else if (e.type === "metadata_update" || e.type === "batch_metadata_update") {
    const key=e.type === "metadata_update" ? id : `${e.collection}:${e.fromTokenId}-${e.toTokenId}`;
    state.metadataJobs.set(key,{id:key,...e,...valuesBase(e,p),state:"pending"});
  } else fail("UNKNOWN_NFT_PROJECTION",`Unsupported NFT projection ${e.type}.`);
  const activityId=`${eventId}:${e.subrecordIndex}`;
  state.activity.set(activityId,{...e,id:activityId,provenance:p,settlementEligible:false});
}

function signature(row) {
  // RPCs may represent identical felts in decimal, hex, or padded hex.
  let raw=row.raw;
  try { raw={...raw,from_address:address(raw.from_address),keys:raw.keys.map(nftFelt),data:raw.data.map(nftFelt)}; } catch { /* Preserve invalid payload unchanged for diagnosis. */ }
  return JSON.stringify({raw,blockNumber:row.blockNumber,transactionIndex:row.transactionIndex,
    classHash:row.classHash == null ? null : nftFelt(row.classHash),canonical:row.canonical});
}

/**
 * Pure, bounded journal rebuild, suitable for a separate durable database generation.
 * The caller supplies verified canonical flags and receipt positions; this function
 * does not establish RPC history completeness or pinned-chain reconciliation.
 * A collection failure withholds all its projections, including earlier successes.
 */
export function replayNftJournal(rows, bindings, {generation="nft-replay-v1"} = {}) {
  if (!Array.isArray(rows) || !Array.isArray(bindings)) fail("INVALID_NFT_JOURNAL","NFT replay requires rows and bindings arrays.");
  if (new Set(rows.map(row=>row.chain)).size > 1) fail("NFT_JOURNAL_CHAIN_MISMATCH","One NFT projection generation must belong to one chain.");
  const profiles=new Map(), states=new Map(), coverage=new Map(), bad=new Set(), quarantines=[];
  for (const binding of bindings) {
    const collection=address(binding.address);
    if (profiles.has(collection)) fail("DUPLICATE_NFT_BINDING","Multiple NFT bindings for the same collection.");
    profiles.set(collection,binding); states.set(collection,sourceState());
    coverage.set(collection,{collection,standard:binding.standard,coverage:"event_replay",settlementEligible:false});
  }
  const quarantine=(collection,error,eventId,decoder=null) => {
    bad.add(collection);
    quarantines.push({collection,code:error.code ?? "INVALID_NFT_EVENT",message:error.message,eventId,decoder});
    const record=coverage.get(collection) ?? {collection,standard:null,settlementEligible:false};
    coverage.set(collection,{...record,coverage:"quarantined"});
  };
  const ordered=rows.map(row => ({...row,blockNumber:safeIndex(row.blockNumber),
    transactionIndex:safeIndex(row.transactionIndex),eventIndex:safeIndex(row.eventIndex)}))
    .sort((a,b) => a.blockNumber-b.blockNumber || a.transactionIndex-b.transactionIndex || a.eventIndex-b.eventIndex ||
      compare(nftEventIdentity(a),nftEventIdentity(b)) || compare(signature(a),signature(b)));
  const rawEvents=new Map(), seen=new Map(), blocks=new Map(), versions=new Map();
  for (const row of ordered) {
    if (typeof row.canonical !== "boolean") fail("INVALID_NFT_JOURNAL","NFT replay requires an explicit canonical flag.");
    const eventId=nftEventIdentity(row), collection=address(row.raw?.from_address), payload=signature(row);
    if (seen.has(eventId)) {
      const prior=seen.get(eventId);
      if (prior.payload !== payload) {
        const error={code:"NFT_JOURNAL_CONFLICT",message:"Duplicate receipt identity has conflicting raw evidence or provenance."};
        quarantine(collection,error,eventId);
        if (prior.collection !== collection) quarantine(prior.collection,error,eventId);
        const saved=rawEvents.get(eventId); saved.status="quarantined";
        saved.conflictingDeliveries ??= []; saved.conflictingDeliveries.push(structuredClone(row));
      }
      continue;
    }
    seen.set(eventId,{payload,collection});
    const saved={id:eventId,collection,canonical:row.canonical,raw:structuredClone(row.raw),
      provenance:provenance(row,null),status:row.canonical ? "pending" : "orphan"};
    rawEvents.set(eventId,saved);
    if (!row.canonical) continue;
    const blockKey=`${row.chain}:${row.blockNumber}`, previousHash=blocks.get(blockKey);
    if (previousHash && previousHash !== hash(row.blockHash)) fail("NFT_JOURNAL_FORK","Journal marks multiple block hashes canonical at the same height.");
    blocks.set(blockKey,hash(row.blockHash));
    const binding=profiles.get(collection);
    if (!binding) {
      saved.status="quarantined";
      quarantine(collection,{code:"MISSING_NFT_BINDING",message:"No evidence-backed NFT decoder binding for this collection."},eventId);
      continue;
    }
    const result=decodeNftEvent(row.raw,binding,{blockNumber:row.blockNumber,classHash:row.classHash});
    saved.status=result.status; saved.decoder=result.decoder; saved.events=result.events;
    saved.provenance=provenance(row,result.decoder);
    if (result.status === "quarantined") {
      saved.error=result.error; quarantine(collection,result.error,eventId,result.decoder); continue;
    }
    versions.set(`${collection}:${JSON.stringify(result.decoder)}`,{collection,...result.decoder});
    if (result.status === "ignored" || bad.has(collection)) continue;
    try {
      for (const event of result.events) project(states.get(collection),event,saved.provenance,eventId);
    } catch (error) {
      saved.status="quarantined"; saved.error={code:error.code,message:error.message};
      quarantine(collection,error,eventId,result.decoder);
    }
  }
  const output={generation,collections:[...coverage.values()].sort((a,b)=>compare(a.collection,b.collection)),
    tokens:[],holdings:[],approvals:[],operators:[],metadataJobs:[],activity:[],
    quarantines:quarantines.sort((a,b)=>compare(`${a.collection}:${a.eventId}:${a.code}`,`${b.collection}:${b.eventId}:${b.code}`)),
    rawEvents:[...rawEvents.values()],decoderVersions:[...versions.values()].sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b)))};
  for (const [collection,state] of states) {
    if (bad.has(collection)) continue;
    for (const field of ["tokens","holdings","approvals","operators","metadataJobs","activity"]) {
      output[field].push(...state[field].values());
    }
  }
  output.holdings=output.holdings.filter(h=>BigInt(h.balance)>0n);
  for (const field of ["tokens","holdings","approvals","operators","metadataJobs","activity"]) output[field]=sorted(output[field]);
  output.activity.sort((a,b)=>a.provenance.blockNumber-b.provenance.blockNumber ||
    a.provenance.transactionIndex-b.provenance.transactionIndex || a.provenance.eventIndex-b.provenance.eventIndex ||
    a.subrecordIndex-b.subrecordIndex || compare(a.id,b.id));
  return output;
}
