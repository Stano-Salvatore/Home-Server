CREATE VIRTUAL TABLE IF NOT EXISTS `brain_chunks_fts` USING fts5(
	content,
	chunk_id UNINDEXED,
	document_id UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2'
);--> statement-breakpoint
INSERT INTO `brain_chunks_fts`(content, chunk_id, document_id) SELECT content, id, document_id FROM `brain_chunks`;
