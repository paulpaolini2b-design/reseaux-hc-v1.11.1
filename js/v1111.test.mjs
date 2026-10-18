/* v1111.test.mjs — essais v1.11.1 : postes à déposer et départs directs du synoptique (H-425 à H-427), cadre réduit
 * quand la mini-légende est masquée (H-428).
 * Lancer : node js/v1111.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node).
 *
 * Jeu d'essai « Pietra di Verde 5053 » : reconstitution d'après le dossier joint (5053_Pietra_di_verde_Oehc_20261016.pdf,
 * plan au 1/2 500 et descriptif) — repères, états, matériaux, angles et portées du descriptif ; coordonnées relevées à vue
 * sur le plan (approximatives, sans incidence : le synoptique n'est pas à l'échelle). Hypothèses de reconstitution :
 * HTA/S existante SANGIU arrivant à BJ1 depuis l'extérieur du plan ; BTS existantes 3x150+70 au-delà de BJ2 et BJ3,
 * extrémités hors plan ; P1 (RC à déposer) sans tronçon HTA relié (aucun au dossier) ; sections saisies selon les
 * notations de la nomenclature (« 3 x 95 », « 3 x 150 + 70 »…). Voir H-419.
 * Référence v1.10.0 : empreinte des textes du descriptif de ce jeu d'essai, calculée avec le code de la v1.10.0. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur, boite, transformer } = await import('./primitives.js');
const { CHARTE, MM } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const SY = await import('./synoptique.js');
const S = await import('./symboles.js');
const FC = await import('./forme-calcul.js');
const PC = await import('./panneau-client.js');
const H = await import('./historique.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const empreinte = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const proche = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function pietra() {
  const p = M.nouveauProjet({ nom: 'Pietra di Verde', commune: 'Pietra di Verde', num_sieep: '5053', num_edf: '26B078' });
  etat.projet = p; etat.plan = p.plans[0]; const pl = p.plans[0];
  const C = (d, po, e) => ({ domaine: d, pose: po, etat: e });
  const pt = (x, y) => ({ x, y });
  const add = (o, rep) => { if (rep) { o.repere = rep; o.repere_manuel = true; } actualiserDesignation(o); pl.objets.push(o); return o; };
  const sup = (rep, x, y, attrs) => add(M.nouvelObjetPonctuel('support', x, y, C('BTS', 'aerien', 'a_poser'), { renforcement: 'AUCUN', ...attrs }), rep);
  const P1 = add(M.nouvelObjetPonctuel('poste', 60, 1100, C('HTA', 'souterrain', 'a_deposer'), { sigle: 'RC' }), 'P1');
  const P2 = add(M.nouvelObjetPonctuel('poste', 75, 1090, C('HTA', 'souterrain', 'a_poser'), { sigle: 'PSS-B', puissance_kva: 250 }), 'P2');
  const P3 = add(M.nouvelObjetPonctuel('poste', 170, 445, C('HTA', 'souterrain', 'a_poser'), { sigle: 'PSS-A', puissance_kva: 160 }), 'P3');
  const BJ = {};
  for (const [r, x, y, d] of [['BJ1', 40, 1080, 'HTA'], ['BJ2', 60, 1120, 'BTS'], ['BJ3', 85, 1110, 'BTS'], ['BJ4', 70, 850, 'HTA'], ['BJ5', 100, 580, 'HTA']]) BJ[r] = add(M.nouvelObjetPonctuel('boite_jonction', x, y, C(d, 'souterrain', 'a_poser'), {}), r);
  const S = [];
  const coords = [[180, 445], [235, 440], [300, 432], [365, 422], [430, 415], [495, 405], [560, 400], [600, 370], [640, 345], [685, 320], [735, 300], [740, 240], [748, 180], [757, 115]];
  const at = { 1: { materiau: 'BETON', classe: 'D', hauteur_m: 10 }, 7: { materiau: 'BOIS', hauteur_m: 10, renforcement: 'JUMELE', angle_gr: 27 }, 9: { materiau: 'BOIS', hauteur_m: 10, renforcement: 'JUMELE', angle_gr: 16 }, 11: { materiau: 'ME_TUB', hauteur_m: 10, angle_gr: 69 }, 14: { materiau: 'BOIS', hauteur_m: 10, renforcement: 'CONTREFICHE' } };
  coords.forEach(([x, y], i) => S.push(sup('S' + (i + 1), x, y, at[i + 1] || { materiau: 'BOIS', hauteur_m: 10 })));
  const tr = (a, b, c, attrs) => add(M.nouveauTroncon([pt(a.x, a.y), pt(b.x, b.y)], c, attrs));
  const portees = [55, 55, 55, 55, 55, 55, 45, 45, 45, 45, 55, 55, 55];
  for (let i = 0; i < 13; i++) tr(S[i], S[i + 1], C('BTS', 'aerien', 'a_poser'), { section: '3 x 70 + 54,6', longueur_m: portees[i] });
  tr(P3, S[0], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 240 + 95', longueur_m: 15 });
  tr(BJ.BJ2, P2, C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150 + 70', longueur_m: 15 });
  tr(BJ.BJ3, P2, C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150 + 70', longueur_m: 15 });
  tr(pt(20, 1180), BJ.BJ2, C('BTS', 'souterrain', 'existant'), { section: '3 x 150 + 70', longueur_m: 80 });
  tr(pt(140, 1160), BJ.BJ3, C('BTS', 'souterrain', 'existant'), { section: '3 x 150 + 70', longueur_m: 90 });
  tr(P3, BJ.BJ5, C('HTA', 'souterrain', 'a_poser'), { section: '3 x 95', longueur_m: 120 });
  tr(BJ.BJ5, BJ.BJ4, C('HTA', 'souterrain', 'a_poser'), { section: '3 x 95', longueur_m: 250 });
  tr(BJ.BJ4, P2, C('HTA', 'souterrain', 'a_poser'), { section: '3 x 95', longueur_m: 250 });
  tr(BJ.BJ1, P2, C('HTA', 'souterrain', 'a_poser'), { section: '3 x 150', longueur_m: 15 });
  tr(pt(-60, 1060), BJ.BJ1, C('HTA', 'souterrain', 'existant'), { section: '3 x 150', longueur_m: 200 });
  for (const o of pl.objets) actualiserDesignation(o);
  return { p, pl, S, P1, P2, P3, BJ };
}

function synoptique(p, reseau) {
  const o = M.nouvelleImage(500, 500, 100, 100, null, 'Synoptique');
  o.illustratif = true;
  o.synoptique = SY.synoptiqueParDefaut(reseau);
  SY.genererSynoptique(o, p);
  return o;
}
const parRepere = (o, r) => o.synoptique.modele.noeuds.find((n) => n.repere === r);
const parentDe = (o, n) => o.synoptique.modele.noeuds.find((x) => x.id === n.parent);
const areteVers = (o, n) => o.synoptique.modele.aretes.find((a) => a.enfant === n.id);
const textes = (prims) => prims.filter((x) => x.t === 'texte').map((x) => x.texte.replace(/\s/g, ' '));

/* Boîtes (locales) de chaque nœud à sa place, et segments des arêtes dessinées. */
function geometrie(o) {
  const m = o.synoptique.modele, R = o.synoptique.retouches;
  const pos = new Map(m.noeuds.map((n) => [n.id, SY.positionNoeud(n, R)]));
  const boites = m.noeuds.map((n) => { const q = pos.get(n.id); return { id: n.id, b: boite(transformer(SY.primitivesNoeud(n, R.noeuds[n.id], n.renvois), { x: q.x, y: q.y, rotation: 0, echelle: 1 })) }; });
  const segments = [];
  for (const a of m.aretes) if (!a.renvoi && a.parent) { const pts = SY.traceAreteModele(a, pos); for (let i = 1; i < pts.length; i++) segments.push({ a: a.id, n: [a.parent, a.enfant], p: pts[i - 1], q: pts[i] }); }
  return { boites, segments, pos };
}
const recouvre = (u, v, marge = 0) => u.x < v.x + v.l - marge && v.x < u.x + u.l - marge && u.y < v.y + v.h - marge && v.y < u.y + u.h - marge;
/* Croisement strict de deux segments orthogonaux (horizontal × vertical), extrémités exclues. */
function croise(s1, s2) {
  const h = (s) => Math.abs(s.p.y - s.q.y) < 1e-9, v = (s) => Math.abs(s.p.x - s.q.x) < 1e-9;
  const [a, b] = h(s1) && v(s2) ? [s1, s2] : (h(s2) && v(s1) ? [s2, s1] : [null, null]);
  if (!a) return false;
  const x0 = Math.min(a.p.x, a.q.x), x1 = Math.max(a.p.x, a.q.x), y0 = Math.min(b.p.y, b.q.y), y1 = Math.max(b.p.y, b.q.y);
  return b.p.x > x0 + 1e-6 && b.p.x < x1 - 1e-6 && a.p.y > y0 + 1e-6 && a.p.y < y1 - 1e-6;
}
function sansCroisement(o) {
  const { segments } = geometrie(o);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) if (croise(segments[i], segments[j])) return [segments[i].a, segments[j].a];
  return null;
}
/* Aucun élément (symbole, cartouche, ligne de texte) d'un nœud ne recouvre un élément d'un autre nœud ; aucune ligne de
 * libellé d'arête ne recouvre un élément de nœud. Boîte d'un texte : largeur mesurée, hauteur = taille. */
function elements(prims) {
  return prims.map((x) => {
    if (x.t === 'texte') { const l = String(x.texte).length * x.taille * 0.55; const x0 = x.ancre === 'milieu' ? x.x - l / 2 : x.ancre === 'fin' ? x.x - l : x.x; return { x: x0, y: x.y - x.taille * 0.8, l, h: x.taille }; }
    return boite([x]);
  }).filter(Boolean);
}
function sansChevauchement(o) {
  const m = o.synoptique.modele, R = o.synoptique.retouches;
  const nom = (id) => (m.noeuds.find((x) => x.id === id) || {}).repere || id;
  const parNoeud = m.noeuds.map((n) => { const q = SY.positionNoeud(n, R); return { id: n.id, el: elements(transformer(SY.primitivesNoeud(n, R.noeuds[n.id], n.renvois), { x: q.x, y: q.y, rotation: 0, echelle: 1 })) }; });
  for (let i = 0; i < parNoeud.length; i++) for (let j = i + 1; j < parNoeud.length; j++)
    for (const u of parNoeud[i].el) for (const v of parNoeud[j].el) if (recouvre(u, v, 0.01)) return [nom(parNoeud[i].id), nom(parNoeud[j].id), JSON.stringify(u), JSON.stringify(v)];
  // libellés d'arêtes contre éléments de nœuds
  const libs = SY.primitivesLocales(o).filter((x) => x.t === 'texte' && x.taille === CHARTE.synoptique.taille_libelle && !/^↔|^φ/.test(x.texte));
  const tousNoeuds = parNoeud.flatMap((x) => x.el.map((e) => ({ id: x.id, e })));
  for (const t of elements(libs)) for (const { id, e } of tousNoeuds) if (recouvre(t, e, 0.01)) return ['libellé', nom(id), JSON.stringify(t), JSON.stringify(e)];
  return null;
}


/* Cas signalé sur le 5053 (projet de l'utilisateur) : les BTS existantes arrivent encore à l'ancien poste P1 (RC à
 * déposer) et sont coupées en BJ2 et BJ3 pour être reprises sur P2 ; P2 a en outre deux départs vers la BTS
 * existante, dont l'un rejoint aussi P1. */
function casP1(pl, { P1, P2, BJ }) {
  const C = { domaine: 'BTS', pose: 'souterrain', etat: 'existant' };
  const tr = (a, b, l) => { const t = M.nouveauTroncon([{ x: a.x, y: a.y }, { x: b.x, y: b.y }], C, { section: '3 x 150 + 70', longueur_m: l }); actualiserDesignation(t); pl.objets.push(t); return t; };
  tr(P1, BJ.BJ2, 10); tr(P1, BJ.BJ3, 12);
  const E1 = { x: 110, y: 1200 }, E2 = { x: 30, y: 1010 };
  tr(P2, E1, 90); tr(P2, E2, 70); tr(P1, E1, 95);
  return { E1, E2 };
}
/* Aucun tronçon dessiné sur un autre : deux segments colinéaires d'arêtes différentes ne se recouvrent jamais. */
function sansSuperposition(o) {
  const { segments } = geometrie(o);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const u = segments[i], v = segments[j];
    if (u.a === v.a) continue;
    const vert = (s) => Math.abs(s.p.x - s.q.x) < 1e-9, hor = (s) => Math.abs(s.p.y - s.q.y) < 1e-9;
    const chev = (a0, a1, b0, b1) => Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)) > 0.01;
    if (vert(u) && vert(v) && Math.abs(u.p.x - v.p.x) < 1e-6 && chev(u.p.y, u.q.y, v.p.y, v.q.y)) return [u.a, v.a];
    if (hor(u) && hor(v) && Math.abs(u.p.y - v.p.y) < 1e-6 && chev(u.p.x, u.q.x, v.p.x, v.q.x)) return [u.a, v.a];
  }
  return null;
}
const nomDe = (o, id) => { const n = o.synoptique.modele.noeuds.find((x) => x.id === id); return n.repere || 'Ext'; };

essai('C.1 BT : P2 a quatre départs distincts (BJ2, BJ3, deux BTS existantes) ; P1 à déposer n’est pas une origine', () => {
  const f = pietra();
  casP1(f.pl, f);
  const o = synoptique(f.p, 'BT');
  const m = o.synoptique.modele;
  const P2 = parRepere(o, 'P2'), P1 = parRepere(o, 'P1');
  const departs = m.noeuds.filter((n) => n.parent === P2.id);
  assert.equal(departs.length, 4);
  assert.deepEqual(departs.map((n) => n.repere || n.type).sort(), ['BJ2', 'BJ3', 'extremite', 'extremite']);
  assert.ok(!m.origines.includes(P1.id), 'P1 n’est pas une origine');
  assert.deepEqual(m.origines.map((id) => nomDe(o, id)).sort(), ['P2', 'P3']);
  // P1 : feuille accrochée à une boîte, à déposer ; ses autres liaisons existantes en renvois
  assert.ok(P1.parent && P1.etat === 'a_deposer');
  assert.ok(!m.noeuds.some((n) => n.parent === P1.id), 'P1 n’est pas développé');
  assert.ok(P1.renvois.length === 2, P1.renvois.join(' '));
  assert.ok(!P2.renvois.length, 'aucun renvoi sur P2');
  // les deux liaisons de 15 m vers BJ2 et BJ3 sont dessinées (libellés présents deux fois)
  const lib = SY.primitivesSynoptique(o).filter((x) => x.t === 'texte').map((x) => x.texte.replace(/\s/g, ' '));
  const n15 = m.aretes.filter((a) => !a.renvoi && /3 x 150 \+ 70 : 15 m/.test(a.libelle)).length;
  assert.equal(n15, 2);
  assert.ok(lib.length > 0);
  assert.equal(sansCroisement(o), null);
  assert.equal(sansChevauchement(o), null);
  assert.equal(sansSuperposition(o), null, 'chaque départ a son propre trait');
});

essai('C.2 poste à déposer seul de sa composante : reste l’origine ; « Définir comme origine » reste possible', () => {
  const f = pietra();
  const o = synoptique(f.p, 'HTA');
  assert.ok(o.synoptique.modele.origines.includes(parRepere(o, 'P1').id), 'P1 isolé : origine');
  const g = pietra();
  casP1(g.pl, g);
  const b = synoptique(g.p, 'BT');
  SY.definirOrigine(b, parRepere(b, 'P1').id);
  assert.ok(b.synoptique.modele.origines.includes(parRepere(b, 'P1').id));
  assert.ok(!b.synoptique.modele.origines.includes(parRepere(b, 'P2').id), 'origine manuelle : remplace celles de la composante');
});

essai('C.3 sans poste à déposer : synoptiques du dossier inchangés (P3 → S1 … S14, P2 → BJ2 / BJ3, HTA)', () => {
  const f = pietra();
  const o = synoptique(f.p, 'BT');
  for (let i = 2; i <= 14; i++) assert.equal(parentDe(o, parRepere(o, 'S' + i)).repere, 'S' + (i - 1));
  for (const r of ['BJ2', 'BJ3']) assert.equal(parentDe(o, parRepere(o, r)).repere, 'P2');
  const h = synoptique(f.p, 'HTA');
  const ordre = []; for (let n = parRepere(h, 'P3'); n; n = parentDe(h, n)) ordre.push(n.repere || n.type);
  assert.deepEqual(ordre, ['P3', 'BJ5', 'BJ4', 'P2', 'BJ1', 'extremite']);
});

essai('C.4 mini-légende masquée : le cadre se réduit, coin haut-gauche fixe ; réaffichée : taille d’origine', () => {
  const f = pietra();
  const o = synoptique(f.p, 'HTA');
  o.rotation = 30; o.x = 400; o.y = 300;
  const avant = { l: o.largeur, h: o.hauteur, coin: SY.versPlan(o, { x: 0, y: 0 }), k: SY.echelleSynoptique(o) };
  o.synoptique.legende_visible = false; SY.redisposer(o);
  assert.ok(o.hauteur < avant.h - 10, 'hauteur réduite : ' + avant.h + ' → ' + o.hauteur);
  assert.ok(o.largeur <= avant.l + 1e-9);
  const c = SY.versPlan(o, { x: 0, y: 0 });
  assert.ok(proche(c.x, avant.coin.x) && proche(c.y, avant.coin.y), 'coin haut-gauche fixe');
  assert.ok(proche(SY.echelleSynoptique(o), avant.k), 'échelle conservée');
  assert.ok(!SY.primitivesSynoptique(o).some((x) => x.t === 'texte' && x.texte === 'Légende'));
  // le bas du cadre suit le dernier nœud (plus de place réservée)
  const m = o.synoptique.modele;
  assert.ok(proche(m.hauteur, m.y_legende - CHARTE.synoptique.ecart_titre + CHARTE.synoptique.marge, 1e-6), 'cadre = contenu + marge');
  o.synoptique.legende_visible = true; SY.redisposer(o);
  assert.ok(proche(o.hauteur, avant.h, 1e-6) && proche(o.largeur, avant.l, 1e-6));
  // mise à jour depuis le plan légende masquée : reste réduit
  o.synoptique.legende_visible = false; SY.redisposer(o);
  const h0 = o.hauteur;
  SY.genererSynoptique(o, f.p);
  assert.ok(proche(o.hauteur, h0, 1e-6));
});

let n = 0;
for (const [nom, fn] of essais) {
  try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); console.error(e); process.exitCode = 1; }
}
console.log(n + ' / ' + essais.length + ' essais réussis');
