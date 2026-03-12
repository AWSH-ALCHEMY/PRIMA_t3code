#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

type Role = "user" | "assistant";

interface ImportMessage {
  id: string;
  role: Role;
  text: string;
  createdAt: string;
}

interface ImportThread {
  threadId: string;
  sessionId: string;
  projectId: string;
  workspaceRoot: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: ImportMessage[];
}

interface Args {
  codexSessionsDir: string;
  stateDbPath: string;
  dryRun: boolean;
  listOnly: boolean;
  includeCommentary: boolean;
  limit: number | null;
  backupPath: string | null;
  pick: string | null;
  sessionIds: string[] | null;
}

interface SessionParseResult {
  sourceFile: string;
  sessionId: string;
  cwd: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: Array<{ role: Role; text: string; createdAt: string }>;
}

function normalizeCandidateTitle(input: string): string {
  return (
    input
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function isBoilerplateTitle(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    lowered.startsWith("# agents.md instructions for ") ||
    lowered.startsWith("<environment_context>") ||
    lowered.includes("<instructions>")
  );
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    codexSessionsDir: path.join(homedir(), ".codex", "sessions"),
    stateDbPath: path.join(homedir(), ".t3", "dev", "state.sqlite"),
    dryRun: false,
    listOnly: false,
    includeCommentary: false,
    limit: null,
    backupPath: null,
    pick: null,
    sessionIds: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--list") {
      out.listOnly = true;
      continue;
    }
    if (arg === "--include-commentary") {
      out.includeCommentary = true;
      continue;
    }
    if (arg === "--codex-sessions-dir") {
      out.codexSessionsDir = expandHome(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--state-db") {
      out.stateDbPath = expandHome(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--limit") {
      const parsed = Number(argv[i + 1] ?? "");
      out.limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
      i += 1;
      continue;
    }
    if (arg === "--backup-path") {
      out.backupPath = expandHome(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--pick") {
      out.pick = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--session-ids") {
      const raw = argv[i + 1] ?? "";
      out.sessionIds = raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return out;
}

function printHelp(): void {
  console.log(`Import Codex JSONL sessions into T3 projection tables.

Usage:
  node scripts/import-codex-chats.ts [options]

Options:
  --codex-sessions-dir <path>   Source directory (default: ~/.codex/sessions)
  --state-db <path>             T3 sqlite path (default: ~/.t3/dev/state.sqlite)
  --list                        List importable sessions and exit
  --pick <expr>                 Select session indexes (example: 1,3,8-12)
  --session-ids <csv>           Select by session IDs (comma-separated)
  --dry-run                     Parse and print counts without writing
  --include-commentary          Include assistant commentary messages
  --limit <n>                   Parse at most N session files
  --backup-path <path>          Explicit sqlite backup output path
  --help                        Show this help
`);
}

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(".jsonl")) {
        out.push(fullPath);
      }
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const segment of content) {
    if (!segment || typeof segment !== "object") continue;
    const segmentType = (segment as { type?: unknown }).type;
    if (segmentType !== "input_text" && segmentType !== "output_text") continue;
    const text = (segment as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      parts.push(text);
    }
  }
  return parts.join("\n\n").trim();
}

function fallbackSessionIdFromPath(filePath: string): string {
  const base = path.basename(filePath);
  const match = base.match(/rollout-[^-]+-[^-]+-[^-]+-[^-]+-(.+)\.jsonl$/);
  if (match?.[1]) return match[1];
  return createHash("sha1").update(filePath).digest("hex");
}

function parseCodexSessionFile(
  filePath: string,
  includeCommentary: boolean,
): SessionParseResult | null {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  let sessionId = fallbackSessionIdFromPath(filePath);
  let cwd = "";
  let model = "gpt-5.4";
  let createdAt: string | null = null;
  let updatedAt: string | null = null;
  const messages: Array<{ role: Role; text: string; createdAt: string }> = [];
  const titleCandidates: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = safeJsonParse(trimmed);
    if (!entry || typeof entry !== "object") continue;

    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    const entryTimestamp = typeof timestamp === "string" ? timestamp : new Date().toISOString();
    if (!createdAt) createdAt = entryTimestamp;
    updatedAt = entryTimestamp;

    const type = (entry as { type?: unknown }).type;
    if (type === "event_msg") {
      const payload = (entry as { payload?: unknown }).payload;
      if (payload && typeof payload === "object") {
        const payloadType = (payload as { type?: unknown }).type;
        if (payloadType === "user_message") {
          const message = (payload as { message?: unknown }).message;
          if (typeof message === "string" && message.trim().length > 0) {
            titleCandidates.push(message);
          }
        }
      }
    }

    if (type === "session_meta") {
      const payload = (entry as { payload?: unknown }).payload;
      if (payload && typeof payload === "object") {
        const id = (payload as { id?: unknown }).id;
        if (typeof id === "string" && id.trim().length > 0) sessionId = id;
        const payloadCwd = (payload as { cwd?: unknown }).cwd;
        if (typeof payloadCwd === "string" && payloadCwd.trim().length > 0) cwd = payloadCwd;
      }
      continue;
    }

    if (type === "turn_context") {
      const payload = (entry as { payload?: unknown }).payload;
      if (payload && typeof payload === "object") {
        const payloadCwd = (payload as { cwd?: unknown }).cwd;
        if (!cwd && typeof payloadCwd === "string" && payloadCwd.trim().length > 0)
          cwd = payloadCwd;
        const payloadModel = (payload as { model?: unknown }).model;
        if (typeof payloadModel === "string" && payloadModel.trim().length > 0)
          model = payloadModel;
      }
      continue;
    }

    if (type !== "response_item") continue;
    const payload = (entry as { payload?: unknown }).payload;
    if (!payload || typeof payload !== "object") continue;
    const payloadType = (payload as { type?: unknown }).type;
    if (payloadType !== "message") continue;
    const role = (payload as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") continue;

    const phase = (payload as { phase?: unknown }).phase;
    if (!includeCommentary && role === "assistant" && phase === "commentary") continue;

    const text = extractTextFromContent((payload as { content?: unknown }).content);
    if (!text) continue;

    messages.push({ role, text, createdAt: entryTimestamp });
    if (role === "user") {
      titleCandidates.push(text);
    }
  }

  if (messages.length === 0) return null;
  const fallbackTitle = path.basename(filePath).replace(/\.jsonl$/, "");
  const title =
    titleCandidates
      .map(normalizeCandidateTitle)
      .find((candidate) => candidate.length > 0 && !isBoilerplateTitle(candidate))
      ?.slice(0, 80) ?? fallbackTitle;

  return {
    sourceFile: filePath,
    sessionId,
    cwd: cwd || process.cwd(),
    model,
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? createdAt ?? new Date().toISOString(),
    title,
    messages,
  };
}

function parsePickExpression(input: string): Set<number> {
  const out = new Set<number>();
  for (const rawToken of input.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        throw new Error(`Invalid --pick range: ${token}`);
      }
      for (let i = start; i <= end; i += 1) out.add(i);
      continue;
    }

    const single = Number(token);
    if (!Number.isFinite(single) || single < 1 || !Number.isInteger(single)) {
      throw new Error(`Invalid --pick value: ${token}`);
    }
    out.add(single);
  }
  return out;
}

function selectSessions(sessions: SessionParseResult[], args: Args): SessionParseResult[] {
  let selected = sessions;

  if (args.pick && args.pick.trim().length > 0) {
    const picks = parsePickExpression(args.pick);
    selected = selected.filter((_, index) => picks.has(index + 1));
  }

  if (args.sessionIds && args.sessionIds.length > 0) {
    const idSet = new Set(args.sessionIds);
    selected = selected.filter((session) => idSet.has(session.sessionId));
  }

  return selected;
}

function printSessionList(sessions: SessionParseResult[]): void {
  for (const [index, session] of sessions.entries()) {
    console.log(
      `${String(index + 1).padStart(4, " ")} | ${session.title} | ${session.sessionId} | ${session.model} | ${session.messages.length} msgs`,
    );
  }
}

function sqlEscape(value: string): string {
  return value.replaceAll("'", "''");
}

function shellEscapeSingle(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function readExistingProjectsByWorkspace(dbPath: string): Map<string, string> {
  const query =
    "SELECT project_id || '|' || workspace_root FROM projection_projects WHERE deleted_at IS NULL;";
  const output = execFileSync("sqlite3", [dbPath, query], { encoding: "utf8" }).trim();
  const map = new Map<string, string>();
  if (!output) return map;
  for (const line of output.split("\n")) {
    const split = line.indexOf("|");
    if (split < 0) continue;
    const projectId = line.slice(0, split);
    const workspaceRoot = line.slice(split + 1);
    if (projectId && workspaceRoot) map.set(workspaceRoot, projectId);
  }
  return map;
}

function deterministicProjectId(workspaceRoot: string): string {
  const digest = createHash("sha1").update(workspaceRoot).digest("hex").slice(0, 24);
  return `codex-import-project-${digest}`;
}

function deterministicImportEventId(
  type: "project-created" | "thread-created",
  id: string,
): string {
  const digest = createHash("sha1").update(`${type}:${id}`).digest("hex").slice(0, 32);
  return `codex-import-event-${digest}`;
}

function mapSessionsToThreads(
  sessions: SessionParseResult[],
  existingProjects: Map<string, string>,
): ImportThread[] {
  const threads: ImportThread[] = [];
  const projectMap = new Map(existingProjects);

  for (const session of sessions) {
    const workspaceRoot = session.cwd;
    let projectId = projectMap.get(workspaceRoot);
    if (!projectId) {
      projectId = deterministicProjectId(workspaceRoot);
      projectMap.set(workspaceRoot, projectId);
    }

    const threadId = `codex-import-thread-${session.sessionId}`;
    const messages: ImportMessage[] = session.messages.map((message, index) => ({
      id: `codex-import-msg-${session.sessionId}-${String(index + 1).padStart(4, "0")}`,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
    }));

    threads.push({
      threadId,
      sessionId: session.sessionId,
      projectId,
      workspaceRoot,
      title: session.title,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages,
    });
  }

  return threads;
}

function buildSql(threads: ImportThread[]): string {
  const projects = new Map<
    string,
    { projectId: string; workspaceRoot: string; createdAt: string; model: string }
  >();
  for (const thread of threads) {
    if (!projects.has(thread.projectId)) {
      projects.set(thread.projectId, {
        projectId: thread.projectId,
        workspaceRoot: thread.workspaceRoot,
        createdAt: thread.createdAt,
        model: thread.model,
      });
    }
  }

  const lines: string[] = [];
  lines.push("BEGIN IMMEDIATE TRANSACTION;");

  for (const project of projects.values()) {
    const title = path.basename(project.workspaceRoot) || project.workspaceRoot;
    const projectCreatedPayload = {
      projectId: project.projectId,
      title,
      workspaceRoot: project.workspaceRoot,
      defaultModel: project.model,
      scripts: [],
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    };
    const projectCreatedEventId = deterministicImportEventId("project-created", project.projectId);

    lines.push(
      `INSERT OR IGNORE INTO projection_projects (` +
        `project_id, title, workspace_root, default_model, scripts_json, created_at, updated_at, deleted_at` +
        `) VALUES (` +
        `'${sqlEscape(project.projectId)}',` +
        `'${sqlEscape(title)}',` +
        `'${sqlEscape(project.workspaceRoot)}',` +
        `'${sqlEscape(project.model)}',` +
        `'[]',` +
        `'${sqlEscape(project.createdAt)}',` +
        `'${sqlEscape(project.createdAt)}',` +
        `NULL` +
        `);`,
    );

    lines.push(
      `INSERT INTO orchestration_events (` +
        `event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at, command_id, causation_event_id, correlation_id, actor_kind, payload_json, metadata_json` +
        `) SELECT ` +
        `'${sqlEscape(projectCreatedEventId)}', ` +
        `'project', ` +
        `'${sqlEscape(project.projectId)}', ` +
        `0, ` +
        `'project.created', ` +
        `'${sqlEscape(project.createdAt)}', ` +
        `NULL, NULL, NULL, ` +
        `'server', ` +
        `'${sqlEscape(JSON.stringify(projectCreatedPayload))}', ` +
        `'{}' ` +
        `WHERE NOT EXISTS (` +
        `SELECT 1 FROM orchestration_events WHERE aggregate_kind = 'project' AND stream_id = '${sqlEscape(project.projectId)}'` +
        `);`,
    );
  }

  for (const thread of threads) {
    const latestMessage = thread.messages.at(-1);
    const latestTurnId = latestMessage ? `codex-import-turn-${thread.sessionId}` : null;
    const threadCreatedPayload = {
      threadId: thread.threadId,
      projectId: thread.projectId,
      title: thread.title,
      model: thread.model,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
    const threadCreatedEventId = deterministicImportEventId("thread-created", thread.threadId);

    lines.push(
      `INSERT OR IGNORE INTO projection_threads (` +
        `thread_id, project_id, title, model, branch, worktree_path, latest_turn_id, created_at, updated_at, deleted_at, runtime_mode, interaction_mode` +
        `) VALUES (` +
        `'${sqlEscape(thread.threadId)}',` +
        `'${sqlEscape(thread.projectId)}',` +
        `'${sqlEscape(thread.title)}',` +
        `'${sqlEscape(thread.model)}',` +
        `NULL, NULL, ` +
        `${latestTurnId ? `'${sqlEscape(latestTurnId)}'` : "NULL"},` +
        `'${sqlEscape(thread.createdAt)}',` +
        `'${sqlEscape(thread.updatedAt)}',` +
        `NULL, 'full-access', 'default'` +
        `);`,
    );

    lines.push(
      `INSERT INTO orchestration_events (` +
        `event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at, command_id, causation_event_id, correlation_id, actor_kind, payload_json, metadata_json` +
        `) SELECT ` +
        `'${sqlEscape(threadCreatedEventId)}', ` +
        `'thread', ` +
        `'${sqlEscape(thread.threadId)}', ` +
        `0, ` +
        `'thread.created', ` +
        `'${sqlEscape(thread.createdAt)}', ` +
        `NULL, NULL, NULL, ` +
        `'server', ` +
        `'${sqlEscape(JSON.stringify(threadCreatedPayload))}', ` +
        `'{}' ` +
        `WHERE NOT EXISTS (` +
        `SELECT 1 FROM orchestration_events WHERE aggregate_kind = 'thread' AND stream_id = '${sqlEscape(thread.threadId)}'` +
        `);`,
    );

    for (const message of thread.messages) {
      lines.push(
        `INSERT OR IGNORE INTO projection_thread_messages (` +
          `message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at, attachments_json` +
          `) VALUES (` +
          `'${sqlEscape(message.id)}',` +
          `'${sqlEscape(thread.threadId)}',` +
          `NULL,` +
          `'${sqlEscape(message.role)}',` +
          `'${sqlEscape(message.text)}',` +
          `0,` +
          `'${sqlEscape(message.createdAt)}',` +
          `'${sqlEscape(message.createdAt)}',` +
          `NULL` +
          `);`,
      );
    }
  }

  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

function createSqliteBackup(dbPath: string, backupPath: string): void {
  execFileSync("sqlite3", [dbPath, `.backup ${shellEscapeSingle(backupPath)}`], {
    encoding: "utf8",
  });
}

function validatePaths(args: Args): void {
  if (!statSync(args.codexSessionsDir).isDirectory()) {
    throw new Error(`Codex sessions directory does not exist: ${args.codexSessionsDir}`);
  }
  if (!statSync(args.stateDbPath).isFile()) {
    throw new Error(`T3 sqlite db not found: ${args.stateDbPath}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  validatePaths(args);

  const allFiles = walkFiles(args.codexSessionsDir);
  const files = args.limit ? allFiles.slice(0, args.limit) : allFiles;
  const parsedSessions: SessionParseResult[] = [];

  for (const filePath of files) {
    const parsed = parseCodexSessionFile(filePath, args.includeCommentary);
    if (parsed) parsedSessions.push(parsed);
  }

  if (args.listOnly) {
    printSessionList(parsedSessions);
    return;
  }

  const sessions = selectSessions(parsedSessions, args);
  const existingProjects = readExistingProjectsByWorkspace(args.stateDbPath);
  const threads = mapSessionsToThreads(sessions, existingProjects);
  const messageCount = threads.reduce((sum, thread) => sum + thread.messages.length, 0);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          sourceFilesScanned: files.length,
          sessionsParsed: parsedSessions.length,
          sessionsSelected: sessions.length,
          threadsToImport: threads.length,
          messagesToImport: messageCount,
          includeCommentary: args.includeCommentary,
          stateDbPath: args.stateDbPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (threads.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          noOp: true,
          sourceFilesScanned: files.length,
          sessionsParsed: parsedSessions.length,
          sessionsSelected: sessions.length,
          threadsImported: 0,
          messagesImported: 0,
          includeCommentary: args.includeCommentary,
          stateDbPath: args.stateDbPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  const defaultBackupPath = path.join(
    path.dirname(args.stateDbPath),
    `state.backup.codex-import.${Date.now()}-${randomUUID()}.sqlite`,
  );
  const backupPath = args.backupPath ?? defaultBackupPath;
  createSqliteBackup(args.stateDbPath, backupPath);

  const sql = buildSql(threads);
  const tmpDir = mkdtempSync(path.join(tmpdir(), "t3-codex-import-"));
  const sqlFile = path.join(tmpDir, "import.sql");
  writeFileSync(sqlFile, sql, "utf8");

  try {
    execFileSync("sqlite3", [args.stateDbPath, `.read ${shellEscapeSingle(sqlFile)}`], {
      encoding: "utf8",
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        backupPath,
        sourceFilesScanned: files.length,
        sessionsParsed: parsedSessions.length,
        sessionsSelected: sessions.length,
        threadsImported: threads.length,
        messagesImported: messageCount,
        includeCommentary: args.includeCommentary,
        stateDbPath: args.stateDbPath,
      },
      null,
      2,
    ),
  );
}

main();
