CREATE TABLE manuscripts (
 id TEXT PRIMARY KEY NOT NULL,
 payload_hash TEXT NOT NULL,
 category TEXT NOT NULL,
 student_no TEXT NOT NULL,
 author TEXT NOT NULL,
 editor TEXT NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT '검토 대기' CHECK (status IN ('검토 대기','편집 완료')),
 submitted TEXT NOT NULL,
 updated TEXT NOT NULL,
 version TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX manuscripts_submitted_idx ON manuscripts(submitted);
--> statement-breakpoint
CREATE TABLE administrators (user_id TEXT PRIMARY KEY NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE request_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires INTEGER NOT NULL);
