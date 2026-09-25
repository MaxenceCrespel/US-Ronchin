/** The 10-point scale coaches rate players on, shared by the sticky strip, the full legend
 * dialog and the intro screen — a single source of truth so the wording (and the colors
 * used to key it) can never drift between the three. */
export interface RatingLevel {
  value: number
  label: string
  description: string
  color: string
}

export const RATING_LEVELS: RatingLevel[] = [
  { value: 1, label: 'Débutant', description: 'Découvre le foot, peine sur les bases (contrôle, passes, placement).', color: '#8b98a3' },
  { value: 2, label: 'Très limité', description: 'Joue pour le plaisir, subit le rythme du match.', color: '#7a8b99' },
  { value: 3, label: 'Loisir', description: 'Quelques repères, mais limité techniquement ou physiquement.', color: '#5f88a3' },
  { value: 4, label: 'Sous la moyenne', description: 'Utile dans le groupe, encore irrégulier.', color: '#3f83ab' },
  { value: 5, label: 'Moyen du club', description: "Le joueur type de l'équipe : fait le job sans se démarquer.", color: '#2a7db0' },
  { value: 6, label: 'Correct', description: 'Solide et fiable, peu d\'erreurs, tient bien son poste.', color: '#0071ab' },
  { value: 7, label: 'Bon', description: 'Au-dessus de la moyenne, pèse sur le jeu.', color: '#0a6a86' },
  { value: 8, label: 'Très bon', description: 'Fait souvent la différence à ce niveau.', color: '#0b7a4b' },
  { value: 9, label: 'Excellent', description: 'Parmi les meilleurs de la division, décisif régulièrement.', color: '#a86400' },
  { value: 10, label: 'Exceptionnel', description: 'Nettement au-dessus de la D6 (ex. ancien joueur de niveau supérieur).', color: '#b3261e' },
]

export function ratingLevel(rating: number): RatingLevel {
  const index = Math.min(10, Math.max(1, Math.floor(rating))) - 1
  return RATING_LEVELS[index]
}

export function formatRating(rating: number): string {
  return rating.toFixed(1).replace('.0', '').replace('.', ',')
}
