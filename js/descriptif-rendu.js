/* descriptif-rendu.js — mise en page du descriptif des travaux (v1.5.0 §2.10, §2.11) : lignes mises en forme avec
 * retour à la ligne automatique (mot trop long coupé), repère en retrait suspendu, puces et niveaux, échantillon de trait
 * (même fonction que la légende), colonnes égales remplies dans l'ordre et coupées entre entrées (sauts forcés
 * respectés), bloc sur le plan (position, largeur, échelle, cadre, fond) et pages annexes du PDF.
 *
 * Tout est décrit en primitives (primitives.js) : l'écran (rendu-svg.js), le PDF (export-pdf.js) et le PNG
 * (export-png.js) projettent la même géométrie. Unités : unités plan (points PDF) ; mise en page en local (échelle 1),
 * puis mise à l'échelle `echelle` et placement. */
import { CHARTE, MM } from './charte.js';
import { texte, ligne, rect, cercle, transformer, mesurerTexte } from './primitives.js';
import { rectArrondi } from './symboles.js';
import { echantillonTroncon } from './legende.js';
import { etenduePlan } from './vue.js';
import { appliquerFormat, texteLigne, largeurParDefaut } from './descriptif.js';

const D = () => CHARTE.descriptif;

/* Échelle bornée : jamais de texte sous la taille minimale de la charte (1,8 mm, H-116). */
export function echelleDescriptif(d) {
  const K = D();
  const min = (K.taille_min_mm * MM) / K.corps.taille;
  return Math.min(K.echelle_max, Math.max(min, Number(d && d.echelle) || K.echelle_defaut));
}

export function largeurColonneLocale(d) {
  const K = D();
  const n = Math.max(1, Math.min(3, Number(d.colonnes) || 1));
  const larg = Number(d.largeur) || largeurParDefaut(n);
  return Math.max(K.largeur_min_colonne, (larg - 2 * K.marge - (n - 1) * K.espace_colonnes) / n);
}

/* ---------- Texte riche avec retour à la ligne ---------- */

/* Morceaux (mots et espaces) d'une sous-ligne de segments, mesurés à la taille donnée. */
function morceaux(segs, taille, forceGras) {
  const res = [];
  for (const s of segs || []) {
    for (const p of String(s.t || '').split(/( +)/)) {
      if (!p) continue;
      const st = { g: !!(s.g || forceGras), i: !!s.i, s: !!s.s, c: s.c || null };
      res.push({ t: p, ...st, espace: /^ +$/.test(p), l: mesurerTexte(p, taille, { gras: st.g, italique: st.i }) });
    }
  }
  return res;
}

/* Coupe un mot trop long caractère par caractère. */
function couperMot(m, largeur, taille) {
  const parts = [];
  let cur = '';
  for (const ch of m.t) {
    const essai = cur + ch;
    if (cur && mesurerTexte(essai, taille, { gras: m.g, italique: m.i }) > largeur) { parts.push(cur); cur = ch; }
    else cur = essai;
  }
  if (cur) parts.push(cur);
  return parts.map((t) => ({ ...m, t, l: mesurerTexte(t, taille, { gras: m.g, italique: m.i }) }));
}

/* Rangées d'une sous-ligne pour une largeur disponible. Retourne [{ morceaux, largeur }]. */
function rangees(ms, largeur, taille) {
  const lignes = [];
  let cur = [], l = 0;
  const pousser = () => {
    while (cur.length && cur[cur.length - 1].espace) { l -= cur[cur.length - 1].l; cur.pop(); }
    lignes.push({ morceaux: cur, largeur: Math.max(0, l) });
    cur = []; l = 0;
  };
  for (const m0 of ms) {
    const liste = !m0.espace && m0.l > largeur ? couperMot(m0, largeur, taille) : [m0];
    for (const m of liste) {
      if (m.espace && !cur.length) continue;   // pas d'espace en début de rangée
      if (!m.espace && cur.length && l + m.l > largeur + 1e-6) pousser();
      cur.push(m); l += m.l;
    }
  }
  if (cur.length || !lignes.length) pousser();
  return lignes;
}

/* Taille d'une ligne selon son rôle. */
function tailleDe(l, defaut) {
  const K = D();
  return l && l.role === 'titre' ? K.titre.taille : defaut;
}

/* v1.7.0 §9 (H-334) — Cartouche du repère d'entrée : cercle à fond blanc, contour et texte noirs (texte horizontal),
 * comme le cartouche de repère du plan. Diamètre ≥ facteur × hauteur de ligne du corps, élargi pour un repère long ;
 * le point final des repères automatiques (« S1. ») n'est pas écrit dans le cercle. Une couleur choisie à la main
 * s'applique au texte ; l'ancien rouge par défaut (#E30000) est lu comme « pas de couleur choisie ». */
/* v1.7.1 (H-339) : `style` { texte, contour, fond } = aspect du cartouche de l'ouvrage sur le plan (fiche → Aspect du
 * cartouche) ; une couleur choisie à la main dans l'éditeur du descriptif prime pour le texte. */
const hexa = (c) => (c && /^#[0-9A-Fa-f]{6}$/.test(c) ? String(c).toUpperCase() : null);
export function geometrieCartouche(repere, couleurChoisie = null, style = null) {
  const K = D(), C = K.cartouche_repere;
  const t = String(repere || '').trim().replace(/\.$/, '');
  if (!t) return null;
  const hLigne = K.corps.taille * K.interligne;
  const dMin = C.facteur_diametre * hLigne;
  const taille = C.rapport_texte * dMin;
  const marge = C.rapport_marge * dMin;
  const diametre = Math.max(dMin, mesurerTexte(t, taille, { gras: true }) + 2 * marge);
  const choisie = hexa(couleurChoisie) && hexa(couleurChoisie) !== K.repere.couleur.toUpperCase() ? hexa(couleurChoisie) : null;
  const st = style || {};
  const c = choisie || hexa(st.texte) || C.texte;
  return { texte: t, taille, diametre, epaisseur: C.rapport_contour * dMin, couleur: c, contour: hexa(st.contour) || C.contour, fond: st.fond === 'transparent' ? null : C.fond, retrait: diametre + mesurerTexte(' ', K.corps.taille) };
}

function primitivesCartouche(g, x, cy) {
  const C = D().cartouche_repere;
  const r = g.diametre / 2;
  return [
    cercle(x + r, cy, r - g.epaisseur / 2, { couleur: g.contour || C.contour, epaisseur: g.epaisseur, remplissage: g.fond === undefined ? C.fond : g.fond }),
    texte(x + r, cy + g.taille * 0.36, g.texte, { taille: g.taille, couleur: g.couleur, gras: true, ancre: 'milieu' })
  ];
}

/* Primitives d'une ligne mise en forme dans une boîte [x, x + largeur], à partir de y (haut). Retourne { prims, hauteur, rangees }.
 * `premier` : géométrie du cartouche de repère (geometrieCartouche) posée à gauche sur la première rangée, avec retrait
 * suspendu `retrait` ; la première rangée est assez haute pour contenir le cercle (aucun chevauchement à l'export). */
function rendreLigne(l, x, y, largeur, { taille, forceGras = false, premier = null, retrait = 0 }) {
  const K = D();
  const prims = [];
  const pre = l.puce ? l.puce + ' ' : '';
  const lPuce = pre ? mesurerTexte(pre, taille) : 0;
  const xTexte = x + retrait + (l.niveau || 0) * K.retrait_niveau + lPuce;
  const dispo = Math.max(taille * 2, x + largeur - xTexte);
  const sousLignes = (l.segments && l.segments.length ? l.segments : [[]]);
  let yy = y;
  let nRangees = 0;
  const zones = [];
  sousLignes.forEach((segs, iSL) => {
    const rs = rangees(morceaux(segs, taille, forceGras), dispo, taille);
    rs.forEach((r, i) => {
      const hN = taille * K.interligne;
      const avecCartouche = premier && nRangees === 0;
      const hRang = avecCartouche ? Math.max(hN, premier.diametre + premier.epaisseur) : hN;
      const base = yy + (hRang - hN) / 2 + hN * 0.78;
      if (avecCartouche) prims.push(...primitivesCartouche(premier, x, yy + hRang / 2));
      if (pre && iSL === 0 && i === 0) prims.push(texte(xTexte - lPuce, base, l.puce, { taille, couleur: '#000000' }));
      let dx = 0, extra = 0;
      const nbEsp = r.morceaux.filter((m) => m.espace).length;
      if (l.alignement === 'centre') dx = (dispo - r.largeur) / 2;
      else if (l.alignement === 'droite') dx = dispo - r.largeur;
      else if (l.alignement === 'justifie' && i < rs.length - 1 && nbEsp) extra = (dispo - r.largeur) / nbEsp;
      let xx = xTexte + Math.max(0, dx);
      for (const m of r.morceaux) {
        const lm = m.l + (m.espace ? extra : 0);
        const coul = m.c || '#000000';
        if (!m.espace) prims.push(texte(xx, base, m.t, { taille, couleur: coul, gras: m.g || undefined, italique: m.i || undefined }));
        if (m.s && lm > 0) prims.push(ligne(xx, base + taille * 0.14, xx + lm, base + taille * 0.14, coul, Math.max(0.15, taille * 0.07), { bout: 'butt' }));
        xx += lm;
      }
      zones.push({ x, y: yy, l: largeur, h: hRang });
      yy += hRang;
      nRangees++;
    });
  });
  return { prims, hauteur: yy - y, zones };
}

/* Ligne à rendre ? (supprimées et coordonnées GPS vides : éditeur seulement) */
function ligneVisible(l) {
  if (!l || l.supprimee) return false;
  if (l.cle_auto === 'entete.gps' && !texteLigne(l).trim()) return false;
  return true;
}

/* ---------- Éléments (en-tête, entrées) ---------- */

function elementEntete(d, W) {
  const K = D();
  const lignes = d.entete.lignes.filter(ligneVisible);
  if (!lignes.length) return null;
  return {
    saut: false,
    rendre(x, y) {
      const prims = [], zones = [];
      let yy = y;
      for (const l of lignes) {
        const r = rendreLigne(l, x, yy, W, { taille: tailleDe(l, K.corps.taille), forceGras: l.cle_auto && l.cle_auto.startsWith('entete.') });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, cible: { zone: 'entete', ligne: l.id } })));
        yy += r.hauteur;
      }
      return { prims, zones, hauteur: yy - y };
    }
  };
}

/* v1.10.0 §A3 (H-402) : `plage` [debut, fin[ des lignes visibles rendues ; `suite` = morceau suivant d'une entrée coupée
 * (plus haute qu'une colonne) : cartouche du repère répété, mention « (suite) », ni titre ni trait d'échantillon. */
function elementEntree(e, section, W, avecTitre, plage = null, suite = false) {
  const K = D();
  const toutes = e.lignes.filter(ligneVisible);
  const debut = plage ? plage[0] : 0, fin = plage ? plage[1] : toutes.length;
  const lignes = toutes.slice(debut, fin);
  const repere = (e.repere || []).map((s) => s.t || '').join('').trim();
  return {
    saut: !suite && !!e.saut_colonne_avant,
    saut_page: !suite && e.saut_page === true,
    entree: e,
    /* Coupe entre deux lignes : [morceau tenant dans hDispo, suite] ou null (une seule ligne, ou rien ne tient). */
    couper(hDispo) {
      for (let k = fin - 1; k > debut; k--) {
        const a = elementEntree(e, section, W, avecTitre, [debut, k], suite);
        a.hauteur = a.rendre(0, 0).hauteur; a.morceau = true;
        if (a.hauteur <= hDispo + 1e-6) {
          const b = elementEntree(e, section, W, false, [k, fin], true);
          b.hauteur = b.rendre(0, 0).hauteur; b.morceau = true;
          return [a, b];
        }
      }
      return null;
    },
    rendre(x, y) {
      const prims = [], zones = [];
      let yy = y;
      if (avecTitre && !suite) {
        const lt = { segments: [section.titre], alignement: 'centre', niveau: 0, puce: '' };
        const r = rendreLigne(lt, x, yy, W, { taille: K.titre.taille, forceGras: true });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, cible: { zone: 'titre', section: section.id } })));
        yy += r.hauteur + K.espace_entrees / 2;
      }
      const yEntree = yy;
      let x0 = x;
      const ech = !suite && e.echantillon && e.style_echantillon;
      const Lech = CHARTE.legende.longueur_echantillon;
      if (ech) x0 = x + Lech + K.ecart_echantillon;
      const cart = geometrieCartouche(repere, e.repere && e.repere[0] && e.repere[0].c, e.style_repere);   // v1.7.0 §9, v1.7.1 : aspect du plan
      const lR = cart ? cart.retrait : 0;
      if (suite) {   // v1.10.0 : « (suite) » sur la rangée du cartouche répété
        const ls = { segments: [[{ t: K.annexe.suite, i: true }]], niveau: 0, puce: '', alignement: 'gauche' };
        const r = rendreLigne(ls, x0, yy, x + W - x0, { taille: K.corps.taille, premier: cart, retrait: lR });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, x, l: W, cible: { zone: 'entree', entree: e.id } })));
        yy += r.hauteur;
      }
      lignes.forEach((l, i) => {
        const premier = i === 0 && cart && !suite ? cart : null;
        const r = rendreLigne(l, x0, yy, x + W - x0, { taille: tailleDe(l, K.corps.taille), premier, retrait: lR });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, x, l: W, cible: { zone: 'entree', entree: e.id, ligne: l.id } })));
        yy += r.hauteur;
      });
      if (!lignes.length && cart && !suite) {
        const h = cart.diametre + cart.epaisseur;
        prims.push(...primitivesCartouche(cart, x0, yy + h / 2));
        yy += h;
      }
      if (ech) {
        const ym = yEntree + K.corps.taille * K.interligne * 0.45;
        prims.unshift(...echantillonTroncon(ech.domaine, ech.pose, ech.etat, x, x + Lech, ym));
      }
      return { prims, zones, hauteur: yy - y };
    }
  };
}

function elements(d, W, { entete = true } = {}) {
  const res = [];
  const ent = entete ? elementEntete(d, W) : null;
  if (ent) res.push(ent);
  for (const s of d.sections) {
    const visibles = s.entrees.filter((e) => e.inclure !== false);
    const titre = s.titre && s.titre.some((x) => String(x.t || '').trim());
    visibles.forEach((e, i) => res.push(elementEntree(e, s, W, titre && i === 0)));
  }
  // hauteurs mesurées une fois
  for (const el of res) { const r = el.rendre(0, 0); el.hauteur = r.hauteur; }
  return res;
}

/* Répartition en colonnes. `hMax` null : colonnes équilibrées (hauteur minimale tenant en `n` colonnes, sauts forcés
 * au plus n − 1). `hMax` donné (annexe) : colonnes de hauteur hMax, autant que nécessaire ; v1.7.5 (H-360) : les `n`
 * premières colonnes (première page, sous l'en-tête pleine largeur) sont limitées à `hPremiere` si elle est donnée. */
function repartir(els, n, hMax = null, hPremiere = null) {
  const K = D();
  const gap = K.espace_entrees;
  const glouton = (Hde, sautsMax) => {
    const cols = [[]];
    let h = 0, sauts = 0;
    for (const el of els) {
      const col = cols[cols.length - 1];
      const H = Hde(cols.length - 1);
      const force = el.saut && col.length && sauts < sautsMax;
      if (col.length && (force || h + gap + el.hauteur > H + 1e-6)) { if (force) sauts++; cols.push([el]); h = el.hauteur; }
      else { h += (col.length ? gap : 0) + el.hauteur; col.push(el); }
    }
    return cols;
  };
  if (!els.length) return [[]];
  if (hMax !== null) return repartirPages(els, n, (i) => (hPremiere !== null && i < n ? hPremiere : hMax));
  const cst = (H) => () => H;
  const sautsMax = n - 1;
  let bas = Math.max(...els.map((e) => e.hauteur)), haut = els.reduce((s, e) => s + e.hauteur + gap, 0);
  if (glouton(cst(bas), sautsMax).length <= n) return glouton(cst(bas), sautsMax);
  for (let k = 0; k < 40; k++) {
    const mid = (bas + haut) / 2;
    if (glouton(cst(mid), sautsMax).length <= n) haut = mid; else bas = mid;
  }
  return glouton(cst(haut), sautsMax);
}

/* v1.10.0 §A3 (H-401 à H-403) — Répartition de l'annexe en colonnes de hauteur `Hde(i)`, `n` colonnes par page :
 * - sauts uniquement entre deux entrées ; une entrée qui ne tient pas dans le reste de la colonne passe à la suivante ;
 * - entrée plus haute qu'une colonne entière : coupée entre deux lignes (la suite répète le cartouche, « (suite) ») ;
 * - `saut_page` (éditeur : « Commencer une nouvelle page ») : l'entrée ouvre la page suivante, prioritaire ;
 * - saut de colonne forcé (`saut_colonne_avant`) respecté comme avant. */
function repartirPages(els, n, Hde) {
  const gap = D().espace_entrees;
  const cols = [[]];
  let h = 0;
  const nouvelleColonne = () => { cols.push([]); h = 0; };
  const pageCourante = () => Math.floor((cols.length - 1) / n);
  const pageOccupee = () => cols.slice(pageCourante() * n).some((c) => c.length);
  const file = [...els];
  let garde = 0;
  while (file.length && garde++ < 10000) {
    const el = file.shift();
    if (el.saut_page && pageOccupee()) { while (cols.length % n !== 0) cols.push([]); nouvelleColonne(); }
    else if (el.saut && cols[cols.length - 1].length) nouvelleColonne();
    const col = cols[cols.length - 1];
    const H = Hde(cols.length - 1);
    const dispo = H - h - (col.length ? gap : 0);
    if (el.hauteur <= dispo + 1e-6) { h += (col.length ? gap : 0) + el.hauteur; col.push(el); continue; }
    // trop haute pour une colonne entière : coupée ici (reste de la colonne), sinon au début de la suivante
    const Hsuiv = Hde(cols.length);
    if (el.hauteur > Math.min(H, Hsuiv) + 1e-6 && el.couper) {
      const morceaux = el.couper(dispo);
      if (morceaux) { h += (col.length ? gap : 0) + morceaux[0].hauteur; col.push(morceaux[0]); nouvelleColonne(); file.unshift(morceaux[1]); continue; }
    }
    if (col.length) { nouvelleColonne(); file.unshift({ ...el, saut: false, saut_page: false }); continue; }
    // colonne vide et rien ne tient : coupe à la hauteur de la colonne, sinon l'entrée déborde (une seule ligne)
    const m = el.couper ? el.couper(H) : null;
    if (m) { col.push(m[0]); nouvelleColonne(); file.unshift(m[1]); continue; }
    col.push(el); h = el.hauteur;
  }
  return cols;
}

function rendreColonnes(cols, x0, y0, Wc, esp) {
  const K = D();
  const prims = [], zones = [];
  let hMax = 0;
  cols.forEach((col, i) => {
    const x = x0 + i * (Wc + esp);
    let y = y0;
    col.forEach((el, j) => {
      if (j) y += K.espace_entrees;
      const r = el.rendre(x, y);
      prims.push(...r.prims); zones.push(...r.zones);
      y += r.hauteur;
    });
    hMax = Math.max(hMax, y - y0);
  });
  return { prims, zones, hauteur: hMax };
}

/* ---------- Bloc sur le plan ---------- */

let cache = { cle: null, valeur: null };

/* Mise en page locale (échelle 1, origine au coin haut-gauche du bloc). */
export function miseEnPage(d) {
  const K = D();
  const cle = JSON.stringify([d.entete, d.sections, d.largeur, d.colonnes, mesurerTexte('Mm', 10)]);
  if (cache.cle === cle) return cache.valeur;
  const n = Math.max(1, Math.min(3, Number(d.colonnes) || 1));
  const Wc = largeurColonneLocale(d);
  const els = elements(d, Wc);
  const cols = repartir(els, n);
  const r = rendreColonnes(cols, K.marge, K.marge, Wc, K.espace_colonnes);
  const largeur = 2 * K.marge + n * Wc + (n - 1) * K.espace_colonnes;
  const valeur = { prims: r.prims, zones: r.zones, colonnes: cols, largeur, hauteur: r.hauteur + 2 * K.marge, Wc };
  cache = { cle, valeur };
  return valeur;
}

/* Position et dimensions du bloc (unités plan). Position null = coin haut-droit de la page. */
export function positionDescriptif(plan) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  const ech = echelleDescriptif(d);
  const mp = miseEnPage(d);
  const l = mp.largeur * ech, h = mp.hauteur * ech;
  if (d.x !== null && d.x !== undefined && d.y !== null && d.y !== undefined) return { x: d.x, y: d.y, l, h, echelle: ech };
  const e = etenduePlan(plan);
  return { x: e.x + e.l - l - D().marge_bord, y: e.y + D().marge_bord, l, h, echelle: ech };
}

/* Bloc affiché sur le plan ? (`ecran` : à l'écran, le bloc destiné à la page annexe reste visible pour être édité). */
export function descriptifAffiche(plan, { ecran = false } = {}) {
  const d = plan && plan.descriptif;
  if (!d || d.visible === false) return false;
  return ecran || d.sortie_pdf !== 'annexe';
}

export function boiteDescriptif(plan, opts = { ecran: true }) {
  if (!descriptifAffiche(plan, opts)) return null;
  const p = positionDescriptif(plan);
  return p ? { x: p.x, y: p.y, l: p.l, h: p.h } : null;
}

/* Le bloc dépasse-t-il l'étendue de la page ? */
export function depassePage(plan) {
  const b = boiteDescriptif(plan, { ecran: true });
  if (!b) return false;
  const e = etenduePlan(plan);
  const t = 0.5;
  return b.x < e.x - t || b.y < e.y - t || b.x + b.l > e.x + e.l + t || b.y + b.h > e.y + e.h + t;
}

function aspect(d) {
  const K = D(), T = CHARTE.texte;
  const cadre = d.cadre || K.cadre_defaut;
  const fond = d.fond || K.fond_defaut;
  return {
    couleur: cadre === 'aucun' ? null : (d.couleur_cadre || K.couleur_cadre_defaut),
    arrondi: cadre === 'arrondi',
    fond: fond === 'transparent' ? null : (fond === 'translucide' ? T.fond_etiquette : '#FFFFFF')
  };
}

/* Primitives du bloc sur le plan (rien si masqué ou envoyé en page annexe, sauf `ecran`). */
export function primitivesDescriptifPlan(plan, projet, { ecran = false } = {}) {
  void projet;
  if (!descriptifAffiche(plan, { ecran })) return [];
  const d = plan.descriptif;
  const K = D();
  const mp = miseEnPage(d);
  const pos = positionDescriptif(plan);
  const a = aspect(d);
  const prims = [];
  const opt = { couleur: a.couleur, epaisseur: a.couleur ? K.epaisseur_cadre : 0, remplissage: a.fond };
  if (a.couleur || a.fond) prims.push(a.arrondi ? rectArrondi(0, 0, mp.largeur, mp.hauteur, K.rayon_cadre, opt) : rect(0, 0, mp.largeur, mp.hauteur, opt));
  prims.push(...mp.prims);
  return transformer(prims, { x: pos.x, y: pos.y, rotation: 0, echelle: pos.echelle });
}

/* Zone (ligne) du bloc sous un point du plan : { zone, entree?, ligne?, section? } ou null. */
export function cibleDescriptif(plan, p) {
  const b = boiteDescriptif(plan, { ecran: true });
  if (!b || p.x < b.x || p.y < b.y || p.x > b.x + b.l || p.y > b.y + b.h) return null;
  const pos = positionDescriptif(plan);
  const mp = miseEnPage(plan.descriptif);
  const lx = (p.x - pos.x) / pos.echelle, ly = (p.y - pos.y) / pos.echelle;
  const z = mp.zones.find((q) => lx >= q.x && lx <= q.x + q.l && ly >= q.y && ly <= q.y + q.h);
  return z ? z.cible : { zone: 'bloc' };
}

/* ---------- Pages annexes du PDF (§2.11) ---------- */

/* Liste de pages (primitives en unités de page, y vers le bas) au format largeur × hauteur.
 * v1.6.0 §2 (H-307) : marges gauche / droite `marge_laterale_mm`, haut / bas `marge_verticale_mm`. Aucun texte ne sort de
 * la zone utile : en-tête coupé à la largeur utile, colonnes jamais plus étroites que `largeur_min_colonne` — le nombre
 * de colonnes est réduit s'il ne tient pas (défaut de la v1.5.4 corrigé : 3 colonnes à forte échelle débordaient).
 * v1.7.5 (H-359 à H-361) : échelle « ajustée à la feuille » par défaut (plus grande échelle qui tient sur une page,
 * bornée par la charte, une colonne de préférence) ; en-tête de l'affaire en pleine largeur utile, centré sur la feuille ; titre de page à
 * l'échelle du corps. Marges gauche / droite égales : centre de la zone utile = centre de la feuille.
 * v1.7.7 (H-367, H-368) : titre de page non imprimé par défaut (`annexe.titre_pdf_visible`), hauteur rendue à la zone
 * utile ; l'en-tête de l'affaire ouvre la page ; plusieurs pages → folio « n/N » centré dans la marge basse. */
export function zoneUtileAnnexe(largeurPage, hauteurPage) {
  const A = D().annexe;
  const ml = A.marge_laterale_mm * MM, mv = A.marge_verticale_mm * MM;
  return { x: ml, y: mv, l: largeurPage - 2 * ml, h: hauteurPage - 2 * mv };
}

/* Mode d'échelle de la page annexe : 'ajustee' (défaut, valeur absente comprise) | 'bloc' (échelle du bloc du plan). */
export function modeEchelleAnnexe(d) {
  return d && d.echelle_annexe === 'bloc' ? 'bloc' : 'ajustee';
}

/* Bornes de l'échelle ajustée : corps entre `taille_min_mm` (H-116) et `annexe.taille_max_corps_mm` (H-359). */
function bornesAjustement() {
  const K = D();
  const min = (K.taille_min_mm * MM) / K.corps.taille;
  const max = Math.max(min, Math.min(K.echelle_max, (K.annexe.taille_max_corps_mm * MM) / K.corps.taille));
  return { min, max };
}

/* Mise en page complète de l'annexe à une échelle donnée (unités locales = page / ech). */
function disposerAnnexe(d, titre, Z, ech, colonnes = d.colonnes, gouttiereMm = null) {
  const K = D();
  const largeurUtile = Z.l / ech;
  // v1.10.0 §A3 : gouttière fixe en mm papier (A3 paysage : 30 mm), sinon espace entre colonnes du bloc (échelle locale)
  const esp = gouttiereMm !== null ? (gouttiereMm * MM) / ech : K.espace_colonnes;
  let n = Math.max(1, Math.min(3, Number(colonnes) || 1));
  while (n > 1 && n * K.largeur_min_colonne + (n - 1) * esp > largeurUtile + 1e-6) n--;
  const Wc = Math.min(largeurUtile, Math.max(K.largeur_min_colonne, (largeurUtile - (n - 1) * esp) / n));
  // Titre de page (« Affaire — Descriptif — N° ») : une ou plusieurs rangées dans la largeur utile, taille du corps × ech
  const tTitre = K.corps.taille * ech;
  const titreDe = (suffixe) => rendreLigne({ segments: [[{ t: titre + suffixe }]], niveau: 0, puce: '', alignement: 'gauche' }, Z.x, Z.y, Z.l, { taille: tTitre });
  // v1.7.7 (H-367) : titre de page non imprimé (charte) → aucune hauteur réservée, rendue à la zone utile
  const titreVisible = titrePdfVisible();
  const hTitre = titreVisible ? titreDe(' (00/00)').hauteur + K.annexe.ecart_entete_mm * MM : 0;
  const hUtile = Math.max((Z.h - hTitre) / ech, 10);
  // En-tête de l'affaire (commune, affaire, GPS, EDF, SIEEP) : pleine largeur utile, première page seulement
  const entete = elementEntete(d, largeurUtile);
  const hEnteteLoc = entete ? entete.rendre(0, 0).hauteur + K.espace_entrees : 0;
  const els = elements(d, Wc, { entete: false });
  const cols = repartir(els, n, hUtile, Math.max(hUtile - hEnteteLoc, 10));
  const tientEnTete = hEnteteLoc <= hUtile + 1e-6;
  // une page : tout tient, aucun morceau d'entrée coupée, aucun saut de page forcé au-delà de la première
  const coupe = cols.some((c) => c.some((el) => el.morceau));
  return { n, Wc, esp, titreDe, titreVisible, hTitre, entete, hEnteteLoc, cols, unePage: tientEnTete && cols.length <= n && !coupe && largeurUtile >= K.largeur_min_colonne - 1e-6 };
}

/* ---------- v1.10.0 §A3 (H-401 à H-403) : format de l'annexe ---------- */

/* Réglage du format : 'auto' (défaut, valeur absente comprise) | 'a4' | 'a3'. */
export function reglageFormatAnnexe(d) {
  return d && (d.format_annexe === 'a4' || d.format_annexe === 'a3') ? d.format_annexe : 'auto';
}

/* Géométrie d'un format de la charte : { cle, largeur, hauteur, colonnes, gouttiere_mm, libelle }. */
export function geometrieFormat(cle) {
  const F = D().annexe.formats[cle] || D().annexe.formats.a4;
  return { cle: D().annexe.formats[cle] ? cle : 'a4', largeur: F.format_pt[0], hauteur: F.format_pt[1], colonnes: F.colonnes, gouttiere_mm: F.gouttiere_mm, libelle: F.libelle };
}

/* Format déduit des dimensions de page (appels historiques avec largeur × hauteur) : paysage = A3 à 2 colonnes. */
function formatDePage(largeurPage, hauteurPage) {
  return geometrieFormat(largeurPage > hauteurPage ? 'a3' : 'a4');
}

/* Échelle retenue pour la page annexe : { echelle, colonnes, ajustee, une_page }.
 * 'ajustee' : une colonne pleine largeur (titres centrés sur la feuille), plus grande échelle dans les bornes qui tient
 * sur une page ; si une colonne n'y tient qu'au-dessous du corps nominal (2,5 mm), les colonnes du bloc (2 ou 3) quand
 * elles donnent un corps plus grand ; si rien ne tient au corps minimal, corps
 * nominal de la charte (échelle 1) sur plusieurs pages, colonnes du bloc (H-359, H-360). 'bloc' : échelle et colonnes
 * du bloc, plusieurs pages au besoin. */
export function echelleAnnexe(plan, projet, largeurPage, hauteurPage) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  const Z = zoneUtileAnnexe(largeurPage, hauteurPage);
  const titre = titreAnnexe(projet);
  const nBloc = Math.max(1, Math.min(3, Number(d.colonnes) || 1));
  if (modeEchelleAnnexe(d) === 'bloc') {
    const e = echelleDescriptif(d);
    return { echelle: e, colonnes: nBloc, ajustee: false, une_page: disposerAnnexe(d, titre, Z, e, nBloc).unePage };
  }
  // v1.10.0 §A3 (H-401) : plancher de lisibilité — jamais sous le corps nominal (échelle 1). Colonnes et gouttière du
  // format (A4 portrait : 1 colonne ; A3 paysage : 2 colonnes, 30 mm). Agrandissement jusqu'au corps maximal quand tout
  // tient sur une page ; sinon corps nominal sur plusieurs pages.
  const F = formatDePage(largeurPage, hauteurPage);
  const { max } = bornesAjustement();
  const min = Math.max(D().echelle_defaut, bornesAjustement().min);
  const tient = (e) => disposerAnnexe(d, titre, Z, e, F.colonnes, F.gouttiere_mm).unePage;
  const meilleure = () => {
    if (tient(max)) return max;
    if (!tient(min)) return null;
    let bas = min, haut = max;
    for (let k = 0; k < 24 && haut - bas > 0.002; k++) {
      const mid = (bas + haut) / 2;
      if (tient(mid)) bas = mid; else haut = mid;
    }
    return Math.floor(bas * 1000) / 1000;
  };
  const e1 = meilleure();
  void nBloc;
  if (e1 !== null) return { echelle: e1, colonnes: F.colonnes, gouttiere_mm: F.gouttiere_mm, ajustee: true, une_page: true };
  return { echelle: min, colonnes: F.colonnes, gouttiere_mm: F.gouttiere_mm, ajustee: true, une_page: false };
}

/* Format retenu pour l'annexe (export PDF, Calques, éditeur) : { reglage, format, largeur, hauteur, libelle, echelle,
 * colonnes, gouttiere_mm, une_page, nbPages, texte }. « Auto » : un A4 portrait si tout y tient au corps nominal ;
 * sinon un A3 paysage s'il y tient ; sinon A4 portrait sur plusieurs pages. Mode « Échelle du bloc » : A4 portrait,
 * comme avant (le réglage de format ne s'y applique pas, H-401). */
export function choixAnnexe(plan, projet) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  const reglage = modeEchelleAnnexe(d) === 'bloc' ? 'a4' : reglageFormatAnnexe(d);
  const essai = (cle) => { const F = geometrieFormat(cle); const r = echelleAnnexe(plan, projet, F.largeur, F.hauteur); return { F, r }; };
  let x;
  if (reglage === 'auto') {
    const a4 = essai('a4');
    if (a4.r.une_page) x = a4;
    else { const a3 = essai('a3'); x = a3.r.une_page ? a3 : a4; }
  } else x = essai(reglage);
  const disp = dispositionAnnexe(plan, projet, x.F.largeur, x.F.hauteur);
  const nbPages = disp ? disp.nbPages : 1;
  const mode = modeEchelleAnnexe(d) === 'bloc' ? 'bloc' : reglageFormatAnnexe(d);
  const texte = (mode === 'auto' ? 'Auto → ' : '') + x.F.libelle + ', ' + nbPages + ' page' + (nbPages > 1 ? 's' : '');
  return { reglage: mode, format: x.F.cle, largeur: x.F.largeur, hauteur: x.F.hauteur, libelle: x.F.libelle, echelle: x.r.echelle, colonnes: x.r.colonnes, gouttiere_mm: x.r.gouttiere_mm ?? null, une_page: nbPages === 1, nbPages, texte };
}

/* Pages annexes au format retenu : { largeur, hauteur, pages, choix } (pages vides si pas de sortie en annexe). */
export function pagesAnnexeChoisies(plan, projet) {
  const c = choixAnnexe(plan, projet);
  if (!c) return { largeur: 0, hauteur: 0, pages: [], choix: null };
  return { largeur: c.largeur, hauteur: c.hauteur, pages: pagesAnnexe(plan, projet, c.largeur, c.hauteur), choix: c };
}

/* v1.7.7 (H-367) : titre de page imprimé seulement si la charte le demande (`titre_pdf_visible`, false par défaut). */
export function titrePdfVisible() {
  return D().annexe.titre_pdf_visible === true;
}

/* v1.7.7 (H-368) — Folio « n/N » des pages annexes (titre masqué, plusieurs pages) : centré sur la feuille, dans la
 * marge basse, sous la zone utile, noir, taille du corps × échelle retenue. Boîte verticale du texte prise comme
 * [base − taille ; base + 0,3 × taille] (convention de primitives.js → boite). Si la marge basse ne peut pas la
 * contenir, la taille est réduite à ce qu'elle permet (écart à la demande, H-368). Retourne la primitive texte. */
export function folioAnnexe(i, nb, Z, largeurPage, hauteurPage, ech) {
  const mb = hauteurPage - (Z.y + Z.h);
  const tCorps = D().corps.taille * ech;
  const t = Math.min(tCorps, mb / 1.3);
  const base = Z.y + Z.h + (mb - 1.3 * t) / 2 + t;
  return texte(largeurPage / 2, base, i + '/' + nb, { taille: t, couleur: '#000000', ancre: 'milieu' });
}

/* Taille de corps (mm) au-delà de laquelle le folio est réduit pour tenir dans la marge basse (H-368). */
export function corpsMaxFolioMm() {
  return (D().annexe.marge_verticale_mm / 1.3);
}

/* Disposition de la page annexe pour les essais et la fiche Calques : { Z, echelle, colonnes, hTitre, yEntete,
 * titreVisible, nbPages }. Aucun rendu. */
export function dispositionAnnexe(plan, projet, largeurPage, hauteurPage) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  const Z = zoneUtileAnnexe(largeurPage, hauteurPage);
  const { echelle, colonnes, gouttiere_mm } = echelleAnnexe(plan, projet, largeurPage, hauteurPage);
  const L = disposerAnnexe(d, titreAnnexe(projet), Z, echelle, colonnes, gouttiere_mm ?? null);
  return { Z, echelle, colonnes: L.n, hTitre: L.hTitre, yEntete: Z.y + L.hTitre, titreVisible: L.titreVisible, nbPages: Math.max(1, Math.ceil(L.cols.length / L.n)) };
}

function titreAnnexe(projet) {
  const p = projet || {};
  return appliquerFormat(D().annexe.entete, { affaire: p.nom || '', sieep: p.num_sieep || '' });
}

export function pagesAnnexe(plan, projet, largeurPage, hauteurPage) {
  const d = plan && plan.descriptif;
  if (!d || d.visible === false || d.sortie_pdf !== 'annexe') return [];
  const K = D();
  const Z = zoneUtileAnnexe(largeurPage, hauteurPage);
  const { echelle: ech, colonnes, gouttiere_mm } = echelleAnnexe(plan, projet, largeurPage, hauteurPage);
  const L = disposerAnnexe(d, titreAnnexe(projet), Z, ech, colonnes, gouttiere_mm ?? null);
  const { n, Wc, cols } = L;
  const pages = [];
  const nbPages = Math.max(1, Math.ceil(cols.length / n));
  for (let i = 0; i < cols.length; i += n) {
    // v1.7.7 (H-367, H-368) : titre masqué → aucune primitive de titre ; folio « n/N » seul s'il y a plusieurs pages
    const prims = L.titreVisible ? L.titreDe(nbPages > 1 ? ' (' + (i / n + 1) + '/' + nbPages + ')' : '').prims : [];
    let yCol = 0;
    if (i === 0 && L.entete) {
      prims.push(...transformer(L.entete.rendre(0, 0).prims, { x: Z.x, y: Z.y + L.hTitre, rotation: 0, echelle: ech }));
      yCol = L.hEnteteLoc;
    }
    const r = rendreColonnes(cols.slice(i, i + n), 0, yCol, Wc, L.esp);
    prims.push(...transformer(r.prims, { x: Z.x, y: Z.y + L.hTitre, rotation: 0, echelle: ech }));
    if (!L.titreVisible && nbPages > 1) prims.push(folioAnnexe(i / n + 1, nbPages, Z, largeurPage, hauteurPage, ech));
    pages.push(prims);
  }
  return pages;
}

/* Taille minimale de texte du bloc (mm papier), pour le garde-fou de lisibilité. */
export function tailleMinMm(plan) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  return (D().corps.taille * echelleDescriptif(d)) / MM;
}
