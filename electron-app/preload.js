const { contextBridge, ipcRenderer } = require('electron');

// Безопасный API для рендерер процесса
contextBridge.exposeInMainWorld('electronAPI', {
    // Получение версии приложения
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Получение пути приложения
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    
    // Перезапуск Python сервера
    restartPythonServer: () => ipcRenderer.invoke('restart-python-server'),
    
    // Слушатели событий
    onPythonServerReady: (callback) => {
        ipcRenderer.on('python-server-ready', callback);
    },
    
    onPythonServerError: (callback) => {
        ipcRenderer.on('python-server-error', callback);
    },
    
    // Удаление слушателей
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

// Уведомляем о готовности preload
window.addEventListener('DOMContentLoaded', () => {
    console.log('🔌 Preload скрипт загружен');
}); 