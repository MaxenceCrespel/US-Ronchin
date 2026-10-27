/** What a push is about — each player can mute any of these from their notifications screen
 * (User.mutedNotificationCategories). A push sent without a category always goes out. */
export enum NotificationCategory {
  ATTENDANCE_REMINDERS = 'ATTENDANCE_REMINDERS',
  CONVOCATIONS = 'CONVOCATIONS',
  MATCH_RESULTS = 'MATCH_RESULTS',
  TRAINING_TEAMS = 'TRAINING_TEAMS',
  AWARDS = 'AWARDS',
  BADGES = 'BADGES',
  BIRTHDAYS = 'BIRTHDAYS',
  /** Coach/admin to-dos: new player to validate or rate, missing result, attendance to take. */
  COACH = 'COACH',
}
