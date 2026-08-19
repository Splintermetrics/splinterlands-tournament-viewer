(() => {
  const style = document.createElement("style");
  style.textContent = `
    .group-filter-bar{display:flex;flex-wrap:wrap;gap:8px;margin:-4px 0 18px;align-items:center}
    .group-filter-label{font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:.16em;color:var(--teal);margin-right:4px}
    .group-filter-button{min-height:34px;padding:0 12px;border:1px solid var(--line);background:#080d12;color:#c5ced6;font:800 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:.06em}
    .group-filter-button:hover,.group-filter-button.is-active{border-color:var(--ember);background:rgba(255,90,31,.12);color:var(--gold)}
    body.stream-clean .group-filter-bar{margin-top:-8px}
  `;
  document.head.appendChild(style);

  const bracketView = document.querySelector("#bracketView");
  const roundHeader = bracketView?.querySelector(".round-header");
  if (!bracketView || !roundHeader || document.querySelector("#groupFilterBar")) return;

  roundHeader.insertAdjacentHTML("afterend", `<div class="group-filter-bar" id="groupFilterBar" aria-label="Group filter buttons"></div>`);
  const bar = document.querySelector("#groupFilterBar");

  function labelForGroup(group) {
    if (group === "all") return "All groups";
    if (group === "none") return "Main bracket";
    return `Group ${group}`;
  }

  function currentGroups(tournament) {
    const groups = [...new Set((tournament.matches || [])
      .filter((match) => String(match.round) === String(state.round))
      .map((match) => match.swiss_group || "none"))]
      .sort((a, b) => Number(a) - Number(b));
    return ["all", ...groups];
  }

  function renderGroupButtons() {
    const tournament = currentTournament();
    if (!tournament || !bar) return;
    const groups = currentGroups(tournament);
    if (groups.length <= 2 && groups[1] === "none") {
      bar.innerHTML = "";
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    bar.innerHTML = [
      `<span class="group-filter-label">Groups</span>`,
      ...groups.map((group) => `
        <button class="group-filter-button${String(state.group) === String(group) ? " is-active" : ""}" type="button" data-group-filter="${esc(group)}" aria-pressed="${String(state.group) === String(group)}">
          ${esc(labelForGroup(group))}
        </button>
      `),
    ].join("");
  }

  bar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-group-filter]");
    if (!button) return;
    state.group = button.dataset.groupFilter;
    if (els.groupSelect) els.groupSelect.value = state.group;
    render();
  });

  const originalRender = render;
  render = function groupFilterRender() {
    originalRender();
    renderGroupButtons();
  };

  render();
})();
