/* Pioche 7 — interface, animations, sauvegarde */
(() => {
  'use strict';
  const { WORDS, TARGET, FLIP7_BONUS, roundScore, uniqueCount, numSum, hasX2, plusSum, shuffle } = P7;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const COLORS = ['#6b7280', '#b7791f', '#65a30d', '#db2777', '#0891b2', '#16a34a', '#7c3aed', '#dc2626', '#2563eb', '#ea580c', '#be185d', '#0f766e', '#1e3a8a'];
  const BOTS = [{ name: 'Zoé', avatar: '🦊' }, { name: 'Hugo', avatar: '🐻' }, { name: 'Lina', avatar: '🐼' }];
  const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
  const SPEEDS = {
    normal: { fly: 420, hold: 1000, think: 650, toast: 1300, banner: 1400 },
    rapide: { fly: 260, hold: 520, think: 300, toast: 800, banner: 900 },
  };

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
    $$('.seven-ov,.round-banner,.fly-cap').forEach(e => e.remove());
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
    flip7() { [523, 659, 784, 1047, 1319, 1568].forEach((f, k) => tone(f, .3, 'triangle', .11, k * .09)); },
    click() { tone(260, .05, 'square', .04); },
    win() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, k) => tone(f, .28, 'triangle', .1, k * .13)); },
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

  /* ================= Rendu de la table ================= */
  function specials(p) {
    const list = [...p.mods];
    if (p.second) list.push(p.second);
    list.push(...p.actions);
    return list;
  }
  function badgeOf(p, i) {
    if (p.flip7) return ['seven', '7 cartes ★'];
    if (p.status === 'busted') return ['bust', 'Perdu ✖'];
    if (p.status === 'frozen') return ['frozen', 'Stoppé ✋'];
    if (p.status === 'stayed') return ['stay', 'Arrêté ✔'];
    if (G.cur === i && G.phase !== 'end') return ['turn', p.human ? 'À toi !' : 'joue…'];
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

  let lastMeRound = null, lastMeTotal = null;
  function render(pop) {
    if (!G) return;
    $('#roundNo').textContent = G.round;
    $('#deckCount').textContent = G.deck.length;
    $('#discardCount').textContent = G.discard.length;
    const top = G.discard[G.discard.length - 1];
    $('#discardTop').outerHTML = top ? `<div id="discardTop">${cardHTML(top, { w: 54, mini: true })}</div>` : '<div id="discardTop" class="slot-empty"></div>';

    const mark = (c, extra) => cardHTML(c, { mini: true, cls: [(c.id === pop ? 'pop' : ''), extra || ''].join(' ').trim() });

    // Adversaires
    $('#opponents').innerHTML = G.players.slice(1).map((p, k) => {
      const i = k + 1;
      const [bc, bt] = badgeOf(p, i);
      const out = p.status !== 'active' && !p.flip7;
      const turn = G.cur === i && !out && G.phase !== 'end';
      const nums = p.numbers.map(c => mark(c)).join('') + (p.bustCard ? mark(p.bustCard, 'dup') : '');
      const specs = specials(p).map(c => mark(c)).join('') + p.pending.map(c => mark(c, 'pending')).join('');
      return `<div class="opp${out ? ' is-out' : ''}${p.flip7 ? ' is-seven' : ''}${turn ? ' is-turn' : ''}" data-i="${i}">
        <div class="opp-head"><span class="ava">${p.avatar}</span><span class="pname">${p.name}</span>
          ${G.dealer === i ? '<span class="dealer-chip" title="Donneur">D</span>' : ''}
          <span class="badge ${bc}">${bt}</span>
          <span class="opp-scores"><span class="r">manche ${roundScore(p)}</span><span class="t">${p.total}<small>pts</small></span></span></div>
        <div class="opp-cards"><div class="row nums" data-zone="${i}-n">${nums}</div><div class="row specs" data-zone="${i}-s">${specs}</div></div>
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
    $('#meBadge').textContent = bt;
    $('#meDealer').hidden = G.dealer !== 0;
    const r = roundScore(me);
    setNum('#meRound', r, lastMeRound); lastMeRound = r;
    setNum('#meTotal', me.total, lastMeTotal); lastMeTotal = me.total;
    $('#meProgress').textContent = `${uniqueCount(me)}/7 numéros`;
    $('#meDetail').textContent = calcText(me);
    const meOut = me.status !== 'active' && !me.flip7;
    $('#me').classList.toggle('is-seven', me.flip7);
    $('#me').classList.toggle('is-out', meOut);
    $('#me').classList.toggle('is-turn', G.cur === 0 && !meOut && G.phase !== 'end');
  }
  function setNum(sel, v, prev) {
    const el = $(sel);
    el.textContent = v;
    if (prev !== null && prev !== v) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function zoneEl(i) { return i === 0 ? $('#me') : $(`.opp[data-i="${i}"]`); }
  function setStatus(html) { $('#status').innerHTML = html; }
  function nameOf(i) { return G.players[i].name; }

  let toastTimer = null;
  function toast(msg, color = '') {
    const t = $('#toast');
    t.className = 'toast ' + color;
    t.innerHTML = msg;
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
    setStatus(p.human ? 'Tu pioches…' : `${p.avatar} <b>${p.name}</b> pioche…`);
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = Math.round(Math.min(200, vw * 0.5, vh * 0.3)), H = Math.round(W * 1.4);
    const left = (vw - W) / 2, topY = (vh - H) / 2 - 24;
    const el = document.createElement('div');
    el.className = 'fly';
    el.style.cssText = `width:${W}px;height:${H}px;left:${left}px;top:${topY}px`;
    el.innerHTML = `<div class="flip"><div class="face fback">${backHTML(W)}</div><div class="face ffront">${cardHTML(card, { w: W })}</div></div>`;
    const cap = document.createElement('div');
    cap.className = 'fly-cap';
    cap.style.top = (topY + H + 14) + 'px';
    cap.innerHTML = (p.human ? 'Tu pioches' : `${p.avatar} ${p.name} pioche`) +
      (ctx.three ? `<small>Trois à la suite · carte ${ctx.three}/3</small>` : ctx.deal ? '<small>Distribution</small>' : '');
    $('#fxLayer').append(el, cap);
    $('#revealDim').classList.add('on');

    const d = $('#deckTop').getBoundingClientRect();
    const dx = d.left + d.width / 2 - (left + W / 2), dy = d.top + d.height / 2 - (topY + H / 2);
    const a1 = el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${d.width / W})` }, { transform: 'none' }],
      { duration: SPD().fly, easing: 'cubic-bezier(.2,.8,.2,1)' });
    el.querySelector('.flip').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
      { duration: SPD().fly * 1.1, easing: 'ease-out', fill: 'both' });
    await animDone(a1, SPD().fly);
    guard(t);
    await wait(SPD().hold);

    let zone = document.querySelector(`[data-zone="${i}-${card.t === 'n' ? 'n' : 's'}"]`);
    if (!zone || !zone.getBoundingClientRect().width) zone = document.querySelector(`[data-zone="${i}-n"]`) || zoneEl(i);
    const z = zone.getBoundingClientRect();
    const endW = i === 0 ? (card.t === 'n' ? 46 : 38) : 26;
    const tx = z.left + Math.min(z.width / 2 + 20, Math.max(endW, z.width - endW / 2)) - (left + W / 2);
    const ty = z.top + z.height / 2 - (topY + H / 2);
    cap.remove();
    $('#revealDim').classList.remove('on');
    const a2 = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${tx}px,${ty}px) scale(${endW / W})`, opacity: .7 }],
      { duration: SPD().fly * .85, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    await animDone(a2, SPD().fly * .85);
    el.remove();
    guard(t);
    SND.place();
  }

  /* ================= Fenêtres (overlays) ================= */
  function showOverlay(html) {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="ov-box">${html}</div>`;
    ov.classList.add('on');
    return ov;
  }
  function hideOverlay() {
    const ov = $('#overlay');
    ov.classList.remove('on');
    ov.innerHTML = '';
    ov.onclick = null;
  }
  function overlayAsk(html) {
    return waitUser(done => {
      const ov = showOverlay(html);
      ov.onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        SND.click();
        hideOverlay();
        done(b.dataset.v);
      };
    });
  }

  function heroScores(p, label) {
    const s = roundScore(p);
    return `<div class="score-hero"><div class="box"><small>${label}</small><b>${s}</b></div>` +
      `<div class="box alt"><small>TOTAL</small><b>${p.total + s}</b></div></div>` +
      `<div class="calc">${calcText(p) || 'Aucune carte'} · objectif ${TARGET}</div>`;
  }

  async function stopOverlay(d) {
    const me = G.players[0];
    SND.stop();
    const bySelf = d.kind === 'stay' || d.from === 0;
    const title = bySelf ? 'TU T\'ARRÊTES' : 'STOP !';
    const sub = d.kind === 'stay' ? 'Tu mets tes points à l\'abri pour cette manche.'
      : d.from === 0 ? 'Tu te donnes la carte STOP : tu gardes tes points.'
        : `${G.players[d.from].avatar} ${nameOf(d.from)} t'a donné la carte STOP. Tu gardes tes points.`;
    await overlayAsk(`${ICONS.stop.replace('class="icon"', 'class="stop-sign"')}
      <h2 class="ov-title">${title}</h2><p class="ov-sub">${sub}</p>
      ${heroScores(me, 'SCORE DU TOUR')}
      <button class="ov-btn" data-v="ok">Continuer</button>`);
  }

  async function bustOverlay(d) {
    const me = G.players[0];
    const first = me.numbers.find(c => c.v === d.card.v);
    await overlayAsk(`<h2 class="ov-title" style="color:var(--red-2)">DOUBLON !</h2>
      <p class="ov-sub">Tu avais déjà un <b>${d.card.v}</b>. Tu ne marques aucun point cette manche.</p>
      <div class="ov-cards">${first ? cardHTML(first) : ''}${cardHTML(d.card, { cls: 'dup' })}</div>
      <div class="score-hero"><div class="box"><small>SCORE DU TOUR</small><b>0</b></div><div class="box alt"><small>TOTAL</small><b>${me.total}</b></div></div>
      <button class="ov-btn" data-v="ok">Continuer</button>`);
  }

  function askTarget(i, kind, cands) {
    const T = {
      stop: ['À qui donnes-tu la carte STOP ?', 'Le joueur choisi s\'arrête tout de suite et garde ses points de la manche.'],
      three: ['Qui doit piocher 3 cartes ?', 'Le joueur choisi retourne 3 cartes d\'affilée. Il s\'arrête s\'il fait un doublon.'],
      second: ['À qui offres-tu ta Seconde chance ?', 'Tu en as déjà une : donne celle-ci à un joueur encore en jeu.'],
    }[kind];
    const card = { stop: { t: 'a', a: 'stop' }, three: { t: 'a', a: 'three' }, second: { t: 'a', a: 'second' } }[kind];
    const list = cands.map(j => {
      const p = G.players[j];
      const isMe = j === 0;
      return `<button class="target${isMe ? ' self' : ''}" data-v="${j}">
        <span class="ava">${p.avatar}</span>
        <span><div class="tn">${isMe ? 'Moi' : p.name}</div><div class="ti">${p.numbers.length} numéro${p.numbers.length > 1 ? 's' : ''} · manche ${roundScore(p)} · total ${p.total}</div></span>
        <span class="tr">${p.numbers.map(c => cardHTML(c, { mini: true })).join('')}</span></button>`;
    }).join('');
    render();
    return overlayAsk(`<div class="ov-cards" style="--cw:84px">${cardHTML(card)}</div>
      <h2 class="ov-title" style="font-size:22px">${T[0]}</h2><p class="ov-sub">${T[1]}</p>
      <div class="targets">${list}</div>`).then(Number);
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
        return cardHTML(c, { cls: '' }).replace('style="', `style="transform:translateX(-50%) rotate(${a}deg);animation-delay:${0.2 + k * 0.09}s;`);
      }).join('');
      ov.innerHTML = `<div class="rays"></div><canvas></canvas>
        <div class="seven-fan">${fan}</div>
        <div class="seven-title">SEPT&nbsp;!</div>
        <div class="seven-sub">${p.human ? 'Tu as aligné' : `${p.avatar} ${p.name} a aligné`}<br>7 numéros différents !</div>
        <div class="seven-bonus">+${FLIP7_BONUS} POINTS</div>
        <div class="seven-tap">Touchez pour continuer</div>`;
      document.body.appendChild(ov);
      const stopConfetti = confetti(ov.querySelector('canvas'));
      let closed = false;
      const close = () => {
        if (closed) return; closed = true;
        stopConfetti(); ov.remove(); done();
      };
      setTimeout(() => ov.addEventListener('click', close), 900);
      setTimeout(close, settings.speed === 'rapide' ? 3200 : 4600);
    });
  }
  function confetti(cv) {
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
    resize();
    const cols = COLORS.concat(['#f6c945', '#ff7b54', '#ffffff']);
    const parts = Array.from({ length: 170 }, () => ({
      x: cv.width / 2, y: cv.height * .45,
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
    b.innerHTML = `MANCHE ${G.round}<small>${G.players[G.dealer].avatar} ${nameOf(G.dealer)} distribue</small>`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), SPD().banner + 50);
    return wait(SPD().banner);
  }

  const STATUS_ICON = p => p.flip7 ? '⭐' : p.status === 'busted' ? '💥' : p.status === 'frozen' ? '✋' : '✔️';
  function scoreTable(sorted) {
    return `<table class="score-table">${sorted.map(({ p, i }) => `
      <tr class="${i === 0 ? 'me' : ''}"><td>${p.avatar} <b>${i === 0 ? 'Toi' : p.name}</b> ${G.phase === 'end' || G.over ? STATUS_ICON(p) : ''}
        <div class="bar"><i style="width:${Math.min(100, p.total / TARGET * 100)}%"></i></div></td>
        <td class="n ${p.last > 0 ? 'plus' : 'zero'}">+${p.last}</td><td class="n">${p.total}</td></tr>`).join('')}</table>`;
  }
  function ranked() {
    return G.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.total - a.p.total);
  }
  async function roundSummary(d) {
    const f7 = G.flip7 !== null ? `<p class="ov-sub">⭐ ${G.flip7 === 0 ? 'Tu as' : nameOf(G.flip7) + ' a'} réussi 7 numéros différents !</p>` : '';
    const tie = d.tie ? '<p class="ov-sub"><b>Égalité en tête au-delà de 200 : manche décisive !</b></p>' : '';
    await overlayAsk(`<h2 class="ov-title">Fin de la manche ${G.round}</h2>${f7}${tie}
      ${scoreTable(ranked())}
      <p class="ov-sub" style="margin-top:8px">Premier à ${TARGET} points : la partie se termine à la fin de la manche.</p>
      <button class="ov-btn" data-v="ok">Manche suivante ▶</button>`);
  }
  async function gameOver(d) {
    const w = G.players[d.winner];
    if (!G.recorded) {
      G.recorded = true;
      const hist = store.get('p7_history', []);
      hist.unshift({
        date: Date.now(), difficulty: G.difficulty, rounds: G.round,
        ranking: ranked().map(({ p }) => ({ name: p.name, avatar: p.avatar, total: p.total, human: p.human })),
        winner: w.name, humanWon: d.winner === 0,
      });
      store.set('p7_history', hist.slice(0, 30));
      store.del('p7_save');
    }
    d.winner === 0 ? SND.win() : SND.stop();
    const v = await overlayAsk(`<div class="trophy">${d.winner === 0 ? '🏆' : w.avatar}</div>
      <h2 class="ov-title">${d.winner === 0 ? 'VICTOIRE !' : `${w.name} gagne !`}</h2>
      <p class="ov-sub">${d.winner === 0 ? `Bravo, tu atteins ${w.total} points en ${G.round} manches.` : `${w.total} points en ${G.round} manches. Tu feras mieux la prochaine fois !`}</p>
      ${scoreTable(ranked())}
      <button class="ov-btn" data-v="again">🔄 Rejouer</button>
      <button class="ov-btn secondary" data-v="home">🏠 Accueil</button>`);
    if (v === 'again') newGame(); else showHome();
  }

  /* ================= Pont moteur ↔ interface ================= */
  const ui = {
    save: saveGame,
    async think(i, kind) {
      setStatus(`${G.players[i].avatar} <b>${nameOf(i)}</b> ${kind === 'turn' ? 'réfléchit…' : 'choisit un joueur…'}`);
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
        case 'roundStart': render(); setStatus(`Manche ${G.round}`); await roundBanner(); return;
        case 'reshuffle': toast('🔀 La défausse est remélangée'); return;
        case 'stay':
          render();
          if (d.i === 0) await stopOverlay({ kind: 'stay' });
          else { SND.stop(); setStatus(`${nameOf(d.i)} s'arrête`); await toast(`${G.players[d.i].avatar} ${nameOf(d.i)} s'arrête avec <b>${roundScore(G.players[d.i])}</b> pts`); }
          return;
        case 'bust': {
          render();
          SND.bust();
          const z = zoneEl(d.i); z && z.classList.add('shake');
          if (d.i === 0) { vibrate([90, 60, 160]); await wait(500); await bustOverlay(d); }
          else await toast(`💥 ${nameOf(d.i)} pioche un 2<sup>e</sup> ${d.card.v} : perdu !`, 'red');
          return;
        }
        case 'second':
          render(); SND.good();
          await toast(`💖 ${d.i === 0 ? 'Ta' : 'La'} Seconde chance ${d.i === 0 ? 'te sauve' : `sauve ${nameOf(d.i)}`} !<br><small>Le ${d.card.v} en double et la carte sont défaussés</small>`, 'pink');
          return;
        case 'discardSecond':
          await toast(`${nameOf(d.i)} a déjà une Seconde chance : celle-ci est défaussée`, 'pink');
          return;
        case 'give':
          render(); SND.good();
          await toast(`💖 ${d.from === 0 ? 'Tu donnes' : nameOf(d.from) + ' donne'} une Seconde chance à ${d.to === 0 ? 'toi' : nameOf(d.to)}`, 'pink');
          return;
        case 'freeze':
          render();
          if (d.to === 0) await stopOverlay({ kind: 'freeze', from: d.from });
          else {
            SND.stop();
            await toast(d.from === d.to ? `✋ ${nameOf(d.from)} se donne STOP et garde ${roundScore(G.players[d.to])} pts`
              : `✋ ${d.from === 0 ? 'Tu donnes' : nameOf(d.from) + ' donne'} STOP à ${nameOf(d.to)}`, 'blue');
          }
          return;
        case 'three':
          render(); SND.good();
          await toast(`🃏 Trois à la suite pour ${d.to === 0 ? 'toi' : nameOf(d.to)} !`);
          return;
        case 'flip7': render(); await flip7Anim(d.i); return;
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
    lastMeRound = lastMeTotal = null;
    hideHome();
    render();
    const engine = new P7.Engine(G, ui);
    engine.run().catch(e => { if (!(e instanceof Cancel)) { console.error(e); toast('Erreur : ' + e.message, 'red'); } });
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
    $('#homeFan').innerHTML = sample.map((c, k) => {
      const a = (k - 3) * 12;
      return cardHTML(c).replace('style="', `style="transform:translateX(-50%) rotate(${a}deg);animation-delay:${k * 0.07}s;`);
    }).join('');
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
      let html = '', r = 0;
      for (const l of G.log) {
        if (l.m.startsWith('—')) { html += `<div class="lr">${esc(l.m.replace(/^— /, ''))}</div>`; r = l.r; continue; }
        html += `<div class="l">${esc(tu(l.m))}</div>`;
      }
      showPanel(`<h2>Journal de la partie</h2><div class="log-list" id="logList">${html}</div>`);
      const box = panel.querySelector('.ov-box'); box.scrollTop = box.scrollHeight;
    },
    history() {
      const h = store.get('p7_history', []);
      const wins = h.filter(x => x.humanWon).length;
      const body = h.length ? `<p class="ov-sub" style="text-align:center">${h.length} partie${h.length > 1 ? 's' : ''} · ${wins} victoire${wins > 1 ? 's' : ''}</p>` + h.map(x => `
        <div class="hist-item"><b>${x.humanWon ? '🏆 Victoire' : '❌ ' + esc(x.winner) + ' gagne'}</b> · ${new Date(x.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<br>
        ${DIFF[x.difficulty] || ''} · ${x.rounds} manches<br>${x.ranking.map(r => `${r.avatar} ${r.human ? 'Toi' : esc(r.name)} ${r.total}`).join(' · ')}</div>`).join('')
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
  window.__p7 = { get G() { return G; } }; // inspection / débogage
})();
