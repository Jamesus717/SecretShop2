const TeamBalancer = (() => {
  const RANKS = ['Herald','Guardian','Crusader','Archon','Legend','Ancient','Divine','Immortal'];
  const POSITION_OPTIONS = [
    { value: '1', label: 'Pos 1' },
    { value: '2', label: 'Pos 2' },
    { value: '3', label: 'Pos 3' },
    { value: '4', label: 'Pos 4' },
    { value: '5', label: 'Pos 5' },
    { value: 'fill', label: 'Fill' }
  ];
  const STARTER_NAMES = [
    'RoshanRush',
    'BlinkCaller',
    'AegisKeeper',
    'SmokeGanker',
    'LotusWarden',
    'AncientEcho',
    'CreepStacker',
    'RuneSniper',
    'WardHunter',
    'FissureKing',
    'RavageReady',
    'BlackKing',
    'RadiantSoul',
    'DireHowl',
    'MantaMind',
    'HexThread',
    'SplitPusher',
    'DustCarrier'
  ];
  const RANK_MMR = {
    Herald:400, Guardian:1050, Crusader:1750, Archon:2450,
    Legend:3150, Ancient:3850, Divine:4750, Immortal:6000
  };

  let inited = false;
  let playerCount = 0;
  let lastResult = null;

  const el = {
    root: () => document.getElementById('bortyTool-balancer'),
    playersContainer: () => document.getElementById('tbPlayersContainer'),
    addBtn: () => document.getElementById('tbAddBtn'),
    errorBanner: () => document.getElementById('tbErrorBanner'),
    balanceBtn: () => document.getElementById('tbBalanceBtn'),
    spinner: () => document.getElementById('tbSpinner'),
    btnLabel: () => document.getElementById('tbBtnLabel'),
    loadingText: () => document.getElementById('tbLoadingText'),
    resultWrapper: () => document.getElementById('tbResultWrapper'),
    resultEmpty: () => document.getElementById('tbResultEmpty'),
    resultContent: () => document.getElementById('tbResultContent'),
    radiantAvg: () => document.getElementById('tbRadiantAvg'),
    direAvg: () => document.getElementById('tbDireAvg'),
    radiantPlayers: () => document.getElementById('tbRadiantPlayers'),
    direPlayers: () => document.getElementById('tbDirePlayers'),
    radiantCoverage: () => document.getElementById('tbRadiantCoverage'),
    direCoverage: () => document.getElementById('tbDireCoverage'),
    meterNeedle: () => document.getElementById('tbMeterNeedle'),
    meterScoreLabel: () => document.getElementById('tbMeterScoreLabel'),
    meterScore: () => document.getElementById('tbMeterScore'),
    meterDesc: () => document.getElementById('tbMeterDesc'),
    copyBtn: () => document.getElementById('tbCopyBtn'),
    optMMR: () => document.getElementById('tbOpt-mmr'),
    optPos: () => document.getElementById('tbOpt-pos'),
    optVariance: () => document.getElementById('tbOpt-variance'),
    pill: (k) => document.getElementById('tbPill-' + k)
  };

  function init() {
    if (inited) return;
    if (!el.root()) return;
    inited = true;
    
    document.getElementById('bortyTab-balancer')?.addEventListener('click', () => showBortyTool('balancer'));
    document.getElementById('bortyTab-coming')?.addEventListener('click', () => showBortyTool('coming'));
    
    el.addBtn()?.addEventListener('click', () => addPlayer());
    el.balanceBtn()?.addEventListener('click', run);
    el.copyBtn()?.addEventListener('click', copy);
    document.getElementById('tbRerollBtn')?.addEventListener('click', reroll);
    document.getElementById('tbResetBtn')?.addEventListener('click', () => reset(true));

    el.optMMR()?.addEventListener('change', () => togglePill('mmr'));
    el.optPos()?.addEventListener('change', () => togglePill('pos'));
    el.optVariance()?.addEventListener('change', () => togglePill('variance'));

    reset(true);
    seedStarterPlayers();
  }

  function showBortyTool(id) {
    const tabs = ['balancer', 'coming'];
    tabs.forEach(t => {
      const tab = document.getElementById('bortyTab-' + t);
      const pane = document.getElementById('bortyTool-' + t);
      if (tab) tab.classList.toggle('active', t === id);
      if (pane) pane.style.display = t === id ? 'block' : 'none';
    });
  }

  function showBanner(msg) {
    const b = el.errorBanner();
    if (!b) return;
    b.textContent = '⚠ ' + msg;
    b.style.display = 'block';
  }
  function hideBanner() {
    const b = el.errorBanner();
    if (!b) return;
    b.style.display = 'none';
  }

  function updateAddBtn() {
    const root = el.root();
    const btn = el.addBtn();
    if (!root || !btn) return;
    const rows = root.querySelectorAll('.player-row');
    btn.style.display = rows.length >= 10 ? 'none' : 'flex';
  }

  function addPlayer(defaultName = '', defaultRank = '', defaultPos = '') {
    const container = el.playersContainer();
    if (!container) return;
    if (container.querySelectorAll('.player-row').length >= 10) {
      showBanner('Maximum of 10 players allowed.');
      return;
    }
    playerCount++;
    const id = playerCount;
    const row = document.createElement('div');
    row.className = 'player-row';
    row.id = 'tb-pr-' + id;

    row.innerHTML = `
      <div class="player-num-badge">${id}</div>
      <input class="field-input" type="text" placeholder="Player name…" id="tb-pname-${id}" value="${escapeHtml(defaultName)}">
      <select class="rank-select" id="tb-prank-${id}">
        <option value="">— Rank —</option>
        ${RANKS.map(r => `<option value="${r}" ${r===defaultRank?'selected':''}>${r}</option>`).join('')}
      </select>
      <select class="rank-select rank-cell" id="tb-ppos-${id}">
        <option value="">— Position —</option>
        ${POSITION_OPTIONS.map(p => `<option value="${p.value}" ${p.value===String(defaultPos)?'selected':''}>${p.label}</option>`).join('')}
      </select>
      <button class="remove-btn" type="button" data-remove="${id}">✕</button>
    `;

    container.appendChild(row);
    row.querySelector(`[data-remove="${id}"]`)?.addEventListener('click', () => removePlayer(id));
    updateAddBtn();
    hideBanner();
  }

  function sampleUniqueNames(count) {
    const pool = [...STARTER_NAMES];
    shuffleInPlace(pool);
    return pool.slice(0, Math.min(count, pool.length));
  }

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function seedStarterPlayers() {
    const starterNames = sampleUniqueNames(10);
    starterNames.forEach(name => {
      const randomRank = randomFrom(RANKS);
      const randomPos = randomFrom(POSITION_OPTIONS).value;
      addPlayer(name, randomRank, randomPos);
    });
  }

  function removePlayer(id) {
    const row = document.getElementById('tb-pr-' + id);
    if (row) row.remove();
    updateAddBtn();
  }

  function togglePill(key) {
    const pill = el.pill(key);
    const cb = document.getElementById('tbOpt-' + key);
    if (!pill || !cb) return;
    pill.classList.toggle('active', cb.checked);
  }

  function getPlayers() {
    const root = el.root();
    if (!root) return [];
    const rows = root.querySelectorAll('.player-row');
    const result = [];
    rows.forEach(row => {
      const id = row.id.replace('tb-pr-','');
      const name = (document.getElementById('tb-pname-' + id)?.value || '').trim();
      const rank = document.getElementById('tb-prank-' + id)?.value || '';
      const posVal = document.getElementById('tb-ppos-' + id)?.value || '';
      result.push({ id: parseInt(id, 10), name, rank, pos: posVal || '' });
    });
    return result;
  }

  function mmrOf(p) { return RANK_MMR[p.rank] || 400; }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function buildTeams(players, options) {
    const list = [...players].map(p => ({ ...p, mmr: mmrOf(p) }));
    list.sort((a,b) => b.mmr - a.mmr);

    if (options.variance) {
      const buckets = [];
      for (let i = 0; i < list.length; i += 4) buckets.push(list.slice(i, i+4));
      buckets.forEach(shuffleInPlace);
      list.length = 0;
      buckets.forEach(b => list.push(...b));
    }

    const teamA = [];
    const teamB = [];
    const posA = new Map();
    const posB = new Map();
    let sumA = 0;
    let sumB = 0;
    const teamASize = Math.min(5, Math.ceil(list.length / 2));
    const teamBSize = Math.min(5, list.length - teamASize);

    function posPenalty(teamMap, pos) {
      if (!options.pos || !pos || pos === 'fill') return 0;
      return (teamMap.get(pos) || 0) * 60;
    }

    list.forEach(p => {
      const scoreA = sumA + p.mmr + posPenalty(posA, p.pos);
      const scoreB = sumB + p.mmr + posPenalty(posB, p.pos);
      let chooseA = scoreA <= scoreB;
      if (teamA.length >= teamASize) chooseA = false;
      else if (teamB.length >= teamBSize) chooseA = true;
      if (chooseA) {
        teamA.push(p);
        sumA += p.mmr;
        if (p.pos && p.pos !== 'fill') posA.set(p.pos, (posA.get(p.pos) || 0) + 1);
      } else {
        teamB.push(p);
        sumB += p.mmr;
        if (p.pos && p.pos !== 'fill') posB.set(p.pos, (posB.get(p.pos) || 0) + 1);
      }
    });

    const parsed = {
      teamA: teamA.map(p => p.name),
      teamB: teamB.map(p => p.name),
      reasoning: options.variance ? 'Balanced using MMR with slight variance.' : 'Balanced using MMR.'
    };
    return { parsed, teamA, teamB };
  }

  function avgMmr(team) {
    const vals = team.map(p => p.mmr || 0);
    return Math.round(vals.reduce((a,b)=>a+b,0) / (vals.length || 1));
  }

  function positionLabel(pos) {
    if (pos === 'fill') return 'Fill';
    if (!pos) return 'Flex';
    return `Pos ${pos}`;
  }

  function positionBadgeLabel(pos) {
    if (pos === 'fill') return 'Fill';
    return pos || '?';
  }

  function coverageText(team) {
    const covered = new Set();
    let fillCount = 0;
    team.forEach(player => {
      if (player.pos === 'fill') fillCount++;
      else if (player.pos) covered.add(String(player.pos));
    });
    const coveredList = ['1', '2', '3', '4', '5'].filter(pos => covered.has(pos));
    const missingList = ['1', '2', '3', '4', '5'].filter(pos => !covered.has(pos));
    const coveredText = coveredList.length ? coveredList.join(', ') : 'None';
    const missingText = missingList.length ? missingList.join(', ') : 'None';
    const fillText = fillCount ? ` · +${fillCount} Fill` : '';
    return `Roles: ${coveredText} ✓ · Missing: ${missingText}${fillText}`;
  }

  function renderResult(teamA, teamB, parsed) {
    const avgA = avgMmr(teamA);
    const avgB = avgMmr(teamB);
    const diff = Math.abs(avgA - avgB);
    const maxDiff = 2000;
    const score = Math.max(0, Math.round((1 - diff / maxDiff) * 100));

    const rAvg = el.radiantAvg();
    const dAvg = el.direAvg();
    if (rAvg) rAvg.textContent = avgA + ' avg MMR';
    if (dAvg) dAvg.textContent = avgB + ' avg MMR';

    function renderPlayers(team, containerEl, coverageEl) {
      if (!containerEl) return;
      containerEl.innerHTML = '';
      team.forEach((p) => {
        const rank = p.rank || 'Herald';
        const mmr = p.mmr || 400;
        const pct = Math.round((mmr / 6000) * 100);
        const rankKey = rank.toLowerCase();
        const posLabel = positionLabel(p.pos);
        const badgeLabel = positionBadgeLabel(p.pos);
        const badgeStyle = p.pos === 'fill'
          ? 'width:auto;min-width:34px;padding:0 6px;border-radius:999px;font-size:0.52rem;'
          : '';
        containerEl.innerHTML += `
          <div class="team-player">
            <div class="player-pos-badge" style="${badgeStyle}">${badgeLabel}</div>
            <div class="player-info">
              <div class="player-name">${escapeHtml(p.name)} <span style="color:var(--muted);font-size:0.72em;">· ${posLabel}</span></div>
              <div class="player-rank-label rank-${rankKey}">${rank}</div>
            </div>
            <div class="mmr-bar-wrap">
              <div class="mmr-bar-bg"><div class="mmr-bar-fill bar-${rankKey}" style="width:${pct}%"></div></div>
              <div class="mmr-val">~${mmr}</div>
            </div>
          </div>
        `;
      });
      if (coverageEl) coverageEl.textContent = coverageText(team);
    }

    renderPlayers(teamA, el.radiantPlayers(), el.radiantCoverage());
    renderPlayers(teamB, el.direPlayers(), el.direCoverage());

    const needlePct = 50 + ((avgA - avgB) / (maxDiff * 2)) * 100;
    const clampedNeedle = Math.min(95, Math.max(5, needlePct));
    const needle = el.meterNeedle();
    if (needle) needle.style.left = clampedNeedle + '%';

    const scoreLabel = el.meterScoreLabel();
    const scoreEl = el.meterScore();
    if (scoreLabel) scoreLabel.textContent = diff + ' MMR diff';
    if (scoreEl) scoreEl.textContent = score + ' / 100';

    let desc = '';
    if (score >= 90) desc = 'Perfectly balanced.';
    else if (score >= 75) desc = 'Strong balance.';
    else if (score >= 55) desc = 'Decent balance.';
    else desc = 'Uneven — consider re-rolling.';
    const descEl = el.meterDesc();
    if (descEl) descEl.textContent = desc + (parsed.reasoning ? ' · ' + parsed.reasoning : '');

    const wrapper = el.resultWrapper();
    const empty = el.resultEmpty();
    const content = el.resultContent();
    if (wrapper) wrapper.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = 'block';
  }

  function setLoading(isLoading) {
    const btn = el.balanceBtn();
    const spinner = el.spinner();
    const label = el.btnLabel();
    const loadingText = el.loadingText();
    if (btn) btn.disabled = isLoading;
    if (spinner) spinner.style.display = isLoading ? 'block' : 'none';
    if (label) label.textContent = isLoading ? 'Balancing…' : '⚔ Balance Teams ⚔';
    if (loadingText) loadingText.style.display = isLoading ? 'block' : 'none';
  }

  async function run() {
    const players = getPlayers();
    if (players.length < 2) return showBanner('Add at least 2 players to balance.');
    if (players.some(p => !p.name)) return showBanner('Fill in all player names before balancing.');
    if (players.some(p => !p.rank)) return showBanner('Select a rank for every player.');

    hideBanner();
    setLoading(true);

    const options = {
      mmr: !!el.optMMR()?.checked,
      pos: !!el.optPos()?.checked,
      variance: !!el.optVariance()?.checked
    };

    await new Promise(r => setTimeout(r, 450));
    const built = buildTeams(players, options);
    lastResult = built;
    renderResult(built.teamA, built.teamB, built.parsed);
    setLoading(false);
  }

  function reroll() {
    const variance = el.optVariance();
    if (variance) {
      variance.checked = true;
      togglePill('variance');
    }
    run();
  }

  function copy() {
    if (!lastResult) return;
    const { parsed } = lastResult;
    const txt = `⚔️ SecretLeague Draft ⚔️\n\n🌿 Radiant:\n${parsed.teamA.map((n,i)=>`  ${i+1}. ${n}`).join('\n')}\n\n🔥 Dire:\n${parsed.teamB.map((n,i)=>`  ${i+1}. ${n}`).join('\n')}\n\n${parsed.reasoning || ''}`;
    navigator.clipboard.writeText(txt).then(() => {
      const btn = el.copyBtn();
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = prev, 2000);
    });
  }

  function reset(soft = false) {
    const container = el.playersContainer();
    if (container) container.innerHTML = '';
    playerCount = 0;
    lastResult = null;
    const wrapper = el.resultWrapper();
    const empty = el.resultEmpty();
    const content = el.resultContent();
    const radCoverage = el.radiantCoverage();
    const direCoverage = el.direCoverage();
    if (wrapper) wrapper.style.display = 'block';
    if (empty) empty.style.display = 'flex';
    if (content) content.style.display = 'none';
    if (radCoverage) radCoverage.textContent = '';
    if (direCoverage) direCoverage.textContent = '';
    updateAddBtn();
    hideBanner();
    if (!soft) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  return { init, addPlayer, removePlayer, togglePill, run, reroll, copy, reset };
})();

document.addEventListener('DOMContentLoaded', () => TeamBalancer.init());
window.TeamBalancer = TeamBalancer;
