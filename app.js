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
      // Check for nickname: "Nickname (Species)"
      const nickMatch = namePart.match(/^.+?\((.+)\)\s*$/);
      if (nickMatch) {
        mon.name = nickMatch[1].trim();
      } else {
        // Remove gender suffixes
        mon.name = namePart.replace(/\s*\(M\)\s*$/, '').replace(/\s*\(F\)\s*$/, '').trim();
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

  fullPasteEl.addEventListener('input', debouncedParse);
  closedPasteEl.addEventListener('input', debouncedParse);

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

})();
