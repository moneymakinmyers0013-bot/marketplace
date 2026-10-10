import { test } from "node:test";
import assert from "node:assert/strict";
import { address, MAX_U256, u256Felts } from "../src/domain.mjs";
import { NFT_SELECTORS } from "../src/nft-decoders.mjs";
import { replayNftJournal } from "../src/nft-projections.mjs";

const multi = {address:"0x9",standard:"ERC1155",decoderId:"erc1155-cairo1-oz-2"};
const single = {address:"0xa",standard:"ERC721",decoderId:"erc721-cairo1-oz-2"};
function row(name, keys, data, blockNumber = 1, extra = {}) {
  return {chain:"LOCAL",blockNumber,blockHash:`0x${blockNumber+100}`,transactionHash:`0x${blockNumber+200}`,
    transactionIndex:0,eventIndex:0,canonical:true,
    raw:{from_address:"0x9",keys:[NFT_SELECTORS[name],...keys],data},...extra};
}
const move = (from,to,quantity,block=1,extra={}) => row("TransferSingle",["3",from,to],["5","0",...u256Felts(quantity)],block,extra);
const token = (from,to,block=1,extra={}) => row("Transfer",[from,to,"5","0"],[],block,{
  ...extra,raw:{from_address:"0xa",keys:[NFT_SELECTORS.Transfer,from,to,"5","0"],data:[]},
});
const balance = (state,account) => state.holdings.find(h=>h.account===address(account))?.balance ?? "0";

test("ERC1155 mint, transfer, burn and repeated batch IDs preserve exact holdings and supply", () => {
  const big = 9007199254740993n;
  const rows = [move("0","2",big),
    row("TransferBatch",["3","2","4"],["2","5","0","5","0","2","7","0","9","0"],2),
    move("4","0",3n,3)];
  const state = replayNftJournal(rows,[multi]);
  assert.equal(balance(state,"2"),(big-16n).toString());
  assert.equal(balance(state,"4"),"13");
  assert.equal(state.tokens[0].supply,(big-3n).toString());
  assert.deepEqual(state.activity.map(e=>e.subrecordIndex),[0,0,1,0]);
  assert.equal(new Set(state.activity.map(e=>e.id)).size,4);
  assert.ok(state.holdings.every(h=>h.standard==="ERC1155" && h.settlementEligible===false));
  assert.equal(state.collections[0].coverage,"event_replay");
  assert.equal(state.quarantines.length,0);
});

test("reordered repeated deliveries and fresh process restart rebuild identical projections", () => {
  const rows=[move("0","2",100n),move("2","4",12n,2),move("4","0",2n,3)];
  const one = replayNftJournal(rows,[multi]);
  const restarted = replayNftJournal(JSON.parse(JSON.stringify([rows[2],rows[1],rows[0],rows[1]])),[multi]);
  assert.deepEqual(restarted,one);
  assert.equal(one.rawEvents.length,3);
});

test("orphaned suffix is retained as raw evidence and canonical reorg rebuild replaces balances", () => {
  const mint=move("0","2",20n), orphan=move("2","4",12n,2,{canonical:false});
  const replacement=move("2","6",7n,2,{blockHash:"0x999",transactionHash:"0x998"});
  const state=replayNftJournal([mint,orphan,replacement],[multi]);
  assert.equal(balance(state,"2"),"13");
  assert.equal(balance(state,"4"),"0");
  assert.equal(balance(state,"6"),"7");
  assert.equal(state.rawEvents.find(e=>!e.canonical).status,"orphan");
  assert.equal(state.activity.length,2);
});

test("underflow or overflow quarantines only that collection and withholds its entire projection", () => {
  for(const rows of [
    [move("0","2",5n),move("2","4",6n,2)],
    [move("0","2",MAX_U256),move("0","2",1n,2)],
  ]) {
    const state = replayNftJournal([...rows,token("0","8",1,{eventIndex:1})],[multi,single]);
    assert.equal(state.tokens.length,1);
    assert.equal(state.tokens[0].collection,address("0xa"));
    assert.equal(state.quarantines[0].collection,address("0x9"));
    assert.equal(state.collections.find(c=>c.collection===address("0x9")).coverage,"quarantined");
    assert.equal(state.rawEvents.length,3);
  }
});

test("malformed later batch leaves no partial collection balances", () => {
  const broken=row("TransferBatch",["3","2","4"],["2","5","0","6","0","1","7","0"],2);
  const state=replayNftJournal([move("0","2",20n),broken],[multi]);
  assert.deepEqual(state.tokens,[]);
  assert.deepEqual(state.holdings,[]);
  assert.equal(state.quarantines.length,1);
  assert.equal(state.rawEvents[1].status,"quarantined");
});

test("ERC721 ownership, balances and approvals reset across self transfer, burn and remint", () => {
  const approval=row("Approval",[],[],2,{raw:{from_address:"0xa",keys:[NFT_SELECTORS.Approval,"2","3","5","0"],data:[]}});
  const state=replayNftJournal([token("0","2"),approval,token("2","2",3),token("2","0",4),token("0","4",5)],[single]);
  assert.equal(state.tokens[0].owner,address("4"));
  assert.equal(state.tokens[0].burned,false);
  assert.equal(state.tokens[0].supply,"1");
  assert.equal(balance(state,"2"),"0");
  assert.equal(balance(state,"4"),"1");
  assert.equal(state.approvals[0].spender,address("0"));
});

test("ERC721 replay does not fabricate missing ownership or accept mismatched owners", () => {
  for(const rows of [[token("2","4")],[token("0","2"),token("3","4",2)],[token("0","2"),token("0","4",2)]]) {
    const state=replayNftJournal(rows,[single]);
    assert.equal(state.tokens.length,0);
    assert.equal(state.quarantines.length,1);
  }
});

test("a self transfer still proves sufficient ERC1155 balance and preserves maximum value", () => {
  const state=replayNftJournal([move("0","2",MAX_U256),move("2","2",MAX_U256,2)],[multi]);
  assert.equal(balance(state,"2"),MAX_U256.toString());
  assert.equal(state.quarantines.length,0);
  assert.equal(replayNftJournal([move("0","2",5n),move("2","2",6n,2)],[multi]).quarantines.length,1);
});

test("ERC1155 event-derived aggregate supply is not assumed to have a standard u256 totalSupply cap", () => {
  const state=replayNftJournal([move("0","2",MAX_U256),move("0","4",MAX_U256,2)],[multi]);
  assert.equal(state.quarantines.length,0);
  assert.equal(balance(state,"2"),MAX_U256.toString());
  assert.equal(balance(state,"4"),MAX_U256.toString());
  assert.equal(state.tokens[0].supply,(2n*MAX_U256).toString());
  assert.equal(state.tokens[0].supplyEvidence,"sum_of_transfer_events");
});

test("conflicting duplicate evidence quarantines the source rather than selecting a delivery", () => {
  const mint=move("0","2",5n), conflicting=move("0","2",6n);
  const state=replayNftJournal([mint,conflicting],[multi]);
  assert.equal(state.tokens.length,0);
  assert.equal(state.quarantines[0].code,"NFT_JOURNAL_CONFLICT");
});

test("metadata and operator approvals retain standard, decoder provenance and separate source state", () => {
  const approval=row("ApprovalForAll",["2","3"],["1"],2);
  const uri=row("URI",["5","0"],["0","0x697066733a2f2f78","8"],3);
  const state=replayNftJournal([move("0","2",1n),approval,uri],[multi]);
  assert.equal(state.operators[0].approved,true);
  assert.equal(state.metadataJobs[0].uri,"ipfs://x");
  assert.equal(state.metadataJobs[0].standard,"ERC1155");
  assert.equal(state.decoderVersions[0].id,"erc1155-cairo1-oz-2");
  assert.equal(state.activity[0].provenance.decoder.id,"erc1155-cairo1-oz-2");
});

test("unknown bindings and selectors report actionable coverage while preserving their raw receipt", () => {
  const unknown=row("TransferSingle",["3","0","2"],["5","0","1","0"]);
  assert.equal(replayNftJournal([unknown],[]).quarantines[0].code,"MISSING_NFT_BINDING");
  const unsupported={...unknown,raw:{...unknown.raw,keys:["0xdead"]}};
  const state=replayNftJournal([unsupported],[multi]);
  assert.deepEqual(state.rawEvents[0].raw,unsupported.raw);
  assert.equal(state.quarantines[0].code,"UNKNOWN_NFT_EVENT");
  assert.equal(state.collections[0].settlementEligible,false);
});

test("replay refuses multiple chains or conflicting canonical block identities", () => {
  assert.throws(()=>replayNftJournal([move("0","2",1n),move("0","2",1n,2,{chain:"SN_SEPOLIA"})],[multi]),/one chain/i);
  assert.throws(()=>replayNftJournal([move("0","2",1n),move("0","4",1n,1,{blockHash:"0x999",eventIndex:1})],[multi]),/multiple block hashes/i);
});

test("ERC1155 zero-balance announcements retain token existence and zero supply without holdings", () => {
  const state=replayNftJournal([move("0","0",0n)],[multi]);
  assert.equal(state.quarantines.length,0);
  assert.equal(state.tokens[0].supply,"0");
  assert.equal(state.holdings.length,0);
  assert.equal(state.activity.length,1);
});
