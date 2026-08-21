import { pgTable, text, boolean, integer, timestamp, uuid, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";

export const weekPhaseEnum = pgEnum("week_phase", [
  "preseason",
  "regular",
  "wildcard",
  "divisional",
  "conf",
  "superbowl",
]);

export const pickSideEnum = pgEnum("pick_side", ["favorite", "underdog"]);
export const favoriteSideEnum = pgEnum("favorite_side", ["home", "away"]);
export const atsResultEnum = pgEnum("ats_result", ["favorite", "underdog", "push"]);
export const gameStatusEnum = pgEnum("game_status", ["scheduled", "in_progress", "final"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const seasons = pgTable("seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  year: integer("year").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weeks = pgTable(
  "weeks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    phase: weekPhaseEnum("phase").notNull().default("regular"),
    seasonType: integer("season_type").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weeks_season_week_idx").on(t.seasonId, t.weekNumber, t.seasonType)],
);

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  weekId: uuid("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  espnEventId: text("espn_event_id").notNull().unique(),
  awayTeam: text("away_team").notNull(),
  awayAbbrev: text("away_abbrev").notNull(),
  homeTeam: text("home_team").notNull(),
  homeAbbrev: text("home_abbrev").notNull(),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  spread: integer("spread_cents"),
  favoriteSide: favoriteSideEnum("favorite_side"),
  oddsAway: integer("odds_away"),
  oddsHome: integer("odds_home"),
  atsResult: atsResultEnum("ats_result"),
  status: gameStatusEnum("status").notNull().default("scheduled"),
  awayScore: integer("away_score"),
  homeScore: integer("home_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const picks = pgTable(
  "picks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    pick: pickSideEnum("pick").notNull(),
    isConfidenceBet: boolean("is_confidence_bet").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("picks_user_game_idx").on(t.userId, t.gameId)],
);

export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  registrationOpen: boolean("registration_open").notNull().default(true),
  currentSeasonId: uuid("current_season_id").references(() => seasons.id),
  confidenceBetsPerWeek: integer("confidence_bets_per_week").notNull().default(5),
});

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Pick = typeof picks.$inferSelect;
