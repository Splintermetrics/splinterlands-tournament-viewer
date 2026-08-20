(() => {
  const progressStyle = document.createElement("style");
  progressStyle.textContent = `
    .segmented{grid-template-columns:repeat(4,1fr)}
    .progress-layout{display:grid;gap:16px}
    .progress-layout h3{font-size:24px;text-transform:uppercase;letter-spacing:-.04em}
    .progress-summary,.player-progress-grid{border:1px solid var(--line);background:rgba(12,17,24,.90)}
    .overall-progress-card{display:grid;grid-template-columns:120px minmax(0,1fr);gap:18px;align-items:center;padding:18px;border-top:2px solid rgba(255,90,31,.65)}
    .progress-percent{display:grid;place-items:center;min-height:96px;border:1px solid var(--ember);color:var(--gold);background:#080d12;font-size:34px;font-weight:900}
    .progress-label{margin-bottom:10px;font-size:18px;font-weight:900}
    .progress-detail,.player-progress-card small{color:var(--muted)}
    .progress-detail{margin-top:10px;line-height:1.45}
    .progress-bar{width:100%;height:12px;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:#080d12}
    .progress-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--teal),var(--gold),var(--ember))}
    .player-progress-section{display:grid;gap:10px}
    .player-progress-head{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap}
    .player-progress-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;border:0;background:transparent}
    .player-progress-card{display:grid;gap:9px;min-height:118px;padding:13px 12px;border:1px solid var(--line);border-top:2px solid rgba(255,90,31,.65);background:rgba(12,17,24,.90);box-shadow:0 18px 42px var(--shadow)}
    .player-progress-card strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px}
    .player-progress-card span{justify-self:end;color:var(--gold);font-size:20px;font-weight:900}
    .player-progress-card .player-progress-top{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:12px;align-items:center}
    .player-progress-card.is-complete{border-color:rgba(118,242,164,.62);border-top-color:var(--green);background:linear-gradient(135deg,rgba(118,242,164,.09),rgba(12,17,24,.94) 38%)}
    .player-progress-card.is-behind{border-top-color:var(--gold)}
    @media(max-width:920px){.overall-progress-card{grid-template-columns:1fr}.player-progress-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(progressStyle);

  const segmented = document.querySelector(".segmented");
  if (segmented && !document.querySelector('[data-view="progress"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = "progress";
    button.textContent = "Progress";
    const standingsButton = segmented.querySelector('[data-view="standings"]');
    segmented.insertBefore(button, standingsButton || null);
    button.addEventListener("click", () => {
      state.view = "progress";
      render();
    });
  }

  const bracketView = document.querySelector("#bracketView");
  if (bracketView && !document.querySelector("#progressView")) {
    bracketView.insertAdjacentHTML("afterend", `
      <section class="view" id="progressView">
        <div class="progress-layout">
          <div>
            <h3>Round Progress</h3>
            <div class="progress-summary" id="progressSummary"></div>
          </div>
          <div class="player-progress-section">
            <div class="player-progress-head">
              <h3>Player Completion</h3>
              <div class="round-stats" id="playerProgressStats"></div>
            </div>
            <div class="player-progress-grid" id="playerProgressList"></div>
          </div>
        </div>
      </section>
    `);
  }

  els.progressSummary = document.querySelector("#progressSummary");
  els.playerProgressList = document.querySelector("#playerProgressList");
  els.playerProgressStats = document.querySelector("#playerProgressStats");

  function targetWins(bestOf) {
    return Math.floor(Number(bestOf || 1) / 2) + 1;
  }

  function matchExpectedBattles(match) {
    return Math.max(Number(match.expected_battles || 0), Number(match.best_of || 1), Number(match.battles_count || 0), 1);
  }

  function isMatchComplete(match) {
    return Boolean(match.winner)
      || Number(match.player_1_wins || 0) >= targetWins(match.best_of)
      || Number(match.player_2_wins || 0) >= targetWins(match.best_of);
  }

  function matchCompletedBattles(match) {
    const expected = matchExpectedBattles(match);
    if (isMatchComplete(match)) return expected;
    const completed = Number(match.completed_battles);
    if (Number.isFinite(completed) && completed > 0 && completed < expected) return completed;
    return 0;
  }

  function progressBar(percent, label) {
    return `<div class="progress-bar" aria-label="${esc(label)}"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div>`;
  }

  function renderProgress() {
    if (!els.progressSummary || !els.playerProgressList) return;
    const tournament = currentTournament();
    if (!tournament) {
      els.progressSummary.innerHTML = '<div class="status-box">No tournament selected.</div>';
      els.playerProgressList.innerHTML = '<div class="status-box">No player progress to show.</div>';
      if (els.playerProgressStats) els.playerProgressStats.innerHTML = "";
      return;
    }

    const matches = currentMatches(tournament);
    const completeMatches = matches.filter(isMatchComplete).length;
    const matchPercent = matches.length ? Math.round((completeMatches / matches.length) * 100) : 0;
    const playerStats = new Map();

    function addPlayer(name, completed, expected) {
      if (!name) return;
      const key = String(name);
      const current = playerStats.get(key) || { player: key, completed: 0, expected: 0 };
      current.completed += Math.min(Number(completed || 0), Number(expected || 0));
      current.expected += Number(expected || 0);
      playerStats.set(key, current);
    }

    for (const match of matches) {
      const expected = matchExpectedBattles(match);
      const completed = matchCompletedBattles(match);
      addPlayer(match.player_1, completed, expected);
      addPlayer(match.player_2, completed, expected);
    }

    els.progressSummary.innerHTML = matches.length ? `
      <div class="overall-progress-card">
        <div class="progress-percent">${esc(matchPercent)}%</div>
        <div>
          <div class="progress-label">All matches complete for this view</div>
          ${progressBar(matchPercent, "All matches complete")}
          <div class="progress-detail">${esc(completeMatches)} of ${esc(matches.length)} matches decided in round ${esc(state.round)}${state.group === "all" ? "" : `, group ${esc(state.group)}`}.</div>
        </div>
      </div>
    ` : '<div class="status-box">No match data is available for this round yet.</div>';

    const rows = [...playerStats.values()]
      .map((player) => ({ ...player, percent: player.expected ? Math.round((player.completed / player.expected) * 100) : 0 }))
      .sort((a, b) => a.percent - b.percent || a.player.localeCompare(b.player));

    if (els.playerProgressStats) {
      els.playerProgressStats.innerHTML = [
        `${rows.length} players`,
        `${rows.filter((player) => player.percent >= 100).length} complete`,
        `${rows.filter((player) => player.percent < 100).length} pending`,
      ].map((item) => `<span class="pill">${esc(item)}</span>`).join("");
    }

    els.playerProgressList.innerHTML = rows.length ? rows.map((player) => `
      <article class="player-progress-card${player.percent >= 100 ? " is-complete" : " is-behind"}">
        <div class="player-progress-top">
          <strong class="${state.revealNames ? "" : "hidden-token"}">${esc(player.player)}</strong>
          <span>${esc(player.percent)}%</span>
        </div>
        ${progressBar(player.percent, `${player.player} battle completion`)}
        <small>${esc(player.completed)} of ${esc(player.expected)} battles resolved</small>
      </article>
    `).join("") : '<div class="status-box">No player progress to show for this round.</div>';
  }

  loadTournamentFromApi = async function loadTournamentWithProgress(id) {
    setStatus(`Loading ${id} from Splinterlands API...`);
    const detail = await fetchJson(`${apiBase}/tournaments/find?id=${encodeURIComponent(id)}`);
    const tournament = simplifyTournament(detail);
    tournament.current_round = detail.current_round;

    for (const round of detail.rounds || []) {
      const groups = Number(round.num_swiss_groups) > 0
        ? Array.from({ length: Number(round.num_swiss_groups) }, (_, index) => index + 1)
        : [null];
      for (const group of groups) {
        const suffix = group === null ? "" : `&swiss_group=${group}`;
        const matches = await fetchJson(`${apiBase}/tournaments/battles?id=${encodeURIComponent(id)}&round=${round.round}${suffix}`);
        tournament.matches.push(...matches.map((match) => {
          const battles = match.battles || [];
          const expectedBattles = Math.max(Number(match.best_of || 1), battles.length);
          const completedBattles = battles.filter((battle) => Number(battle.status) === 2 || Boolean(battle.winner || battle.winner_player)).length;
          return {
            id: match.id,
            round: match.round,
            index: match.index,
            best_of: match.best_of,
            swiss_group: match.swiss_group || null,
            player_1: match.player_1,
            player_2: match.player_2,
            player_1_wins: match.player_1_wins,
            player_2_wins: match.player_2_wins,
            winner: match.winner,
            battles_count: battles.length,
            expected_battles: expectedBattles,
            completed_battles: completedBattles,
            player_1_submitted: battles.filter((battle) => battle.battle_queue_id_1).length,
            player_2_submitted: battles.filter((battle) => battle.battle_queue_id_2).length,
            battle_links: battles.flatMap((battle, battleIndex) => {
              const queueId = battle.battle_queue_id_1 || battle.battle_queue_id_2;
              return queueId ? [{ label: `Battle ${battleIndex + 1}`, queue_id: queueId, url: battleUrl(queueId) }] : [];
            }),
          };
        }));
      }
    }

    state.data.tournaments = [tournament, ...state.data.tournaments.filter((item) => item.id !== tournament.id)];
    state.selectedId = tournament.id;
    state.round = null;
    state.group = "all";
    render();
  };

  const originalRender = render;
  render = function progressRender() {
    originalRender();
    renderProgress();
    renderViews();
  };

  render();
})();
