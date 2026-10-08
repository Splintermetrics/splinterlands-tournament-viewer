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
console.log(passed + " checks passed");
