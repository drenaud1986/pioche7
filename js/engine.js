/* Pioche 7 — moteur de règles et robots (aucune dépendance au DOM)
   Deux versions : « normale » (94 cartes) et « vengeance » (108 cartes, cartes malus et coups bas). */
(function (root) {
  'use strict';

  const WORDS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE', 'TREIZE'];
  const TARGET = 200;
  const FLIP7_BONUS = 15;
  const DECK_SIZE = { normal: 94, vengeance: 108 };

  function makeDeck(mode) {
    let id = 0;
    const d = [];
    if (mode === 'vengeance') {
      d.push({ id: id++, t: 'n', v: 0, sp: 'zero' });
      for (let v = 1; v <= 13; v++) for (let k = 0; k < v; k++) {
        const c = { id: id++, t: 'n', v };
        if (v === 7 && k === 0) c.sp = 'u7';
        if (v === 13 && k === 0) c.sp = 'l13';
        d.push(c);
      }
      for (const v of [2, 4, 6, 8, 10]) d.push({ id: id++, t: 'm', v: -v });
      d.push({ id: id++, t: 'div' });
      for (const a of ['jom', 'swap', 'steal', 'discard', 'four']) for (let k = 0; k < 2; k++) d.push({ id: id++, t: 'a', a });
      return d; // 108 cartes
    }
    d.push({ id: id++, t: 'n', v: 0 });
    for (let v = 1; v <= 12; v++) for (let k = 0; k < v; k++) d.push({ id: id++, t: 'n', v });
    for (const v of [2, 4, 6, 8, 10]) d.push({ id: id++, t: 'm', v });
    d.push({ id: id++, t: 'x2' });
    for (const a of ['stop', 'three', 'second']) for (let k = 0; k < 3; k++) d.push({ id: id++, t: 'a', a });
    return d; // 94 cartes
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const ACT_NAMES = {
    stop: 'STOP', three: 'TROIS À LA SUITE', second: 'SECONDE CHANCE',
    jom: 'ENCORE UNE !', swap: 'ÉCHANGE', steal: 'VOL', discard: 'DÉFAUSSE', four: 'QUATRE À LA SUITE',
  };
  const SP_NAMES = { zero: 'le Zéro maudit', u7: 'le 7 de la malchance', l13: 'le 13 porte-bonheur' };
  function label(c) {
    if (!c) return '?';
    if (c.t === 'n') return c.sp ? SP_NAMES[c.sp] : String(c.v);
    if (c.t === 'm') return (c.v > 0 ? '+' : '') + c.v;
    if (c.t === 'x2') return '×2';
    if (c.t === 'div') return '÷2';
    return ACT_NAMES[c.a];
  }

  function newPlayer(name, human, avatar) {
    return {
      name, human, avatar, total: 0,
      numbers: [], mods: [], actions: [], pending: [], second: null, bustCard: null,
      status: 'active', flip7: false, last: 0,
    };
  }

  function newGame(difficulty, bots, mode, me) {
    mode = mode === 'vengeance' ? 'vengeance' : 'normal';
    const human = newPlayer('Toi', true, (me && me.avatar) || 'me');
    if (me && me.name) human.display = me.name;
    const players = [human].concat(bots.map(b => newPlayer(b.name, false, b.avatar)));
    return {
      v: 1, mode, difficulty, round: 1, dealer: players.length - 1,
      players, deck: shuffle(makeDeck(mode)), discard: [], log: [],
      phase: 'deal', dealPos: 0, turn: 0, cur: 0, flip7: null, scored: false, over: false, winner: null,
      startedAt: Date.now(),
    };
  }

  function numSum(p) { return p.numbers.reduce((s, c) => s + c.v, 0); }
  function hasX2(p) { return p.mods.some(c => c.t === 'x2'); }
  function hasDiv(p) { return p.mods.some(c => c.t === 'div'); }
  function hasZero(p) { return p.numbers.some(c => c.sp === 'zero'); }
  function plusSum(p) { return p.mods.reduce((s, c) => s + (c.t === 'm' ? c.v : 0), 0); }
  // Somme des numéros → ×2 → ÷2 (arrondi en dessous) → bonus / malus → jamais sous 0 → Zéro maudit → +15
  function roundScore(p) {
    if (p.status === 'busted') return 0;
    let s = numSum(p);
    if (hasX2(p)) s *= 2;
    if (hasDiv(p)) s = Math.floor(s / 2);
    s += plusSum(p);
    if (s < 0) s = 0;
    if (hasZero(p) && !p.flip7) s = 0;
    if (p.flip7) s += FLIP7_BONUS;
    return s;
  }
  // Nombre de cartes numéro (le 13 porte-bonheur permet deux 13, qui comptent tous les deux)
  function uniqueCount(p) { return p.numbers.length; }
  // La carte provoquerait-elle un doublon ?
  function isDup(p, card) {
    if (card.t !== 'n' || card.sp === 'u7') return false;
    const same = p.numbers.filter(c => c.v === card.v).length;
    if (!same) return false;
    if (card.v === 13 && same === 1 && (card.sp === 'l13' || p.numbers.some(c => c.sp === 'l13'))) return false;
    return true;
  }

  class Engine {
    constructor(G, ui) { this.G = G; this.ui = ui; if (!G.mode) G.mode = 'normal'; }

    get V() { return this.G.mode === 'vengeance'; }
    log(m) { this.G.log.push({ r: this.G.round, m }); }
    P(i) { return this.G.players[i]; }
    active(i) { return this.P(i).status === 'active'; }
    activeList() { return this.G.players.map((p, i) => i).filter(i => this.active(i)); }
    aliveList() { return this.G.players.map((p, i) => i).filter(i => this.P(i).status !== 'busted'); }
    roundOver() { return this.G.flip7 !== null || this.activeList().length === 0; }
    mustHit(p) { return this.V && p.status === 'active' && hasZero(p); }
    upd(extra) { this.ui.event('update', extra || {}); }

    async run() {
      const G = this.G, n = G.players.length;
      while (!G.over) {
        if (G.phase === 'deal') {
          if (G.dealPos === 0) {
            this.log(`— Manche ${G.round} — ${this.P(G.dealer).name} distribue.`);
            this.ui.save();
            await this.ui.event('roundStart', {});
          }
          while (G.dealPos < n && !this.roundOver()) {
            const i = (G.dealer + 1 + G.dealPos) % n;
            this.ui.save();
            if (this.active(i)) await this.drawFor(i, { deal: true });
            G.dealPos++;
          }
          G.phase = 'play';
          G.turn = (G.dealer + 1) % n;
        }
        if (G.phase === 'play') {
          while (!this.roundOver()) {
            const i = G.turn, p = this.P(i);
            if (p.status === 'active') {
              G.cur = i;
              this.ui.save();
              this.upd();
              let choice = p.human ? await this.ui.askChoice(i) : await this.botChoice(i);
              if (choice === 'stay' && this.mustHit(p)) choice = 'hit';
              if (choice === 'stay') {
                p.status = 'stayed';
                this.log(`${p.name} s'arrête avec ${roundScore(p)} pts.`);
                await this.ui.event('stay', { i });
              } else {
                await this.drawFor(i, {});
              }
            }
            G.turn = (G.turn + 1) % n;
          }
          G.phase = 'end';
        }
        if (G.phase === 'end') {
          if (!G.scored) {
            for (const p of G.players) {
              p.last = roundScore(p);
              p.total += p.last;
            }
            this.log('Scores de la manche : ' + G.players.map(p => `${p.name} +${p.last} (${p.total})`).join(', '));
            G.scored = true;
          }
          this.ui.save();
          const max = Math.max(...G.players.map(p => p.total));
          const leaders = G.players.map((p, i) => i).filter(i => this.P(i).total === max);
          if (max >= TARGET && leaders.length === 1) {
            G.over = true;
            G.winner = leaders[0];
            this.log(`🏆 ${this.P(leaders[0]).name} gagne la partie avec ${max} pts !`);
            this.ui.save();
            await this.ui.event('gameover', { winner: leaders[0] });
            return;
          }
          await this.ui.event('roundEnd', { tie: max >= TARGET });
          this.nextRound();
        }
      }
    }

    nextRound() {
      const G = this.G;
      for (const p of G.players) {
        G.discard.push(...p.numbers, ...p.mods, ...p.actions, ...p.pending);
        if (p.second) G.discard.push(p.second);
        if (p.bustCard) G.discard.push(p.bustCard);
        Object.assign(p, { numbers: [], mods: [], actions: [], pending: [], second: null, bustCard: null, status: 'active', flip7: false });
      }
      G.round++;
      G.dealer = (G.dealer + 1) % G.players.length;
      Object.assign(G, { phase: 'deal', dealPos: 0, flip7: null, scored: false });
    }

    drawCard() {
      const G = this.G;
      if (!G.deck.length) {
        if (!G.discard.length) return null;
        G.deck = shuffle(G.discard);
        G.discard = [];
        this.log('La défausse est mélangée pour reformer la pioche.');
        this.ui.event('reshuffle', {});
      }
      return G.deck.pop();
    }

    async drawFor(i, ctx) {
      const p = this.P(i);
      this.G.cur = i;
      this.upd();
      const card = this.drawCard();
      if (!card) { if (p.status === 'active') p.status = 'stayed'; this.log(`Plus de cartes : ${p.name} s'arrête.`); return; }
      this.log(`${p.name} pioche ${label(card)}${ctx.n ? ` (${ctx.n === 4 ? 'quatre' : 'trois'} à la suite ${ctx.k}/${ctx.n})` : ''}.`);
      await this.ui.reveal(card, i, ctx);
      await this.resolve(i, card);
    }

    sortMods(p) {
      const rank = c => (c.t === 'x2' ? -2 : c.t === 'div' ? -1 : 0);
      p.mods.sort((a, b) => rank(a) - rank(b) || (a.v || 0) - (b.v || 0));
    }

    // Une carte numéro arrive devant le joueur i (pioche, vol ou échange)
    async receiveNumber(i, card) {
      const G = this.G, p = this.P(i);
      if (isDup(p, card)) {
        if (p.second) {
          G.discard.push(card, p.second);
          p.second = null;
          this.log(`${p.name} utilise sa Seconde chance : le ${card.v} en double est défaussé.`);
          this.upd();
          await this.ui.event('second', { i, card });
        } else {
          p.status = 'busted';
          p.bustCard = card;
          this.log(`💥 Doublon de ${card.v} : ${p.name} perd la manche.`);
          this.upd({ pop: card.id });
          await this.ui.event('bust', { i, card });
        }
        return;
      }
      if (card.sp === 'u7') {
        const lost = p.numbers.length + p.mods.length;
        G.discard.push(...p.numbers, ...p.mods);
        p.numbers = [card];
        p.mods = [];
        this.log(`${p.name} reçoit le 7 de la malchance : ${lost ? 'toutes ses autres cartes sont défaussées' : 'aucune carte à perdre'}.`);
        this.upd({ pop: card.id });
        await this.ui.event('u7', { i, card, lost });
      } else {
        const lucky = card.v === 13 && p.numbers.some(c => c.v === 13);
        p.numbers.push(card);
        p.numbers.sort((a, b) => a.v - b.v);
        this.upd({ pop: card.id });
        if (lucky) { this.log(`${p.name} garde deux 13 grâce au 13 porte-bonheur.`); await this.ui.event('lucky', { i, card }); }
        if (card.sp === 'zero') { this.log(`${p.name} reçoit le Zéro maudit : 0 point sauf avec 7 numéros.`); await this.ui.event('zero', { i, card }); }
      }
      if (uniqueCount(p) === 7 && G.flip7 === null) {
        p.flip7 = true;
        if (p.status === 'active') p.status = 'stayed';
        G.flip7 = i;
        this.log(`⭐ ${p.name} réussit 7 cartes numéro : +${FLIP7_BONUS} pts, la manche s'arrête !`);
        await this.ui.event('flip7', { i });
      }
    }

    async giveCard(j, card) {
      if (card.t === 'n') return this.receiveNumber(j, card);
      const p = this.P(j);
      p.mods.push(card);
      this.sortMods(p);
      this.upd({ pop: card.id });
    }

    takeCard(j, id) {
      const p = this.P(j);
      for (const k of ['numbers', 'mods']) {
        const at = p[k].findIndex(c => c.id === id);
        if (at >= 0) return p[k].splice(at, 1)[0];
      }
      return null;
    }

    async resolve(i, card) {
      const G = this.G, p = this.P(i);
      if (card.t === 'n') return this.receiveNumber(i, card);
      if (this.V) return this.resolveV(i, card);
      if (card.t === 'm' || card.t === 'x2') {
        p.mods.push(card);
        this.sortMods(p);
        this.upd({ pop: card.id });
        return;
      }
      if (card.a === 'second') {
        if (!p.second) { p.second = card; this.upd({ pop: card.id }); return; }
        const cands = this.activeList().filter(j => j !== i && !this.P(j).second);
        if (!cands.length) {
          G.discard.push(card);
          this.log(`${p.name} a déjà une Seconde chance : la nouvelle est défaussée.`);
          await this.ui.event('discardSecond', { i });
          return;
        }
        const t = await this.chooseTarget(i, 'second', cands, card);
        this.P(t).second = card;
        this.log(`${p.name} donne sa Seconde chance en trop à ${this.P(t).name}.`);
        this.upd({ pop: card.id });
        await this.ui.event('give', { from: i, to: t });
        return;
      }
      if (card.a === 'stop') {
        const cands = this.activeList();
        const t = await this.chooseTarget(i, 'stop', cands, card);
        const tp = this.P(t);
        tp.actions.push(card);
        tp.status = 'frozen';
        this.log(t === i ? `${p.name} se donne la carte STOP et garde ${roundScore(tp)} pts.`
          : `${p.name} donne STOP à ${tp.name}, qui garde ${roundScore(tp)} pts.`);
        this.upd({ pop: card.id });
        await this.ui.event('freeze', { from: i, to: t });
        return;
      }
      if (card.a === 'three') {
        const cands = this.activeList();
        const t = await this.chooseTarget(i, 'three', cands, card);
        this.P(t).actions.push(card);
        this.log(t === i ? `${p.name} garde TROIS À LA SUITE pour lui-même.` : `${p.name} impose TROIS À LA SUITE à ${this.P(t).name}.`);
        this.upd({ pop: card.id });
        await this.ui.event('three', { from: i, to: t });
        await this.flipN(t, 3);
      }
    }

    /* ---------- Version Vengeance : malus et coups bas ---------- */
    async resolveV(i, card) {
      const G = this.G, p = this.P(i);
      const alive = this.aliveList();
      if (card.t === 'm' || card.t === 'div') {
        // Un malus se donne à un joueur non éliminé (soi-même seulement si personne d'autre)
        const t = await this.chooseTarget(i, 'mod', alive, card);
        const tp = this.P(t);
        tp.mods.push(card);
        this.sortMods(tp);
        this.log(t === i ? `${p.name} doit garder le malus ${label(card)}.` : `${p.name} donne le malus ${label(card)} à ${tp.name}.`);
        this.upd({ pop: card.id });
        await this.ui.event('mod', { from: i, to: t, card });
        return;
      }
      if (card.a === 'jom') {
        const t = await this.chooseTarget(i, 'jom', alive, card);
        const tp = this.P(t);
        G.discard.push(card);
        this.log(t === i ? `${p.name} se donne ENCORE UNE ! : une carte puis stop.` : `${p.name} impose ENCORE UNE ! à ${tp.name}.`);
        this.upd();
        await this.ui.event('jom', { from: i, to: t });
        const c = this.drawCard();
        if (c) {
          this.G.cur = t;
          this.log(`${tp.name} pioche ${label(c)} (encore une !).`);
          await this.ui.reveal(c, t, { jom: true });
          await this.resolve(t, c);
        }
        if (tp.status === 'active' && G.flip7 === null) {
          tp.status = 'stayed';
          this.log(`${tp.name} doit s'arrêter avec ${roundScore(tp)} pts.`);
          await this.ui.event('forcedStay', { i: t });
        }
        this.upd();
        return;
      }
      if (card.a === 'four') {
        const t = await this.chooseTarget(i, 'four', alive, card);
        G.discard.push(card);
        this.log(t === i ? `${p.name} garde QUATRE À LA SUITE pour lui-même.` : `${p.name} impose QUATRE À LA SUITE à ${this.P(t).name}.`);
        this.upd();
        await this.ui.event('four', { from: i, to: t });
        await this.flipN(t, 4);
        return;
      }
      // Vol, Défausse, Échange : on choisit des cartes face visible devant des joueurs non éliminés
      const withCards = alive.map(j => ({ j, cards: [...this.P(j).numbers, ...this.P(j).mods] })).filter(o => o.cards.length);
      G.discard.push(card);
      if (card.a === 'steal') {
        const opts = p.status === 'busted' ? [] : withCards.filter(o => o.j !== i);
        if (!opts.length) return this.noTarget(i, card);
        const pick = await this.chooseCard(i, 'steal', opts);
        const c = this.takeCard(pick.j, pick.id);
        this.log(`${p.name} vole ${label(c)} à ${this.P(pick.j).name}.`);
        this.upd();
        await this.ui.event('steal', { i, from: pick.j, card: c });
        await this.giveCard(i, c);
        this.upd();
        return;
      }
      if (card.a === 'discard') {
        if (!withCards.length) return this.noTarget(i, card);
        const pick = await this.chooseCard(i, 'discard', withCards);
        const c = this.takeCard(pick.j, pick.id);
        G.discard.push(c);
        this.log(pick.j === i ? `${p.name} défausse son propre ${label(c)}.` : `${p.name} fait défausser ${label(c)} à ${this.P(pick.j).name}.`);
        this.upd();
        await this.ui.event('discard', { i, from: pick.j, card: c });
        return;
      }
      if (card.a === 'swap') {
        if (withCards.length < 2) return this.noTarget(i, card);
        let a, b;
        if (p.human) {
          a = await this.ui.askCard(i, 'swap1', withCards);
          b = await this.ui.askCard(i, 'swap2', withCards.filter(o => o.j !== a.j), { first: a });
        } else {
          await this.ui.think(i, 'swap');
          [a, b] = this.botSwap(i, withCards);
        }
        const ca = this.takeCard(a.j, a.id), cb = this.takeCard(b.j, b.id);
        this.log(`${p.name} échange ${label(ca)} (${this.P(a.j).name}) et ${label(cb)} (${this.P(b.j).name}).`);
        this.upd();
        await this.ui.event('swap', { i, a: { j: a.j, card: ca }, b: { j: b.j, card: cb } });
        await this.giveCard(b.j, ca);
        await this.giveCard(a.j, cb);
        this.upd();
      }
    }

    async noTarget(i, card) {
      this.log(`${label(card)} n'a aucune cible : la carte est défaussée.`);
      this.upd();
      await this.ui.event('noTarget', { i, card });
    }

    // TROIS À LA SUITE (version normale) / QUATRE À LA SUITE (Vengeance)
    async flipN(t, n) {
      const tp = this.P(t), V = this.V;
      let broke = false;
      for (let k = 1; k <= n; k++) {
        if (tp.status === 'busted' || this.roundOver() || (!V && tp.status !== 'active')) { broke = true; break; }
        const card = this.drawCard();
        if (!card) break;
        this.G.cur = t;
        this.log(`${tp.name} pioche ${label(card)} (${n === 4 ? 'quatre' : 'trois'} à la suite ${k}/${n}).`);
        await this.ui.reveal(card, t, { n, k });
        const queue = V ? (card.t === 'a' || card.t === 'm' || card.t === 'div') : (card.t === 'a' && card.a !== 'second');
        if (queue) {
          tp.pending.push(card);
          this.upd({ pop: card.id });
        } else {
          await this.resolve(t, card);
        }
      }
      if (tp.status === 'busted' || this.G.flip7 !== null) broke = true;
      while (tp.pending.length) {
        const c = tp.pending.shift();
        const ok = V ? !broke && this.G.flip7 === null : tp.status === 'active' && !this.roundOver();
        if (ok) await this.resolve(t, c);
        else this.G.discard.push(c);
        this.upd();
      }
      this.upd();
    }

    async chooseTarget(i, kind, cands, card) {
      if (cands.length === 1) return cands[0];
      if (this.P(i).human) return this.ui.askTarget(i, kind, cands, card);
      await this.ui.think(i, kind);
      return this.botTarget(i, kind, cands, card);
    }

    async chooseCard(i, kind, opts) {
      if (this.P(i).human) return this.ui.askCard(i, kind, opts);
      await this.ui.think(i, kind);
      return this.botCard(i, kind, opts);
    }

    /* ---------- Intelligence des robots ---------- */

    bustProb(p, level) {
      if (!p.numbers.length) return 0;
      if (level === 'difficile') {
        const pool = this.G.deck.length ? this.G.deck : this.G.discard;
        if (!pool.length) return 0;
        return pool.filter(c => isDup(p, c)).length / pool.length;
      }
      // Niveau moyen : composition théorique du paquet moins les cartes visibles sur la table
      const seen = {};
      let visible = 0;
      for (const q of this.G.players) {
        const cards = [...q.numbers, ...q.mods, ...q.actions, ...q.pending];
        if (q.second) cards.push(q.second);
        if (q.bustCard) cards.push(q.bustCard);
        for (const c of cards) { visible++; if (c.t === 'n') seen[c.v] = (seen[c.v] || 0) + 1; }
      }
      let dup = 0;
      for (const v of new Set(p.numbers.map(c => c.v))) {
        if (!isDup(p, { t: 'n', v })) continue;
        let copies = v === 0 ? 1 : v;
        if (this.V && v === 7) copies--; // le 7 de la malchance ne fait pas sauter
        dup += Math.max(0, copies - (seen[v] || 0));
      }
      return dup / Math.max(1, (DECK_SIZE[this.G.mode] || 94) - visible);
    }

    // Espérance de gain d'une pioche (comptage exact de la pioche)
    hitEV(p, aggr) {
      const pool = this.G.deck.length ? this.G.deck : this.G.discard;
      if (!pool.length) return 0;
      const s = roundScore(p);
      const mult = (hasX2(p) ? 2 : 1) * (hasDiv(p) ? 0.5 : 1);
      const six = uniqueCount(p) === 6;
      let ev = 0;
      for (const c of pool) {
        if (c.t === 'n') {
          if (isDup(p, c)) ev -= p.second ? 0 : s;
          else if (c.sp === 'u7') ev += aggr * (7 - s);
          else if (c.sp === 'zero') ev -= s * 0.8;
          else ev += aggr * (c.v * mult + (six ? FLIP7_BONUS : 0));
        } else if (c.t === 'm') ev += c.v > 0 ? aggr * c.v : 1;
        else if (c.t === 'x2') ev += aggr * numSum(p);
        else if (c.t === 'div') ev += 1;
        else if (c.a === 'second') ev += p.second ? 0 : 2;
        else if (this.V) ev += 1;
      }
      return ev / pool.length;
    }

    async botChoice(i) {
      await this.ui.think(i, 'turn');
      return this.decide(i);
    }

    decide(i) {
      const G = this.G, p = this.P(i), lvl = G.difficulty;
      if (this.mustHit(p)) return 'hit';
      const s = roundScore(p), n = p.numbers.length;
      if (n === 0) return 'hit';
      const others = G.players.filter(q => q !== p);
      const bestOther = Math.max(...others.map(q => q.total + roundScore(q)));
      const secures = p.total + s >= TARGET && p.total + s > bestOther;

      if (lvl === 'facile') {
        if (p.second) return Math.random() < 0.85 ? 'hit' : 'stay';
        const thr = 12 + Math.random() * 20;
        if (s >= thr) return 'stay';
        return Math.random() < 0.08 ? 'stay' : 'hit';
      }
      if (lvl === 'moyen') {
        if (secures && n >= 2) return 'stay';
        if (p.second) return 'hit';
        const pb = this.bustProb(p, 'moyen');
        if (uniqueCount(p) === 6 && pb < 0.45) return 'hit';
        return pb >= 0.32 || s >= 27 ? 'stay' : 'hit';
      }
      // difficile
      if (secures) return 'stay';
      if (p.second) return 'hit';
      const leader = Math.max(...others.map(q => q.total));
      let aggr = 1.6;
      if (leader >= 150 && leader - p.total > 40) aggr = 2.2;
      else if (p.total >= 160 && p.total >= leader) aggr = 1.1;
      // Si tous les autres ont fini et que je suis déjà devant pour la manche, inutile de risquer
      const stillIn = this.activeList().filter(j => j !== i);
      if (!stillIn.length) {
        const beatAll = others.every(q => p.total + s > q.total + roundScore(q));
        if (beatAll && p.total + s >= TARGET) return 'stay';
      }
      return this.hitEV(p, aggr) > 0 ? 'hit' : 'stay';
    }

    // Poids d'un adversaire : plus il est menaçant, plus lui faire perdre des points compte
    weight(i, j) {
      if (i === j) return 1;
      const lvl = this.G.difficulty, me = this.P(i), q = this.P(j);
      if (lvl !== 'difficile') return 0.8;
      return 0.7 + Math.max(0, (q.total + roundScore(q)) - (me.total + roundScore(me))) / 100;
    }
    // Valeur d'un coup simulé : changes = { j: {numbers, mods, busted, flip7} }
    simValue(i, changes) {
      let v = 0;
      for (const k of Object.keys(changes)) {
        const j = +k, q = this.P(j), ch = changes[k];
        const before = roundScore(q);
        const after = ch.busted ? 0 : roundScore({ status: 'active', numbers: ch.numbers, mods: ch.mods, flip7: ch.flip7 });
        v += (j === i ? 1 : -this.weight(i, j)) * (after - before);
      }
      return v;
    }
    simState(j, changes) {
      if (!changes[j]) { const q = this.P(j); changes[j] = { numbers: q.numbers.slice(), mods: q.mods.slice(), busted: false, flip7: q.flip7 }; }
      return changes[j];
    }
    simRemove(changes, j, id) {
      const s = this.simState(j, changes);
      s.numbers = s.numbers.filter(c => c.id !== id);
      s.mods = s.mods.filter(c => c.id !== id);
    }
    simGive(changes, j, card) {
      const s = this.simState(j, changes);
      if (card.t !== 'n') { s.mods = s.mods.concat(card); return; }
      if (isDup({ numbers: s.numbers }, card)) { s.busted = true; return; }
      if (card.sp === 'u7') { s.numbers = [card]; s.mods = []; return; }
      s.numbers = s.numbers.concat(card);
      if (s.numbers.length === 7) s.flip7 = true;
    }

    botCard(i, kind, opts) {
      const all = [];
      for (const o of opts) for (const c of o.cards) all.push({ j: o.j, id: c.id, c });
      if (this.G.difficulty === 'facile') return all[Math.floor(Math.random() * all.length)];
      let best = all[0], bv = -Infinity;
      for (const m of all) {
        const ch = {};
        this.simRemove(ch, m.j, m.id);
        if (kind === 'steal') this.simGive(ch, i, m.c);
        const v = this.simValue(i, ch) + Math.random() * 0.01;
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }

    botSwap(i, opts) {
      const all = [];
      for (const o of opts) for (const c of o.cards) all.push({ j: o.j, id: c.id, c });
      const pairs = [];
      for (let x = 0; x < all.length; x++) for (let y = x + 1; y < all.length; y++) if (all[x].j !== all[y].j) pairs.push([all[x], all[y]]);
      if (this.G.difficulty === 'facile') return pairs[Math.floor(Math.random() * pairs.length)];
      let best = pairs[0], bv = -Infinity;
      for (const [a, b] of pairs) {
        const ch = {};
        this.simRemove(ch, a.j, a.id);
        this.simRemove(ch, b.j, b.id);
        this.simGive(ch, b.j, a.c);
        this.simGive(ch, a.j, b.c);
        const v = this.simValue(i, ch) + Math.random() * 0.01;
        if (v > bv) { bv = v; best = [a, b]; }
      }
      return best;
    }

    botTarget(i, kind, cands, card) {
      const lvl = this.G.difficulty, p = this.P(i);
      const rnd = a => a[Math.floor(Math.random() * a.length)];
      const others = cands.filter(j => j !== i);
      const by = (arr, f) => arr.reduce((b, j) => (f(j) > f(b) ? j : b), arr[0]);
      if (kind === 'mod') {
        if (!others.length) return i;
        if (lvl === 'facile') return rnd(others);
        return by(others, j => { const ch = {}; this.simGive(ch, j, card); return this.simValue(i, ch); });
      }
      if (lvl === 'facile') return rnd(cands);
      if (kind === 'second') return by(cands, j => -this.P(j).total);
      if (!others.length) return i;
      if (kind === 'stop') {
        if (lvl === 'moyen') return by(others, j => this.P(j).total + roundScore(this.P(j)));
        if (cands.includes(i) && roundScore(p) >= 15 && this.bustProb(p, 'difficile') >= 0.28) return i;
        // geler l'adversaire le plus menaçant tant qu'il a peu de points dans la manche
        return by(others, j => this.P(j).total * 0.4 + (30 - roundScore(this.P(j))) * 2);
      }
      if (kind === 'jom') {
        const lv = lvl === 'moyen' ? 'moyen' : 'difficile';
        const val = j => {
          const q = this.P(j);
          return this.bustProb(q, lv) * roundScore(q) * (j === i ? -1 : this.weight(i, j)) + (q.status === 'active' && j !== i ? 2 : 0);
        };
        if (cands.includes(i) && p.status === 'active' && roundScore(p) >= 25 && this.bustProb(p, lv) < 0.2) return i;
        return by(others, val);
      }
      // three / four
      if (lvl === 'moyen') return by(others, j => this.P(j).numbers.length * 10 + this.P(j).total / 20);
      const val = j => this.bustProb(this.P(j), 'difficile') * roundScore(this.P(j)) + this.P(j).total * 0.03;
      const best = by(others, val);
      if (cands.includes(i) && val(best) < 2 && p.numbers.length <= 2 && this.bustProb(p, 'difficile') < 0.15) return i;
      return best;
    }
  }

  const api = { WORDS, TARGET, FLIP7_BONUS, DECK_SIZE, ACT_NAMES, SP_NAMES, makeDeck, shuffle, label, newGame, roundScore, uniqueCount, isDup, numSum, hasX2, hasDiv, hasZero, plusSum, Engine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.P7 = api;
})(this);
