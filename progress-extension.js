(() => {
  const progressStyle = document.createElement("style");
  progressStyle.textContent = `
    .segmented{grid-template-columns:repeat(4,1fr)}
    .progress-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(320px,.8fr);gap:16px}
    .progress-layout h3{font-size:24px}
    .progress-summary,.player-progress-list{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:rgba(21,25,29,.86)}
    .overall-progress-card{display:grid;grid-template-columns:120px minmax(0,1fr);gap:18px;align-items:center;padding:18px}
    .progress-percent{display:grid;place-items:center;min-height:96px;border:1px solid var(--gold);border-radius:8px;color:var(--gold);background:#101417;font-size:34px;font-weight:900}
    .progress-label{margin-bottom:10px;font-size:18px;font-weight:800}
    .progress-detail,.player-progress-row small{color:var(--muted)}
    .progress-detail{margin-top:10px;line-height:1.45}
    .progress-bar{width:100%;height:12px;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:#101417}
    .progress-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--teal),var(--gold))}
    .player-progress-row{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:9px 12px;align-items:center;padding:13px 12px;border-bottom:1px solid rgba(46,56,64,.6)}
    .player-progress-row:last-child{border-bottom:0}
    .player-progress-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .player-progress-row span{justify-self:end;color:var(--gold);font-weight:900}
    .player-progress-row .progress-bar,.player-progress-row small{grid-column:1/-1}
    @media(max-width:920px){.progress-layout{grid-template-columns:1fr}.overall-progress-card{grid-template-columns:1fr}}
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
          <div><h3>Round Progress</h3><div class="progress-summary" id="progressSummary"></div></div>
          <div><h3>Player Completion</h3><div class="player-progress-list" id="playerProgressList"></div></div>
        </div>
      </section>
    `);
  }

  els.progressSummary = document.querySelector("#progressSummary");
  els.playerProgressList = document.querySelector("#playerProgressList");

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

  function playerSubmittedBattles(match, side) {
    const key = side === 1 ? "player_1_submitted" : "player_2_submitted";
    if (Number.isFinite(Number(match[key]))) return Number(match[key]);
    if (isMatchComplete(match)) return matchExpectedBattles(match);
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
      return;
    }

    const matches = currentMatches(tournament);
    const completeMatches = matches.filter(isMatchComplete).length;
    const matchPercent = matches.length ? Math.round((completeMatches / matches.length) * 100) : 0;
    const playerStats = new Map();

    function addPlayer(name, submitted, expected) {
      if (!name) return;
      const key = String(name);
      const current = playerStats.get(key) || { player: key, submitted: 0, expected: 0 };
      current.submitted += Math.min(Number(submitted || 0), Number(expected || 0));
      current.expected += Number(expected || 0);
      playerStats.set(key, current);
    }

    for (const match of matches) {
      const expected = matchExpectedBattles(match);
      addPlayer(match.player_1, playerSubmittedBattles(match, 1), expected);
      addPlayer(match.player_2, playerSubmittedBattles(match, 2), expected);
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
      .map((player) => ({ ...player, percent: player.expected ? Math.round((player.submitted / player.expected) * 100) : 0 }))
      .sort((a, b) => a.percent - b.percent || a.player.localeCompare(b.player));

    els.playerProgressList.innerHTML = rows.length ? rows.map((player) => `
      <div class="player-progress-row">
        <strong class="${state.revealNames ? "" : "hidden-token"}">${esc(player.player)}</strong>
        <span>${esc(player.percent)}%</span>
        ${progressBar(player.percent, `${player.player} battle completion`)}
        <small>${esc(player.submitted)} of ${esc(player.expected)} battle submissions</small>
      </div>
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
          const completedBattles = battles.filter((battle) => Number(battle.status) === 2 || (battle.battle_queue_id_1 && battle.battle_queue_id_2)).length;
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
