import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface Task {
    id: string;
    title: string;
    note: string;
    tags: string[];
    status: 'todo' | 'in_progress' | 'done';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    is_pinned: boolean;
    due_date: string | null;
    reminder_id: string | null;
    reminder_triggered: boolean;
    created_at: string;
    updated_at: string;
}

export interface Snippet {
    id: string;
    title: string;
    content: string;
    language: string;
    command: string;
    created_at: string;
    updated_at?: string;
}

export class DatabaseService {
    private db: Database.Database;

    constructor(storagePath: string) {
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        const dbPath = path.join(storagePath, 'void-list.db');
        this.db = new Database(dbPath);
        this.migrate();
        this.init();
    }

    private migrate() {
        const tables = ['tasks', 'snippets'];
        tables.forEach(table => {
            const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
            if (columns.length === 0) return;

            if (table === 'tasks') {
                const columnNames = columns.map(c => c.name);
                if (!columnNames.includes('is_pinned')) {
                    if (columnNames.includes('pinned')) {
                        this.db.exec('ALTER TABLE tasks RENAME COLUMN pinned TO is_pinned');
                    } else {
                        this.db.exec('ALTER TABLE tasks ADD COLUMN is_pinned INTEGER DEFAULT 0');
                    }
                }
                if (!columnNames.includes('note')) this.db.exec('ALTER TABLE tasks ADD COLUMN note TEXT DEFAULT ""');
                if (!columnNames.includes('tags')) this.db.exec('ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT "[]"');
                if (!columnNames.includes('due_date')) this.db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
                if (!columnNames.includes('reminder_id')) this.db.exec('ALTER TABLE tasks ADD COLUMN reminder_id TEXT');
                if (!columnNames.includes('reminder_triggered')) this.db.exec('ALTER TABLE tasks ADD COLUMN reminder_triggered INTEGER DEFAULT 0');
                if (!columnNames.includes('created_at')) this.db.exec('ALTER TABLE tasks ADD COLUMN created_at TEXT');
            }

            if (table === 'snippets') {
                const columnNames = columns.map(c => c.name);
                if (!columnNames.includes('created_at')) this.db.exec('ALTER TABLE snippets ADD COLUMN created_at TEXT');
                if (!columnNames.includes('updated_at')) this.db.exec('ALTER TABLE snippets ADD COLUMN updated_at TEXT');
                if (!columnNames.includes('command')) this.db.exec('ALTER TABLE snippets ADD COLUMN command TEXT DEFAULT ""');
            }
        });
    }

    private init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT,
                note TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                status TEXT,
                priority TEXT,
                is_pinned INTEGER DEFAULT 0,
                due_date TEXT,
                reminder_id TEXT,
                reminder_triggered INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                title TEXT,
                content TEXT,
                language TEXT,
                command TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS sync_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        const taskCount = (this.db.prepare('SELECT COUNT(*) as count FROM tasks').get() as any).count;
        if (taskCount === 0) {
            this.upsertTask({
                id: 'seed-1',
                title: 'Welcome to Void List! 🚀',
                note: 'This is a productivity tool for developers.',
                tags: ['#welcome'],
                status: 'todo',
                priority: 'high',
                is_pinned: true,
                due_date: new Date().toISOString(),
                reminder_id: null,
                reminder_triggered: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            this.upsertTask({
                id: 'seed-2',
                title: 'Click the circle to change status',
                note: 'You can cycle through Todo -> In Progress -> Done',
                tags: ['#tutorial'],
                status: 'in_progress',
                priority: 'medium',
                is_pinned: false,
                due_date: null,
                reminder_id: null,
                reminder_triggered: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

        const snippetCount = (this.db.prepare('SELECT COUNT(*) as count FROM snippets').get() as any).count;
        if (snippetCount === 0) {
            this.upsertSnippet({
                id: 'seed-s1',
                title: 'Example Bash Snippet',
                content: 'echo "Hello from Void List!"',
                language: 'shellscript',
                command: 'echo-hello',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            this.upsertSnippet({
                id: 'seed-s2',
                title: 'JS Log',
                content: 'console.log("Debug:", data);',
                language: 'javascript',
                command: 'log',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
    }

    getTasks(): Task[] {
        const rows = this.db.prepare('SELECT * FROM tasks ORDER BY is_pinned DESC, updated_at DESC').all() as any[];
        return rows.map(r => ({
            ...r,
            is_pinned: !!r.is_pinned,
            reminder_triggered: !!r.reminder_triggered,
            tags: JSON.parse(r.tags || '[]')
        }));
    }

    upsertTask(task: Task) {
        this.db.prepare(`
            INSERT INTO tasks (id, title, note, tags, status, priority, is_pinned, due_date, reminder_id, reminder_triggered, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                note = excluded.note,
                tags = excluded.tags,
                status = excluded.status,
                priority = excluded.priority,
                is_pinned = excluded.is_pinned,
                due_date = excluded.due_date,
                reminder_id = excluded.reminder_id,
                reminder_triggered = excluded.reminder_triggered,
                updated_at = excluded.updated_at
        `).run(
            task.id, 
            task.title, 
            task.note || '', 
            JSON.stringify(task.tags || []), 
            task.status, 
            task.priority, 
            task.is_pinned ? 1 : 0, 
            task.due_date, 
            task.reminder_id, 
            task.reminder_triggered ? 1 : 0,
            task.created_at, 
            task.updated_at
        );
    }

    updateTask(task: Partial<Task> & { id: string }) {
        const keys = Object.keys(task).filter(k => k !== 'id');
        const sets = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => {
            const val = (task as any)[k];
            if (typeof val === 'boolean') return val ? 1 : 0;
            if (k === 'tags') return JSON.stringify(val);
            return val;
        });
        this.db.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).run(...values, task.id);
    }

    deleteTask(id: string) {
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    }

    getSnippets(): Snippet[] {
        return this.db.prepare('SELECT * FROM snippets ORDER BY created_at DESC').all() as Snippet[];
    }

    upsertSnippet(snippet: Snippet) {
        this.db.prepare(`
            INSERT INTO snippets (id, title, content, language, command, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                language = excluded.language,
                command = excluded.command,
                updated_at = excluded.updated_at
        `).run(snippet.id, snippet.title, snippet.content, snippet.language, snippet.command || '', snippet.created_at, snippet.updated_at || snippet.created_at);
    }

    updateSnippet(snippet: Partial<Snippet> & { id: string }) {
        const sets = Object.keys(snippet).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
        const values = Object.keys(snippet).filter(k => k !== 'id').map(k => {
            const val = (snippet as any)[k];
            if (typeof val === 'boolean') return val ? 1 : 0;
            return val;
        });
        this.db.prepare(`UPDATE snippets SET ${sets} WHERE id = ?`).run(...values, snippet.id);
    }

    deleteSnippet(id: string) {
        this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
    }

    getSetting(key: string): string | null {
        const row = this.db.prepare('SELECT value FROM sync_settings WHERE key = ?').get(key) as { value: string } | undefined;
        return row ? row.value : null;
    }

    setSetting(key: string, value: string) {
        this.db.prepare('INSERT OR REPLACE INTO sync_settings (key, value) VALUES (?, ?)').run(key, value);
    }
}
