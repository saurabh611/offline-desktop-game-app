const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const isDev = process.env.NODE_ENV === 'development';
const isAdmin = process.argv.includes('--admin');

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the appropriate HTML file based on role
    mainWindow.loadFile(isAdmin ? 'src/admin/index.html' : 'src/user/index.html');

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Add IPC handler for system:getIP
    ipcMain.handle('system:getIP', () => {
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return '127.0.0.1';
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// Initialize appropriate server/client based on role
if (isAdmin) {
    require('./src/server/admin-server');
} else {
    require('./src/client/user-client');
}
