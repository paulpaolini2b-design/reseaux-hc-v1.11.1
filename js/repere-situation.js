/* repere-situation.js — v1.10.0 §A1 (H-393 à H-396) : repère d'emprise du plan de situation, rond ou rectangle,
 * déplaçable et orientable. Module pur (aucun DOM) : essais sous Node (v1100.test.mjs).
 *
 * Modèle : `situation.repere = { forme: 'rond' | 'rectangle', lat, lon, diametre_mm, largeur_mm, hauteur_mm, rotation_deg }`.
 * - Le centre est GÉORÉFÉRENCÉ (lat, lon) : sa place sur le plan se recalcule à chaque rendu à partir du centre de la
 *   carte (`situation.lat/lon` = centre de l'image entière), du niveau de tuiles (`situation.zoom`), de la largeur en
 *   pixels de la carte (`situation.largeur_px`) et de la pose de l'image (centre, largeur, rotation). Changer d'échelle
 *   (carte retéléchargée) ou de taille de carte garde donc le repère sur la même zone au sol.
 * - Les dimensions sont en mm PAPIER, comme l'ancien diamètre du rond rouge : elles ne suivent pas l'échelle.
 * - `rotation_deg` (rectangle) : sens horaire, 0 = côtés alignés sur la carte ; l'angle sur la page = rotation de la
 *   carte + rotation du repère.
 * Le repère n'est qu'un dessin : le point GPS de l'affaire, le QR code et l'indication d'échelle n'en dépendent pas.
 */
import { CHARTE, MM } from './charte.js';
import { rectangleVisibleDe } from './forme-calcul.js';
import { cercle, poly } from './primitives.js';

const S = () => CHARTE.situation;
const R = () => CHARTE.situation.repere;
const nb = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const borner = (v, min, max) => Math.min(max, Math.max(min, v));

/* ---------- Web Mercator ---------- */

/* Pixels « monde » au niveau z : même calcul que situation.js → pixelsMonde (recopié ici pour que modele.js puisse
 * importer ce module sans cycle d'imports ; égalité vérifiée par v1100.test.mjs). */
export function pixelsMonde(lat, lon, z) {
  const n = 256 * Math.pow(2, z);
  const phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n
  };
}

/* Pixels « monde » Web Mercator au niveau z (256 px par tuile) → { lat, lon }. Inverse exact de situation.js →
 * pixelsMonde (dans la plage de latitudes de la projection). */
export function latLonDepuisPixelsMonde(x, y, z) {
  const n = 256 * Math.pow(2, z);
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}

/* ---------- Lecture et bornes ---------- */

export function bornerDiametre(d) {
  const K = S().rond;
  return borner(Number.isFinite(nb(d)) ? nb(d) : K.diametre_mm, K.diametre_min_mm, K.diametre_max_mm);
}
export function bornerCote(c, defaut = S().rond.diametre_mm) {
  return borner(Number.isFinite(nb(c)) ? nb(c) : defaut, R().cote_min_mm, R().cote_max_mm);
}
export function normaliserAngle(a) {
  const v = Number.isFinite(nb(a)) ? nb(a) : 0;
  return ((v % 360) + 360) % 360;
}
const arrondi = (v, pas = R().pas_mm) => Math.round(v / pas) * pas;

/* Repère par défaut d'un plan de situation : rond centré sur le centre de la carte, diamètre de l'ancien champ. */
export function repereParDefaut(st) {
  const d = bornerDiametre(st && st.diametre_mm);
  return { forme: 'rond', lat: Number(st && st.lat), lon: Number(st && st.lon), diametre_mm: d, largeur_mm: d, hauteur_mm: d, rotation_deg: 0 };
}

/* Migration (schéma 20) et lecture tolérante : complète `situation.repere` sans rien changer à l'aspect. Idempotente.
 * Retourne true si quelque chose a été écrit. */
export function migrerRepere(o) {
  const st = o && o.situation;
  if (!st || typeof st !== 'object') return false;
  const avant = JSON.stringify(st.repere ?? null);
  const def = repereParDefaut(st);
  const r = st.repere && typeof st.repere === 'object' ? st.repere : {};
  const res = {
    forme: r.forme === 'rectangle' ? 'rectangle' : 'rond',
    lat: Number.isFinite(nb(r.lat)) ? nb(r.lat) : def.lat,
    lon: Number.isFinite(nb(r.lon)) ? nb(r.lon) : def.lon,
    diametre_mm: Number.isFinite(nb(r.diametre_mm)) ? bornerDiametre(r.diametre_mm) : def.diametre_mm,
    largeur_mm: Number.isFinite(nb(r.largeur_mm)) ? bornerCote(r.largeur_mm) : def.largeur_mm,
    hauteur_mm: Number.isFinite(nb(r.hauteur_mm)) ? bornerCote(r.hauteur_mm) : def.hauteur_mm,
    rotation_deg: normaliserAngle(r.rotation_deg)
  };
  st.repere = res;
  return JSON.stringify(res) !== avant;
}

/* Repère lu (jamais écrit) : celui de l'objet, sinon le repère par défaut. */
export function lireRepere(o) {
  const st = o && o.situation;
  if (!st) return null;
  if (!st.repere || typeof st.repere !== 'object') return repereParDefaut(st);
  const c = { situation: { ...st, repere: { ...st.repere } } };
  migrerRepere(c);
  return c.situation.repere;
}

/* ---------- Géoréférencement ---------- */

/* Unités plan par pixel de la carte (pixel = pixel monde au niveau de la carte). */
function unitesParPixel(o) {
  const st = o.situation;
  const px = Number(st.largeur_px) > 0 ? Number(st.largeur_px) : S().largeur_px_v154;
  return (o.largeur || 0) / px;
}
function georeferencable(o) {
  const st = o && o.situation;
  return !!st && Number.isFinite(nb(st.lat)) && Number.isFinite(nb(st.lon)) && Number.isFinite(nb(st.zoom)) && o.largeur > 0;
}

/* (lat, lon) → point du plan, carte posée (centre de l'image entière, largeur, rotation). Point identique au centre de
 * la carte quand lat / lon sont ceux de la carte (aucun écart d'arrondi : rendu de la v1.9.0 conservé). */
export function planDepuisLatLon(o, lat, lon) {
  const st = o.situation;
  if (!georeferencable(o) || (Number(lat) === Number(st.lat) && Number(lon) === Number(st.lon))) return { x: o.x, y: o.y };
  const z = Number(st.zoom);
  const c = pixelsMonde(Number(st.lat), Number(st.lon), z), p = pixelsMonde(Number(lat), Number(lon), z);
  const k = unitesParPixel(o);
  const dx = (p.x - c.x) * k, dy = (p.y - c.y) * k;
  const a = ((o.rotation || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return { x: o.x + dx * cos - dy * sin, y: o.y + dx * sin + dy * cos };
}

/* Point du plan → (lat, lon), inverse de planDepuisLatLon. */
export function latLonDepuisPlan(o, p) {
  const st = o.situation;
  if (!georeferencable(o)) return { lat: Number(st && st.lat), lon: Number(st && st.lon) };
  const z = Number(st.zoom);
  const c = pixelsMonde(Number(st.lat), Number(st.lon), z);
  const k = unitesParPixel(o) || 1;
  const a = (-(o.rotation || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const vx = p.x - o.x, vy = p.y - o.y;
  const lx = (vx * cos - vy * sin) / k, ly = (vx * sin + vy * cos) / k;
  return latLonDepuisPixelsMonde(c.x + lx, c.y + ly, z);
}

/* ---------- Géométrie sur le plan ---------- */

/* { forme, centre {x,y}, r (rond), l, h (rectangle, unités plan), rotation (degrés sur la page), coins [hg, hd, bd, bg] } */
export function geometrieRepere(o) {
  const rep = lireRepere(o);
  if (!rep) return null;
  const centre = planDepuisLatLon(o, rep.lat, rep.lon);
  if (rep.forme === 'rond') return { forme: 'rond', rep, centre, r: (rep.diametre_mm * MM) / 2, rotation: 0 };
  const l = rep.largeur_mm * MM, h = rep.hauteur_mm * MM;
  const rotation = normaliserAngle((o.rotation || 0) + rep.rotation_deg);
  const a = (rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const coins = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = (sx * l) / 2, y = (sy * h) / 2;
    return { x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos };
  });
  return { forme: 'rectangle', rep, centre, l, h, rotation, coins };
}

/* Contour du repère (polyligne fermée, plan) : rectangle = 4 coins ; rond = polygone de `segments_rond` côtés. */
function contour(g) {
  if (g.forme === 'rectangle') return g.coins;
  const n = R().segments_rond, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ x: g.centre.x + g.r * Math.cos(a), y: g.centre.y + g.r * Math.sin(a) }); }
  return pts;
}

/* Rectangle visible de la carte (après rognage) et passage dans son repère local (axes de la carte, origine au centre). */
function cadreVisible(o) {
  const v = rectangleVisibleDe(o.x, o.y, o.largeur || 0, o.hauteur || 0, o.rotation || 0, o.recadrage);
  const a = (-(o.rotation || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const versLocal = (p) => { const dx = p.x - v.cx, dy = p.y - v.cy; return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }; };
  const b = (o.rotation || 0) * Math.PI / 180, cb = Math.cos(b), sb = Math.sin(b);
  const versPlan = (p) => ({ x: v.cx + p.x * cb - p.y * sb, y: v.cy + p.x * sb + p.y * cb });
  return { v, versLocal, versPlan };
}

/* Découpe d'un segment [p, q] par la boîte |x| ≤ hx, |y| ≤ hy (Liang–Barsky). Retourne [t0, t1] ou null. */
function couperSegment(p, q, hx, hy) {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const tests = [[-dx, p.x + hx], [dx, hx - p.x], [-dy, p.y + hy], [dy, hy - p.y]];
  for (const [pp, qq] of tests) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}

/* Polylignes visibles d'un contour fermé (repère local) dans la boîte. Retourne { morceaux: [[pts]], entier: bool }. */
export function couperContour(pts, hx, hy) {
  const eps = 1e-9;
  const n = pts.length;
  const morceaux = [];
  let courant = null, entier = true;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const t = couperSegment(p, q, hx + eps, hy + eps);
    if (!t) { entier = false; if (courant) { morceaux.push(courant); courant = null; } continue; }
    const a = { x: p.x + (q.x - p.x) * t[0], y: p.y + (q.y - p.y) * t[0] };
    const b = { x: p.x + (q.x - p.x) * t[1], y: p.y + (q.y - p.y) * t[1] };
    if (t[0] > eps) { entier = false; if (courant) { morceaux.push(courant); courant = null; } }
    if (!courant) courant = [a];
    courant.push(b);
    if (t[1] < 1 - eps) { entier = false; morceaux.push(courant); courant = null; }
  }
  if (courant) {
    // le dernier morceau rejoint le premier s'il se ferme au point 0
    if (morceaux.length && !entier && morceaux[0][0].x === pts[0].x && morceaux[0][0].y === pts[0].y) morceaux[0] = [...courant, ...morceaux[0].slice(1)];
    else morceaux.push(courant);
  }
  return { morceaux: morceaux.filter((m) => m.length >= 2), entier };
}

/* Situation du repère par rapport au cadre visible de la carte : 'dedans' | 'partiel' | 'dehors'. */
export function placeRepere(o) {
  const g = geometrieRepere(o);
  if (!g) return null;
  const { v, versLocal } = cadreVisible(o);
  const hx = v.l / 2, hy = v.h / 2;
  if (g.forme === 'rond') {
    const c = versLocal(g.centre);
    if (Math.abs(c.x) + g.r <= hx + 1e-9 && Math.abs(c.y) + g.r <= hy + 1e-9) return 'dedans';
  }
  const r = couperContour(contour(g).map(versLocal), hx, hy);
  if (r.entier) return 'dedans';
  return r.morceaux.length ? 'partiel' : 'dehors';
}

/* Primitives du repère, limitées au cadre visible de la carte (rognage respecté). Fond transparent ; couleur et
 * épaisseur du rond rouge de la charte (rectangle compris). Rond entièrement visible : un cercle exact (primitive de la
 * v1.9.0). Sinon : morceaux de contour découpés au cadre. Hors de la carte : rien. */
export function primitivesRepere(o) {
  const g = geometrieRepere(o);
  if (!g) return [];
  const K = S().rond;
  const style = { couleur: K.couleur, epaisseur: K.epaisseur_mm * MM, remplissage: null };
  const { v, versLocal, versPlan } = cadreVisible(o);
  const hx = v.l / 2, hy = v.h / 2;
  if (g.forme === 'rond') {
    const c = versLocal(g.centre);
    if (Math.abs(c.x) + g.r <= hx + 1e-9 && Math.abs(c.y) + g.r <= hy + 1e-9) return [cercle(g.centre.x, g.centre.y, g.r, style)];
  }
  const r = couperContour(contour(g).map(versLocal), hx, hy);
  if (r.entier) return [poly(contour(g), { ferme: true, ...style, joint: g.forme === 'rectangle' ? 'miter' : undefined })];
  return r.morceaux.map((m) => poly(m.map(versPlan), { ferme: false, ...style, joint: g.forme === 'rectangle' ? 'miter' : undefined, extremite: 'nette' }));
}

/* Distance d'un point du plan au contour du repère (unités plan). */
export function distanceContour(o, p) {
  const g = geometrieRepere(o);
  if (!g) return Infinity;
  if (g.forme === 'rond') return Math.abs(Math.hypot(p.x - g.centre.x, p.y - g.centre.y) - g.r);
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = g.coins[i], b = g.coins[(i + 1) % 4];
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/* Appui sur le contour du repère ? Seule la partie visible (cadre de la carte élargi de la tolérance) compte. */
export function surContourRepere(o, p, tol) {
  if (!o || !o.situation) return false;
  if (distanceContour(o, p) > tol) return false;
  const { v, versLocal } = cadreVisible(o);
  const q = versLocal(p);
  return Math.abs(q.x) <= v.l / 2 + tol && Math.abs(q.y) <= v.h / 2 + tol;
}

/* ---------- Modifications (toutes suivies de valider() par l'appelant) ---------- */

/* Écrit le repère et garde `situation.diametre_mm` aligné sur le rond (versions antérieures partageant la base). */
function ecrire(o, rep) {
  o.situation.repere = rep;
  if (rep.forme === 'rond') o.situation.diametre_mm = rep.diametre_mm;
  return rep;
}

/* Place le centre du repère sur un point du plan. */
export function placerCentre(o, p) {
  const rep = lireRepere(o);
  const ll = latLonDepuisPlan(o, p);
  return ecrire(o, { ...rep, lat: ll.lat, lon: ll.lon });
}

/* Recentre le repère sur le point GPS de la carte (centre de l'image entière). */
export function recentrerRepere(o) {
  const rep = lireRepere(o);
  return ecrire(o, { ...rep, lat: Number(o.situation.lat), lon: Number(o.situation.lon) });
}

/* Change de forme : rond → carré de côté = diamètre, rotation 0 ; rectangle → rond de diamètre = plus grand côté
 * (l'emprise reste couverte, au plafond du diamètre près). */
export function changerForme(o, forme) {
  const rep = lireRepere(o);
  if (forme === rep.forme) return rep;
  if (forme === 'rectangle') return ecrire(o, { ...rep, forme: 'rectangle', largeur_mm: bornerCote(rep.diametre_mm), hauteur_mm: bornerCote(rep.diametre_mm), rotation_deg: 0 });
  return ecrire(o, { ...rep, forme: 'rond', diametre_mm: bornerDiametre(Math.max(rep.largeur_mm, rep.hauteur_mm)) });
}

/* Réglage numérique de la fiche : diametre_mm | largeur_mm | hauteur_mm | rotation_deg. Retourne true si changé. */
export function reglerRepere(o, champ, valeur) {
  const rep = lireRepere(o);
  const v = nb(String(valeur ?? '').replace(',', '.'));
  if (!Number.isFinite(v)) return false;
  const n = { ...rep };
  if (champ === 'diametre_mm') n.diametre_mm = bornerDiametre(arrondi(v));
  else if (champ === 'largeur_mm') n.largeur_mm = bornerCote(arrondi(v));
  else if (champ === 'hauteur_mm') n.hauteur_mm = bornerCote(arrondi(v));
  else if (champ === 'rotation_deg') n.rotation_deg = normaliserAngle(Math.round(v));
  else return false;
  if (JSON.stringify(n) === JSON.stringify(rep)) return false;
  ecrire(o, n);
  return true;
}

/* Bouton « Carré » : hauteur = largeur. */
export function rendreCarre(o) {
  const rep = lireRepere(o);
  if (rep.forme !== 'rectangle' || rep.hauteur_mm === rep.largeur_mm) return false;
  ecrire(o, { ...rep, hauteur_mm: rep.largeur_mm });
  return true;
}

/* Rotation ajoutée (touche R : +90°). */
export function tournerRepere(o, deg) {
  const rep = lireRepere(o);
  if (rep.forme !== 'rectangle') return false;
  ecrire(o, { ...rep, rotation_deg: normaliserAngle(rep.rotation_deg + deg) });
  return true;
}

/* Diamètre depuis la poignée : 2 × distance du pointeur au centre du repère, pas de 0,5 mm. */
export function diametreDepuisPoint(o, p) {
  const g = geometrieRepere(o);
  const rep = lireRepere(o);
  const d = (2 * Math.hypot(p.x - g.centre.x, p.y - g.centre.y)) / MM;
  return ecrire(o, { ...rep, diametre_mm: bornerDiametre(arrondi(d)) });
}

/* Poignée d'angle : le coin opposé reste fixe, redimensionnement libre (sans conserver les proportions). `coin` 0..3
 * (hg, hd, bd, bg), `fixe` = coin opposé au début du geste (plan), `p` = pointeur (plan). */
export function redimensionnerDepuisCoin(o, fixe, p) {
  const rep = lireRepere(o);
  const rot = normaliserAngle((o.rotation || 0) + rep.rotation_deg);
  const a = (-rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = p.x - fixe.x, dy = p.y - fixe.y;
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
  const l = bornerCote(arrondi(Math.abs(lx) / MM)), h = bornerCote(arrondi(Math.abs(ly) / MM));
  // centre = coin fixe + demi-diagonale dans le sens du pointeur (dimensions bornées)
  const sx = lx < 0 ? -1 : 1, sy = ly < 0 ? -1 : 1;
  const cxL = (sx * l * MM) / 2, cyL = (sy * h * MM) / 2;
  const b = (rot * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  const centre = { x: fixe.x + cxL * cb - cyL * sb, y: fixe.y + cxL * sb + cyL * cb };
  const ll = latLonDepuisPlan(o, centre);
  return ecrire(o, { ...rep, lat: ll.lat, lon: ll.lon, largeur_mm: l, hauteur_mm: h });
}

/* Rotation depuis la poignée : angle sur la page `angleTotal` (degrés) → rotation du repère relative à la carte. */
export function rotationDepuisAngle(o, angleTotal) {
  const rep = lireRepere(o);
  return ecrire(o, { ...rep, rotation_deg: normaliserAngle(Math.round(angleTotal) - (o.rotation || 0)) });
}

/* Le centre du repère est-il resté au point GPS de la carte (jamais déplacé) ? */
export function repereAuPointGps(o) {
  const rep = lireRepere(o);
  return !!rep && Math.abs(rep.lat - Number(o.situation.lat)) < 1e-9 && Math.abs(rep.lon - Number(o.situation.lon)) < 1e-9;
}

/* Message de la fiche : repère hors de la carte, ou en partie. */
export function alerteRepere(o) {
  const p = placeRepere(o);
  if (p === 'dehors') return 'Repère hors de la carte : il n’est pas imprimé (le déplacer ou « Recentrer sur le point GPS »).';
  if (p === 'partiel') return 'Repère en partie hors de la carte : seule la partie visible est imprimée.';
  return '';
}
