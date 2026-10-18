/* v190.test.mjs — essais v1.9.0 : réseau aérien de télécommunication indicatif (tronçons FT, H-387 à H-392).
 * Lancer : node js/v190.test.mjs   (non précaché par le service worker, comme les autres essais) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const CH = await import('./charte.js');
const { CHARTE, MM, styleTroncon, estTelecom, texteTelecom } = CH;
const M = await import('./modele.js');
const { actualiserDesignation, designationAuto } = await import('./designation.js');
const DS = await import('./descriptif.js');
const SY = await import('./symboles.js');
const LG = await import('./legende.js');
const AC = await import('./accrochage.js');
const PC = await import('./piquetage-calcul.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const K = CHARTE.telecom;
const textesFt = (prims) => prims.filter((p) => p.t === 'texte');

function projetVide() {
  const p = M.nouveauProjet({ nom: 'Essai FT', commune: 'Furiani' });
  etat.projet = p; etat.plan = p.plans[0];
  return p;
}

/* Deux supports BT aériens existants, une portée BT et une portée FT en appui commun (tracés confondus). */
function appuiCommun({ avecFt = true } = {}) {
  const p = projetVide();
  const pl = p.plans[0];
  const S1 = M.nouvelObjetPonctuel('support', 100, 300, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 10, effort_daN: 650 });
  const S2 = M.nouvelObjetPonctuel('support', 400, 300, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 10, effort_daN: 650 });
  for (const s of [S1, S2]) { M.attribuerRepere(p, s); actualiserDesignation(s); pl.objets.push(s); }
  const bt = M.nouveauTroncon([{ x: 100, y: 300 }, { x: 400, y: 300 }], C('BTS', 'aerien', 'existant'), { section: '3x70+54,6', longueur_m: 106 });
  M.attribuerRepere(p, bt); actualiserDesignation(bt); pl.objets.push(bt);
  let ft = null;
  if (avecFt) { ft = M.nouveauTronconTelecom([{ x: 100, y: 300 }, { x: 400, y: 300 }]); M.attribuerRepere(p, ft); actualiserDesignation(ft); pl.objets.push(ft); }
  for (const o of pl.objets) M.mettreAJourComplet(o, pl.objets);
  return { p, pl, S1, S2, bt, ft };
}

essai('style : vert foncé, motif « trait + 3 points » en toute pose, sans liseré ; distinct de la BT souterraine existante', () => {
  const s = styleTroncon('FT', 'aerien', 'existant');
  assert.equal(s.couleur, CHARTE.reseaux.FT.couleur.existant);
  assert.deepEqual(s.tirete, CHARTE.reseaux.FT.tirete_toutes_poses);
  assert.equal(s.tirete.length, 8, 'un trait puis trois points');
  assert.equal(s.fluo, false, 'pas de liseré sombre');
  const bt = styleTroncon('BTS', 'souterrain', 'existant');
  assert.notEqual(s.couleur.toUpperCase(), bt.couleur.toUpperCase());
  assert.notDeepEqual(s.tirete, bt.tirete);
  assert.ok(!CHARTE.COULEURS_ANNOTATION.includes(s.couleur.toUpperCase()), 'teinte absente de la palette des couleurs manuelles');
  // Réseaux électriques inchangés : aérien sans tireté, souterrain avec
  assert.equal(styleTroncon('BTS', 'aerien', 'existant').tirete, null);
  assert.deepEqual(styleTroncon('HTA', 'souterrain', 'a_poser').tirete, CHARTE.reseaux.HTA.tirete_souterrain);
});

essai('nouveau tronçon FT : existant aérien, sans repère, étiquette et cartouche masqués, complet, hors contrôles', () => {
  const p = projetVide();
  const compteurs = JSON.stringify(p.compteurs);
  const ft = M.nouveauTronconTelecom([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  M.attribuerRepere(p, ft);
  assert.ok(estTelecom(ft));
  assert.equal(ft.etat, 'existant'); assert.equal(ft.pose, 'aerien'); assert.equal(ft.calque, 'existant');
  assert.equal(ft.repere, ''); assert.equal(JSON.stringify(p.compteurs), compteurs, 'numérotation des tronçons intacte');
  assert.equal(ft.etiquette.visible, false); assert.equal(ft.cartouche.visible, false);
  assert.equal(M.estComplet(ft, [ft]), true);
  assert.deepEqual(M.motifsACompleter(ft, [ft]), []);
  assert.equal(M.porteurPhotos(ft), false);
  assert.equal(designationAuto(ft), '');
  assert.equal(texteTelecom(ft), 'FT exi');
});

essai('texte « FT exi » : un par tranche de 60 mm, au moins un, lisible, côté au choix, masquable', () => {
  projetVide();
  const L = 300 * MM;   // 300 mm de tracé
  const ft = M.nouveauTronconTelecom([{ x: L, y: 0 }, { x: 0, y: 0 }]);   // tracé de droite à gauche
  let t = textesFt(SY.primitivesTroncon(ft, { taille_texte: 1 }));
  assert.equal(t.length, Math.floor(300 / K.pas_mm));
  assert.ok(t.every((x) => x.texte === 'FT exi'));
  assert.ok(t.every((x) => x.rotation === 0), 'jamais lu à l’envers');
  assert.ok(t.every((x) => x.y < 0), 'au-dessus du tracé par défaut');
  assert.ok(t.every((x) => x.couleur === CHARTE.reseaux.FT.couleur.existant));
  ft.attributs.cote_texte = 'dessous';
  t = textesFt(SY.primitivesTroncon(ft, { taille_texte: 1 }));
  assert.ok(t.every((x) => x.y > 0), 'au-dessous du tracé');
  // Fond translucide : jamais sur le trait (bord du fond au-delà de la demi-épaisseur)
  const fonds = SY.primitivesTroncon(ft, { taille_texte: 1 }).filter((x) => x.t === 'poly' && x.ferme && x.remplissage);
  assert.ok(fonds.length && fonds.every((f) => Math.min(...f.points.map((q) => Math.abs(q.y))) > CHARTE.reseaux.FT.epaisseur / 2));
  const court = M.nouveauTronconTelecom([{ x: 0, y: 0 }, { x: 20 * MM, y: 0 }]);
  assert.equal(textesFt(SY.primitivesTroncon(court)).length, 1, 'tracé court : un texte au milieu');
  court.attributs.texte_ft = 'FT exi appui commun';
  assert.equal(textesFt(SY.primitivesTroncon(court))[0].texte, 'FT exi appui commun');
  court.attributs.texte_visible = false;
  assert.equal(textesFt(SY.primitivesTroncon(court)).length, 0);
  // Un tronçon électrique n'a jamais ce texte
  const bt = M.nouveauTroncon([{ x: 0, y: 0 }, { x: L, y: 0 }], C('BTS', 'aerien', 'existant'));
  assert.equal(textesFt(SY.primitivesTroncon(bt)).length, 0);
});

essai('texte par portée : au moins un par segment, jamais sur un sommet', () => {
  projetVide();
  const pts = [{ x: 0, y: 300 }, { x: 300, y: 150 }, { x: 600, y: 300 }];   // deux portées d'environ 118 mm
  const t = textesFt(SY.primitivesTroncon(M.nouveauTronconTelecom(pts), { taille_texte: 1 }));
  assert.ok(t.filter((x) => x.x < 300).length >= 1 && t.filter((x) => x.x > 300).length >= 1, 'un texte sur chaque portée');
  assert.ok(t.every((x) => Math.hypot(x.x - 300, x.y - 150) > 20 * MM), 'aucun texte au droit du sommet');
});

essai('texte vertical ou oblique : rotation lisible (−90° à 90°)', () => {
  projetVide();
  for (const [a, b] of [[{ x: 0, y: 0 }, { x: 0, y: 200 }], [{ x: 0, y: 200 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: -150, y: 150 }]]) {
    const t = textesFt(SY.primitivesTroncon(M.nouveauTronconTelecom([a, b])));
    assert.ok(t.length >= 1);
    for (const x of t) assert.ok(x.rotation <= 90 || x.rotation >= 270, 'rotation ' + x.rotation);
  }
});

essai('légende : entrée « Télécom FT existant (indicatif) », échantillon au motif du réseau', () => {
  const { pl } = appuiCommun();
  const e = LG.entreesLegende(pl.objets).find((x) => x.domaine === 'FT');
  assert.ok(e);
  assert.equal(e.libelle, K.libelle_legende);
  const ech = LG.echantillonTroncon('FT', 'aerien', 'existant', 0, 38, 0);
  assert.ok(ech.some((p) => p.t === 'poly' && JSON.stringify(p.tirete) === JSON.stringify(CHARTE.reseaux.FT.tirete_toutes_poses)));
});

essai('descriptif : sections électriques identiques avec ou sans le réseau FT en appui commun', () => {
  // v1.10.0 (H-409) : le FT entre au descriptif en entrée indicative, section « Réseaux tiers » seulement ; ouvrages,
  // tronçons, chaînage et fourniture inchangés
  const electrique = (pl) => JSON.stringify(pl.descriptif.sections.filter((s) => s.cle !== 'tiers').map((s) => s.entrees.map((e) => e.lignes.map((l) => DS.texteLigne(l)))));
  const a = appuiCommun({ avecFt: false });
  DS.genererDescriptif(a.pl, a.p);
  const sans = electrique(a.pl);
  const b = appuiCommun({ avecFt: true });
  DS.genererDescriptif(b.pl, b.p);
  const avec = electrique(b.pl);
  assert.ok(/3x70\+54,6/.test(sans), 'la portée BT est bien au descriptif');
  assert.equal(avec, sans);
  assert.ok(!/FT exi|Télécom/.test(avec));
  assert.ok(!a.pl.descriptif.sections.some((s) => s.cle === 'tiers'), 'pas de section « Réseaux tiers » sans FT');
});

essai('piquetage : une portée FT n’est jamais une portée du support', () => {
  const { S1, bt, ft } = appuiCommun();
  assert.equal(PC.tronconPortee(bt, S1), true);
  assert.equal(PC.tronconPortee(ft, S1), false);
});

essai('sélection : sur l’axe commun, le tronçon électrique ; sur le texte « FT exi », le tronçon FT', () => {
  const { bt, ft } = appuiCommun();
  const surAxe = AC.chercherObjet({ x: 250, y: 300 }, 4);
  assert.equal(surAxe.objet.id, bt.id);
  const texte = textesFt(SY.primitivesTroncon(ft, etat.projet.reglages))[0];
  const surTexte = AC.chercherObjet({ x: texte.x, y: texte.y - texte.taille * 0.4 }, 4);
  assert.equal(surTexte.objet.id, ft.id);
  assert.equal(surTexte.partie, 'texte_ft');
  // Le fourreau (filtre sans FT) ne voit que le tronçon électrique
  const h = AC.chercherObjet({ x: texte.x, y: texte.y - texte.taille * 0.4 }, 40, { types: ['troncon'], filtre: (o) => !estTelecom(o) });
  assert.equal(h.objet.id, bt.id);
});

essai('migration 18 → 19 : filtre « Télécom FT » affiché, aspect inchangé, idempotente ; FT ramené à existant aérien', () => {
  const { p } = appuiCommun({ avecFt: false });
  const ancien = JSON.parse(JSON.stringify(p));
  ancien.version_schema = 18;
  delete ancien.filtre_domaines.FT;
  const empreinte = (pr) => JSON.stringify(pr.plans[0].objets.map((o) => SY.primitivesObjet(o, pr.reglages).corps));
  const avant = empreinte(ancien);
  const m = M.migrerProjet(ancien);
  assert.equal(m.version_schema, 21);   // v1.11.0 : 21 ; v1.10.0 : 20   // v1.10.0 : schéma 20
  assert.equal(m.filtre_domaines.FT, true);
  assert.equal(empreinte(m), avant);
  const deux = JSON.stringify(M.migrerProjet(JSON.parse(JSON.stringify(m))));
  assert.equal(deux, JSON.stringify(m));
  // Un tronçon FT altéré (import manuel) redevient existant aérien
  const ft = M.nouveauTronconTelecom([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  ft.etat = 'a_poser'; ft.pose = 'souterrain'; delete ft.attributs.cote_texte;
  m.plans[0].objets.push(ft);
  M.migrerProjet(m);
  assert.equal(ft.etat, 'existant'); assert.equal(ft.pose, 'aerien'); assert.equal(ft.attributs.cote_texte, 'dessus');
});

let ok = 0;
for (const [nom, fn] of essais) {
  try { await fn(); ok++; console.log('ok  ' + nom); }
  catch (e) { console.log('ÉCHEC  ' + nom); console.log(e); }
}
console.log(ok + ' / ' + essais.length + ' essais réussis');
if (ok !== essais.length) process.exit(1);
