/* ui/legende.js — v1.10.0 §A2 (H-397 à H-400) : éditeur de la légende, sur le modèle de l'éditeur du descriptif.
 *
 * Ouvert par un double appui sur la légende ou par le menu contextuel → « Modifier la légende ». La légende reste
 * générée depuis les symboles réellement utilisés ; l'éditeur ne stocke que des retouches (`plan.legende.titre`,
 * `surcharges`, `ajouts`, `ordre`), conservées à chaque mise à jour du plan. Chaque geste passe par valider()
 * (Ctrl+Z / Ctrl+Y). Consultation d'un archivé : lecture seule.
 */
import { etat, sur, objets, notifier, peutModifier, signalerLectureSeule } from '../etat.js';
import { CHARTE } from '../charte.js';
import { valider } from '../historique.js';
import { genererId, retouchesLegendeParDefaut } from '../modele.js';
import { lignesLegende, catalogueEchantillons, groupeEchantillon, titreLegende, echantillonTroncon } from '../legende.js';
import { echantillonSymbole, primitivesFourreau } from '../symboles.js';
import { boite, transformer } from '../primitives.js';
import { primVersSvg } from '../rendu-svg.js';
import { echapper, confirmer, ouvrirDialogue } from './dialogues.js';

const NS = 'http://www.w3.org/2000/svg';
let dlg = null;

export function initialiserEditeurLegende() {
  sur('ouvrir-legende', () => ouvrirEditeurLegende());
  sur('objets', () => { if (dlg && dlg.open && !dlg.dataset.saisie) rendre(); });
  sur('plan-change', () => { if (dlg && dlg.open) dlg.close(); });
  sur('projet-ferme', () => { if (dlg && dlg.open) dlg.close(); });
}

const leg = () => (etat.plan ? etat.plan.legende : null);
const ro = () => !peutModifier();

/* Retouches assurées (plan créé avant le schéma 20 et pas encore migré en mémoire). */
function retouches() {
  const g = leg();
  const d = retouchesLegendeParDefaut();
  for (const k of Object.keys(d)) if (g[k] === undefined) g[k] = d[k];
  return g;
}

export function ouvrirEditeurLegende() {
  if (!etat.plan || !leg()) return;
  dlg = ouvrirDialogue('dlg-legende', '<form class="dialogue editeur-legende" novalidate></form>');
  rendre();
}

/* Aperçu SVG d'un échantillon (mêmes primitives que la légende). */
function apercu(e) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'apercu-legende');
  if (!e) { svg.setAttribute('viewBox', '0 0 40 14'); return svg; }
  const L = CHARTE.legende;
  let prims;
  if (e.type === 'troncon') prims = echantillonTroncon(e.domaine, e.pose, e.etat, 0, L.longueur_echantillon, 0);
  else if (e.type === 'fourreau') prims = primitivesFourreau({ type: 'fourreau', etat: e.etat, echelle_symbole: 1, troncon_id: null, attributs: { matiere: e.matiere }, points: [{ x: 0, y: 0 }, { x: L.longueur_echantillon, y: 0 }] });
  else prims = transformer(echantillonSymbole(e.typeObjet, e.etat, e.attributs, e.domaine || 'BTS', e.pose || 'aerien'), { x: L.longueur_echantillon / 2, y: 0, rotation: 0, echelle: 0.85 });
  const b = boite(prims) || { x: 0, y: -5, l: 38, h: 10 };
  const m = 2;
  svg.setAttribute('viewBox', `${b.x - m} ${b.y - m} ${b.l + 2 * m} ${b.h + 2 * m}`);
  for (const p of prims) { const el = primVersSvg(p); if (el) svg.appendChild(el); }
  return svg;
}

/* <select> du catalogue complet, groupé ; `courant` = clé choisie (ou '' = texte seul). */
function optionsEchantillons(courant) {
  const groupes = new Map();
  for (const e of catalogueEchantillons().values()) {
    const g = groupeEchantillon(e);
    if (!groupes.has(g)) groupes.set(g, []);
    groupes.get(g).push(e);
  }
  return `<option value="" ${!courant ? 'selected' : ''}>Aucun (texte seul)</option>`
    + [...groupes.entries()].map(([g, l]) => `<optgroup label="${echapper(g)}">${l.map((e) => `<option value="${echapper(e.cle)}" ${e.cle === courant ? 'selected' : ''}>${echapper(e.libelle)}</option>`).join('')}</optgroup>`).join('');
}

function rendre() {
  if (!dlg || !dlg.open || !leg()) return;
  const form = dlg.querySelector('form');
  const liste = form.querySelector('.lignes-legende');
  const scroll = liste ? liste.scrollTop : 0;
  const g = leg();
  const lignes = lignesLegende(etat.plan, objets());
  const lecture = ro();
  const titre = g.titre === null || g.titre === undefined ? '' : g.titre;
  form.innerHTML = `
    <h2>Légende${lecture ? ' <span class="pastille-statut">consultation</span>' : ''}</h2>
    <label class="case"><input type="checkbox" name="titre-visible" ${g.titre === '' ? '' : 'checked'} ${lecture ? 'disabled' : ''}> Afficher le titre</label>
    <label>Titre<input name="titre" value="${echapper(titre)}" placeholder="${echapper(CHARTE.legende.titre_defaut)}" ${lecture || g.titre === '' ? 'disabled' : ''} autocomplete="off"></label>
    <div class="aide">Champ vide : « ${echapper(CHARTE.legende.titre_defaut)} ».</div>
    <h3>Lignes</h3>
    <div class="lignes-legende" role="list">
      ${lignes.length ? '' : '<p class="vide">Aucun symbole sur ce plan et aucune ligne ajoutée.</p>'}
    </div>
    ${lecture ? '' : `
    <h3>Ajouter une ligne</h3>
    <div class="ajout-legende">
      <label>Échantillon<select name="nouvel-echantillon">${optionsEchantillons('')}</select></label>
      <label>Libellé<input name="nouveau-libelle" autocomplete="off" placeholder="Texte de la ligne"></label>
      <button type="button" class="btn" data-a="ajouter">Ajouter</button>
    </div>`}
    <div class="aide">Les lignes automatiques suivent les symboles du plan : une ligne retouchée garde sa retouche (✎) même si le symbole disparaît puis revient. Glisser ⠿ pour réordonner.</div>
    <div class="boutons">
      ${lecture ? '' : '<button type="button" class="btn btn-danger" data-a="reinit-tout">Réinitialiser la légende</button>'}
      <button type="button" class="btn btn-primaire" data-a="fermer">Fermer</button>
    </div>`;
  const zone = form.querySelector('.lignes-legende');
  for (const l of lignes) zone.appendChild(ligneHtml(l, lecture));
  zone.scrollTop = scroll;
  brancher(form);
}

function ligneHtml(l, lecture) {
  const div = document.createElement('div');
  div.className = 'ligne-legende' + (l.masquee ? ' masquee' : '') + (l.auto ? '' : ' ajoutee');
  div.dataset.id = l.id;
  div.setAttribute('role', 'listitem');
  div.innerHTML = `
    ${lecture ? '' : '<span class="poignee-desc" data-a="glisser" title="Glisser pour réordonner">⠿</span>'}
    <label class="case" title="Afficher la ligne"><input type="checkbox" data-champ="afficher" ${l.masquee ? '' : 'checked'} ${lecture || !l.auto ? 'disabled' : ''}></label>
    <span class="ech"></span>
    <input class="libelle-legende" data-champ="libelle" value="${echapper(l.libelle)}" ${lecture ? 'disabled' : ''} autocomplete="off" placeholder="${echapper(l.auto ? l.libelle_auto : CHARTE.legende.ligne_vide_ecran)}">
    ${l.modifiee ? '<span class="marque-manuelle" title="Modifié à la main">✎</span>' : ''}
    ${lecture ? '' : (l.auto
      ? `<button type="button" class="btn-mini" data-a="reinit-ligne" ${l.modifiee ? '' : 'disabled'} title="Rétablir la ligne automatique">↺</button>`
      : `<select data-champ="echantillon" title="Échantillon">${optionsEchantillons(l.cle_echantillon)}</select>
         <button type="button" class="btn-mini" data-a="supprimer-ligne" title="Supprimer la ligne">✕</button>`)}
    ${l.auto && l.modifiee && l.libelle !== l.libelle_auto ? `<div class="aide auto-legende">Automatique : ${echapper(l.libelle_auto)}</div>` : ''}`;
  div.querySelector('.ech').appendChild(apercu(l.echantillon));
  return div;
}

function garde() { if (!ro()) return true; signalerLectureSeule(); return false; }

/* Ordre courant des lignes (ids), écrit tel quel au premier réordonnancement. */
function ordreCourant() { return lignesLegende(etat.plan, objets()).map((l) => l.id); }

function brancher(form) {
  const g = () => retouches();
  form.querySelector('[data-a="fermer"]').addEventListener('click', () => dlg.close());
  const t = form.querySelector('[name="titre"]');
  if (t) t.addEventListener('change', () => {
    if (!garde()) return;
    const v = t.value.replace(/\s+/g, ' ').trim();
    const n = v === '' || v === CHARTE.legende.titre_defaut ? null : v;   // vide = titre par défaut
    if (n === g().titre) return;
    g().titre = n;
    valider('Légende — titre');
  });
  const tv = form.querySelector('[name="titre-visible"]');
  if (tv) tv.addEventListener('change', () => {
    if (!garde()) return;
    g().titre = tv.checked ? null : '';   // '' = légende sans titre
    valider(tv.checked ? 'Légende — titre affiché' : 'Légende — sans titre');
  });
  form.querySelectorAll('.ligne-legende').forEach((div) => {
    const id = div.dataset.id;
    const l = lignesLegende(etat.plan, objets()).find((x) => x.id === id);
    if (!l) return;
    const lib = div.querySelector('[data-champ="libelle"]');
    lib.addEventListener('focus', () => { dlg.dataset.saisie = '1'; });
    lib.addEventListener('blur', () => { delete dlg.dataset.saisie; });
    lib.addEventListener('change', () => {
      if (!garde()) return;
      const v = lib.value.replace(/\s+/g, ' ').trim();
      if (l.auto) {
        const s = { ...(g().surcharges[id] || {}) };
        if (v === '' || v === l.libelle_auto) delete s.libelle; else s.libelle = v;
        if (Object.keys(s).length) g().surcharges[id] = s; else delete g().surcharges[id];
      } else {
        const a = g().ajouts.find((x) => x.id === id);
        if (!a || a.libelle === v) return;
        a.libelle = v;
      }
      delete dlg.dataset.saisie;
      valider('Légende — libellé');
    });
    const cb = div.querySelector('[data-champ="afficher"]');
    if (cb && l.auto) cb.addEventListener('change', () => {
      if (!garde()) return;
      const s = { ...(g().surcharges[id] || {}) };
      if (cb.checked) delete s.masquee; else s.masquee = true;
      if (Object.keys(s).length) g().surcharges[id] = s; else delete g().surcharges[id];
      valider(cb.checked ? 'Légende — ligne affichée' : 'Légende — ligne masquée');
    });
    const sel = div.querySelector('[data-champ="echantillon"]');
    if (sel) sel.addEventListener('change', () => {
      if (!garde()) return;
      const a = g().ajouts.find((x) => x.id === id);
      if (!a) return;
      a.echantillon = sel.value || null;
      valider('Légende — échantillon');
    });
    const ri = div.querySelector('[data-a="reinit-ligne"]');
    if (ri) ri.addEventListener('click', () => { if (!garde()) return; delete g().surcharges[id]; valider('Légende — ligne rétablie'); });
    const sp = div.querySelector('[data-a="supprimer-ligne"]');
    if (sp) sp.addEventListener('click', () => {
      if (!garde()) return;
      g().ajouts = g().ajouts.filter((x) => x.id !== id);
      if (Array.isArray(g().ordre)) g().ordre = g().ordre.filter((x) => x !== id);
      valider('Légende — ligne supprimée');
    });
    const pg = div.querySelector('[data-a="glisser"]');
    if (pg) pg.addEventListener('pointerdown', (e) => glisserLigne(e, div));
  });
  const aj = form.querySelector('[data-a="ajouter"]');
  if (aj) aj.addEventListener('click', () => {
    if (!garde()) return;
    const ech = form.querySelector('[name="nouvel-echantillon"]').value || null;
    const lib = form.querySelector('[name="nouveau-libelle"]').value.replace(/\s+/g, ' ').trim();
    const e = ech ? catalogueEchantillons().get(ech) : null;
    if (!lib && !e) { notifier('Saisir un libellé ou choisir un échantillon', 2200); return; }
    const a = { id: genererId('lg'), libelle: lib || (e ? e.libelle : ''), echantillon: ech };
    g().ajouts.push(a);
    if (Array.isArray(g().ordre)) g().ordre.push(a.id);
    valider('Légende — ligne ajoutée');
  });
  const rt = form.querySelector('[data-a="reinit-tout"]');
  if (rt) rt.addEventListener('click', async () => {
    if (!garde()) return;
    if (!(await confirmer('Réinitialiser la légende ? Titre, libellés, lignes masquées, lignes ajoutées et ordre reviennent à l’automatique (annulable par Ctrl+Z). Position, taille, cadre et fond sont conservés.', { ok: 'Réinitialiser', danger: true }))) return;
    Object.assign(leg(), retouchesLegendeParDefaut());
    valider('Légende réinitialisée');
  });
}

/* Glisser une ligne (pointeur) : dépôt avant / après la ligne survolée ; écrit l'ordre complet. */
function glisserLigne(ev, div) {
  if (!garde()) return;
  ev.preventDefault();
  const zone = div.parentElement;
  div.classList.add('glissee');
  let cible = null;
  const bouger = (e) => {
    const sous = document.elementFromPoint(e.clientX, e.clientY);
    const c = sous && sous.closest('.ligne-legende');
    zone.querySelectorAll('.cible-avant, .cible-apres').forEach((x) => x.classList.remove('cible-avant', 'cible-apres'));
    cible = null;
    if (c && c !== div && c.parentElement === zone) {
      const r = c.getBoundingClientRect();
      const avant = e.clientY < r.top + r.height / 2;
      c.classList.add(avant ? 'cible-avant' : 'cible-apres');
      cible = { id: c.dataset.id, avant };
    }
  };
  const fin = () => {
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', fin);
    window.removeEventListener('pointercancel', fin);
    div.classList.remove('glissee');
    zone.querySelectorAll('.cible-avant, .cible-apres').forEach((x) => x.classList.remove('cible-avant', 'cible-apres'));
    if (!cible) return;
    const ordre = ordreCourant().filter((x) => x !== div.dataset.id);
    let i = ordre.indexOf(cible.id);
    if (!cible.avant) i++;
    ordre.splice(i, 0, div.dataset.id);
    retouches().ordre = ordre;
    valider('Légende — ordre');
  };
  window.addEventListener('pointermove', bouger);
  window.addEventListener('pointerup', fin);
  window.addEventListener('pointercancel', fin);
}

void titreLegende;
