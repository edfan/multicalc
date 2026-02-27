(function () {
  'use strict';

  const gen = calc.Generations.get(9);

  // ─── DOM refs ─────────────────────────────────────────────
  const fullPasteEl = document.getElementById('full-paste');
  const closedPasteEl = document.getElementById('closed-paste');
  const spreadSection = document.getElementById('spread-section');
  const spreadSelectors = document.getElementById('spread-selectors');
  const calcBtn = document.getElementById('calc-btn');
  const resultsSection = document.getElementById('results-section');
  const gridAttacking = document.getElementById('grid-attacking');
  const gridDefending = document.getElementById('grid-defending');
  const teraSection = document.getElementById('tera-section');
  const teraFullEl = document.getElementById('tera-full');
  const teraClosedEl = document.getElementById('tera-closed');

  let fullTeam = [];
  let closedTeam = [];

  // ─── Persist & restore saved fields ─────────────────────
  function saveField(key, value) {
    try { localStorage.setItem('multicalc_' + key, value); } catch (e) { /* ignore */ }
  }
  function loadField(key) {
    try { return localStorage.getItem('multicalc_' + key) || ''; } catch (e) { return ''; }
  }

  // ─── Paste parser ─────────────────────────────────────────
  function parseTeamPaste(paste, isFull) {
    const blocks = paste.split(/\n\s*\n/).filter(b => b.trim());
    const team = [];

    for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;

      const mon = {
        name: '',
        item: '',
        ability: '',
        teraType: '',
        level: 50,
        evs: isFull ? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } : null,
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        nature: isFull ? '' : null,
        moves: [],
      };

      // Line 1: species / nickname / item
      const first = lines[0];
      const itemSplit = first.split('@');
      let namePart = itemSplit[0].trim();
      if (itemSplit.length > 1) {
        mon.item = itemSplit[1].trim();
      }
      // Remove gender suffixes before checking for nickname
      namePart = namePart.replace(/\s*\(M\)\s*$/, '').replace(/\s*\(F\)\s*$/, '').trim();
      // Check for nickname: "Nickname (Species)"
      const nickMatch = namePart.match(/^.+?\((.+)\)\s*$/);
      if (nickMatch) {
        mon.name = nickMatch[1].trim();
      } else {
        mon.name = namePart;
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('Ability:')) {
          mon.ability = line.replace('Ability:', '').trim();
        } else if (line.startsWith('Level:')) {
          mon.level = parseInt(line.replace('Level:', '').trim()) || 50;
        } else if (line.startsWith('Tera Type:')) {
          mon.teraType = line.replace('Tera Type:', '').trim();
        } else if (line.startsWith('EVs:')) {
          const evStr = line.replace('EVs:', '').trim();
          mon.evs = parseStatLine(evStr);
        } else if (line.startsWith('IVs:')) {
          const ivStr = line.replace('IVs:', '').trim();
          mon.ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, parseStatLine(ivStr));
        } else if (line.endsWith('Nature')) {
          mon.nature = line.replace('Nature', '').trim();
        } else if (line.startsWith('-')) {
          const moveName = line.replace(/^-\s*/, '').trim();
          if (moveName) mon.moves.push(moveName);
        }
      }

      if (mon.name) team.push(mon);
    }
    return team;
  }

  function parseStatLine(str) {
    const stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const mapping = {
      'HP': 'hp', 'Atk': 'atk', 'Def': 'def',
      'SpA': 'spa', 'SpD': 'spd', 'Spe': 'spe',
    };
    const parts = str.split('/').map(s => s.trim());
    for (const part of parts) {
      const m = part.match(/(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)/);
      if (m) {
        stats[mapping[m[2]]] = parseInt(m[1]);
      }
    }
    return stats;
  }

  // ─── Spread selector UI ───────────────────────────────────
  function buildSpreadSelectors(team) {
    spreadSelectors.innerHTML = '';

    for (let i = 0; i < team.length; i++) {
      const mon = team[i];
      const card = document.createElement('div');
      card.className = 'spread-card';

      const h3 = document.createElement('h3');
      h3.textContent = mon.name;
      card.appendChild(h3);

      const spreads = lookupSpreads(mon.name);

      if (spreads && spreads.length) {
        const select = document.createElement('select');
        select.dataset.index = i;
        select.className = 'spread-select';

        for (let j = 0; j < spreads.length; j++) {
          const s = spreads[j];
          const opt = document.createElement('option');
          const evStr = `${s.evs.hp}/${s.evs.atk}/${s.evs.def}/${s.evs.spa}/${s.evs.spd}/${s.evs.spe}`;
          opt.textContent = `${s.nature} ${evStr} (${s.usage.toFixed(1)}%)`;
          opt.value = j;
          select.appendChild(opt);
        }

        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = 'Custom...';
        select.appendChild(customOpt);

        select.addEventListener('change', function () {
          const customDiv = card.querySelector('.custom-inputs');
          if (this.value === 'custom') {
            customDiv.classList.remove('hidden');
          } else {
            customDiv.classList.add('hidden');
          }
        });

        card.appendChild(select);
      } else {
        const noData = document.createElement('div');
        noData.className = 'no-data';
        noData.textContent = 'No Smogon data — using custom';
        card.appendChild(noData);
      }

      // Custom inputs (hidden by default if spreads exist)
      const customDiv = document.createElement('div');
      customDiv.className = 'custom-inputs' + (spreads && spreads.length ? ' hidden' : '');

      // Nature select
      const natures = [
        'Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile',
        'Gentle', 'Hardy', 'Hasty', 'Impish', 'Jolly', 'Lax', 'Lonely',
        'Mild', 'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky', 'Rash',
        'Relaxed', 'Sassy', 'Serious', 'Timid',
      ];
      const natureSelect = document.createElement('select');
      natureSelect.className = 'nature-select';
      natureSelect.dataset.index = i;
      for (const n of natures) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        natureSelect.appendChild(opt);
      }
      customDiv.appendChild(natureSelect);

      // EV inputs
      const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
      const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
      for (let s = 0; s < 6; s++) {
        const label = document.createElement('label');
        label.textContent = statNames[s];
        customDiv.appendChild(label);
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '252';
        input.value = '0';
        input.className = 'ev-input';
        input.dataset.stat = statKeys[s];
        input.dataset.index = i;
        customDiv.appendChild(input);
      }

      card.appendChild(customDiv);
      spreadSelectors.appendChild(card);
    }

    spreadSection.classList.remove('hidden');
  }

  function lookupSpreads(name) {
    if (!window.SPREADS_DATA) return null;
    // Try exact match first
    if (window.SPREADS_DATA[name]) return window.SPREADS_DATA[name];
    // Try case-insensitive
    const lower = name.toLowerCase();
    for (const key of Object.keys(window.SPREADS_DATA)) {
      if (key.toLowerCase() === lower) return window.SPREADS_DATA[key];
    }
    return null;
  }

  function applySelectedSpreads() {
    const cards = spreadSelectors.querySelectorAll('.spread-card');
    for (let i = 0; i < closedTeam.length && i < cards.length; i++) {
      const card = cards[i];
      const select = card.querySelector('.spread-select');
      const mon = closedTeam[i];

      if (select && select.value !== 'custom') {
        const spreads = lookupSpreads(mon.name);
        const s = spreads[parseInt(select.value)];
        mon.nature = s.nature;
        mon.evs = { ...s.evs };
      } else {
        // Custom inputs
        const natureSelect = card.querySelector('.nature-select');
        mon.nature = natureSelect ? natureSelect.value : 'Serious';
        mon.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        const inputs = card.querySelectorAll('.ev-input');
        for (const input of inputs) {
          mon.evs[input.dataset.stat] = parseInt(input.value) || 0;
        }
      }
    }
  }

  // ─── Tera toggle UI ─────────────────────────────────────
  function buildTeraToggles(fullTeamArr, closedTeamArr) {
    teraFullEl.innerHTML = '';
    teraClosedEl.innerHTML = '';
    let anyTera = false;

    function renderToggles(team, container, teamKey) {
      for (let i = 0; i < team.length; i++) {
        const mon = team[i];
        if (!mon.teraType) continue;
        anyTera = true;

        const label = document.createElement('label');
        label.className = 'tera-toggle';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.team = teamKey;
        cb.dataset.index = i;
        cb.addEventListener('change', function () {
          label.classList.toggle('checked', cb.checked);
        });

        const span = document.createElement('span');
        span.textContent = `${mon.name} \u2192 ${mon.teraType}`;

        label.appendChild(cb);
        label.appendChild(span);
        container.appendChild(label);
      }
    }

    renderToggles(fullTeamArr, teraFullEl, 'full');
    renderToggles(closedTeamArr, teraClosedEl, 'closed');

    if (anyTera) {
      teraSection.classList.remove('hidden');
    } else {
      teraSection.classList.add('hidden');
    }
  }

  // ─── Calc engine ──────────────────────────────────────────

  function isStatusMove(moveName) {
    try {
      const moveData = gen.moves.get(calc.toID(moveName));
      return moveData && moveData.category === 'Status';
    } catch {
      return false;
    }
  }

  function buildCalcPokemon(mon, isTera) {
    return new calc.Pokemon(gen, mon.name, {
      level: mon.level,
      item: mon.item || undefined,
      ability: mon.ability || undefined,
      nature: mon.nature || 'Serious',
      evs: mon.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: mon.ivs,
      teraType: isTera && mon.teraType ? mon.teraType : undefined,
    });
  }

  function calculateAllMatchups(attackers, defenders, atkTeraSet, defTeraSet, field) {
    const results = [];

    for (let ai = 0; ai < attackers.length; ai++) {
      const atk = attackers[ai];
      const row = [];
      let atkPoke;
      try {
        atkPoke = buildCalcPokemon(atk, atkTeraSet.has(ai));
      } catch (e) {
        console.warn(`Failed to create Pokemon "${atk.name}":`, e);
        row.push(...defenders.map(() => null));
        results.push({ attacker: atk, matchups: row });
        continue;
      }

      for (let di = 0; di < defenders.length; di++) {
        const def = defenders[di];
        let defPoke;
        try {
          defPoke = buildCalcPokemon(def, defTeraSet.has(di));
        } catch (e) {
          console.warn(`Failed to create Pokemon "${def.name}":`, e);
          row.push(null);
          continue;
        }

        const moveResults = [];
        for (const moveName of atk.moves) {
          if (isStatusMove(moveName)) {
            moveResults.push({ move: moveName, status: true });
            continue;
          }

          try {
            const move = new calc.Move(gen, moveName);
            const result = calc.calculate(gen, atkPoke, defPoke, move, field);
            const range = result.range();
            const defHP = defPoke.rawStats.hp;
            const minPct = (range[0] / defHP) * 100;
            const maxPct = (range[1] / defHP) * 100;

            moveResults.push({
              move: moveName,
              status: false,
              minDmg: range[0],
              maxDmg: range[1],
              minPct,
              maxPct,
              defHP,
              desc: result.fullDesc(),
            });
          } catch (e) {
            moveResults.push({ move: moveName, status: true, error: e.message });
          }
        }

        row.push(moveResults);
      }

      results.push({ attacker: atk, matchups: row });
    }

    return results;
  }

  // ─── Grid renderer ────────────────────────────────────────
  function getDmgClass(minPct, maxPct) {
    if (minPct >= 100) return 'dmg-darkred';
    if (maxPct >= 100) return 'dmg-red';
    if (maxPct >= 50) return 'dmg-orange';
    if (maxPct >= 25) return 'dmg-yellow';
    return 'dmg-green';
  }

  function renderGrid(results, defenders, container) {
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'damage-grid';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = 'Attacker \\ Defender';
    headerRow.appendChild(corner);

    for (const def of defenders) {
      const th = document.createElement('th');
      th.textContent = def.name;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (const row of results) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = row.attacker.name;
      tr.appendChild(th);

      for (const matchup of row.matchups) {
        const td = document.createElement('td');

        if (!matchup) {
          td.textContent = '—';
          tr.appendChild(td);
          continue;
        }

        for (const mr of matchup) {
          const div = document.createElement('div');
          div.className = 'move-line';

          if (mr.status) {
            div.classList.add('dmg-status');
            div.innerHTML = `<span class="move-name">${escapeHtml(mr.move)}</span>`;
            if (mr.error) div.title = mr.error;
          } else {
            const cls = getDmgClass(mr.minPct, mr.maxPct);
            div.classList.add(cls);
            div.innerHTML =
              `<span class="move-name">${escapeHtml(mr.move)}</span> ` +
              `<span class="dmg-range">${mr.minPct.toFixed(1)}-${mr.maxPct.toFixed(1)}%</span>`;
            div.title = mr.desc || '';
          }

          td.appendChild(div);
        }

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Event wiring ─────────────────────────────────────────
  let parseTimer = null;

  function debouncedParse() {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(parseTeams, 300);
  }

  function parseTeams() {
    const fullText = fullPasteEl.value.trim();
    const closedText = closedPasteEl.value.trim();

    fullTeam = fullText ? parseTeamPaste(fullText, true) : [];
    closedTeam = closedText ? parseTeamPaste(closedText, false) : [];

    if (closedTeam.length > 0) {
      buildSpreadSelectors(closedTeam);
    } else {
      spreadSection.classList.add('hidden');
    }

    if (fullTeam.length > 0 && closedTeam.length > 0) {
      buildTeraToggles(fullTeam, closedTeam);
    } else {
      teraSection.classList.add('hidden');
    }

    calcBtn.disabled = !(fullTeam.length > 0 && closedTeam.length > 0);

    // Hide old results when teams change
    resultsSection.classList.add('hidden');
  }

  // ─── RK9 mode toggle & handlers ──────────────────────────
  const modeBtns = document.querySelectorAll('.mode-btn');
  const opponentPasteMode = document.getElementById('opponent-paste-mode');
  const opponentRk9Mode = document.getElementById('opponent-rk9-mode');
  const rk9TournamentId = document.getElementById('rk9-tournament-id');
  const rk9FirstName = document.getElementById('rk9-first-name');
  const rk9LastName = document.getElementById('rk9-last-name');
  const rk9FindBtn = document.getElementById('rk9-find-btn');
  const rk9RoundSelect = document.getElementById('rk9-round-select');
  const rk9Results = document.getElementById('rk9-results');
  const rk9OpponentName = document.getElementById('rk9-opponent-name');
  const rk9LoadBtn = document.getElementById('rk9-load-btn');
  const rk9Status = document.getElementById('rk9-status');

  let rk9Rounds = [];

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      modeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      if (mode === 'paste') {
        opponentPasteMode.classList.remove('hidden');
        opponentRk9Mode.classList.add('hidden');
      } else {
        opponentPasteMode.classList.add('hidden');
        opponentRk9Mode.classList.remove('hidden');
      }
    });
  });

  function setRk9Status(msg, isError) {
    rk9Status.textContent = msg;
    rk9Status.className = 'rk9-status' + (isError ? ' error' : '');
  }

  rk9FindBtn.addEventListener('click', async function () {
    const tournamentId = rk9TournamentId.value.trim();
    const firstName = rk9FirstName.value.trim();
    const lastName = rk9LastName.value.trim();

    if (!tournamentId || !firstName || !lastName) {
      setRk9Status('Please fill in all fields.', true);
      return;
    }

    rk9FindBtn.disabled = true;
    setRk9Status('Fetching pairings...', false);
    rk9Results.classList.add('hidden');

    try {
      const pairings = await fetchAllPairings(tournamentId);
      if (!pairings.length) {
        setRk9Status('No pairings found for this tournament.', true);
        rk9FindBtn.disabled = false;
        return;
      }

      rk9Rounds = findPlayerRounds(pairings, firstName, lastName);
      if (!rk9Rounds.length) {
        setRk9Status(`Player "${firstName} ${lastName}" not found in pairings.`, true);
        rk9FindBtn.disabled = false;
        return;
      }

      // Populate round dropdown
      rk9RoundSelect.innerHTML = '';
      for (const r of rk9Rounds) {
        const opt = document.createElement('option');
        const resultStr = r.result ? ' (' + r.result + ')' : '';
        opt.value = r.round;
        opt.textContent = 'Round ' + r.round + ' vs ' + r.opponent.firstName + ' ' + r.opponent.lastName + resultStr;
        rk9RoundSelect.appendChild(opt);
      }

      // Default to last round
      rk9RoundSelect.value = rk9Rounds[rk9Rounds.length - 1].round;
      updateRk9OpponentDisplay();

      rk9Results.classList.remove('hidden');
      setRk9Status('Found ' + rk9Rounds.length + ' round(s).', false);
    } catch (e) {
      setRk9Status('Error: ' + e.message, true);
    }

    rk9FindBtn.disabled = false;
  });

  function updateRk9OpponentDisplay() {
    const selectedRound = parseInt(rk9RoundSelect.value);
    const roundData = rk9Rounds.find(function (r) { return r.round === selectedRound; });
    if (roundData) {
      rk9OpponentName.textContent = 'Opponent: ' + roundData.opponent.firstName + ' ' + roundData.opponent.lastName;
    }
  }

  rk9RoundSelect.addEventListener('change', updateRk9OpponentDisplay);

  rk9LoadBtn.addEventListener('click', async function () {
    const tournamentId = rk9TournamentId.value.trim();
    const selectedRound = parseInt(rk9RoundSelect.value);
    const roundData = rk9Rounds.find(function (r) { return r.round === selectedRound; });

    if (!roundData) {
      setRk9Status('No round selected.', true);
      return;
    }

    rk9LoadBtn.disabled = true;
    setRk9Status('Fetching roster...', false);

    try {
      const roster = await fetchRoster(tournamentId);
      const rosterEntry = findPlayerInRoster(roster, roundData.opponent.firstName, roundData.opponent.lastName);

      if (!rosterEntry || !rosterEntry.teamId) {
        setRk9Status('Could not find team list for ' + roundData.opponent.firstName + ' ' + roundData.opponent.lastName + '.', true);
        rk9LoadBtn.disabled = false;
        return;
      }

      setRk9Status('Fetching team list...', false);
      const teamData = await fetchTeamList(tournamentId, rosterEntry.teamId);

      if (!teamData.length) {
        setRk9Status('Team list was empty or could not be parsed.', true);
        rk9LoadBtn.disabled = false;
        return;
      }

      // Set closedTeam and trigger existing calc flow
      closedTeam = teamData;

      // Populate the paste textarea for visibility
      closedPasteEl.value = teamData.map(function (mon) {
        let lines = [];
        lines.push(mon.name + (mon.item ? ' @ ' + mon.item : ''));
        if (mon.ability) lines.push('Ability: ' + mon.ability);
        lines.push('Level: ' + mon.level);
        if (mon.teraType) lines.push('Tera Type: ' + mon.teraType);
        for (const move of mon.moves) {
          lines.push('- ' + move);
        }
        return lines.join('\n');
      }).join('\n\n');

      buildSpreadSelectors(closedTeam);
      if (fullTeam.length > 0) {
        buildTeraToggles(fullTeam, closedTeam);
      }
      calcBtn.disabled = !(fullTeam.length > 0 && closedTeam.length > 0);

      setRk9Status('Team loaded successfully!', false);
    } catch (e) {
      setRk9Status('Error: ' + e.message, true);
    }

    rk9LoadBtn.disabled = false;
  });

  fullPasteEl.addEventListener('input', function () {
    saveField('fullPaste', fullPasteEl.value);
    debouncedParse();
  });
  closedPasteEl.addEventListener('input', debouncedParse);

  rk9TournamentId.addEventListener('input', function () {
    saveField('rk9Tournament', rk9TournamentId.value);
  });
  rk9FirstName.addEventListener('input', function () {
    saveField('rk9FirstName', rk9FirstName.value);
  });
  rk9LastName.addEventListener('input', function () {
    saveField('rk9LastName', rk9LastName.value);
  });

  calcBtn.addEventListener('click', function () {
    applySelectedSpreads();

    // Read Tera checkbox states
    const fullTeraSet = new Set();
    const closedTeraSet = new Set();
    teraSection.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
      const idx = parseInt(cb.dataset.index);
      if (cb.dataset.team === 'full') fullTeraSet.add(idx);
      else closedTeraSet.add(idx);
    });

    // Read weather
    const weatherVal = document.querySelector('input[name="weather"]:checked').value || undefined;
    const field = new calc.Field({ gameType: 'Doubles', weather: weatherVal });

    // Direction 1: Your team attacking opponent
    const atkResults = calculateAllMatchups(fullTeam, closedTeam, fullTeraSet, closedTeraSet, field);
    renderGrid(atkResults, closedTeam, gridAttacking);

    // Direction 2: Opponent attacking your team
    const defResults = calculateAllMatchups(closedTeam, fullTeam, closedTeraSet, fullTeraSet, field);
    renderGrid(defResults, fullTeam, gridDefending);

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  });

  // ─── Restore saved fields on load ──────────────────────
  const savedPaste = loadField('fullPaste');
  if (savedPaste) {
    fullPasteEl.value = savedPaste;
    parseTeams();
  }
  const savedTournament = loadField('rk9Tournament');
  if (savedTournament) rk9TournamentId.value = savedTournament;
  const savedFirst = loadField('rk9FirstName');
  if (savedFirst) rk9FirstName.value = savedFirst;
  const savedLast = loadField('rk9LastName');
  if (savedLast) rk9LastName.value = savedLast;

})();
