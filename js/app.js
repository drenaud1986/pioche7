/* Pioche 7 — interface, animations, sauvegarde */
(() => {
  'use strict';
  const { WORDS, TARGET, FLIP7_BONUS, roundScore, uniqueCount, hasX2, shuffle } = P7;
  const { avatarSVG } = P7Avatars;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const COLORS = ['#6b7280', '#b7791f', '#65a30d', '#db2777', '#0891b2', '#16a34a', '#7c3aed', '#dc2626', '#2563eb', '#ea580c', '#be185d', '#0f766e', '#1e3a8a'];
  const BOTS = [{ name: 'Zoé', avatar: 'zoe' }, { name: 'Hugo', avatar: 'hugo' }, { name: 'Lina', avatar: 'lina' }];
  const LEGACY = { '🙂': 'me', '🦊': 'zoe', '🐻': 'hugo', '🐼': 'lina' };
  const PCOLOR = { me: '#f6c945', zoe: '#f472b6', hugo: '#34d399', lina: '#c084fc' };
  const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
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
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const settings = Object.assign({ difficulty: 'moyen', speed: 'normal', sound: true }, store.get('p7_settings', {}));
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
  const ACT_TEXT = {
    stop: 'STOP<small>Le joueur visé s\'arrête</small>',
    three: 'TROIS À LA SUITE<small>Le joueur visé pioche 3 cartes</small>',
    second: 'SECONDE CHANCE<small>Annule un doublon</small>',
  };
  const SVG_SHIELD = '<svg viewBox="0 0 100 100" class="ev-icon"><path d="M50 6 L86 20 V48 C86 72 70 88 50 95 C30 88 14 72 14 48 V20Z" fill="#22c55e" stroke="#fff" stroke-width="6"/><path d="M32 50 L45 63 L69 38" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SVG_TROPHY = '<svg viewBox="0 0 100 100" class="ev-icon"><path d="M28 12h44v22a22 22 0 0 1-44 0z" fill="#f6c945" stroke="#a16207" stroke-width="4"/><path d="M28 18H14c0 16 8 24 18 24M72 18h14c0 16-8 24-18 24" fill="none" stroke="#a16207" stroke-width="5"/><rect x="44" y="56" width="12" height="16" fill="#e0a526"/><rect x="30" y="72" width="40" height="12" rx="3" fill="#a16207"/><path d="M40 22 v14" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/></svg>';

  function cardHTML(c, o = {}) {
    const st = o.w ? `--cw:${o.w}px;` : '';
    const cls = (o.mini ? ' mini' : '') + (o.cls ? ' ' + o.cls : '');
    if (c.t === 'n') {
      return `<div class="card num${cls}" style="${st}--c:${COLORS[c.v]}" data-id="${c.id}">` +
        `<div class="ray"></div><div class="frame"></div><div class="gem t"></div>` +
        `<span class="corner tl">${c.v}</span><span class="corner br">${c.v}</span>` +
        `<div class="big${c.v >= 10 ? ' two' : ''}">${c.v}</div><div class="word">${WORDS[c.v]}</div></div>`;
    }
    if (c.t === 'm') {
      return `<div class="card mod${cls}" style="${st}" data-id="${c.id}"><div class="frame"></div>` +
        `<div class="big">+${c.v}</div><div class="mod-sub">+${c.v} POINTS</div></div>`;
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
    for (const m of p.mods) if (m.t === 'm') s += ` +${m.v}`;
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
      return `<div class="opp${out ? ' is-out' : ''}${p.flip7 ? ' is-seven' : ''}${turn ? ' is-turn' : ''}${p.status === 'busted' ? ' is-bust' : ''}" data-i="${i}" style="--pc:${PCOLOR[p.avatar] || '#fff'}">
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
    $('#btnStay').disabled = !on;
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
    if (!p.human && !ctx.deal && !ctx.three && Math.random() < .3) say(i, pick(QUIPS.hit));
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
      (ctx.three ? `<small>Trois à la suite · carte ${ctx.three}/3</small>` : ctx.deal ? '<small>Distribution</small>' : '') + '</span>';
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
    if (card.t === 'a' || card.t === 'x2') SND.pop();
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
    await eventPop({
      theme: 'blue', title: 'TU T\'ARRÊTES !',
      art: `<div class="art-duo">${ava(0, 'happy', 'big')}<div class="art-sign">${SVG_SHIELD}</div></div>`,
      text: d.kind === 'stay' ? 'Tes points sont à l\'abri pour cette manche.' : 'Tu te donnes la carte STOP : tu gardes tes points.',
      extra: scoresBox(me, 'Ton score'),
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

  function askTarget(i, kind, cands) {
    const T = {
      stop: ['red', 'STOP !', 'À qui donnes-tu la carte STOP ?<br><small>Il s\'arrête tout de suite et garde ses points.</small>'],
      three: ['purple', '3 À LA SUITE !', 'Choisis un joueur qui piochera 3 cartes.<br><small>Il s\'arrête s\'il fait un doublon.</small>'],
      second: ['pink', 'SECONDE CHANCE', 'Tu en as déjà une : à qui l\'offres-tu ?'],
    }[kind];
    const card = { t: 'a', a: kind };
    const tiles = cands.map(j => {
      const p = G.players[j];
      return `<button class="tile${j === 0 ? ' self' : ''}" data-v="${j}" style="--pc:${PCOLOR[p.avatar]}">
        <span class="tile-ava">${ava(j)}</span>
        <span class="tile-name">${j === 0 ? 'Moi' : p.name}</span>
        <span class="tile-info">manche ${roundScore(p)} · ${p.total} pts</span>
        <span class="tile-cards">${p.numbers.map(c => cardHTML(c, { mini: true })).join('') || '<em>aucune carte</em>'}</span>
      </button>`;
    }).join('');
    render();
    return eventPop({
      theme: T[0], title: T[1], text: T[2], ok: null,
      art: `<div class="art-card">${cardHTML(card, { w: 78 })}</div>`,
      extra: `<div class="tiles n${cands.length}">${tiles}</div>`,
    }).then(Number);
  }

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
        <span class="rs-name">${i === 0 ? 'Toi' : p.name}<span class="bar"><i style="--w:${Math.min(100, p.total / TARGET * 100)}%"></i></span></span>
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
        date: Date.now(), difficulty: G.difficulty, rounds: G.round,
        ranking: ranked().map(({ p }) => ({ name: p.name, avatar: p.avatar, total: p.total, human: p.human })),
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
        <div class="pod-block"><span class="pod-rank">${k + 1}</span><div class="pod-label"><b>${i === 0 ? 'Toi' : p.name}</b>${p.total} pts</div></div>
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
      setStatus(`<b>${nameOf(i)}</b> ${kind === 'turn' ? 'réfléchit…' : 'choisit un joueur…'}`);
      render();
      await wait(kind === 'turn' ? SPD().think : SPD().think * 1.2);
    },
    askChoice() {
      render();
      setStatus('<b>À toi de jouer !</b><br>Piocher ou arrêter ?');
      return waitUser(done => { humanCb = done; setButtons(true); });
    },
    askTarget,
    reveal: revealCard,
    async event(type, d) {
      switch (type) {
        case 'update': render(d.pop); return;
        case 'roundStart': prevScores = []; shownMeRound = 0; render(); setStatus(`Manche ${G.round}`); await roundBanner(); return;
        case 'reshuffle': botPop(null, 'blue', '🔀 Mélange !', 'La défausse reforme la pioche'); return;
        case 'stay':
          render();
          if (d.i === 0) await stopPop({ kind: 'stay' });
          else { SND.stop(); say(d.i, pick(QUIPS.stay)); setStatus(`${nameOf(d.i)} s'arrête`); await botPop(d.i, 'blue', `${nameOf(d.i)} s'arrête`, `Il garde <b>${roundScore(G.players[d.i])}</b> pts`.replace('Il', G.players[d.i].avatar === 'hugo' ? 'Il' : 'Elle')); }
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
    for (const p of G.players) p.avatar = LEGACY[p.avatar] || p.avatar;
    lastMeTotal = null; prevScores = []; shownMeRound = 0;
    hideHome();
    render();
    const engine = new P7.Engine(G, ui);
    engine.run().catch(e => { if (!(e instanceof Cancel)) { console.error(e); botPop(null, 'red', 'Erreur', e.message); } });
  }
  function newGame() { startGame(P7.newGame(settings.difficulty, BOTS)); }
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
    const sample = [{ t: 'n', v: 3 }, { t: 'a', a: 'second' }, { t: 'n', v: 12 }, { t: 'n', v: 7 }, { t: 'x2' }, { t: 'a', a: 'stop' }, { t: 'n', v: 9 }];
    $('#homeFan').innerHTML = sample.map((c, k) => placed(cardHTML(c), `transform:translateX(-50%) rotate(${(k - 3) * 12}deg);animation-delay:${k * 0.07}s;`)).join('');
    $('#homeCrew').innerHTML = BOTS.map((b, k) => `<div class="crew" style="animation-delay:${k * 0.25}s;--pc:${PCOLOR[b.avatar]}">${avatarSVG(b.avatar, k === 1 ? 'wink' : 'happy')}<span>${b.name}</span></div>`).join('');
    syncSegs();
  }
  function hideHome() { $('#home').classList.add('hide'); }

  /* ================= Menu ================= */
  function openMenu() { document.body.classList.add('menu-open'); paused = true; syncSegs(); }
  function closeMenu() { document.body.classList.remove('menu-open'); paused = false; }
  function syncSegs() {
    $$('[data-diff]').forEach(b => b.classList.toggle('on', b.dataset.diff === settings.difficulty));
    $$('[data-speed]').forEach(b => b.classList.toggle('on', b.dataset.speed === settings.speed));
    $('#soundItem').textContent = settings.sound ? '🔊 Son : activé' : '🔇 Son : coupé';
  }
  $('#btnMenu').addEventListener('click', openMenu);
  $('#drawerBack').addEventListener('click', closeMenu);
  $$('[data-diff]').forEach(b => b.addEventListener('click', () => {
    settings.difficulty = b.dataset.diff; saveSettings();
    if (G) { G.difficulty = settings.difficulty; saveGame(); }
    syncSegs();
  }));
  $$('[data-speed]').forEach(b => b.addEventListener('click', () => { settings.speed = b.dataset.speed; saveSettings(); syncSegs(); }));

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
    [/ à Toi([ ,.])/g, ' à toi$1'],
  ];
  const tu = m => TU.reduce((s, [re, r]) => s.replace(re, r), m);

  const ACTIONS = {
    closeMenu,
    newGame() {
      showPanel(`<h2>Nouvelle partie ?</h2><p class="ov-sub" style="text-align:center">La partie en cours sera abandonnée.<br>Robots : <b>${DIFF[settings.difficulty]}</b></p>
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
        ${DIFF[x.difficulty] || ''} · ${x.rounds} manches
        <div class="hist-rk">${x.ranking.map(r => `<span>${avatarSVG(LEGACY[r.avatar] || r.avatar, 'neutral')}${r.human ? 'Toi' : esc(r.name)} <b>${r.total}</b></span>`).join('')}</div></div>`).join('')
        + '<button class="ov-btn danger" data-p="clear">Effacer l\'historique</button>'
        : '<p class="ov-sub" style="text-align:center">Aucune partie terminée pour le moment.</p>';
      showPanel(`<h2>Dernières parties</h2>${body}`, a => {
        if (a === 'clear') { store.del('p7_history'); ACTIONS.history(); }
      });
    },
    rules() { showPanel(RULES); },
    home() { closeMenu(); showHome(); },
  };
  $$('[data-act]').forEach(b => b.addEventListener('click', () => ACTIONS[b.dataset.act]()));

  const ex = (c, w) => cardHTML(c, { w: w || 44 });
  const RULES = `<h2>Règles du jeu</h2><div class="rules">
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
