const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let pythonProcess = null;

function createWindow() {
    // Создаем окно браузера
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'public', 'icon.png'),
        titleBarStyle: 'default',
        show: false,
        backgroundColor: '#0f0f23'
    });

    // Загружаем index.html
    const indexPath = path.join(__dirname, 'public', 'index.html');
    mainWindow.loadFile(indexPath);

    // Показываем окно когда готово
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Запускаем Python сервер
        startPythonServer();
    });

    // Обработка закрытия окна
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopPythonServer();
    });

    // Предотвращаем навигацию на внешние сайты
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        
        if (parsedUrl.origin !== 'file://') {
            event.preventDefault();
            shell.openExternal(navigationUrl);
        }
    });

    // Обработка новых окон
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

function startPythonServer() {
    try {
        console.log('🚀 Запуск Python API сервера...');
        
        // Проверяем наличие Python
        const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
        
        // Запускаем API сервер
        pythonProcess = spawn(pythonPath, ['api_server.py'], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        pythonProcess.stdout.on('data', (data) => {
            console.log(`Python stdout: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            console.log(`Python stderr: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python процесс завершен с кодом ${code}`);
        });

        pythonProcess.on('error', (error) => {
            console.error('❌ Ошибка запуска Python сервера:', error);
            mainWindow.webContents.send('python-server-error', error.message);
        });

        // Ждем немного и отправляем сообщение о готовности
        setTimeout(() => {
            mainWindow.webContents.send('python-server-ready');
        }, 2000);

    } catch (error) {
        console.error('❌ Ошибка запуска Python сервера:', error);
        mainWindow.webContents.send('python-server-error', error.message);
    }
}

function stopPythonServer() {
    if (pythonProcess) {
        console.log('🛑 Остановка Python сервера...');
        pythonProcess.kill();
        pythonProcess = null;
    }
}

// Создание меню приложения
function createMenu() {
    const template = [
        {
            label: 'Файл',
            submenu: [
                {
                    label: 'Новое окно',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        createWindow();
                    }
                },
                {
                    label: 'Закрыть',
                    accelerator: 'CmdOrCtrl+W',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.close();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Выход',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Правка',
            submenu: [
                { role: 'undo', label: 'Отменить' },
                { role: 'redo', label: 'Повторить' },
                { type: 'separator' },
                { role: 'cut', label: 'Вырезать' },
                { role: 'copy', label: 'Копировать' },
                { role: 'paste', label: 'Вставить' },
                { role: 'selectall', label: 'Выбрать все' }
            ]
        },
        {
            label: 'Вид',
            submenu: [
                { role: 'reload', label: 'Перезагрузить' },
                { role: 'forceReload', label: 'Принудительная перезагрузка' },
                { role: 'toggleDevTools', label: 'Инструменты разработчика' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Сбросить масштаб' },
                { role: 'zoomIn', label: 'Увеличить' },
                { role: 'zoomOut', label: 'Уменьшить' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Полноэкранный режим' }
            ]
        },
        {
            label: 'Окно',
            submenu: [
                { role: 'minimize', label: 'Свернуть' },
                { role: 'close', label: 'Закрыть' }
            ]
        },
        {
            label: 'Помощь',
            submenu: [
                {
                    label: 'О CS2 Tool',
                    click: () => {
                        shell.openExternal('https://github.com/Davidonchik/cs2-tool');
                    }
                },
                {
                    label: 'Steam Web API',
                    click: () => {
                        shell.openExternal('https://steamcommunity.com/dev/apikey');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// События приложения
app.whenReady().then(() => {
    createWindow();
    createMenu();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopPythonServer();
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopPythonServer();
});

// IPC обработчики
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
});

ipcMain.handle('restart-python-server', () => {
    stopPythonServer();
    setTimeout(() => {
        startPythonServer();
    }, 1000);
    return true;
}); 