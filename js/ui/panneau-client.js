/* ui/panneau-client.js — v1.10.0 §A4 (H-404 à H-408) : fiche du panneau d'information client.
 *
 * Ouverte à la pose (Outils → Panneau d'information client), par un double appui sur le panneau ou par son menu
 * contextuel. Les champs du client (bénéficiaire, adresse, téléphone) sont ceux du projet : la rubrique « Client » des
 * Informations de l'affaire édite les mêmes données. Ils sont enregistrés comme les informations de l'affaire, hors
 * Annuler / Rétablir (H-405) ; les réglages du panneau (titre, impression, largeur, échelle, cadre, fond) sont des
 * modifications de la page, annulables.
 */
import { etat, sur, emettre, notifier, peutModifier, signalerLectureSeule } from '../etat.js';
import { CHARTE } from '../charte.js';
import { valider } from '../historique.js';
import { normaliserClient, nettoyerClient, normaliserPanneauClient } from '../modele.js';
import { demanderRendu } from '../rendu-svg.js';
import { titrePanneau, champsVides } from '../panneau-client.js';
import { echapper, ouvrirDialogue } from './dialogues.js';

let dlg = null;

export function initialiserPanneauClientUI() {
  sur('ouvrir-panneau-client', () => ouvrirFichePanneauClient());
  // Informations de l'affaire modifiées (rubrique « Client ») : panneau redessiné, fiche relue
  sur('projets-changes', (id) => { if (etat.projet && etat.projet.id === id) { demanderRendu(); if (dlg && dlg.open && !dlg.dataset.saisie) rendre(); } });
  sur('plan-change', () => { if (dlg && dlg.open) dlg.close(); });
  sur('projet-ferme', () => { if (dlg && dlg.open) dlg.close(); });
  sur('objets', () => { if (dlg && dlg.open && !dlg.dataset.saisie) { if (!etat.plan || !etat.plan.panneau_client) dlg.close(); else rendre(); } });
}

const pc = () => (etat.plan ? etat.plan.panneau_client : null);
const opt = (liste, courant) => liste.map(([k, l]) => `<option value="${k}" ${k === courant ? 'selected' : ''}>${l}</option>`).join('');

export function ouvrirFichePanneauClient() {
  if (!pc()) return;
  normaliserPanneauClient(pc());
  dlg = ouvrirDialogue('dlg-panneau-client', '<form class="dialogue fiche-panneau-client" novalidate></form>');
  rendre();
}

function rendre() {
  if (!dlg || !dlg.open || !pc()) return;
  const form = dlg.querySelector('form');
  const p = pc(), K = CHARTE.panneau_client;
  const c = normaliserClient(etat.projet && etat.projet.client);
  const lecture = !peutModifier();
  const dis = lecture ? 'disabled' : '';
  const vides = champsVides(c);
  form.innerHTML = `
    <h2>Panneau d’information client${lecture ? ' <span class="pastille-statut">consultation</span>' : ''}</h2>
    <h3>Client (données de l’affaire)</h3>
    <label>Bénéficiaire<input name="beneficiaire" value="${echapper(c.beneficiaire)}" placeholder="Nom et prénom, ou dénomination sociale" ${dis} autocomplete="off"></label>
    <label>Adresse<textarea name="adresse" rows="3" ${dis}>${echapper(c.adresse)}</textarea></label>
    <label>Téléphone<input name="telephone" value="${echapper(c.telephone)}" inputmode="tel" ${dis} autocomplete="off"></label>
    <div class="aide">${vides.length ? `Champ vide : « ${echapper(K.a_renseigner)} » à l’écran seulement, ligne absente des exports. ` : ''}Mêmes données que la rubrique « Client » des Informations de l’affaire. <strong>${echapper(K.rappel)}</strong></div>
    <h3>Panneau</h3>
    <label class="case"><input type="checkbox" name="imprimer" ${p.imprimer !== false ? 'checked' : ''} ${dis}> Imprimer le panneau (décoché : visible à l’écran, absent des exports)</label>
    <label>Titre<input name="titre" value="${echapper(titrePanneau(p))}" ${dis} autocomplete="off"></label>
    <div class="ligne2">
      <label>Largeur (mm)<input type="number" name="largeur_mm" value="${p.largeur_mm}" min="${K.largeur_min_mm}" max="${K.largeur_max_mm}" step="1" inputmode="numeric" ${dis}></label>
      <label>Échelle<input name="echelle" value="${String(p.echelle).replace('.', ',')}" inputmode="decimal" ${dis} autocomplete="off"></label>
    </div>
    <div class="ligne2">
      <label>Cadre<select name="cadre" ${dis}>${opt([['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Angles arrondis']], p.cadre)}</select></label>
      <label>Fond<select name="fond" ${dis}>${opt([['blanc', 'Blanc opaque'], ['translucide', 'Blanc translucide'], ['transparent', 'Transparent']], p.fond)}</select></label>
    </div>
    <label>Couleur du cadre<select name="couleur_cadre" ${dis}>${CHARTE.COULEURS_ANNOTATION.map((x) => `<option value="${x}" ${x === String(p.couleur_cadre).toUpperCase() ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <div class="boutons-image centrage-page" aria-label="Centrer sur la page">
      <span class="aide">Centrer sur la page :</span>
      <button type="button" class="btn" data-a="centrer-h" title="Centrer horizontalement" ${dis}>↔</button>
      <button type="button" class="btn" data-a="centrer-v" title="Centrer verticalement" ${dis}>↕</button>
      <button type="button" class="btn" data-a="centrer-hv" ${dis}>✛ Les deux</button>
    </div>
    <div class="aide">Centrage sur la boîte ${p.imprimer !== false ? 'imprimée : tant qu’un champ est vide, l’écran ajoute « à renseigner » et le panneau y paraît un peu décentré, le PDF est juste' : 'affichée à l’écran (panneau non imprimé)'}. Action ponctuelle : recentrer après une modification du contenu (adresse, largeur, échelle, titre). Glisser le panneau pour le déplacer (repères de centrage près des axes, Maj pour s’en affranchir) ; poignée carrée : échelle ; croix : retirer le panneau de la page (Ctrl+Z le rétablit). Hors descriptif, métré, légende et contrôle « à compléter ».</div>
    <div class="boutons">
      ${lecture ? '' : '<button type="button" class="btn" data-a="replacer">Replacer en haut à gauche</button><button type="button" class="btn btn-danger" data-a="retirer">Retirer de la page</button>'}
      <button type="button" class="btn btn-primaire" data-a="fermer">Fermer</button>
    </div>`;
  brancher(form);
}

function enregistrerClient(champ, valeur) {
  const avant = normaliserClient(etat.projet.client);
  const c = nettoyerClient({ ...avant, [champ]: valeur });
  if (JSON.stringify(c) === JSON.stringify(avant)) { rendre(); return; }
  etat.projet.client = c;
  etat.projet.modifie_le = new Date().toISOString();
  emettre('objets', { etiquette: 'Client — ' + champ });   // rendu et sauvegarde automatique, sans étape d'historique
  emettre('projets-changes', etat.projet.id);
}

function brancher(form) {
  const garde = () => { if (peutModifier()) return true; signalerLectureSeule(); return false; };
  form.querySelector('[data-a="fermer"]').addEventListener('click', () => dlg.close());
  form.querySelectorAll('input, textarea, select').forEach((el) => {
    el.addEventListener('focus', () => { dlg.dataset.saisie = '1'; });
    el.addEventListener('blur', () => { delete dlg.dataset.saisie; });
    el.addEventListener('change', () => {
      if (!garde()) return;
      delete dlg.dataset.saisie;
      const p = pc();
      if (!p) return;
      const n = el.name, K = CHARTE.panneau_client;
      if (['beneficiaire', 'adresse', 'telephone'].includes(n)) { enregistrerClient(n, el.value); return; }
      if (n === 'imprimer') { p.imprimer = el.checked; valider(el.checked ? 'Panneau client imprimé' : 'Panneau client non imprimé'); return; }
      if (n === 'titre') { const v = el.value.replace(/\s+/g, ' ').trim(); p.titre = v === K.titre_defaut ? null : v; valider('Titre du panneau client'); return; }
      if (n === 'largeur_mm') { const v = Number(el.value); if (Number.isFinite(v) && v > 0) { p.largeur_mm = Math.min(K.largeur_max_mm, Math.max(K.largeur_min_mm, Math.round(v))); valider('Largeur du panneau client'); } else rendre(); return; }
      if (n === 'echelle') { const v = Number(String(el.value).replace(',', '.')); if (Number.isFinite(v) && v > 0) { p.echelle = Math.min(K.echelle_max, Math.max(K.echelle_min, v)); valider('Échelle du panneau client'); } else rendre(); return; }
      if (n === 'cadre' || n === 'fond' || n === 'couleur_cadre') { p[n] = el.value; valider('Aspect du panneau client'); }
    });
  });
  for (const [a, sens] of [['centrer-h', 'horizontal'], ['centrer-v', 'vertical'], ['centrer-hv', 'les_deux']]) {   // v1.11.0 §B5
    const bt = form.querySelector(`[data-a="${a}"]`);
    if (bt) bt.addEventListener('click', () => { if (!garde()) return; import('../outils.js').then((m) => { m.centrerPanneauClient(sens); rendre(); }); });
  }
  const rp = form.querySelector('[data-a="replacer"]');
  if (rp) rp.addEventListener('click', () => { if (!garde()) return; pc().x = null; pc().y = null; valider('Panneau client replacé'); });
  const rt = form.querySelector('[data-a="retirer"]');
  if (rt) rt.addEventListener('click', () => { if (!garde()) return; dlg.close(); import('../outils.js').then((m) => m.supprimerPanneauClient()); });
  void notifier;
}
