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

interface DatabaseSchema {
    tasks: Task[];
    snippets: Snippet[];
    settings: Record<string, string>;
}

export class DatabaseService {
    private dbPath: string;
    private data: DatabaseSchema = { tasks: [], snippets: [], settings: {} };

    constructor(storagePath: string) {
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.dbPath = path.join(storagePath, 'void-list.json');
        this.init();
    }

    private load() {
        if (fs.existsSync(this.dbPath)) {
            try {
                const content = fs.readFileSync(this.dbPath, 'utf8');
                this.data = JSON.parse(content);
                // Schema validation / migration if needed
                if (!this.data.tasks) this.data.tasks = [];
                if (!this.data.snippets) this.data.snippets = [];
                if (!this.data.settings) this.data.settings = {};
            } catch (e) {
                console.error("Failed to parse void-list.json, starting fresh", e);
            }
        } else {
            this.seed();
            this.save();
        }
    }

    private save() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    }

    private init() {
        this.load();
    }

    private seed() {
        this.data.tasks.push({
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
        this.data.tasks.push({
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

        this.data.snippets.push({
            id: 'seed-s1',
            title: 'Example Bash Snippet',
            content: 'echo "Hello from Void List!"',
            language: 'shellscript',
            command: 'echo-hello',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        this.data.snippets.push({
            id: 'seed-s2',
            title: 'JS Log',
            content: 'console.log("Debug:", data);',
            language: 'javascript',
            command: 'log',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    }

    getTasks(): Task[] {
        return [...this.data.tasks].sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }

    upsertTask(task: Task) {
        const index = this.data.tasks.findIndex(t => t.id === task.id);
        if (index >= 0) {
            this.data.tasks[index] = task;
        } else {
            this.data.tasks.push(task);
        }
        this.save();
    }

    updateTask(task: Partial<Task> & { id: string }) {
        const index = this.data.tasks.findIndex(t => t.id === task.id);
        if (index >= 0) {
            this.data.tasks[index] = { ...this.data.tasks[index], ...task };
            this.save();
        }
    }

    deleteTask(id: string) {
        this.data.tasks = this.data.tasks.filter(t => t.id !== id);
        this.save();
    }

    getSnippets(): Snippet[] {
        return [...this.data.snippets].sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }

    upsertSnippet(snippet: Snippet) {
        const index = this.data.snippets.findIndex(s => s.id === snippet.id);
        if (index >= 0) {
            this.data.snippets[index] = snippet;
        } else {
            this.data.snippets.push(snippet);
        }
        this.save();
    }

    updateSnippet(snippet: Partial<Snippet> & { id: string }) {
        const index = this.data.snippets.findIndex(s => s.id === snippet.id);
        if (index >= 0) {
            this.data.snippets[index] = { ...this.data.snippets[index], ...snippet };
            this.save();
        }
    }

    deleteSnippet(id: string) {
        this.data.snippets = this.data.snippets.filter(s => s.id !== id);
        this.save();
    }

    getSetting(key: string): string | null {
        return this.data.settings[key] || null;
    }

    setSetting(key: string, value: string) {
        this.data.settings[key] = value;
        this.save();
    }
}
