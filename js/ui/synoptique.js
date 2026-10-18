/* ui/synoptique.js — v1.11.0 §B1 à B4 (H-411 à H-420) : interface du synoptique.
 *
 * - Choix du réseau à la création (Outils → Synoptique, Gestion des pages → Ajouter une page synoptique).
 * - Fiche (section propre, insérée par fiche-objet.js) : mise à jour depuis le plan, réinitialisation de la mise en
 *   page, titre, mini-légende, cadre, fond, liste des nœuds (libellé, masquer, origine, replacer) et des arêtes
 *   (libellé, masquer). Champs nommés `syn.*`, traités par appliquerChampSynoptique (une étape d'Annuler chacun).
 * - Pastille « plan modifié depuis la génération » : signature recalculée après chaque modification du plan (différée),
 *   écran seulement, jamais exportée.
 */
import { etat, sur, emettre, notifier, peutModifier, signalerLectureSeule, selectionner } from '../etat.js';
import { CHARTE } from '../charte.js';
import { valider } from '../historique.js';
import { echapper, ouvrirDialogue } from './dialogues.js';
import { titreSynoptique, genererSynoptique, redisposer, planModifie, etatEcranSynoptique, nomNoeud, libellerNoeud, masquerNoeud, libellerArete, masquerArete, definirOrigine, deplacerNoeud } from '../synoptique.js';

const K = () => CHARTE.synoptique;
let minuterie = null;

export function initialiserSynoptiqueUI() {
  const planifier = () => { clearTimeout(minuterie); minuterie = setTimeout(actualiserPastilles, 700); };
  sur('objets', planifier);
  sur('plan-change', planifier);
  sur('projet-ouvert', planifier);
}

/* Pastilles des synoptiques de la page courante (comparaison de signatures, sans calcul de l'ordre du descriptif). */
export function actualiserPastilles() {
  if (!etat.projet || !etat.plan) return;
  const E = etatEcranSynoptique();
  let change = false;
  for (const o of etat.plan.objets || []) {
    if (o.type !== 'image' || !o.synoptique) continue;
    let m = false;
    try { m = planModifie(o, etat.projet); } catch (e) { m = false; }
    if (!!E.modifie.get(o.id) !== m) { E.modifie.set(o.id, m); change = true; }
  }
  if (change) emettre('rendu-objets');
}

/* Choix du réseau (une question, trois réponses). Retourne 'HTA' | 'BT' | 'EP' | null. */
export function choisirReseau(titre = 'Synoptique') {
  return new Promise((resoudre) => {
    const R = K().reseaux;
    const d = ouvrirDialogue('dlg-generique', `
      <form class="dialogue" method="dialog">
        <h2>${echapper(titre)}</h2>
        <p>Réseau représenté (un schéma par réseau ; BT : branchements compris) :</p>
        <div class="boutons colonne">
          ${Object.keys(R).map((k) => `<button type="button" class="btn btn-primaire" data-r="${k}">${echapper(R[k].libelle)}</button>`).join('')}
          <button type="button" class="btn" data-r="">Annuler</button>
        </div>
        <p class="aide">Schéma non à l’échelle, calculé depuis toutes les pages de plan (réseau FT exclu) ; « Mettre à jour depuis le plan » à la demande, retouches conservées.</p>
      </form>`);
    let fait = false;
    d.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { fait = true; d.close(); resoudre(b.dataset.r || null); }));
    d.addEventListener('close', () => { if (!fait) resoudre(null); }, { once: true });
  });
}

/* Outils → Synoptique : sur la page courante, dans la zone visible. */
export async function poserSynoptiqueInteractif() {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const r = await choisirReseau('Synoptique sur cette page');
  if (!r) return;
  const [{ poserSynoptique }, { rectangleVisible }] = await Promise.all([import('../outils.js'), import('../vue.js')]);
  const o = poserSynoptique(r, rectangleVisible());
  if (o) emettre('ouvrir-fiche', o.id);
}

/* Gestion des pages → Ajouter une page synoptique : page vierge (A3 paysage par défaut), insérée après les pages de
 * plan et avant le reportage, synoptique posé au centre et ajusté à la page. */
export async function ajouterPageSynoptique(papier = K().page.papier, orientation = K().page.orientation) {
  if (!peutModifier()) { signalerLectureSeule(); return null; }
  const r = await choisirReseau('Nouvelle page synoptique');
  if (!r) return null;
  const P = await import('../plans.js');
  const pl = await P.ajouterPageSynoptique(papier, orientation, 'Synoptique ' + K().reseaux[r].libelle);
  if (!pl) return null;
  const [{ poserSynoptique }, { etenduePlan }] = await Promise.all([import('../outils.js'), import('../vue.js')]);
  const o = poserSynoptique(r, etenduePlan(pl), { remplir: true });
  if (o) notifier('Page synoptique ' + K().reseaux[r].libelle + ' ajoutée avant le reportage', 2600);
  return pl;
}

/* ---------- Fiche ---------- */

const opt = (liste, courant) => liste.map(([k, l]) => `<option value="${k}" ${k === courant ? 'selected' : ''}>${echapper(l)}</option>`).join('');

export function htmlFicheSynoptique(o) {
  const s = o.synoptique, m = s.modele, R = s.retouches;
  const lecture = !peutModifier();
  const dis = lecture ? 'disabled' : '';
  const modifie = !!etatEcranSynoptique().modifie.get(o.id);
  const reseau = K().reseaux[s.reseau].libelle;
  const nb = m ? m.noeuds.length : 0;
  const parId = new Map(m ? m.noeuds.map((n) => [n.id, n]) : []);
  const noeuds = m ? [...m.noeuds].sort((a, b) => (a.y - b.y) || (a.x - b.x)) : [];
  const ligneNoeud = (n) => {
    const r = R.noeuds[n.id] || {};
    const auto = n.type === 'extremite' ? K().extremite : (n.designation[0] || '');
    return `<div class="ligne-syn ${r.masque ? 'masquee' : ''}">
      <span class="nom-syn">${n.origine ? '<strong title="Origine">▶</strong> ' : ''}${echapper(n.repere || (n.type === 'extremite' ? K().extremite : '—'))}</span>
      <input name="syn.n.libelle.${echapper(n.id)}" value="${echapper(typeof r.libelle === 'string' ? r.libelle : '')}" placeholder="${echapper(auto)}" ${dis} autocomplete="off" aria-label="Libellé du nœud ${echapper(n.repere)}">
      <label class="case" title="Masquer"><input type="checkbox" name="syn.n.masque.${echapper(n.id)}" ${r.masque ? 'checked' : ''} ${dis}> masqué</label>
      ${lecture ? '' : `<button type="button" class="btn-mini" data-syn="origine" data-id="${echapper(n.id)}" ${n.origine ? 'disabled' : ''} title="Définir comme origine">Origine</button>
      <button type="button" class="btn-mini" data-syn="replacer" data-id="${echapper(n.id)}" ${r.dx || r.dy ? '' : 'disabled'} title="Supprimer le décalage manuel">↺</button>`}
    </div>`;
  };
  const ligneArete = (a) => {
    const r = R.aretes[a.id] || {};
    const de = parId.get(a.parent || a.a), vers = parId.get(a.enfant || a.b);
    const nom = (x) => (x ? (x.repere || (x.type === 'extremite' ? K().extremite : '—')) : '—');
    return `<div class="ligne-syn ${r.masque ? 'masquee' : ''}">
      <span class="nom-syn">${echapper(nom(de))} → ${echapper(nom(vers))}${a.renvoi ? ' (renvoi)' : ''}</span>
      <input name="syn.a.libelle.${echapper(a.id)}" value="${echapper(typeof r.libelle === 'string' ? r.libelle : '')}" placeholder="${echapper(a.libelle)}" ${dis || (a.renvoi ? 'disabled' : '')} autocomplete="off">
      <label class="case"><input type="checkbox" name="syn.a.masque.${echapper(a.id)}" ${r.masque ? 'checked' : ''} ${dis || (a.renvoi ? 'disabled' : '')}> masqué</label>
    </div>`;
  };
  const date = m && m.genere_le ? new Date(m.genere_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  return `
    <section class="bloc">
      ${modifie ? `<div class="pastille-syn">Plan modifié depuis la génération</div>` : ''}
      <div class="boutons-image">
        ${lecture ? '' : '<button class="btn btn-primaire" data-syn="maj">Mettre à jour depuis le plan</button><button class="btn" data-syn="reinit">Réinitialiser la mise en page</button>'}
      </div>
      <div class="aide">Réseau ${echapper(reseau)} — ${nb} nœud${nb > 1 ? 's' : ''}, ${m ? m.aretes.length : 0} arête${m && m.aretes.length > 1 ? 's' : ''}${m && m.aretes.some((a) => a.renvoi) ? ', ' + m.aretes.filter((a) => a.renvoi).length + ' renvoi(s) de bouclage' : ''} ; généré le ${echapper(date)}.${m && m.sans_repere ? ` <strong>${m.sans_repere} ouvrage${m.sans_repere > 1 ? 's' : ''} sans repère</strong> (symbole sans cartouche ; aucun repère n’est inventé).` : ''} Mise à jour à la demande : déplacements, libellés, masquages et origines sont conservés ; un ouvrage supprimé du plan disparaît avec ses retouches.</div>
      <label>Titre<input name="syn.titre" value="${echapper(titreSynoptique(s))}" ${dis} autocomplete="off"></label>
      <div class="ligne2">
        <label class="case"><input type="checkbox" name="syn.titre_visible" ${s.titre_visible !== false ? 'checked' : ''} ${dis}> Afficher le titre</label>
        <label class="case"><input type="checkbox" name="syn.legende_visible" ${s.legende_visible !== false ? 'checked' : ''} ${dis}> Mini-légende</label>
      </div>
      <div class="ligne2">
        <label>Cadre<select name="syn.cadre" ${dis}>${opt([['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Angles arrondis']], s.cadre)}</select></label>
        <label>Fond<select name="syn.fond" ${dis}>${opt([['blanc', 'Blanc opaque'], ['translucide', 'Blanc translucide'], ['transparent', 'Transparent']], s.fond)}</select></label>
      </div>
      <div class="aide">Au stylet : appui sur un nœud pour le sélectionner, puis glisser pour le déplacer ; appui long sur un nœud : renommer, masquer, définir comme origine. Objet illustratif : hors descriptif, métré, légende du plan, « à compléter » et reportage. Calque « Images et photos ».</div>
    </section>
    <section class="bloc">
      <h3>Nœuds</h3>
      <div class="liste-syn">${noeuds.map(ligneNoeud).join('') || '<p class="aide">Aucun nœud.</p>'}</div>
      <h3>Arêtes (portées)</h3>
      <div class="liste-syn">${m ? m.aretes.map(ligneArete).join('') : ''}</div>
    </section>`;
}

/* Champ `syn.*` de la fiche. Retourne true s'il a été traité (que la valeur ait changé ou non). */
export function appliquerChampSynoptique(o, el) {
  if (!el.name || !el.name.startsWith('syn.')) return false;
  if (!peutModifier()) { signalerLectureSeule(); return true; }
  const s = o.synoptique;
  const n = el.name;
  if (n === 'syn.titre') {
    const v = el.value.replace(/\s+/g, ' ').trim();
    const def = K().titre_defaut.replace('{reseau}', K().reseaux[s.reseau].libelle);
    s.titre = v === '' || v === def ? null : v;
    redisposer(o); valider('Titre du synoptique'); return true;
  }
  if (n === 'syn.titre_visible') { s.titre_visible = el.checked; redisposer(o); valider(el.checked ? 'Titre du synoptique affiché' : 'Titre du synoptique masqué'); return true; }
  // v1.11.1 (H-428) : le cadre se réduit (ou s'agrandit) avec la mini-légende ; coin haut-gauche fixe
  if (n === 'syn.legende_visible') { s.legende_visible = el.checked; redisposer(o); valider(el.checked ? 'Mini-légende affichée' : 'Mini-légende masquée'); return true; }
  if (n === 'syn.cadre' || n === 'syn.fond') { s[n.slice(4)] = el.value; valider('Aspect du synoptique'); return true; }
  const m = /^syn\.(n|a)\.(libelle|masque)\.(.+)$/.exec(n);
  if (m) {
    const [, quoi, champ, id] = m;
    if (quoi === 'n' && champ === 'libelle') { libellerNoeud(o, id, el.value); valider('Libellé du nœud'); }
    else if (quoi === 'n') { masquerNoeud(o, id, el.checked); valider(el.checked ? 'Nœud masqué' : 'Nœud affiché'); }
    else if (champ === 'libelle') { libellerArete(o, id, el.value); valider('Libellé de l’arête'); }
    else { masquerArete(o, id, el.checked); valider(el.checked ? 'Arête masquée' : 'Arête affichée'); }
    return true;
  }
  return true;
}

/* Boutons de la fiche (`data-syn`). `rouvrir` : redessine la fiche. */
export function brancherFicheSynoptique(conteneur, o, rouvrir) {
  const garde = () => { if (peutModifier()) return true; signalerLectureSeule(); return false; };
  const b = (sel, fn) => conteneur.querySelectorAll(`[data-syn="${sel}"]`).forEach((x) => x.addEventListener('click', () => { if (garde()) { fn(x); rouvrir(); } }));
  b('maj', () => mettreAJour(o));
  b('reinit', () => { redisposer(o, { reinitialiser: true }); valider('Mise en page du synoptique réinitialisée'); });
  b('origine', (x) => { definirOrigine(o, x.dataset.id); valider('Origine du synoptique'); });
  b('replacer', (x) => { const r = o.synoptique.retouches.noeuds[x.dataset.id] || {}; deplacerNoeud(o, x.dataset.id, -(Number(r.dx) || 0), -(Number(r.dy) || 0)); valider('Nœud replacé'); });
}

export function mettreAJour(o) {
  const r = genererSynoptique(o, etat.projet);
  etatEcranSynoptique().modifie.set(o.id, false);
  valider('Synoptique mis à jour depuis le plan');
  notifier('Synoptique mis à jour' + (r.ajoutes.length ? ' : ' + r.ajoutes.length + ' nœud(s) ajouté(s)' : '') + (r.retires.length ? ', ' + r.retires.length + ' retiré(s)' : '') + ' — retouches conservées', 3200);
  return r;
}

/* Menu contextuel : entrées du synoptique (et du nœud sous le doigt, s'il y en a un). */
export function itemsMenuSynoptique(o, noeud) {
  const items = [];
  if (!peutModifier()) return items;
  if (noeud) {
    const r = o.synoptique.retouches.noeuds[noeud.id] || {};
    items.push({ l: 'Renommer le nœud ' + nomNoeud(o, noeud).slice(0, 40) + '…', f: () => renommerNoeud(o, noeud) });
    items.push({ l: r.masque ? 'Afficher le nœud' : 'Masquer le nœud', f: () => { masquerNoeud(o, noeud.id, !r.masque); valider(r.masque ? 'Nœud affiché' : 'Nœud masqué'); } });
    if (!noeud.origine) items.push({ l: 'Définir comme origine', f: () => { definirOrigine(o, noeud.id); valider('Origine du synoptique'); } });
    if (r.dx || r.dy) items.push({ l: 'Replacer le nœud', f: () => { deplacerNoeud(o, noeud.id, -(Number(r.dx) || 0), -(Number(r.dy) || 0)); valider('Nœud replacé'); } });
  }
  items.push({ l: 'Mettre à jour depuis le plan', f: () => mettreAJour(o) });
  items.push({ l: 'Réinitialiser la mise en page', f: () => { redisposer(o, { reinitialiser: true }); valider('Mise en page du synoptique réinitialisée'); } });
  items.push({ l: 'Fiche du synoptique…', f: () => { selectionner([o.id]); emettre('ouvrir-fiche', o.id); } });
  return items;
}

function renommerNoeud(o, n) {
  const r = o.synoptique.retouches.noeuds[n.id] || {};
  const auto = n.type === 'extremite' ? K().extremite : (n.designation[0] || '');
  const d = ouvrirDialogue('dlg-generique', `
    <form class="dialogue" method="dialog">
      <h2>Libellé du nœud ${echapper(n.repere || '')}</h2>
      <label>Libellé<input name="l" value="${echapper(typeof r.libelle === 'string' ? r.libelle : auto)}" autocomplete="off"></label>
      <p class="aide">Vide : libellé automatique (« ${echapper(auto)} »).${n.type === 'extremite' ? ' Exemple : « Depuis poste … ».' : ''}</p>
      <div class="boutons"><button type="button" class="btn" data-r="non">Annuler</button><button type="submit" class="btn btn-primaire" data-r="ok">Valider</button></div>
    </form>`);
  const champ = d.querySelector('[name="l"]');
  setTimeout(() => { champ.focus(); champ.select(); }, 50);
  d.querySelector('[data-r="non"]').addEventListener('click', () => d.close());
  d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); d.close(); libellerNoeud(o, n.id, champ.value); valider('Libellé du nœud'); });
}
