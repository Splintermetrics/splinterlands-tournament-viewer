"use strict";
const assert = require("node:assert/strict");
const core = require("./entrant-check-extension.js");
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
const auth = (keys = [], delegated = [], threshold = 1) => ({ key_auths: keys, account_auths: delegated, weight_threshold: threshold });
const account = (name, key, threshold = 1) => ({ name, owner: auth([[key, 1]], [], threshold), active: auth(), posting: auth() });
const transfer = (from, to, day, index) => ({ id: String(index), transaction: String(index), from, to, timestamp: "2026-10-" + day + "T12:00:00Z", amount: "1.000 HIVE" });
test("Full roster takes precedence over match participants", () => assert.deepEqual(core.entrants({ players: [{player:"@Alice"},{player:"bob"},{player:"alice"}], matches:[{player_1:"charlie"}]}), ["alice", "bob"]));
test("Match fallback ignores BYE", () => assert.deepEqual(core.entrants({ matches: [{player_1:"alice",player_2:"BYE"}]}), ["alice"]));
test("Shared owner key gives explicit strong connection", () => assert.equal(core.analyze(["alice","bob"],[account("alice","KEY"),account("bob","KEY")],[],new Set())[0].priority,3));
test("Partial signatures do not imply full control", () => {
  const e=core.authorityEvidence(account("alice","KEY",2),account("bob","KEY"),new Set())[0];
  assert.equal(e.priority,2); assert.match(e.text,/additional signatures/);
});
test("Posting key is context only", () => {
  const a=account("alice","A"),b=account("bob","B");
  a.posting=auth([["POST",1]]);b.posting=auth([["POST",1]]);
  assert.equal(core.analyze(["alice","bob"],[a,b],[],new Set())[0].priority,1);
});
test("A shared recovery account alone does not flag entrants", () => {
  const a=account("alice","A"),b=account("bob","B");a.recovery_account=b.recovery_account="steemmonsters";
  assert.equal(core.analyze(["alice","bob"],[a,b],[],new Set()).length,0);
});
test("Shared posting service alone does not flag entrants", () => {
  const a=account("alice","A"),b=account("bob","B");a.posting=b.posting=auth([], [["service",1]]);
  assert.equal(core.analyze(["alice","bob"],[a,b],[],new Set()).length,0);
});
test("Direct active authority includes threshold context", () => {
  const a=account("alice","A"),b=account("bob","B");a.active=auth([], [["bob",1]],2);
  const e=core.authorityEvidence(a,b,new Set())[0];assert.equal(e.priority,2);assert.match(e.text,/partial authority/);
});
test("Ignored shared administrator does not generate a finding", () => {
  const a=account("alice","A"),b=account("bob","B");a.active=b.active=auth([], [["service",1]]);
  assert.equal(core.analyze(["alice","bob"],[a,b],[],new Set(["service"])).length,0);
});
test("Transfers deduplicate across both histories and exclude old operations", () => {
  const op={trx_id:"abc",op_in_trx:0,timestamp:"2026-10-02T12:00:00",op:["transfer",{from:"alice",to:"bob",amount:"1.000 HIVE"}]};
  const old={...op,trx_id:"old",timestamp:"2026-08-01T12:00:00"};
  assert.equal(core.parseTransfers([[1,op],[2,op],[3,old]],Date.parse("2026-10-01")).length,1);
});
test("Nonfinancial operations and zero transfers are ignored", () => {
  assert.equal(core.parseTransfers([[1,{trx_id:"1",timestamp:"2026-10-02",op:["transfer",{from:"a",to:"b",amount:"0.000 HIVE"}]}],[2,{trx_id:"2",timestamp:"2026-10-02",op:["vote",{}]}]],0).length,0);
});
test("Recurring transfers need at least two distinct days", () => {
  const txs=[1,2,3].map(i=>transfer("alice","bob","02",i));
  assert.equal(core.financialEvidence("alice","bob",txs,new Set()).length,0);
});
test("Recurring direct transfers are supported by transaction evidence", () => {
  const txs=[transfer("alice","bob","02",1),transfer("alice","bob","03",2),transfer("bob","alice","04",3)];
  assert.equal(core.financialEvidence("alice","bob",txs,new Set())[0].transactions.length,3);
});
test("Shared repeated recipient is detected, excluded services are suppressed", () => {
  const txs=["alice","bob"].flatMap((n,j)=>["02","03","04"].map((d,i)=>transfer(n,"recipient",d,j*3+i)));
  assert.equal(core.financialEvidence("alice","bob",txs,new Set())[0].type,"common_recipient");
  assert.equal(core.financialEvidence("alice","bob",txs,new Set(["recipient"])).length,0);
});
test("Shared repeated funding is distinguished from withdrawals", () => {
  const txs=["alice","bob"].flatMap((n,j)=>["02","03","04"].map((d,i)=>transfer("funder",n,d,j*3+i)));
  assert.equal(core.financialEvidence("alice","bob",txs,new Set())[0].type,"common_funder");
});
test("Linked pairs are not promoted into a single owner cluster", () => {
  const a=account("alice","A"),b=account("bob","B"),c=account("charlie","C");
  b.active=auth([], [["alice",1],["charlie",1]]);
  const pairs=core.analyze(["alice","bob","charlie"],[a,b,c],[],new Set());
  assert.equal(pairs.length,2);assert.ok(!pairs.some(p=>p.id==="alice|charlie"));
});

const gameTx = (type, data, day = "02", key = "a", actors = ["alice"]) => [1, {
  trx_id: key.repeat(40), op_in_trx: 0, timestamp: "2026-10-" + day + "T12:00:00",
  op: ["custom_json", { id: "sm_" + type, json: JSON.stringify(data), required_auths: actors, required_posting_auths: [] }]
}];
test("Splinterboost is ignored by default", () => assert.ok(core.defaultServices.includes("splinterboost")));
test("DEC and SPS transfers parse independently of HIVE transfers", () => {
  const rows = [gameTx("token_transfer", {to:"bob",qty:15,token:"DEC"}), gameTx("token_transfer", {to:"bob",qty:2,token:"SPS"}, "03", "b")];
  const ops = core.parseGameOperations(rows, Date.parse("2026-10-01"));
  assert.equal(ops.length,2); assert.equal(ops[0].source,"splinterlands"); assert.equal(ops[1].amount,"2 SPS");
});
test("Malformed JSON, unsupported tokens, bridges and ambiguous actors are excluded", () => {
  const rows = [gameTx("token_transfer",{to:"bob",qty:2,token:"CREDITS"}),gameTx("token_transfer",{to:"bob",qty:2,token:"DEC",type:"withdraw"}),gameTx("token_transfer",{to:"bob",qty:2,token:"DEC"},"03","b",["alice","charlie"])];
  rows.push([1,{trx_id:"c".repeat(40),timestamp:"2026-10-02",op:["custom_json",{id:"sm_token_transfer",json:"{",required_auths:["alice"]}]}]);
  assert.equal(core.parseGameOperations(rows,0).length,0);
});
test("Game transfers require a matching successful game receipt", () => {
  const data={to:"bob",qty:2,token:"DEC"};
  const op=core.parseGameOperations([gameTx("token_transfer",data)],0)[0];
  const receipt={id:op.transaction,type:"token_transfer",player:"alice",data:JSON.stringify(data),success:true,error:null};
  assert.equal(core.confirmGameOperation(op,receipt),"confirmed");
  assert.equal(core.confirmGameOperation(op,{...receipt,success:false}),"rejected");
  assert.equal(core.confirmGameOperation(op,{...receipt,player:"charlie"}),"unverified");
  assert.equal(core.confirmGameOperation(op,{...receipt,data:JSON.stringify({...data,qty:3})}),"unverified");
  assert.equal(core.confirmGameOperation(op,{...receipt,success:undefined}),"unverified");
});
test("Card gifts and delegations retain UID evidence", () => {
  const rows=[gameTx("gift_cards",{to:"bob",cards:["C1","C2"]}),gameTx("delegate_cards",{to:"bob",cards:["C1"]},"03","b")];
  const ops=core.parseGameOperations(rows,0);
  assert.equal(ops.length,2);assert.deepEqual(ops[0].cards,["C1","C2"]);
  const pair=core.analyze(["alice","bob"],[],ops,new Set())[0];
  assert.equal(pair.evidence[0].type,"direct_cards");assert.match(pair.evidence[0].text,/recur/);
});
test("A single card loan is only context and Splinterboost connections are suppressed", () => {
  const ops=core.parseGameOperations([gameTx("delegate_cards",{to:"bob",cards:["C1"]})],0);
  assert.equal(core.cardEvidence("alice","bob",ops,new Set())[0].priority,1);
  const fromBoost=ops.map(op=>({...op,from:"splinterboost"}));
  assert.equal(core.cardEvidence("splinterboost","bob",fromBoost,new Set(core.defaultServices)).length,0);
});
test("Card receipts must match the full requested UID list", () => {
  const data={to:"bob",cards:["C1","C2"]};
  const op=core.parseGameOperations([gameTx("gift_cards",data)],0)[0];
  const receipt={id:op.transaction+"-0",type:"sm_gift_cards",player:"alice",data,success:true};
  assert.equal(core.confirmGameOperation(op,receipt),"confirmed");
  assert.equal(core.confirmGameOperation(op,{...receipt,data:{to:"bob",cards:["C1"]}}),"unverified");
});
test("Hive and game transfer counts cannot combine into a recurring pattern", () => {
  const game=core.parseGameOperations([gameTx("token_transfer",{to:"bob",qty:2,token:"DEC"})],0);
  const hive=[transfer("alice","bob","03",1),transfer("alice","bob","04",2)];
  const evidence=core.financialEvidence("alice","bob",[...game,...hive],new Set());
  assert.equal(evidence.length,1);assert.equal(evidence[0].priority,1);
});

console.log(passed + " checks passed");
