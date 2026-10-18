/* v1110.test.mjs — essais v1.11.0 : synoptique (H-411 à H-420), centrage du panneau client (H-421, H-422), schéma 21.
 * Lancer : node js/v1110.test.mjs   (non précaché par le service worker, comme les autres essais)
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
const REF_DESCRIPTIF_V1100 = '07a2b82fbf31165e';

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

/* ==================== Synoptique ==================== */

essai('B.1 chaînage partagé : descriptif de la reconstitution identique à la v1.10.0', () => {
  const { p, pl } = pietra();
  DS.genererDescriptif(pl, p);
  const t = pl.descriptif.sections.map((s) => [s.cle, s.entrees.map((e) => [DS.texteSegments(e.repere), e.lignes.map((l) => DS.texteLigne(l))])]);
  assert.equal(empreinte(t), REF_DESCRIPTIF_V1100);
});

essai('B.2 critère 1 — BT depuis P3 : P3 → S1 → … → S14, portées 55 / 45 m, S7 et S9 jumelés, S11 ME tub, angles φ', () => {
  const { p } = pietra();
  const o = synoptique(p, 'BT');
  const m = o.synoptique.modele;
  assert.ok(m.origines.includes(parRepere(o, 'P3').id) && m.origines.includes(parRepere(o, 'P2').id), 'un arbre par poste');
  assert.equal(parentDe(o, parRepere(o, 'S1')).repere, 'P3');
  assert.match(areteVers(o, parRepere(o, 'S1')).libelle, /240/);
  const portees = [55, 55, 55, 55, 55, 55, 45, 45, 45, 45, 55, 55, 55];
  for (let i = 2; i <= 14; i++) {
    const n = parRepere(o, 'S' + i);
    assert.equal(parentDe(o, n).repere, 'S' + (i - 1), 'S' + i);
    assert.match(areteVers(o, n).libelle, new RegExp(portees[i - 2] + ' m'), 'portée S' + (i - 1) + '–S' + i);
    assert.equal(n.y, parRepere(o, 'S1').y, 'tronc horizontal');
    assert.ok(n.x > parentDe(o, n).x, 'de gauche à droite');
  }
  assert.match(parRepere(o, 'S7').designation.join(' ').replace(/\s/g, ' '), /J 2x10m.*27 gr/);
  assert.match(parRepere(o, 'S9').designation.join(' ').replace(/\s/g, ' '), /J 2x10m.*16 gr/);
  assert.match(parRepere(o, 'S11').designation.join(' ').replace(/\s/g, ' '), /ME tub 10m.*69 gr/);
  assert.match(parRepere(o, 'S1').designation[0], /BE 10m D/);
  assert.match(parRepere(o, 'P3').designation[0], /PSS-A 160 kVA/);
  // rendu : désignations et angles présents
  const t = textes(SY.primitivesSynoptique(o)).join(' ');
  for (const x of ['φ = 27 gr', 'φ = 16 gr', 'φ = 69 gr', 'ME tub 10m', 'Schéma non à l’échelle', 'SYNOPTIQUE — BT']) assert.ok(t.includes(x), x);
  assert.equal(sansCroisement(o), null);
  assert.equal(sansChevauchement(o), null);
});

essai('B.3 critère 1 — BT depuis P2 : départs vers BJ2 et BJ3 puis BT existante', () => {
  const { p } = pietra();
  const o = synoptique(p, 'BT');
  for (const r of ['BJ2', 'BJ3']) {
    const n = parRepere(o, r);
    assert.equal(parentDe(o, n).repere, 'P2', r);
    const suite = o.synoptique.modele.noeuds.find((x) => x.parent === n.id);
    assert.equal(suite.type, 'extremite');
    assert.equal(areteVers(o, suite).etat, 'existant');
  }
  assert.ok(!o.synoptique.modele.noeuds.some((n) => n.repere === 'P1'), 'P1 (HTA, sans BT) absent du synoptique BT');
});

essai('B.4 critère 1 — HTA : P3 – BJ5 – BJ4 – P2 en 3x95 à poser, BJ1 – P2 en 3x150, HTA/S existante, P1 RC à déposer', () => {
  const { p } = pietra();
  const o = synoptique(p, 'HTA');
  const m = o.synoptique.modele;
  const lien = (a, b) => m.aretes.find((x) => { const ra = m.noeuds.find((n) => n.id === x.a).repere, rb = m.noeuds.find((n) => n.id === x.b).repere; return (ra === a && rb === b) || (ra === b && rb === a); });
  for (const [a, b, l] of [['P3', 'BJ5', '120 m'], ['BJ5', 'BJ4', '250 m'], ['BJ4', 'P2', '250 m']]) { const x = lien(a, b); assert.ok(x, a + '–' + b); assert.equal(x.etat, 'a_poser'); assert.match(x.libelle, /3 x 95/); assert.ok(x.libelle.includes(l)); }
  const bj1 = lien('BJ1', 'P2'); assert.match(bj1.libelle, /3 x 150 : 15 m/);
  const exi = m.aretes.find((x) => x.etat === 'existant');
  assert.ok(exi && m.noeuds.find((n) => n.id === exi.a).type === 'extremite');
  // origine par défaut : extrémité de la HTA/S existante (règle B2) ; la chaîne se lit Extrémité → BJ1 → P2 → BJ4 → BJ5 → P3
  const ordre = []; for (let n = parRepere(o, 'P3'); n; n = parentDe(o, n)) ordre.push(n.repere || n.type);
  assert.deepEqual(ordre, ['P3', 'BJ5', 'BJ4', 'P2', 'BJ1', 'extremite']);
  const p1 = parRepere(o, 'P1');
  assert.ok(p1 && p1.etat === 'a_deposer' && !p1.parent && m.origines.includes(p1.id), 'P1 isolé, à déposer');
  assert.match(p1.designation[0], /RC/);
  // « Définir comme origine » sur P3 : la chaîne se lit P3 → BJ5 → BJ4 → P2 → BJ1
  SY.definirOrigine(o, parRepere(o, 'P3').id);
  const o2 = []; for (let n = parRepere(o, 'BJ1'); n; n = parentDe(o, n)) o2.push(n.repere || n.type);
  assert.deepEqual(o2, ['BJ1', 'P2', 'BJ4', 'BJ5', 'P3']);
  assert.equal(parRepere(o, 'P3').y, parRepere(o, 'P2').y, 'tronc P3 → P2 horizontal');
  assert.equal(sansCroisement(o), null);
  assert.equal(sansChevauchement(o), null);
});

essai('B.5 critère 2 — cartouches identiques au plan (forme, contour, texte, couleurs, taille)', () => {
  const { p, S: sup, P3 } = pietra();
  sup[6].cartouche.couleur_contour = '#E30000'; sup[6].cartouche.couleur_texte = '#1D1DE0';
  const o = synoptique(p, 'BT');
  for (const obj of [sup[6], P3]) {
    const plan = S.primitivesCartouche(obj, { taille_texte: 1 }, 5, { x: 0, y: 0 }).prims;
    const n = parRepere(o, obj.repere);
    const syn = SY.primitivesNoeud(n, null, []).filter((x) => (x.t === 'cercle' && plan.some((c) => c.t === 'cercle' && proche(c.r, x.r))) || (x.t === 'texte' && x.texte === obj.repere));
    const sans = (l) => l.map(({ cx, cy, x, y, ...r }) => r);
    assert.deepEqual(sans(syn), sans(plan), obj.repere);
  }
  // export : mêmes primitives (hors état écran)
  assert.deepEqual(SY.primitivesSynoptique(o), S.primitivesObjet(o).corps);
});

essai('B.6 critère 3 — nœud déplacé, libellé retouché, support ajouté, « Mettre à jour » : retouches conservées, nouveau support sans chevauchement', () => {
  const { p, pl, S: sup } = pietra();
  const o = synoptique(p, 'BT');
  const s5 = parRepere(o, 'S5');
  SY.deplacerNoeud(o, s5.id, 12, 30);
  SY.libellerNoeud(o, s5.id, 'BØ 10m (hélicoptère)');
  const a = areteVers(o, parRepere(o, 'S8'));
  SY.libellerArete(o, a.id, '3x70 : 45 m');
  // support ajouté sur le plan (dérivation depuis S9)
  const S15 = M.nouvelObjetPonctuel('support', 640, 300, { domaine: 'BTS', pose: 'aerien', etat: 'a_poser' }, { materiau: 'BOIS', hauteur_m: 10 });
  S15.repere = 'S15'; S15.repere_manuel = true; actualiserDesignation(S15); pl.objets.push(S15);
  const t = M.nouveauTroncon([{ x: sup[8].x, y: sup[8].y }, { x: 640, y: 300 }], { domaine: 'BTS', pose: 'aerien', etat: 'a_poser' }, { section: '3 x 70 + 54,6', longueur_m: 30 });
  actualiserDesignation(t); pl.objets.push(t);
  assert.equal(SY.planModifie(o, p), true);
  const r = SY.genererSynoptique(o, p);
  assert.deepEqual(r.ajoutes, [S15.id]);
  assert.equal(SY.planModifie(o, p), false);
  assert.deepEqual(o.synoptique.retouches.noeuds[s5.id], { dx: 12, dy: 30, libelle: 'BØ 10m (hélicoptère)' });
  assert.equal(o.synoptique.retouches.aretes[a.id].libelle, '3x70 : 45 m');
  assert.equal(parentDe(o, parRepere(o, 'S15')).repere, 'S9');
  const prims = textes(SY.primitivesSynoptique(o));
  assert.ok(prims.includes('BØ 10m (hélicoptère)') && prims.includes('3x70 : 45 m'));
  // sans les décalages manuels : aucun chevauchement, aucun croisement (le nouveau support est placé)
  SY.redisposer(o, { reinitialiser: true });
  assert.equal(sansChevauchement(o), null);
  assert.equal(sansCroisement(o), null);
  assert.equal(o.synoptique.retouches.noeuds[s5.id].libelle, 'BØ 10m (hélicoptère)', 'libellé gardé par la réinitialisation');
  assert.equal(o.synoptique.retouches.noeuds[s5.id].dx, undefined);
  // le contrôle détecte bien un chevauchement (nœud amené sur son voisin)
  const s6 = parRepere(o, 'S6');
  SY.deplacerNoeud(o, s5.id, s6.x - parRepere(o, 'S5').x, 0);
  assert.notEqual(sansChevauchement(o), null);
  SY.redisposer(o, { reinitialiser: true });
  // ouvrage supprimé du plan : nœud et retouches supprimés
  SY.libellerNoeud(o, parRepere(o, 'S15').id, 'provisoire');
  pl.objets = pl.objets.filter((x) => x.id !== S15.id && x.id !== t.id);
  const r2 = SY.genererSynoptique(o, p);
  assert.deepEqual(r2.retires, [S15.id]);
  assert.equal(o.synoptique.retouches.noeuds[S15.id], undefined);
});

essai('B.7 critère 4 — réseau bouclé : renvois affichés aux deux nœuds, aucun croisement', () => {
  const { p, pl, S: sup } = pietra();
  const t = M.nouveauTroncon([{ x: sup[3].x, y: sup[3].y }, { x: sup[11].x, y: sup[11].y }], { domaine: 'BTS', pose: 'aerien', etat: 'existant' }, { section: '3 x 70 + 54,6', longueur_m: 300 });
  actualiserDesignation(t); pl.objets.push(t);
  // dérivations de part et d'autre pour charger le schéma
  for (const [i, dy] of [[2, 80], [5, -80], [5, 90], [9, 70]]) {
    const n = M.nouvelObjetPonctuel('support', sup[i].x + 20, sup[i].y + dy, { domaine: 'BTS', pose: 'aerien', etat: 'a_poser' }, { materiau: 'BOIS', hauteur_m: 10 });
    n.repere = 'D' + i + (dy > 0 ? 'b' : 'h'); n.repere_manuel = true; actualiserDesignation(n); pl.objets.push(n);
    const tr = M.nouveauTroncon([{ x: sup[i].x, y: sup[i].y }, { x: n.x, y: n.y }], { domaine: 'BRT', pose: 'aerien', etat: 'a_poser' }, { section: '2 x 25', longueur_m: 20 });
    actualiserDesignation(tr); pl.objets.push(tr);
  }
  const o = synoptique(p, 'BT');
  const m = o.synoptique.modele;
  const renvoi = m.aretes.find((a) => a.renvoi);
  assert.ok(renvoi && renvoi.id === t.id);
  assert.ok(parRepere(o, 'S4').renvois.includes('↔ S12') && parRepere(o, 'S12').renvois.includes('↔ S4'));
  const tx = textes(SY.primitivesSynoptique(o));
  assert.ok(tx.includes('↔ S12') && tx.includes('↔ S4'));
  assert.equal(sansCroisement(o), null);
  assert.equal(sansChevauchement(o), null);
});

essai('B.8 retouches : nœud et arête masqués (absents à l’export, gris à l’écran) ; pastille écran seulement', () => {
  const { p } = pietra();
  const o = synoptique(p, 'BT');
  const n = parRepere(o, 'S3'), a = areteVers(o, parRepere(o, 'S4'));
  SY.masquerNoeud(o, n.id, true); SY.masquerArete(o, a.id, true);
  const ex = SY.primitivesSynoptique(o);
  assert.ok(!textes(ex).includes('S3'));
  const ec = SY.primitivesSynoptique(o, { ecran: true, modifie: true });
  assert.ok(textes(ec).includes('S3'));
  assert.ok(ec.some((x) => x.couleur === CHARTE.synoptique.couleur_masque_ecran));
  assert.ok(textes(ec).includes('Plan modifié depuis la génération') && !textes(ex).includes('Plan modifié depuis la génération'));
  SY.masquerNoeud(o, n.id, false); SY.masquerArete(o, a.id, false);
  assert.deepEqual(o.synoptique.retouches, { noeuds: {}, aretes: {}, origines: [] });
});

essai('B.9 mini-légende limitée au synoptique ; titre modifiable et masquable ; taille et position conservées à la mise à jour', () => {
  const { p } = pietra();
  const o = synoptique(p, 'HTA');
  const L = SY.lignesMiniLegende({ noeuds: o.synoptique.modele.noeuds, aretes: o.synoptique.modele.aretes }).map((e) => e.libelle);
  assert.ok(L.some((x) => /HTA souterrain à poser/.test(x)) && L.some((x) => /HTA souterrain existant/.test(x)));
  assert.ok(!L.some((x) => /BT|Support/.test(x)), 'rien qui ne soit dans le synoptique HTA');
  o.synoptique.titre = 'SCHÉMA HTA — PIETRA DI VERDE'; SY.redisposer(o);
  assert.ok(textes(SY.primitivesSynoptique(o)).includes('SCHÉMA HTA — PIETRA DI VERDE'));
  o.synoptique.legende_visible = false;
  assert.ok(!textes(SY.primitivesSynoptique(o)).includes('Légende'));
  o.largeur *= 0.5; o.hauteur *= 0.5; o.x = 300; o.y = 200; o.rotation = 90;
  const k = SY.echelleSynoptique(o);
  SY.genererSynoptique(o, p);
  assert.ok(proche(SY.echelleSynoptique(o), k), 'échelle conservée');
  assert.deepEqual([o.x, o.y, o.rotation], [300, 200, 90]);
  // local ↔ plan
  const q = { x: 37, y: 21 };
  const r = SY.versLocal(o, SY.versPlan(o, q));
  assert.ok(proche(r.x, q.x) && proche(r.y, q.y));
});

essai('B.10 objet illustratif : hors descriptif, légende du plan, « à compléter » ; FT exclu ; pages synoptiques et reportage ignorées', async () => {
  const { p, pl, S: sup } = pietra();
  const ft = M.nouveauTronconTelecom([{ x: sup[0].x, y: sup[0].y }, { x: sup[1].x, y: sup[1].y }]); actualiserDesignation(ft); pl.objets.push(ft);
  const o = synoptique(p, 'BT');
  assert.ok(!o.synoptique.modele.aretes.some((a) => a.id === ft.id));
  const page = M.nouveauPlan('Synoptique BT'); page.type = 'synoptique'; page.objets.push(o); p.plans.push(page);
  const avant = SY.signatureTopologie(SY.extraireTopologie(p, 'BT', { avecRang: false }));
  assert.equal(avant, o.synoptique.modele.signature, 'la page synoptique n’entre pas dans le calcul');
  DS.genererDescriptif(page, p);
  assert.equal(DS.toutesEntrees(page.descriptif).length, 0);
  assert.equal(M.motifsACompleter ? M.motifsACompleter(o).length : 0, 0);
  const LG = await import('./legende.js');
  assert.equal(LG.entreesLegende([o]).length, 0);
  // migration v21 : page et objet conservés
  const m = M.migrerProjet(JSON.parse(JSON.stringify(p)));
  assert.equal(m.version_schema, 21);
  assert.equal(m.plans[1].type, 'synoptique');
  assert.deepEqual(m.plans[1].objets[0].synoptique, JSON.parse(JSON.stringify(o.synoptique)));
});

essai('B.11 annuler / rétablir : génération, mise à jour et retouches passent par l’historique de la page', () => {
  const { p, pl } = pietra();
  etat.projet = p; etat.plan = pl;
  H.reinitialiserHistorique();
  const o = synoptique(p, 'BT');
  pl.objets.push(o); H.valider('Synoptique généré');
  const id = parRepere(o, 'S2').id;
  SY.deplacerNoeud(etat.plan.objets.find((x) => x.id === o.id), id, 5, 5); H.valider('Nœud déplacé');
  H.annuler();
  assert.equal(etat.plan.objets.find((x) => x.id === o.id).synoptique.retouches.noeuds[id], undefined);
  H.retablir();
  assert.deepEqual(etat.plan.objets.find((x) => x.id === o.id).synoptique.retouches.noeuds[id], { dx: 5, dy: 5 });
});

/* ==================== B5. Centrage du panneau client ==================== */

essai('B5.1 aimantation mise en commun : résultat identique au calcul de la v1.7.2 (objets inchangés)', () => {
  const ancien = (b, dx, dy, pg, tol) => {
    const cx = pg.x + pg.l / 2, cy = pg.y + pg.h / 2;
    const bx = b.x + b.l / 2 + dx, by = b.y + b.h / 2 + dy;
    const r = { dx, dy, v: null, h: null };
    if (Math.abs(bx - cx) <= tol) { r.dx += cx - bx; r.v = cx; }
    if (Math.abs(by - cy) <= tol) { r.dy += cy - by; r.h = cy; }
    return r;
  };
  let graine = 7;
  const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  for (let i = 0; i < 2000; i++) {
    const b = { x: alea() * 800, y: alea() * 500, l: 1 + alea() * 300, h: 1 + alea() * 200 }, pg = { x: 0, y: 0, l: 1190, h: 842 };
    const dx = (alea() - 0.5) * 900, dy = (alea() - 0.5) * 600, tol = alea() * 30;
    const a = FC.aimanterCentrage(b, dx, dy, pg, tol), o = ancien(b, dx, dy, pg, tol);
    assert.deepEqual([a.dx, a.dy, a.axeVertical, a.axeHorizontal], [o.dx, o.dy, o.v, o.h]);
  }
});

essai('B5.2 critère 5 — panneau à l’échelle 1,5, adresse sur deux lignes, téléphone vide : centré sur la boîte imprimée', () => {
  const p = M.nouveauProjet({ nom: 'Pietra di Verde' }); etat.projet = p; etat.plan = p.plans[0];
  const pl = p.plans[0];
  p.client = M.nettoyerClient({ beneficiaire: 'OFFICE EQUIPEMENT HYDRAULIQUE CORSE (OEHC)', adresse: 'AV FRANCOIS GIACOBBI\n20200 BASTIA', telephone: '' });
  pl.panneau_client = M.panneauClientParDefaut();
  pl.panneau_client.echelle = 1.5;
  const pg = { x: 0, y: 0, l: 1190.55, h: 841.89 };
  const bi = PC.boitePanneauCentrage(pl, p), be = PC.positionPanneauClient(pl, p, { ecran: true });
  assert.ok(be.h > bi.h, 'l’écran ajoute « à renseigner »');
  const r = PC.positionCentree(pl, p, pg, 'les_deux');
  pl.panneau_client.x = r.x; pl.panneau_client.y = r.y;
  const b = PC.boitePanneauClient(pl, p, { ecran: false });
  assert.ok(proche(b.x + b.l / 2, pg.l / 2, 0.01) && proche(b.y + b.h / 2, pg.h / 2, 0.01), 'centre imprimé = centre de la page');
  assert.equal(PC.positionCentree(pl, p, pg, 'les_deux').deja, true);
  // horizontalement : y inchangé ; verticalement : x inchangé
  pl.panneau_client.x = 40; pl.panneau_client.y = 50;
  const h = PC.positionCentree(pl, p, pg, 'horizontal'); assert.equal(h.y, 50); assert.ok(!proche(h.x, 40));
  const v = PC.positionCentree(pl, p, pg, 'vertical'); assert.equal(v.x, 40); assert.ok(!proche(v.y, 50));
  // annuler rétablit la position précédente
  H.reinitialiserHistorique();
  pl.panneau_client.x = h.x; pl.panneau_client.y = h.y; H.valider('Panneau client centré horizontalement');
  H.annuler();
  assert.deepEqual([etat.plan.panneau_client.x, etat.plan.panneau_client.y], [40, 50]);
  // « Imprimer » décoché : centrage sur la boîte écran
  etat.plan.panneau_client.imprimer = false;
  const r2 = PC.positionCentree(etat.plan, p, pg, 'les_deux');
  assert.ok(proche(r2.y + be.h / 2, pg.h / 2, 0.01));
});

let n = 0;
for (const [nom, fn] of essais) {
  try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); console.error(e); process.exitCode = 1; }
}
console.log(n + ' / ' + essais.length + ' essais réussis');
