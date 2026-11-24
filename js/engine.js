/* Pioche 7 — moteur de règles et robots (aucune dépendance au DOM) */
(function (root) {
  'use strict';

  const WORDS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE'];
  const TARGET = 200;
  const FLIP7_BONUS = 15;

  function makeDeck() {
    let id = 0;
    const d = [{ id: id++, t: 'n', v: 0 }];
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

  function label(c) {
    if (!c) return '?';
    if (c.t === 'n') return String(c.v);
    if (c.t === 'm') return '+' + c.v;
    if (c.t === 'x2') return '×2';
    return { stop: 'STOP', three: 'TROIS À LA SUITE', second: 'SECONDE CHANCE' }[c.a];
  }

  function newPlayer(name, human, avatar) {
    return {
      name, human, avatar, total: 0,
      numbers: [], mods: [], actions: [], pending: [], second: null, bustCard: null,
      status: 'active', flip7: false, last: 0,
    };
  }

  function newGame(difficulty, bots) {
    const players = [newPlayer('Toi', true, '🙂')].concat(bots.map(b => newPlayer(b.name, false, b.avatar)));
    return {
      v: 1, difficulty, round: 1, dealer: players.length - 1,
      players, deck: shuffle(makeDeck()), discard: [], log: [],
      phase: 'deal', dealPos: 0, turn: 0, cur: 0, flip7: null, scored: false, over: false, winner: null,
      startedAt: Date.now(),
    };
  }

  function numSum(p) { return p.numbers.reduce((s, c) => s + c.v, 0); }
  function hasX2(p) { return p.mods.some(c => c.t === 'x2'); }
  function plusSum(p) { return p.mods.reduce((s, c) => s + (c.t === 'm' ? c.v : 0), 0); }
  function roundScore(p) {
    if (p.status === 'busted') return 0;
    let s = numSum(p);
    if (hasX2(p)) s *= 2;
    s += plusSum(p);
    if (p.flip7) s += FLIP7_BONUS;
    return s;
  }
  function uniqueCount(p) { return new Set(p.numbers.map(c => c.v)).size; }

  class Engine {
    constructor(G, ui) { this.G = G; this.ui = ui; }

    log(m) { this.G.log.push({ r: this.G.round, m }); }
    P(i) { return this.G.players[i]; }
    active(i) { return this.P(i).status === 'active'; }
    activeList() { return this.G.players.map((p, i) => i).filter(i => this.active(i)); }
    roundOver() { return this.G.flip7 !== null || this.activeList().length === 0; }
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
              const choice = p.human ? await this.ui.askChoice(i) : await this.botChoice(i);
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
      if (!card) { p.status = 'stayed'; this.log(`Plus de cartes : ${p.name} s'arrête.`); return; }
      this.log(`${p.name} pioche ${label(card)}${ctx.three ? ` (trois à la suite ${ctx.three}/3)` : ''}.`);
      await this.ui.reveal(card, i, ctx);
      await this.resolve(i, card);
    }

    async resolve(i, card) {
      const G = this.G, p = this.P(i);
      if (card.t === 'n') {
        if (p.numbers.some(c => c.v === card.v)) {
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
        } else {
          p.numbers.push(card);
          p.numbers.sort((a, b) => a.v - b.v);
          this.upd({ pop: card.id });
          if (uniqueCount(p) === 7) {
            p.flip7 = true;
            p.status = 'stayed';
            G.flip7 = i;
            this.log(`⭐ ${p.name} réussit 7 cartes différentes : +${FLIP7_BONUS} pts, la manche s'arrête !`);
            await this.ui.event('flip7', { i });
          }
        }
        return;
      }
      if (card.t === 'm' || card.t === 'x2') {
        p.mods.push(card);
        p.mods.sort((a, b) => (a.t === 'x2' ? -1 : b.t === 'x2' ? 1 : a.v - b.v));
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
        const t = await this.chooseTarget(i, 'second', cands);
        this.P(t).second = card;
        this.log(`${p.name} donne sa Seconde chance en trop à ${this.P(t).name}.`);
        this.upd({ pop: card.id });
        await this.ui.event('give', { from: i, to: t });
        return;
      }
      if (card.a === 'stop') {
        const cands = this.activeList();
        const t = await this.chooseTarget(i, 'stop', cands);
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
        const t = await this.chooseTarget(i, 'three', cands);
        this.P(t).actions.push(card);
        this.log(t === i ? `${p.name} garde TROIS À LA SUITE pour lui-même.` : `${p.name} impose TROIS À LA SUITE à ${this.P(t).name}.`);
        this.upd({ pop: card.id });
        await this.ui.event('three', { from: i, to: t });
        await this.flipThree(t);
      }
    }

    async flipThree(t) {
      const tp = this.P(t);
      for (let k = 1; k <= 3; k++) {
        if (tp.status !== 'active' || this.roundOver()) break;
        const card = this.drawCard();
        if (!card) break;
        this.G.cur = t;
        this.log(`${tp.name} pioche ${label(card)} (trois à la suite ${k}/3).`);
        await this.ui.reveal(card, t, { three: k });
        if (card.t === 'a' && card.a !== 'second') {
          tp.pending.push(card);
          this.upd({ pop: card.id });
        } else {
          await this.resolve(t, card);
        }
      }
      while (tp.pending.length) {
        const c = tp.pending.shift();
        if (tp.status === 'active' && !this.roundOver()) {
          await this.resolve(t, c);
        } else {
          this.G.discard.push(c);
        }
      }
      this.upd();
    }

    async chooseTarget(i, kind, cands) {
      if (cands.length === 1) return cands[0];
      if (this.P(i).human) return this.ui.askTarget(i, kind, cands);
      await this.ui.think(i, kind);
      return this.botTarget(i, kind, cands);
    }

    /* ---------- Intelligence des robots ---------- */

    bustProb(p, level) {
      const have = new Set(p.numbers.map(c => c.v));
      if (!have.size) return 0;
      if (level === 'difficile') {
        const pool = this.G.deck.length ? this.G.deck : this.G.discard;
        if (!pool.length) return 0;
        return pool.filter(c => c.t === 'n' && have.has(c.v)).length / pool.length;
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
      for (const v of have) dup += Math.max(0, (v === 0 ? 1 : v) - (seen[v] || 0));
      return dup / Math.max(1, 94 - visible);
    }

    // Espérance de gain d'une pioche (comptage exact de la pioche)
    hitEV(p, aggr) {
      const pool = this.G.deck.length ? this.G.deck : this.G.discard;
      if (!pool.length) return 0;
      const have = new Set(p.numbers.map(c => c.v));
      const s = roundScore(p);
      const mult = hasX2(p) ? 2 : 1;
      const six = uniqueCount(p) === 6;
      let ev = 0;
      for (const c of pool) {
        if (c.t === 'n') {
          if (have.has(c.v)) ev -= p.second ? 0 : s;
          else ev += aggr * (c.v * mult + (six ? FLIP7_BONUS : 0));
        } else if (c.t === 'm') ev += aggr * c.v;
        else if (c.t === 'x2') ev += aggr * numSum(p);
        else if (c.a === 'second') ev += p.second ? 0 : 2;
      }
      return ev / pool.length;
    }

    async botChoice(i) {
      await this.ui.think(i, 'turn');
      return this.decide(i);
    }

    decide(i) {
      const G = this.G, p = this.P(i), lvl = G.difficulty;
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

    botTarget(i, kind, cands) {
      const lvl = this.G.difficulty, p = this.P(i);
      const rnd = a => a[Math.floor(Math.random() * a.length)];
      const others = cands.filter(j => j !== i);
      const by = (arr, f) => arr.reduce((b, j) => (f(j) > f(b) ? j : b), arr[0]);
      if (lvl === 'facile') return rnd(cands);
      if (kind === 'second') return by(cands, j => -this.P(j).total);
      if (!others.length) return i;
      if (kind === 'stop') {
        if (lvl === 'moyen') return by(others, j => this.P(j).total + roundScore(this.P(j)));
        if (cands.includes(i) && roundScore(p) >= 15 && this.bustProb(p, 'difficile') >= 0.28) return i;
        // geler l'adversaire le plus menaçant tant qu'il a peu de points dans la manche
        return by(others, j => this.P(j).total * 0.4 + (30 - roundScore(this.P(j))) * 2);
      }
      // three
      if (lvl === 'moyen') return by(others, j => this.P(j).numbers.length * 10 + this.P(j).total / 20);
      const val = j => this.bustProb(this.P(j), 'difficile') * roundScore(this.P(j)) + this.P(j).total * 0.03;
      const best = by(others, val);
      if (cands.includes(i) && val(best) < 2 && p.numbers.length <= 2 && this.bustProb(p, 'difficile') < 0.15) return i;
      return best;
    }
  }

  const api = { WORDS, TARGET, FLIP7_BONUS, makeDeck, shuffle, label, newGame, roundScore, uniqueCount, numSum, hasX2, plusSum, Engine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.P7 = api;
})(this);
