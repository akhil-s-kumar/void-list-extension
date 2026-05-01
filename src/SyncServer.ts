import express from 'express';
import { DatabaseService } from './DatabaseService';
import * as http from 'http';

export class SyncServer {
    private app: express.Application;
    private server?: http.Server;
    private port: number = 4545;

    constructor(private db: DatabaseService) {
        this.app = express();
        this.app.use(express.json());
        this.setupEndpoints();
    }

    private setupEndpoints() {
        this.app.get('/ping', (req, res) => {
            res.json({ status: 'ok', device: this.db.getSetting('device_name') || 'VS Code' });
        });

        this.app.get('/pull', (req, res) => {
            const since = parseInt(req.query.since as string) || 0;
            const token = req.headers['authorization'];
            if (token !== this.db.getSetting('sync_token')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const tasks = this.db.getTasks().filter(t => new Date(t.updated_at).getTime() > since);
            const snippets = this.db.getSnippets().filter(s => new Date(s.updated_at || s.created_at).getTime() > since);

            res.json({ tasks, snippets });
        });

        this.app.post('/push', (req, res) => {
            const token = req.headers['authorization'];
            if (token !== this.db.getSetting('sync_token')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { tasks, snippets } = req.body;
            
            if (tasks) {
                tasks.forEach((task: any) => {
                    const localTasks = this.db.getTasks();
                    const localTask = localTasks.find(t => t.id === task.id);
                    if (!localTask || new Date(task.updated_at).getTime() > new Date(localTask.updated_at).getTime()) {
                        this.db.upsertTask(task);
                    }
                });
            }

            if (snippets) {
                snippets.forEach((snippet: any) => {
                    const localSnippets = this.db.getSnippets();
                    const localSnippet = localSnippets.find(s => s.id === snippet.id);
                    const snippetUpdated = snippet.updated_at || snippet.created_at;
                    const localUpdated = localSnippet ? (localSnippet.updated_at || localSnippet.created_at) : 0;
                    if (!localSnippet || new Date(snippetUpdated).getTime() > new Date(localUpdated).getTime()) {
                        this.db.upsertSnippet(snippet);
                    }
                });
            }

            res.json({ status: 'ok' });
        });
    }

    public start(port?: number) {
        this.port = port || this.port;
        this.server = this.app.listen(this.port, () => {
            console.log(`Sync server listening on port ${this.port}`);
        });
    }

    public stop() {
        this.server?.close();
    }
}
