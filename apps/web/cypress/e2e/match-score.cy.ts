// Score entry: every team is named, the home side sits on the left, and what's saved is the
// (home, away) pair from the API's point of view whichever side we are on.

const COACH_EMAIL = Cypress.env('COACH_EMAIL') || 'e2e-coach@ronchin-us.fr'
const COACH_PASSWORD = Cypress.env('COACH_PASSWORD') || 'E2eCoachPassword123!'
const OPPONENT = 'E2E Score FC'

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function dismissOverlays() {
  // one-time full-screen announcements (trophy tour, ceremony) — same handling as smoke.cy.ts
  cy.get('body').then(($body) => {
    if ($body.find('button:contains("Plus tard")').length > 0) {
      cy.contains('button', 'Plus tard').click()
    }
  })
}

describe('Saisie du score', () => {
  let token: string
  let matchId: string

  beforeEach(() => {
    cy.request('POST', '/api/auth/login', { email: COACH_EMAIL, password: COACH_PASSWORD }).then(
      ({ body }) => {
        token = body.accessToken
        // Started yesterday so the score card is unlocked (only editable once kickoff has passed)
        cy.request({
          method: 'POST',
          url: '/api/matches',
          headers: { Authorization: `Bearer ${token}` },
          body: {
            date: yesterday(),
            kickOffTime: '15:00',
            opponent: OPPONENT,
            homeAway: 'AWAY',
            source: 'FRIENDLY',
          },
        }).then((res) => {
          matchId = res.body.id
        })
      },
    )
  })

  afterEach(() => {
    cy.request({
      method: 'DELETE',
      url: `/api/matches/${matchId}`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    })
  })

  it('nomme chaque équipe, met le domicile à gauche et enregistre dans le bon sens', () => {
    cy.visit('/login')
    cy.get('#email').type(COACH_EMAIL)
    cy.get('#password').type(COACH_PASSWORD)
    cy.contains('button', 'Se connecter').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    dismissOverlays()

    cy.visit(`/matches/${matchId}`)

    // Away match: the opponent is the home side, so it comes first
    cy.contains(`${OPPONENT} 0 – 0 US Ronchin`).should('be.visible')
    cy.contains('Domicile').should('be.visible')
    cy.contains('Extérieur · nous').should('be.visible')

    // 3 for us, 2 for them
    for (let i = 0; i < 3; i++) cy.get('[aria-label="Ajouter un but à US Ronchin"]').click()
    for (let i = 0; i < 2; i++) cy.get(`[aria-label="Ajouter un but à ${OPPONENT}"]`).click()

    cy.contains('Victoire').should('be.visible')
    cy.contains(`${OPPONENT} 2 – 3 US Ronchin`).should('be.visible')

    cy.contains('button', 'Enregistrer le score').click()
    cy.contains('button', 'Score enregistré').should('be.disabled')

    // Stored as (home = opponent, away = us)
    cy.request({
      url: `/api/matches/${matchId}`,
      headers: { Authorization: `Bearer ${token}` },
    }).then(({ body }) => {
      expect(body.scoreHome).to.eq(2)
      expect(body.scoreAway).to.eq(3)
      expect(body.status).to.eq('PLAYED')
    })
  })

  it('ne descend pas sous zéro', () => {
    cy.visit('/login')
    cy.get('#email').type(COACH_EMAIL)
    cy.get('#password').type(COACH_PASSWORD)
    cy.contains('button', 'Se connecter').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    dismissOverlays()
    cy.visit(`/matches/${matchId}`)

    cy.get('[aria-label="Retirer un but à US Ronchin"]').should('be.disabled')
  })
})
