import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const llamacppServers = sqliteTable("llamacpp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  modelPath: text("model_path").notNull(),
  port: integer("port").notNull(),
  extraArgs: text("extra_args"),
  tmuxSession: text("tmux_session"),
  status: text("status").notNull().default("stopped"), // running | stopped
  pid: integer("pid"),
  lastStartedAt: integer("last_started_at"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  backend: text("backend").notNull(), // ollama | llamacpp
  modelId: text("model_id").notNull(),
  systemPrompt: text("system_prompt"),
  ragEnabled: integer("rag_enabled", { mode: "boolean" }).notNull().default(false),
  wikiEnabled: integer("wiki_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // system | user | assistant
    content: text("content").notNull(),
    citationsJson: text("citations_json"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

export const brainDocuments = sqliteTable(
  "brain_documents",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(), // obsidian | library | upload | manual
    sourcePath: text("source_path").notNull(),
    title: text("title").notNull(),
    contentHash: text("content_hash").notNull(),
    indexedAt: integer("indexed_at")
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("brain_documents_source_path_idx").on(t.sourcePath)],
);

export const brainChunks = sqliteTable(
  "brain_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => brainDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    embedding: blob("embedding", { mode: "buffer" }).notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("brain_chunks_document_idx").on(t.documentId)],
);

export const memoryFacts = sqliteTable("memory_facts", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  category: text("category"),
  source: text("source"), // manual | agent
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const libraryBooks = sqliteTable(
  "library_books",
  {
    id: text("id").primaryKey(),
    filePath: text("file_path").notNull(),
    format: text("format").notNull(), // epub | pdf
    title: text("title").notNull(),
    author: text("author"),
    coverPath: text("cover_path"),
    textExtracted: integer("text_extracted", { mode: "boolean" }).notNull().default(false),
    brainDocumentId: text("brain_document_id").references(() => brainDocuments.id, {
      onDelete: "set null",
    }),
    fileHash: text("file_hash").notNull(),
    addedAt: integer("added_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("library_books_file_path_idx").on(t.filePath)],
);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  backend: text("backend").notNull(), // ollama | llamacpp
  modelId: text("model_id").notNull(),
  triggerType: text("trigger_type").notNull(), // manual | cron | file_watch
  cronExpression: text("cron_expression"),
  watchPath: text("watch_path"),
  watchGlob: text("watch_glob"),
  saveToVault: integer("save_to_vault", { mode: "boolean" }).notNull().default(false),
  vaultFilenameTemplate: text("vault_filename_template"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const taskRuns = sqliteTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // running | success | error
    triggerSource: text("trigger_source").notNull(), // manual | cron | file_watch
    startedAt: integer("started_at")
      .notNull()
      .default(sql`(unixepoch())`),
    finishedAt: integer("finished_at"),
    output: text("output"),
    error: text("error"),
  },
  (t) => [index("task_runs_task_idx").on(t.taskId)],
);

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  kind: text("kind").notNull(), // image | document | other
  thumbnailPath: text("thumbnail_path"),
  brainDocumentId: text("brain_document_id").references(() => brainDocuments.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
