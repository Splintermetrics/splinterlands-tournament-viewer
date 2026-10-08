(() => {
  "use strict";
  const defaultServices = ["steemmonsters", "splinterlands", "hive-engine", "market", "peakmonsters", "splinterboost", "sl-hive", "sl-bsc", "sl-eth", "bittrex", "binance", "blocktrades"];
  const normalize = value => String(value || "").trim().replace(/^@/, "").toLowerCase();
  function entrants(tournament) {
    const roster = (tournament.players || []).map(p => normalize(typeof p === "string" ? p : p.player || p.name)).filter(Boolean);
    const names = roster.length ? roster : (tournament.matches || []).flatMap(m => [normalize(m.player_1), normalize(m.player_2)]).filter(Boolean);
    return [...new Set(names.filter(n => n !== "bye"))].sort();
  }
  function authorityEvidence(a, b, ignored) {
    const evidence = [];
    const keys = account => ["owner", "active", "posting"].flatMap(role =>
      (account[role]?.key_auths || []).filter(([, weight]) => Number(weight) > 0).map(([key, weight]) => ({
        role, key, weight: Number(weight), threshold: Number(account[role].weight_threshold)
      })));
    for (const left of keys(a)) for (const right of keys(b)) {
      if (left.key !== right.key) continue;
      const sufficient = left.weight >= left.threshold && right.weight >= right.threshold;
      const strong = left.role !== "posting" && right.role !== "posting";
      evidence.push({
        type: "shared_key", priority: strong ? (sufficient ? 3 : 2) : 1,
        text: "Shared public key: " + a.name + " " + left.role + " / " + b.name + " " + right.role +
          (sufficient ? " (meets both authority thresholds)." : " (additional signatures may be required)."),
        key: left.key
      });
    }
    for (const [left, right] of [[a, b], [b, a]]) for (const role of ["owner", "active", "posting"]) {
      const auth = (left[role]?.account_auths || []).find(([name, weight]) => name === right.name && Number(weight) > 0);
      if (auth && !ignored.has(right.name)) evidence.push({
        type: "direct_authority", priority: role === "posting" ? 1 : (Number(auth[1]) >= Number(left[role].weight_threshold) ? 3 : 2),
        text: right.name + " is listed in " + left.name + "'s " + role + " authority" +
          (Number(auth[1]) >= Number(left[role].weight_threshold) ? " (meets the threshold)." : " (partial authority).")
      });
    }
    for (const role of ["owner", "active"]) {
      const left = (a[role]?.account_auths || []).filter(([, w]) => Number(w) > 0).map(([n]) => n);
      const right = (b[role]?.account_auths || []).filter(([, w]) => Number(w) > 0).map(([n]) => n);
      for (const name of new Set(left.filter(n => right.includes(n) && !ignored.has(n)))) {
        evidence.push({ type: "shared_authority", priority: 2, text: "Both list " + name + " in their " + role + " authorities; shared administration is possible." });
      }
    }
    return evidence;
  }
  function parseTransfers(history, cutoff) {
    const transfers = new Map();
    for (const [, item] of history) {
      const timestamp = item.timestamp?.endsWith("Z") ? item.timestamp : item.timestamp + "Z";
      if (!Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) < cutoff) continue;
      const op = Array.isArray(item.op) ? item.op : [String(item.op?.type || "").replace(/_operation$/, ""), item.op?.value];
      if (op[0] !== "transfer" || !op[1]) continue;
      const amount = String(op[1].amount || "");
      if (!/^[0-9.]+ (HIVE|HBD)$/.test(amount) || Number(amount.split(" ")[0]) <= 0) continue;
      const id = item.trx_id + ":" + item.op_in_trx;
      // The same operation appears in both participants' account histories.
      transfers.set(id, { id, transaction: item.trx_id, from: normalize(op[1].from), to: normalize(op[1].to), amount, timestamp });
    }
    return [...transfers.values()];
  }
  const operationType = value => String(value || "").replace(/^sm_/, "");
  function jsonObject(value) {
    try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; }
    catch { return null; }
  }
  function parseGameOperations(history, cutoff) {
    const operations = new Map();
    for (const [, item] of history) {
      const timestamp = item.timestamp?.endsWith("Z") ? item.timestamp : item.timestamp + "Z";
      if (!Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) < cutoff) continue;
      const op = Array.isArray(item.op) ? item.op : [String(item.op?.type || "").replace(/_operation$/, ""), item.op?.value];
      if (op[0] !== "custom_json" || !op[1] || !/^[a-f0-9]{40}$/i.test(item.trx_id || "")) continue;
      const type = operationType(op[1].id);
      if (!["token_transfer", "gift_cards", "delegate_cards"].includes(type)) continue;
      const actors = [...new Set([...(op[1].required_auths || []), ...(op[1].required_posting_auths || [])].map(normalize))];
      const data = jsonObject(op[1].json);
      if (actors.length !== 1 || !actors[0] || !data) continue;
      const from = actors[0], to = normalize(data.to);
      if (!/^[a-z][a-z0-9.-]{2,15}$/.test(to) || from === to) continue;
      const id = item.trx_id + ":" + item.op_in_trx;
      const base = { id, transaction: item.trx_id, from, to, timestamp, operation: type, source: "splinterlands" };
      if (type === "token_transfer") {
        if (!["DEC", "SPS"].includes(data.token) || !Number.isFinite(Number(data.qty)) || Number(data.qty) <= 0 ||
          (data.type && data.type !== "transfer")) continue;
        operations.set(id, { ...base, kind: "currency", token: data.token, quantity: Number(data.qty), amount: String(data.qty) + " " + data.token });
      } else {
        if (!Array.isArray(data.cards) || !data.cards.length || !data.cards.every(c => typeof c === "string" && c.length > 0)) continue;
        const cards = [...new Set(data.cards)].sort();
        operations.set(id, { ...base, kind: "card", cards, amount: cards.length + " card(s), " + (type === "gift_cards" ? "gift/transfer" : "delegation") });
      }
    }
    return [...operations.values()];
  }
  function confirmGameOperation(operation, payload) {
    const rows = Array.isArray(payload) ? payload : (payload?.type ? [payload] : (Array.isArray(payload?.data) ? payload.data : []));
    for (const row of rows) {
      const data = jsonObject(row.data);
      if (!row.id || !new RegExp("^" + operation.transaction + "(?:-[0-9]+)?$").test(row.id) ||
        operationType(row.type) !== operation.operation || normalize(row.player) !== operation.from ||
        !data || normalize(data.to) !== operation.to) continue;
      if (operation.kind === "currency" && (data.token !== operation.token || Number(data.qty) !== operation.quantity || (data.type && data.type !== "transfer"))) continue;
      if (operation.kind === "card" && (!Array.isArray(data.cards) || JSON.stringify([...new Set(data.cards)].sort()) !== JSON.stringify(operation.cards))) continue;
      if (row.success === false) return "rejected";
      if (row.success === true && !row.error) return "confirmed";
    }
    return "unverified";
  }
  function cardEvidence(a, b, operations, ignored) {
    const evidence = [];
    const cards = operations.filter(tx => tx.kind === "card" && !ignored.has(tx.from) && !ignored.has(tx.to));
    const direct = cards.filter(tx => (tx.from === a && tx.to === b) || (tx.from === b && tx.to === a));
    if (direct.length) {
      const reused = [...new Set(direct.flatMap(tx => tx.cards))].filter(uid => direct.filter(tx => tx.cards.includes(uid)).length > 1);
      evidence.push({ type: "direct_cards", priority: recurring(direct) || reused.length ? 2 : 1, relevance: 2,
        text: direct.length + " confirmed card gift/transfer or delegation operation(s) between entrants." +
          (reused.length ? " " + reused.length + " card UID(s) recur across operations." : "") +
          " Lending is a possible explanation.", transactions: direct });
    }
    const donors = [...new Set(cards.filter(tx => tx.to === a).map(tx => tx.from))];
    for (const donor of donors) {
      if ([a, b].includes(donor)) continue;
      const left = cards.filter(tx => tx.from === donor && tx.to === a);
      const right = cards.filter(tx => tx.from === donor && tx.to === b);
      if (recurring(left) && recurring(right)) evidence.push({ type: "shared_card_donor", priority: 1, relevance: 2,
        text: "Both repeatedly receive card gifts/delegations from " + donor + ". A guild lender or scholarship may explain this.", transactions: [...left, ...right] });
    }
    return evidence;
  }
  function recurring(items) {
    return items.length >= 3 && new Set(items.map(x => x.timestamp.slice(0, 10))).size >= 2;
  }
  function financialEvidence(a, b, transfers, ignored) {
    const evidence = [];
    for (const source of ["splinterlands", "hive"]) {
      const relevant = transfers.filter(tx => tx.kind !== "card" && (tx.source || "hive") === source && !ignored.has(tx.from) && !ignored.has(tx.to));
      const label = source === "splinterlands" ? "Splinterlands DEC/SPS" : "HIVE/HBD";
      const relevance = source === "splinterlands" ? 2 : 1;
      const direct = relevant.filter(t => (t.from === a && t.to === b) || (t.from === b && t.to === a));
      if (recurring(direct) || (source === "splinterlands" && direct.length)) evidence.push({
        type: source === "splinterlands" ? "game_direct_transfers" : "direct_transfers",
        priority: recurring(direct) ? 2 : 1, relevance,
        text: direct.length + " " + label + " transfers between these entrants" + (recurring(direct) ? " across multiple days." : " (limited connection)."),
        transactions: direct
      });
      for (const direction of ["from", "to"]) {
        const other = direction === "from" ? "to" : "from";
        const left = relevant.filter(t => t[direction] === a && ![a, b].includes(t[other]));
        const right = relevant.filter(t => t[direction] === b && ![a, b].includes(t[other]));
        for (const name of new Set(left.map(t => t[other]))) {
          const l = left.filter(t => t[other] === name);
          const r = right.filter(t => t[other] === name);
          if (recurring(l) && recurring(r)) evidence.push({ type: (source === "hive" ? "" : "game_") + (direction === "from" ? "common_recipient" : "common_funder"), priority: 2, relevance,
            text: direction === "from" ? "Both repeatedly send " + label + " to " + name + " (" + l.length + " / " + r.length + " transfers)." :
              "Both repeatedly receive " + label + " from " + name + " (" + l.length + " / " + r.length + " transfers).",
            transactions: [...l, ...r] });
        }
      }
    }
    return evidence;
  }
  function analyze(names, accounts, transfers, ignored) {
    const byName = new Map(accounts.map(a => [a.name, a]));
    const findings = [];
    const byParticipant = new Map();
    for (const tx of transfers) for (const name of new Set([tx.from, tx.to])) {
      if (!byParticipant.has(name)) byParticipant.set(name, []);
      byParticipant.get(name).push(tx);
    }
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const relevant = [...new Map([...(byParticipant.get(a) || []), ...(byParticipant.get(b) || [])].map(tx => [tx.id, tx])).values()];
      const evidence = [
        ...(byName.has(a) && byName.has(b) ? authorityEvidence(byName.get(a), byName.get(b), ignored) : []),
        ...financialEvidence(a, b, relevant, ignored),
        ...cardEvidence(a, b, relevant, ignored)
      ];
      if (evidence.length) findings.push({ id: a + "|" + b, players: [a, b], priority: Math.max(...evidence.map(e => e.priority)), relevance: Math.max(...evidence.map(e => e.relevance || 0)), evidence });
    }
    return findings.sort((a, b) => b.priority - a.priority || b.relevance - a.relevance || a.id.localeCompare(b.id));
  }
  const core = { entrants, authorityEvidence, parseTransfers, parseGameOperations, confirmGameOperation, cardEvidence, financialEvidence, analyze, normalize, defaultServices };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof document === "undefined") return;

  const isController = new URLSearchParams(location.search).get("controller") === "1";
  const reports = new Map();
  let running = null;
  let notes = {};
  let storageProblem = false;
  let progress = "";
  const storageKey = "phoenix-entrant-reviews-v1";
  try { notes = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { storageProblem = true; }
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) notes = {};
  const style = document.createElement("style");
  style.textContent = [
    ".entrant-dialog{width:min(1100px,calc(100% - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;padding:20px;color:var(--text,#f4f6f8);background:var(--panel,#0c1118);border:1px solid var(--ember,#ff5a1f);overflow:auto}",
    ".entrant-dialog::backdrop{background:rgba(0,0,0,.8)}",
    ".entrant-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.entrant-head h2{font-size:22px;margin:0;text-transform:uppercase;letter-spacing:0}",
    ".entrant-settings{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.entrant-settings textarea{min-height:70px;resize:vertical;width:100%;box-sizing:border-box}",
    ".entrant-wide{grid-column:1/-1}.entrant-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.entrant-actions button{white-space:normal}",
    ".entrant-summary{color:var(--muted);line-height:1.5;margin:12px 0}.entrant-title{overflow-wrap:anywhere;font-weight:800}",
    ".entrant-list{display:grid;gap:12px}.entrant-pair{border:1px solid var(--line);border-top:2px solid var(--gold);padding:14px;background:#080d12}",
    ".entrant-pair h3{font-size:18px;margin:0 0 8px;letter-spacing:0;overflow-wrap:anywhere}.entrant-pair li{margin:6px 0;overflow-wrap:anywhere;line-height:1.5}",
    ".entrant-review{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:10px;margin-top:12px}.entrant-review textarea{width:100%;min-height:60px;box-sizing:border-box;resize:vertical}",
    ".entrant-dialog code{overflow-wrap:anywhere;white-space:normal}.entrant-dialog a{color:var(--teal,#00d7ef)}",
    ".entrant-dialog button:disabled{opacity:.5;cursor:default}.entrant-close{width:40px;height:40px;font-size:24px;padding:0}",
    "@media(max-width:600px){.entrant-settings,.entrant-review{grid-template-columns:1fr}.entrant-dialog{padding:12px}}"
  ].join("\n");
  document.head.appendChild(style);
  const button = document.createElement("button");
  button.type = "button";
  button.id = "entrantCheckButton";
  button.textContent = "Entrant Check";
  document.querySelector("#popoutControllerButton").insertAdjacentElement("afterend", button);
  const dialog = document.createElement("dialog");
  dialog.className = "entrant-dialog";
  dialog.setAttribute("aria-labelledby", "entrantCheckTitle");
  dialog.innerHTML = '<div class="entrant-head"><h2 id="entrantCheckTitle">Entrant Check</h2><button class="entrant-close" type="button" aria-label="Close entrant check" title="Close">&times;</button></div>' +
    '<p class="entrant-title" id="entrantTournament"></p><div class="entrant-settings">' +
    '<label class="field"><span>Scan</span><select id="entrantScanMode"><option value="quick">Authorities only</option><option value="deep" selected>Authorities + currencies + cards</option></select></label>' +
    '<label class="field"><span>History window</span><select id="entrantDays"><option value="30">30 days</option><option value="90" selected>90 days</option></select></label>' +
    '<label class="field entrant-wide"><span>Ignore service accounts (comma separated)</span><textarea id="entrantIgnored" spellcheck="false"></textarea></label></div>' +
    '<div class="entrant-actions"><button type="button" id="entrantRun">Check Entrants</button><button type="button" id="entrantCancel" disabled>Cancel Scan</button><button type="button" id="entrantExport" disabled>Export Report</button></div>' +
    '<p class="entrant-summary">Connections need host review; they do not prove shared ownership. Scan includes public DEC/SPS transfer and card gift/delegation operations, plus HIVE/HBD transfers. Game operations must be confirmed by Splinterlands. Market trades and automated rental payments are excluded.</p>' +
    '<p class="entrant-summary" id="entrantScanStatus" role="status" aria-live="polite"></p><div class="entrant-list" id="entrantResults"></div>';
  // Review data lives only in this window, never in the broadcast state.
  if (isController) document.body.appendChild(dialog);
  const ui = id => dialog.querySelector("#" + id);
  ui("entrantIgnored").value = defaultServices.join(", ");
  const scanStatus = () => {
    ui("entrantScanStatus").textContent = progress + (storageProblem ? " Review notes cannot be saved in this browser." : "");
  };
  function selectedReport() { return reports.get(currentTournament()?.id); }
  function reviewKey(report, pair) { return report.tournamentId + ":" + pair.id; }
  const reviewStates = ["Needs Review", "Explained Connection", "Confirmed Shared Owner"];
  function renderReport() {
    const t = currentTournament();
    ui("entrantTournament").textContent = t?.name || "No tournament selected";
    const report = selectedReport();
    ui("entrantRun").disabled = Boolean(running) || !t;
    ui("entrantCancel").disabled = !running;
    ui("entrantExport").disabled = !report || Boolean(running);
    dialog.querySelectorAll(".entrant-settings select,.entrant-settings textarea").forEach(e => { e.disabled = Boolean(running); });
    if (!report) {
      ui("entrantResults").innerHTML = "";
      if (!running) progress = "No check run for this tournament.";
      scanStatus();
      return;
    }
    const missing = report.names.filter(n => !report.accounts.includes(n));
    const incomplete = report.coverage.filter(c => !c.complete);
    const changed = Boolean(t.players?.length) && JSON.stringify(entrants(t)) !== JSON.stringify(report.names);
    const coverageText = report.mode === "deep" ? " " + report.coverage.filter(c => c.complete).length + "/" + report.names.length + " public histories cover the requested window. Incoming game activity from unscanned senders is not covered." : " Financial history not checked.";
    if (!running) progress = "Checked " + new Date(report.checkedAt).toLocaleString() + ". " +
      report.accounts.length + "/" + report.names.length + " authorities available." + coverageText +
      (report.gameChecks ? " Game operations: " + report.gameChecks.confirmed + " confirmed, " + report.gameChecks.rejected + " rejected, " + report.gameChecks.unverified + " unverified/not checked." : "") +
      (report.rosterIncomplete ? " Entrant roster may be incomplete." : "") +
      (changed ? " Entrants changed since this check; run again." : "") +
      (report.cancelled ? " Scan cancelled; results are partial." : "") +
      (report.authorityErrors.length ? " " + report.authorityErrors.join("; ") + "." : "") +
      (missing.length ? " Missing accounts: " + missing.join(", ") + "." : "") +
      (incomplete.length ? " Incomplete histories: " + incomplete.map(c => c.name + " (" + c.reason + ")").join(", ") + "." : "");
    scanStatus();
    ui("entrantResults").innerHTML = report.findings.length ? report.findings.map(pair => {
      const saved = notes[reviewKey(report, pair)] || {};
      return '<article class="entrant-pair" data-pair="' + esc(pair.id) + '"><h3>' +
        pair.players.map(n => '<a href="https://hiveblocks.com/@' + encodeURIComponent(n) + '" target="_blank" rel="noopener noreferrer">' + esc(n) + '</a>').join(" &harr; ") +
        '</h3><p>' + (pair.priority >= 2 ? "Review recommended" : "Limited connection / context only") + '</p><ul>' +
        pair.evidence.map(e => '<li>' + esc(e.text) + (e.key ? ' <code>' + esc(e.key) + '</code>' : "") +
          (e.transactions ? '<details><summary>Transactions (' + e.transactions.length + ')</summary>' +
            e.transactions.map(tx => '<p><a target="_blank" rel="noopener noreferrer" href="https://hiveblocks.com/tx/' + encodeURIComponent(tx.transaction) + '">' +
              esc(tx.timestamp.slice(0, 10) + " " + tx.from + " -> " + tx.to + " " + tx.amount) + '</a>' + (tx.cards ? '<br><code>' + esc(tx.cards.join(", ")) + '</code>' : "") + '</p>').join("") + '</details>' : "") + '</li>').join("") +
        '</ul><div class="entrant-review"><label class="field"><span>Host decision</span><select data-review="status">' +
        reviewStates.map(s => '<option' + ((saved.status || reviewStates[0]) === s ? " selected" : "") + '>' + s + '</option>').join("") +
        '</select></label><label class="field"><span>Review notes</span><textarea data-review="note" maxlength="4000">' + esc(saved.note || "") + '</textarea></label></div></article>';
    }).join("") : '<p>No connections found in the data checked. This does not confirm separate ownership.</p>';
  }
  async function rpc(method, params, signal) {
    let lastError;
    for (const node of ["https://api.hive.blog", "https://api.deathwing.me"]) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const request = new AbortController();
      const abort = () => request.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 15000);
      try {
        const response = await fetch(node, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: request.signal });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const payload = await response.json();
        if (payload.error) throw new Error(payload.error.message || "Hive API error");
        if (!Array.isArray(payload.result)) throw new Error("Unexpected Hive API response");
        return payload.result;
      } catch (error) { lastError = error; } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    throw lastError;
  }
  async function history(name, cutoff, signal) {
    const rows = [];
    let start = -1;
    for (let page = 0; page < 5; page++) {
      const limit = start < 0 ? 1000 : Math.min(1000, start);
      const batch = await rpc("condenser_api.get_account_history", [name, start, limit], signal);
      if (!batch.length) return { rows, complete: true };
      rows.push(...batch);
      const first = batch.reduce((a, b) => Number(a[0]) < Number(b[0]) ? a : b);
      const oldest = Math.min(...batch.map(([, item]) => Date.parse(item.timestamp + (item.timestamp.endsWith("Z") ? "" : "Z"))));
      if (Number(first[0]) === 0 || oldest <= cutoff) return { rows, complete: true };
      const next = Number(first[0]) - 1;
      if (start >= 0 && next >= start) return { rows, complete: false, reason: "pagination stopped" };
      start = next;
    }
    return { rows, complete: false, reason: "5-page history limit reached" };
  }
  async function scan() {
    if (running) return;
    const t = currentTournament();
    if (!t) return;
    const controller = new AbortController();
    running = controller;
    const report = { tournamentId: t.id, tournamentName: t.name, checkedAt: new Date().toISOString(),
      mode: ui("entrantScanMode").value, days: Number(ui("entrantDays").value),
      ignored: [...new Set(ui("entrantIgnored").value.split(/[,\s]+/).map(normalize).filter(Boolean))],
      names: entrants(t), accounts: [], authorityErrors: [], coverage: [], findings: [], rosterIncomplete: true };
    const accounts = [], transfers = new Map(), gameCandidates = new Map();
    if (report.mode === "deep") report.gameChecks = { confirmed: 0, rejected: 0, unverified: 0 };
    progress = "Loading the full entrant roster...";
    renderReport();
    try {
      const response = await fetch(apiBase + "/tournaments/find?id=" + encodeURIComponent(t.id), { signal: controller.signal });
      if (!response.ok) throw new Error("Could not load entrant roster: HTTP " + response.status);
      const detail = await response.json();
      if (!Array.isArray(detail.players)) throw new Error("Entrant roster unavailable. Load tournament details and retry.");
      report.names = entrants({ players: detail.players });
      report.rosterIncomplete = !report.names.length || report.names.length < Number(detail.num_players || 0);
      if (!report.names.length) throw new Error("No entrants available for this tournament.");
      reports.set(t.id, report);
      for (let index = 0; index < report.names.length; index += 50) {
        progress = "Checking authorities: " + Math.min(index + 50, report.names.length) + "/" + report.names.length;
        scanStatus();
        try { accounts.push(...await rpc("condenser_api.get_accounts", [report.names.slice(index, index + 50)], controller.signal)); }
        catch (error) {
          if (controller.signal.aborted) throw error;
          report.authorityErrors.push("Authority lookup failed for " + report.names.slice(index, index + 50).join(", ") + ": " + error.message);
        }
      }
      report.accounts = accounts.map(a => a.name);
      if (report.mode === "deep") {
        const cutoff = Date.parse(report.checkedAt) - report.days * 86400000;
        for (let index = 0; index < report.names.length; index++) {
          const name = report.names[index];
          progress = "Checking financial history: " + (index + 1) + "/" + report.names.length + " (" + name + ")";
          scanStatus();
          try {
            const result = await history(name, cutoff, controller.signal);
            report.coverage.push({ name, complete: result.complete, reason: result.reason || "" });
            for (const tx of parseTransfers(result.rows, cutoff)) transfers.set(tx.id, tx);
            for (const operation of parseGameOperations(result.rows, cutoff)) {
              if (!report.ignored.includes(operation.from) && !report.ignored.includes(operation.to)) gameCandidates.set(operation.id, operation);
            }
          } catch (error) {
            if (controller.signal.aborted) throw error;
            report.coverage.push({ name, complete: false, reason: "history unavailable: " + error.message });
          }
        }
        const candidates = [...gameCandidates.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const selected = candidates.slice(0, 300);
        report.gameChecks.unverified = candidates.length;
        let cursor = 0, checked = 0;
        async function worker() {
          while (cursor < selected.length && !controller.signal.aborted) {
            const operation = selected[cursor++];
            let result = "unverified";
            for (const base of [apiBase, "https://api.splinterlands.com"]) {
              if (controller.signal.aborted) break;
              const request = new AbortController();
              const abort = () => request.abort();
              controller.signal.addEventListener("abort", abort, { once: true });
              const timeout = setTimeout(abort, 15000);
              try {
                const response = await fetch(base + "/transactions/lookup?trx_id=" + encodeURIComponent(operation.transaction), { signal: request.signal });
                if (response.ok) result = confirmGameOperation(operation, await response.json());
                if (result !== "unverified") break;
              } catch { /* Leave unavailable or mismatched game results unverified. */ }
              finally { clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); }
            }
            if (result === "confirmed") { transfers.set(operation.id, operation); report.gameChecks.confirmed++; report.gameChecks.unverified--; }
            if (result === "rejected") { report.gameChecks.rejected++; report.gameChecks.unverified--; }
            checked++;
            progress = "Confirming Splinterlands operations: " + checked + "/" + selected.length + (candidates.length > 300 ? " (300-operation confirmation limit)" : "");
            scanStatus();
          }
        }
        await Promise.allSettled([worker(), worker(), worker()]);
        if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      }
    } catch (error) {
      report.cancelled = controller.signal.aborted;
      report.error = report.cancelled ? "Cancelled" : error.message;
      progress = report.error;
    } finally {
      report.accounts = accounts.map(a => a.name);
      report.authoritySnapshots = accounts.map(a => ({ name: a.name, owner: a.owner, active: a.active, posting: a.posting }));
      if (report.mode === "deep") for (const name of report.names) {
        if (!report.coverage.some(c => c.name === name)) report.coverage.push({ name, complete: false, reason: "not scanned" });
      }
      if (report.gameChecks) report.gameChecks.unverified = gameCandidates.size - report.gameChecks.confirmed - report.gameChecks.rejected;
      report.findings = analyze(report.names, accounts, [...transfers.values()], new Set(report.ignored));
      reports.set(t.id, report);
      running = null;
      renderReport();
      if (report.error) { progress += " " + report.error + "."; scanStatus(); }
    }
  }
  button.addEventListener("click", () => {
    if (isController) { renderReport(); dialog.showModal(); return; }
    const url = new URL(location.href);
    url.searchParams.set("controller", "1");
    url.searchParams.set("entrant_check", "1");
    const popup = window.open(url.href, "splinterlands-tournament-controller", "popup=yes,width=1100,height=900");
    if (!popup) setStatus("Allow pop-ups to open the entrant check in the controls window.");
  });
  dialog.querySelector(".entrant-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { running?.abort(); });
  ui("entrantRun").addEventListener("click", scan);
  ui("entrantCancel").addEventListener("click", () => running?.abort());
  ui("entrantResults").addEventListener("input", event => {
    const field = event.target.dataset.review;
    if (!field) return;
    const report = selectedReport();
    const id = event.target.closest("[data-pair]").dataset.pair;
    const key = report.tournamentId + ":" + id;
    notes[key] = { ...(notes[key] || {}), [field]: event.target.value, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(storageKey, JSON.stringify(notes)); } catch { storageProblem = true; scanStatus(); }
  });
  ui("entrantExport").addEventListener("click", () => {
    const report = selectedReport();
    if (!report) return;
    const exported = { ...report, findings: report.findings.map(p => ({ ...p, review: notes[reviewKey(report, p)] || { status: "Needs Review" } })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "entrant-check-" + String(report.tournamentId).replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let displayedTournamentId = null;
  const originalRender = render;
  render = function entrantCheckRender() {
    originalRender();
    if (isController && dialog.open && displayedTournamentId !== currentTournament()?.id) {
      displayedTournamentId = currentTournament()?.id;
      renderReport();
    }
  };
  if (isController && new URLSearchParams(location.search).get("entrant_check") === "1") {
    renderReport();
    dialog.showModal();
  }
})();
