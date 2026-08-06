export type BadgeCategory =
  | 'GOALS'
  | 'ASSISTS'
  | 'MOTM'
  | 'ATTENDANCE'
  | 'EXPERIENCE'
  | 'DISCIPLINE'
  | 'IMPACT'
  | 'SPECIAL';

/** How hard a badge is to earn — drives the reveal's visual intensity (glow, particles, rarity tag). */
export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface BadgeDefinition {
  key: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  title: string;
  description: string;
  emoji: string;
}

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  GOALS: 'Buts',
  ASSISTS: 'Passes décisives',
  MOTM: 'Homme du match',
  ATTENDANCE: 'Assiduité',
  EXPERIENCE: 'Expérience',
  DISCIPLINE: 'Discipline',
  IMPACT: 'Impact & résultats',
  SPECIAL: 'Spécial',
};

export const BADGE_RARITY_LABELS: Record<BadgeRarity, string> = {
  COMMON: 'Commun',
  RARE: 'Rare',
  EPIC: 'Épique',
  LEGENDARY: 'Légendaire',
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Buts — progression par match, puis par saison, puis moments particuliers
  {
    key: 'first_goal',
    category: 'GOALS',
    rarity: 'COMMON',
    title: 'Premier but',
    description: 'Marquer ton premier but',
    emoji: '⚽',
  },
  {
    key: 'double',
    category: 'GOALS',
    rarity: 'COMMON',
    title: 'Le Doublé',
    description: 'Marquer 2 buts dans un seul match',
    emoji: '🥅',
  },
  {
    key: 'hat_trick',
    category: 'GOALS',
    rarity: 'RARE',
    title: 'Le Coup du Chapeau',
    description: 'Marquer 3 buts dans un seul match',
    emoji: '🎩',
  },
  {
    key: 'poker',
    category: 'GOALS',
    rarity: 'EPIC',
    title: "Poker d'As",
    description: 'Marquer 4 buts (ou plus) dans un seul match',
    emoji: '🃏',
  },
  {
    key: 'fox_in_the_box',
    category: 'GOALS',
    rarity: 'RARE',
    title: 'Le Renard des Surfaces',
    description: 'Marquer dans 5 matchs différents',
    emoji: '🦊',
  },
  {
    key: 'sniper',
    category: 'GOALS',
    rarity: 'RARE',
    title: 'Serial Buteur',
    description: '10 buts dans la saison',
    emoji: '💥',
  },
  {
    key: 'sharpshooter',
    category: 'GOALS',
    rarity: 'EPIC',
    title: 'Canonnier',
    description: '20 buts dans la saison',
    emoji: '🎯',
  },
  {
    key: 'goat',
    category: 'GOALS',
    rarity: 'LEGENDARY',
    title: 'La Légende (G.O.A.T.)',
    description: '50 buts dans la saison — bon courage',
    emoji: '🐐',
  },
  {
    key: 'early_bird',
    category: 'GOALS',
    rarity: 'COMMON',
    title: 'Départ Canon',
    description: 'Marquer un but dans les 5 premières minutes',
    emoji: '🚀',
  },
  {
    key: 'vainqueur_soir',
    category: 'GOALS',
    rarity: 'RARE',
    title: 'Le Vainqueur du Soir',
    description: 'Marquer le but de la victoire à partir de la 85e minute',
    emoji: '🌙',
  },
  {
    key: 'cadeau_anniversaire',
    category: 'GOALS',
    rarity: 'EPIC',
    title: "Le Cadeau d'Anniversaire",
    description: 'Marquer un but dans la semaine de ton anniversaire',
    emoji: '🎂',
  },
  {
    key: 'aigle_des_surfaces',
    category: 'GOALS',
    rarity: 'RARE',
    title: "L'Aigle des Surfaces",
    description: '3 buts marqués de la tête dans la saison',
    emoji: '🦅',
  },
  {
    key: 'specialiste',
    category: 'GOALS',
    rarity: 'RARE',
    title: 'Le Spécialiste',
    description: '3 penaltys transformés dans la saison',
    emoji: '🥶',
  },

  // Passes décisives — progression par match, puis par saison, puis séries
  {
    key: 'first_assist',
    category: 'ASSISTS',
    rarity: 'COMMON',
    title: 'Premier caviar',
    description: 'Délivrer ta première passe décisive',
    emoji: '🅰️',
  },
  {
    key: 'traiteur',
    category: 'ASSISTS',
    rarity: 'RARE',
    title: 'Le Traiteur',
    description: '2 passes décisives délivrées dans un seul match',
    emoji: '🍽️',
  },
  {
    key: 'playmaker',
    category: 'ASSISTS',
    rarity: 'RARE',
    title: 'Meneur de jeu',
    description: '5 passes décisives dans la saison',
    emoji: '🧠',
  },
  {
    key: 'elite_passer',
    category: 'ASSISTS',
    rarity: 'EPIC',
    title: "Passeur d'élite",
    description: '10 passes décisives dans la saison',
    emoji: '🎁',
  },
  {
    key: 'postman',
    category: 'ASSISTS',
    rarity: 'LEGENDARY',
    title: 'Le Facteur',
    description: '15 passes décisives dans la saison — toujours la bonne adresse',
    emoji: '📬',
  },
  {
    key: 'altruiste',
    category: 'ASSISTS',
    rarity: 'RARE',
    title: "L'Altruiste",
    description: '3 matchs de suite avec une passe décisive sans marquer toi-même',
    emoji: '🤐',
  },
  {
    key: 'pere_noel',
    category: 'ASSISTS',
    rarity: 'EPIC',
    title: 'Le Père Noël',
    description: '5 passes décisives de suite sans marquer — que des cadeaux pour les autres',
    emoji: '🎅',
  },
  {
    key: 'impact_immediat',
    category: 'ASSISTS',
    rarity: 'RARE',
    title: "L'Impact Immédiat",
    description: 'Délivrer une passe décisive en tant que remplaçant entré en cours de jeu',
    emoji: '💥',
  },
  {
    key: 'freres_darmes',
    category: 'ASSISTS',
    rarity: 'RARE',
    title: 'Les Frères d’Armes',
    description: 'Délivrer une passe décisive au même buteur lors de deux matchs différents',
    emoji: '🤝',
  },

  // Homme du match — progression
  {
    key: 'motm_first',
    category: 'MOTM',
    rarity: 'COMMON',
    title: 'Homme du match',
    description: 'Être élu homme du match',
    emoji: '👑',
  },
  {
    key: 'motm_hero',
    category: 'MOTM',
    rarity: 'RARE',
    title: 'Légende du terrain',
    description: '3 fois homme du match',
    emoji: '🏆',
  },
  {
    key: 'motm_legend',
    category: 'MOTM',
    rarity: 'EPIC',
    title: 'Idole du vestiaire',
    description: '5 fois homme du match',
    emoji: '🌟',
  },
  {
    key: 'diva',
    category: 'MOTM',
    rarity: 'LEGENDARY',
    title: 'Chouchou du vestiaire',
    description: '10 fois homme du match — le trophée a ton nom gravé dessus',
    emoji: '💅',
  },
  {
    key: 'incompris',
    category: 'MOTM',
    rarity: 'RARE',
    title: "L'Incompris",
    description: 'Être élu homme du match lors d’une défaite de l’équipe',
    emoji: '🤷',
  },

  // Assiduité — séries, puis totaux, puis déclaratif vs réel
  {
    key: 'streak_5',
    category: 'ATTENDANCE',
    rarity: 'COMMON',
    title: 'Increvable',
    description: "5 entraînements d'affilée sans absence",
    emoji: '🔥',
  },
  {
    key: 'streak_10',
    category: 'ATTENDANCE',
    rarity: 'RARE',
    title: 'Machine de guerre',
    description: "10 entraînements d'affilée sans absence",
    emoji: '⚡',
  },
  {
    key: 'streak_20',
    category: 'ATTENDANCE',
    rarity: 'EPIC',
    title: 'Robocop',
    description: "20 entraînements d'affilée sans absence",
    emoji: '🚀',
  },
  {
    key: 'terminator',
    category: 'ATTENDANCE',
    rarity: 'LEGENDARY',
    title: 'Terminator',
    description: "30 entraînements d'affilée sans absence — tu reviendras",
    emoji: '🤖',
  },
  {
    key: 'pillar',
    category: 'ATTENDANCE',
    rarity: 'COMMON',
    title: 'Pilier du groupe',
    description: '20 présences aux entraînements',
    emoji: '🏛️',
  },
  {
    key: 'lifetime_member',
    category: 'ATTENDANCE',
    rarity: 'RARE',
    title: 'Membre à vie',
    description: '50 présences aux entraînements',
    emoji: '🏅',
  },
  {
    key: 'vest_forever',
    category: 'ATTENDANCE',
    rarity: 'EPIC',
    title: 'Chasuble à vie',
    description: '75 présences aux entraînements',
    emoji: '🦺',
  },
  {
    key: 'stakhanoviste',
    category: 'ATTENDANCE',
    rarity: 'LEGENDARY',
    title: 'Le Stakhanoviste',
    description: '100 présences aux entraînements — la productivité incarnée',
    emoji: '⚙️',
  },
  {
    key: 'beau_parleur',
    category: 'ATTENDANCE',
    rarity: 'RARE',
    title: 'Le Beau Parleur',
    description:
      "Se déclarer présent à un entraînement... et ne jamais y avoir mis les pieds",
    emoji: '🤥',
  },
  {
    key: 'invite_surprise',
    category: 'ATTENDANCE',
    rarity: 'RARE',
    title: "L'Invité Surprise",
    description:
      "Se déclarer absent (ou ne pas répondre) et débarquer quand même à l'entraînement",
    emoji: '👻',
  },
  {
    key: 'survivant_hiver',
    category: 'ATTENDANCE',
    rarity: 'EPIC',
    title: "Le Survivant de l'Hiver",
    description:
      '100% de présence validée par le coach aux entraînements de décembre et janvier',
    emoji: '🥵',
  },

  // Expérience — progression puis special
  {
    key: 'veteran',
    category: 'EXPERIENCE',
    rarity: 'COMMON',
    title: 'Vétéran',
    description: '15 matchs joués',
    emoji: '🎖️',
  },
  {
    key: 'road_captain',
    category: 'EXPERIENCE',
    rarity: 'RARE',
    title: 'Capitaine de route',
    description: '30 matchs joués',
    emoji: '🚌',
  },
  {
    key: 'centurion',
    category: 'EXPERIENCE',
    rarity: 'EPIC',
    title: 'Centurion',
    description: '50 matchs joués',
    emoji: '💯',
  },
  {
    key: 'statue',
    category: 'EXPERIENCE',
    rarity: 'LEGENDARY',
    title: 'La Statue du club',
    description: '100 matchs joués — on va te mettre une plaque',
    emoji: '🗿',
  },
  {
    key: 'silent_hero',
    category: 'EXPERIENCE',
    rarity: 'RARE',
    title: 'Le Silencieux',
    description: '10 matchs joués sans un seul but, passe ou carton — le taulier de l’ombre',
    emoji: '🤫',
  },
  {
    key: 'panne_seche',
    category: 'EXPERIENCE',
    rarity: 'RARE',
    title: 'La Panne Sèche',
    description: '10 matchs joués consécutifs sans marquer ni faire de passe décisive',
    emoji: '📉',
  },
  {
    key: 'interimaire',
    category: 'EXPERIENCE',
    rarity: 'RARE',
    title: "L'Intérimaire",
    description:
      "Jouer un match, être absent plus d'un mois complet, puis revenir sur la feuille de match",
    emoji: '💼',
  },

  // Discipline — jaune, puis rouge, puis combos, puis contre-badge
  {
    key: 'first_yellow',
    category: 'DISCIPLINE',
    rarity: 'COMMON',
    title: 'Carton facile',
    description: 'Écoper de ton premier carton jaune',
    emoji: '🟨',
  },
  {
    key: 'hot_head',
    category: 'DISCIPLINE',
    rarity: 'RARE',
    title: 'Chaud bouillant',
    description: '5 cartons jaunes dans la saison',
    emoji: '🌶️',
  },
  {
    key: 'card_collector',
    category: 'DISCIPLINE',
    rarity: 'EPIC',
    title: 'Abonné du carton',
    description: '10 cartons jaunes dans la saison — carte de fidélité offerte',
    emoji: '📇',
  },
  {
    key: 'first_red',
    category: 'DISCIPLINE',
    rarity: 'RARE',
    title: 'Voyou du club',
    description: 'Écoper de ton premier carton rouge',
    emoji: '🟥',
  },
  {
    key: 'banned',
    category: 'DISCIPLINE',
    rarity: 'EPIC',
    title: 'Interdit de stade',
    description: '2 cartons rouges dans la saison',
    emoji: '🚫',
  },
  {
    key: 'jekyll_hyde',
    category: 'DISCIPLINE',
    rarity: 'EPIC',
    title: 'Jekyll & Hyde',
    description: 'Marquer un but ET recevoir un carton rouge dans le même match — du héros au hors-jeu',
    emoji: '🎭',
  },
  {
    key: 'sang_froid',
    category: 'DISCIPLINE',
    rarity: 'EPIC',
    title: 'Sang-Froid',
    description: "20 matchs d'affilée sans le moindre carton",
    emoji: '🧊',
  },

  // Impact & résultats — défense, moments individuels, série d'équipe, présence
  {
    key: 'clean_sheet',
    category: 'IMPACT',
    rarity: 'COMMON',
    title: 'La Muraille de Ronchin',
    description: "Être sur la feuille de match d'une rencontre terminée sans encaisser de but",
    emoji: '🧱',
  },
  {
    key: 'cadenas',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Cadenas',
    description: '3 rencontres consécutives sur la feuille de match sans encaisser de but',
    emoji: '🔒',
  },
  {
    key: 'braquage',
    category: 'IMPACT',
    rarity: 'EPIC',
    title: 'Le Braquage',
    description: 'Être l’unique buteur lors d’une victoire 1-0',
    emoji: '🥷',
  },
  {
    key: 'super_sub',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Super Sub',
    description: 'Être remplaçant au coup d’envoi et marquer après ton entrée',
    emoji: '🔄',
  },
  {
    key: 'duo_magique',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Duo Magique',
    description: 'Marquer un but ET délivrer une passe décisive dans le même match',
    emoji: '🤝',
  },
  {
    key: 'porte_bonheur',
    category: 'IMPACT',
    rarity: 'COMMON',
    title: 'Le Porte-Bonheur',
    description: 'Être sur la feuille de match lors de 3 victoires consécutives',
    emoji: '🍀',
  },
  {
    key: 'chat_noir',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Chat Noir',
    description: 'Être sur la feuille de match lors de 3 défaites consécutives',
    emoji: '🐈‍⬛',
  },
  {
    key: 'routard',
    category: 'IMPACT',
    rarity: 'COMMON',
    title: 'Le Routard',
    description: 'Être sur la feuille de match pour 5 déplacements à l’extérieur',
    emoji: '🧳',
  },
  {
    key: 'footballeur_dimanche',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Footballeur du Dimanche',
    description:
      "Jouer un match le week-end sans avoir mis les pieds à un seul entraînement dans la semaine précédente",
    emoji: '🏖️',
  },
  {
    key: 'naufrage',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Naufragé',
    description:
      'Être sur la feuille de match lors d’une défaite par au moins 4 buts d’écart — la fameuse valise de D6',
    emoji: '🤕',
  },
  {
    key: 'equilibriste',
    category: 'IMPACT',
    rarity: 'EPIC',
    title: "L'Équilibriste",
    description:
      'Être sur la feuille de match pour 1 victoire, 1 nul et 1 défaite sur 3 matchs consécutifs',
    emoji: '⚖️',
  },
  {
    key: 'garde_du_corps',
    category: 'IMPACT',
    rarity: 'RARE',
    title: 'Le Garde du Corps',
    description: 'Être nommé remplaçant 5 matchs consécutifs',
    emoji: '🪑',
  },

  // Spécial — comparatifs / méta
  {
    key: 'swiss_army',
    category: 'SPECIAL',
    rarity: 'LEGENDARY',
    title: 'Le Couteau Suisse',
    description: 'Débloquer au moins un badge dans chaque autre catégorie',
    emoji: '🔧',
  },
  {
    key: 'dernier_de_cordee',
    category: 'SPECIAL',
    rarity: 'EPIC',
    title: 'Le Dernier de Cordée',
    description:
      "Avoir joué le plus de matchs de l'équipe sans jamais avoir été élu homme du match",
    emoji: '🐢',
  },
];
