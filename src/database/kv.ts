import { App } from "electron";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { join } from "node:path";

class SQLiteBackedKV<T = unknown> {
	db: DatabaseSync;
	stmtGet: StatementSync;
	stmtSet: StatementSync;
	stmtDel: StatementSync;
	stmtAll: StatementSync;

	constructor(app: App, filename: string) {
		this.db = new DatabaseSync(join(app.getPath("userData"), filename));
		this.db.exec(`
            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

		this.stmtGet = this.db.prepare("SELECT value FROM kv WHERE key = ?");
		this.stmtSet = this.db.prepare(`
            INSERT INTO kv (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
		this.stmtDel = this.db.prepare("DELETE FROM kv WHERE key = ?");
		this.stmtAll = this.db.prepare("SELECT key, value FROM kv");
	}

	get(key: string): T | undefined {
		const row = this.stmtGet.get(key) as { value: string } | undefined;
		return row ? (JSON.parse(row.value) as T) : undefined;
	}

	set(key: string, value: T): void {
		this.stmtSet.run(key, JSON.stringify(value));
	}

	delete(key: string): void {
		this.stmtDel.run(key);
	}

	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	entries(): [string, T][] {
		const rows = this.stmtAll.all() as { key: string; value: string }[];
		return rows.map(r => [r.key, JSON.parse(r.value) as T]);
	}

	close(): void {
		this.db.close();
	}
}

export default SQLiteBackedKV;
