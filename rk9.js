// rk9.js — RK9.gg data fetching and HTML parsing

const RK9_PROXY = 'https://cors-header-proxy.edwardzfan.workers.dev/?url=';

async function fetchRk9Html(path, htmx) {
  const url = RK9_PROXY + encodeURIComponent('https://rk9.gg' + path);
  const headers = {};
  if (htmx) headers['HX-Request'] = 'true';
  const resp = await fetch(url, { headers: headers });
  if (!resp.ok) throw new Error(`Failed to fetch ${path}: ${resp.status}`);
  const html = await resp.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// Discover available pods and rounds from the main pairings page tabs
function discoverPodRounds(doc) {
  const podRounds = []; // [{pod, rounds: [1,2,...]}]
  // Tabs have hx-get attributes like /pairings/{id}?pod=0&rnd=1
  const tabs = doc.querySelectorAll('[hx-get*="rnd="]');
  const podMap = {};
  for (const tab of tabs) {
    const hxGet = tab.getAttribute('hx-get') || '';
    const podMatch = hxGet.match(/pod=(\d+)/);
    const rndMatch = hxGet.match(/rnd=(\d+)/);
    if (podMatch && rndMatch) {
      const pod = parseInt(podMatch[1]);
      const rnd = parseInt(rndMatch[1]);
      if (!podMap[pod]) podMap[pod] = [];
      podMap[pod].push(rnd);
    }
  }
  for (const pod of Object.keys(podMap).sort((a, b) => a - b)) {
    podRounds.push({ pod: parseInt(pod), rounds: podMap[pod].sort((a, b) => a - b) });
  }
  return podRounds;
}

function parsePairingsFragment(doc, pod, round) {
  const pairings = [];
  const matches = doc.querySelectorAll('div.match, .row.match');
  for (const match of matches) {
    const p1El = match.querySelector('.player1 span.name');
    const p2El = match.querySelector('.player2 span.name');
    if (!p1El || !p2El) continue;

    const parseName = (el) => {
      const html = el.innerHTML;
      // Format: "FirstName<br> LastName [CC]<br>"
      const brParts = html.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
      const firstName = brParts[0] || '';
      // Strip country code like [US] from last name
      const lastName = (brParts[1] || '').replace(/\s*\[.*?\]\s*$/, '').trim();
      return { firstName, lastName };
    };

    const player1 = parseName(p1El);
    const player2 = parseName(p2El);

    // Determine winner from CSS classes on player divs
    let winner = null;
    const p1Div = match.querySelector('.player1');
    const p2Div = match.querySelector('.player2');
    if (p1Div && p1Div.classList.contains('winner')) {
      winner = player1.firstName + ' ' + player1.lastName;
    } else if (p2Div && p2Div.classList.contains('winner')) {
      winner = player2.firstName + ' ' + player2.lastName;
    }

    const tableEl = match.querySelector('.tablenumber');
    const table = tableEl ? tableEl.textContent.trim() : '';

    pairings.push({ round, pod, table, player1, player2, winner });
  }
  return pairings;
}

async function fetchAllPairings(tournamentId) {
  // First, fetch the main page to discover available pods/rounds
  const mainDoc = await fetchRk9Html('/pairings/' + tournamentId, false);
  const podRounds = discoverPodRounds(mainDoc);

  if (!podRounds.length) return [];

  // Fetch all pod/round combos in parallel
  const fetches = [];
  for (const pr of podRounds) {
    for (const rnd of pr.rounds) {
      fetches.push(
        fetchRk9Html('/pairings/' + tournamentId + '?pod=' + pr.pod + '&rnd=' + rnd, true)
          .then(function (doc) { return { doc, pod: pr.pod, round: rnd }; })
          .catch(function () { return null; })
      );
    }
  }

  const results = await Promise.all(fetches);
  const pairings = [];
  for (const r of results) {
    if (!r) continue;
    const parsed = parsePairingsFragment(r.doc, r.pod, r.round);
    pairings.push.apply(pairings, parsed);
  }

  return pairings;
}

function findPlayerRounds(pairings, firstName, lastName) {
  const first = firstName.toLowerCase();
  const last = lastName.toLowerCase();

  const rounds = [];
  for (const p of pairings) {
    let opponent = null;

    if (p.player1.firstName.toLowerCase() === first &&
        p.player1.lastName.toLowerCase() === last) {
      opponent = p.player2;
    } else if (p.player2.firstName.toLowerCase() === first &&
               p.player2.lastName.toLowerCase() === last) {
      opponent = p.player1;
    }

    if (opponent) {
      let result = null;
      if (p.winner) {
        const playerName = (firstName + ' ' + lastName).toLowerCase();
        result = p.winner.toLowerCase() === playerName ? 'W' : 'L';
      }

      rounds.push({
        round: p.round,
        pod: p.pod,
        opponent: { firstName: opponent.firstName, lastName: opponent.lastName },
        table: p.table,
        result,
      });
    }
  }

  rounds.sort((a, b) => a.round - b.round);
  return rounds;
}

async function fetchRoster(tournamentId) {
  const doc = await fetchRk9Html('/roster/' + tournamentId, false);
  const rows = doc.querySelectorAll('table tbody tr');
  const roster = [];

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;

    // Column 0 = player ID, 1 = first name, 2 = last name
    const fn = cells[1].textContent.trim();
    const ln = cells[2].textContent.trim();

    let teamId = '';
    const links = row.querySelectorAll('a');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/teamlist\/public\/[^/]+\/(.+)/);
      if (match) {
        teamId = match[1];
        break;
      }
    }

    let division = '';
    for (const cell of cells) {
      const cellText = cell.textContent.trim();
      if (['Masters', 'Seniors', 'Juniors'].includes(cellText)) {
        division = cellText;
        break;
      }
    }

    roster.push({ firstName: fn, lastName: ln, teamId, division });
  }

  return roster;
}

function findPlayerInRoster(roster, firstName, lastName) {
  const first = firstName.toLowerCase();
  const last = lastName.toLowerCase();
  return roster.find(function (r) {
    return r.firstName.toLowerCase() === first && r.lastName.toLowerCase() === last;
  });
}

async function fetchTeamList(tournamentId, teamId) {
  const doc = await fetchRk9Html('/teamlist/public/' + tournamentId + '/' + teamId, false);

  const langSection = doc.querySelector('div.translation.lang-EN') || doc.body;
  const pokemonDivs = langSection.querySelectorAll('div.pokemon');
  const team = [];

  for (const div of pokemonDivs) {
    // Species is a bare text node in div.pokemon (after <img>, before <b> tags)
    // Extract by getting innerHTML and parsing the text before the first <b>
    const html = div.innerHTML;
    let species = '';
    const beforeBold = html.split(/<b\b/i)[0] || '';
    // Strip HTML tags (img, etc.) and &nbsp; from that chunk
    const speciesText = beforeBold.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    // Take the last non-empty line (species name comes after img whitespace)
    const speciesLines = speciesText.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (speciesLines.length) {
      species = speciesLines[speciesLines.length - 1].replace(/^#?\d*\s*/, '').trim();
      // Convert forme notation: "Ogerpon [Wellspring Mask]" -> "Ogerpon-Wellspring"
      const formeMatch = species.match(/^(.+?)\s*\[(.+?)\]$/);
      if (formeMatch) {
        const base = formeMatch[1];
        const forme = formeMatch[2].trim();
        if (/^Incarnate/i.test(forme)) {
          // Tornadus [Incarnate Forme] -> Tornadus
          species = base;
        } else if (/^Single Strike/i.test(forme)) {
          // Urshifu [Single Strike Style] -> Urshifu
          species = base;
        } else if (/^Rapid Strike/i.test(forme)) {
          // Urshifu [Rapid Strike Style] -> Urshifu-Rapid-Strike
          species = base + '-Rapid-Strike';
        } else {
          // Default: take first word, e.g. [Wellspring Mask] -> -Wellspring
          species = base + '-' + forme.split(/\s+/)[0];
        }
      }
    }

    // Tera Type, Ability, Held Item are in <b> tags with values as adjacent text
    let teraType = '', ability = '', item = '';
    const bolds = div.querySelectorAll('b');
    for (const b of bolds) {
      const label = b.textContent.trim();
      // The value is the text node immediately after the <b> element
      let value = '';
      let sibling = b.nextSibling;
      while (sibling && sibling.nodeType === 3) {
        value += sibling.textContent;
        sibling = sibling.nextSibling;
      }
      value = value.replace(/&nbsp;/g, ' ').trim();

      if (label.startsWith('Tera Type:')) {
        teraType = value;
      } else if (label.startsWith('Ability:')) {
        ability = value;
      } else if (label.startsWith('Held Item:')) {
        item = value;
      }
    }

    // Moves are in h5 > span.badge
    const moves = [];
    const badges = div.querySelectorAll('h5 span.badge');
    for (const badge of badges) {
      const move = badge.textContent.trim();
      if (move) moves.push(move);
    }

    if (species) {
      team.push({
        name: species,
        item: item,
        ability: ability,
        teraType: teraType,
        level: 50,
        moves: moves,
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        nature: '',
      });
    }
  }

  return team;
}
