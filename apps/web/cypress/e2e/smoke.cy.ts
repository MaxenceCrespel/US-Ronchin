// Smoke tests only — covers the golden path (login, home, main nav), not
// exhaustive coverage. First e2e suite for this project; extend as the
// app's critical flows grow.

const COACH_EMAIL = Cypress.env('COACH_EMAIL') || 'e2e-coach@ronchin-us.fr'
const COACH_PASSWORD = Cypress.env('COACH_PASSWORD') || 'E2eCoachPassword123!'

function login() {
  cy.visit('/login')
  cy.get('#email').type(COACH_EMAIL)
  cy.get('#password').type(COACH_PASSWORD)
  cy.contains('button', 'Se connecter').click()
  cy.url().should('eq', Cypress.config().baseUrl + '/')

  // A brand-new account (always the case here — every test run seeds a fresh
  // coach) auto-launches the onboarding tour, whose full-screen overlay
  // blocks every other click on the page. It takes a moment to locate its
  // spotlight target before the close button even renders, and closing it
  // PATCHes hasSeenOnboarding server-side before the overlay actually
  // unmounts — wait for both rather than racing the next click.
  cy.get('[aria-label="Fermer le tutoriel"]', { timeout: 10000 }).click()
  cy.get('[aria-label="Fermer le tutoriel"]').should('not.exist')
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
