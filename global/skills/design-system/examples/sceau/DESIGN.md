# DESIGN — Sceau, vérification publique des diplômes
> Owner: designer. Écrans ↔ étapes du SPEC (aperçu : SPEC supposé, 3 étapes).

Chosen direction (G3): **A « Registre »**, 27/09/2026. Raisons du fondateur :
plus agréable à l'œil ; séparation étudiant / traçabilité du certificat ; le sceau.
B est réservée au futur espace d'administration (autre audience).
Core mock: `design/mocks/core.html` (états : home, loading, valid, revoked, notfound).

## Structure — where this product is original
| Axis | Decision |
|---|---|
| Product type | page publique de preuve (lien imprimé sur le diplôme, QR) |
| Audience per screen | visiteur public, sans compte, souvent sur Android en 4G |
| Navigation model | barre haute minimale : marque, « Établissements », « Vérifier un autre diplôme » |
| Entry / hero | le verdict porté par le sceau, puis le nom du titulaire en grand |
| Page structure | document en deux colonnes : identité et fiche à gauche, traçabilité à droite |
| Imagery | aucune photo ; l'emblème (sceau guilloché) est l'unique élément graphique |
| Typography personality | Fraunces pour les noms et titres, Instrument Sans pour le reste |
| Accent + radius personality | vert profond institutionnel, rayon net (0,375 rem) |
| Signature moment | le sceau, qui change selon le verdict (valide, barré, vide) |

## Navigation
Aucune navigation profonde : chaque écran est une page autonome partageable.
« Vérifier un autre diplôme » ramène à l'accueil ; absent de l'accueil lui-même.

## Screens

### Accueil — SPEC step 1 (saisir un code ou scanner)
- Audience: visiteur public.
- Job: lancer une vérification en moins de 10 secondes.
- Hierarchy: titre serif → explication → champ code + « Vérifier » → « Scanner le QR code ».
- Components: SiteHeader, Seal (idle), VerifyForm, InfoCard ×2.
- States: empty = cet écran · loading = bouton en chargement puis écran Loading · error = code mal formé (message sous le champ) · success = redirection vers le résultat.
- Layout: split (voir layout.md), aside sous le formulaire à 390.

### Résultat — SPEC step 2 (lire le verdict)
- Audience: visiteur public (recruteur, jury, famille).
- Job: savoir en un regard si le diplôme est valable, puis le prouver.
- Hierarchy: Seal + Badge verdict → nom (Fraunces 4xl) → intitulé + mention → phrase de preuve → fiche → actions ; traçabilité à côté.
- Components: SiteHeader, Seal, VerdictBadge, DiplomaSheet, TraceTimeline, ProofActions, StickyActionBar (mobile).
- States:
  - loading: Skeleton de la même géométrie + « Consultation du registre de l'établissement… »
  - valid (success): sceau vert, badge « Authentique », actions Télécharger / Copier le lien.
  - revoked (error métier): sceau barré rouge, Alert destructive, date de délivrance barrée, action « Contacter l'établissement » seulement. Jamais de sceau vert.
  - notfound (empty): sceau pointillé gris, badge « Introuvable » (warning, pas destructive), titre avec le code saisi, formulaire de correction pré-rempli, aide à droite.
  - network error: Alert neutre « Le registre ne répond pas » + Réessayer (non maquetté, même gabarit que notfound).
- Layout: split-document.

### Attestation PDF — SPEC step 3 (prouver hors ligne)
- Audience: visiteur public.
- Job: joindre une preuve à un dossier.
- Hierarchy: reprend la fiche et le sceau en A4 ; QR vers la page de preuve.
- States: génération (bouton en chargement), succès (téléchargement + Sonner « Attestation téléchargée »).
