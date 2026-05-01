
const { DatabaseService } = require('../out/DatabaseService');
const path = require('path');
const fs = require('fs');

async function test() {
    try {
        const storagePath = path.join(__dirname, 'test-db');
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath);
        }
        console.log('Initializing DB at', storagePath);
        const db = new DatabaseService(storagePath);
        console.log('DB initialized');
        const tasks = db.getTasks();
        console.log('Tasks:', tasks.length);
        const snippets = db.getSnippets();
        console.log('Snippets:', snippets.length);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();
