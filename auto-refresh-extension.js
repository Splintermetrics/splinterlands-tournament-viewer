(() => {
  const params = new URLSearchParams(window.location.search);
  const isController = params.get("controller") === "1";
  const intervalMs = 60000;
  let refreshing = false;
  let lastRefreshAt = null;

  if (isController || typeof loadTournamentFromApi !== "function") return;

  function snapshotUi() {
    return {
      selectedId: state.selectedId,
      view: state.view,
      round: state.round,
      group: state.group,
      revealNames: state.revealNames,
      revealScores: state.revealScores,
      revealWinners: state.revealWinners,
      streamClean: Boolean(state.streamClean),
      statusFilters: new Set(state.statusFilters),
      formatFilter: state.formatFilter,
    };
  }

  function restoreUi(saved) {
    if (!saved) return;
    const tournament = currentTournament();
    const availableRounds = tournament ? rounds(tournament).map(String) : [];
    const availableGroups = tournament
      ? ["all", ...new Set((tournament.matches || [])
        .filter((match) => String(match.round) === String(saved.round))
        .map((match) => String(match.swiss_group || "none")))]
      : ["all"];

    state.selectedId = saved.selectedId;
    state.view = saved.view;
    state.round = availableRounds.includes(String(saved.round)) ? saved.round : (availableRounds[0] || saved.round);
    state.group = availableGroups.includes(String(saved.group)) ? saved.group : "all";
    state.revealNames = saved.revealNames;
    state.revealScores = saved.revealScores;
    state.revealWinners = saved.revealWinners;
    state.streamClean = saved.streamClean;
    state.statusFilters = saved.statusFilters;
    state.formatFilter = saved.formatFilter;
  }

  async function refreshCurrentTournament() {
    const selectedId = state.selectedId || currentTournament()?.id;
    if (!selectedId || refreshing) return;

    refreshing = true;
    const saved = snapshotUi();
    try {
      await loadTournamentFromApi(selectedId);
      restoreUi(saved);
      lastRefreshAt = new Date();
      render();
      setStatus(`Auto refreshed ${currentTournament()?.name || selectedId} at ${lastRefreshAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
    } catch (error) {
      restoreUi(saved);
      render();
      setStatus(`Auto refresh failed: ${error.message}`);
    } finally {
      refreshing = false;
    }
  }

  setInterval(refreshCurrentTournament, intervalMs);
})();
