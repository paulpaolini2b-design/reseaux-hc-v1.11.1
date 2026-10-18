/* v1100.test.mjs — essais v1.10.0 (partie A) : repère du plan de situation (H-393 à H-396), légende retouchée (H-397 à
 * H-400), pagination du descriptif (H-401 à H-403), panneau d'information client (H-404 à H-408), réseau FT au
 * descriptif (H-409), migration (H-410).
 * Lancer : node js/v1100.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node).
 * Références v1.9.0 : empreintes SHA-256 (16 premiers caractères) du JSON des primitives, calculées avec le code de la
 * v1.9.0 sur les mêmes jeux d'essai, le même mesureur et le même identifiant d'objet. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const { CHARTE, MM } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const R = await import('./descriptif-rendu.js');
const S = await import('./symboles.js');
const SIT = await import('./situation.js');
const RS = await import('./repere-situation.js');
const QR = await import('./qr-situation.js');
const LG = await import('./legende.js');
const PC = await import('./panneau-client.js');
const H = await import('./historique.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const empreinte = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const proche = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const pt = (x, y) => ({ x, y });

/* Références v1.9.0 (voir en-tête). */
const REF_V190 = { r0: '8b072e35c81f1d25', r37: 'f8a44e5ddd1238ae', r90: '4e506c3cc5c9111b', legende: '7bf795e43fff1a66' };

function projet(nom = 'Essai v1.10.0') {
  const p = M.nouveauProjet({ nom, commune: 'Furiani' });
  etat.projet = p; etat.plan = p.plans[0];
  return p;
}

/* Plan de situation tel qu'enregistré par la v1.9.0 (schéma 19, sans repère). */
function situationV190({ rotation = 0, recadrage = null, qr = false, largeurMm = 70 } = {}) {
  const p = projet();
  p.version_schema = 19;
  delete p.client;
  const o = M.nouvelleImage(100, 200, largeurMm * MM, largeurMm * 0.75 * MM, 'fd_x', 'Plan de situation (IGN)');
  o.id = 'img_ref'; o.rotation = rotation; if (recadrage) o.recadrage = recadrage;
  o.situation = { lat: 42.6971, lon: 9.4501, zoom: 15, largeur_px: 1200, diametre_mm: 8, echelle: 5000, titre: 'PLAN DE SITUATION', titre_visible: true, ...(qr ? { qr: { visible: true, coin: 'haut_gauche', cote_mm: 15 } } : {}) };
  p.plans[0].objets.push(o);
  for (const pl of p.plans) { delete pl.panneau_client; for (const k of ['titre', 'surcharges', 'ajouts', 'ordre']) delete pl.legende[k]; }
  return p;
}

/* Distance au sol (m) entre le centre de la carte et le centre du repère, à partir des pixels monde. */
function decalageSol(o) {
  const st = o.situation, rep = RS.lireRepere(o);
  const z = st.zoom, c = SIT.pixelsMonde(st.lat, st.lon, z), q = SIT.pixelsMonde(rep.lat, rep.lon, z);
  const mpp = SIT.metresParPixel(st.lat, z);
  return { est: (q.x - c.x) * mpp, sud: (q.y - c.y) * mpp };
}

/* ==================== A1. Repère du plan de situation ==================== */

essai('A1.1 Web Mercator : pixelsMonde recopié identique, inverse exacte (aller-retour < 1e-9°)', () => {
  for (const [lat, lon, z] of [[42.6971, 9.4501, 15], [41.3876, 9.1594, 18], [43.0, 8.5, 12], [-21.1, 55.5, 16]]) {
    assert.deepEqual(RS.pixelsMonde(lat, lon, z), SIT.pixelsMonde(lat, lon, z));
    const p = SIT.pixelsMonde(lat, lon, z);
    const r = RS.latLonDepuisPixelsMonde(p.x, p.y, z);
    assert.ok(proche(r.lat, lat, 1e-9) && proche(r.lon, lon, 1e-9), lat + ', ' + lon);
  }
});

essai('A1.2 critère 1 — projet v1.9.0 : rond au même endroit, même diamètre ; primitives identiques à la v1.9.0', () => {
  for (const [cle, rot, rec, qr] of [['r0', 0, null, false], ['r37', 37, { g: 0.1, h: 0.05, d: 0.2, b: 0.1 }, true], ['r90', 90, { g: 0, h: 0.2, d: 0, b: 0 }, true]]) {
    const m = M.migrerProjet(JSON.parse(JSON.stringify(situationV190({ rotation: rot, recadrage: rec, qr }))));
    const o = m.plans[0].objets[0];
    assert.deepEqual(o.situation.repere, { forme: 'rond', lat: 42.6971, lon: 9.4501, diametre_mm: 8, largeur_mm: 8, hauteur_mm: 8, rotation_deg: 0 });
    assert.equal(empreinte(S.primitivesObjet(o).corps), REF_V190[cle], cle);
    // idempotente
    const m2 = M.migrerProjet(JSON.parse(JSON.stringify(m)));
    assert.deepEqual(m2.plans[0].objets[0].situation, o.situation);
    assert.equal(m.version_schema, 21);   // v1.11.0 : 21 ; v1.10.0 : 20
  }
});

essai('A1.3 géoréférencement : un point du plan → lat / lon → même point (rotation 37°, carte rognée)', () => {
  const m = M.migrerProjet(JSON.parse(JSON.stringify(situationV190({ rotation: 37, recadrage: { g: 0.1, h: 0, d: 0, b: 0.2 } }))));
  const o = m.plans[0].objets[0];
  for (const q of [pt(100, 200), pt(130, 180), pt(60, 250)]) {
    const ll = RS.latLonDepuisPlan(o, q);
    const r = RS.planDepuisLatLon(o, ll.lat, ll.lon);
    assert.ok(proche(r.x, q.x, 1e-6) && proche(r.y, q.y, 1e-6));
  }
});

essai('A1.4 critère 2 — rectangle tourné de 30°, 1/25 000 → 1/50 000 : même zone au sol, mêmes dimensions papier, même angle', () => {
  const m = M.migrerProjet(JSON.parse(JSON.stringify(situationV190())));
  const o = m.plans[0].objets[0];
  const S0 = CHARTE.situation;
  // carte au 1/25 000 pour une largeur papier de 70 mm (calcul de la fiche)
  const c25 = SIT.cartePourEchelle(o.situation.lat, 25000, 70, 52.5);
  Object.assign(o.situation, { zoom: c25.zoom, largeur_px: c25.largeurPx, echelle: 25000 });
  RS.changerForme(o, 'rectangle');
  RS.reglerRepere(o, 'largeur_mm', '20'); RS.reglerRepere(o, 'hauteur_mm', '12'); RS.reglerRepere(o, 'rotation_deg', '30');
  RS.placerCentre(o, pt(o.x + 25, o.y - 10));
  const avant = { sol: decalageSol(o), rep: RS.lireRepere(o) };
  assert.ok(Math.abs(avant.sol.est) > 50, 'repère déplacé loin du point GPS');
  // retéléchargement au 1/50 000 : même taille papier, nouveau niveau et nouvelle largeur en pixels (fiche → regenererSituation)
  const c50 = SIT.cartePourEchelle(o.situation.lat, 50000, 70, 52.5);
  assert.notEqual(c50.zoom, c25.zoom);
  o.situation = { ...o.situation, zoom: c50.zoom, largeur_px: c50.largeurPx, echelle: 50000 };
  const apres = { sol: decalageSol(o), rep: RS.lireRepere(o) };
  assert.ok(proche(apres.sol.est, avant.sol.est, 1e-6) && proche(apres.sol.sud, avant.sol.sud, 1e-6), 'même zone au sol');
  assert.deepEqual([apres.rep.largeur_mm, apres.rep.hauteur_mm, apres.rep.rotation_deg], [20, 12, 30]);
  // sur la page : le centre se rapproche du point GPS (échelle deux fois plus petite), à 1 % près (arrondi des pixels)
  const g1 = RS.geometrieRepere(o);
  const d50 = Math.hypot(g1.centre.x - o.x, g1.centre.y - o.y);
  assert.ok(proche(d50, Math.hypot(25, 10) / 2, Math.hypot(25, 10) * 0.01), 'distance sur la page divisée par 2 : ' + d50);
  assert.ok(proche(g1.l, 20 * MM) && proche(g1.h, 12 * MM) && proche(g1.rotation, 30));
  // taille de la carte doublée à la poignée : le repère reste sur la même zone (décalage sur la page doublé)
  const avantL = o.largeur; o.largeur *= 2; o.hauteur *= 2;
  const g2 = RS.geometrieRepere(o);
  assert.ok(proche(Math.hypot(g2.centre.x - o.x, g2.centre.y - o.y), 2 * d50, 1e-6));
  o.largeur = avantL;
  void S0;
});

essai('A1.5 rognage : rond entièrement visible = cercle exact ; à cheval = morceaux dans le cadre ; dehors = rien, signalé', () => {
  const m = M.migrerProjet(JSON.parse(JSON.stringify(situationV190())));
  const o = m.plans[0].objets[0];
  let pr = RS.primitivesRepere(o);
  assert.equal(pr.length, 1); assert.equal(pr[0].t, 'cercle');
  assert.equal(RS.placeRepere(o), 'dedans');
  // à cheval sur le bord droit de la carte (largeur 70 mm)
  RS.placerCentre(o, pt(o.x + 35 * MM, o.y));
  pr = RS.primitivesRepere(o);
  assert.equal(RS.placeRepere(o), 'partiel');
  assert.ok(pr.length >= 1 && pr.every((p) => p.t === 'poly' && !p.ferme));
  for (const p of pr) for (const q of p.points) assert.ok(q.x <= o.x + 35 * MM + 1e-6, 'rien au-delà du bord');
  assert.match(RS.alerteRepere(o), /en partie hors de la carte/);
  // hors de la carte
  RS.placerCentre(o, pt(o.x + 80 * MM, o.y));
  assert.equal(RS.placeRepere(o), 'dehors');
  assert.deepEqual(RS.primitivesRepere(o), []);
  assert.match(RS.alerteRepere(o), /Repère hors de la carte/);
  // conservé, recentrable
  assert.ok(RS.lireRepere(o).lon > o.situation.lon);
  RS.recentrerRepere(o);
  assert.ok(RS.repereAuPointGps(o));
});

essai('A1.6 formes : rond → carré de côté = diamètre ; rectangle → rond de diamètre = plus grand côté ; Carré ; R = +90°', () => {
  const o = M.migrerProjet(JSON.parse(JSON.stringify(situationV190()))).plans[0].objets[0];
  RS.changerForme(o, 'rectangle');
  assert.deepEqual([RS.lireRepere(o).largeur_mm, RS.lireRepere(o).hauteur_mm, RS.lireRepere(o).rotation_deg], [8, 8, 0]);
  RS.reglerRepere(o, 'largeur_mm', '25,5');
  RS.reglerRepere(o, 'hauteur_mm', '10');
  assert.equal(RS.tournerRepere(o, 90), true);
  assert.equal(RS.lireRepere(o).rotation_deg, 90);
  assert.equal(RS.rendreCarre(o), true);
  assert.equal(RS.lireRepere(o).hauteur_mm, 25.5);
  RS.reglerRepere(o, 'hauteur_mm', '40');
  RS.changerForme(o, 'rond');
  assert.equal(RS.lireRepere(o).diametre_mm, 40);
  assert.equal(o.situation.diametre_mm, 40, 'ancien champ aligné (versions antérieures)');
  assert.equal(RS.tournerRepere(o, 90), false, 'un rond ne s’oriente pas');
  assert.equal(RS.reglerRepere(o, 'diametre_mm', 'abc'), false);
});

essai('A1.7 poignées : coin opposé fixe pendant le redimensionnement ; rotation relative à la carte ; contour seul sélectionnable', () => {
  const o = M.migrerProjet(JSON.parse(JSON.stringify(situationV190({ rotation: 20 })))).plans[0].objets[0];
  RS.changerForme(o, 'rectangle');
  RS.reglerRepere(o, 'largeur_mm', '20'); RS.reglerRepere(o, 'hauteur_mm', '10'); RS.reglerRepere(o, 'rotation_deg', '15');
  const g = RS.geometrieRepere(o);
  assert.ok(proche(g.rotation, 35), 'angle sur la page = carte + repère');
  const fixe = g.coins[0];
  RS.redimensionnerDepuisCoin(o, fixe, pt(g.coins[2].x + 10, g.coins[2].y + 5));
  const g2 = RS.geometrieRepere(o);
  assert.ok(proche(g2.coins[0].x, fixe.x, 0.5 * MM) && proche(g2.coins[0].y, fixe.y, 0.5 * MM), 'coin hg fixe (pas de 0,5 mm)');
  assert.ok(g2.l > g.l);
  RS.rotationDepuisAngle(o, 125);
  assert.equal(RS.lireRepere(o).rotation_deg, 105);
  // contour : sur le trait oui, au centre (intérieur transparent) non
  const g3 = RS.geometrieRepere(o);
  const milieuCote = pt((g3.coins[0].x + g3.coins[1].x) / 2, (g3.coins[0].y + g3.coins[1].y) / 2);
  assert.equal(RS.surContourRepere(o, milieuCote, 2), true);
  assert.equal(RS.surContourRepere(o, g3.centre, 2), false);
});

essai('A1.8 QR : point encodé inchangé (centre de la carte) ; recouvrement suivi sur le repère déplacé', () => {
  const o = M.migrerProjet(JSON.parse(JSON.stringify(situationV190({ qr: true, largeurMm: 70 })))).plans[0].objets[0];
  const url = QR.urlQrSituation(o);
  assert.equal(QR.alertesQrSituation(o).recouvrement, false);
  const g = QR.geometrieQrSituation(o);
  // repère amené sous le QR (coin haut gauche du cadre visible)
  RS.placerCentre(o, pt(o.x + g.x0 + g.cote / 2, o.y + g.y0 + g.cote / 2));
  assert.equal(QR.alertesQrSituation(o).recouvrement, true);
  assert.equal(QR.urlQrSituation(o), url);
  RS.changerForme(o, 'rectangle');
  RS.reglerRepere(o, 'largeur_mm', '60'); RS.reglerRepere(o, 'hauteur_mm', '45');
  assert.equal(QR.alertesQrSituation(o).recouvrement, false, 'QR entièrement à l’intérieur du rectangle : pas de trait dessus');
});

/* ==================== A2. Légende ==================== */

function planLegende() {
  const p = projet();
  const pl = p.plans[0];
  const S1 = M.nouvelObjetPonctuel('support', 0, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'E', hauteur_m: 11, effort_daN: 650 });
  const P1 = M.nouvelObjetPonctuel('poste', 50, 0, C('HTA', 'aerien', 'existant'), { sigle: 'PSS-A' });
  const T1 = M.nouveauTroncon([pt(0, 0), pt(50, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150 + 70', longueur_m: 20 });
  for (const o of [S1, P1, T1]) { actualiserDesignation(o); pl.objets.push(o); }
  return { p, pl, S1, P1, T1 };
}

essai('A2.1 légende sans retouche : primitives identiques à la v1.9.0 (projet migré)', () => {
  const p = projet('Réf'); p.version_schema = 19;
  const objs = [M.nouvelObjetPonctuel('support', 0, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'E', hauteur_m: 11, effort_daN: 650 }),
    M.nouvelObjetPonctuel('poste', 50, 0, C('HTA', 'aerien', 'existant'), { sigle: 'PSS-A' }),
    M.nouveauTroncon([pt(0, 0), pt(50, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150 + 70', longueur_m: 20 }),
    M.nouveauTronconTelecom([pt(0, 0), pt(50, 0)])];
  for (const o of objs) { actualiserDesignation(o); p.plans[0].objets.push(o); }
  for (const k of ['titre', 'surcharges', 'ajouts', 'ordre']) delete p.plans[0].legende[k];
  const m = M.migrerProjet(JSON.parse(JSON.stringify(p)));
  assert.deepEqual([m.plans[0].legende.titre, m.plans[0].legende.surcharges, m.plans[0].legende.ajouts, m.plans[0].legende.ordre], [null, {}, [], null]);
  assert.equal(empreinte(LG.primitivesLegende(m.plans[0], m.plans[0].objets, m.reglages)), REF_V190.legende);
});

essai('A2.2 critère 3 — libellé, ligne masquée, ligne libre, ordre : conservés après ajout puis suppression d’un ouvrage ; Réinitialiser', () => {
  const { pl, P1 } = planLegende();
  const lignes0 = LG.lignesLegende(pl, pl.objets);
  const cleT = lignes0.find((l) => l.echantillon.type === 'troncon').id;
  const cleP = lignes0.find((l) => l.echantillon.typeObjet === 'poste').id;
  const g = pl.legende;
  g.titre = 'LÉGENDE DES TRAVAUX';
  g.surcharges[cleT] = { libelle: 'Câble BT souterrain 3x150+70 à poser' };
  g.surcharges[cleP] = { masquee: true };
  const cleEch = [...LG.catalogueEchantillons().keys()].find((k) => k.startsWith('t|HTA|souterrain|existant'));
  g.ajouts.push({ id: 'lg_1', libelle: 'Réseau HTA/S existant (hors plan)', echantillon: cleEch });
  g.ordre = ['lg_1', cleT];
  const rendu = (plan) => LG.lignesLegendeVisibles(plan, plan.objets).map((l) => l.libelle);
  const attendu = rendu(pl);
  assert.equal(attendu[0], 'Réseau HTA/S existant (hors plan)');
  assert.equal(attendu[1], 'Câble BT souterrain 3x150+70 à poser');
  assert.ok(!attendu.some((t) => /Poste/.test(t)), 'ligne masquée');
  // suppression du poste puis remise : surcharge conservée, revient
  pl.objets = pl.objets.filter((o) => o.id !== P1.id);
  assert.ok(!LG.lignesLegende(pl, pl.objets).some((l) => l.id === cleP));
  assert.ok(g.surcharges[cleP], 'surcharge conservée');
  pl.objets.push(P1);
  assert.deepEqual(rendu(pl), attendu);
  // nouvel ouvrage : placé après sa voisine automatique, retouches intactes
  const S9 = M.nouvelObjetPonctuel('support', 9, 9, C('BTS', 'aerien', 'existant'), { materiau: 'BOIS', hauteur_m: 10 });
  actualiserDesignation(S9); pl.objets.push(S9);
  const avec = rendu(pl);
  assert.equal(avec.length, attendu.length + 1);
  assert.deepEqual(avec.filter((t) => attendu.includes(t)), attendu);
  pl.objets.pop();
  // primitives : titre retouché, ligne libre dessinée avec son échantillon
  const prims = LG.primitivesLegende(pl, pl.objets);
  assert.ok(prims.some((p) => p.t === 'texte' && p.texte === 'LÉGENDE DES TRAVAUX'));
  assert.ok(prims.some((p) => p.t === 'texte' && p.texte === 'Réseau HTA/S existant (hors plan)'));
  // Réinitialiser : légende automatique
  Object.assign(g, M.retouchesLegendeParDefaut());
  assert.deepEqual(rendu(pl), lignes0.map((l) => l.libelle));
  assert.ok(LG.primitivesLegende(pl, pl.objets).some((p) => p.t === 'texte' && p.texte === 'Légende'));
});

essai('A2.3 catalogue complet ; légende sans titre ; ligne sans échantillon ; migration tolérante', () => {
  const cat = LG.catalogueEchantillons();
  for (const k of ['t|FT|aerien|existant', 'f|ACIER|a_poser', 'malt|HTA', 'malt|ex', 't|EP|souterrain|a_reprendre']) assert.ok(cat.has(k), k);
  assert.ok([...cat.values()].some((e) => e.typeObjet === 'support' && /ME|métallique/i.test(e.libelle)));
  const { pl } = planLegende();
  pl.legende.titre = '';
  pl.legende.ajouts.push({ id: 'lg_x', libelle: 'Note : tracé indicatif', echantillon: null });
  const b1 = LG.boiteLegende(pl, pl.objets);
  const prims = LG.primitivesLegende(pl, pl.objets);
  assert.ok(!prims.some((p) => p.t === 'texte' && p.texte === 'Légende'));
  const t = prims.find((p) => p.t === 'texte' && p.texte === 'Note : tracé indicatif');
  assert.ok(proche(t.x, b1.x + CHARTE.legende.marge * LG.echelleLegende(pl)), 'texte seul depuis la marge');
  const l = { titre: 5, surcharges: { a: { libelle: 'x', masquee: 'oui' }, b: null }, ajouts: [{ libelle: 3 }, null], ordre: ['a', 'a', 7] };
  M.migrerLegendeV20(l);
  assert.equal(l.titre, null);
  assert.deepEqual(l.surcharges, { a: { libelle: 'x' } });
  assert.equal(l.ajouts.length, 1); assert.equal(l.ajouts[0].libelle, '3');
  assert.deepEqual(l.ordre, ['a']);
});

/* ==================== A3. Descriptif : pagination ==================== */

/* Reconstitution STRUCTURELLE de Pietra di Verde 5053 (la pièce PDF n'est pas jointe à cette session) : postes P1 à P3,
 * supports S1 à S14, boîtes BJ1 à BJ5, tronçons BT aériens, HTA/S ; chaque support porte quatre lignes de détail
 * (armement, matériel, MALT, mention) saisies à la main. Valeurs d'essai, non issues du dossier réel. */
function pietra({ lignesParSupport = 4 } = {}) {
  const p = M.nouveauProjet({ nom: 'Pietra di Verde', commune: 'Pietra di Verde', num_sieep: '5053', num_edf: 'Oehc' });
  etat.projet = p; etat.plan = p.plans[0];
  const pl = p.plans[0];
  const ajout = (o, rep) => { Object.assign(o, { repere: rep, repere_manuel: true }); actualiserDesignation(o); pl.objets.push(o); return o; };
  for (let i = 1; i <= 3; i++) ajout(M.nouvelObjetPonctuel('poste', -200 * i, 0, C('HTA', 'aerien', i === 1 ? 'a_deposer' : 'existant'), { sigle: 'PSS-A' }), 'P' + i);
  for (let i = 1; i <= 14; i++) ajout(M.nouvelObjetPonctuel('support', i * 100, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'E', hauteur_m: 11, effort_daN: 650 }), 'S' + i);
  for (let i = 1; i <= 5; i++) ajout(M.nouvelObjetPonctuel('boite_jonction', -100 * i, 100, C('HTA', 'souterrain', 'a_poser'), {}), 'BJ' + i);
  for (let i = 1; i < 14; i++) ajout(M.nouveauTroncon([pt(i * 100, 0), pt((i + 1) * 100, 0)], C('BTS', 'aerien', 'a_poser'), { section: '3 x 70 + 54,6', longueur_m: i % 2 ? 55 : 45 }), '');
  ajout(M.nouveauTroncon([pt(-500, 100), pt(-100, 100)], C('HTA', 'souterrain', 'a_poser'), { section: '3 x 95', longueur_m: 320 }), '');
  for (const o of pl.objets) actualiserDesignation(o);
  DS.genererDescriptif(pl, p);
  const d = pl.descriptif;
  for (const e of DS.toutesEntrees(d)) {
    const o = pl.objets.find((x) => e.source.objet_ids.includes(x.id));
    if (!o || o.type !== 'support') continue;
    for (let k = 1; k <= lignesParSupport; k++) e.lignes.push(DS.nouvelleLigne({ texte: 'Ligne de détail ' + k + ' du support ' + o.repere + ' : armement, matériel associé, MALT et mention d’essai', niveau: 1, puce: '•' }));
  }
  d.sortie_pdf = 'annexe';
  return { p, pl, d };
}
/* Entrées (id) rendues sur chaque colonne d'une page : texte de leurs lignes → identifiant d'entrée par la cible des zones. */
const textesPage = (pg) => pg.filter((x) => x.t === 'texte');
const corpsMin = (pages) => Math.min(...pages.flatMap((pg) => textesPage(pg)).filter((x) => !/^\d+\/\d+$/.test(x.texte)).map((x) => x.taille));

essai('A3.1 critère 4 — Pietra di Verde reconstitué, Auto : jamais sous le corps nominal, A3 ou A4 multipages, aucune entrée coupée', () => {
  const { pl, p, d } = pietra();
  assert.equal(R.reglageFormatAnnexe(d), 'auto');
  const c = R.choixAnnexe(pl, p);
  assert.ok(c.echelle >= 1 - 1e-9, 'échelle ' + c.echelle);
  const { pages, largeur, hauteur } = R.pagesAnnexeChoisies(pl, p);
  assert.ok(corpsMin(pages) >= CHARTE.descriptif.corps.taille - 1e-9, 'corps au moins nominal');
  assert.deepEqual([largeur, hauteur], [c.largeur, c.hauteur]);
  assert.match(c.texte, /^Auto → (A4 portrait|A3 paysage), \d+ pages?$/);
  // en A4 1 page au corps nominal, ça ne tient pas (sinon le jeu d'essai ne teste rien)
  const a4 = R.echelleAnnexe(pl, p, ...CHARTE.descriptif.annexe.formats.a4.format_pt);
  assert.equal(a4.une_page, false);
  // aucune mention « (suite) » : chaque entrée tient dans une colonne
  assert.ok(!pages.some((pg) => textesPage(pg).some((x) => x.texte === '(suite)')));
  // chaque support : cartouche et ses quatre lignes de détail sur la même page
  for (let i = 1; i <= 14; i++) {
    const cart = pages.map((pg, k) => (textesPage(pg).some((x) => x.texte === 'S' + i) ? k : -1)).filter((k) => k >= 0);
    const det = pages.map((pg, k) => (textesPage(pg).some((x, j, t) => x.texte === 'S' + i && t[j - 1] && t[j - 1].texte === 'support') ? k : -1)).filter((k) => k >= 0);
    assert.equal(cart.length, 1, 'S' + i + ' rendu une fois');
    assert.ok(det.length >= 1, 'détail de S' + i + ' trouvé');
    for (const k of det) assert.equal(k, cart[0], 'détail de S' + i + ' sur la page de son cartouche');
  }
});

essai('A3.2 Auto : A4 1 page s’il tient (agrandi jusqu’au corps maximal), sinon A3 1 page, sinon A4 plusieurs pages', () => {
  const petit = pietra({ lignesParSupport: 0 });
  petit.pl.descriptif.sections.forEach((s) => { s.entrees = s.entrees.slice(0, 3); });
  let c = R.choixAnnexe(petit.pl, petit.p);
  assert.deepEqual([c.format, c.nbPages], ['a4', 1]);
  assert.ok(c.echelle >= 1);
  const moyen = pietra({ lignesParSupport: 2 });
  c = R.choixAnnexe(moyen.pl, moyen.p);
  if (c.format === 'a3') assert.equal(c.nbPages, 1, 'A3 retenu seulement s’il tient sur une page');
  const grand = pietra({ lignesParSupport: 14 });
  c = R.choixAnnexe(grand.pl, grand.p);
  assert.deepEqual([c.format, c.une_page], ['a4', false]);
  assert.equal(c.echelle, 1);
  assert.equal(R.pagesAnnexeChoisies(grand.pl, grand.p).pages.length, c.nbPages);
});

essai('A3.3 A3 paysage : 2 colonnes de 180 mm, gouttière 30 mm, même corps qu’en A4', () => {
  const { pl, p, d } = pietra({ lignesParSupport: 6 });
  d.format_annexe = 'a3';
  const c = R.choixAnnexe(pl, p);
  assert.deepEqual([c.format, c.colonnes, c.gouttiere_mm], ['a3', 2, 30]);
  const [W, HP] = CHARTE.descriptif.annexe.formats.a3.format_pt;
  const Z = R.zoneUtileAnnexe(W, HP);
  assert.ok(proche(Z.l / MM, 390, 0.01), 'largeur utile 420 − 2 × 15');
  const { pages } = R.pagesAnnexeChoisies(pl, p);
  // mots des entrées (l'en-tête de l'affaire, centré sur toute la largeur utile, est exclu)
  const xs = textesPage(pages[0]).filter((x) => x.ancre !== 'milieu' && /^(Ligne|Pose|S\d+)$/.test(x.texte)).map((x) => x.x);
  const droite = Z.x + (180 + 30) * MM;
  assert.ok(xs.some((x) => x >= droite - 1e-6), 'deuxième colonne à 15 + 180 + 30 mm');
  assert.ok(!xs.some((x) => x > Z.x + 180 * MM && x < droite - 1e-6), 'gouttière vide');
  d.format_annexe = 'a4';
  assert.equal(R.choixAnnexe(pl, p).colonnes, 1);
});

essai('A3.4 entrée plus haute qu’une colonne : coupée entre deux lignes, cartouche répété avec « (suite) »', () => {
  const { pl, p, d } = pietra({ lignesParSupport: 0 });
  const e = DS.toutesEntrees(d).find((x) => DS.texteSegments(x.repere).replace(/\.$/, '') === 'S3');
  for (let k = 1; k <= 120; k++) e.lignes.push(DS.nouvelleLigne({ texte: 'Ligne longue ' + k }));
  d.format_annexe = 'a4';
  const { pages } = R.pagesAnnexeChoisies(pl, p);
  const suites = pages.flatMap((pg) => textesPage(pg)).filter((x) => x.texte === '(suite)');
  assert.ok(suites.length >= 1);
  assert.ok(suites.every((x) => x.italique));
  // le cartouche « S3 » est rendu en tête de chaque morceau
  const nS3 = pages.flatMap((pg) => textesPage(pg)).filter((x) => x.texte === 'S3').length;
  assert.equal(nS3, suites.length + 1);
  const Z = R.zoneUtileAnnexe(...CHARTE.descriptif.annexe.formats.a4.format_pt);
  for (const pg of pages) for (const x of textesPage(pg)) if (!/^\d+\/\d+$/.test(x.texte)) assert.ok(x.y <= Z.y + Z.h + 1e-6, 'rien sous la zone utile');
  // chaque ligne présente une fois et une seule (aucune perdue ni dupliquée à la coupure)
  const nums = pages.flatMap((pg) => textesPage(pg)).map((x, i, t) => (x.texte === 'longue' && t[i + 1] ? t[i + 1].texte : null)).filter(Boolean);
  assert.deepEqual(nums.map(Number).sort((a, b) => a - b), Array.from({ length: 120 }, (_, i) => i + 1));
});

essai('A3.5 saut de page manuel prioritaire ; ignoré sur le plan ; repris par la mise à jour', () => {
  const { pl, p, d } = pietra({ lignesParSupport: 0 });
  d.format_annexe = 'a4';
  const avant = R.choixAnnexe(pl, p);
  assert.equal(avant.nbPages, 1);
  const e = DS.toutesEntrees(d).find((x) => DS.texteSegments(x.repere).replace(/\.$/, '') === 'S5');
  e.saut_page = true;
  const apres = R.choixAnnexe(pl, p);
  assert.equal(apres.nbPages, 2);
  const { pages } = R.pagesAnnexeChoisies(pl, p);
  assert.ok(textesPage(pages[1]).some((x) => x.texte === 'S5'));
  assert.ok(!textesPage(pages[0]).some((x) => x.texte === 'S5'));
  DS.mettreAJourDescriptif(pl, p);
  assert.equal(DS.toutesEntrees(d).find((x) => x.id === e.id).saut_page, true);
  const blocAvant = R.miseEnPage(d).colonnes.length;
  assert.equal(blocAvant, 1, 'bloc du plan : pas de saut de page');
});

essai('A3.6 mode « Échelle du bloc » : A4 portrait, réglage de format sans effet', () => {
  const { pl, p, d } = pietra();
  d.echelle_annexe = 'bloc'; d.format_annexe = 'a3';
  const c = R.choixAnnexe(pl, p);
  assert.deepEqual([c.format, c.reglage], ['a4', 'bloc']);
});

/* ==================== A4. Panneau client ==================== */

essai('A4.1 téléphone mis en forme ; client normalisé ; recherche du gestionnaire (bénéficiaire)', () => {
  assert.equal(M.formaterTelephone('0495123456'), '04 95 12 34 56');
  assert.equal(M.formaterTelephone('04.95.12.34.56'), '04 95 12 34 56');
  assert.equal(M.formaterTelephone('+33 4 95 12 34 56'), '+33 4 95 12 34 56');
  assert.deepEqual(M.nettoyerClient({ beneficiaire: '  SCI  Pietra ', adresse: ' Lieu-dit  Sant’Antone \r\n 20218 Pietra ', telephone: '0612345678' }),
    { beneficiaire: 'SCI Pietra', adresse: 'Lieu-dit Sant’Antone\n20218 Pietra', telephone: '06 12 34 56 78' });
  assert.deepEqual(M.nouveauProjet({}).client, { beneficiaire: '', adresse: '', telephone: '' });
});

essai('A4.2 critère 5 — panneau rempli exporté ; « Imprimer » décoché : absent de l’export, présent à l’écran', () => {
  const p = projet();
  const pl = p.plans[0];
  p.client = M.nettoyerClient({ beneficiaire: 'Martin Paul', adresse: 'Route de la plage\n20290 Borgo', telephone: '0495123456' });
  pl.panneau_client = M.panneauClientParDefaut();
  const ex = PC.primitivesPanneauClient(pl, p, { ecran: false });
  const t = ex.filter((x) => x.t === 'texte').map((x) => x.texte);
  for (const m of ['INFORMATIONS', 'CLIENT', 'Bénéficiaire', ':', 'Martin', 'Borgo', '04', '56']) assert.ok(t.includes(m), m);
  assert.ok(ex.some((x) => x.t === 'texte' && x.texte === 'Bénéficiaire' && x.gras));
  const b = PC.boitePanneauClient(pl, p, { ecran: false });
  assert.ok(proche(b.l, 80 * MM, 1e-6), 'largeur 80 mm à l’échelle 1');
  // l'adresse se poursuit sous son libellé (deuxième ligne à la marge gauche)
  const x20290 = ex.find((x) => x.t === 'texte' && x.texte === '20290');
  assert.ok(proche(x20290.x, b.x + CHARTE.panneau_client.marge, 1e-6));
  pl.panneau_client.imprimer = false;
  assert.deepEqual(PC.primitivesPanneauClient(pl, p, { ecran: false }), []);
  assert.equal(PC.boitePanneauClient(pl, p, { ecran: false }), null);
  assert.ok(PC.primitivesPanneauClient(pl, p, { ecran: true }).length > 0);
});

essai('A4.3 champ vide : ligne absente de l’export, « à renseigner » gris à l’écran ; titre modifiable ; échelle', () => {
  const p = projet();
  const pl = p.plans[0];
  p.client = M.nettoyerClient({ beneficiaire: 'Commune de Furiani', adresse: '', telephone: '' });
  pl.panneau_client = M.panneauClientParDefaut();
  const ex = PC.primitivesPanneauClient(pl, p, { ecran: false }).filter((x) => x.t === 'texte').map((x) => x.texte);
  assert.ok(!ex.includes('Adresse') && !ex.includes('Téléphone'));
  const ec = PC.primitivesPanneauClient(pl, p, { ecran: true }).filter((x) => x.t === 'texte');
  const vides = ec.filter((x) => x.couleur === CHARTE.panneau_client.couleur_vide);
  assert.ok(vides.length >= 2 && vides.every((x) => x.italique));
  pl.panneau_client.titre = 'COORDONNÉES DU DEMANDEUR';
  assert.ok(PC.primitivesPanneauClient(pl, p).some((x) => x.texte === 'COORDONNÉES'));
  const h1 = PC.boitePanneauClient(pl, p).h;
  pl.panneau_client.echelle = 2;
  assert.ok(proche(PC.boitePanneauClient(pl, p).h, 2 * h1, 1e-6));
  assert.deepEqual(PC.champsVides(p.client), ['adresse', 'telephone']);
});

essai('A4.4 hors descriptif, légende et contrôle « à compléter » ; historique des réglages ; migration', () => {
  const p = projet();
  const pl = p.plans[0];
  pl.panneau_client = M.panneauClientParDefaut();
  DS.genererDescriptif(pl, p);
  assert.ok(!JSON.stringify(pl.descriptif).includes('INFORMATIONS CLIENT'));
  assert.equal(LG.lignesLegende(pl, pl.objets).length, 0);
  assert.ok(!pl.objets.length, 'pas dans plan.objets (ni métré, ni reportage, ni « à compléter »)');
  H.reinitialiserHistorique();
  pl.panneau_client.imprimer = false;
  H.valider('Panneau client non imprimé');
  H.annuler();
  assert.equal(etat.plan.panneau_client.imprimer, true);
  H.retablir();
  assert.equal(etat.plan.panneau_client.imprimer, false);
  const brut = JSON.parse(JSON.stringify(p));
  brut.plans[0].panneau_client = { echelle: 99, cadre: 'zz', largeur_mm: 5 };
  delete brut.client;
  const m = M.migrerProjet(brut);
  assert.equal(m.plans[0].panneau_client.echelle, CHARTE.panneau_client.echelle_max);
  assert.equal(m.plans[0].panneau_client.cadre, 'rectangle');
  assert.equal(m.plans[0].panneau_client.largeur_mm, CHARTE.panneau_client.largeur_min_mm);
  assert.deepEqual(m.client, { beneficiaire: '', adresse: '', telephone: '' });
});

/* ==================== A5. Réseau FT au descriptif ==================== */

function appuiCommunFt(reperes, { suite = true } = {}) {
  const p = projet('FT');
  const pl = p.plans[0];
  const sup = reperes.map((r, i) => {
    const o = M.nouvelObjetPonctuel('support', 100 + i * 100, 300, C('BTS', 'aerien', 'existant'), { materiau: 'BOIS', hauteur_m: 10 });
    Object.assign(o, { repere: r, repere_manuel: true }); actualiserDesignation(o); pl.objets.push(o);
    return o;
  });
  for (let i = 0; i + 1 < sup.length; i++) {
    const t = M.nouveauTroncon([pt(sup[i].x, sup[i].y), pt(sup[i + 1].x, sup[i + 1].y)], C('BTS', 'aerien', 'existant'), { section: '3x70+54,6', longueur_m: 40 });
    actualiserDesignation(t); pl.objets.push(t);
  }
  const ft = M.nouveauTronconTelecom((suite ? sup : sup).map((s) => pt(s.x, s.y)));
  actualiserDesignation(ft); pl.objets.push(ft);
  for (const o of pl.objets) M.mettreAJourComplet(o, pl.objets);
  return { p, pl, ft, sup };
}
const entreesTiers = (pl) => (pl.descriptif.sections.find((s) => s.cle === 'tiers') || { entrees: [] }).entrees;

essai('A5.1 critère 6 — FT accroché à S3 … S7 : « en appui commun sur S3 à S7 », section « Réseaux tiers », échantillon FT', () => {
  const { p, pl, ft } = appuiCommunFt(['S3', 'S4', 'S5', 'S6', 'S7']);
  DS.genererDescriptif(pl, p);
  const secs = pl.descriptif.sections.map((s) => s.cle);
  assert.ok(secs.indexOf('tiers') === secs.indexOf('troncons') + 1, 'après les tronçons électriques');
  const [e] = entreesTiers(pl);
  assert.equal(DS.texteLigne(e.lignes[0]), 'Réseau télécom FT existant en appui commun sur S3 à S7');
  assert.equal(e.lignes.length, 1, 'ni linéaire ni fourniture');
  assert.deepEqual(e.source, { type: 'telecom', objet_ids: [ft.id], cle_groupe: null });
  assert.deepEqual(e.style_echantillon, { domaine: 'FT', pose: 'aerien', etat: 'existant' });
  assert.equal(e.echantillon, true);
  assert.deepEqual(e.alertes, []);
  // rien ailleurs : ouvrages, tronçons, fourniture
  const ailleurs = JSON.stringify(pl.descriptif.sections.filter((s) => s.cle !== 'tiers'));
  assert.ok(!/FT|télécom/i.test(ailleurs.replace(/"fourniture"/g, '')));
  assert.ok(!DS.toutesEntrees(pl.descriptif).some((x) => x.source.type === 'groupe_troncons' && x.source.objet_ids.includes(ft.id)));
  assert.deepEqual(DS.alertesDescriptif(pl), []);
});

essai('A5.2 repères énumérés, tracé inversé, FT seul, entrée exclue / supprimée / retouchée, section retirée sans FT', () => {
  assert.equal(DS.condenserReperes(['S3', 'S5', 'S9']), 'S3, S5, S9');
  assert.equal(DS.condenserReperes(['S7', 'S6', 'S5']), 'S7 à S5');
  assert.equal(DS.condenserReperes(['S3', 'P4', 'S5']), 'S3, P4, S5');
  assert.equal(DS.condenserReperes(['S3']), 'S3');
  let x = appuiCommunFt(['S3', 'S5', 'S9']);
  DS.genererDescriptif(x.pl, x.p);
  assert.equal(DS.texteLigne(entreesTiers(x.pl)[0].lignes[0]), 'Réseau télécom FT existant en appui commun sur S3, S5, S9');
  // FT sans support
  x = appuiCommunFt(['S1', 'S2']);
  x.ft.points = [pt(1000, 1000), pt(1200, 1000)];
  DS.genererDescriptif(x.pl, x.p);
  const e = entreesTiers(x.pl)[0];
  assert.equal(DS.texteLigne(e.lignes[0]), 'Réseau télécom FT existant (indicatif)');
  // retouche manuelle conservée à la mise à jour
  DS.modifierLigne(e.lignes[0], { segments: [[{ t: 'Réseau FT existant à déplacer par l’opérateur' }]] });
  e.lignes[0].origine = 'manuelle';
  DS.mettreAJourDescriptif(x.pl, x.p);
  assert.equal(DS.texteLigne(entreesTiers(x.pl)[0].lignes[0]), 'Réseau FT existant à déplacer par l’opérateur');
  // « inclure » décoché : absent du rendu
  entreesTiers(x.pl)[0].inclure = false; entreesTiers(x.pl)[0].inclure_manuel = true;
  DS.mettreAJourDescriptif(x.pl, x.p);
  assert.ok(!R.miseEnPage(x.pl.descriptif).prims.some((q) => q.t === 'texte' && /opérateur/.test(q.texte)));
  // supprimée : jamais recréée
  DS.supprimerEntree(x.pl.descriptif, entreesTiers(x.pl)[0].id);
  DS.mettreAJourDescriptif(x.pl, x.p);
  assert.ok(!x.pl.descriptif.sections.some((s) => s.cle === 'tiers'), 'section vide retirée');
  assert.equal(DS.libelleExclu(x.pl, x.ft.id), 'Réseau télécom FT existant (indicatif)');
  // FT supprimé du plan : entrée automatique retirée, section aussi
  x = appuiCommunFt(['S1', 'S2']);
  DS.genererDescriptif(x.pl, x.p);
  x.pl.objets = x.pl.objets.filter((o) => o.id !== x.ft.id);
  DS.mettreAJourDescriptif(x.pl, x.p);
  assert.ok(!x.pl.descriptif.sections.some((s) => s.cle === 'tiers'));
});

let n = 0;
for (const [nom, fn] of essais) {
  try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); console.error(e); process.exitCode = 1; }
}
console.log(n + ' / ' + essais.length + ' essais réussis');
