/* Pioche 7 — interface, animations, sauvegarde */
(() => {
  'use strict';
  const { WORDS, TARGET, FLIP7_BONUS, roundScore, uniqueCount, hasX2, hasDiv, hasZero, shuffle } = P7;
  const { avatarSVG, CHARS, PLAYER_CHOICES } = P7Avatars;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const COLORS = ['#6b7280', '#b7791f', '#65a30d', '#db2777', '#0891b2', '#16a34a', '#7c3aed', '#dc2626', '#2563eb', '#ea580c', '#be185d', '#0f766e', '#1e3a8a', '#9333ea'];
  const BOTS = [{ name: 'Zoé', avatar: 'zoe' }, { name: 'Hugo', avatar: 'hugo' }, { name: 'Lina', avatar: 'lina' }];
  const LEGACY = { '🙂': 'me', '🦊': 'zoe', '🐻': 'hugo', '🐼': 'lina' };
  const PCOLOR = { me: '#f6c945', zoe: '#f472b6', hugo: '#34d399', lina: '#c084fc' };
  const pcol = k => PCOLOR[k] || (CHARS[k] && CHARS[k].bg) || '#fff';
  const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
  const MODES = { normal: 'Normale', vengeance: 'Vengeance' };
  const SPEEDS = {
    normal: { fly: 420, hold: 1000, think: 650, toast: 1400, banner: 1400, auto: 2600 },
    rapide: { fly: 260, hold: 520, think: 300, toast: 850, banner: 900, auto: 1700 },
  };
  const QUIPS = {
    stay: ['Je m\'arrête !', 'Ça me suffit !', 'Je mets à l\'abri !', 'Pas de risque !', 'Je garde mes points !'],
    bust: ['Oh non !', 'Zut alors !', 'Pas de chance…', 'Nooon !', 'Aïe aïe aïe…'],
    hit: ['Encore une !', 'Allez !', 'Je tente !', 'Ça passe !', 'Une petite dernière…'],
    stop: ['Stop pour toi !', 'Arrête-toi là !', 'Pas si vite !'],
    three: ['Pioche donc 3 cartes !', 'À toi de risquer !', 'Bonne chance !'],
    saved: ['Ouf !', 'Sauvé !', 'De justesse !'],
    seven: ['SEPT !!!', 'Incroyable !', 'Yesss !'],
    mean: ['Cadeau empoisonné !', 'Tiens, pour toi !', 'Désolé pas désolé !', 'Hé hé hé…', 'Vengeance !'],
    steal: ['Merci bien !', 'Je prends ça !', 'C\'est à moi maintenant !'],
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const settings = Object.assign({ difficulty: 'moyen', speed: 'normal', sound: true, mode: 'normal', name: '', avatar: 'me' }, store.get('p7_settings', {}));
  if (!PLAYER_CHOICES.includes(settings.avatar)) settings.avatar = 'me';
  const SPD = () => SPEEDS[settings.speed] || SPEEDS.normal;
  const saveSettings = () => store.set('p7_settings', settings);

  let G = null, token = 0, paused = false, humanCb = null;
  const pendingUser = new Set();
  const moodOverride = {};

  /* ---------- Annulation propre (nouvelle partie pendant une animation) ---------- */
  class Cancel extends Error {}
  function guard(t) { if (t !== token) throw new Cancel(); }
  function wait(ms) {
    const t = token;
    return new Promise((res, rej) => {
      setTimeout(async () => {
        while (paused && t === token) await new Promise(r => setTimeout(r, 120));
        t === token ? res() : rej(new Cancel());
      }, ms);
    });
  }
  function waitUser(setup) {
    const t = token;
    return new Promise((res, rej) => {
      const entry = { rej };
      pendingUser.add(entry);
      setup(v => { pendingUser.delete(entry); t === token ? res(v) : rej(new Cancel()); });
    });
  }
  function cancelAll() {
    token++;
    for (const e of pendingUser) e.rej(new Cancel());
    pendingUser.clear();
    humanCb = null;
    setButtons(false);
    $('#fxLayer').innerHTML = '';
    $('#revealDim').classList.remove('on');
    hideOverlay();
    $$('.seven-ov,.round-banner,.fly-cap,.go').forEach(e => e.remove());
  }

  /* ---------- Sons (Web Audio, aucun fichier) ---------- */
  let actx = null;
  function tone(freq, dur, type = 'sine', vol = .12, when = 0) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + when;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + .02);
    } catch (e) { /* audio indisponible */ }
  }
  const SND = {
    draw() { tone(520, .07, 'triangle', .1); tone(800, .09, 'triangle', .07, .05); },
    place() { tone(330, .06, 'triangle', .08); },
    bust() { tone(200, .3, 'sawtooth', .1); tone(130, .45, 'sawtooth', .09, .14); },
    stop() { tone(440, .12, 'square', .06); tone(330, .22, 'square', .06, .11); },
    good() { tone(660, .1, 'triangle', .1); tone(990, .16, 'triangle', .09, .08); },
    pop() { tone(880, .06, 'sine', .08); tone(1320, .08, 'sine', .06, .05); },
    flip7() { [523, 659, 784, 1047, 1319, 1568].forEach((f, k) => tone(f, .3, 'triangle', .11, k * .09)); },
    click() { tone(260, .05, 'square', .04); },
    win() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, k) => tone(f, .28, 'triangle', .1, k * .13)); },
    lose() { [392, 349, 311, 262].forEach((f, k) => tone(f, .35, 'triangle', .09, k * .2)); },
  };
  const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };

  /* ================= Rendu des cartes ================= */
  const ICONS = {
    stop: '<svg viewBox="0 0 100 100" class="icon"><polygon points="30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30" fill="#fff"/><polygon points="33,11 67,11 89,33 89,67 67,89 33,89 11,67 11,33" fill="#b91c1c"/><g fill="#fff"><rect x="34" y="27" width="8" height="30" rx="4"/><rect x="44" y="21" width="8" height="34" rx="4"/><rect x="54" y="23" width="8" height="32" rx="4"/><rect x="64" y="29" width="7.5" height="27" rx="3.75"/><path d="M34 49h37.5v11a17 17 0 0 1-17 17h-3.5a17 17 0 0 1-17-17z"/><rect x="21" y="47" width="8" height="22" rx="4" transform="rotate(-38 25 58)"/></g></svg>',
    three: '<svg viewBox="0 0 100 100" class="icon"><g stroke="#1d2433" stroke-width="3.5" stroke-linejoin="round"><rect x="14" y="24" width="36" height="52" rx="6" fill="#fffaf0" transform="rotate(-20 32 50)"/><rect x="50" y="24" width="36" height="52" rx="6" fill="#fffaf0" transform="rotate(20 68 50)"/><rect x="32" y="18" width="36" height="52" rx="6" fill="#fff"/></g><text x="50" y="57" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-size="34" font-weight="900" fill="#e0a10d" stroke="#1d2433" stroke-width="2.5" paint-order="stroke">3</text></svg>',
    second: '<svg viewBox="0 0 100 100" class="icon"><path d="M50 88C19 67 6 51 6 33a21 21 0 0 1 44-10 21 21 0 0 1 44 10c0 18-13 34-44 55z" fill="#fff" stroke="#1d2433" stroke-width="3.5"/><path d="M50 37v28M36 51h28" stroke="#e11d63" stroke-width="10" stroke-linecap="round"/></svg>',
  };
  Object.assign(ICONS, {
    jom: '<svg viewBox="0 0 100 100" class="icon"><g stroke="#1d2433" stroke-width="3.5" stroke-linejoin="round"><rect x="24" y="12" width="42" height="60" rx="7" fill="#fff" transform="rotate(-8 45 42)"/></g><text x="44" y="54" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-size="30" font-weight="900" fill="#ea580c" stroke="#1d2433" stroke-width="2.2" paint-order="stroke">+1</text><polygon points="66,58 80,58 90,68 90,82 80,92 66,92 56,82 56,68" fill="#fff"/><polygon points="67.5,61.5 78.5,61.5 86.5,69.5 86.5,80.5 78.5,88.5 67.5,88.5 59.5,80.5 59.5,69.5" fill="#b91c1c"/><rect x="65" y="73" width="16" height="4" rx="2" fill="#fff"/></svg>',
    swap: '<svg viewBox="0 0 100 100" class="icon"><g stroke="#1d2433" stroke-width="3" stroke-linejoin="round"><rect x="10" y="24" width="30" height="42" rx="5" fill="#fff" transform="rotate(-10 25 45)"/><rect x="60" y="34" width="30" height="42" rx="5" fill="#fff" transform="rotate(10 75 55)"/></g><path d="M34 18 Q52 4 70 22" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M62 16 L72 24 L60 28Z" fill="#fff"/><path d="M66 84 Q48 98 30 80" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M38 86 L28 78 L40 74Z" fill="#fff"/></svg>',
    steal: '<svg viewBox="0 0 100 100" class="icon"><path d="M6 40 Q50 22 94 40 L88 64 Q70 74 56 60 Q50 55 44 60 Q30 74 12 64Z" fill="#1d2433" stroke="#fff" stroke-width="3"/><ellipse cx="31" cy="48" rx="9" ry="6" fill="#fde68a"/><ellipse cx="69" cy="48" rx="9" ry="6" fill="#fde68a"/><circle cx="33" cy="48" r="3" fill="#1d2433"/><circle cx="71" cy="48" r="3" fill="#1d2433"/><path d="M6 40 L-2 30 M94 40 L102 30" stroke="#1d2433" stroke-width="5"/></svg>',
    discard: '<svg viewBox="0 0 100 100" class="icon"><g stroke="#1d2433" stroke-width="3.5" stroke-linejoin="round"><path d="M24 30 H76 L70 90 H30Z" fill="#fff"/><rect x="18" y="20" width="64" height="10" rx="3" fill="#fff"/><rect x="40" y="10" width="20" height="10" rx="3" fill="#fff"/></g><path d="M40 42 V80 M50 42 V80 M60 42 V80" stroke="#7c3aed" stroke-width="5" stroke-linecap="round"/></svg>',
    four: '<svg viewBox="0 0 100 100" class="icon"><g stroke="#1d2433" stroke-width="3" stroke-linejoin="round"><rect x="8" y="30" width="30" height="44" rx="5" fill="#fffaf0" transform="rotate(-24 23 52)"/><rect x="24" y="22" width="30" height="44" rx="5" fill="#fffaf0" transform="rotate(-8 39 44)"/><rect x="46" y="22" width="30" height="44" rx="5" fill="#fffaf0" transform="rotate(8 61 44)"/><rect x="62" y="30" width="30" height="44" rx="5" fill="#fff" transform="rotate(24 77 52)"/></g><text x="50" y="62" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-size="40" font-weight="900" fill="#65a30d" stroke="#1d2433" stroke-width="2.6" paint-order="stroke">4</text></svg>',
  });
  const ACT_TEXT = {
    stop: 'STOP<small>Le joueur visé s\'arrête</small>',
    three: 'TROIS À LA SUITE<small>Le joueur visé pioche 3 cartes</small>',
    second: 'SECONDE CHANCE<small>Annule un doublon</small>',
    jom: 'ENCORE UNE !<small>Le joueur visé pioche 1 carte puis s\'arrête</small>',
    swap: 'ÉCHANGE<small>Échange 2 cartes entre joueurs</small>',
    steal: 'VOL<small>Prends une carte d\'un adversaire</small>',
    discard: 'DÉFAUSSE<small>Retire une carte de la table</small>',
    four: 'QUATRE À LA SUITE<small>Le joueur visé pioche 4 cartes</small>',
  };
  const SPECIAL = {
    zero: { word: 'MAUDIT', ic: '☠️', tip: '0 point sauf avec 7 numéros · interdit de s\'arrêter' },
    u7: { word: 'MALCHANCE', ic: '🐈‍⬛', tip: 'Défausse toutes tes autres cartes' },
    l13: { word: 'BONHEUR', ic: '🍀', tip: 'Autorise un deuxième 13' },
  };
  const SVG_SHIELD = '<svg viewBox="0 0 100 100" class="ev-icon"><path d="M50 6 L86 20 V48 C86 72 70 88 50 95 C30 88 14 72 14 48 V20Z" fill="#22c55e" stroke="#fff" stroke-width="6"/><path d="M32 50 L45 63 L69 38" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SVG_TROPHY = '<svg viewBox="0 0 100 100" class="ev-icon"><path d="M28 12h44v22a22 22 0 0 1-44 0z" fill="#f6c945" stroke="#a16207" stroke-width="4"/><path d="M28 18H14c0 16 8 24 18 24M72 18h14c0 16-8 24-18 24" fill="none" stroke="#a16207" stroke-width="5"/><rect x="44" y="56" width="12" height="16" fill="#e0a526"/><rect x="30" y="72" width="40" height="12" rx="3" fill="#a16207"/><path d="M40 22 v14" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/></svg>';

  function cardHTML(c, o = {}) {
    const st = o.w ? `--cw:${o.w}px;` : '';
    const cls = (o.mini ? ' mini' : '') + (o.cls ? ' ' + o.cls : '');
    if (c.t === 'n') {
      const sp = c.sp && SPECIAL[c.sp];
      return `<div class="card num${sp ? ' sp sp-' + c.sp : ''}${cls}" style="${st}--c:${COLORS[c.v]}" data-id="${c.id}">` +
        `<div class="ray"></div><div class="frame"></div><div class="gem t"></div>` +
        `<span class="corner tl">${c.v}</span><span class="corner br">${c.v}</span>` +
        `<div class="big${c.v >= 10 ? ' two' : ''}">${c.v}</div><div class="word">${sp ? sp.word : WORDS[c.v]}</div>` +
        `${sp ? `<span class="spb">${sp.ic}</span>` : ''}</div>`;
    }
    if (c.t === 'm') {
      const s = c.v > 0 ? '+' + c.v : '−' + (-c.v);
      return `<div class="card mod${c.v < 0 ? ' neg' : ''}${cls}" style="${st}" data-id="${c.id}"><div class="frame"></div>` +
        `<div class="big">${s}</div><div class="mod-sub">${s} POINTS</div></div>`;
    }
    if (c.t === 'div') {
      return `<div class="card mod neg div${cls}" style="${st}" data-id="${c.id}"><div class="frame"></div>` +
        `<div class="big">÷2</div><div class="mod-sub">SCORE ÷2</div></div>`;
    }
    if (c.t === 'x2') {
      return `<div class="card mod x2${cls}" style="${st}" data-id="${c.id}"><div class="frame"></div>` +
        `<div class="big">×2</div><div class="mod-sub">NUMÉROS ×2</div></div>`;
    }
    return `<div class="card act ${c.a}${cls}" style="${st}" data-id="${c.id}"><div class="frame"></div>` +
      `${ICONS[c.a]}<div class="act-text">${ACT_TEXT[c.a]}</div></div>`;
  }
  const backHTML = w => `<div class="card back" style="--cw:${w}px"></div>`;
  const placed = (html, style) => html.replace('style="', `style="${style}`);

  /* ================= Personnages ================= */
  function moodOf(p, i) {
    const o = moodOverride[i];
    if (o && o.until > Date.now()) return o.mood;
    if (G && G.over) return G.winner === i ? 'excited' : 'neutral';
    if (p.flip7) return 'excited';
    if (p.status === 'busted') return 'sad';
    if (p.status === 'frozen') return roundScore(p) >= 15 ? 'happy' : 'shock';
    if (p.status === 'stayed') return 'happy';
    if (G && G.cur === i && G.phase !== 'end' && !p.human) return 'think';
    return 'neutral';
  }
  function setMood(i, mood, ms = 2200) { moodOverride[i] = { mood, until: Date.now() + ms }; }
  const ava = (i, mood, cls) => avatarSVG(G.players[i].avatar, mood || moodOf(G.players[i], i), cls);

  function say(i, text) {
    const el = i === 0 ? $('#meAva') : $(`.opp[data-i="${i}"] .opp-ava`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = text;
    b.style.left = (r.right + 4) + 'px';
    b.style.top = (r.top - 8) + 'px';
    $('#fxLayer').appendChild(b);
    setTimeout(() => b.remove(), Math.max(1500, SPD().toast + 300));
  }

  /* ================= Rendu de la table ================= */
  function specials(p) {
    const list = [...p.mods];
    if (p.second) list.push(p.second);
    list.push(...p.actions);
    return list;
  }
  function badgeOf(p, i) {
    if (p.flip7) return ['seven', '7 cartes ★'];
    if (p.status === 'busted') return ['bust', 'Éliminé ✖'];
    if (p.status === 'frozen') return ['frozen', 'Stoppé ✋'];
    if (p.status === 'stayed') return ['stay', 'Arrêté ✔'];
    if (G.cur === i && G.phase !== 'end') return ['turn', p.human ? 'À toi !' : '<i></i><i></i><i></i>'];
    return ['', ''];
  }
  function calcText(p) {
    if (p.status === 'busted') return 'Doublon : 0 point';
    if (!p.numbers.length && !p.mods.length) return '';
    let s = p.numbers.map(c => c.v).join('+') || '0';
    if (hasX2(p)) s = `(${s}) ×2`;
    if (hasDiv(p)) s = `(${s}) ÷2`;
    for (const m of p.mods) if (m.t === 'm') s += m.v > 0 ? ` +${m.v}` : ` −${-m.v}`;
    if (hasZero(p) && !p.flip7) return s + ' → Zéro maudit = 0';
    if (p.flip7) s += ` +${FLIP7_BONUS}`;
    return s + ` = ${roundScore(p)}`;
  }

  let prevScores = [], lastMeTotal = null, shownMeRound = 0;
  function render(pop) {
    if (!G) return;
    $('#roundNo').textContent = G.round;
    $('#deckCount').textContent = G.deck.length;
    $('#discardCount').textContent = G.discard.length;
    const top = G.discard[G.discard.length - 1];
    $('#discardTop').outerHTML = top ? `<div id="discardTop">${cardHTML(top, { w: 50, mini: true })}</div>` : '<div id="discardTop" class="slot-empty"></div>';

    const mark = (c, extra) => cardHTML(c, { mini: true, cls: [(c.id === pop ? 'pop' : ''), extra || ''].join(' ').trim() });

    // Adversaires
    $('#opponents').innerHTML = G.players.slice(1).map((p, k) => {
      const i = k + 1;
      const [bc, bt] = badgeOf(p, i);
      const out = p.status !== 'active' && !p.flip7;
      const turn = G.cur === i && !out && G.phase !== 'end';
      const nums = p.numbers.map(c => mark(c)).join('') + (p.bustCard ? mark(p.bustCard, 'dup') : '');
      const specs = specials(p).map(c => mark(c)).join('') + p.pending.map(c => mark(c, 'pending')).join('');
      return `<div class="opp${out ? ' is-out' : ''}${p.flip7 ? ' is-seven' : ''}${turn ? ' is-turn' : ''}${p.status === 'busted' ? ' is-bust' : ''}" data-i="${i}" style="--pc:${pcol(p.avatar)}">
        <div class="opp-ava">${ava(i)}${G.dealer === i ? '<span class="dealer-chip" title="Donneur">D</span>' : ''}</div>
        <div class="opp-main">
          <div class="opp-head"><span class="pname">${p.name}</span><span class="badge ${bc}">${bt}</span>
            <span class="opp-scores"><span class="r">+${roundScore(p)}</span><span class="t">${p.total}<small>pts</small></span></span></div>
          <div class="opp-cards"><div class="row nums" data-zone="${i}-n">${nums}</div><div class="row specs" data-zone="${i}-s">${specs}</div></div>
        </div>
      </div>`;
    }).join('');

    // Moi
    const me = G.players[0];
    $('#meName').textContent = myName();
    $('#roundMode').textContent = isV() ? 'Vengeance' : '';
    document.body.classList.toggle('mode-v', isV());
    const zoneW = $('#me').clientWidth || 360;
    const cw = Math.max(34, Math.min(56, Math.floor((zoneW - 22 - 6 * 4) / 7)));
    $('#meNums').style.setProperty('--cw', cw + 'px');
    const used = me.numbers.length + (me.bustCard ? 1 : 0);
    let nums = me.numbers.map(c => mark(c)).join('') + (me.bustCard ? mark(me.bustCard, 'dup') : '');
    for (let k = used; k < 7; k++) nums += `<div class="slot">${k + 1}</div>`;
    $('#meNums').innerHTML = nums;
    $('#meSpecs').innerHTML = specials(me).map(c => mark(c)).join('') + me.pending.map(c => mark(c, 'pending')).join('');
    const [bc, bt] = badgeOf(me, 0);
    $('#meBadge').className = 'badge ' + bc;
    $('#meBadge').innerHTML = bt;
    $('#meAva').innerHTML = ava(0) + (G.dealer === 0 ? '<span class="dealer-chip" title="Donneur">D</span>' : '');
    countTo($('#meRound'), roundScore(me));
    setNum('#meTotal', me.total, lastMeTotal); lastMeTotal = me.total;
    $('#meProgress').innerHTML = `<b>${uniqueCount(me)}</b>/7 numéros`;
    $('#meDetail').textContent = calcText(me);
    const meOut = me.status !== 'active' && !me.flip7;
    $('#me').classList.toggle('is-seven', me.flip7);
    $('#me').classList.toggle('is-out', meOut);
    $('#me').classList.toggle('is-turn', G.cur === 0 && !meOut && G.phase !== 'end');

    // Points qui s'envolent
    G.players.forEach((p, i) => {
      const s = roundScore(p);
      const prev = prevScores[i];
      if (prev != null && s > prev) floatScore(i, `+${s - prev}`, 'up');
      else if (prev != null && s < prev && p.status !== 'busted') floatScore(i, `−${prev - s}`, 'down');
      prevScores[i] = s;
    });
  }
  function floatScore(i, text, kind) {
    const el = i === 0 ? $('#meRound') : $(`.opp[data-i="${i}"] .opp-scores`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'float-score ' + kind;
    f.textContent = text;
    f.style.left = (r.left + r.width / 2) + 'px';
    f.style.top = r.top + 'px';
    $('#fxLayer').appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }
  function setNum(sel, v, prev) {
    const el = $(sel);
    el.textContent = v;
    if (prev !== null && prev !== v) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function countTo(el, v) {
    const from = shownMeRound;
    if (from === v) { el.textContent = v; return; }
    shownMeRound = v;
    const t0 = performance.now(), d = 450;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    (function step(t) {
      const k = Math.min(1, (t - t0) / d);
      el.textContent = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && shownMeRound === v) requestAnimationFrame(step);
    })(t0);
  }
  function zoneEl(i) { return i === 0 ? $('#me') : $(`.opp[data-i="${i}"]`); }
  function setStatus(html) { $('#status').innerHTML = html; }
  function nameOf(i) { return G.players[i].name; }
  // Nom affiché (le moteur garde « Toi » pour conjuguer le journal à la 2e personne)
  function myName() { return (G && G.players[0].display) || settings.name || 'Toi'; }
  function dispName(i) { return i === 0 ? myName() : G.players[i].name; }
  const isV = () => G && G.mode === 'vengeance';
  const mustHit = p => isV() && p.status === 'active' && hasZero(p);
  const mini = (c, w = 28) => `<span class="tp-card">${cardHTML(c, { w, mini: true })}</span>`;

  /* ---------- Bannière d'événement des robots (non bloquante) ---------- */
  let toastTimer = null;
  function botPop(i, theme, title, text) {
    const t = $('#toast');
    t.className = 'toast tp-' + theme;
    t.innerHTML = `${i != null ? `<div class="tp-ava">${ava(i)}</div>` : ''}<div class="tp-body"><div class="tp-title">${title}</div>${text ? `<div class="tp-text">${text}</div>` : ''}</div>`;
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), SPD().toast);
    return wait(SPD().toast);
  }

  /* ================= Boutons PIOCHER / ARRÊTER ================= */
  function setButtons(on) {
    $('#btnHit').disabled = !on;
    $('#btnStay').disabled = !on || (G && mustHit(G.players[0]));
    $('#deckPile').classList.toggle('glow', on);
    $('#me').classList.toggle('my-turn', on);
  }
  function ripple(btn, e) {
    const r = btn.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const sp = document.createElement('span');
    sp.className = 'ripple';
    const x = (e && e.clientX ? e.clientX : r.left + r.width / 2) - r.left - s / 2;
    const y = (e && e.clientY ? e.clientY : r.top + r.height / 2) - r.top - s / 2;
    sp.style.cssText = `width:${s}px;height:${s}px;left:${x}px;top:${y}px`;
    btn.appendChild(sp);
    setTimeout(() => sp.remove(), 600);
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 140);
  }
  function choose(v, btn, e) {
    if (!humanCb) return;
    if (btn) ripple(btn, e);
    SND.click();
    const cb = humanCb; humanCb = null;
    setButtons(false);
    cb(v);
  }
  $('#btnHit').addEventListener('click', e => choose('hit', e.currentTarget, e));
  $('#btnStay').addEventListener('click', e => choose('stay', e.currentTarget, e));
  $('#deckPile').addEventListener('click', () => choose('hit', $('#btnHit')));

  /* ================= Pioche animée ================= */
  // Fin d'animation garantie, même si le navigateur suspend le rendu
  const animDone = (a, ms) => Promise.race([a.finished.catch(() => {}), new Promise(r => setTimeout(r, ms + 150))]);
  async function revealCard(card, i, ctx = {}) {
    const t = token;
    SND.draw();
    render();
    const p = G.players[i];
    setStatus(p.human ? 'Tu pioches…' : `<b>${p.name}</b> pioche…`);
    if (!p.human && !ctx.deal && !ctx.n && !ctx.jom && Math.random() < .3) say(i, pick(QUIPS.hit));
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = Math.round(Math.min(200, vw * 0.5, vh * 0.3)), H = Math.round(W * 1.4);
    const left = (vw - W) / 2, topY = (vh - H) / 2 - 24;
    const el = document.createElement('div');
    el.className = 'fly';
    el.style.cssText = `width:${W}px;height:${H}px;left:${left}px;top:${topY}px`;
    el.innerHTML = `<div class="fly-glow"></div><div class="flip"><div class="face fback">${backHTML(W)}</div><div class="face ffront">${cardHTML(card, { w: W })}</div></div>`;
    const cap = document.createElement('div');
    cap.className = 'fly-cap';
    cap.style.top = (topY + H + 14) + 'px';
    cap.innerHTML = `<span class="cap-ava">${ava(i)}</span><span>${p.human ? 'Tu pioches' : `${p.name} pioche`}` +
      (ctx.n ? `<small>${ctx.n === 4 ? 'Quatre' : 'Trois'} à la suite · carte ${ctx.k}/${ctx.n}</small>` : ctx.jom ? '<small>Encore une ! · puis stop</small>' : ctx.deal ? '<small>Distribution</small>' : '') + '</span>';
    $('#fxLayer').append(el, cap);
    $('#revealDim').classList.add('on');

    const d = $('#deckTop').getBoundingClientRect();
    const dx = d.left + d.width / 2 - (left + W / 2), dy = d.top + d.height / 2 - (topY + H / 2);
    const a1 = el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${d.width / W}) rotate(-8deg)` }, { transform: 'none' }],
      { duration: SPD().fly, easing: 'cubic-bezier(.2,.9,.25,1.15)' });
    el.querySelector('.flip').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
      { duration: SPD().fly * 1.1, easing: 'ease-out', fill: 'both' });
    await animDone(a1, SPD().fly);
    guard(t);
    if (card.t === 'a' || card.t === 'x2' || card.t === 'div' || card.sp) SND.pop();
    await wait(SPD().hold);

    let zone = document.querySelector(`[data-zone="${i}-${card.t === 'n' ? 'n' : 's'}"]`);
    if (!zone || !zone.getBoundingClientRect().width) zone = document.querySelector(`[data-zone="${i}-n"]`) || zoneEl(i);
    const z = zone.getBoundingClientRect();
    const endW = i === 0 ? (card.t === 'n' ? 46 : 38) : 26;
    const tx = z.left + Math.min(z.width / 2 + 20, Math.max(endW, z.width - endW / 2)) - (left + W / 2);
    const ty = z.top + z.height / 2 - (topY + H / 2);
    cap.remove();
    $('#revealDim').classList.remove('on');
    const a2 = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${tx}px,${ty}px) scale(${endW / W}) rotate(6deg)`, opacity: .75 }],
      { duration: SPD().fly * .85, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    await animDone(a2, SPD().fly * .85);
    el.remove();
    guard(t);
    SND.place();
  }

  /* ================= Pop-ups d'événement ================= */
  const CHECK = '<svg viewBox="0 0 24 24" class="ok-ic"><path d="M4 12.5l5 5L20 6.5" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function sparkles(n = 10) {
    let s = '';
    for (let k = 0; k < n; k++) {
      s += `<i class="spk" style="left:${Math.random() * 96}%;top:${Math.random() * 90}%;animation-delay:${(Math.random() * 2).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.9).toFixed(2)}"></i>`;
    }
    return s;
  }
  function evHTML(o) {
    return `<div class="ev ev-${o.theme}">
      <div class="ev-bg"><div class="ev-rays"></div>${sparkles()}</div>
      ${o.art ? `<div class="ev-art">${o.art}</div>` : ''}
      <div class="ev-ribbon"><span>${o.title}</span></div>
      ${o.text ? `<div class="ev-text">${o.text}</div>` : ''}
      ${o.extra || ''}
      ${o.ok === null ? '' : `<button class="ev-ok" data-v="ok">${CHECK}<span>${o.ok || 'OK'}</span></button>`}
      ${o.auto ? `<div class="ev-timer"><i style="animation-duration:${o.auto}ms"></i></div>` : ''}
    </div>`;
  }
  function hideOverlay() {
    const ov = $('#overlay');
    ov.classList.remove('on');
    ov.innerHTML = '';
    ov.onclick = null;
  }
  function eventPop(o) {
    return waitUser(done => {
      const ov = $('#overlay');
      ov.innerHTML = evHTML(o);
      ov.classList.add('on');
      if (o.confetti) startConfettiIn(ov.querySelector('.ev'));
      let timer = null, finished = false;
      const finish = v => {
        if (finished) return; finished = true;
        clearTimeout(timer); hideOverlay(); done(v);
      };
      ov.onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        SND.click();
        finish(b.dataset.v);
      };
      if (o.auto) timer = setTimeout(() => finish('ok'), o.auto);
    });
  }
  function startConfettiIn(host) {
    if (!host) return;
    const cv = document.createElement('canvas');
    cv.className = 'ev-confetti';
    host.prepend(cv);
    requestAnimationFrame(() => {
      const stop = confetti(cv, 70);
      const obs = new MutationObserver(() => { if (!document.body.contains(cv)) { stop(); obs.disconnect(); } });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  function scoresBox(p, label, zero) {
    const s = zero ? 0 : roundScore(p);
    return `<div class="ev-scores"><div class="es-row"><span>${label}</span><b class="${s > 0 ? 'plus' : 'zero'}">${s > 0 ? '+' : ''}${s} pts</b></div>
      <div class="es-row"><span>Total</span><b>${p.total + s} pts</b></div>
      <div class="es-calc">${zero ? 'Doublon : aucun point' : (calcText(p) || 'Aucune carte')}</div></div>`;
  }

  async function stopPop(d) {
    const me = G.players[0];
    SND.stop();
    if (d.kind === 'freeze' && d.from !== 0) {
      setMood(d.from, 'wink', 3000);
      await eventPop({
        theme: 'red', title: 'STOP !',
        art: `<div class="art-duo">${ava(d.from, 'wink', 'big')}<div class="art-sign">${ICONS.stop}</div></div>`,
        text: `<b>${nameOf(d.from)}</b> t'arrête !<br>Ta manche est terminée.`,
        extra: scoresBox(me, 'Ton score'),
      });
      return;
    }
    if (d.kind === 'jom') {
      await eventPop({
        theme: 'orange', title: 'STOP FORCÉ !',
        art: `<div class="art-duo">${ava(0, 'shock', 'big')}<div class="art-card">${cardHTML({ t: 'a', a: 'jom' }, { w: 66 })}</div></div>`,
        text: 'Après « Encore une ! », tu dois t\'arrêter.<br><small>Tes cartes restent attaquables jusqu\'à la fin de la manche.</small>',
        extra: scoresBox(me, 'Ton score'),
      });
      return;
    }
    await eventPop({
      theme: 'blue', title: 'TU T\'ARRÊTES !',
      art: `<div class="art-duo">${ava(0, 'happy', 'big')}<div class="art-sign">${SVG_SHIELD}</div></div>`,
      text: isV() ? 'Tu ne pioches plus, mais attention :<br><small>tes cartes restent la cible des coups bas jusqu\'à la fin de la manche.</small>'
        : d.kind === 'stay' ? 'Tes points sont à l\'abri pour cette manche.' : 'Tu te donnes la carte STOP : tu gardes tes points.',
      extra: scoresBox(me, isV() ? 'Score actuel' : 'Ton score'),
    });
  }

  async function bustPop(d) {
    const me = G.players[0];
    const first = me.numbers.find(c => c.v === d.card.v);
    await eventPop({
      theme: 'red', title: 'ÉLIMINÉ !',
      art: `<div class="art-duo">${ava(0, 'sad', 'big')}<div class="art-cards">${first ? cardHTML(first, { w: 62 }) : ''}${cardHTML(d.card, { w: 62, cls: 'dup' })}</div></div>`,
      text: `<b>Doublon de ${d.card.v} !</b><br>Tu perds la manche et ne marques aucun point.`,
      extra: scoresBox(me, 'Ton score', true),
    });
  }

  function askTarget(i, kind, cands, card) {
    const T = {
      stop: ['red', 'STOP !', 'À qui donnes-tu la carte STOP ?<br><small>Il s\'arrête tout de suite et garde ses points.</small>'],
      three: ['purple', '3 À LA SUITE !', 'Choisis un joueur qui piochera 3 cartes.<br><small>Il s\'arrête s\'il fait un doublon.</small>'],
      second: ['pink', 'SECONDE CHANCE', 'Tu en as déjà une : à qui l\'offres-tu ?'],
      mod: ['red', 'MALUS !', 'À qui donnes-tu ce malus ?<br><small>Il compte à la fin de la manche.</small>'],
      jom: ['orange', 'ENCORE UNE !', 'Qui doit piocher 1 carte puis s\'arrêter ?<br><small>Même un joueur déjà arrêté.</small>'],
      four: ['green', '4 À LA SUITE !', 'Choisis un joueur qui piochera 4 cartes.<br><small>Les cartes spéciales sont jouées après, s\'il survit.</small>'],
    }[kind];
    card = card || { t: 'a', a: kind };
    const tiles = cands.map(j => {
      const p = G.players[j];
      return `<button class="tile${j === 0 ? ' self' : ''}" data-v="${j}" style="--pc:${pcol(p.avatar)}">
        <span class="tile-ava">${ava(j)}</span>
        <span class="tile-name">${j === 0 ? 'Moi' : p.name}${p.status !== 'active' ? ' <small>(arrêté)</small>' : ''}</span>
        <span class="tile-info">manche ${roundScore(p)} · ${p.total} pts</span>
        <span class="tile-cards">${[...p.numbers, ...(isV() ? p.mods : [])].map(c => cardHTML(c, { mini: true })).join('') || '<em>aucune carte</em>'}</span>
      </button>`;
    }).join('');
    render();
    return eventPop({
      theme: T[0], title: T[1], text: T[2], ok: null,
      art: `<div class="art-card">${cardHTML(card, { w: 78 })}</div>`,
      extra: `<div class="tiles n${cands.length}">${tiles}</div>`,
    }).then(Number);
  }

  // Choix d'une carte posée devant un joueur (Vol, Défausse, Échange)
  function askCard(i, kind, opts, ctx = {}) {
    const me = G.players[i];
    const firstCard = ctx.first ? findCard(ctx.first.j, ctx.first.id) : null;
    const T = {
      steal: ['slate', 'VOL !', 'Quelle carte veux-tu voler ?<br><small>Un numéro que tu as déjà te ferait sauter (⚠).</small>', 'steal'],
      discard: ['violet', 'DÉFAUSSE', 'Quelle carte retirer de la table ?<br><small>Tu peux aussi retirer une des tiennes (un malus, le Zéro…).</small>', 'discard'],
      swap1: ['cyan', 'ÉCHANGE', 'Choisis la <b>1<sup>re</sup> carte</b> à échanger.<br><small>Les deux cartes doivent appartenir à deux joueurs différents.</small>', 'swap'],
      swap2: ['cyan', 'ÉCHANGE', `Avec quelle carte échanger ${firstCard ? mini(firstCard, 24) : ''} <b>${firstCard ? (dispOwner(ctx.first.j)) : ''}</b> ?`, 'swap'],
    }[kind];
    const rows = opts.map(o => {
      const p = G.players[o.j];
      const cards = o.cards.map(c => {
        const risky = kind === 'steal' && c.t === 'n' && P7.isDup(me, c);
        return `<button class="pick${risky ? ' risky' : ''}" data-v="${o.j}:${c.id}">${cardHTML(c, { w: 38 })}</button>`;
      }).join('');
      return `<div class="pick-row" style="--pc:${pcol(p.avatar)}"><span class="pick-who"><span class="pick-ava">${ava(o.j)}</span><b>${o.j === 0 ? 'Moi' : p.name}</b></span><div class="pick-cards">${cards}</div></div>`;
    }).join('');
    render();
    return eventPop({
      theme: T[0], title: T[1], text: T[2], ok: null,
      art: `<div class="art-card">${cardHTML({ t: 'a', a: T[3] }, { w: 64 })}</div>`,
      extra: `<div class="picks">${rows}</div>`,
    }).then(v => { const [j, id] = String(v).split(':').map(Number); return { j, id }; });
  }
  function findCard(j, id) { const p = G.players[j]; return [...p.numbers, ...p.mods].find(c => c.id === id); }
  function dispOwner(j) { return j === 0 ? '(à toi)' : `(à ${G.players[j].name})`; }

  /* ---------- Animation « 7 cartes » ---------- */
  function flip7Anim(i) {
    SND.flip7();
    vibrate([60, 40, 60, 40, 140]);
    const p = G.players[i];
    return waitUser(done => {
      const ov = document.createElement('div');
      ov.className = 'seven-ov';
      const n = p.numbers.length;
      const fan = p.numbers.map((c, k) => {
        const a = (k - (n - 1) / 2) * 11;
        return placed(cardHTML(c), `transform:translateX(-50%) rotate(${a}deg);animation-delay:${0.2 + k * 0.09}s;`);
      }).join('');
      ov.innerHTML = `<div class="rays"></div><canvas></canvas>
        <div class="seven-fan">${fan}</div>
        <div class="seven-title">SEPT&nbsp;!</div>
        <div class="seven-ribbon"><span>${p.human ? 'Incroyable ! Tu alignes 7 numéros !' : `${p.name} aligne 7 numéros !`}</span></div>
        <div class="seven-row"><div class="seven-ava">${ava(i, 'excited')}</div><div class="seven-bonus">+${FLIP7_BONUS} POINTS</div></div>
        <div class="seven-tap">Touchez pour continuer</div>`;
      document.body.appendChild(ov);
      const stopConfetti = confetti(ov.querySelector('canvas'));
      let closed = false;
      const close = () => {
        if (closed) return; closed = true;
        stopConfetti(); ov.remove(); done();
      };
      setTimeout(() => ov.addEventListener('click', close), 900);
      setTimeout(close, settings.speed === 'rapide' ? 3400 : 4800);
    });
  }
  function confetti(cv, count = 170) {
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = (cv.clientWidth || window.innerWidth) * dpr;
    cv.height = (cv.clientHeight || window.innerHeight) * dpr;
    const cols = COLORS.concat(['#f6c945', '#ff7b54', '#ffffff', '#34d399']);
    const parts = Array.from({ length: count }, () => ({
      x: cv.width / 2 + (Math.random() - .5) * cv.width * .3, y: cv.height * .4,
      vx: (Math.random() - .5) * 22 * dpr, vy: (-Math.random() * 20 - 6) * dpr,
      s: (5 + Math.random() * 7) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: cols[Math.floor(Math.random() * cols.length)],
    }));
    let run = true;
    (function frame() {
      if (!run) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const q of parts) {
        q.vy += .45 * dpr; q.vx *= .99; q.x += q.vx; q.y += q.vy; q.r += q.vr;
        if (q.y > cv.height + 20) { q.y = -10; q.x = Math.random() * cv.width; q.vy = Math.random() * 4 * dpr; }
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = q.c;
        ctx.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2); ctx.restore();
      }
      requestAnimationFrame(frame);
    })();
    return () => { run = false; };
  }

  function roundBanner() {
    const b = document.createElement('div');
    b.className = 'round-banner';
    b.style.animationDuration = SPD().banner + 'ms';
    b.innerHTML = `<div class="rb-ribbon"><span>MANCHE ${G.round}</span></div><small>${nameOf(G.dealer) === 'Toi' ? 'Tu distribues' : nameOf(G.dealer) + ' distribue'}</small>`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), SPD().banner + 50);
    return wait(SPD().banner);
  }

  const MEDAL = ['🥇', '🥈', '🥉', '4'];
  function ranked() {
    return G.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.total - a.p.total);
  }
  async function roundSummary(d) {
    const byRound = G.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.last - a.p.last);
    const rows = byRound.map(({ p, i }, k) => `
      <div class="rs-row${i === 0 ? ' me' : ''}" style="animation-delay:${0.15 + k * 0.12}s">
        <span class="rs-medal">${MEDAL[k]}</span><span class="rs-ava">${ava(i)}</span>
        <span class="rs-name">${esc(dispName(i))}<span class="bar"><i style="--w:${Math.min(100, p.total / TARGET * 100)}%"></i></span></span>
        <span class="rs-pts ${p.last > 0 ? 'plus' : 'zero'}">+${p.last}</span><span class="rs-tot">${p.total}</span>
      </div>`).join('');
    const f7 = G.flip7 !== null ? `⭐ ${G.flip7 === 0 ? 'Tu as' : nameOf(G.flip7) + ' a'} réussi 7 numéros !<br>` : '';
    const tie = d.tie ? '<b>Égalité en tête au-delà de 200 : manche décisive !</b><br>' : '';
    await eventPop({
      theme: 'blue', title: 'FIN DE MANCHE',
      text: `${f7}${tie}Manche ${G.round} · premier à ${TARGET} points`,
      extra: `<div class="rs">${rows}</div>`, ok: 'Manche suivante',
    });
  }

  async function gameOver(d) {
    const won = d.winner === 0;
    if (!G.recorded) {
      G.recorded = true;
      const hist = store.get('p7_history', []);
      hist.unshift({
        date: Date.now(), difficulty: G.difficulty, mode: G.mode, rounds: G.round,
        ranking: ranked().map(({ p, i }) => ({ name: dispName(i), avatar: p.avatar, total: p.total, human: p.human })),
        winner: G.players[d.winner].name, humanWon: won,
      });
      store.set('p7_history', hist.slice(0, 30));
      store.del('p7_save');
    }
    won ? SND.win() : SND.lose();
    const rk = ranked();
    const order = [1, 0, 2, 3].filter(k => rk[k]);
    const cols = order.map(k => {
      const { p, i } = rk[k];
      const mood = k === 0 ? 'excited' : k === rk.length - 1 ? 'sad' : 'happy';
      return `<div class="pod pod-${k + 1}" style="animation-delay:${0.3 + (3 - k) * 0.15}s">
        <div class="pod-ava">${ava(i, mood)}</div>
        <div class="pod-block"><span class="pod-rank">${k + 1}</span><div class="pod-label"><b>${esc(dispName(i))}</b>${p.total} pts</div></div>
      </div>`;
    }).join('');
    const w = G.players[d.winner];
    const v = await waitUser(done => {
      const el = document.createElement('div');
      el.className = 'go ' + (won ? 'go-win' : 'go-lose');
      el.innerHTML = `<div class="ev-rays"></div><canvas></canvas>
        <div class="go-ribbon"><span>${won ? 'VICTOIRE !' : 'DÉFAITE !'}</span></div>
        <div class="go-sub">${won ? `Tu remportes la partie en ${G.round} manche${G.round > 1 ? "s" : ""} !` : `${w.name} remporte la partie avec ${w.total} pts.`}</div>
        <div class="podium">${cols}</div>
        <div class="go-actions"><button class="go-btn" data-v="again"><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="#fff"/></svg>Nouvelle partie</button>
        <button class="go-menu" data-v="home" aria-label="Accueil"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>`;
      document.body.appendChild(el);
      const stop = won ? confetti(el.querySelector('canvas'), 140) : () => {};
      el.onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        SND.click(); stop(); el.remove(); done(b.dataset.v);
      };
    });
    if (v === 'again') newGame(); else showHome();
  }

  /* ================= Pont moteur ↔ interface ================= */
  const ui = {
    save: saveGame,
    async think(i, kind) {
      setStatus(`<b>${nameOf(i)}</b> ${kind === 'turn' ? 'réfléchit…' : ['steal', 'discard', 'swap'].includes(kind) ? 'choisit une carte…' : 'choisit un joueur…'}`);
      render();
      await wait(kind === 'turn' ? SPD().think : SPD().think * 1.2);
    },
    askChoice() {
      render();
      setStatus(mustHit(G.players[0]) ? '<b>Zéro maudit !</b><br>Tu dois continuer à piocher.' : '<b>À toi de jouer !</b><br>Piocher ou arrêter ?');
      return waitUser(done => { humanCb = done; setButtons(true); });
    },
    askTarget,
    askCard,
    reveal: revealCard,
    async event(type, d) {
      switch (type) {
        case 'update': render(d.pop); return;
        case 'roundStart': prevScores = []; shownMeRound = 0; render(); setStatus(`Manche ${G.round}`); await roundBanner(); return;
        case 'reshuffle': botPop(null, 'blue', '🔀 Mélange !', 'La défausse reforme la pioche'); return;
        case 'stay':
          render();
          if (d.i === 0) await stopPop({ kind: 'stay' });
          else { SND.stop(); say(d.i, pick(QUIPS.stay)); setStatus(`${nameOf(d.i)} s'arrête`); await botPop(d.i, 'blue', `${nameOf(d.i)} s'arrête`, isV() ? `avec <b>${roundScore(G.players[d.i])}</b> pts (encore attaquable)` : `Il garde <b>${roundScore(G.players[d.i])}</b> pts`.replace('Il', G.players[d.i].avatar === 'hugo' ? 'Il' : 'Elle')); }
          return;
        case 'bust': {
          render();
          SND.bust();
          const z = zoneEl(d.i); z && z.classList.add('shake');
          floatScore(d.i, '💥', 'down');
          if (d.i === 0) { vibrate([90, 60, 160]); await wait(500); await bustPop(d); }
          else { say(d.i, pick(QUIPS.bust)); await botPop(d.i, 'red', 'ÉLIMINÉ !', `${nameOf(d.i)} pioche un 2<sup>e</sup> ${d.card.v}`); }
          return;
        }
        case 'second':
          render(); SND.good();
          if (d.i === 0) {
            await eventPop({
              theme: 'pink', title: 'SECONDE CHANCE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(0, 'happy', 'big')}<div class="art-card">${cardHTML({ t: 'a', a: 'second' }, { w: 66 })}</div></div>`,
              text: `<b>Ouf !</b> Le ${d.card.v} en double est annulé.<br>Tu restes en jeu !`,
            });
          } else { say(d.i, pick(QUIPS.saved)); await botPop(d.i, 'pink', 'SECONDE CHANCE !', `${nameOf(d.i)} est sauvé${G.players[d.i].avatar === 'hugo' ? '' : 'e'} du doublon de ${d.card.v}`); }
          return;
        case 'discardSecond':
          await botPop(d.i, 'pink', 'Seconde chance en trop', 'Personne ne peut la recevoir : défaussée');
          return;
        case 'give':
          render(); SND.good();
          await botPop(d.from, 'pink', 'Cadeau !', `${d.from === 0 ? 'Tu donnes' : nameOf(d.from) + ' donne'} une Seconde chance à ${d.to === 0 ? 'toi' : nameOf(d.to)}`);
          return;
        case 'freeze':
          render();
          if (d.to === 0) await stopPop({ kind: 'freeze', from: d.from });
          else {
            SND.stop();
            if (d.from !== 0 && d.from !== d.to) { setMood(d.from, 'wink'); say(d.from, pick(QUIPS.stop)); }
            setMood(d.to, d.from === d.to ? 'happy' : 'shock');
            render();
            await botPop(d.from, 'red', 'STOP !', d.from === d.to ? `${nameOf(d.from)} se donne STOP et garde ${roundScore(G.players[d.to])} pts`
              : `${d.from === 0 ? 'Tu arrêtes' : nameOf(d.from) + ' arrête'} ${nameOf(d.to)}`);
          }
          return;
        case 'three':
          render(); SND.good();
          if (d.to === 0 && d.from !== 0) {
            setMood(d.from, 'wink', 3000);
            await eventPop({
              theme: 'purple', title: '3 À LA SUITE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.from, 'wink', 'big')}<div class="art-backs">${backHTML(46)}${backHTML(46)}${backHTML(46)}</div></div>`,
              text: `<b>${nameOf(d.from)}</b> te fait piocher 3 cartes !`,
            });
          } else {
            if (d.from !== 0 && d.from !== d.to) say(d.from, pick(QUIPS.three));
            await botPop(d.from, 'purple', '3 À LA SUITE !', d.from === d.to ? `${d.from === 0 ? 'Tu pioches' : nameOf(d.from) + ' pioche'} 3 cartes` : `${d.from === 0 ? 'Tu fais' : nameOf(d.from) + ' fait'} piocher 3 cartes à ${nameOf(d.to)}`);
          }
          return;
        case 'four':
          render(); SND.good();
          if (d.to === 0 && d.from !== 0) {
            setMood(d.from, 'wink', 3000);
            await eventPop({
              theme: 'green', title: '4 À LA SUITE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.from, 'wink', 'big')}<div class="art-backs four">${backHTML(42)}${backHTML(42)}${backHTML(42)}${backHTML(42)}</div></div>`,
              text: `<b>${nameOf(d.from)}</b> te fait piocher 4 cartes !<br><small>Les cartes spéciales seront jouées après, si tu survis.</small>`,
            });
          } else {
            if (d.from !== 0 && d.from !== d.to) say(d.from, pick(QUIPS.three));
            await botPop(d.from, 'green', '4 À LA SUITE !', d.from === d.to ? `${d.from === 0 ? 'Tu pioches' : nameOf(d.from) + ' pioche'} 4 cartes` : `${d.from === 0 ? 'Tu fais' : nameOf(d.from) + ' fait'} piocher 4 cartes à ${nameOf(d.to)}`);
          }
          return;
        case 'jom':
          render(); SND.stop();
          if (d.to === 0 && d.from !== 0) {
            setMood(d.from, 'wink', 3000);
            await eventPop({
              theme: 'orange', title: 'ENCORE UNE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.from, 'wink', 'big')}<div class="art-card">${cardHTML({ t: 'a', a: 'jom' }, { w: 66 })}</div></div>`,
              text: `<b>${nameOf(d.from)}</b> te fait piocher une carte…<br>puis tu devras t'arrêter !`,
            });
          } else {
            if (d.from !== 0 && d.from !== d.to) say(d.from, pick(QUIPS.mean));
            await botPop(d.from, 'orange', 'ENCORE UNE !', d.from === d.to
              ? (d.from === 0 ? 'Tu pioches une carte puis tu t\'arrêtes' : `${nameOf(d.from)} pioche une carte puis s'arrête`)
              : `${nameOf(d.to)} doit piocher une carte puis s'arrêter`);
          }
          return;
        case 'forcedStay':
          render();
          if (d.i === 0) await stopPop({ kind: 'jom' });
          else { SND.stop(); setMood(d.i, 'shock'); await botPop(d.i, 'orange', `${nameOf(d.i)} doit s'arrêter`, `avec <b>${roundScore(G.players[d.i])}</b> pts pour l'instant`); }
          return;
        case 'mod': {
          render(); SND.bust();
          const self = d.from === d.to;
          if (d.to === 0 && d.from !== 0) {
            setMood(d.from, 'wink', 3000); setMood(0, 'sad');
            await eventPop({
              theme: 'red', title: 'MALUS !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.from, 'wink', 'big')}<div class="art-card">${cardHTML(d.card, { w: 66 })}</div></div>`,
              text: `<b>${nameOf(d.from)}</b> te donne un malus ${d.card.t === 'div' ? '<b>÷2</b> : ton score sera divisé par deux' : `de <b>${-d.card.v}</b> points`} !`,
              extra: scoresBox(G.players[0], 'Score actuel'),
            });
          } else {
            if (!self && d.from !== 0) say(d.from, pick(QUIPS.mean));
            if (!self) setMood(d.to, 'sad');
            await botPop(d.from, 'red', 'MALUS !', `${self ? (d.from === 0 ? 'Tu dois garder' : nameOf(d.from) + ' doit garder') : (d.from === 0 ? 'Tu donnes' : nameOf(d.from) + ' donne')} ${mini(d.card)}${self ? '' : ` à ${nameOf(d.to)}`}`);
          }
          return;
        }
        case 'steal': {
          render(); SND.pop();
          if (d.from === 0) {
            setMood(d.i, 'wink', 3000); setMood(0, 'shock');
            await eventPop({
              theme: 'slate', title: 'AU VOLEUR !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.i, 'wink', 'big')}<div class="art-card">${cardHTML(d.card, { w: 66 })}</div></div>`,
              text: `<b>${nameOf(d.i)}</b> te vole ${d.card.t === 'n' ? 'ton' : 'ta carte'} <b>${P7.label(d.card)}</b> !`,
            });
          } else {
            if (d.i !== 0) say(d.i, pick(QUIPS.steal));
            await botPop(d.i, 'slate', 'VOL !', `${d.i === 0 ? 'Tu voles' : nameOf(d.i) + ' vole'} ${mini(d.card)} à ${nameOf(d.from)}`);
          }
          return;
        }
        case 'discard': {
          render(); SND.place();
          const own = d.i === d.from;
          if (d.from === 0 && d.i !== 0) {
            setMood(d.i, 'wink', 3000);
            await eventPop({
              theme: 'violet', title: 'DÉFAUSSE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.i, 'wink', 'big')}<div class="art-card">${cardHTML(d.card, { w: 66 })}</div></div>`,
              text: `<b>${nameOf(d.i)}</b> défausse ${d.card.t === 'n' ? 'ton' : 'ta carte'} <b>${P7.label(d.card)}</b> !`,
            });
          } else {
            await botPop(d.i, 'violet', 'DÉFAUSSE !', `${d.i === 0 ? 'Tu défausses' : nameOf(d.i) + ' défausse'} ${mini(d.card)}${own ? (d.i === 0 ? ' (la tienne)' : ' (la sienne)') : ` de ${nameOf(d.from)}`}`);
          }
          return;
        }
        case 'swap': {
          render(); SND.good();
          const meIn = (d.a.j === 0 || d.b.j === 0) && d.i !== 0;
          const txt = `${mini(d.a.card)} ${d.a.j === 0 ? '(toi)' : '(' + nameOf(d.a.j) + ')'} ⇄ ${mini(d.b.card)} ${d.b.j === 0 ? '(toi)' : '(' + nameOf(d.b.j) + ')'}`;
          if (meIn) {
            setMood(d.i, 'wink', 3000);
            await eventPop({
              theme: 'cyan', title: 'ÉCHANGE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(d.i, 'wink', 'big')}<div class="art-cards">${cardHTML(d.a.card, { w: 56 })}${cardHTML(d.b.card, { w: 56 })}</div></div>`,
              text: `<b>${nameOf(d.i)}</b> échange des cartes :<br>${txt}`,
            });
          } else {
            await botPop(d.i, 'cyan', 'ÉCHANGE !', txt);
          }
          return;
        }
        case 'u7':
          render(); SND.bust();
          if (d.i === 0) {
            setMood(0, 'shock');
            await eventPop({
              theme: 'slate', title: 'MALCHANCE !', auto: SPD().auto,
              art: `<div class="art-duo">${ava(0, 'shock', 'big')}<div class="art-card">${cardHTML(d.card, { w: 66 })}</div></div>`,
              text: d.lost ? `Le <b>7 de la malchance</b> défausse tes ${d.lost} autres cartes.<br><small>Tu repars de zéro, mais tu restes en jeu.</small>` : 'Le <b>7 de la malchance</b> arrive… et tu n\'avais rien à perdre !',
            });
          } else { setMood(d.i, 'shock'); await botPop(d.i, 'slate', 'MALCHANCE !', `${nameOf(d.i)} perd ses ${d.lost} autres cartes`); }
          return;
        case 'lucky':
          render(); SND.good();
          if (d.i !== 0) say(d.i, pick(QUIPS.saved));
          await botPop(d.i, 'green', '13 PORTE-BONHEUR !', `${d.i === 0 ? 'Tu gardes' : nameOf(d.i) + ' garde'} deux 13 sans sauter`);
          return;
        case 'zero':
          render(); SND.stop();
          if (d.i === 0 && G.players[0].status === 'active') {
            await eventPop({
              theme: 'slate', title: 'ZÉRO MAUDIT !', auto: SPD().auto + 600,
              art: `<div class="art-duo">${ava(0, 'shock', 'big')}<div class="art-card">${cardHTML(d.card, { w: 66 })}</div></div>`,
              text: 'Ton score de manche vaut <b>0</b>, sauf si tu alignes 7 numéros.<br><small>Tant que tu l\'as, tu ne peux pas t\'arrêter !</small>',
            });
          } else await botPop(d.i, 'slate', 'ZÉRO MAUDIT !', `${d.i === 0 ? 'Ton score vaut' : 'Le score de ' + nameOf(d.i) + ' vaut'} 0 sauf avec 7 numéros`);
          return;
        case 'noTarget':
          render();
          await botPop(d.i, 'slate', P7.label(d.card), 'Aucune carte à viser : défaussée');
          return;
        case 'flip7': render(); if (d.i !== 0) say(d.i, pick(QUIPS.seven)); await flip7Anim(d.i); return;
        case 'roundEnd': render(); setStatus('Fin de la manche'); await roundSummary(d); return;
        case 'gameover': render(); await gameOver(d); return;
      }
    },
  };

  /* ================= Partie, sauvegarde ================= */
  function saveGame() { if (G && !G.over) store.set('p7_save', G); }
  function loadSave() {
    const s = store.get('p7_save', null);
    return s && s.v === 1 && !s.over && Array.isArray(s.players) ? s : null;
  }
  function startGame(state) {
    cancelAll();
    G = state;
    G.difficulty = G.difficulty || settings.difficulty;
    G.mode = G.mode || 'normal';
    for (const p of G.players) p.avatar = LEGACY[p.avatar] || p.avatar;
    // Le profil (nom, avatar) s'applique aussi à une partie reprise
    G.players[0].avatar = settings.avatar;
    G.players[0].display = settings.name || '';
    lastMeTotal = null; prevScores = []; shownMeRound = 0;
    hideHome();
    render();
    const engine = new P7.Engine(G, ui);
    engine.run().catch(e => { if (!(e instanceof Cancel)) { console.error(e); botPop(null, 'red', 'Erreur', e.message); } });
  }
  function newGame() { startGame(P7.newGame(settings.difficulty, BOTS, settings.mode, { name: settings.name, avatar: settings.avatar })); }
  function resumeGame() {
    const s = loadSave();
    if (!s) return newGame();
    shuffle(s.deck); // pas de triche en rechargeant la page
    startGame(s);
  }

  /* ================= Accueil ================= */
  function showHome() {
    cancelAll();
    if (G && !G.over) saveGame();
    G = null;
    closeMenu();
    $('#btnResume').hidden = !loadSave();
    $('#home').classList.remove('hide');
    renderHome();
  }
  function renderHome() {
    const sample = settings.mode === 'vengeance'
      ? [{ t: 'n', v: 13, sp: 'l13' }, { t: 'a', a: 'steal' }, { t: 'm', v: -6 }, { t: 'n', v: 7, sp: 'u7' }, { t: 'div' }, { t: 'a', a: 'swap' }, { t: 'n', v: 0, sp: 'zero' }]
      : [{ t: 'n', v: 3 }, { t: 'a', a: 'second' }, { t: 'n', v: 12 }, { t: 'n', v: 7 }, { t: 'x2' }, { t: 'a', a: 'stop' }, { t: 'n', v: 9 }];
    $('#homeFan').innerHTML = sample.map((c, k) => placed(cardHTML(c), `transform:translateX(-50%) rotate(${(k - 3) * 12}deg);animation-delay:${k * 0.07}s;`)).join('');
    const crew = [{ name: settings.name || 'Toi', avatar: settings.avatar, me: true }].concat(BOTS);
    $('#homeCrew').innerHTML = crew.map((b, k) => `<div class="crew${b.me ? ' crew-me' : ''}"${b.me ? ' data-profile="1"' : ''} style="animation-delay:${k * 0.25}s;--pc:${pcol(b.avatar)}">${avatarSVG(b.avatar, k === 2 ? 'wink' : 'happy')}<span>${esc(b.name)}</span>${b.me ? '<i class="crew-edit">✎</i>' : ''}</div>`).join('');
    $('.home-title').classList.toggle('v', settings.mode === 'vengeance');
    $('#homeMode').hidden = settings.mode !== 'vengeance';
    syncSegs();
  }
  function hideHome() { $('#home').classList.add('hide'); }

  /* ================= Menu ================= */
  function openMenu() { document.body.classList.add('menu-open'); paused = true; syncSegs(); }
  function closeMenu() { document.body.classList.remove('menu-open'); paused = false; }
  function syncSegs() {
    $$('[data-diff]').forEach(b => b.classList.toggle('on', b.dataset.diff === settings.difficulty));
    $$('[data-speed]').forEach(b => b.classList.toggle('on', b.dataset.speed === settings.speed));
    $$('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === settings.mode));
    $('#soundItem').textContent = settings.sound ? '🔊 Son : activé' : '🔇 Son : coupé';
    $('#profileAva').innerHTML = avatarSVG(settings.avatar, 'happy');
    $('#profileName').textContent = settings.name || 'Toi';
    const live = G && !G.over && G.mode !== settings.mode;
    $('#modeNote').hidden = !live;
    if (live) $('#modeNote').textContent = `Partie en cours : ${MODES[G.mode]}. La version ${MODES[settings.mode]} s'appliquera à la prochaine partie.`;
  }
  $('#btnMenu').addEventListener('click', openMenu);
  $('#drawerBack').addEventListener('click', closeMenu);
  $$('[data-diff]').forEach(b => b.addEventListener('click', () => {
    settings.difficulty = b.dataset.diff; saveSettings();
    if (G) { G.difficulty = settings.difficulty; saveGame(); }
    syncSegs();
  }));
  $$('[data-speed]').forEach(b => b.addEventListener('click', () => { settings.speed = b.dataset.speed; saveSettings(); syncSegs(); }));
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => {
    if (settings.mode === b.dataset.mode) return;
    settings.mode = b.dataset.mode; saveSettings();
    SND.click();
    if (!G) { renderHome(); return; }
    syncSegs();
    if (!G.over && G.mode !== settings.mode) {
      showPanel(`<h2>Version ${MODES[settings.mode]}</h2><p class="ov-sub" style="text-align:center">La partie en cours se joue en version <b>${MODES[G.mode]}</b>.<br>Veux-tu commencer une nouvelle partie en version <b>${MODES[settings.mode]}</b> ?</p>
        <button class="ov-btn danger" data-p="yes">Oui, nouvelle partie</button>`, a => {
        if (a === 'yes') { closePanel(); closeMenu(); newGame(); }
      });
    }
  }));

  /* ---------- Profil : nom et avatar ---------- */
  function openProfile() {
    let pickAva = settings.avatar;
    const grid = () => PLAYER_CHOICES.map(k => `<button class="ava-pick${k === pickAva ? ' on' : ''}" data-p="ava:${k}" style="--pc:${pcol(k)}" aria-label="Avatar ${k}">${avatarSVG(k, k === pickAva ? 'excited' : 'happy')}</button>`).join('');
    showPanel(`<h2>Mon profil</h2>
      <div class="prof-preview" id="profPrev">${avatarSVG(pickAva, 'excited')}</div>
      <label class="prof-label" for="profName">Ton nom</label>
      <input id="profName" class="prof-input" maxlength="12" autocomplete="off" placeholder="Toi" value="${esc(settings.name)}">
      <div class="prof-label">Ton avatar</div>
      <div class="ava-grid" id="avaGrid">${grid()}</div>
      <button class="ov-btn" data-p="save">Enregistrer</button>`, a => {
      if (a.startsWith('ava:')) {
        pickAva = a.slice(4); SND.pop();
        panel.querySelector('#avaGrid').innerHTML = grid();
        panel.querySelector('#profPrev').innerHTML = avatarSVG(pickAva, 'excited');
        return;
      }
      if (a === 'save') {
        settings.name = panel.querySelector('#profName').value.trim().replace(/\s+/g, ' ').slice(0, 12);
        settings.avatar = pickAva;
        saveSettings(); SND.good();
        if (G) { G.players[0].avatar = settings.avatar; G.players[0].display = settings.name; saveGame(); render(); }
        closePanel(); syncSegs();
        if (!G) renderHome();
      }
    });
  }
  $('#homeCrew').addEventListener('click', e => { if (e.target.closest('[data-profile]')) openProfile(); });

  // Panneau par-dessus tout (journal, historique, règles, confirmations)
  const panel = document.createElement('div');
  panel.className = 'overlay';
  panel.style.zIndex = 95;
  document.body.appendChild(panel);
  function showPanel(html, onAct) {
    panel.innerHTML = `<div class="ov-box panel-box">${html}<button class="ov-btn secondary" data-p="close">Fermer</button></div>`;
    panel.classList.add('on');
    panel.onclick = e => {
      const b = e.target.closest('[data-p]');
      if (!b && e.target === panel) return closePanel();
      if (!b) return;
      if (b.dataset.p === 'close') return closePanel();
      onAct && onAct(b.dataset.p);
    };
  }
  function closePanel() { panel.classList.remove('on'); panel.innerHTML = ''; }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Le moteur écrit « Toi pioche… » : on conjugue à la 2e personne pour l'affichage
  const TU = [
    [/^Toi pioche/, 'Tu pioches'], [/^Toi donne/, 'Tu donnes'], [/^Toi se donne/, 'Tu te donnes'],
    [/^Toi s'arrête/, 'Tu t\'arrêtes'], [/^Toi utilise sa/, 'Tu utilises ta'], [/^Toi a déjà/, 'Tu as déjà'],
    [/^Toi impose/, 'Tu imposes'], [/^Toi garde (.*) pour lui-même/, 'Tu gardes $1 pour toi'],
    [/^⭐ Toi réussit/, '⭐ Tu réussis'], [/: Toi perd/, ': tu perds'], [/^🏆 Toi gagne/, '🏆 Tu gagnes'],
    [/^Toi vole/, 'Tu voles'], [/^Toi échange/, 'Tu échanges'], [/^Toi fait défausser/, 'Tu fais défausser'],
    [/^Toi défausse son propre/, 'Tu défausses ton propre'], [/^Toi doit garder/, 'Tu dois garder'],
    [/^Toi doit s'arrêter/, 'Tu dois t\'arrêter'], [/^Toi reçoit le 7 de la malchance : toutes ses/, 'Tu reçois le 7 de la malchance : toutes tes'],
    [/^Toi reçoit/, 'Tu reçois'], [/^Toi garde deux/, 'Tu gardes deux'], [/^Toi se donne ENCORE/, 'Tu te donnes ENCORE'],
    [/\(Toi\)/g, '(toi)'], [/ à Toi([ ,.])/g, ' à toi$1'],
  ];
  const tu = m => TU.reduce((s, [re, r]) => s.replace(re, r), m);

  const ACTIONS = {
    closeMenu,
    newGame() {
      showPanel(`<h2>Nouvelle partie ?</h2><p class="ov-sub" style="text-align:center">La partie en cours sera abandonnée.<br>Version : <b>${MODES[settings.mode]}</b> · Robots : <b>${DIFF[settings.difficulty]}</b></p>
        <button class="ov-btn danger" data-p="yes">Oui, recommencer</button>`, a => {
        if (a === 'yes') { closePanel(); closeMenu(); newGame(); }
      });
    },
    toggleSound() { settings.sound = !settings.sound; saveSettings(); syncSegs(); if (settings.sound) SND.good(); },
    log() {
      if (!G || !G.log.length) return showPanel('<h2>Journal de la partie</h2><p class="ov-sub" style="text-align:center">Aucune partie en cours.</p>');
      let html = '';
      for (const l of G.log) {
        if (l.m.startsWith('—')) { html += `<div class="lr">${esc(l.m.replace(/^— /, ''))}</div>`; continue; }
        html += `<div class="l">${esc(tu(l.m))}</div>`;
      }
      showPanel(`<h2>Journal de la partie</h2><div class="log-list">${html}</div>`);
      const box = panel.querySelector('.ov-box'); box.scrollTop = box.scrollHeight;
    },
    history() {
      const h = store.get('p7_history', []);
      const wins = h.filter(x => x.humanWon).length;
      const body = h.length ? `<p class="ov-sub" style="text-align:center">${h.length} partie${h.length > 1 ? 's' : ''} · ${wins} victoire${wins > 1 ? 's' : ''}</p>` + h.map(x => `
        <div class="hist-item"><b>${x.humanWon ? '🏆 Victoire' : '❌ ' + esc(x.winner) + ' gagne'}</b> · ${new Date(x.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<br>
        ${MODES[x.mode || 'normal']} · ${DIFF[x.difficulty] || ''} · ${x.rounds} manches
        <div class="hist-rk">${x.ranking.map(r => `<span>${avatarSVG(LEGACY[r.avatar] || r.avatar, 'neutral')}${esc(r.name)} <b>${r.total}</b></span>`).join('')}</div></div>`).join('')
        + '<button class="ov-btn danger" data-p="clear">Effacer l\'historique</button>'
        : '<p class="ov-sub" style="text-align:center">Aucune partie terminée pour le moment.</p>';
      showPanel(`<h2>Dernières parties</h2>${body}`, a => {
        if (a === 'clear') { store.del('p7_history'); ACTIONS.history(); }
      });
    },
    rules(m) {
      const v = (typeof m === 'string' ? m : settings.mode) === 'vengeance';
      showPanel(`<h2>Règles du jeu</h2><div class="seg rule-tabs"><button class="${v ? '' : 'on'}" data-p="r:normal">Normale</button><button class="${v ? 'on' : ''}" data-p="r:vengeance">Vengeance</button></div>` +
        (v ? RULES_V : RULES), a => { if (a.startsWith('r:')) { ACTIONS.rules(a.slice(2)); panel.querySelector('.ov-box').scrollTop = 0; } });
    },
    profile: openProfile,
    home() { closeMenu(); showHome(); },
  };
  $$('[data-act]').forEach(b => b.addEventListener('click', () => ACTIONS[b.dataset.act]()));

  const ex = (c, w) => cardHTML(c, { w: w || 44 });
  const RULES_V = `<div class="rules rules-v"><h3 class="rv-title">😈 Version Vengeance (108 cartes)</h3>
    <p>Même principe : piocher ou s'arrêter, un doublon = 0 point, 7 numéros = fin de manche et <b>+${FLIP7_BONUS}</b>, premier à ${TARGET} points. Les bonus disparaissent au profit des malus et des coups bas.</p>
    <h3>S'arrêter ne protège plus</h3><p>Quand tu t'arrêtes, tu ne pioches plus, mais tes cartes restent sur la table : les autres peuvent encore te viser jusqu'à la fin de la manche. Les points ne comptent qu'à la fin. Seul un joueur éliminé ne peut plus être visé.</p>
    <h3>Numéros 0 à 13</h3>
    <div class="rcards">${ex({ t: 'n', v: 0, sp: 'zero' })}${ex({ t: 'n', v: 7, sp: 'u7' })}${ex({ t: 'n', v: 13, sp: 'l13' })}</div>
    <ul><li>Autant d'exemplaires que la valeur, jusqu'à treize 13.</li>
    <li><b>Zéro maudit</b> ☠️ : ton score de manche vaut 0, sauf si tu alignes 7 numéros. Tant que tu l'as, tu ne peux pas t'arrêter.</li>
    <li><b>7 de la malchance</b> 🐈‍⬛ (un des sept 7) : quand tu le reçois, toutes tes autres cartes (numéros et malus) sont défaussées. Il ne te fait jamais sauter, mais un autre 7 ensuite oui.</li>
    <li><b>13 porte-bonheur</b> 🍀 (un des treize 13) : tu peux avoir deux 13 sans sauter ; les deux comptent. Un troisième 13 te fait sauter.</li></ul>
    <h3>Malus</h3>
    <div class="rcards">${ex({ t: 'm', v: -4 })}${ex({ t: 'm', v: -10 })}${ex({ t: 'div' })}</div>
    <p>−2, −4, −6, −8, −10 et ÷2 : quand tu en pioches un, tu le donnes à un joueur non éliminé (à toi seulement si personne d'autre). Il ne compte pas comme numéro.</p>
    <h3>Cartes action (2 de chaque)</h3>
    <div class="rcards">${ex({ t: 'a', a: 'jom' }, 60)}${ex({ t: 'a', a: 'four' }, 60)}${ex({ t: 'a', a: 'steal' }, 60)}${ex({ t: 'a', a: 'swap' }, 60)}${ex({ t: 'a', a: 'discard' }, 60)}</div>
    <ul><li><b>ENCORE UNE !</b> : le joueur visé (toi compris, même arrêté) pioche 1 carte, puis doit s'arrêter.</li>
    <li><b>QUATRE À LA SUITE</b> : le joueur visé pioche 4 cartes. Les actions et malus piochés sont joués après, dans l'ordre, s'il n'a pas sauté. S'il saute ou fait 7 numéros, ils sont perdus.</li>
    <li><b>VOL</b> : prends une carte (numéro ou malus) devant un adversaire. Si c'est un numéro que tu as déjà, tu sautes.</li>
    <li><b>ÉCHANGE</b> : échange deux cartes appartenant à deux joueurs différents (une des tiennes ou deux chez les autres). Un doublon créé fait sauter le joueur concerné.</li>
    <li><b>DÉFAUSSE</b> : retire une carte de la table, chez n'importe quel joueur non éliminé, toi compris.</li>
    <li>Une action sans cible possible est défaussée sans effet.</li></ul>
    <h3>Score de la manche</h3>
    <p>Somme des numéros → ÷2 (arrondi en dessous) → − les malus → jamais moins de 0 → <b>+${FLIP7_BONUS}</b> pour 7 numéros.</p>
  </div>`;
  const RULES = `<div class="rules">
    <h3 class="rv-title">🃏 Version normale (94 cartes)</h3>
    <h3>But</h3><p>Être le premier à dépasser <b>${TARGET} points</b>. La partie s'arrête à la fin de la manche où un joueur atteint ${TARGET} ; le plus haut total gagne.</p>
    <h3>Déroulement d'une manche</h3>
    <ul><li>Le donneur distribue une carte face visible à chaque joueur.</li>
    <li>Puis chacun son tour choisit : <b>PIOCHER</b> une carte ou <b>ARRÊTER</b> et garder ses points.</li>
    <li>La manche se termine quand plus personne n'est en jeu, ou dès qu'un joueur aligne 7 numéros différents.</li></ul>
    <h3>Le doublon</h3><p>Si tu pioches un numéro que tu as déjà, tu perds la manche : <b>0 point</b>, même avec des bonus.</p>
    <h3>Les cartes (94)</h3>
    <div class="rcards">${ex({ t: 'n', v: 0 })}${ex({ t: 'n', v: 5 })}${ex({ t: 'n', v: 12 })}</div>
    <p>Numéros de 0 à 12 : il y a autant d'exemplaires que la valeur (douze 12, onze 11…, un seul 1 et un seul 0).</p>
    <div class="rcards">${ex({ t: 'm', v: 4 })}${ex({ t: 'x2' })}</div>
    <p><b>Bonus</b> +2, +4, +6, +8, +10 : s'ajoutent au score. <b>×2</b> : double la somme de tes numéros (pas les bonus).</p>
    <div class="rcards">${ex({ t: 'a', a: 'stop' }, 60)}${ex({ t: 'a', a: 'three' }, 60)}${ex({ t: 'a', a: 'second' }, 60)}</div>
    <ul><li><b>STOP</b> : donne-la à un joueur encore en jeu (toi compris). Il s'arrête et garde ses points. Seul en jeu, c'est toi qui t'arrêtes.</li>
    <li><b>TROIS À LA SUITE</b> : choisis un joueur en jeu (toi compris) : il pioche 3 cartes d'affilée. Un STOP ou un TROIS À LA SUITE pioché pendant ces 3 cartes est joué après.</li>
    <li><b>SECONDE CHANCE</b> : garde-la. Au premier doublon, le doublon et la Seconde chance sont défaussés et tu continues. Une seule à la fois : la suivante doit être donnée à un autre joueur.</li></ul>
    <h3>Score de la manche</h3>
    <p>Somme des numéros → ×2 si tu as la carte ×2 → + les bonus → <b>+${FLIP7_BONUS}</b> si tu as 7 numéros différents.</p>
    <h3>Robots</h3><p><b>Facile</b> : joue au hasard. <b>Moyen</b> : prudent, compte les cartes visibles. <b>Difficile</b> : compte toutes les cartes et vise le joueur le plus menaçant.</p>
  </div>`;

  /* ================= Démarrage ================= */
  $('#btnNew').addEventListener('click', () => { SND.click(); newGame(); });
  $('#btnResume').addEventListener('click', () => { SND.click(); resumeGame(); });
  $('#btnHomeRules').addEventListener('click', () => ACTIONS.rules());
  window.addEventListener('resize', () => render());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#btnInstall').hidden = false; });
  $('#btnInstall').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null; $('#btnInstall').hidden = true;
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  showHome();
  window.__p7 = { get G() { return G; }, ui }; // inspection / débogage
})();
