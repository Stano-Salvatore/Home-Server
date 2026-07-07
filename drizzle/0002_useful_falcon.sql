CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`instructions` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `brain_documents` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `conversations` ADD `project_id` text REFERENCES projects(id);