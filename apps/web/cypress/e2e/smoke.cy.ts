// Smoke tests only — covers the golden path (login, home, main nav), not
// exhaustive coverage. First e2e suite for this project; extend as the
// app's critical flows grow.

const COACH_EMAIL = Cypress.env('COACH_EMAIL') || 'e2e-coach@ronchin-us.fr'
const COACH_PASSWORD = Cypress.env('COACH_PASSWORD') || 'E2eCoachPassword123!'

// The seed script (seed-coach.ts) creates the account with hasSeenOnboarding
// already true and a complete profile — the onboarding tour and the mandatory
// /complete-profile gate never trigger for it, so login always lands straight
// on the real home page.
function login() {
  cy.visit('/login')
  cy.get('#email').type(COACH_EMAIL)
  cy.get('#password').type(COACH_PASSWORD)
  cy.contains('button', 'Se connecter').click()
  cy.url().should('eq', Cypress.config().baseUrl + '/')
}

describe('Parcours de base', () => {
  it("redirige vers /login quand on n'est pas connecté", () => {
    cy.visit('/')
    cy.url().should('include', '/login')
  })

  it('permet à un coach de se connecter et voir la page d\'accueil', () => {
    login()
    cy.contains(/^(Bonjour|Bon après-midi|Bonsoir)/).should('be.visible')
  })

  it('permet de naviguer vers Entraînements et Matchs', () => {
    login()

    cy.contains('a', 'Entraînements').click()
    cy.url().should('include', '/trainings')

    cy.contains('a', 'Matchs').click()
    cy.url().should('include', '/matches')
  })
})
