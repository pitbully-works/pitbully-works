CREATE TABLE IF NOT EXISTS ai_questions (
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  flow TEXT NOT NULL,
  stage INTEGER NOT NULL,
  PRIMARY KEY (subject, day, flow)
);

CREATE INDEX IF NOT EXISTS ai_questions_day ON ai_questions (day);
