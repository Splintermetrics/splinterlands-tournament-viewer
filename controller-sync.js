(() => {
  const isController = new URLSearchParams(window.location.search).get("controller") === "1";
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("splinterlands-tournament-viewer") : null;
  const source = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const popoutControllerButton = els.popoutControllerButton || document.querySelector("#popoutControllerButton");
  if (popoutControllerButton) els.popoutControllerButton = popoutControllerButton;
  let applyingRemote = false;
  let receivedRemote = false;
  let awaitingInitial = Boolean(isController && channel);

  if (isController) {
    document.body.classList.add("controller-window");
    document.title = "Tournament Viewer Controls";
  }

  function snapshot() {
    return {
      data: state.data,
      selectedId: state.selectedId,
      view: state.view,
      round: state.round,
      group: state.group,
      revealNames: state.revealNames,
      revealScores: state.revealScores,
      revealWinners: state.revealWinners,
      statusFilters: [...state.statusFilters],
      formatFilter: state.formatFilter,
      streamClean: Boolean(state.streamClean),
    };
  }

  function publish() {
    if (!channel || applyingRemote || awaitingInitial) return;
    channel.postMessage({ type: "state", source, state: snapshot() });
  }

  function applySnapshot(next) {
    if (!next) return;
    applyingRemote = true;
    receivedRemote = true;
    awaitingInitial = false;
    Object.assign(state, {
      data: next.data || { tournaments: [] },
      selectedId: next.selectedId ?? null,
      view: next.view || "bracket",
      round: next.round ?? null,
      group: next.group || "all",
      revealNames: Boolean(next.revealNames),
      revealScores: Boolean(next.revealScores),
      revealWinners: Boolean(next.revealWinners),
      statusFilters: new Set(next.statusFilters?.length ? next.statusFilters : ["completed", "in_progress", "upcoming"]),
      formatFilter: next.formatFilter || "any",
      streamClean: Boolean(next.streamClean),
    });
    render();
    applyingRemote = false;
  }

  if (channel) {
    channel.addEventListener("message", (event) => {
      if (event.data?.source === source) return;
      if (event.data?.type === "state") applySnapshot(event.data.state);
      if (event.data?.type === "request-state") publish();
    });
    if (isController) channel.postMessage({ type: "request-state", source });
  }

  const originalRender = render;
  render = function syncedRender() {
    originalRender();
    const clean = Boolean(state.streamClean);
    els.streamModeToggle.checked = clean;
    els.statusFilters.forEach((input) => {
      input.checked = state.statusFilters.has(input.value);
    });
    document.body.classList.toggle("stream-clean", clean && !isController);
    publish();
  };

  popoutControllerButton?.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("controller", "1");
    window.open(url.toString(), "splinterlands-tournament-controller", "popup=yes,width=430,height=900");
  });

  els.streamModeToggle.addEventListener("change", (event) => {
    state.streamClean = event.target.checked;
    render();
  });

  els.exitStreamModeButton.addEventListener("click", () => {
    state.streamClean = false;
    render();
  });

  render();

  if (isController && channel) {
    setTimeout(() => {
      if (!receivedRemote) {
        awaitingInitial = false;
        channel.postMessage({ type: "request-state", source });
      }
    }, 500);
  }
})();
