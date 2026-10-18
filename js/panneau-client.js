/* panneau-client.js — v1.10.0 §A4 (H-404 à H-408) : panneau d'information client.
 *
 * Réglages par page (`plan.panneau_client`, null = absent : au plus un par page), données au niveau du projet
 * (`projet.client` { beneficiaire, adresse, telephone }) : le formulaire « Informations de l'affaire » et la fiche du
 * panneau éditent les mêmes données. Mécanismes de la légende : position (null = coin haut-gauche de la page), poignée
 * d'échelle, cadre, fond ; « Imprimer le panneau » décoché = visible à l'écran, absent des exports.
 * Champ vide : ligne absente des exports, « à renseigner » en gris à l'écran seulement.
 * Objet de mise en page : hors descriptif, métré, légende, contrôle « à compléter » et reportage (il n'est pas dans
 * `plan.objets`). Tout est décrit en primitives : écran, PDF et PNG projettent la même géométrie.
 */
import { CHARTE, MM } from './charte.js';
import { texte, rect, transformer, mesurerTexte } from './primitives.js';
import { rectArrondi } from './symboles.js';
import { etenduePlan } from './vue.js';
import { normaliserClient, formaterTelephone } from './modele.js';
import { decalageCentrage } from './forme-calcul.js';

const K = () => CHARTE.panneau_client;
const CHAMPS = ['beneficiaire', 'adresse', 'telephone'];

/* Panneau présent sur la page ? `ecran` : même s'il n'est pas imprimé. */
export function panneauAffiche(plan, { ecran = false } = {}) {
  const pc = plan && plan.panneau_client;
  if (!pc || pc.visible === false) return false;
  return ecran || pc.imprimer !== false;
}

export function titrePanneau(pc) {
  const t = pc && typeof pc.titre === 'string' ? pc.titre.replace(/\s+/g, ' ').trim() : '';
  return pc && pc.titre !== null && pc.titre !== undefined ? t : K().titre_defaut;
}

/* Valeur affichée d'un champ (téléphone mis en forme). */
export function valeurChamp(client, champ) {
  const c = normaliserClient(client);
  if (champ === 'telephone') return formaterTelephone(c.telephone);
  if (champ === 'adresse') return c.adresse.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return c[champ].replace(/\s+/g, ' ').trim();
}

/* Coupe une suite de morceaux { t, g, i, c } en rangées de largeur `largeur` (mots trop longs coupés au caractère). */
function rangees(morceaux, largeur, taille) {
  const mots = [];
  for (const m of morceaux) for (const p of String(m.t).split(/( +)/)) if (p) mots.push({ ...m, t: p, espace: /^ +$/.test(p) });
  const mesure = (m) => mesurerTexte(m.t, taille, { gras: !!m.g, italique: !!m.i });
  const res = [];
  let cur = [], l = 0;
  const pousser = () => { while (cur.length && cur[cur.length - 1].espace) { l -= cur[cur.length - 1].l; cur.pop(); } res.push(cur); cur = []; l = 0; };
  for (const m0 of mots) {
    let liste = [{ ...m0, l: mesure(m0) }];
    if (!m0.espace && liste[0].l > largeur) {
      liste = []; let t = '';
      for (const ch of m0.t) { const e = t + ch; if (t && mesurerTexte(e, taille, { gras: !!m0.g, italique: !!m0.i }) > largeur) { liste.push({ ...m0, t }); t = ch; } else t = e; }
      if (t) liste.push({ ...m0, t });
      liste = liste.map((x) => ({ ...x, l: mesure(x) }));
    }
    for (const m of liste) {
      if (m.espace && !cur.length) continue;
      if (!m.espace && cur.length && l + m.l > largeur + 1e-6) pousser();
      cur.push(m); l += m.l;
    }
  }
  if (cur.length || !res.length) pousser();
  return res;
}

/* Mise en page locale (échelle 1, origine au coin haut-gauche) : { largeur, hauteur, prims }. */
export function miseEnPagePanneau(pc, client, { ecran = false } = {}) {
  const C = K();
  const W = (Number(pc.largeur_mm) || C.largeur_mm) * MM;
  const m = C.marge, tl = C.taille_texte, hL = tl * C.interligne;
  const utile = Math.max(tl * 4, W - 2 * m);
  const prims = [];
  let y = m;
  const titre = titrePanneau(pc);
  if (titre) {
    for (const r of rangees([{ t: titre, g: true }], utile, C.taille_titre)) {
      const lr = r.reduce((s, x) => s + x.l, 0);
      let x = m + (utile - lr) / 2;
      for (const mo of r) { if (!mo.espace) prims.push(texte(x, y + C.taille_titre * 0.95, mo.t, { taille: C.taille_titre, couleur: '#000000', gras: true })); x += mo.l; }
      y += C.taille_titre * C.interligne;
    }
    y += C.ecart_titre;
  }
  for (const champ of CHAMPS) {
    const v = valeurChamp(client, champ);
    if (!v && !ecran) continue;   // champ vide : absent des exports
    const lib = { t: C.libelles[champ] + ' ', g: true };
    const paragraphes = v ? v.split('\n') : [null];
    paragraphes.forEach((par, i) => {
      const morceaux = i === 0 ? [lib] : [];
      if (par === null) morceaux.push({ t: C.a_renseigner, i: true, c: C.couleur_vide });
      else morceaux.push({ t: par });
      for (const r of rangees(morceaux, utile, tl)) {
        let x = m;
        for (const mo of r) {
          if (!mo.espace) prims.push(texte(x, y + tl * 0.95, mo.t, { taille: tl, couleur: mo.c || '#000000', gras: mo.g || undefined, italique: mo.i || undefined }));
          x += mo.l;
        }
        y += hL;
      }
    });
  }
  return { largeur: W, hauteur: y + m - (y > m ? 0 : 0), prims };
}

/* Position et dimensions (unités plan) ; position null = coin haut-gauche de la page. */
export function positionPanneauClient(plan, projet, { ecran = true } = {}) {
  const pc = plan && plan.panneau_client;
  if (!pc) return null;
  const C = K();
  const ech = Math.min(C.echelle_max, Math.max(C.echelle_min, Number(pc.echelle) || 1));
  const mp = miseEnPagePanneau(pc, projet && projet.client, { ecran });
  const l = mp.largeur * ech, h = mp.hauteur * ech;
  if (pc.x !== null && pc.x !== undefined && pc.y !== null && pc.y !== undefined) return { x: pc.x, y: pc.y, l, h, echelle: ech };
  const e = etenduePlan(plan);
  return { x: e.x + C.marge_bord, y: e.y + C.marge_bord, l, h, echelle: ech };
}

export function boitePanneauClient(plan, projet, opts = { ecran: true }) {
  if (!panneauAffiche(plan, opts)) return null;
  const p = positionPanneauClient(plan, projet, opts);
  return p ? { x: p.x, y: p.y, l: p.l, h: p.h } : null;
}

function aspect(pc) {
  const C = K(), T = CHARTE.texte;
  const cadre = pc.cadre || C.cadre_defaut, fond = pc.fond || C.fond_defaut;
  return {
    couleur: cadre === 'aucun' ? null : (pc.couleur_cadre || C.couleur_cadre_defaut),
    arrondi: cadre === 'arrondi',
    fond: fond === 'transparent' ? null : (fond === 'translucide' ? T.fond_etiquette : '#FFFFFF')
  };
}

/* Primitives du panneau. `ecran` : panneau non imprimé dessiné quand même, champs vides « à renseigner » en gris. */
export function primitivesPanneauClient(plan, projet, { ecran = false } = {}) {
  if (!panneauAffiche(plan, { ecran })) return [];
  const pc = plan.panneau_client, C = K();
  const mp = miseEnPagePanneau(pc, projet && projet.client, { ecran });
  const pos = positionPanneauClient(plan, projet, { ecran });
  const a = aspect(pc);
  const prims = [];
  const opt = { couleur: a.couleur, epaisseur: a.couleur ? C.epaisseur_cadre : 0, remplissage: a.fond };
  if (a.couleur || a.fond) prims.push(a.arrondi ? rectArrondi(0, 0, mp.largeur, mp.hauteur, C.rayon_cadre, opt) : rect(0, 0, mp.largeur, mp.hauteur, opt));
  prims.push(...mp.prims);
  return transformer(prims, { x: pos.x, y: pos.y, rotation: 0, echelle: pos.echelle });
}

/* Champs vides (fiche : « à renseigner »). */
export function champsVides(client) {
  return CHAMPS.filter((c) => !valeurChamp(client, c));
}

/* ---------- v1.11.0 §B5 (H-422) : centrage sur la page ---------- */

/* Boîte retenue pour le centrage : imprimée si « Imprimer » est coché (les lignes « à renseigner » de l'écran n'entrent
 * pas en compte : le PDF est centré), écran sinon. Coin haut-gauche = ancrage du panneau. */
export function boitePanneauCentrage(plan, projet) {
  const pc = plan && plan.panneau_client;
  if (!pc) return null;
  const p = positionPanneauClient(plan, projet, { ecran: pc.imprimer === false });
  return p ? { x: p.x, y: p.y, l: p.l, h: p.h } : null;
}

/* Position (coin haut-gauche) qui centre le panneau sur la page `pg` : { x, y, deja } ; `deja` = rien ne bouge. */
export function positionCentree(plan, projet, pg, sens = 'les_deux') {
  const b = boitePanneauCentrage(plan, projet);
  if (!b) return null;
  const d = decalageCentrage(b, pg, sens);
  return { x: b.x + d.dx, y: b.y + d.dy, deja: Math.abs(d.dx) < 1e-6 && Math.abs(d.dy) < 1e-6 };
}
