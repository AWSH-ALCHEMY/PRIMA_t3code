import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN thread_kind TEXT NOT NULL DEFAULT 'normal'
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_kind_hidden
    ON projection_threads(thread_kind, is_hidden)
  `;
});
