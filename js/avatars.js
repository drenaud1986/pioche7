/* Pioche 7 — personnages illustrés en SVG (expressions selon la situation) */
(function (root) {
  'use strict';

  const CHARS = {
    me:   { bg: '#3b82f6', bg2: '#1e40af', skin: '#f3c6a0', hair: '#6b3f1f', style: 'short', shirt: '#1e3a8a', extra: 'hood' },
    zoe:  { bg: '#f472b6', bg2: '#be185d', skin: '#f7d4b8', hair: '#f5c64a', style: 'long', shirt: '#7c3aed', extra: 'sunglasses' },
    hugo: { bg: '#34d399', bg2: '#047857', skin: '#efc09a', hair: '#7a4a24', style: 'messy', shirt: '#166534', extra: 'glasses' },
    lina: { bg: '#c084fc', bg2: '#6d28d9', skin: '#d9a27a', hair: '#3b2416', style: 'cap', shirt: '#0f172a', cap: '#2563eb' },
    // Personnages au choix pour le joueur
    max:  { bg: '#fb923c', bg2: '#c2410c', skin: '#8d5a3b', hair: '#1c1917', style: 'curly', shirt: '#7c2d12', extra: 'glasses' },
    emma: { bg: '#2dd4bf', bg2: '#0f766e', skin: '#f6d2b8', hair: '#c2410c', style: 'bun', shirt: '#be123c' },
    leo:  { bg: '#facc15', bg2: '#a16207', skin: '#e8b48f', hair: '#57351c', style: 'bald', shirt: '#1e40af', face: 'beard' },
    jade: { bg: '#f87171', bg2: '#b91c1c', skin: '#f3d3b5', hair: '#111827', style: 'bob', shirt: '#111827' },
    sam:  { bg: '#818cf8', bg2: '#3730a3', skin: '#c68a62', hair: '#4a2c17', style: 'ponytail', shirt: '#0e7490', extra: 'headphones' },
    tom:  { bg: '#94a3b8', bg2: '#334155', skin: '#f0c8a6', hair: '#d1d5db', style: 'short', shirt: '#7f1d1d', extra: 'mustache' },
    kim:  { bg: '#e879f9', bg2: '#86198f', skin: '#f7dcc4', hair: '#7c3aed', style: 'long', shirt: '#312e81', extra: 'cat' },
    rio:  { bg: '#4ade80', bg2: '#15803d', skin: '#a86b45', hair: '#1f1308', style: 'cap', shirt: '#facc15', cap: '#dc2626', face: 'beard' },
  };
  const PLAYER_CHOICES = ['me', 'max', 'emma', 'leo', 'jade', 'sam', 'tom', 'kim', 'rio'];
  const INK = '#1d2433';
  let uid = 0;

  function eyes(mood) {
    const L = 41, R = 59, Y = 49;
    const dot = (x, r = 3.2) => `<circle cx="${x}" cy="${Y}" r="${r}" fill="${INK}"/><circle cx="${x + 1}" cy="${Y - 1.2}" r="${r * 0.35}" fill="#fff"/>`;
    const arcUp = x => `<path d="M${x - 4.5} ${Y + 1} Q${x} ${Y - 4.5} ${x + 4.5} ${Y + 1}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    const arcDn = x => `<path d="M${x - 4.5} ${Y - 1} Q${x} ${Y + 3.5} ${x + 4.5} ${Y - 1}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    switch (mood) {
      case 'happy': return arcUp(L) + arcUp(R);
      case 'excited': return dot(L, 4) + dot(R, 4) +
        `<path d="M33 40 L37 37 M67 40 L63 37" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`;
      case 'sad': return arcDn(L) + arcDn(R) +
        `<path d="M35 41 L45 43.5 M65 41 L55 43.5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="M64 55 q2.5 4 0 6 q-2.5 -2 0 -6z" fill="#60a5fa"/>`;
      case 'wink': return arcUp(L) + dot(R);
      case 'think': return dot(L) + dot(R) +
        `<path d="M35 42 L45 41 M55 39.5 L65 42" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'shock': return `<circle cx="${L}" cy="${Y}" r="4.2" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${L}" cy="${Y}" r="1.8" fill="${INK}"/>` +
        `<circle cx="${R}" cy="${Y}" r="4.2" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${R}" cy="${Y}" r="1.8" fill="${INK}"/>`;
      default: return dot(L) + dot(R);
    }
  }
  function mouth(mood) {
    switch (mood) {
      case 'happy': case 'wink':
        return `<path d="M41 58.5 Q50 70 59 58.5 Z" fill="#8b1e2d"/><path d="M42.5 59 L57.5 59 L56.5 61.5 L43.5 61.5Z" fill="#fff"/>`;
      case 'excited':
        return `<path d="M39.5 57 Q50 76 60.5 57 Z" fill="#8b1e2d"/><path d="M41 57.5 L59 57.5 L58 60.5 L42 60.5Z" fill="#fff"/><ellipse cx="50" cy="67" rx="5" ry="3" fill="#f87171"/>`;
      case 'sad': return `<path d="M43.5 65 Q50 59 56.5 65" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'think': return `<path d="M45 63 L55 61.5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
      case 'shock': return `<ellipse cx="50" cy="63" rx="4" ry="5" fill="#8b1e2d"/>`;
      default: return `<path d="M43.5 60.5 Q50 66 56.5 60.5" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
  }
  function hairBack(c) {
    if (c.style === 'long') return `<path d="M23 48 Q19 82 27 98 L73 98 Q81 82 77 48 Z" fill="${c.hair}"/>`;
    if (c.style === 'ponytail') return `<path d="M68 34 Q92 40 88 70 Q86 84 78 90 Q80 70 70 52Z" fill="${c.hair}"/>`;
    if (c.style === 'bun') return `<circle cx="50" cy="15" r="11" fill="${c.hair}"/>`;
    if (c.style === 'bob') return `<path d="M23 62 Q19 24 50 20 Q81 24 77 62 Q70 66 64 62 L36 62 Q30 66 23 62Z" fill="${c.hair}"/>`;
    return '';
  }
  function face(c) {
    if (c.face === 'beard') return `<path d="M27 50 Q28 79 50 81 Q72 79 73 50 Q70 62 63 63 Q56 59 50 60 Q44 59 37 63 Q30 62 27 50Z" fill="${c.hair}"/>`;
    return '';
  }
  function hairFront(c) {
    switch (c.style) {
      case 'short': return `<path d="M26.5 47 Q25 21 50 20 Q75 21 73.5 47 Q71 33 60 31.5 Q51 37 39 32.5 Q30 36 26.5 47Z" fill="${c.hair}"/>`;
      case 'messy': return `<path d="M25.5 48 Q21 27 36 22 Q40 13 51 18 Q62 12 66 21 Q79 25 74.5 48 Q71 34 63 34 Q57 27 49 33 Q39 28 34.5 36 Q29 38 25.5 48Z" fill="${c.hair}"/>`;
      case 'long': return `<path d="M25.5 53 Q23 21 50 20 Q77 21 74.5 53 Q73 35 57 29.5 Q45 39 30.5 36 Q27 43 25.5 53Z" fill="${c.hair}"/>`;
      case 'cap': return `<path d="M27 46 Q26 40 28 36 L72 36 Q74 40 73 46 Q70 41 50 41 Q30 41 27 46Z" fill="${c.hair}"/>` +
        `<path d="M25 39 Q26 16 50 16 Q74 16 75 39Z" fill="${c.cap}"/><path d="M48 16 h4 v23 h-4z" fill="#fff" opacity=".25"/>` +
        `<path d="M21 40 Q50 32 81 40 L86 45 Q50 37 16 45Z" fill="rgba(0,0,0,.45)"/><circle cx="50" cy="16.5" r="2.5" fill="rgba(0,0,0,.45)"/>`;
      case 'curly': return [[29, 40, 8], [33, 29, 9], [43, 22, 10], [56, 21, 10], [67, 28, 9], [72, 39, 8], [26, 49, 6], [74, 49, 6], [50, 27, 9]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.hair}"/>`).join('');
      case 'bun': return `<path d="M26.5 47 Q25 22 50 21 Q75 22 73.5 47 Q70 32 50 31 Q30 32 26.5 47Z" fill="${c.hair}"/>`;
      case 'bald': return `<path d="M26 49 Q24 38 31 33 L32 45Z M74 49 Q76 38 69 33 L68 45Z" fill="${c.hair}"/><path d="M38 28 Q46 25 54 27" stroke="#fff" stroke-width="3" opacity=".35" fill="none" stroke-linecap="round"/>`;
      case 'bob': return `<path d="M25 50 Q23 21 50 20 Q77 21 75 50 Q73 34 62 30 Q50 37 38 30 Q27 34 25 50Z" fill="${c.hair}"/>`;
      case 'ponytail': return `<path d="M26.5 47 Q25 21 50 20 Q75 21 73.5 47 Q72 31 50 30 Q34 30 26.5 47Z" fill="${c.hair}"/>`;
    }
    return '';
  }
  function extra(c) {
    if (c.extra === 'glasses') {
      return `<g stroke="${INK}" stroke-width="2.4" fill="rgba(255,255,255,.18)"><circle cx="41" cy="49" r="7.5"/><circle cx="59" cy="49" r="7.5"/></g><path d="M48.5 49 h3" stroke="${INK}" stroke-width="2.4"/>`;
    }
    if (c.extra === 'sunglasses') {
      return `<g fill="#1f2937"><rect x="31" y="22" width="15" height="9" rx="4"/><rect x="54" y="22" width="15" height="9" rx="4"/></g><path d="M46 25 h8" stroke="#1f2937" stroke-width="2.4"/><rect x="33" y="23.5" width="5" height="2.2" rx="1" fill="#fff" opacity=".45"/>`;
    }
    if (c.extra === 'mustache') {
      return `<path d="M39 58.5 Q44 53.5 50 57 Q56 53.5 61 58.5 Q56 61 50 59 Q44 61 39 58.5Z" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>`;
    }
    if (c.extra === 'headphones') {
      return `<path d="M23 50 Q22 14 50 14 Q78 14 77 50" stroke="#1f2937" stroke-width="5" fill="none"/>` +
        `<rect x="17" y="43" width="11" height="17" rx="5" fill="#ef4444" stroke="#1f2937" stroke-width="2"/><rect x="72" y="43" width="11" height="17" rx="5" fill="#ef4444" stroke="#1f2937" stroke-width="2"/>`;
    }
    if (c.extra === 'cat') {
      return `<path d="M27 33 L28 9 L45 23Z M73 33 L72 9 L55 23Z" fill="${c.hair}"/><path d="M31 27 L31.5 15 L40 22Z M69 27 L68.5 15 L60 22Z" fill="#f9a8d4"/>` +
        `<path d="M30 60 h-12 M30 63 l-11 3 M70 60 h12 M70 63 l11 3" stroke="${INK}" stroke-width="1.4" opacity=".6"/>`;
    }
    return '';
  }
  function body(c) {
    let s = `<path d="M12 100 Q14 77 50 75 Q86 77 88 100Z" fill="${c.shirt}"/>`;
    if (c.extra === 'hood') s += `<path d="M30 80 Q50 92 70 80 Q66 76 50 76 Q34 76 30 80Z" fill="#2b4aa8"/><path d="M44 85 v9 M56 85 v9" stroke="#e5e7eb" stroke-width="1.8" stroke-linecap="round"/>`;
    else s += `<path d="M40 76 Q50 86 60 76" fill="${c.skin}" opacity=".9"/>`;
    return s;
  }

  function avatarSVG(key, mood = 'neutral', cls = '') {
    const c = CHARS[key] || CHARS.me;
    const id = 'av' + (uid++);
    return `<svg class="avatar ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <defs><clipPath id="${id}c"><circle cx="50" cy="50" r="50"/></clipPath>
      <radialGradient id="${id}g" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></radialGradient></defs>
      <g clip-path="url(#${id}c)">
        <circle cx="50" cy="50" r="50" fill="url(#${id}g)"/>
        ${hairBack(c)}${body(c)}
        <rect x="43" y="62" width="14" height="14" rx="5" fill="${c.skin}" opacity=".85"/>
        <circle cx="27" cy="51" r="5" fill="${c.skin}"/><circle cx="73" cy="51" r="5" fill="${c.skin}"/>
        <ellipse cx="50" cy="48" rx="23" ry="25" fill="${c.skin}"/>
        <circle cx="34" cy="58" r="4.2" fill="#f87171" opacity=".33"/><circle cx="66" cy="58" r="4.2" fill="#f87171" opacity=".33"/>
        ${face(c)}${eyes(mood)}${mouth(mood)}${hairFront(c)}${extra(c)}
      </g></svg>`;
  }

  root.P7Avatars = { avatarSVG, CHARS, PLAYER_CHOICES };
})(this);
