/* synoptique.js — v1.11.0 §B1 à B4 (H-411 à H-420) : synoptique (schéma électrique) automatique, non à l'échelle.
 *
 * L'objet est un objet `image` sans fond (`fond_id: null`) portant `synoptique` — même comportement que le plan de
 * situation : déplacement, poignée d'échelle, rotation (poignée, R), Centrer sur la page, Annuler. Il est illustratif :
 * hors descriptif, métré, légende du plan, contrôle « à compléter » et reportage.
 *
 * `o.synoptique = { reseau: 'HTA' | 'BT' | 'EP', titre, titre_visible, legende_visible, cadre, couleur_cadre, fond,
 *                   modele, retouches }`
 * - `modele` : instantané de la topologie à la génération ou à la dernière mise à jour (jamais recalculé en direct),
 *   positions calculées (unités locales, origine en haut à gauche), taille naturelle, signature du plan.
 * - `retouches` : { noeuds: { id: { dx, dy, libelle, masque } }, aretes: { id: { libelle, masque } }, origines: [id] },
 *   rattachées à l'identifiant de l'objet du plan, conservées à la mise à jour.
 * Rendu : primitives locales (titre, mention « Schéma non à l'échelle », arêtes orthogonales, nœuds, mini-légende,
 * cadre) mises à l'échelle `largeur / modele.largeur`, tournées et centrées sur (x, y) de l'objet.
 * Module pur (aucun DOM) : essais sous Node (v1110.test.mjs).
 */
import { CHARTE, LIBELLES } from './charte.js';
import { grapheReseau, comparerNaturel } from './descriptif.js';
import { designationAffichee, formaterAngle, etiquetteTroncon, cloner } from './modele.js';
import { echantillonSymbole, primitivesCartouche, rectArrondi, definirRenduSynoptique } from './symboles.js';
import { traitTroncon, entreesLegende, echantillonTroncon } from './legende.js';
import { texte, rect, cercle, poly, transformer, boite, mesurerTexte } from './primitives.js';

const K = () => CHARTE.synoptique;
const reseauDe = (r) => K().reseaux[r] || K().reseaux.BT;

/* ---------- Modèle ---------- */

export function retouchesParDefaut() { return { noeuds: {}, aretes: {}, origines: [] }; }

export function synoptiqueParDefaut(reseau) {
  const k = K();
  return { reseau: k.reseaux[reseau] ? reseau : 'BT', titre: null, titre_visible: true, legende_visible: true, cadre: k.cadre_defaut, couleur_cadre: k.couleur_cadre_defaut, fond: k.fond_defaut, modele: null, retouches: retouchesParDefaut() };
}

/* Lecture tolérante (migration, objets incomplets). Idempotente. */
export function normaliserSynoptique(o) {
  const s = o && o.synoptique;
  if (!s || typeof s !== 'object') return false;
  const d = synoptiqueParDefaut(s.reseau);
  for (const [k, v] of Object.entries(d)) if (s[k] === undefined) s[k] = v;
  if (!K().reseaux[s.reseau]) s.reseau = 'BT';
  const r = s.retouches && typeof s.retouches === 'object' ? s.retouches : {};
  s.retouches = { noeuds: r.noeuds && typeof r.noeuds === 'object' ? r.noeuds : {}, aretes: r.aretes && typeof r.aretes === 'object' ? r.aretes : {}, origines: Array.isArray(r.origines) ? r.origines.filter((x) => typeof x === 'string') : [] };
  o.illustratif = true;
  o.fond_id = null;
  return true;
}

export function titreSynoptique(s) {
  if (s.titre !== null && s.titre !== undefined) return String(s.titre);
  return K().titre_defaut.replace('{reseau}', reseauDe(s.reseau).libelle);
}

/* ---------- Topologie (B2) ---------- */

const libelleSansRetour = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/* Topologie du réseau depuis toutes les pages de type plan : nœuds et arêtes décrits sans référence aux objets
 * (instantané stockable). */
export function extraireTopologie(projet, reseau, { avecRang = true } = {}) {
  const R = reseauDe(reseau);
  const g = grapheReseau(projet, { domaines: R.domaines, typesNoeuds: K().types_noeuds, domainesIsoles: R.domaines, avecRang });
  const noeuds = g.noeuds.map((n) => {
    const o = n.objet;
    if (!o) return { id: n.id, objet_id: null, type: 'extremite', etat: 'existant', domaine: null, pose: null, attributs: {}, repere: '', cartouche: null, designation: [K().extremite], rang: Infinity };
    const des = [libelleSansRetour(designationAffichee(o))].filter(Boolean);
    if (o.type === 'support') { const a = formaterAngle(o.attributs && o.attributs.angle_gr); if (a) des.push(a); }
    const c = o.cartouche || {};
    return {
      id: n.id, objet_id: o.id, type: o.type, etat: o.etat, domaine: o.domaine, pose: o.pose, attributs: cloner(o.attributs || {}),
      repere: String(o.repere || '').trim(),
      cartouche: { visible: c.visible !== false, couleur_contour: c.couleur_contour || null, couleur_texte: c.couleur_texte || null, fond: c.fond || null },
      designation: des, rang: g.rang.has(o.id) ? g.rang.get(o.id) : Infinity
    };
  });
  const aretes = g.aretes.map((a) => ({
    id: a.id, a: a.a, b: a.b, domaine: a.troncon.domaine, pose: a.troncon.pose, etat: a.troncon.etat,
    libelle: libelleSansRetour(etiquetteTroncon(a.troncon, { taille_texte: 1 })), rang: g.rang.has(a.id) ? g.rang.get(a.id) : Infinity
  }));
  return { noeuds, aretes };
}

/* Signature de la topologie (pastille « plan modifié depuis la génération ») : FNV-1a 32 bits du JSON utile. */
export function signatureTopologie(topo) {
  const t = JSON.stringify({ n: topo.noeuds.map((n) => [n.id, n.type, n.etat, n.repere, n.designation, n.attributs]), a: topo.aretes.map((a) => [a.id, a.a, a.b, a.etat, a.pose, a.libelle]) });
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/* Poste, armoire ou coffret à déposer (v1.11.1, H-425 à H-427). */
const aDeposer = (n) => !!n && n.type !== 'extremite' && ['poste', 'armoire_ep'].includes(n.type) && n.etat === 'a_deposer';

/* Ordre naturel : rang du descriptif, puis repère, puis identifiant. */
function comparerNoeuds(a, b) {
  return (a.rang - b.rang) || comparerNaturel(a.repere || '\uffff', b.repere || '\uffff') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/* Forêt couvrante : composantes connexes, origines, parcours en largeur depuis toutes les origines de la composante.
 * Retourne { arbres: [{ origine, noeuds: [id] }], parent: Map(id → id), areteParent: Map(id → id d'arête),
 * enfants: Map(id → [id]), renvois: [id d'arête] }. */
export function foretCouvrante(topo, reseau, origines = []) {
  const parId = new Map(topo.noeuds.map((n) => [n.id, n]));
  const adj = new Map(topo.noeuds.map((n) => [n.id, []]));
  for (const a of topo.aretes) { if (!adj.has(a.a) || !adj.has(a.b)) continue; adj.get(a.a).push(a); adj.get(a.b).push(a); }
  for (const [id, l] of adj) l.sort((x, y) => comparerNoeuds(parId.get(x.a === id ? x.b : x.a), parId.get(y.a === id ? y.b : y.a)) || (x.rang - y.rang));
  const vus = new Set(), composantes = [];
  for (const n of [...topo.noeuds].sort(comparerNoeuds)) {
    if (vus.has(n.id)) continue;
    const comp = []; const pile = [n.id]; vus.add(n.id);
    while (pile.length) { const id = pile.pop(); comp.push(id); for (const a of adj.get(id)) { const v = a.a === id ? a.b : a.a; if (!vus.has(v)) { vus.add(v); pile.push(v); } } }
    composantes.push(comp);
  }
  const R = reseauDe(reseau);
  const parent = new Map(), areteParent = new Map(), enfants = new Map(topo.noeuds.map((n) => [n.id, []])), arbres = [];
  const dansArbre = new Set();
  for (const comp of composantes) {
    const ens = new Set(comp);
    const noeudsC = comp.map((id) => parId.get(id)).sort(comparerNoeuds);
    let orig = origines.filter((id) => ens.has(id));
    // v1.11.1 (H-425) : un poste (ou une armoire) à déposer n'est une origine automatique que s'il est le seul de la
    // composante ; « Définir comme origine » reste possible
    const candidats = (t) => { const l = noeudsC.filter((n) => n.type === t); const vifs = l.filter((n) => !aDeposer(n)); return (vifs.length ? vifs : l).map((n) => n.id); };
    if (!orig.length && reseau !== 'HTA') {
      for (const t of R.origines) { orig = candidats(t); if (orig.length) break; }
    }
    if (!orig.length) {
      // extrémité d'un tronçon existant sans ouvrage, sinon premier poste (non à déposer de préférence), sinon premier nœud
      const ext = noeudsC.find((n) => n.type === 'extremite' && adj.get(n.id).some((a) => a.etat === 'existant'));
      const postes = candidats('poste');
      orig = [ext ? ext.id : (postes[0] || noeudsC[0].id)];
    }
    orig = [...new Set(orig)].sort((x, y) => comparerNoeuds(parId.get(x), parId.get(y)));
    // 1. territoires : chaque nœud revient à l'origine la plus proche (parcours en largeur depuis toutes les origines)
    //    v1.11.1 (H-426) : un poste à déposer est atteint mais ne transmet pas son territoire (il ne « vole » pas les
    //    ouvrages du poste qui le remplace) ; ce qui n'est joignable qu'à travers lui est rattaché ensuite
    const territoire = new Map(orig.map((id) => [id, id]));
    const etendre = (depart, franchir) => {
      const file = [...depart];
      while (file.length) {
        const id = file.shift();
        if (!franchir && !orig.includes(id) && aDeposer(parId.get(id))) continue;
        for (const a of adj.get(id)) { const v = a.a === id ? a.b : a.a; if (!territoire.has(v)) { territoire.set(v, territoire.get(id)); file.push(v); } }
      }
    };
    etendre(orig, false);
    etendre([...territoire.keys()].filter((id) => aDeposer(parId.get(id)) && !orig.includes(id)), true);
    // 2. arbre de chaque territoire : parcours en profondeur dans l'ordre naturel (garde les suites de portées en un
    //    seul tronc : sur une boucle, c'est la portée qui referme la boucle qui devient un renvoi)
    for (const r of orig) {
      const arbre = { origine: r, noeuds: [r] };
      arbres.push(arbre);
      const vus = new Set([r]);
      const attacher = (v, id, a) => { vus.add(v); parent.set(v, id); areteParent.set(v, a.id); enfants.get(id).push(v); dansArbre.add(a.id); arbre.noeuds.push(v); };
      // parcours en profondeur depuis `depart` ; `franchir` : un poste à déposer est développé (sinon il reste une feuille)
      const profondeurDepuis = (depart, franchir) => {
        const pile = [[depart, 0]];
        while (pile.length) {
          const top = pile[pile.length - 1];
          const [id] = top;
          if (!franchir && id !== r && aDeposer(parId.get(id))) { pile.pop(); continue; }
          const l = adj.get(id);
          let suivant = null;
          while (top[1] < l.length) {
            const a = l[top[1]++];
            const v = a.a === id ? a.b : a.a;
            if (vus.has(v) || territoire.get(v) !== r) continue;
            suivant = [v, a]; break;
          }
          if (!suivant) { pile.pop(); continue; }
          attacher(suivant[0], id, suivant[1]);
          pile.push([suivant[0], 0]);
        }
      };
      // v1.11.1 (H-427) : tous les départs directs de l'origine sont des départs (avant le reste du parcours)
      const directs = [];
      for (const a of adj.get(r)) { const v = a.a === r ? a.b : a.a; if (!vus.has(v) && territoire.get(v) === r) { attacher(v, r, a); directs.push(v); } }
      for (const v of directs) profondeurDepuis(v, false);
      // puis ce qui n'est joignable qu'à travers un poste à déposer
      for (const id of [...arbre.noeuds]) if (id !== r && aDeposer(parId.get(id))) profondeurDepuis(id, true);
    }
  }
  const renvois = topo.aretes.filter((a) => !dansArbre.has(a.id) && adj.has(a.a) && adj.has(a.b)).map((a) => a.id);
  return { arbres, parent, areteParent, enfants, renvois };
}

/* ---------- Primitives d'un nœud (locales, nœud en 0,0) ---------- */

function symboleNoeud(n) {
  if (n.type === 'extremite') return [cercle(0, 0, 1.8, { couleur: '#000000', epaisseur: 0.6, remplissage: '#FFFFFF' })];
  return echantillonSymbole(n.type, n.etat, n.attributs || {}, n.domaine || 'BTS', n.pose || 'aerien');
}

/* Lignes de texte sous le nœud : désignation (ou libellé retouché), angle, renvois. */
function lignesNoeud(n, ret, renvoisTxt) {
  const l = n.designation.slice();
  if (ret && typeof ret.libelle === 'string') { if (l.length) l[0] = ret.libelle; else l.push(ret.libelle); }
  return { lignes: l.filter((x) => x !== ''), renvois: renvoisTxt || [] };
}

/* Primitives d'un nœud centré en (0, 0) : symbole, cartouche au-dessus (à gauche de l'axe vertical, pour laisser passer
 * une dérivation), désignation dessous (à droite de l'axe). */
export function primitivesNoeud(n, ret, renvoisTxt, { fantome = false } = {}) {
  const T = CHARTE.texte;
  const sym = symboleNoeud(n);
  const b = boite(sym) || { x: -2, y: -2, l: 4, h: 4 };
  const rx = Math.max(-b.x, b.x + b.l), ry = Math.max(-b.y, b.y + b.h);
  const prims = [...sym];
  if (n.repere && n.cartouche && n.cartouche.visible !== false) {
    const KC = CHARTE.cartouche;
    const r = Math.max(KC.rayon_min, mesurerTexte(n.repere, KC.taille_texte) / 2 + KC.marge);
    // primitivesCartouche place le centre en (rayon + r + dx, −rayon − r + dy) : cartouche au-dessus, à gauche de l'axe
    const faux = { type: n.type, repere: n.repere, echelle_plan_origine: null, echelle_symbole: 1, cartouche: { visible: true, dx: -(rx + ry + 2 * r + K().ecart / 2), dy: -1, couleur_contour: n.cartouche.couleur_contour, couleur_texte: n.cartouche.couleur_texte, fond: n.cartouche.fond } };
    prims.push(...primitivesCartouche(faux, { taille_texte: 1 }, ry, { x: 0, y: 0 }).prims);
  }
  const { lignes, renvois } = lignesNoeud(n, ret, renvoisTxt);
  let y = ry + 1.5;
  const x0 = K().ecart / 2;
  lignes.forEach((t, i) => { const taille = i === 0 ? T.taille_etiquette : T.taille_etiquette_secondaire; y += taille; prims.push(texte(x0, y, t, { taille, couleur: '#000000', ancre: 'debut' })); y += taille * (K().interligne - 1); });
  for (const t of renvois) { const taille = T.taille_etiquette_secondaire; y += taille; prims.push(texte(x0, y, t, { taille, couleur: '#000000', ancre: 'debut', italique: true })); y += taille * (K().interligne - 1); }
  if (fantome) return prims.map((p) => ({ ...p, couleur: p.couleur ? K().couleur_masque_ecran : p.couleur, remplissage: p.remplissage && p.remplissage !== '#FFFFFF' ? K().couleur_masque_ecran : p.remplissage }));
  return prims;
}

/* Étendues d'un nœud autour de son centre : { gauche, droite, haut, bas, rx } (distances positives). */
function etendues(n, ret, renvoisTxt) {
  const sym = boite(symboleNoeud(n)) || { x: -2, y: -2, l: 4, h: 4 };
  const b = boite(primitivesNoeud(n, ret, renvoisTxt)) || sym;
  const rx = Math.max(-sym.x, sym.x + sym.l);
  return { gauche: Math.max(0, -b.x), droite: Math.max(0, b.x + b.l), haut: Math.max(0, -b.y), bas: Math.max(0, b.y + b.h), rx, droiteHaut: rx, gaucheBas: rx };
}

/* Libellé d'arête coupé sur deux lignes s'il dépasse la portée dessinée. */
export function lignesLibelle(t, portee) {
  const k = K(), taille = k.taille_libelle;
  const s = String(t || '').trim();
  if (!s) return [];
  if (mesurerTexte(s, taille) <= portee - 2 * k.ecart) return [s];
  // coupure de préférence entre la section et la longueur (« 3 x 70 + 54,6 » / « : 55 m »)
  const sep = /\s(:|—)\s/.exec(s);
  if (sep) return [s.slice(0, sep.index), s.slice(sep.index + 1)];
  const mots = s.split(' ');
  if (mots.length < 2) return [s];
  let best = null;
  for (let i = 1; i < mots.length; i++) {
    const a = mots.slice(0, i).join(' '), b = mots.slice(i).join(' ');
    const w = Math.max(mesurerTexte(a, taille), mesurerTexte(b, taille));
    if (!best || w < best.w) best = { w, l: [a, b] };
  }
  return best.l;
}
const largeurLignes = (l) => Math.max(0, ...l.map((x) => mesurerTexte(x, K().taille_libelle)));
const hauteurLignes = (l) => l.length * K().taille_libelle * K().interligne;

/* ---------- Mise en page (B3) ---------- */

/* Disposition : positions locales des nœuds (tronc horizontal de gauche à droite, dérivations alternées dessus /
 * dessous, chacune avec son propre tronc ; aucun croisement : une dérivation ne commence qu'après la fin de la
 * précédente du même côté). Retourne le modèle complet (topologie + positions + taille naturelle). */
export function disposer(topo, reseau, retouches = retouchesParDefaut(), titre = '', { legende = true } = {}) {
  const k = K();
  const parId = new Map(topo.noeuds.map((n) => [n.id, n]));
  const areteId = new Map(topo.aretes.map((a) => [a.id, a]));
  const f = foretCouvrante(topo, reseau, retouches.origines || []);
  const libelleArete = (id) => { const r = (retouches.aretes || {})[id]; return r && typeof r.libelle === 'string' ? r.libelle : (areteId.get(id) || {}).libelle || ''; };
  // renvois : texte « ↔ repère » sur chacun des deux nœuds
  const renvoisDe = new Map();
  const nomNoeud = (id) => { const n = parId.get(id); const r = (retouches.noeuds || {})[id]; return n.repere || (r && r.libelle) || (n.designation[0] || id); };
  for (const id of f.renvois) {
    const a = areteId.get(id);
    for (const [u, v] of [[a.a, a.b], [a.b, a.a]]) { if (!renvoisDe.has(u)) renvoisDe.set(u, []); renvoisDe.get(u).push(k.renvoi.replace('{repere}', nomNoeud(v))); }
  }
  const ext = new Map(topo.noeuds.map((n) => [n.id, etendues(n, (retouches.noeuds || {})[n.id], renvoisDe.get(n.id))]));
  const hauteurSous = new Map();
  const profondeur = (id) => { if (hauteurSous.has(id)) return hauteurSous.get(id); let h = 0; for (const c of f.enfants.get(id)) h = Math.max(h, 1 + profondeur(c)); hauteurSous.set(id, h); return h; };
  const trier = (l) => l.sort((x, y) => comparerNoeuds(parId.get(x), parId.get(y)));
  const libelles = new Map();   // id d'arête → lignes
  const departs = new Map();    // id d'arête → décalage horizontal du départ (dérivations multiples, H-429)

  /* Bloc d'un sous-arbre, nœud racine en (0, 0) : positions relatives et étendues. Tronc = plus long chemin depuis la
   * racine ; dérivations alternées dessous / dessus ; une dérivation ne part qu'après la fin (à droite) de la
   * précédente du même côté, et au-delà des bandes de texte du tronc : aucun croisement, aucun chevauchement. */
  function bloc(racine) {
    const tronc = [racine];
    for (let n = racine; ;) {
      const enf = trier(f.enfants.get(n).slice());
      if (!enf.length) break;
      let m = enf[0];
      for (const c of enf) if (profondeur(c) > profondeur(m)) m = c;
      tronc.push(m); n = m;
    }
    // bandes du tronc : au-dessus (cartouches, libellés d'arêtes, deux lignes au plus), en dessous (désignations)
    let A = 0, B = 0;
    tronc.forEach((id, i) => {
      A = Math.max(A, ext.get(id).haut); B = Math.max(B, ext.get(id).bas);
      if (i) A = Math.max(A, hauteurLignes(lignesLibelle(libelleArete(f.areteParent.get(id)), k.pas_x)) + k.ecart + 2);
    });
    const pos = new Map();
    const finCote = { haut: -Infinity, bas: -Infinity };
    let cote = 'bas', xPrec = 0;
    for (let i = 0; i < tronc.length; i++) {
      const id = tronc[i], e = ext.get(id);
      let x = 0;
      if (i > 0) {
        const p = ext.get(tronc[i - 1]);
        const idA = f.areteParent.get(id);
        const brut = libelleArete(idA);
        const l0 = lignesLibelle(brut, k.pas_x);
        x = xPrec + Math.max(k.pas_x, p.droiteHaut + largeurLignes(l0) + e.gauche + 3 * k.ecart, p.droite + k.ecart + e.gaucheBas);
      }
      const derivs = trier(f.enfants.get(id).filter((c) => c !== tronc[i + 1]));
      const cotes = derivs.map(() => { const c = cote; cote = cote === 'bas' ? 'haut' : 'bas'; return c; });
      for (const c of new Set(cotes)) x = Math.max(x, finCote[c] + 2 * k.ecart);
      if (i > 0) { const idA = f.areteParent.get(id); libelles.set(idA, lignesLibelle(libelleArete(idA), x - xPrec - ext.get(tronc[i - 1]).droiteHaut - e.gauche - k.ecart)); }
      pos.set(id, { x, y: 0 });
      const courant = { haut: A, bas: B };
      // v1.11.1 (H-429) : plusieurs dérivations d'un même nœud du même côté — chaque départ a sa propre verticale,
      // décalée vers la gauche dans l'emprise du symbole (jamais un tronçon dessiné sur un autre)
      const parCote = { haut: cotes.filter((c) => c === 'haut').length, bas: cotes.filter((c) => c === 'bas').length };
      const rang = { haut: 0, bas: 0 };
      derivs.forEach((c, j) => {
        const sd = cotes[j];
        const iCote = rang[sd]++;
        departs.set(f.areteParent.get(c), iCote ? -(e.rx * 0.9 * iCote) / Math.max(1, parCote[sd] - 1) : 0);
        const sub = bloc(c);
        const idA = f.areteParent.get(c);
        const l = lignesLibelle(libelleArete(idA), k.pas_x);
        libelles.set(idA, l);
        const dx = Math.max(k.decalage_branche_min, largeurLignes(l) + sub.ext.gauche + 3 * k.ecart);
        const haut = Math.max(sub.ext.haut, hauteurLignes(l) + k.ecart + 2);
        let cy;
        if (sd === 'bas') { cy = Math.max(k.pas_y, courant.bas + 2 * k.ecart + haut); courant.bas = cy + sub.ext.bas; }
        else { cy = -Math.max(k.pas_y, courant.haut + 2 * k.ecart + sub.ext.bas); courant.haut = -cy + haut; }
        for (const [nid, q] of sub.pos) pos.set(nid, { x: x + dx + q.x, y: cy + q.y });
        finCote[sd] = Math.max(finCote[sd], x + dx + sub.ext.droite);
      });
      xPrec = x;
    }
    let g = 0, d = 0, h = A, b2 = B;
    for (const [nid, q] of pos) {
      const e = ext.get(nid);
      g = Math.max(g, e.gauche - q.x); d = Math.max(d, q.x + e.droite); h = Math.max(h, e.haut - q.y); b2 = Math.max(b2, q.y + e.bas);
    }
    for (const c of ['haut', 'bas']) if (Number.isFinite(finCote[c])) d = Math.max(d, finCote[c]);
    return { pos, ext: { gauche: g, droite: d, haut: h, bas: b2 } };
  }

  // arbres empilés verticalement
  const positions = new Map();
  let y = 0, largeurContenu = 0;
  const blocs = f.arbres.map((a) => bloc(a.origine));
  blocs.forEach((bl, i) => {
    y += (i ? k.ecart_arbres : 0) + bl.ext.haut;
    for (const [id, q] of bl.pos) positions.set(id, { x: bl.ext.gauche + q.x, y: y + q.y });
    y += bl.ext.bas;
    largeurContenu = Math.max(largeurContenu, bl.ext.gauche + bl.ext.droite);
  });
  const hauteurContenu = y;
  // en-tête
  const hTitre = titre ? k.taille_titre * k.interligne : 0;
  const hEntete = hTitre + k.taille_sous_titre * k.interligne + k.ecart_titre;
  // mini-légende : v1.11.1 (H-428) — masquée, elle ne réserve plus de place (le cadre se réduit)
  const leg = legende ? lignesMiniLegende(topo) : [];
  const L = k.legende;
  const largeurLegende = leg.length ? L.longueur_echantillon + 3 + Math.max(mesurerTexte(L.titre, L.taille), ...leg.map((e) => mesurerTexte(e.libelle, L.taille))) : 0;
  const hauteurLegende = leg.length ? (L.ligne * (leg.length + 1)) + k.ecart : 0;
  const largeur = Math.max(k.largeur_min, largeurContenu, mesurerTexte(titre || '', k.taille_titre, { gras: true }), largeurLegende) + 2 * k.marge;
  const hauteur = k.marge + hEntete + (hauteurContenu ? hauteurContenu + k.ecart_titre : 0) + hauteurLegende + k.marge;
  const dy = k.marge + hEntete + k.ecart_titre;
  const noeuds = topo.noeuds.map((n) => {
    const q = positions.get(n.id) || { x: 0, y: 0 };
    return { ...n, x: k.marge + q.x, y: dy + q.y, origine: f.arbres.some((a) => a.origine === n.id), renvois: renvoisDe.get(n.id) || [], parent: f.parent.get(n.id) || null, rang: Number.isFinite(n.rang) ? n.rang : null };
  });
  const aretes = topo.aretes.map((a) => {
    const fils = f.areteParent.get(a.b) === a.id ? a.b : (f.areteParent.get(a.a) === a.id ? a.a : null);
    return { ...a, parent: fils ? f.parent.get(fils) : null, enfant: fils, renvoi: f.renvois.includes(a.id), lignes: libelles.get(a.id) || lignesLibelle(libelleArete(a.id), k.pas_x), rang: Number.isFinite(a.rang) ? a.rang : null, depart_dx: departs.get(a.id) || 0 };
  });
  return {
    noeuds, aretes, largeur, hauteur, y_legende: dy + hauteurContenu + (hauteurContenu ? k.ecart_titre : 0), legende: !!legende,
    origines: f.arbres.map((a) => a.origine), sans_repere: topo.noeuds.filter((n) => n.type !== 'extremite' && !n.repere).length,
    signature: signatureTopologie(topo)
  };
}

/* Entrées de la mini-légende : états, réseaux et ouvrages présents (fonctions de la légende du plan). */
export function lignesMiniLegende(topo) {
  const faux = [];
  for (const n of topo.noeuds) if (n.type !== 'extremite') faux.push({ type: n.type, etat: n.etat, domaine: n.domaine, pose: n.pose, attributs: n.attributs || {}, materiel_associe: [] });
  for (const a of topo.aretes) faux.push({ type: 'troncon', domaine: a.domaine, pose: a.pose, etat: a.etat, attributs: {} });
  return entreesLegende(faux);
}

/* ---------- Génération, mise à jour, réinitialisation (B4) ---------- */

/* Topologie stockée dans un modèle (pour redisposer sans relire le plan). */
function topoDuModele(m) {
  return {
    noeuds: m.noeuds.map(({ x, y, origine, renvois, parent, ...n }) => ({ ...n, rang: n.rang === null || n.rang === undefined ? Infinity : n.rang })),
    aretes: m.aretes.map(({ parent, enfant, renvoi, lignes, depart_dx, ...a }) => ({ ...a, rang: a.rang === null || a.rang === undefined ? Infinity : a.rang }))
  };
}

/* Génère (ou met à jour) le modèle depuis le plan. Retouches des objets disparus supprimées ; les autres conservées.
 * Retourne { ajoutes, retires } (identifiants de nœuds). */
export function genererSynoptique(o, projet) {
  normaliserSynoptique(o);
  const s = o.synoptique;
  const avant = s.modele ? new Set(s.modele.noeuds.map((n) => n.id)) : null;
  const topo = extraireTopologie(projet, s.reseau);
  const ids = new Set(topo.noeuds.map((n) => n.id)), idsA = new Set(topo.aretes.map((a) => a.id));
  for (const id of Object.keys(s.retouches.noeuds)) if (!ids.has(id)) delete s.retouches.noeuds[id];
  for (const id of Object.keys(s.retouches.aretes)) if (!idsA.has(id)) delete s.retouches.aretes[id];
  s.retouches.origines = s.retouches.origines.filter((id) => ids.has(id));
  const k = s.modele ? o.largeur / s.modele.largeur : 1;
  s.modele = disposer(topo, s.reseau, s.retouches, s.titre_visible === false ? '' : titreSynoptique(s), { legende: s.legende_visible !== false });
  s.modele.genere_le = new Date().toISOString();
  ajusterBoite(o, k);
  return { ajoutes: avant ? [...ids].filter((id) => !avant.has(id)) : [...ids], retires: avant ? [...avant].filter((id) => !ids.has(id)) : [] };
}

/* Redispose le modèle stocké (origine choisie, libellés retouchés) sans relire le plan. `reinitialiser` : supprime
 * les décalages manuels (les libellés retouchés restent). */
export function redisposer(o, { reinitialiser = false } = {}) {
  const s = o.synoptique;
  if (!s || !s.modele) return false;
  if (reinitialiser) for (const r of Object.values(s.retouches.noeuds)) { delete r.dx; delete r.dy; }
  for (const [id, r] of Object.entries(s.retouches.noeuds)) if (!Object.keys(r).length) delete s.retouches.noeuds[id];
  const k = o.largeur / s.modele.largeur;
  const sig = s.modele.signature, date = s.modele.genere_le;
  const coin = versPlan(o, { x: 0, y: 0 });   // v1.11.1 (H-428) : coin haut-gauche du cadre fixe sur la page
  s.modele = disposer(topoDuModele(s.modele), s.reseau, s.retouches, s.titre_visible === false ? '' : titreSynoptique(s), { legende: s.legende_visible !== false });
  s.modele.signature = sig; s.modele.genere_le = date;
  ajusterBoite(o, k);
  const apres = versPlan(o, { x: 0, y: 0 });
  o.x += coin.x - apres.x; o.y += coin.y - apres.y;
  return true;
}

/* Taille de l'objet = taille naturelle × échelle conservée ; centre inchangé. */
function ajusterBoite(o, k) {
  const m = o.synoptique.modele;
  o.largeur = m.largeur * (Number.isFinite(k) && k > 0 ? k : 1);
  o.hauteur = m.hauteur * (Number.isFinite(k) && k > 0 ? k : 1);
}

/* Plan modifié depuis la génération ? */
export function planModifie(o, projet) {
  const s = o && o.synoptique;
  if (!s || !s.modele) return false;
  return signatureTopologie(extraireTopologie(projet, s.reseau, { avecRang: false })) !== s.modele.signature;
}

/* ---------- Rendu ---------- */

/* Point d'un nœud avec son décalage manuel (local). */
export function positionNoeud(n, retouches) {
  const r = (retouches && retouches.noeuds && retouches.noeuds[n.id]) || {};
  return { x: n.x + (Number(r.dx) || 0), y: n.y + (Number(r.dy) || 0) };
}

/* Tracé orthogonal d'une arête parent → enfant : vertical depuis le parent, puis horizontal jusqu'à l'enfant.
 * `dx` : départ décalé dans l'emprise du symbole du parent (dérivations multiples du même côté, H-429). */
export function traceArete(p, c, dx = 0) {
  if (Math.abs(p.y - c.y) < 1e-9 || Math.abs(p.x - c.x) < 1e-9) return [p, c];
  if (dx) return [{ x: p.x + dx, y: p.y }, { x: p.x + dx, y: c.y }, c];
  return [p, { x: p.x, y: c.y }, c];
}
/* Tracé d'une arête du modèle avec les positions retouchées. */
export function traceAreteModele(a, pos) {
  return traceArete(pos.get(a.parent), pos.get(a.enfant), Number(a.depart_dx) || 0);
}

/* Primitives locales (origine en haut à gauche, unités à l'échelle 1). `ecran` : nœuds et arêtes masqués en gris,
 * pastille « plan modifié » ; sinon exactement ce qui sort à l'export. */
export function primitivesLocales(o, { ecran = false, modifie = false, actif = null } = {}) {
  const s = o.synoptique, m = s && s.modele, k = K();
  if (!m) return [];
  const R = s.retouches || retouchesParDefaut();
  const prims = [];
  const W = m.largeur, H = m.hauteur;
  // cadre et fond
  const fond = s.fond === 'transparent' ? null : (s.fond === 'translucide' ? CHARTE.texte.fond_etiquette : '#FFFFFF');
  const couleur = s.cadre === 'aucun' ? null : (s.couleur_cadre || k.couleur_cadre_defaut);
  const opt = { couleur, epaisseur: couleur ? k.epaisseur_cadre : 0, remplissage: fond };
  if (couleur || fond) prims.push(s.cadre === 'arrondi' ? rectArrondi(0, 0, W, H, k.rayon_cadre, opt) : rect(0, 0, W, H, opt));
  // en-tête
  let y = k.marge;
  const titre = s.titre_visible === false ? '' : titreSynoptique(s);
  if (titre) { y += k.taille_titre; prims.push(texte(W / 2, y, titre, { taille: k.taille_titre, couleur: '#000000', ancre: 'milieu', gras: true })); y += k.taille_titre * (k.interligne - 1); }
  y += k.taille_sous_titre;
  prims.push(texte(W / 2, y, k.non_echelle, { taille: k.taille_sous_titre, couleur: '#000000', ancre: 'milieu', italique: true }));
  const parId = new Map(m.noeuds.map((n) => [n.id, n]));
  const pos = new Map(m.noeuds.map((n) => [n.id, positionNoeud(n, R)]));
  // arêtes (sous les nœuds)
  for (const a of m.aretes) {
    if (a.renvoi || !a.parent || !pos.has(a.parent) || !pos.has(a.enfant)) continue;
    const masque = (R.aretes[a.id] || {}).masque === true;
    if (masque && !ecran) continue;
    const pts = traceAreteModele(a, pos);
    let tr = traitTroncon(a.domaine, a.pose, a.etat, pts);
    if (masque) tr = tr.map((p) => ({ ...p, couleur: k.couleur_masque_ecran }));
    prims.push(...tr);
    const r = R.aretes[a.id] || {};
    // libellé centré sur la partie libre du tracé : entre le symbole du parent et le cartouche de l'enfant
    const ep = etendues(parId.get(a.parent), R.noeuds[a.parent], parId.get(a.parent).renvois);
    const ec = etendues(parId.get(a.enfant), R.noeuds[a.enfant], parId.get(a.enfant).renvois);
    const pads = { gauche: pts.length === 2 ? ep.droiteHaut : k.ecart, droite: ec.gauche };
    const lignes = typeof r.libelle === 'string' ? lignesLibelle(r.libelle, longueurHorizontale(pts) - pads.gauche - pads.droite + 2 * k.ecart) : (a.lignes || []);
    if (lignes.length) prims.push(...libelleSurTrace(pts, lignes, masque ? k.couleur_masque_ecran : '#000000', pads));
  }
  // nœuds
  for (const n of m.noeuds) {
    const r = R.noeuds[n.id] || {};
    if (r.masque && !ecran) continue;
    const q = pos.get(n.id);
    prims.push(...transformer(primitivesNoeud(n, r, n.renvois, { fantome: !!r.masque }), { x: q.x, y: q.y, rotation: 0, echelle: 1 }));
  }
  // écran : nœud sous-sélectionné (cercle tireté)
  if (ecran && actif && pos.has(actif)) {
    const n = parId.get(actif), q = pos.get(actif);
    const b = boite(symboleNoeud(n)) || { l: 4, h: 4 };
    prims.push(cercle(q.x, q.y, Math.max(b.l, b.h) / 2 + 4, { couleur: '#0A84FF', epaisseur: 0.8, remplissage: null, tirete: [3, 2] }));
  }
  // mini-légende
  if (s.legende_visible !== false && m.legende !== false) prims.push(...primitivesMiniLegende(m, k.marge, m.y_legende));
  if (ecran && modifie) prims.push(texte(W - k.ecart, k.marge, 'Plan modifié depuis la génération', { taille: k.taille_sous_titre, couleur: k.couleur_pastille, ancre: 'fin', gras: true }));
  void parId;
  return prims;
}

function longueurHorizontale(pts) {
  let best = 0;
  for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].y - pts[i - 1].y) < 1e-9) best = Math.max(best, Math.abs(pts[i].x - pts[i - 1].x));
  return best || K().pas_x;
}

/* Libellé au-dessus de la partie horizontale du tracé (centré), sinon à droite de la partie verticale. */
function libelleSurTrace(pts, lignes, couleur, pads = { gauche: 0, droite: 0 }) {
  const k = K(), t = k.taille_libelle;
  let seg = null;
  for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].y - pts[i - 1].y) < 1e-9 && Math.abs(pts[i].x - pts[i - 1].x) > 1e-9) seg = [pts[i - 1], pts[i]];
  const prims = [];
  if (seg) {
    const sens = seg[1].x >= seg[0].x ? 1 : -1;
    const a = seg[0].x + sens * pads.gauche, b = seg[1].x - sens * pads.droite;
    const cx = (sens > 0 ? a < b : a > b) ? (a + b) / 2 : (seg[0].x + seg[1].x) / 2;
    let y = seg[0].y - 2 - (lignes.length - 1) * t * k.interligne;
    for (const l of lignes) { prims.push(texte(cx, y, l, { taille: t, couleur, ancre: 'milieu' })); y += t * k.interligne; }
  } else {
    const a = pts[0], b = pts[pts.length - 1];
    let y = (a.y + b.y) / 2 - ((lignes.length - 1) * t * k.interligne) / 2 + t * 0.36;
    for (const l of lignes) { prims.push(texte(a.x + 2, y, l, { taille: t, couleur, ancre: 'debut' })); y += t * k.interligne; }
  }
  return prims;
}

function primitivesMiniLegende(m, x0, y0) {
  const L = K().legende;
  const entrees = lignesMiniLegende(topoDuModele(m));
  if (!entrees.length) return [];
  const prims = [texte(x0, y0 + L.taille, L.titre, { taille: L.taille, couleur: '#000000', ancre: 'debut', gras: true })];
  let y = y0 + L.ligne + L.ligne / 2;
  for (const e of entrees) {
    if (e.type === 'troncon') prims.push(...echantillonTroncon(e.domaine, e.pose, e.etat, x0, x0 + L.longueur_echantillon, y));
    else {
      const ech = echantillonSymbole(e.typeObjet, e.etat, e.attributs, e.domaine || 'BTS', e.pose || 'aerien');
      const b = boite(ech);
      const f = b && b.h > L.ligne * 0.8 ? (L.ligne * 0.8) / b.h : 1;
      prims.push(...transformer(ech, { x: x0 + L.longueur_echantillon / 2, y, rotation: 0, echelle: f }));
    }
    prims.push(texte(x0 + L.longueur_echantillon + 3, y + L.taille * 0.36, e.libelle, { taille: L.taille, couleur: '#000000', ancre: 'debut' }));
    y += L.ligne;
  }
  return prims;
}

/* Local → plan : centre de l'objet, échelle largeur / largeur naturelle, rotation. */
export function echelleSynoptique(o) {
  const m = o.synoptique && o.synoptique.modele;
  return m && m.largeur ? o.largeur / m.largeur : 1;
}
export function versPlan(o, q) {
  const m = o.synoptique.modele, e = echelleSynoptique(o);
  const a = ((o.rotation || 0) * Math.PI) / 180;
  const x = (q.x - m.largeur / 2) * e, y = (q.y - m.hauteur / 2) * e;
  return { x: o.x + x * Math.cos(a) - y * Math.sin(a), y: o.y + x * Math.sin(a) + y * Math.cos(a) };
}
export function versLocal(o, p) {
  const m = o.synoptique.modele, e = echelleSynoptique(o) || 1;
  const a = (-(o.rotation || 0) * Math.PI) / 180;
  const vx = p.x - o.x, vy = p.y - o.y;
  return { x: (vx * Math.cos(a) - vy * Math.sin(a)) / e + m.largeur / 2, y: (vx * Math.sin(a) + vy * Math.cos(a)) / e + m.hauteur / 2 };
}

/* Primitives sur le plan (écran ou export). */
export function primitivesSynoptique(o, opts = {}) {
  const m = o.synoptique && o.synoptique.modele;
  if (!m) return [];
  const locales = primitivesLocales(o, opts);
  return transformer(locales.map((p) => decaler(p, -m.largeur / 2, -m.hauteur / 2)), { x: o.x, y: o.y, rotation: o.rotation || 0, echelle: echelleSynoptique(o) });
}
function decaler(p, dx, dy) { return transformer([p], { x: dx, y: dy, rotation: 0, echelle: 1 })[0]; }

/* Nœud sous un point du plan (sous-sélection, menu du nœud) : le plus proche à moins de `tol` (unités plan). */
export function noeudSous(o, p, tol) {
  const s = o.synoptique;
  if (!s || !s.modele) return null;
  const q = versLocal(o, p);
  const e = echelleSynoptique(o) || 1;
  let best = null;
  for (const n of s.modele.noeuds) {
    const c = positionNoeud(n, s.retouches);
    const sb = boite(symboleNoeud(n)) || { l: 4, h: 4 };
    const d = Math.hypot(q.x - c.x, q.y - c.y);
    if (d <= Math.max(sb.l, sb.h) / 2 + tol / e && (!best || d < best.d)) best = { n, d };
  }
  return best ? best.n : null;
}

/* ---------- Retouches (toutes suivies de valider() par l'appelant) ---------- */

function retNoeud(o, id) { const R = o.synoptique.retouches.noeuds; if (!R[id]) R[id] = {}; return R[id]; }
function nettoyer(o) { const R = o.synoptique.retouches; for (const g of [R.noeuds, R.aretes]) for (const [id, r] of Object.entries(g)) if (!Object.keys(r).length) delete g[id]; }

export function deplacerNoeud(o, id, dxLocal, dyLocal) {
  const r = retNoeud(o, id);
  r.dx = Math.round(((Number(r.dx) || 0) + dxLocal) * 100) / 100;
  r.dy = Math.round(((Number(r.dy) || 0) + dyLocal) * 100) / 100;
  if (!r.dx) delete r.dx; if (!r.dy) delete r.dy;
  nettoyer(o);
}
export function libellerNoeud(o, id, libelle) {
  const r = retNoeud(o, id);
  const n = o.synoptique.modele.noeuds.find((x) => x.id === id);
  const v = libelle === null ? null : libelleSansRetour(libelle);
  if (v === null || v === '' || (n && v === n.designation[0])) delete r.libelle; else r.libelle = v;
  nettoyer(o);
}
export function masquerNoeud(o, id, masque) { const r = retNoeud(o, id); if (masque) r.masque = true; else delete r.masque; nettoyer(o); }
export function libellerArete(o, id, libelle) {
  const R = o.synoptique.retouches.aretes; if (!R[id]) R[id] = {};
  const a = o.synoptique.modele.aretes.find((x) => x.id === id);
  const v = libelle === null ? null : libelleSansRetour(libelle);
  if (v === null || v === '' || (a && v === a.libelle)) delete R[id].libelle; else R[id].libelle = v;
  nettoyer(o);
}
export function masquerArete(o, id, masque) { const R = o.synoptique.retouches.aretes; if (!R[id]) R[id] = {}; if (masque) R[id].masque = true; else delete R[id].masque; nettoyer(o); }

/* « Définir comme origine » : remplace les origines de la composante du nœud, puis redispose. */
export function definirOrigine(o, id) {
  const s = o.synoptique;
  const topo = topoDuModele(s.modele);
  const f = foretCouvrante(topo, s.reseau, []);
  const comp = new Set();
  const adj = new Map(topo.noeuds.map((n) => [n.id, []]));
  for (const a of topo.aretes) if (adj.has(a.a) && adj.has(a.b)) { adj.get(a.a).push(a.b); adj.get(a.b).push(a.a); }
  const pile = [id]; comp.add(id);
  while (pile.length) for (const v of adj.get(pile.pop()) || []) if (!comp.has(v)) { comp.add(v); pile.push(v); }
  s.retouches.origines = s.retouches.origines.filter((x) => !comp.has(x)).concat([id]);
  void f;
  return redisposer(o);
}

/* Étiquette lisible d'un nœud (fiche, menus). */
export function nomNoeud(o, n) {
  const r = (o.synoptique.retouches.noeuds || {})[n.id] || {};
  const d = typeof r.libelle === 'string' ? r.libelle : n.designation[0] || '';
  return (n.repere ? n.repere + ' — ' : '') + (d || (n.type === 'extremite' ? K().extremite : LIBELLES.types[n.type] || n.type));
}

/* ---------- Branchement sur le rendu des objets ---------- */

const ETAT_ECRAN = { modifie: new Map(), actif: null };   // écran seulement : pastille et nœud sous-sélectionné
export function etatEcranSynoptique() { return ETAT_ECRAN; }
export function empreinteEcran(o) { return (ETAT_ECRAN.modifie.get(o.id) ? 'M' : '') + (ETAT_ECRAN.actif && ETAT_ECRAN.actif.id === o.id ? 'A' + ETAT_ECRAN.actif.noeud : ''); }

definirRenduSynoptique((o, { ecran = false } = {}) => primitivesSynoptique(o, { ecran, modifie: ecran && !!ETAT_ECRAN.modifie.get(o.id), actif: ecran && ETAT_ECRAN.actif && ETAT_ECRAN.actif.id === o.id ? ETAT_ECRAN.actif.noeud : null }));
