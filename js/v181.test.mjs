/* v181.test.mjs — essais v1.8.1 : texte des blocs repris du descriptif (option), angle de piquetage dans l'équipement,
 * repère en cartouche circulaire (H-383 à H-386). Cas de l'essai TDF Polaccie (Saliceto, S1).
 * Lancer : node js/v181.test.mjs   (non précaché par le service worker, comme les autres essais) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const { CHARTE } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const SY = await import('./symboles.js');
const RP = await import('./reportage.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const dims = () => ({ l: 3000, h: 4000 });
const textes = (b) => b.lignes.filter((l) => !l.supprimee).map((l) => l.texte);
const lignesDesc = ['Pose 1 ES', 'Confection 1 Jonct. torsadé/torsadé DPG4 (EJPT 70.54N)', 'Dépose / repose 1 BRT AS 4F ex', 'Dépose / Repose ferrure'];

/* Support S1 « à remplacer » avec angle, matériel associé ; descriptif retouché à la main comme sur l'essai Saliceto. */
function saliceto() {
  const p = M.nouveauProjet({ nom: 'TDF POLACCIE', commune: 'Saliceto' });
  etat.projet = p; etat.plan = p.plans[0];
  const pl = p.plans[0];
  const S1 = M.nouvelObjetPonctuel('support', 100, 100, C('BTS', 'aerien', 'a_reprendre'), { materiau: 'BETON', classe: 'D', hauteur_m: 10, effort_daN: 650, angle_gr: 29 });
  S1.repere = 'S1'; S1.repere_manuel = true;
  S1.remplacement_par = { article_id: null, designation: 'BE 10m D 650', attributs: {} };
  S1.materiel_associe.push({ source: 'LIBRE', libelle: 'BRT AS 4F ex', quantite: 1 }, { source: 'LIBRE', libelle: 'Ferrure FT ex', quantite: 1 });
  S1.photos = [{ id: 'ph1', fond_id: 'f1', date: '2026-10-12T10:00:00Z', au_reportage: true }];
  actualiserDesignation(S1);
  pl.objets.push(S1);
  const P1 = M.nouvelObjetPonctuel('support', 0, 100, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 10, effort_daN: 650 });
  P1.repere = 'P1'; P1.repere_manuel = true;
  P1.cartouche.couleur_contour = '#E30000'; P1.cartouche.couleur_texte = '#171AEB';
  P1.photos = [{ id: 'ph2', fond_id: 'f2', date: '2026-10-12T09:00:00Z', au_reportage: true }];
  actualiserDesignation(P1);
  pl.objets.push(P1);
  DS.genererDescriptif(pl, p);
  const e = pl.descriptif.sections.find((s) => s.cle === 'ouvrages').entrees.find((x) => x.source.objet_ids.includes(S1.id));
  // Lignes du descriptif saisies à la main (après la première ligne générée)
  const tete = e.lignes[0];
  e.lignes = [tete, ...lignesDesc.map((t, i) => DS.nouvelleLigne({ cle_auto: 'man' + i, origine: 'manuelle', segments: [[{ t }]] }))];
  return { p, pl, S1, P1, e };
}
const blocDe = (p, o) => RP.vignettesProjet(p).find((v) => v.reportage.source.objet_id === o.id).reportage.blocs[0];

essai('angle de piquetage en tête de l’équipement, verbe retiré après lui', () => {
  const { p, S1 } = saliceto();
  RP.creerReportage(p, dims);
  const b = blocDe(p, S1);
  assert.equal(b.equipement, 'φ = 29\u00A0gr - BE 10m D 650 à déposer – Pose BE 10m D 650');
  assert.equal(DS.normaliserEquipement('φ = 22\u00A0gr - Pose BE 11m D 650'), 'φ = 22\u00A0gr - BE 11m D 650');
  assert.equal(DS.normaliserEquipement('Pose BØ 11m S 140'), 'BØ 11m S 140');
  assert.equal(DS.normaliserEquipement('Confection 1 ERAS BT'), 'ERAS BT');
  assert.equal(DS.normaliserEquipement('Coffret RM600 existant - Support 12 plages'), 'Coffret RM600 existant - Support 12 plages');
});

essai('par défaut : texte généré depuis l’ouvrage (inchangé), pas le descriptif', () => {
  const { p, S1 } = saliceto();
  RP.creerReportage(p, dims);
  assert.equal(RP.reglages(p).texte_blocs, 'ouvrage');
  const b = blocDe(p, S1);
  assert.ok(!textes(b).includes('Dépose / repose 1 BRT AS 4F ex'));
  assert.ok(textes(b).includes('Pose 1 BRT AS 4F ex') || textes(b).some((t) => /BRT AS 4F/.test(t)));
});

essai('option par bloc « Repris du descriptif » : lignes du descriptif, retouches comprises ; retour à l’ouvrage', () => {
  const { p, S1, P1 } = saliceto();
  RP.creerReportage(p, dims);
  const b = blocDe(p, S1);
  b.lignes.push({ id: 'm1', cle_auto: null, origine: 'manuelle', texte: 'Ligne saisie dans le reportage' });
  b.source_texte = 'descriptif';
  RP.mettreAJourBloc(b, p);
  assert.deepEqual(textes(b), [...lignesDesc, 'Ligne saisie dans le reportage']);
  assert.equal(b.equipement, 'φ = 29\u00A0gr - BE 10m D 650 à déposer – Pose BE 10m D 650');
  assert.ok(!b.alertes.includes('source_modifiee'), 'changer de source n’est pas une modification de l’ouvrage');
  // Les autres blocs suivent le réglage du reportage (ouvrage)
  assert.equal(blocDe(p, P1).mode_empreinte, 'ouvrage');
  b.source_texte = null;
  RP.mettreAJourBloc(b, p);
  assert.ok(!textes(b).includes('Dépose / repose 1 BRT AS 4F ex'));
  assert.ok(textes(b).includes('Ligne saisie dans le reportage'), 'ligne manuelle conservée');
});

essai('réglage du reportage « Repris du descriptif » : tous les blocs ; descriptif absent → texte généré + alerte', () => {
  const { p, pl, S1, P1 } = saliceto();
  RP.creerReportage(p, dims, { texte_blocs: 'descriptif' });
  assert.deepEqual(textes(blocDe(p, S1)), lignesDesc);
  p.reportage.texte_blocs = 'ouvrage';
  RP.mettreAJourBlocs(p);
  assert.ok(!textes(blocDe(p, S1)).includes(lignesDesc[2]));
  p.reportage.texte_blocs = 'descriptif';
  pl.descriptif = null;
  RP.mettreAJourBlocs(p);
  assert.ok(blocDe(p, S1).alertes.includes('descriptif_absent'));
  assert.ok(textes(blocDe(p, S1)).length > 0, 'texte généré en repli');
  assert.ok(RP.libellesAlertes(RP.vignettesProjet(p)[0]).some((t) => /descriptif indisponible/.test(t)) || RP.libellesAlertes(RP.vignettesProjet(p)[1]).some((t) => /descriptif indisponible/.test(t)));
  void P1;
});

essai('repère en cartouche circulaire, aspect du cartouche du plan (texte, contour)', () => {
  const { p, P1, S1 } = saliceto();
  RP.creerReportage(p, dims);
  const v = RP.vignettesProjet(p).find((x) => x.reportage.source.objet_id === P1.id);
  const prims = SY.primitivesObjet(v, p.reglages).corps;
  const t = prims.find((x) => x.t === 'texte' && x.texte === 'P1');
  const c = prims.find((x) => x.t === 'cercle');
  assert.ok(t && c, 'cercle et repère');
  assert.equal(t.gras, true);
  assert.equal(c.couleur, '#E30000');
  assert.equal(t.couleur, '#171AEB');
  assert.ok(Math.abs(c.cx - t.x) < 1e-9, 'repère centré dans le cercle');
  const K = CHARTE.reportage.bloc, CR = CHARTE.descriptif.cartouche_repere;
  const diam = 2 * c.r + c.epaisseur;
  assert.ok(t.taille / diam <= CR.rapport_texte + 1e-9, 'texte au plus dans les proportions du cartouche du plan');
  assert.ok(String(t.texte).length * t.taille * 0.55 < diam - c.epaisseur, 'repère entièrement dans le cercle');
  const vS = RP.vignettesProjet(p).find((x) => x.reportage.source.objet_id === S1.id);
  const cS = SY.primitivesObjet(vS, p.reglages).corps.find((x) => x.t === 'cercle');
  assert.equal(cS.couleur, CR.contour, 'aspect par défaut');
  void K;
});

essai('bloc v1.8.0 (sans mode mémorisé) : premier recalcul sans fausse alerte, retouches conservées', () => {
  const { p, S1 } = saliceto();
  RP.creerReportage(p, dims);
  const b = blocDe(p, S1);
  b.lignes.push({ id: 'm2', cle_auto: null, origine: 'manuelle', texte: 'Retouche' });
  delete b.mode_empreinte; b.empreinte = 'ancienne';
  RP.mettreAJourBlocs(p);
  assert.ok(!b.alertes.includes('source_modifiee'));
  assert.equal(b.mode_empreinte, 'ouvrage');
  assert.ok(textes(b).includes('Retouche'));
  S1.materiel_associe.push({ source: 'LIBRE', libelle: 'Pose 4 CRR', quantite: 1 });
  RP.mettreAJourBlocs(p);
  assert.ok(b.alertes.includes('source_modifiee'), 'alerte de nouveau active ensuite');
});

let ok = 0;
for (const [nom, fn] of essais) {
  try { fn(); ok++; console.log('ok ', nom); }
  catch (e) { console.error('ÉCHEC', nom); console.error(e); process.exitCode = 1; }
}
console.log(ok + ' / ' + essais.length + ' essais réussis');
