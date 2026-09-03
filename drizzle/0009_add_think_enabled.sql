-- Per-conversation reasoning. Off by default: thinking roughly triples the
-- wall time, and most questions do not need it.
ALTER TABLE `conversations` ADD `think_enabled` integer DEFAULT false NOT NULL;
