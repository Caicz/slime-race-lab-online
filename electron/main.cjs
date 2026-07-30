const {app, BrowserWindow} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const captureArgument = process.argv.find(argument => argument.startsWith('--capture='));
const capturePath = captureArgument ? captureArgument.slice('--capture='.length) : null;
const captureScrollArgument = process.argv.find(argument => argument.startsWith('--capture-scroll='));
const captureScroll = captureScrollArgument ? Math.max(0, Number(captureScrollArgument.slice('--capture-scroll='.length)) || 0) : 0;

function createWindow() {
    const window = new BrowserWindow({
        width: 1380,
        height: 900,
        minWidth: 980,
        minHeight: 700,
        backgroundColor: '#07111f',
        show: !capturePath,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    window.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

    if (capturePath) {
        window.webContents.once('did-finish-load', async () => {
            try {
                await new Promise(resolve => setTimeout(resolve, 600));
                if (captureScroll > 0) {
                    await window.webContents.executeJavaScript(`window.scrollTo(0, ${captureScroll})`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                const image = await window.webContents.capturePage();
                await fs.writeFile(capturePath, image.toPNG());
            } finally {
                app.quit();
            }
        });
    }
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
