/* legende.js — légende générée à partir des seuls symboles réellement utilisés (annotations, notes et masques exclus).
 * Objet pilotable (v13 §5) : masquable, positionnable (glissement), redimensionnable (plan.legende.echelle, bornes
 * charte.legende), cadre et fond réglables comme les blocs d'étiquette. Reprise à l'identique en PDF et PNG.
 */
import { CHARTE, LIBELLES, LIBELLES_DOMAINE, styleTroncon, TYPES_SUPPORT, supportSansCaracteristiques, categorieMalt, LIBELLES_MALT, SOUS_TYPE_ERAS_PAR_DOMAINE } from './charte.js';
import { symboleMaltActif, categorieMaltHote } from './modele.js';
import { rect, texte, poly, transformer, hachurerPolyligne, ligne } from './primitives.js';
import { echantillonSymbole, primitivesFourreau, rectArrondi, primitivesRemplacementDouble } from './symboles.js';
import { etenduePlan } from './vue.js';

/* Échelle bornée de la légende. */
export function echelleLegende(plan) {
  const L = CHARTE.legende;
  const e = plan && plan.legende && plan.legende.echelle;
  return Math.min(L.echelle_max, Math.max(L.echelle_min, e || L.echelle_defaut));
}

/* Hauteur locale (avant échelle) pour n entrées. v1.10.0 : titre vidé à la main → pas de zone de titre. */
function hauteurLocale(n, avecTitre = true) {
  const L = CHARTE.legende;
  return L.marge * 2 + (avecTitre ? L.taille_titre * 1.6 : 0) + n * L.ligne;
}

/* Libellé et clé de regroupement d'un objet ponctuel. */
function cleSymbole(o) {
  const a = o.attributs || {};
  switch (o.type) {
    case 'support': {
      // v1.4.8 : regroupement par matériau / type, classe, renforcement et état ; vignette dessinée avec le renforcement
      const TL = TYPES_SUPPORT.legende;
      const m = (a.materiau === 'BETON' ? (a.classe === 'E' ? TL.BETON_E : TL.BETON_D) : TL[a.materiau]) || 'Support';
      const renf = supportSansCaracteristiques(a.materiau) ? 'AUCUN' : (a.renforcement || 'AUCUN');
      const libRenf = TYPES_SUPPORT.renforcements_legende[renf];
      // contrefiche et hauban tournés vers la droite dans la vignette, comme sur la légende de supports du SIEEP-HC
      const angle = renf === 'CONTREFICHE' || renf === 'HAUBANE' ? 90 : 0;
      return {
        cle: 'support|' + (a.materiau || '') + '|' + (a.materiau === 'BETON' ? a.classe || '' : '') + '|' + renf + '|' + o.etat,
        libelle: m + (libRenf ? ' ' + libRenf : '') + ' ' + LIBELLES.etats[o.etat].toLowerCase(),
        attributs: { materiau: a.materiau, classe: a.classe, renforcement: renf, angle_renforcement: angle }
      };
    }
    case 'coffret': return { cle: 'coffret|' + o.etat, libelle: 'Coffret / borne BT ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { sigle: a.sigle || '' } };
    case 'poste': return { cle: 'poste|' + o.etat, libelle: 'Poste / coupure HTA ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { sigle: a.sigle || '' } };
    case 'boite_jonction': return { cle: 'bj|' + o.domaine + '|' + o.etat, libelle: 'Boîte de jonction ' + (LIBELLES_DOMAINE[o.domaine] || o.domaine) + ' ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {}, domaine: o.domaine, pose: o.pose };
    case 'malt': {
      // v1.5.1 : une entrée par catégorie (existante grise, confection BT bleue, confection HTA rouge)
      const cat = categorieMalt(o.etat === 'existant' || o.etat === 'a_deposer', o.domaine);
      return entreeMalt(cat);
    }
    case 'eras': return { cle: 'eras|' + o.domaine + '|' + (a.avec_malt ? 1 : 0) + '|' + o.etat, libelle: (a.sous_type === 'BRANCHEMENT' ? 'RAS branchement' : a.sous_type === 'EP' ? 'RAS EP' : 'ERAS ' + (LIBELLES_DOMAINE[o.domaine] || o.domaine)) + (a.avec_malt ? ' avec MALT' : '') + ' ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { avec_malt: a.avec_malt, sous_type: a.sous_type }, domaine: o.domaine, pose: o.pose };
    case 'point_lumineux': return { cle: 'pl|' + o.etat, libelle: 'Point lumineux ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {} };
    case 'armoire_ep': return { cle: 'aep|' + o.etat, libelle: 'Armoire de commande EP ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { sigle: a.sigle } };
    case 'lanterne_ep': return { cle: 'lt|' + o.etat, libelle: 'Lanterne EP ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {}, domaine: 'EP' };
    case 'boucle_ep': return { cle: 'bcl|' + o.etat, libelle: 'Boucle de câble EP ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {}, domaine: 'EP' };
    default: return null;
  }
}

/* v1.5.1 — Entrée de légende d'une catégorie de MALT ; l'échantillon est un objet MALT de même couleur. */
function entreeMalt(cat) {
  return { cle: 'malt|' + cat, libelle: LIBELLES_MALT[cat], attributs: {}, etat: cat === 'ex' ? 'existant' : 'a_poser', domaine: cat === 'HTA' ? 'HTA' : 'BTS', pose: 'aerien', typeObjet: 'malt' };
}

function libelleTroncon(o) {
  if (o.domaine === CHARTE.telecom.domaine) return CHARTE.telecom.libelle_legende;   // v1.9.0 : réseau télécom indicatif
  const r = CHARTE.reseaux[o.domaine];
  return (r ? r.libelle : o.domaine) + ' ' + LIBELLES.poses[o.pose].toLowerCase() + ' ' + LIBELLES.etats[o.etat].toLowerCase();
}

/* Entrées de légende { type:'troncon'|'symbole', libelle, … } dédoublonnées. */
export function entreesLegende(objets) {
  const map = new Map();
  for (const o of objets) {
    if (o.type === 'note' || o.type === 'annotation' || o.type === 'masque' || o.type === 'image') continue;   // masques et images : hors légende et hors métré (v12 §8, v1.4.6 §2)
    if (o.illustratif) continue;   // v1.8.0 (H-377) : objets illustratifs d'une page de reportage, hors légende
    if (o.type === 'fourreau') {
      const mat = (o.attributs.matiere || 'TPC').toUpperCase() === 'ACIER' ? 'ACIER' : 'TPC';
      const cle = 'f|' + mat + '|' + o.etat;
      if (!map.has(cle)) map.set(cle, { cle, type: 'fourreau', libelle: 'Fourreau ' + (mat === 'ACIER' ? 'acier' : 'TPC') + ' ' + LIBELLES.etats[o.etat].toLowerCase(), matiere: mat, etat: o.etat, ordre: 0.5 });
      continue;
    }
    if (o.type === 'troncon') {
      const cle = 't|' + o.domaine + '|' + o.pose + '|' + o.etat;
      if (!map.has(cle)) map.set(cle, { cle, type: 'troncon', libelle: libelleTroncon(o), domaine: o.domaine, pose: o.pose, etat: o.etat, ordre: 0 });
    } else {
      const s = cleSymbole(o);
      if (s && !map.has(s.cle)) map.set(s.cle, { type: 'symbole', typeObjet: o.type, etat: o.etat, ordre: 1, ...s });
      // v1.5.1 : symbole MALT porté par l'ouvrage
      if (symboleMaltActif(o)) {
        const m = entreeMalt(categorieMaltHote(o));
        if (!map.has(m.cle)) map.set(m.cle, { type: 'symbole', ordre: 1, ...m });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, 'fr'));
}

/* ---------- v1.10.0 §A2 (H-397 à H-400) : retouches de la légende ---------- */

/* Titre affiché : retouché (vide = aucun titre), sinon « Légende ». */
export function titreLegende(plan) {
  const t = plan && plan.legende ? plan.legende.titre : null;
  return t === null || t === undefined ? CHARTE.legende.titre_defaut : String(t).replace(/\s+/g, ' ').trim();
}

/* Catalogue complet des échantillons de la charte (tous réseaux, poses, états, ouvrages, MALT, FT), mêmes clés et
 * libellés que les entrées automatiques : Map cle → entrée. Construit une fois, à partir d'objets factices passés par
 * entreesLegende (aucune seconde règle de libellé). */
let catalogue = null;
export function catalogueEchantillons() {
  if (catalogue) return catalogue;
  const etats = Object.keys(LIBELLES.etats), poses = Object.keys(LIBELLES.poses);
  const faux = [];
  const f = (o) => faux.push({ attributs: {}, materiel_associe: [], ...o });
  for (const d of ['HTA', 'BTS', 'BRT', 'EP']) for (const p of poses) for (const e of etats) f({ type: 'troncon', domaine: d, pose: p, etat: e });
  f({ type: 'troncon', domaine: CHARTE.telecom.domaine, pose: 'aerien', etat: 'existant' });
  for (const m of ['TPC', 'ACIER']) for (const e of etats) f({ type: 'fourreau', etat: e, attributs: { matiere: m } });
  const materiaux = [['BETON', 'D'], ['BETON', 'E'], ['BOIS', ''], ['ME_TUB', ''], ['ME_PTR', ''], ['CONSOLE', ''], ['ANCRAGE', '']];
  for (const [m, c] of materiaux) for (const r of supportSansCaracteristiques(m) ? ['AUCUN'] : ['AUCUN', ...Object.keys(TYPES_SUPPORT.renforcements_legende)]) for (const e of etats) f({ type: 'support', domaine: 'BTS', pose: 'aerien', etat: e, attributs: { materiau: m, classe: c, renforcement: r } });
  for (const t of ['coffret', 'poste', 'point_lumineux', 'armoire_ep', 'lanterne_ep', 'boucle_ep']) for (const e of etats) f({ type: t, domaine: t === 'poste' ? 'HTA' : 'BTS', pose: 'aerien', etat: e });
  for (const d of ['HTA', 'BTS', 'BRT', 'EP']) for (const e of etats) {
    f({ type: 'boite_jonction', domaine: d, pose: 'souterrain', etat: e });
    for (const m of [false, true]) f({ type: 'eras', domaine: d, pose: 'aerien', etat: e, attributs: { avec_malt: m, sous_type: (SOUS_TYPE_ERAS_PAR_DOMAINE || {})[d] } });
  }
  for (const [e, d] of [['existant', 'BTS'], ['a_poser', 'BTS'], ['a_poser', 'HTA']]) f({ type: 'malt', domaine: d, pose: 'aerien', etat: e });
  catalogue = new Map(entreesLegende(faux).map((x) => [x.cle, x]));
  return catalogue;
}

/* Groupe d'une entrée (éditeur : liste des échantillons). */
export function groupeEchantillon(e) {
  if (!e) return '';
  if (e.type === 'troncon') return e.domaine === CHARTE.telecom.domaine ? 'Réseaux tiers' : 'Tronçons ' + (LIBELLES_DOMAINE[e.domaine] || e.domaine);
  if (e.type === 'fourreau') return 'Fourreaux';
  if (e.typeObjet === 'support') return 'Supports';
  if (e.typeObjet === 'malt') return 'MALT';
  return 'Autres ouvrages';
}

/* Lignes de la légende après retouches, dans l'ordre : entrées automatiques recalculées, surcharges, lignes ajoutées,
 * ordre manuel. Chaque ligne : { id (clé automatique ou id de l'ajout), libelle, libelle_auto?, auto, modifiee, masquee,
 * echantillon (entrée de catalogue ou null) }. Lignes masquées comprises (éditeur) ; le rendu les ignore.
 * Une surcharge dont l'entrée a disparu du plan reste stockée et s'applique de nouveau si le symbole revient. */
export function lignesLegende(plan, objets) {
  const g = (plan && plan.legende) || {};
  const sur = g.surcharges && typeof g.surcharges === 'object' ? g.surcharges : {};
  const base = [];
  for (const e of entreesLegende(objets)) {
    const s = sur[e.cle] || {};
    const libelle = typeof s.libelle === 'string' ? s.libelle : e.libelle;
    base.push({ id: e.cle, auto: true, libelle, libelle_auto: e.libelle, modifiee: typeof s.libelle === 'string' || s.masquee === true, masquee: s.masquee === true, echantillon: e });
  }
  const cat = catalogueEchantillons();
  for (const a of Array.isArray(g.ajouts) ? g.ajouts : []) {
    const ech = a.echantillon ? (cat.get(a.echantillon) || base.find((x) => x.id === a.echantillon)?.echantillon || null) : null;
    base.push({ id: a.id, auto: false, libelle: String(a.libelle ?? ''), modifiee: false, masquee: false, echantillon: ech, cle_echantillon: a.echantillon || null });
  }
  if (!Array.isArray(g.ordre) || !g.ordre.length) return base;
  return appliquerOrdre(base, g.ordre);
}

/* Ordre manuel : lignes citées dans l'ordre donné ; une ligne non citée (nouvelle entrée automatique) se place après sa
 * voisine précédente dans l'ordre automatique, sinon en tête. */
export function appliquerOrdre(base, ordre) {
  const parId = new Map(base.map((x) => [x.id, x]));
  const res = ordre.filter((id) => parId.has(id)).map((id) => parId.get(id));
  const places = new Set(res.map((x) => x.id));
  base.forEach((x, i) => {
    if (places.has(x.id)) return;
    let pos = -1;
    for (let j = i - 1; j >= 0 && pos < 0; j--) pos = res.indexOf(base[j]);
    res.splice(pos + 1, 0, x);
    places.add(x.id);
  });
  return res;
}

/* Lignes imprimées (masquées retirées). */
export function lignesLegendeVisibles(plan, objets) {
  return lignesLegende(plan, objets).filter((l) => !l.masquee);
}

/* Position par défaut : coin bas-droit de l'étendue du plan. */
export function positionLegende(plan, entrees, echelle) {
  const L = CHARTE.legende;
  const l = L.largeur * echelle;
  const h = hauteurLocale(entrees.length, !!titreLegende(plan)) * echelle;
  if (plan.legende.x !== null && plan.legende.y !== null) return { x: plan.legende.x, y: plan.legende.y, l, h };
  const e = etenduePlan(plan);   // étendue DU plan de la légende, pas du plan affiché (v1.4.5, H-230)
  return { x: e.x + e.l - l - L.marge_bord, y: e.y + e.h - h - L.marge_bord, l, h };
}

/* Boîte de la légende (null si elle n'a rien à lister ou si elle est masquée). */
export function boiteLegende(plan, objets) {
  if (!plan || !plan.legende || plan.legende.visible === false) return null;
  const entrees = lignesLegendeVisibles(plan, objets);   // v1.10.0 : retouches appliquées
  if (!entrees.length) return null;
  return positionLegende(plan, entrees, echelleLegende(plan));
}

/* Cadre et fond de la légende, mêmes valeurs que les blocs d'étiquette (v12 §3.2, v13 §5). */
function aspectLegende(plan) {
  const L = CHARTE.legende, T = CHARTE.texte;
  const g = plan.legende || {};
  const cadre = (g.cadre || L.cadre_defaut);
  const fondCle = g.fond || L.fond_defaut;
  return {
    couleur: cadre === 'aucun' ? null : (g.couleur_cadre || L.couleur_cadre_defaut),
    arrondi: cadre === 'arrondi',
    fond: fondCle === 'transparent' ? null : (fondCle === 'translucide' ? T.fond_etiquette : L.fond)
  };
}

/* Échantillon de trait d'un tronçon (réseau, pose, état) entre x1 et x2 à l'ordonnée y. Partagé avec le descriptif
 * (v1.5.0 §2.6) : un tronçon s'y dessine exactement comme dans la légende. */
export function echantillonTroncon(domaine, pose, etatT, x1, x2, y) {
  return traitTroncon(domaine, pose, etatT, [{ x: x1, y }, { x: x2, y }]);
}

/* v1.11.0 (H-415) : même trait le long d'une polyligne quelconque (arêtes orthogonales du synoptique). */
export function traitTroncon(domaine, pose, etatT, pts) {
  // v1.7.0 §3 : aérien / façade à remplacer — les deux traits (à poser au-dessus, à déposer dessous)
  if (etatT === 'a_reprendre' && CHARTE.remplacement_aerien.poses.includes(pose)) return primitivesRemplacementDouble(pts, domaine, pose, 1, 'droite');
  const prims = [];
  const s = styleTroncon(domaine, pose, etatT);
  if (s.fluo) prims.push(poly(pts, { couleur: CHARTE.lisere.couleur, epaisseur: s.epaisseur + CHARTE.lisere.surepaisseur, tirete: s.tirete }));
  prims.push(poly(pts, { couleur: s.couleur, epaisseur: s.epaisseur, tirete: s.tirete }));
  if (s.hachure) prims.push(...hachurerPolyligne(pts, CHARTE.hachures_troncon));
  if (s.reprendre) prims.push(poly(pts, { couleur: CHARTE.a_reprendre_troncon.couleur, epaisseur: CHARTE.a_reprendre_troncon.epaisseur, tirete: CHARTE.a_reprendre_troncon.tirete }));
  return prims;
}

export function primitivesLegende(plan, objets, reglages = {}) {
  if (!plan.legende || plan.legende.visible === false) return [];
  const lignes = lignesLegendeVisibles(plan, objets);   // v1.10.0 §A2 : retouches appliquées
  if (!lignes.length) return [];
  const entrees = lignes;
  const L = CHARTE.legende;
  const echelle = echelleLegende(plan);
  const pos = positionLegende(plan, entrees, echelle);
  const prims = [];
  // Construite en local puis mise à l'échelle et positionnée
  const asp = aspectLegende(plan);
  const opt = { couleur: asp.couleur, epaisseur: asp.couleur ? L.epaisseur_cadre : 0, remplissage: asp.fond };
  const titre = titreLegende(plan);
  const hL = hauteurLocale(entrees.length, !!titre);
  if (asp.couleur || asp.fond) prims.push(asp.arrondi ? rectArrondi(0, 0, L.largeur, hL, L.rayon_cadre, opt) : rect(0, 0, L.largeur, hL, opt));
  if (titre) prims.push(texte(L.marge, L.marge + L.taille_titre, titre, { taille: L.taille_titre, couleur: '#000', ancre: 'debut' }));
  let y = L.marge + (titre ? L.taille_titre * 1.6 : 0) + L.ligne / 2;
  const xEch = L.marge + L.longueur_echantillon / 2, xTexte = L.marge + L.longueur_echantillon + 3;
  for (const ligneL of entrees) {
    const e = ligneL.echantillon;
    if (!e) {   // ligne ajoutée sans échantillon : texte seul, depuis la marge
      if (ligneL.libelle.trim()) prims.push(texte(L.marge, y + L.taille_texte * 0.36, ligneL.libelle, { taille: L.taille_texte, couleur: '#000', ancre: 'debut' }));
      y += L.ligne;
      continue;
    }
    if (e.type === 'troncon') {
      prims.push(...echantillonTroncon(e.domaine, e.pose, e.etat, L.marge, L.marge + L.longueur_echantillon, y));
    } else if (e.type === 'fourreau') {
      const faux = { type: 'fourreau', etat: e.etat, echelle_symbole: 1, troncon_id: null, attributs: { matiere: e.matiere }, points: [{ x: L.marge, y }, { x: L.marge + L.longueur_echantillon, y }] };
      prims.push(...primitivesFourreau(faux));
    } else {
      const ech = echantillonSymbole(e.typeObjet, e.etat, e.attributs, e.domaine || 'BTS', e.pose || 'aerien');
      prims.push(...transformer(ech, { x: xEch, y, rotation: 0, echelle: 0.85 }));
    }
    if (ligneL.libelle.trim()) prims.push(texte(xTexte, y + L.taille_texte * 0.36, ligneL.libelle, { taille: L.taille_texte, couleur: '#000', ancre: 'debut' }));
    y += L.ligne;
  }
  // ligne de séparation sous le titre
  if (titre) prims.push(ligne(L.marge, L.marge + L.taille_titre * 1.35, L.largeur - L.marge, L.marge + L.taille_titre * 1.35, '#000', 0.3));
  void reglages;
  return transformer(prims, { x: pos.x, y: pos.y, rotation: 0, echelle });
}
