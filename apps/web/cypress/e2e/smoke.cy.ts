// Smoke tests only — covers the golden path (login, home, main nav), not
// exhaustive coverage. First e2e suite for this project; extend as the
// app's critical flows grow.

const COACH_EMAIL = Cypress.env('COACH_EMAIL') || 'e2e-coach@ronchin-us.fr'
const COACH_PASSWORD = Cypress.env('COACH_PASSWORD') || 'E2eCoachPassword123!'

// `expectTour`: the onboarding tour only auto-launches once per account —
// the very first login after the coach is seeded (see "hasSeenOnboarding"
// in OnboardingTour.tsx). Every `it()` below reuses the SAME seeded
// account and Cypress runs them in file order within a spec, so only the
// first login here ever sees it; a later login must NOT wait for a close
// button that will never appear.
function login(expectTour: boolean) {
  cy.visit('/login')
  cy.get('#email').type(COACH_EMAIL)
  cy.get('#password').type(COACH_PASSWORD)
  cy.contains('button', 'Se connecter').click()
  cy.url().should('eq', Cypress.config().baseUrl + '/')

  if (expectTour) {
    // Its full-screen overlay blocks every other click on the page. It
    // takes a moment to locate its spotlight target before the close
    // button even renders, and closing it PATCHes hasSeenOnboarding
    // server-side before the overlay actually unmounts — wait for both
    // rather than racing the next click.
    cy.get('[aria-label="Fermer le tutoriel"]', { timeout: 10000 }).click()
    cy.get('[aria-label="Fermer le tutoriel"]').should('not.exist')
  }
}

describe('Parcours de base', () => {
  it("redirige vers /login quand on n'est pas connecté", () => {
    cy.visit('/')
    cy.url().should('include', '/login')
  })

  it('permet à un coach de se connecter et voir la page d\'accueil', () => {
    login(true)
    cy.contains(/^(Bonjour|Bon après-midi|Bonsoir)/).should('be.visible')
  })

  it('permet de naviguer vers Entraînements et Matchs', () => {
    login(false)

    cy.contains('a', 'Entraînements').click()
    cy.url().should('include', '/trainings')

    cy.contains('a', 'Matchs').click()
    cy.url().should('include', '/matches')
  })
})
