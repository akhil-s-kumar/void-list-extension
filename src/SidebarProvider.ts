import * as vscode from 'vscode';
import { DatabaseService, Task, Snippet } from './DatabaseService';
import { SyncServer } from './SyncServer';
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';
import * as os from 'os';

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly db: DatabaseService,
        private readonly syncServer: SyncServer
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'addTask': {
                    const task: Task = {
                        id: uuidv4(),
                        title: data.value.title,
                        note: data.value.note || '',
                        tags: data.value.tags || [],
                        status: 'todo',
                        priority: data.value.priority || 'medium',
                        is_pinned: false,
                        due_date: data.value.due_date || null,
                        reminder_id: data.value.reminder_id || null,
                        reminder_triggered: false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    this.db.upsertTask(task);
                    this.refresh();
                    break;
                }
                case 'editTask': {
                    this.db.updateTask({
                        ...data.value,
                        updated_at: new Date().toISOString()
                    });
                    this.refresh();
                    break;
                }
                case 'toggleStatus': {
                    const tasks = this.db.getTasks();
                    const task = tasks.find(t => t.id === data.id);
                    if (task) {
                        const statuses: Task['status'][] = ['todo', 'in_progress', 'done'];
                        const nextStatus = statuses[(statuses.indexOf(task.status) + 1) % statuses.length];
                        this.db.updateTask({ id: task.id, status: nextStatus, updated_at: new Date().toISOString() });
                        this.refresh();
                    }
                    break;
                }
                case 'requestDeleteTask': {
                    const result = await vscode.window.showWarningMessage('Are you sure you want to delete this task?', { modal: true }, 'Delete');
                    if (result === 'Delete') {
                        this.db.deleteTask(data.id);
                        this.refresh();
                    }
                    break;
                }
                case 'requestDeleteSnippet': {
                    const result = await vscode.window.showWarningMessage('Are you sure you want to delete this snippet?', { modal: true }, 'Delete');
                    if (result === 'Delete') {
                        this.db.deleteSnippet(data.id);
                        this.refresh();
                    }
                    break;
                }
                case 'updatePriority': {
                    this.db.updateTask({ id: data.id, priority: data.priority, updated_at: new Date().toISOString() });
                    this.refresh();
                    break;
                }
                case 'togglePin': {
                    const tasks = this.db.getTasks();
                    const task = tasks.find(t => t.id === data.id);
                    if (task) {
                        this.db.updateTask({ id: task.id, is_pinned: !task.is_pinned, updated_at: new Date().toISOString() });
                        this.refresh();
                    }
                    break;
                }
                case 'addSnippet': {
                    const snippet: Snippet = {
                        id: uuidv4(),
                        title: data.value.title,
                        content: data.value.content,
                        language: data.value.language,
                        command: data.value.command || '',
                        created_at: new Date().toISOString()
                    };
                    this.db.upsertSnippet(snippet);
                    this.refresh();
                    break;
                }
                case 'editSnippet': {
                    this.db.upsertSnippet({
                        ...data.value,
                        updated_at: new Date().toISOString()
                    });
                    this.refresh();
                    break;
                }
                case 'copySnippet': {
                    vscode.env.clipboard.writeText(data.content);
                    vscode.window.showInformationMessage('Snippet copied to clipboard');
                    break;
                }
                case 'insertSnippet': {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(editBuilder => {
                            editBuilder.insert(editor.selection.active, data.content);
                        });
                    }
                    break;
                }
                case 'deleteSnippet': {
                    this.db.deleteSnippet(data.id);
                    this.refresh();
                    break;
                }
                case 'pairDevice': {
                    this.showPairingQR();
                    break;
                }
                case 'syncNow': {
                    this.db.setSetting('last_synced', new Date().toISOString());
                    this.refresh();
                    vscode.window.showInformationMessage('Syncing with paired devices...');
                    break;
                }
                case 'enterFocus': {
                    this.db.setSetting('focused_task_id', data.id);
                    break;
                }
                case 'exitFocus': {
                    this.db.setSetting('focused_task_id', '');
                    break;
                }
                case 'ready': {
                    this.refresh();
                    break;
                }
                case 'exportData': {
                    try {
                        const tasks = this.db.getTasks();
                        const snippets = this.db.getSnippets();
                        const data = JSON.stringify({ version: 1, tasks, snippets }, null, 2);
                        
                        const fileUri = await vscode.window.showSaveDialog({
                            saveLabel: 'Export JSON',
                            filters: { 'JSON Files': ['json'] },
                            defaultUri: vscode.Uri.file('void-list-backup.json')
                        });
                        
                        if (fileUri) {
                            await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(data));
                            vscode.window.showInformationMessage('Data exported successfully!');
                        }
                    } catch (e: any) {
                        vscode.window.showErrorMessage('Failed to export data: ' + e.message);
                    }
                    break;
                }
                case 'importData': {
                    try {
                        const fileUris = await vscode.window.showOpenDialog({
                            canSelectMany: false,
                            openLabel: 'Import JSON',
                            filters: { 'JSON Files': ['json'] }
                        });
                        
                        if (fileUris && fileUris[0]) {
                            const fileContent = await vscode.workspace.fs.readFile(fileUris[0]);
                            const input = new TextDecoder().decode(fileContent);
                            const imported = JSON.parse(input);
                            if (imported.tasks) {
                                imported.tasks.forEach((t: any) => this.db.upsertTask(t));
                            }
                            if (imported.snippets) {
                                imported.snippets.forEach((s: any) => this.db.upsertSnippet(s));
                            }
                            vscode.window.showInformationMessage('Data imported successfully!');
                            this.refresh();
                        }
                    } catch (e: any) {
                        vscode.window.showErrorMessage('Failed to import data: ' + e.message);
                    }
                    break;
                }
            }
        });

        this.refresh();
    }

    public refresh() {
        if (this._view) {
            const tasks = this.db.getTasks();
            const snippets = this.db.getSnippets();
            const syncStatus = {
                pairedDevice: this.db.getSetting('paired_device') || 'None',
                status: 'Synced now'
            };
            
            const activeEditor = vscode.window.activeTextEditor;
            const currentLang = activeEditor?.document.languageId || 'text';

            const focusId = this.db.getSetting('focused_task_id') || '';

            this._view.webview.postMessage({
                type: 'update',
                tasks,
                snippets,
                syncStatus,
                currentLang,
                focusId
            });
        }
    }

    private async showPairingQR() {
        const ip = this.getLocalIp();
        const config = vscode.workspace.getConfiguration('voidList');
        const port = config.get<number>('syncPort') || 4545;
        let tokenStored = this.db.getSetting('sync_token');
        let token: string;
        if (!tokenStored) {
            token = uuidv4();
            this.db.setSetting('sync_token', token);
        } else {
            token = tokenStored;
        }

        const payload = JSON.stringify({ ip, port, token });
        const qrDataUrl = await QRCode.toDataURL(payload);

        this._view?.webview.postMessage({
            type: 'showQR',
            qrDataUrl
        });
    }

    public playNotification() {
        this._view?.webview.postMessage({ type: 'playNotification' });
    }

    public focusTask(id: string) {
        this.db.setSetting('focused_task_id', id);
        this.refresh();
        this._view?.webview.postMessage({ type: 'enterFocus', id });
    }

    private getLocalIp() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]!) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const lastSynced = this.db.getSetting('last_synced') || 'Never';
        const lastSyncedFormatted = lastSynced === 'Never' ? 'Never' : new Date(lastSynced).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Void List</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 0;
            margin: 0;
            font-size: 13px;
            overflow: hidden !important;
            box-sizing: border-box;
            height: 100vh;
            display: flex;
            flex-direction: column;
            min-width: 200px;
        }

        * { 
            box-sizing: border-box; 
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }

        ::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
        }

        .tabs {
            display: flex;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-sideBar-border);
            flex-shrink: 0;
        }

        .tab {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.6;
            border-bottom: 2px solid transparent;
        }

        .tab.active {
            opacity: 1;
            border-bottom-color: var(--vscode-panelTitle-activeBorder);
            color: var(--vscode-panelTitle-activeForeground);
        }

        .view-container {
            padding: 10px;
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-sizing: border-box;
        }

        #tasks-list, #snippets-list, #settings-view {
            flex: 1;
            overflow-y: auto;
            padding-right: 0;
        }

        #settings-view {
            overflow-y: auto;
            flex: 1;
        }

        .input-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 15px;
        }

        .filter-row {
            display: flex;
            gap: 4px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        input, select, textarea {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 2px;
            font-family: inherit;
        }

        input:focus, textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .card {
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 12px;
            position: relative;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .card.pinned {
            border-left: 3px solid var(--vscode-charts-yellow, #eab308);
            background-color: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 179, 8, 0.05));
        }

        .card-header {
            display: flex;
            gap: 8px;
            align-items: flex-start;
        }

        .status-icon {
            font-size: 10px;
            cursor: pointer;
            flex-shrink: 0;
            margin-top: 3px;
            width: 14px;
            height: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 1px solid var(--vscode-foreground);
            opacity: 0.6;
        }

        .status-todo { border-color: var(--vscode-foreground); color: transparent; }
        .status-in_progress { border-color: #3794ef; color: #3794ef; opacity: 1; }
        .status-done { border-color: #73c991; background: #73c991; color: white; opacity: 1; }

        .svg-icon {
            width: 14px;
            height: 14px;
            fill: currentColor;
            display: inline-block;
            vertical-align: middle;
        }

        .btn-icon {
            width: 12px;
            height: 12px;
        }

        .title {
            font-weight: 600;
            line-height: 1.3;
            flex: 1;
        }

        .note {
            margin-top: 8px;
            font-size: 11px;
            opacity: 0.8;
            background: var(--vscode-editor-background);
            padding: 6px;
            border-radius: 3px;
        }

        .tags {
            display: flex;
            gap: 4px;
            margin-top: 6px;
            flex-wrap: wrap;
        }

        .tag {
            font-size: 9px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 5px;
            border-radius: 2px;
        }

        .meta {
            display: flex;
            gap: 12px;
            margin-top: 8px;
            font-size: 10px;
            opacity: 0.7;
            align-items: center;
        }

        .priority-badge {
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 9px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .date-info {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
            border-top: 1px solid var(--vscode-sideBar-border);
            padding-top: 8px;
        }

        .action-btn {
            background: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-sideBar-border);
            padding: 2px 6px;
            font-size: 10px;
            cursor: pointer;
            border-radius: 2px;
            opacity: 0.8;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .action-btn:hover {
            opacity: 1;
            background: var(--vscode-button-secondaryBackground);
        }

        .action-btn.del { color: var(--vscode-errorForeground); }

        .pin-btn {
            cursor: pointer;
            opacity: 0.3;
            font-size: 12px;
        }
        .tag:hover {
            opacity: 0.8;
            cursor: pointer;
        }

        .sync-info {
            font-size: 9px;
            opacity: 0.5;
            padding: 4px 10px;
            border-top: 1px solid var(--vscode-sideBar-border);
            text-align: center;
        }

        button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px;
            cursor: pointer;
        }

        button.primary:hover { background: var(--vscode-button-hoverBackground); }

        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: var(--vscode-sideBar-background);
            display: none;
            flex-direction: column;
            padding: 15px;
            z-index: 1000;
            box-sizing: border-box;
        }

        .hidden { display: none !important; }

        pre {
            background: var(--vscode-editor-background);
            padding: 8px;
            font-size: 11px;
            overflow-x: auto;
            border: 1px solid var(--vscode-sideBar-border);
        }

        mark {
            background-color: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
            color: inherit;
            padding: 0 2px;
            border-radius: 2px;
        }

        .badge-urgent { background: #8b5cf6; color: white; }
        .badge-high { background: #ef4444; color: white; }
        .badge-medium { background: #f59e0b; color: white; }
        .badge-low { background: #22c55e; color: white; }

    </style>
</head>
<body>
    <div class="tabs">
        <div class="tab active" onclick="showTab('tasks')">Tasks</div>
        <div class="tab" onclick="showTab('snippets')">Snippets</div>
        <div class="tab" onclick="showTab('settings')">Settings</div>
    </div>

    <div id="tasks-view" class="view-container">
        <div id="focus-banner" class="hidden" style="background: var(--vscode-statusBar-background); padding: 5px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 10px; font-weight: bold;">🎯 FOCUS MODE</span>
            <button class="action-btn" onclick="exitFocus()">Exit</button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 9px; opacity: 0.5;">Last Synced: ${lastSyncedFormatted}</span>
            <button class="action-btn" style="font-size: 9px; padding: 1px 4px;" onclick="tsvscode.postMessage({type:'syncNow'})">Sync Now</button>
        </div>
        
        <div class="input-group">
            <input type="text" id="task-search" placeholder="Search tasks..." oninput="renderTasks()">
            <div class="filter-row">
                <select id="filter-status" onchange="renderTasks()" style="flex: 1; min-width: 60px; font-size: 10px;">
                    <option value="all">All Status</option>
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                </select>
                <select id="filter-priority" onchange="renderTasks()" style="flex: 1; min-width: 60px; font-size: 10px;">
                    <option value="all">All Priority</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
                <button class="action-btn" id="btn-today" onclick="toggleTodayFilter()" style="font-size: 10px;">Today</button>
            </div>
            <div style="display: flex; gap: 4px; width: 100%;">
                <input type="text" id="task-input" placeholder="Quick add..." style="flex: 1; min-width: 0;" onkeydown="if(event.key==='Enter') quickAddTask()">
                <button class="primary" onclick="quickAddTask()" style="padding: 0 8px; flex-shrink: 0;">Add</button>
            </div>
        </div>

        <div id="tasks-list"></div>
    </div>

    <div id="snippets-view" class="view-container hidden">
        <div class="input-group">
            <input type="text" id="snippet-search" placeholder="Search Snippets..." oninput="renderSnippets()">
            <button class="primary" onclick="showSnippetModal()">Create Snippet</button>
        </div>
        <div id="snippets-list"></div>
    </div>

    <div id="settings-view" class="view-container hidden">
        <div class="section-header" style="font-size: 10px; opacity: 0.5; margin-bottom: 10px; padding: 0 5px;">SYNC & BACKUP</div>
        <div style="display: grid; gap: 8px; padding: 0 5px;">
            <div class="card" style="cursor: pointer; margin-bottom: 0;" onclick="tsvscode.postMessage({type:'importData'})">
                <div class="card-header" style="margin-bottom: 4px;">
                    <div class="title" style="font-weight: 600;">Import Data</div>
                    <svg class="svg-icon" viewBox="0 0 16 16"><path d="M13 5l-5 5-5-5h3V1h4v4h3zM1 14h14v2H1v-2z"/></svg>
                </div>
                <div style="opacity: 0.6; font-size: 11px;">Import your tasks and snippets from a JSON file.</div>
            </div>

            <div class="card" style="cursor: pointer; margin-bottom: 0;" onclick="tsvscode.postMessage({type:'exportData'})">
                <div class="card-header" style="margin-bottom: 4px;">
                    <div class="title" style="font-weight: 600;">Export Data</div>
                    <svg class="svg-icon" viewBox="0 0 16 16"><path d="M3 11l5-5 5 5h-3v4H6v-4H3zM1 1h14v2H1V1z"/></svg>
                </div>
                <div style="opacity: 0.6; font-size: 11px;">Export all your data locally for safekeeping.</div>
            </div>

            <div class="card" style="cursor: pointer; margin-bottom: 0;" onclick="tsvscode.postMessage({type:'pairDevice'})">
                <div class="card-header" style="margin-bottom: 4px;">
                    <div class="title" style="font-weight: 600;">Pair Mobile Device</div>
                    <svg class="svg-icon" viewBox="0 0 16 16"><path d="M11 1H5C4.4 1 4 1.4 4 2v12c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1zm0 13H5V2h6v12zM7 12h2v1H7v-1z"/></svg>
                </div>
                <div style="opacity: 0.6; font-size: 11px;">Sync locally with the mobile app via QR code.</div>
            </div>

            <div class="card" style="cursor: pointer; margin-bottom: 0;" onclick="tsvscode.postMessage({type:'syncNow'})">
                <div class="card-header" style="margin-bottom: 4px;">
                    <div class="title" style="font-weight: 600;">Manual Sync Now</div>
                    <svg class="svg-icon" viewBox="0 0 16 16"><path d="M11.5 8c0-1.9-1.6-3.5-3.5-3.5-1.4 0-2.6.8-3.1 2H6v1H2V3h1v1.9c.9-1.2 2.3-1.9 3.9-1.9C9.7 3 12.5 5.8 12.5 9h-1zM4.5 8c0 1.9 1.6 3.5 3.5 3.5 1.4 0 2.6-.8 3.1-2H10V8h4v4.5h-1v-1.9c-.9 1.2-2.3 1.9-3.9 1.9C5.3 13 2.5 10.2 2.5 7h1z"/></svg>
                </div>
                <div style="opacity: 0.6; font-size: 11px;">Force push your data to paired devices.</div>
            </div>
        </div>

        <div style="margin-top: auto; padding: 30px 5px 20px 5px;">
            <div class="card" style="text-align: center; margin-bottom: 0;">
                <div class="card-header" style="justify-content: center; margin-bottom: 12px; opacity: 0.8;">
                    <svg class="svg-icon" viewBox="0 0 16 16" style="width: 16px; height: 16px;"><path d="M11 1H5C4.4 1 4 1.4 4 2v12c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1zm0 13H5V2h6v12zM7 12h2v1H7v-1z"/></svg>
                    <div style="font-weight: bold; letter-spacing: 1px; text-transform: uppercase; font-size: 11px; align-self: center;">Mobile Experience</div>
                </div>
                <p style="font-size: 11px; opacity: 0.7; margin-top: 0; margin-bottom: 15px; line-height: 1.4;">Keep your tasks in sync across all your devices.</p>
                <a href="https://play.google.com/store/apps/details?id=com.voidlist.app" target="_blank" style="display: inline-block;">
                    <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" style="width: 125px;">
                </a>
            </div>
        </div>
    </div>

    <div id="task-modal" class="overlay">
        <h3 style="margin-top: 0;">Task Details</h3>
        <div class="input-group">
            <label style="font-size: 10px; opacity: 0.7;">TITLE</label>
            <input type="text" id="modal-task-title">
            
            <label style="font-size: 10px; opacity: 0.7;">NOTE (MARKDOWN)</label>
            <textarea id="modal-task-note" rows="6"></textarea>
            
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 10px; opacity: 0.7;">PRIORITY</label>
                    <select id="modal-task-priority">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                    </select>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 10px; opacity: 0.7;">STATUS</label>
                    <select id="modal-task-status">
                        <option value="todo">Todo</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                    </select>
                </div>
            </div>

            <label style="font-size: 10px; opacity: 0.7;">DUE DATE</label>
            <input type="datetime-local" id="modal-task-due">

            <label style="font-size: 10px; opacity: 0.7;">TAGS (COMMA SEPARATED)</label>
            <input type="text" id="modal-task-tags">
            
            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                <input type="checkbox" id="modal-task-reminder"> Enable Reminder
            </label>
        </div>
        <div style="display: flex; gap: 10px; margin-top: auto; padding-top: 15px;">
            <button class="primary" style="flex: 1;" onclick="saveTaskModal()">Save</button>
            <button class="action-btn" style="flex: 1; justify-content: center;" onclick="closeModals()">Cancel</button>
        </div>
    </div>

    <div id="snippet-modal" class="overlay">
        <h3 style="margin-top: 0;">Snippet Details</h3>
        <div class="input-group">
            <label style="font-size: 10px; opacity: 0.7;">TITLE</label>
            <input type="text" id="modal-snippet-title">
            <label style="font-size: 10px; opacity: 0.7;">LANGUAGE</label>
            <select id="modal-snippet-lang">
                <option value="text">Plain Text</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="json">JSON</option>
                <option value="markdown">Markdown</option>
                <option value="go">Go</option>
                <option value="rust">Rust</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
                <option value="shellscript">Shell Script</option>
                <option value="sql">SQL</option>
            </select>
            <label style="font-size: 10px; opacity: 0.7;">CODE CONTENT</label>
            <textarea id="modal-snippet-content" rows="12" style="font-family: monospace;"></textarea>
        </div>
        <div style="display: flex; gap: 10px; margin-top: auto; padding-top: 15px;">
            <button class="primary" style="flex: 1;" onclick="saveSnippetModal()">Save</button>
            <button class="action-btn" style="flex: 1; justify-content: center;" onclick="closeModals()">Cancel</button>
        </div>
    </div>

    <div id="qr-overlay" class="overlay">
        <h3 style="margin-top: 0; text-align: center;">Pair Device</h3>
        <p style="font-size: 11px; opacity: 0.7; text-align: center; margin-bottom: 20px; line-height: 1.4;">Scan this QR code from the Void List mobile app to sync your data locally.</p>
        <div class="card" style="text-align: center; margin: 0 auto; max-width: 220px; padding: 20px;">
            <div style="background: white; padding: 10px; border-radius: 4px; display: inline-block; margin-bottom: 15px;">
                <img id="qr-image" src="" style="display: block;">
            </div>
            <div style="font-size: 11px; font-weight: 600; opacity: 0.9;">Awaiting connection...</div>
        </div>
        <div style="display: flex; margin-top: auto; padding-top: 15px;">
            <button class="action-btn" style="flex: 1; justify-content: center; padding: 8px;" onclick="document.getElementById('qr-overlay').style.display='none'">Close</button>
        </div>
    </div>

    <audio id="notif-sound" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"></audio>

    <script nonce="${nonce}">
        const tsvscode = acquireVsCodeApi();
        let currentTasks = [];
        let currentSnippets = [];
        let activeLang = 'text';
        let editingId = null;
        let focusId = null;
        let todayFilterActive = false;

        tsvscode.postMessage({ type: 'ready' });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    currentTasks = message.tasks;
                    currentSnippets = message.snippets;
                    activeLang = message.currentLang;
                    if (message.focusId) {
                        focusId = message.focusId;
                        document.getElementById('focus-banner').classList.remove('hidden');
                    } else {
                        focusId = null;
                        document.getElementById('focus-banner').classList.add('hidden');
                    }
                    renderTasks();
                    renderSnippets();
                    break;
                case 'showQR':
                    document.getElementById('qr-image').src = message.qrDataUrl;
                    document.getElementById('qr-overlay').style.display = 'flex';
                    break;
                case 'enterFocus':
                    focusId = message.id;
                    document.getElementById('focus-banner').classList.remove('hidden');
                    renderTasks();
                    break;
                case 'playNotification':
                    document.getElementById('notif-sound').play().catch(e => console.log('Autoplay blocked'));
                    break;
            }
        });

        function showTab(id) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
            
            event.target.classList.add('active');
            document.getElementById(id + '-view').classList.remove('hidden');
        }

        function toggleTodayFilter() {
            todayFilterActive = !todayFilterActive;
            const btn = document.getElementById('btn-today');
            if (todayFilterActive) {
                btn.style.background = 'var(--vscode-button-background)';
                btn.style.color = 'var(--vscode-button-foreground)';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--vscode-foreground)';
            }
            renderTasks();
        }

        function addTag(tag) {
            const input = document.getElementById('task-input');
            if (!input.value.includes(tag)) {
                input.value += (input.value ? ' ' : '') + tag;
                input.focus();
            }
        }

        function quickAddTask() {
            const input = document.getElementById('task-input');
            if (input.value.trim()) {
                tsvscode.postMessage({ type: 'addTask', value: { title: input.value.trim(), priority: 'medium' } });
                input.value = '';
            }
        }

        function showTaskModal(task = null) {
            editingId = task ? task.id : null;
            document.getElementById('modal-task-title').value = task ? task.title : '';
            document.getElementById('modal-task-note').value = task ? task.note : '';
            document.getElementById('modal-task-priority').value = task ? task.priority : 'medium';
            document.getElementById('modal-task-status').value = task ? task.status : 'todo';
            document.getElementById('modal-task-tags').value = task ? task.tags.join(', ') : '';
            document.getElementById('modal-task-reminder').checked = !!(task && task.reminder_id);
            if (task && task.due_date) {
                const date = new Date(task.due_date);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                document.getElementById('modal-task-due').value = date.toISOString().slice(0, 16);
            } else {
                document.getElementById('modal-task-due').value = '';
            }
            document.getElementById('task-modal').style.display = 'flex';
        }

        function saveTaskModal() {
            const tags = document.getElementById('modal-task-tags').value.split(',').map(t => t.trim()).filter(t => t);
            const due = document.getElementById('modal-task-due').value;
            const data = {
                title: document.getElementById('modal-task-title').value,
                note: document.getElementById('modal-task-note').value,
                priority: document.getElementById('modal-task-priority').value,
                status: document.getElementById('modal-task-status').value,
                tags,
                due_date: due ? new Date(due).toISOString() : null,
                reminder_id: document.getElementById('modal-task-reminder').checked ? 'rem-' + Math.random().toString(36).slice(2) : null
            };
            tsvscode.postMessage({ type: editingId ? 'editTask' : 'addTask', value: { id: editingId, ...data } });
            closeModals();
        }

        function showSnippetModal(snippet = null) {
            editingId = snippet ? snippet.id : null;
            document.getElementById('modal-snippet-title').value = snippet ? snippet.title : '';
            document.getElementById('modal-snippet-lang').value = snippet ? snippet.language : 'text';
            document.getElementById('modal-snippet-content').value = snippet ? snippet.content : '';
            document.getElementById('snippet-modal').style.display = 'flex';
        }

        function saveSnippetModal() {
            const data = {
                title: document.getElementById('modal-snippet-title').value,
                language: document.getElementById('modal-snippet-lang').value,
                content: document.getElementById('modal-snippet-content').value
            };
            tsvscode.postMessage({ type: editingId ? 'editSnippet' : 'addSnippet', value: { id: editingId, ...data } });
            closeModals();
        }

        function closeModals() {
            document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
            editingId = null;
        }

        function enterFocus(id) {
            focusId = id;
            document.getElementById('focus-banner').classList.remove('hidden');
            tsvscode.postMessage({ type: 'enterFocus', id });
            document.getElementById('notif-sound').play().catch(e => {});
            renderTasks();
        }

        function exitFocus() {
            focusId = null;
            document.getElementById('focus-banner').classList.add('hidden');
            tsvscode.postMessage({ type: 'exitFocus' });
            renderTasks();
        }

        function formatDate(dateStr) {
            const date = new Date(dateStr);
            const day = date.getDate();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            let hours = date.getHours();
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; 
            return \`\${day} \${month}, \${hours}:\${minutes} \${ampm}\`;
        }

        function renderTasks() {
            const container = document.getElementById('tasks-list');
            const rawSearch = document.getElementById('task-search').value;
            const search = rawSearch.toLowerCase();
            const statusFilter = document.getElementById('filter-status').value;
            const priorityFilter = document.getElementById('filter-priority').value;

            let tasks = focusId ? currentTasks.filter(t => t.id === focusId) : [...currentTasks];

            tasks = tasks.filter(task => {
                const matchesSearch = task.title.toLowerCase().includes(search) || 
                                     task.note.toLowerCase().includes(search) || 
                                     task.tags.some(t => t.toLowerCase().includes(search));
                const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
                const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
                let matchesToday = true;
                if (todayFilterActive) {
                    if (!task.due_date) matchesToday = false;
                    else {
                        const today = new Date().toDateString();
                        const taskDate = new Date(task.due_date).toDateString();
                        matchesToday = today === taskDate;
                    }
                }
                return matchesSearch && matchesStatus && matchesPriority && matchesToday;
            });

            tasks.sort((a, b) => {
                if (a.is_pinned && !b.is_pinned) return -1;
                if (!a.is_pinned && b.is_pinned) return 1;
                return new Date(b.created_at) - new Date(a.created_at);
            });

            const icons = {
                pin: '<svg class="svg-icon" viewBox="0 0 16 16"><path d="M12.3 8.3L11 7.1V3.5L12 2H4l1 1.5v3.6L3.7 8.3c-.3.3-.3.8 0 1.1l1.4 1.4c.3.3.8.3 1.1 0l.8-.8v3l1 1 1-1v-3l.8.8c.3.3.8.3 1.1 0l1.4-1.4c.3-.3.3-.8 0-1.1zM11 9L10 10l-.7-.7-.3.3V14h-1v-4.4l-.3-.3-.7.7L6 9V5.5l.3-.3 1-1.2h1.4l1 1.2.3.3V9z"/></svg>',
                date: '<svg class="svg-icon" viewBox="0 0 16 16"><path d="M14 2H12V1h-1v1H5V1H4v1H2c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1h12c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zm0 12H2V6h12v8zm0-9H2V3h2v1h1V3h6v1h1V3h2v2z"/></svg>',
                bell: '<svg class="svg-icon" viewBox="0 0 16 16"><path d="M8 1c-2.2 0-4 1.8-4 4v4.3L2.7 11c-.4.4-.1 1.1.5 1.1h9.6c.6 0 .9-.7.5-1.1L12 9.3V5c0-2.2-1.8-4-4-4zm3 8.3l1.3 1.7H3.7L5 9.3V5c0-1.7 1.3-3 3-3s3 1.3 3 3v4.3zM6.5 13h3c0 .8-.7 1.5-1.5 1.5s-1.5-.7-1.5-1.5z"/></svg>',
                edit: '<svg class="btn-icon svg-icon" viewBox="0 0 16 16"><path d="M13.2 2c-.3 0-.5.1-.7.3L3.1 11.7l-.1.4-.5 1.6c-.1.2 0 .4.2.5.1.1.2.1.3.1l1.6-.5.4-.1L14.4 4.3c.4-.4.4-1 0-1.4l-.5-.5c-.2-.2-.5-.4-.7-.4zm-.7 1.4l.6.6-8.2 8.2-.7-.7 8.3-8.1zm-.6.1l.7.7-8.2 8.2-.6-.6L11.9 3.5zm.7.7l.6.6-8.2 8.2-.6-.6L12.6 4.2z"/></svg>',
                focus: '<svg class="btn-icon svg-icon" viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 13a6 6 0 1 1 6-6 6 6 0 0 1-6 6zm3-6a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"/></svg>',
                delete: '<svg class="btn-icon svg-icon" viewBox="0 0 16 16"><path d="M11 2H5c-.6 0-1 .4-1 1v1H3v1h1v9c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V5h1V4h-1V3c0-.6-.4-1-1-1zM5 3h6v1H5V3zm6 11H5V5h6v9zM6 6h1v7H6V6zm3 0h1v7H9V6z"/></svg>'
            };

            container.innerHTML = tasks.map(task => {
                const noteRawHtml = task.note ? \`<div class="note">\${marked.parse(task.note)}</div>\` : '';
                const noteHtml = highlightHtml(noteRawHtml, rawSearch);
                const titleHtml = highlightText(task.title, rawSearch);
                const tagsHtml = task.tags.map(t => \`<span class="tag">\${highlightText(t, rawSearch)}</span>\`).join('');
                const pIcons = { urgent: '!', high: '^', medium: '-', low: 'v' };
                const pIcon = pIcons[task.priority] || '-';
                
                return \`
                    <div class="card \${task.is_pinned ? 'pinned' : ''}">
                        <div class="card-header">
                            <div class="status-icon status-\${task.status}" onclick="tsvscode.postMessage({type:'toggleStatus', id:'\${task.id}'})">
                                \${task.status === 'done' ? '✓' : (task.status === 'in_progress' ? '◑' : '')}
                            </div>
                            <div class="title">\${titleHtml}</div>
                            <div class="pin-btn \${task.is_pinned?'active':''}" onclick="tsvscode.postMessage({type:'togglePin', id:'\${task.id}'})">
                                \${icons.pin}
                            </div>
                        </div>
                        \${noteHtml}
                        <div class="tags">\${tagsHtml}</div>
                        <div class="meta">
                            <span class="priority-badge badge-\${task.priority}">\${pIcon} \${task.priority}</span>
                            \${task.due_date ? \`<span class="date-info">\${icons.date} \${formatDate(task.due_date)}</span>\` : ''}
                            \${task.reminder_id ? icons.bell : ''}
                        </div>
                        <div class="actions">
                            <button class="action-btn" onclick="showTaskModal(\${JSON.stringify(task).replace(/"/g, '&quot;')})">\${icons.edit} Edit</button>
                            <button class="action-btn" onclick="enterFocus('\${task.id}')">\${icons.focus} Focus</button>
                            <button class="action-btn del" onclick="tsvscode.postMessage({ type: 'requestDeleteTask', id: '\${task.id}' })">\${icons.delete} Delete</button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function renderSnippets() {
            const container = document.getElementById('snippets-list');
            const rawSearch = document.getElementById('snippet-search').value;
            const search = rawSearch.toLowerCase();
            const filtered = currentSnippets.filter(s => s.title.toLowerCase().includes(search) || s.content.toLowerCase().includes(search));

            const icons = {
                edit: '<svg class="btn-icon svg-icon" viewBox="0 0 16 16"><path d="M13.2 2c-.3 0-.5.1-.7.3L3.1 11.7l-.1.4-.5 1.6c-.1.2 0 .4.2.5.1.1.2.1.3.1l1.6-.5.4-.1L14.4 4.3c.4-.4.4-1 0-1.4l-.5-.5c-.2-.2-.5-.4-.7-.4zm-.7 1.4l.6.6-8.2 8.2-.7-.7 8.3-8.1zm-.6.1l.7.7-8.2 8.2-.6-.6L11.9 3.5zm.7.7l.6.6-8.2 8.2-.6-.6L12.6 4.2z"/></svg>',
                delete: '<svg class="btn-icon svg-icon" viewBox="0 0 16 16"><path d="M11 2H5c-.6 0-1 .4-1 1v1H3v1h1v9c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V5h1V4h-1V3c0-.6-.4-1-1-1zM5 3h6v1H5V3zm6 11H5V5h6v9zM6 6h1v7H6V6zm3 0h1v7H9V6z"/></svg>',
                copy: '<svg class="btn-icon svg-icon" viewBox="0 0 16 16"><path d="M4 4V1h7l3 3v7h-3v3H1V4h3zm1 0h6V2H5v2zm8 0h-2v2h2V4zM2 5v8h7V5H2zm8 0v6h2V5h-2z"/></svg>'
            };

            container.innerHTML = filtered.map(snippet => \`
                <div class="card">
                    <div style="display: flex; flex-direction: column; cursor: pointer;" onclick="const p = this.querySelector('pre'); p.style.display = p.style.display==='none'?'block':'none'">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <b>\${highlightText(snippet.title, rawSearch)}</b>
                            <small style="opacity:0.6">\${snippet.language}</small>
                        </div>
                        <pre style="display:block; margin-top: 8px;">\${highlightText(snippet.content, rawSearch)}</pre>
                    </div>
                    <div class="actions">
                        <button class="action-btn" onclick="copySnippet('\${snippet.id}')">\${icons.copy} Copy</button>
                        <button class="action-btn" onclick="showSnippetModal(\${JSON.stringify(snippet).replace(/"/g, '&quot;')})">\${icons.edit} Edit</button>
                        <button class="action-btn del" onclick="tsvscode.postMessage({ type: 'requestDeleteSnippet', id: '\${snippet.id}' })">\${icons.delete} Delete</button>
                    </div>
                </div>
            \`).join('');
        }

        function copySnippet(id) {
            const snippet = currentSnippets.find(s => s.id === id);
            if (snippet) tsvscode.postMessage({ type: 'copySnippet', content: snippet.content });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function highlightText(text, search) {
            if (!text) return '';
            const escaped = escapeHtml(text);
            if (!search) return escaped;
            const regex = new RegExp('(' + search.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
            return escaped.replace(regex, '<mark>$1</mark>');
        }

        function highlightHtml(html, search) {
            if (!html || !search) return html;
            const regex = new RegExp('(?![^<]*>)(' + search.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
            return html.replace(regex, '<mark>$1</mark>');
        }
    </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
