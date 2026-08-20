(() => {
  const highlightStyle = document.createElement("style");
  highlightStyle.textContent = `
    .match-card.is-decided-match{
      border-color:rgba(118,242,164,.72);
      border-top-color:var(--green);
      box-shadow:0 0 0 1px rgba(118,242,164,.18),0 18px 42px var(--shadow);
      background:linear-gradient(135deg,rgba(118,242,164,.10),rgba(12,17,24,.94) 34%);
    }
    .match-card.is-decided-match .match-head::after{
      content:"Decided";
      margin-left:10px;
      color:var(--green);
      font-weight:900;
      letter-spacing:.08em;
    }
    .match-card.is-decided-match .score{
      border-color:rgba(118,242,164,.38);
    }
    .bracket-round.is-locked .match-card.is-decided-match{
      border-color:var(--line);
      border-top-color:rgba(255,90,31,.65);
      box-shadow:0 18px 42px var(--shadow);
      background:rgba(12,17,24,.54);
    }
    .bracket-round.is-locked .match-card.is-decided-match .match-head::after{
      content:"";
      margin:0;
    }
  `;
  document.head.appendChild(highlightStyle);

  function targetWins(bestOf) {
    return Math.floor(Number(bestOf || 1) / 2) + 1;
  }

  function isDecided(match) {
    return Boolean(match?.winner)
      || Number(match?.player_1_wins || 0) >= targetWins(match?.best_of)
      || Number(match?.player_2_wins || 0) >= targetWins(match?.best_of);
  }

  if (typeof renderMatchCard !== "function" || renderMatchCard.__phoenixDecisionHighlight) return;

  const originalRenderMatchCard = renderMatchCard;
  renderMatchCard = function highlightedMatchCard(match, visible) {
    const html = originalRenderMatchCard(match, visible);
    if (!visible || !isDecided(match)) return html;
    return html.replace('<article class="match-card">', '<article class="match-card is-decided-match">');
  };
  renderMatchCard.__phoenixDecisionHighlight = true;

  render();
})();
