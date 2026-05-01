import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { DatabaseService } from './DatabaseService';
import { SyncServer } from './SyncServer';
import { v4 as uuidv4 } from 'uuid';

export function activate(context: vscode.ExtensionContext) {
    console.log('Void List Extension is now active!');
    const db = new DatabaseService(context.globalStorageUri.fsPath);
    const syncServer = new SyncServer(db);
    
    const config = vscode.workspace.getConfiguration('voidList');
    const port = config.get<number>('syncPort') || 4545;
    syncServer.start(port);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('voidList.syncPort')) {
                const newPort = vscode.workspace.getConfiguration('voidList').get<number>('syncPort') || 4545;
                syncServer.stop();
                syncServer.start(newPort);
            }
        })
    );

    const sidebarProvider = new SidebarProvider(context.extensionUri, db, syncServer);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "void-list-view",
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('void-list.openSidebar', () => {
            vscode.commands.executeCommand('workbench.view.extension.void-list-sidebar');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('void-list.addTask', async () => {
            const title = await vscode.window.showInputBox({ prompt: 'Task Title' });
            if (title) {
                vscode.commands.executeCommand('void-list.openSidebar');
                db.upsertTask({
                    id: uuidv4(),
                    title,
                    note: '',
                    tags: [],
                    status: 'todo',
                    priority: 'medium',
                    is_pinned: false,
                    due_date: null,
                    reminder_id: null,
                    reminder_triggered: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
                sidebarProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('void-list.syncNow', () => {
            vscode.window.showInformationMessage('Syncing Void List...');
            sidebarProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('void-list.openSnippets', () => {
            vscode.commands.executeCommand('workbench.view.extension.void-list-sidebar');
        })
    );

    setInterval(() => {
        sidebarProvider.refresh();
    }, 60000);

    setInterval(async () => {
        const tasks = db.getTasks();
        const now = new Date();
        
        for (const task of tasks) {
            if (task.reminder_id && !task.reminder_triggered && task.due_date && task.status !== 'done') {
                const dueDate = new Date(task.due_date);
                if (dueDate <= now) {
                    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                    
                    if (dueDate > oneHourAgo) {
                        vscode.window.showInformationMessage(`Reminder: ${task.title}`, 'Focus').then(selection => {
                            if (selection === 'Focus') {
                                vscode.commands.executeCommand('void-list.openSidebar');
                                sidebarProvider.focusTask(task.id); 
                            }
                        });
                        
                        sidebarProvider.playNotification();
                    }

                    db.updateTask({ id: task.id, reminder_triggered: true });
                    sidebarProvider.refresh();
                }
            }
        }
    }, 30000);
}

export function deactivate() {}
