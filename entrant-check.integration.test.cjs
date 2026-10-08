"use strict";
const assert = require("node:assert/strict");
const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "entrant-check-extension.js"), "utf8");
class FakeNode {
  constructor() { this.value=""; this.innerHTML=""; this.textContent=""; this.events={}; this.open=false; this.nodes=new Map(); this.dataset={}; }
  addEventListener(name, fn) { this.events[name]=fn; }
  setAttribute() {}
  appendChild(node) { this.nodes.set(node.tag || String(this.nodes.size),node); }
  insertAdjacentElement(position,node) { this.inserted=node; }
  querySelector(selector) {
    if(!this.nodes.has(selector)) this.nodes.set(selector,new FakeNode());
    return this.nodes.get(selector);
  }
  querySelectorAll() { return []; }
  showModal() { this.open=true; }
  close() { this.open=false; this.events.close?.(); }
}
function fixture(controller=true, fetchImpl) {
  const doc=new FakeNode();doc.head=new FakeNode();doc.body=new FakeNode();
  doc.createElement=tag=>{ const node=new FakeNode();node.tag=tag;return node; };
  const storage={};const popup=[];
  const env={
    document:doc,location:{search:controller?"?controller=1&entrant_check=1":"",href:"https://example.com/viewer/"},
    window:{open:(...args)=>{popup.push(args);return {};}},
    localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;}},
    currentTournament:()=>({id:"t1",name:"Test tournament",players:[{player:"alice"},{player:"bob"}]}),
    render:()=>{},apiBase:"https://game-api.splinterlands.com",
    esc:v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),
    setStatus:message=>{env.status=message;}, fetch:fetchImpl, AbortController,DOMException,URL,URLSearchParams,Blob,
    setTimeout:()=>1,clearTimeout:()=>{}
  };
  new Function(...Object.keys(env),source)(...Object.values(env));
  const dialog=doc.body.nodes.get("dialog");
  if(dialog) {
    dialog.querySelector("#entrantScanMode").value="quick";
    dialog.querySelector("#entrantDays").value="90";
  }
  return {doc,dialog,storage,popup,button:doc.querySelector("#popoutControllerButton").inserted};
}
const auth=(name,key)=>({name,owner:{weight_threshold:1,key_auths:[[key,1]],account_auths:[]},active:{weight_threshold:1,key_auths:[],account_auths:[]},posting:{weight_threshold:1,key_auths:[],account_auths:[]}});
const response=result=>({ok:true,json:async()=>result});
async function run() {
  const main=fixture(false);
  main.button.events.click();
  assert.equal(main.dialog,undefined);
  assert.equal(main.popup.length,1);
  assert.match(main.popup[0][0],/controller=1/);
  assert.match(main.popup[0][0],/entrant_check=1/);
  console.log("PASS Broadcast window only opens host controls; no review dialog attached");
  let nodeFailures=0;
  const host=fixture(true,async(url,options)=>{
    if(url.includes("tournaments/find")) return response({players:[{player:"alice"},{player:"bob"}],num_players:2});
    if(url==="https://api.hive.blog"){nodeFailures++;throw new Error("Unavailable");}
    return response({result:[auth("alice","KEY"),auth("bob","KEY")]});
  });
  assert.equal(host.dialog.open,true);
  await host.dialog.querySelector("#entrantRun").events.click();
  assert.equal(nodeFailures,1);
  assert.match(host.dialog.querySelector("#entrantResults").innerHTML,/Shared public key/);
  assert.match(host.dialog.querySelector("#entrantScanStatus").textContent,/2\/2 authorities available/);
  assert.equal(host.dialog.querySelector("#entrantExport").disabled,false);
  console.log("PASS Host quick scan, node fallback, complete roster and export availability");
  const deep=fixture(true,async(url,options)=>{
    if(url.includes("tournaments/find")) return response({players:["alice","bob"],num_players:2});
    const request=JSON.parse(options.body);
    if(request.method.endsWith("get_accounts")) return response({result:[auth("alice","A"),auth("bob","B")]});
    return response({result:[[7000,{trx_id:"x",op_in_trx:0,timestamp:new Date().toISOString().replace("Z",""),op:["vote",{}]}]]});
  });
  deep.dialog.querySelector("#entrantScanMode").value="deep";
  await deep.dialog.querySelector("#entrantRun").events.click();
  assert.match(deep.dialog.querySelector("#entrantScanStatus").textContent,/Incomplete histories/);
  assert.match(deep.dialog.querySelector("#entrantResults").innerHTML,/does not confirm separate ownership/);
  console.log("PASS Truncated history is incomplete, never cleared");
  let signal;
  const cancelled=fixture(true,async(url,options)=>{
    if(url.includes("tournaments/find")) return response({players:["alice","bob"],num_players:2});
    const request=JSON.parse(options.body);
    if(request.method.endsWith("get_accounts")) return response({result:[auth("alice","A")]});
    signal=options.signal;
    return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Cancelled","AbortError")),{once:true}));
  });
  cancelled.dialog.querySelector("#entrantScanMode").value="deep";
  const pending=cancelled.dialog.querySelector("#entrantRun").events.click();
  for(let i=0;i<20&&!signal;i++) await Promise.resolve();
  assert.ok(signal);
  cancelled.dialog.querySelector("#entrantCancel").events.click();
  await pending;
  assert.match(cancelled.dialog.querySelector("#entrantScanStatus").textContent,/Scan cancelled/);
  assert.match(cancelled.dialog.querySelector("#entrantScanStatus").textContent,/Missing accounts: bob/);
  assert.equal(cancelled.dialog.querySelector("#entrantRun").disabled,false);
  console.log("PASS Cancellation preserves partial evidence and missing-account coverage");
  const failed=fixture(true,async()=>({ok:false,status:503}));
  await failed.dialog.querySelector("#entrantRun").events.click();
  assert.match(failed.dialog.querySelector("#entrantScanStatus").textContent,/Could not load entrant roster/);
  assert.equal(failed.dialog.querySelector("#entrantRun").disabled,false);
  console.log("PASS Roster failure is explicit and can be retried");
  const resultNode=host.dialog.querySelector("#entrantResults");
  const input={dataset:{review:"note"},value:"Owner confirmed by host",closest:()=>({dataset:{pair:"alice|bob"}})};
  resultNode.events.input({target:input});
  assert.match(host.storage["phoenix-entrant-reviews-v1"],/Owner confirmed by host/);
  console.log("PASS Review notes are saved locally");
  console.log("6 integration checks passed");
}
run().catch(error=>{ console.error(error); process.exitCode=1; });
