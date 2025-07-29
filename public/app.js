class CS2Tool {
    constructor() {
        this.apiKey = null;
        this.servers = new Map();
        this.gameServers = new Map();
        this.emptyServers = new Map();
        this.serverHistory = new Map();
        this.isLoading = false;
        this.autoRefresh = true;
        this.region = '44';
        this.maxThreads = 50;
        this.autoConnectEnabled = false;
        
        // WebSocket для связи с нативным сканером
        this.websocket = null;
        this.isConnected = false;
        this.useNativeScanner = true;
        
        // Селектор карт
        this.selectedMaps = new Set();
        this.availableMaps = [
            // Активные карты CS2 (Premier/Competitive)
            'de_ancient', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 
            'de_overpass', 'de_train', 'de_vertigo', 'de_anubis', 'de_grail', 'de_jura',
            
            // Карты для Wingman
            'de_brewery', 'de_dogtown',
            
            // Устаревшие карты (для совместимости)
            'de_cache', 'de_dust', 'de_office', 'de_italy', 'de_cobblestone', 'de_aztec'
        ];
        
        this.init();
    }

    init() {
        console.log('🚀 Инициализация CS2Tool...');
        this.loadSettings();
        this.checkApiKey();
        if (this.useNativeScanner) {
            this.initWebSocket();
        }
        this.initMapsSelector();
        console.log('✅ Инициализация завершена');
    }

    checkApiKey() {
        console.log('🔍 Проверка API ключа...');
        this.apiKey = localStorage.getItem('cs2tool_api_key');
        
        if (!this.apiKey) {
            this.showApiScreen();
        } else {
            this.initApp();
        }
    }

    showApiScreen() {
        const apiScreen = document.getElementById('apiScreen');
        const mainApp = document.getElementById('mainApp');
        
        if (apiScreen) apiScreen.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        
        this.bindApiEvents();
    }

    initApp() {
        document.getElementById('apiScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        
        // Привязываем события после полной загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.bindEvents();
            });
        } else {
            this.bindEvents();
        }
        
        this.loadServers();
    }

    bindApiEvents() {
        const apiInput = document.getElementById('apiKey');
        const submitBtn = document.getElementById('apiSubmitBtn');
        const apiForm = document.getElementById('apiForm');

        if (apiForm) {
            apiForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitApiKey();
            });
        }

        apiInput.addEventListener('input', (e) => {
            const key = e.target.value.trim();
            submitBtn.disabled = key.length < 10;
        });

        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.submitApiKey();
        });

        apiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !submitBtn.disabled) {
                this.submitApiKey();
            }
        });
    }

    async submitApiKey() {
        const apiInput = document.getElementById('apiKey');
        const key = apiInput.value.trim();

        if (key.length < 10) {
            this.showNotification('API ключ должен содержать минимум 10 символов', 'error');
            return;
        }

        try {
            // Проверяем API ключ
            const response = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=76561198000000000`);
            
            if (response.ok) {
                this.apiKey = key;
                localStorage.setItem('cs2tool_api_key', key);
                this.showNotification('API ключ успешно сохранен!', 'success');
                this.initApp();
            } else {
                throw new Error('Неверный API ключ');
            }
        } catch (error) {
            console.error('Ошибка проверки API ключа:', error);
            this.showNotification('Неверный API ключ. Проверьте правильность ввода.', 'error');
        }
    }

    bindEvents() {
        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSection(item.dataset.section);
            });
        });

        // Кнопки управления окном
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            this.minimizeWindow();
        });

        document.getElementById('maximizeBtn').addEventListener('click', () => {
            this.maximizeWindow();
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            this.closeWindow();
        });

        // Настройки
        document.getElementById('regionSelect').addEventListener('change', (e) => {
            this.region = e.target.value;
            this.loadServers();
            this.saveSettings();
        });

        document.getElementById('maxThreads').addEventListener('change', (e) => {
            this.maxThreads = parseInt(e.target.value);
            this.saveSettings();
        });

        // Изменение API ключа в настройках
        document.getElementById('changeApiBtn').addEventListener('click', () => {
            this.showChangeApiDialog();
        });

        // Обновление API ключа в настройках
        document.getElementById('apiKeySetting').addEventListener('change', (e) => {
            const newKey = e.target.value.trim();
            if (newKey.length >= 10) {
                this.updateApiKey(newKey);
            }
        });

        // Автоподключение
        const autoConnectToggle = document.getElementById('autoConnectToggle');
        if (autoConnectToggle) {
            autoConnectToggle.checked = this.autoConnectEnabled;
            
            autoConnectToggle.addEventListener('change', (e) => {
                this.autoConnectEnabled = e.target.checked;
                this.saveSettings();
                
                if (this.autoConnectEnabled) {
                    this.showNotification('Автоподключение включено', 'success');
                } else {
                    this.showNotification('Автоподключение отключено', 'info');
                }
            });
        }

        // Кнопка очистки
        const cleanupBtn = document.getElementById('cleanupBtn');
        if (cleanupBtn) {
            cleanupBtn.addEventListener('click', () => {
                this.clearDisappearedServers();
            });
        }
        
        // Кнопка обновления
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.forceUpdateFromScanner();
            });
        }

        // Обработчик для настройки автосохранения
        const autoSaveThreshold = document.getElementById('autoSaveThreshold');
        if (autoSaveThreshold) {
            autoSaveThreshold.addEventListener('change', async (e) => {
                const threshold = parseInt(e.target.value);
                if (threshold > 0 && threshold <= 10) {
                    const success = await this.setAutoSaveThreshold(threshold);
                    if (success) {
                        this.showNotification(`Порог автосохранения установлен: ${threshold} смен карт`, 'success');
                    } else {
                        this.showNotification('Ошибка установки порога автосохранения', 'error');
                    }
                }
            });
        }

        // Обработчик для кнопки расширенных настроек
        const adminLoginBtn = document.getElementById('adminLoginBtn');
        if (adminLoginBtn) {
            adminLoginBtn.addEventListener('click', () => {
                this.showNotification('Расширенные настройки пока недоступны', 'info');
            });
        }
    }

    switchSection(section) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        document.getElementById(`${section}-section`).classList.add('active');

        if (section === 'empty-servers') {
            this.loadEmptyServers();
        } else if (section === 'game-servers') {
            this.loadGameServers();
        } else if (section === 'saved-servers') {
            this.loadSavedServers();
        }
    }

    async loadServers() {
        if (this.isLoading) return;
        
        if (!this.apiKey) {
            this.showError('API ключ не найден. Перейдите в настройки для настройки API ключа.');
            return;
        }
        
        this.isLoading = true;
        
        try {
            const isLocalServer = window.location.hostname === 'localhost' && (window.location.port === '8000' || window.location.port === '8001');
            
            if (!isLocalServer) {
                this.showError('Приложение должно быть запущено локально для работы с нативным сканером.');
                return;
            }
            
            this.updateLoadingStatus('Загрузка серверов...');
            
            // Используем нативный сканер
            if (this.useNativeScanner && this.isConnected) {
                console.log('📡 Используем нативный сканер');
                console.log('🔌 Статус WebSocket:', this.websocket ? this.websocket.readyState : 'не создан');
                this.sendWebSocketMessage('start_scan');
            } else {
                console.log('🌐 Используем браузерный режим');
                console.log('🔌 WebSocket не подключен, причина:', {
                    useNativeScanner: this.useNativeScanner,
                    isConnected: this.isConnected,
                    websocketExists: !!this.websocket,
                    readyState: this.websocket ? this.websocket.readyState : 'не создан'
                });
                await this.scanAllMaps(isLocalServer);
            }
            
        } catch (error) {
            console.error('Ошибка загрузки серверов:', error);
            this.showError('Ошибка загрузки серверов. Проверьте подключение к интернету.');
        } finally {
            this.isLoading = false;
        }
    }

    async scanAllMaps(isLocalServer) {
        const maps = [
            // Активные карты CS2 (Premier/Competitive)
            'de_ancient', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 
            'de_overpass', 'de_train', 'de_vertigo', 'de_anubis', 'de_grail', 'de_jura',
            
            // Карты для Wingman
            'de_brewery', 'de_dogtown',
            
            // Устаревшие карты (для совместимости)
            'de_cache', 'de_dust', 'de_office', 'de_italy', 'de_cobblestone', 'de_aztec'
        ];
        
        const allServers = [];
        let processedMaps = 0;
        
        const executeRequest = async (task) => {
            const { map, index } = task;
            
            try {
                const url = isLocalServer 
                    ? `http://localhost:8000/api/IGameServersService/GetServerList/v1/?key=${this.apiKey}&filter=appid\\730\\map\\${map}\\region\\${this.region}`
                    : `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${this.apiKey}&filter=appid\\730\\map\\${map}\\region\\${this.region}`;
                
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.response && data.response.servers) {
                    allServers.push(...data.response.servers);
                    console.log(`Карта ${map}: найдено ${data.response.servers.length} серверов`);
                }
                
                processedMaps++;
                this.updateLoadingStatus(`Обработано карт: ${processedMaps}/${maps.length}`);
                
            } catch (error) {
                console.error(`Ошибка при сканировании карты ${map}:`, error);
            }
        };
        
        const tasks = maps.map((map, index) => ({ map, index }));
        const chunks = this.chunkArray(tasks, this.maxThreads);
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(executeRequest));
        }
        
        this.processServers(allServers);
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    updateLoadingStatus(message) {
        const serversList = document.getElementById('serversList');
        if (serversList) {
            serversList.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    async loadEmptyServers() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateLoadingStatus('Загрузка пустых серверов...');
        
        try {
            const isLocalServer = window.location.hostname === 'localhost' && (window.location.port === '8000' || window.location.port === '8001');
            
            if (this.useNativeScanner && this.isConnected) {
                this.sendWebSocketMessage('get_empty_servers');
            } else {
                const url = isLocalServer 
                    ? `http://localhost:8000/api/IGameServersService/GetServerList/v1/?key=${this.apiKey}&filter=appid\\730\\map\\graphics_settings\\region\\${this.region}`
                    : `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${this.apiKey}&filter=appid\\730\\map\\graphics_settings\\region\\${this.region}`;
                
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.response && data.response.servers) {
                    this.emptyServers.clear();
                    data.response.servers.forEach(server => {
                        this.emptyServers.set(server.steamid, server);
                    });
                    this.updateEmptyServersDisplay();
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки пустых серверов:', error);
            this.showError('Ошибка загрузки пустых серверов.');
        } finally {
            this.isLoading = false;
        }
    }

    updateEmptyServersDisplay() {
        const serversList = document.getElementById('emptyServersList');
        const serversCount = document.querySelector('#empty-servers-section .servers-count');
        
        if (this.emptyServers.size === 0) {
            serversList.innerHTML = `
                <div class="loading">
                    <i class="fas fa-ghost" style="font-size: 48px; color: #64ffda; margin-bottom: 20px;"></i>
                    <p>Пустых серверов не найдено</p>
                </div>
            `;
            serversCount.textContent = 'Пустые серверы (0)';
            return;
        }

        serversList.innerHTML = '';
        
        // Сортируем пустые серверы по времени последнего обновления (новые сверху)
        const sortedEmptyServers = Array.from(this.emptyServers.values()).sort((a, b) => {
            // Используем время последнего обновления или время добавления в историю
            const timeA = new Date(a.last_update || a.added_at || 0).getTime();
            const timeB = new Date(b.last_update || b.added_at || 0).getTime();
            return timeB - timeA; // Новые сверху
        });
        
        sortedEmptyServers.forEach(server => {
            const serverCard = this.createServerCard(server);
            serversList.appendChild(serverCard);
        });
        
        serversCount.textContent = `Пустые серверы (${this.emptyServers.size})`;
    }

    async loadGameServers() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateLoadingStatus('Загрузка игровых серверов...');
        
        try {
            const isLocalServer = window.location.hostname === 'localhost' && (window.location.port === '8000' || window.location.port === '8001');
            
            if (this.useNativeScanner && this.isConnected) {
                this.sendWebSocketMessage('get_game_servers');
            } else {
                const maps = ['de_dust2', 'de_mirage', 'de_inferno', 'de_cache', 'de_overpass', 'de_nuke', 'de_train', 'de_ancient', 'de_vertigo', 'de_anubis'];
                const allServers = [];
                
                for (const map of maps) {
                    const url = isLocalServer 
                        ? `http://localhost:8000/api/IGameServersService/GetServerList/v1/?key=${this.apiKey}&filter=appid\\730\\map\\${map}\\region\\${this.region}`
                        : `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${this.apiKey}&filter=appid\\730\\map\\${map}\\region\\${this.region}`;
                    
                    const response = await fetch(url);
                    const data = await response.json();
                    
                    if (data.response && data.response.servers) {
                        allServers.push(...data.response.servers);
                    }
                }
                
                this.gameServers.clear();
                allServers.forEach(server => {
                    this.gameServers.set(server.steamid, server);
                });
                this.updateGameServersDisplay();
            }
        } catch (error) {
            console.error('Ошибка загрузки игровых серверов:', error);
            this.showError('Ошибка загрузки игровых серверов.');
        } finally {
            this.isLoading = false;
        }
    }

    updateGameServersDisplay() {
        const serversList = document.getElementById('gameServersList');
        const serversCount = document.querySelector('#game-servers-section .servers-count');
        
        if (this.gameServers.size === 0) {
            serversList.innerHTML = `
                <div class="loading">
                    <i class="fas fa-gamepad" style="font-size: 48px; color: #64ffda; margin-bottom: 20px;"></i>
                    <p>Игровых серверов не найдено</p>
                </div>
            `;
            serversCount.textContent = 'Игровые серверы (0)';
            return;
        }

        serversList.innerHTML = '';
        
        // Сортируем игровые серверы по времени последнего обновления (новые сверху)
        const sortedGameServers = Array.from(this.gameServers.values()).sort((a, b) => {
            // Используем время последнего обновления или время добавления в историю
            const timeA = new Date(a.last_update || a.added_at || 0).getTime();
            const timeB = new Date(b.last_update || b.added_at || 0).getTime();
            return timeB - timeA; // Новые сверху
        });
        
        sortedGameServers.forEach(server => {
            const serverCard = this.createServerCard(server);
            serversList.appendChild(serverCard);
        });
        
        serversCount.textContent = `Игровые серверы (${this.gameServers.size})`;
    }

    processServers(servers) {
        const newServers = [];
        const disappearedServers = [];
        const returnedServers = [];
        
        servers.forEach(server => {
            const steamId = server.steamid;
            const wasInHistory = this.serverHistory.has(steamId);
            const isCurrentlyDisappeared = server.map === 'graphics_settings';
            
            if (!wasInHistory) {
                console.log('новый сервер добавлен в историю:', server.name || server.addr, 'карта:', server.map);
                this.serverHistory.set(steamId, server);
            }
            
            if (isCurrentlyDisappeared) {
                if (!this.servers.has(steamId)) {
                    disappearedServers.push(server);
                }
                this.servers.set(steamId, server);
            } else {
                if (this.servers.has(steamId)) {
                    returnedServers.push(server);
                    this.servers.delete(steamId);
                }
            }
        });
        
        this.updateServersDisplay();
        
        console.log(`Результаты сканирования: ${newServers.length} новых, ${disappearedServers.length} исчезнувших, ${returnedServers.length} вернувшихся серверов`);
        
        if (disappearedServers.length > 0) {
            this.showNotification(`${disappearedServers.length} серверов перешли на graphics_settings`, 'warning');
        }
        
        if (returnedServers.length > 0) {
            this.showNotification(`${returnedServers.length} серверов вернулись с graphics_settings`, 'success');
        }
    }

    updateServersDisplay() {
        const serversList = document.getElementById('serversList');
        const serversCount = document.querySelector('.servers-count');
        
        console.log(`обновление отображения: ${this.servers.size} исчезнувших серверов, ${this.serverHistory.size} в истории`);
        console.log('список исчезнувших серверов:', Array.from(this.servers.values()).map(s => s.name || s.addr));
        
        if (this.servers.size === 0) {
            console.log('нет исчезнувших серверов, показываем сообщение ожидания');
            serversList.innerHTML = `
                <div class="loading">
                    <i class="fas fa-search" style="font-size: 48px; color: #64ffda; margin-bottom: 20px;"></i>
                    <p>Ожидание серверов, перешедших на graphics_settings...</p>
                    <p style="font-size: 12px; color: #888;">Отслеживается ${this.serverHistory.size} серверов</p>
                    <p style="font-size: 10px; color: #666;">Серверы на обычных картах не отображаются</p>
                </div>
            `;
            serversCount.textContent = `Отслеживается: ${this.serverHistory.size} серверов | Исчезнувших: 0`;
            return;
        }

        serversList.innerHTML = '';
        
        // Сортируем серверы по времени исчезновения (новые сверху)
        const sortedServers = Array.from(this.servers.values()).sort((a, b) => {
            const timeA = new Date(a.disappeared_at || 0).getTime();
            const timeB = new Date(b.disappeared_at || 0).getTime();
            return timeB - timeA; // Новые сверху
        });
        
        sortedServers.forEach(server => {
            const serverCard = this.createServerCard(server);
            serversList.appendChild(serverCard);
        });
        
        serversCount.textContent = `Исчезнувших серверов: ${this.servers.size} | Отслеживается: ${this.serverHistory.size}`;
    }

    createServerCard(server) {
        const card = document.createElement('div');
        card.className = 'server-card';
        card.dataset.steamId = server.steamid;
        
        const isDisappeared = server.map === 'graphics_settings' && server.disappeared_at;
        
        if (isDisappeared) {
            const disappearedDate = new Date(server.disappeared_at).toLocaleString('ru-RU');
            
            card.innerHTML = `
                <div class="server-header">
                    <div class="server-name">${this.escapeHtml(server.name)}</div>
                    <div class="server-status">
                        <div class="status-indicator disappeared"></div>
                        <span>Исчез</span>
                    </div>
                </div>
                
                <div class="server-details">
                    <div class="detail-item">
                        <div class="detail-label">IP:Port</div>
                        <div class="detail-value">${server.addr}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Карта</div>
                        <div class="detail-value">graphics_settings</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Исчез</div>
                        <div class="detail-value">${disappearedDate}</div>
                    </div>
                </div>
                
                <div class="server-actions">
                    <button class="action-btn copy-btn" onclick="cs2Tool.copyServer('${server.addr}')">
                        <i class="fas fa-copy"></i>
                        Копировать IP
                    </button>
                    <button class="action-btn connect-btn" onclick="cs2Tool.connectToServer('${server.addr}')">
                        <i class="fas fa-play"></i>
                        Подключиться
                    </button>
                </div>
            `;
        } else {
            const players = server.players || 0;
            const maxPlayers = server.max_players || 64;
            const bots = server.bots || 0;
            const realPlayers = players - bots;
            
            card.innerHTML = `
                <div class="server-header">
                    <div class="server-name">${this.escapeHtml(server.name)}</div>
                    <div class="server-status">
                        <div class="status-indicator"></div>
                        <span>Онлайн</span>
                    </div>
                </div>
                
                <div class="server-details">
                    <div class="detail-item">
                        <div class="detail-label">IP:Port</div>
                        <div class="detail-value">${server.addr}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Игроки</div>
                        <div class="detail-value">${realPlayers}/${maxPlayers} (${bots} ботов)</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Карта</div>
                        <div class="detail-value">${server.map}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Версия</div>
                        <div class="detail-value">${server.version}</div>
                    </div>
                </div>
                
                <div class="server-actions">
                    <button class="action-btn copy-btn" onclick="cs2Tool.copyServer('${server.addr}')">
                        <i class="fas fa-copy"></i>
                        Копировать IP
                    </button>
                    <button class="action-btn connect-btn" onclick="cs2Tool.connectToServer('${server.addr}')">
                        <i class="fas fa-play"></i>
                        Подключиться
                    </button>
                </div>
            `;
        }
        
        return card;
    }

    async loadMapChangesStats(steamId) {
        try {
            const stats = await this.getMapChangesStats(steamId);
            const countElement = document.querySelector(`[data-steam-id="${steamId}"]`);
            
            if (countElement && stats.status === 'success') {
                const changesCount = stats.stats.changes_count || 0;
                const lastChange = stats.stats.last_change;
                
                let displayText = `${changesCount} раз`;
                
                if (changesCount > 0 && lastChange) {
                    const lastChangeDate = new Date(lastChange).toLocaleString('ru-RU');
                    displayText += ` (последняя: ${lastChangeDate})`;
                }
                
                if (changesCount >= 3) {
                    displayText += ' 🔄';
                }
                
                countElement.innerHTML = displayText;
                countElement.className = 'detail-value map-changes-count';
                
                if (changesCount > 0) {
                    countElement.style.color = '#64ffda';
                    countElement.style.fontWeight = 'bold';
                }
            } else if (countElement) {
                countElement.innerHTML = '0 раз';
            }
        } catch (error) {
            console.error('Ошибка загрузки статистики смен карт:', error);
            const countElement = document.querySelector(`[data-steam-id="${steamId}"]`);
            if (countElement) {
                countElement.innerHTML = 'Ошибка загрузки';
            }
        }
    }

    clearDisappearedServers() {
        this.servers.clear();
        this.updateServersDisplay();
        this.showNotification('Список исчезнувших серверов очищен', 'success');
    }

    copyServer(address) {
        navigator.clipboard.writeText(address).then(() => {
            this.showNotification(`IP адрес скопирован: ${address}`, 'success');
        }).catch(() => {
            this.fallbackCopyTextToClipboard(address);
            this.showNotification(`IP адрес скопирован: ${address}`, 'success');
        });
    }

    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    connectToServer(address) {
        const steamConnectUrl = `steam://connect/${address}`;
        
        this.showNotification(`Подключение к серверу: ${address}`, 'success');
        
        try {
            window.open(steamConnectUrl, '_blank');
        } catch (error) {
            const connectCommand = `connect ${address}`;
            navigator.clipboard.writeText(connectCommand).then(() => {
                this.showNotification(`Команда подключения скопирована: ${connectCommand}`, 'success');
            }).catch(() => {
                this.fallbackCopyTextToClipboard(connectCommand);
                this.showNotification(`Команда подключения скопирована: ${connectCommand}`, 'success');
            });
            
            setTimeout(() => {
                this.showNotification('Вставьте команду в консоль CS2 (F1)', 'info');
            }, 1000);
        }
    }

    autoConnectToServer(server) {
        if (!this.autoConnectEnabled) return;
        
        const steamConnectUrl = `steam://connect/${server.addr}`;
        
        this.showNotification(`Автоподключение к серверу: ${server.name || server.addr}`, 'success');
        
        this.autoConnectEnabled = false;
        const toggle = document.getElementById('autoConnectToggle');
        if (toggle) {
            toggle.checked = false;
        }
        
        try {
            window.open(steamConnectUrl, '_blank');
        } catch (error) {
            const connectCommand = `connect ${server.addr}`;
            navigator.clipboard.writeText(connectCommand).then(() => {
                this.showNotification(`Команда подключения скопирована: ${connectCommand}`, 'success');
            }).catch(() => {
                this.fallbackCopyTextToClipboard(connectCommand);
                this.showNotification(`Команда подключения скопирована: ${connectCommand}`, 'success');
            });
            
            setTimeout(() => {
                this.showNotification('Вставьте команду в консоль CS2 (F1)', 'info');
            }, 1000);
        }
    }

    showError(message) {
        const serversList = document.getElementById('serversList');
        serversList.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;"></i>
                <p>${message}</p>
            </div>
        `;
    }

    showNotification(message, type = 'success') {
        // Получаем контейнер для уведомлений
        let container = document.getElementById('notificationsContainer');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notifications-container';
            container.id = 'notificationsContainer';
            document.body.appendChild(container);
        }

        // Создаем уникальный ID для уведомления
        const notificationId = 'notification_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Определяем иконку для типа уведомления
        const getIcon = (type) => {
            switch (type) {
                case 'success': return 'fas fa-check';
                case 'error': return 'fas fa-exclamation-triangle';
                case 'warning': return 'fas fa-exclamation-circle';
                case 'info': return 'fas fa-info-circle';
                default: return 'fas fa-bell';
            }
        };

        // Создаем элемент уведомления
        const notification = document.createElement('div');
        notification.className = `notification-item ${type}`;
        notification.id = notificationId;
        
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">
                    <i class="${getIcon(type)}"></i>
                </div>
                <div class="notification-text">${this.escapeHtml(message)}</div>
                <button class="notification-close" onclick="cs2Tool.closeNotification('${notificationId}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="notification-progress"></div>
        `;

        // Добавляем уведомление в контейнер
        container.appendChild(notification);

        // Анимация появления
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Прогресс-бар
        const progress = notification.querySelector('.notification-progress');
        const duration = 5000; // 5 секунд
        const startTime = Date.now();
        
        const updateProgress = () => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, duration - elapsed);
            const progressPercent = (remaining / duration) * 100;
            
            progress.style.width = progressPercent + '%';
            
            if (remaining > 0) {
                requestAnimationFrame(updateProgress);
            }
        };
        
        updateProgress();

        // Автоматическое закрытие
        const autoCloseTimeout = setTimeout(() => {
            this.closeNotification(notificationId);
        }, duration);

        // Сохраняем timeout для возможности отмены
        notification.dataset.autoCloseTimeout = autoCloseTimeout;

        // Звуковое уведомление
        this.playNotificationSound(type);

        return notificationId;
    }

    closeNotification(notificationId) {
        const notification = document.getElementById(notificationId);
        if (!notification) return;

        // Отменяем автоматическое закрытие
        if (notification.dataset.autoCloseTimeout) {
            clearTimeout(parseInt(notification.dataset.autoCloseTimeout));
        }

        // Анимация исчезновения
        notification.classList.add('hide');
        
        // Удаляем элемент после анимации
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 400);
    }

    playNotificationSound(type) {
        try {
            const audio = document.getElementById('serverFoundSound');
            if (audio) {
                // Разные громкости для разных типов уведомлений
                const volumes = {
                    'success': 0.3,
                    'error': 0.5,
                    'warning': 0.4,
                    'info': 0.2
                };
                
                audio.volume = volumes[type] || 0.3;
                audio.currentTime = 0;
                audio.play().catch(e => console.log('Ошибка воспроизведения звука:', e));
            }
        } catch (e) {
            console.log('Ошибка воспроизведения звука:', e);
        }
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('cs2tool_settings') || '{}');
        
        this.region = settings.region || '44';
        this.maxThreads = settings.maxThreads || 50;
        this.autoConnectEnabled = settings.autoConnectEnabled || false;
        
        if (document.getElementById('regionSelect')) {
            document.getElementById('regionSelect').value = this.region;
        }
        if (document.getElementById('maxThreads')) {
            document.getElementById('maxThreads').value = this.maxThreads;
        }
        if (document.getElementById('apiKeySetting')) {
            document.getElementById('apiKeySetting').value = this.apiKey || '';
        }
        if (document.getElementById('autoConnectToggle')) {
            document.getElementById('autoConnectToggle').checked = this.autoConnectEnabled;
        }

        // Загружаем настройки автосохранения
        this.loadAutoSaveSettings();
    }

    async loadAutoSaveSettings() {
        try {
            const threshold = await this.getAutoSaveThreshold();
            const autoSaveThreshold = document.getElementById('autoSaveThreshold');
            if (autoSaveThreshold) {
                autoSaveThreshold.value = threshold;
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек автосохранения:', error);
        }
    }

    saveSettings() {
        const settings = {
            region: this.region,
            maxThreads: this.maxThreads,
            autoConnectEnabled: this.autoConnectEnabled
        };
        
        localStorage.setItem('cs2tool_settings', JSON.stringify(settings));
    }

    minimizeWindow() {
        this.showNotification('Функция минимизации недоступна в веб-версии');
    }

    maximizeWindow() {
        this.showNotification('Функция максимизации недоступна в веб-версии');
    }

    closeWindow() {
        this.showNotification('Функция закрытия недоступна в веб-версии');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showChangeApiDialog() {
        if (confirm('Вы хотите изменить API ключ? Текущий ключ будет удален.')) {
            localStorage.removeItem('cs2tool_api_key');
            this.apiKey = null;
            this.showApiScreen();
        }
    }

    async updateApiKey(newKey) {
        try {
            const response = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${newKey}&steamids=76561198000000000`);
            
            if (response.ok) {
                this.apiKey = newKey;
                localStorage.setItem('cs2tool_api_key', newKey);
                this.showNotification('API ключ успешно обновлен!', 'success');
                
                if (this.autoRefresh) {
                    this.loadServers();
                }
            } else {
                throw new Error('Неверный API ключ');
            }
        } catch (error) {
            console.error('Ошибка обновления API ключа:', error);
            this.showNotification('Неверный API ключ. Проверьте правильность ввода.', 'error');
        }
    }

    resetApiKey() {
        if (confirm('Вы уверены, что хотите сбросить API ключ? Это потребует повторной настройки.')) {
            localStorage.removeItem('cs2tool_api_key');
            this.apiKey = null;
            this.showApiScreen();
        }
    }
    
    initWebSocket() {
        try {
            console.log('🔌 Попытка подключения к нативному сканеру...');
            this.websocket = new WebSocket('ws://localhost:8765');
            
            this.websocket.onopen = () => {
                console.log('🔌 WebSocket соединение установлено');
                this.isConnected = true;
                this.useNativeScanner = true;
                this.showNotification('Подключение к нативному сканеру установлено', 'success');
                
                if (this.apiKey) {
                    console.log('🔑 Отправка API ключа нативному сканеру...');
                    this.sendWebSocketMessage('set_api_key', { api_key: this.apiKey });
                } else {
                    console.warn('⚠️ API ключ не найден, нативный сканер не запустится');
                    this.showNotification('API ключ не найден. Перейдите в настройки.', 'warning');
                }
            };
            
            this.websocket.onmessage = (event) => {
                console.log('📨 Получено WebSocket сообщение:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('❌ Ошибка парсинга WebSocket сообщения:', error);
                }
            };
            
            this.websocket.onclose = () => {
                console.log('🔌 WebSocket соединение закрыто');
                this.isConnected = false;
                this.showNotification('Соединение с нативным сканером потеряно', 'warning');
                
                setTimeout(() => {
                    if (this.useNativeScanner) {
                        this.initWebSocket();
                    }
                }, 5000);
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket ошибка:', error);
                this.isConnected = false;
                this.showNotification('Ошибка подключения к нативному сканеру', 'error');
            };
            
        } catch (error) {
            console.error('❌ Ошибка инициализации WebSocket:', error);
            this.useNativeScanner = false;
            this.showNotification('Нативный сканер недоступен, используется браузерный режим', 'warning');
        }
    }
    
    handleWebSocketMessage(data) {
        console.log('📨 Обработка WebSocket сообщения типа:', data.type);
        console.log('📨 Полные данные сообщения:', data);
        
        switch (data.type) {
            case 'api_key_set':
                console.log('🔑 Обработка установки API ключа');
                this.handleApiKeySet(data);
                break;
            case 'initial_state':
                console.log('📊 Обработка начального состояния');
                this.handleInitialState(data);
                break;
            case 'scan_complete':
                console.log('✅ Обработка завершения сканирования');
                this.handleScanComplete(data);
                break;
            case 'empty_servers_update':
                console.log('🎮 Обработка обновления пустых серверов');
                this.handleEmptyServersUpdate(data);
                break;
            case 'game_servers_update':
                console.log('🎮 Обработка обновления игровых серверов');
                this.handleGameServersUpdate(data);
                break;
            case 'saved_servers_update':
                console.log('📦 Обработка обновления сохраненных серверов');
                this.handleSavedServersUpdate(data);
                break;
            case 'scan_started':
                console.log('🚀 Сканирование запущено нативным сканером');
                this.showNotification('Сканирование запущено', 'success');
                break;
            case 'force_update':
                console.log('📤 Принудительное обновление получено');
                this.showNotification('Данные обновлены', 'success');
                break;
            case 'error':
                console.log('❌ Обработка ошибки от сканера');
                this.showNotification(`Ошибка нативного сканера: ${data.message}`, 'error');
                break;
            default:
                console.log('❓ Неизвестный тип WebSocket сообщения:', data.type);
                break;
        }
    }
    
    handleApiKeySet(data) {
        if (data.status === 'success') {
            console.log('🔑 API ключ успешно установлен в нативном сканере');
            this.showNotification('Нативный сканер запущен', 'success');
            this.sendWebSocketMessage('get_initial_state');
        } else {
            console.error('❌ Ошибка установки API ключа:', data.message);
            this.showNotification(`Ошибка установки API ключа: ${data.message}`, 'error');
        }
    }
    
    handleInitialState(data) {
        console.log('📊 Получено начальное состояние от нативного сканера');
        console.log('📊 Полные данные начального состояния:', data);
        
        // Проверяем различные возможные форматы данных
        let disappearedServers = [];
        let gameServers = [];
        let stats = {};
        
        if (data.disappeared_servers) {
            disappearedServers = data.disappeared_servers;
        } else if (data.servers) {
            // Если данные приходят в формате servers с фильтрацией
            disappearedServers = data.servers.filter(server => server.map === 'graphics_settings');
            gameServers = data.servers.filter(server => server.map !== 'graphics_settings');
        }
        
        if (data.stats) {
            stats = data.stats;
        } else {
            // Создаем базовую статистику
            stats = {
                total_tracked: gameServers.length + disappearedServers.length
            };
        }
        
        console.log('🔍 Обработанные данные начального состояния:', {
            disappeared_servers: disappearedServers.length,
            game_servers: gameServers.length,
            stats: stats
        });
        
        this.servers.clear();
        disappearedServers.forEach(server => {
            console.log('🔍 Добавляем исчезнувший сервер (начальное состояние):', server.name || server.addr, 'карта:', server.map);
            this.servers.set(server.steamid, server);
        });
        
        this.gameServers.clear();
        gameServers.forEach(server => {
            this.gameServers.set(server.steamid, server);
        });
        
        this.updateServersDisplay();
        this.updateGameServersDisplay();
        
        console.log(`📊 Загружено: ${this.servers.size} исчезнувших, ${this.gameServers.size} игровых серверов`);
        
        if (stats.total_tracked > 0) {
            this.showNotification(`Загружено ${stats.total_tracked} серверов для отслеживания`, 'success');
        }
    }
    
    handleScanComplete(data) {
        console.log('✅ Сканирование завершено (нативный сканер)');
        console.log('📊 Полные данные от сканера:', data);
        
        // Проверяем различные возможные форматы данных
        let disappearedServers = [];
        let gameServers = [];
        let stats = {};
        
        if (data.disappeared_servers) {
            disappearedServers = data.disappeared_servers;
        } else if (data.servers) {
            // Если данные приходят в формате servers с фильтрацией
            disappearedServers = data.servers.filter(server => server.map === 'graphics_settings');
            gameServers = data.servers.filter(server => server.map !== 'graphics_settings');
        }
        
        if (data.stats) {
            stats = data.stats;
        } else {
            // Создаем базовую статистику
            stats = {
                disappeared_count: disappearedServers.length,
                returned_count: 0,
                total_current: gameServers.length
            };
        }
        
        console.log('🔍 Обработанные данные:', {
            disappeared_servers: disappearedServers.length,
            game_servers: gameServers.length,
            stats: stats
        });
        
        // Очищаем и заполняем списки
        this.servers.clear();
        disappearedServers.forEach(server => {
            console.log('🔍 Добавляем исчезнувший сервер:', server.name || server.addr, 'карта:', server.map);
            this.servers.set(server.steamid, server);
        });
        
        this.gameServers.clear();
        gameServers.forEach(server => {
            this.gameServers.set(server.steamid, server);
        });
        
        console.log(`📊 После обработки: ${this.servers.size} исчезнувших, ${this.gameServers.size} игровых серверов`);
        
        this.updateServersDisplay();
        this.updateGameServersDisplay();
        
        if (stats.disappeared_count > 0) {
            this.showNotification(`${stats.disappeared_count} серверов перешли на graphics_settings`, 'warning');
            
            if (this.autoConnectEnabled && disappearedServers.length > 0) {
                const newServer = disappearedServers[0];
                this.autoConnectToServer(newServer);
            }
        }
        if (stats.returned_count > 0) {
            this.showNotification(`${stats.returned_count} серверов вернулись с graphics_settings`, 'success');
        }
        
        console.log(`📊 Статистика: ${stats.disappeared_count} исчезло, ${stats.returned_count} вернулось, ${stats.total_current} всего`);
    }
    
    handleEmptyServersUpdate(data) {
        console.log('🎮 Обновление пустых серверов от нативного сканера');
        
        this.emptyServers.clear();
        data.empty_servers.forEach(server => {
            this.emptyServers.set(server.steamid, server);
        });
        
        this.updateEmptyServersDisplay();
        this.showNotification(`Загружено ${this.emptyServers.size} пустых серверов`, 'success');
    }
    
    handleGameServersUpdate(data) {
        console.log('🎮 Обновление игровых серверов от нативного сканера');
        
        this.gameServers.clear();
        data.game_servers.forEach(server => {
            this.gameServers.set(server.steamid, server);
        });
        
        this.updateGameServersDisplay();
        this.showNotification(`Загружено ${this.gameServers.size} игровых серверов`, 'success');
    }

    handleSavedServersUpdate(data) {
        console.log('📦 Обновление сохраненных серверов');
        if (data.saved_servers) {
            this.savedServers = data.saved_servers;
            this.updateSavedServersDisplay();
            this.updateSavedServersStats();
        }
    }

    updateSavedServersDisplay() {
        const savedServersList = document.getElementById('savedServersList');
        if (!savedServersList) return;

        if (!this.savedServers || this.savedServers.length === 0) {
            savedServersList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bookmark" style="font-size: 48px; color: #64ffda; margin-bottom: 20px;"></i>
                    <p>Нет сохраненных серверов</p>
                    <p style="font-size: 12px; color: #888;">Серверы автоматически сохраняются при частой смене карт</p>
                </div>
            `;
            return;
        }

        savedServersList.innerHTML = '';
        
        // Сортируем сохраненные серверы по количеству смен карт (больше смен сверху)
        const sortedSavedServers = this.savedServers.sort((a, b) => {
            const changesA = a.map_changes_count || 0;
            const changesB = b.map_changes_count || 0;
            return changesB - changesA; // Больше смен сверху
        });
        
        sortedSavedServers.forEach(server => {
            const serverCard = this.createSavedServerCard(server);
            savedServersList.appendChild(serverCard);
        });
    }

    createSavedServerCard(server) {
        const card = document.createElement('div');
        card.className = 'saved-server-card';
        
        // Получаем статистику смен карт для этого сервера
        const mapChangesInfo = this.getMapChangesInfo(server);
        
        card.innerHTML = `
            <div class="saved-server-header">
                <div class="saved-server-name">${this.escapeHtml(server.name)}</div>
                <div class="saved-server-actions">
                    <button class="action-btn copy-btn" onclick="cs2Tool.copyServer('${server.ip}:${server.port}')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn connect-btn" onclick="cs2Tool.connectToServer('${server.ip}:${server.port}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="cs2Tool.deleteSavedServer('${server.ip}', '${server.port}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="saved-server-details">
                <div class="detail-item">
                    <div class="detail-label">IP:Port</div>
                    <div class="detail-value">${server.ip}:${server.port}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Режим</div>
                    <div class="detail-value">${this.getModeDisplayName(server.mode)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Смены карт</div>
                    <div class="detail-value map-changes-info">
                        ${mapChangesInfo}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Описание</div>
                    <div class="detail-value">${this.escapeHtml(server.description || 'Нет описания')}</div>
                </div>
            </div>
        `;
        
        return card;
    }

    getMapChangesInfo(server) {
        // Получаем информацию о смене карт из данных сервера
        const mapChangesCount = server.map_changes_count || 0;
        const lastMapChange = server.last_map_change || 'unknown';
        
        if (mapChangesCount === 0) {
            return '<span style="color: #888;">Нет данных</span>';
        }
        
        let lastChangeText = '';
        if (lastMapChange !== 'unknown') {
            try {
                const changeDate = new Date(lastMapChange);
                lastChangeText = ` (последняя: ${changeDate.toLocaleString('ru-RU')})`;
            } catch (e) {
                lastChangeText = '';
            }
        }
        
        return `<span style="color: #64ffda; font-weight: bold;">${mapChangesCount} смен${lastChangeText}</span>`;
    }

    getModeDisplayName(mode) {
        // Возвращает красивое отображение режима с цветовым кодированием
        const modeStyles = {
            'Premier/Competitive': '<span style="color: #64ffda; font-weight: bold;">🏆 Premier/Competitive</span>',
            'Wingman': '<span style="color: #ff6b6b; font-weight: bold;">⚔️ Wingman</span>',
            'Legacy': '<span style="color: #ffd93d; font-weight: bold;">📜 Legacy</span>',
            'Mixed (Premier + Wingman)': '<span style="color: #a8e6cf; font-weight: bold;">🔄 Mixed (Premier + Wingman)</span>',
            'Mixed': '<span style="color: #ffb3ba; font-weight: bold;">🔄 Mixed</span>',
            'unknown': '<span style="color: #888;">❓ Неизвестно</span>'
        };
        
        return modeStyles[mode] || `<span style="color: #888;">${mode}</span>`;
    }

    updateSavedServersStats() {
        const totalSavedServers = document.getElementById('totalSavedServers');
        const autoSavedServers = document.getElementById('autoSavedServers');
        const topMapChanges = document.getElementById('topMapChanges');
        
        if (totalSavedServers) {
            totalSavedServers.textContent = this.savedServers ? this.savedServers.length : 0;
        }
        
        if (autoSavedServers) {
            const autoSavedCount = this.savedServers ? 
                this.savedServers.filter(s => s.description && s.description.includes('Автосохранен')).length : 0;
            autoSavedServers.textContent = autoSavedCount;
        }
        
        if (topMapChanges) {
            // Находим максимальное количество смен карт среди сохраненных серверов
            if (this.savedServers && this.savedServers.length > 0) {
                const maxChanges = Math.max(...this.savedServers.map(s => s.map_changes_count || 0));
                topMapChanges.textContent = maxChanges;
            } else {
                topMapChanges.textContent = '0';
            }
        }
    }

    loadSavedServers() {
        if (this.isConnected) {
            this.sendWebSocketMessage('get_saved_servers');
        }
    }

    deleteSavedServer(ip, port) {
        if (confirm(`Удалить сервер ${ip}:${port}?`)) {
            if (this.isConnected) {
                this.sendWebSocketMessage('delete_saved_server', { ip, port });
            }
        }
    }
    
    sendWebSocketMessage(type, data = {}) {
        if (this.websocket && this.isConnected) {
            const message = { type, ...data };
            this.websocket.send(JSON.stringify(message));
            console.log('📤 Отправлено WebSocket сообщение:', type);
        } else {
            console.warn('⚠️ WebSocket не подключен, используем браузерный режим');
            this.useNativeScanner = false;
        }
    }
    
    forceUpdateFromScanner() {
        console.log('📤 Запрос принудительного обновления от сканера');
        this.sendWebSocketMessage('force_update');
    }

    // Методы для работы с селектором карт
    initMapsSelector() {
        console.log('🗺️ Инициализация селектора карт...');
        this.loadMapsSettings();
        this.renderMapsSelector();
        this.bindMapsEvents();
        console.log('✅ Селектор карт инициализирован');
    }

    loadMapsSettings() {
        const savedMaps = localStorage.getItem('cs2tool_selected_maps');
        if (savedMaps) {
            try {
                const maps = JSON.parse(savedMaps);
                this.selectedMaps = new Set(maps);
            } catch (e) {
                console.error('❌ Ошибка загрузки настроек карт:', e);
                this.selectedMaps = new Set(this.availableMaps); // По умолчанию все карты
            }
        } else {
            // По умолчанию выбираем все карты
            this.selectedMaps = new Set(this.availableMaps);
        }
    }

    saveMapsSettings() {
        try {
            localStorage.setItem('cs2tool_selected_maps', JSON.stringify([...this.selectedMaps]));
            console.log('💾 Настройки карт сохранены');
        } catch (e) {
            console.error('❌ Ошибка сохранения настроек карт:', e);
        }
    }

    renderMapsSelector() {
        const mapsList = document.getElementById('mapsList');
        if (!mapsList) return;

        mapsList.innerHTML = '';
        
        // Группируем карты по категориям
        const mapCategories = {
            'premier': ['de_ancient', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 'de_overpass', 'de_train'],
            'competitive': ['de_vertigo', 'de_anubis', 'de_grail', 'de_jura'],
            'wingman': ['de_brewery', 'de_dogtown'],
            'legacy': ['de_cache', 'de_dust', 'de_office', 'de_italy', 'de_cobblestone', 'de_aztec']
        };
        
        const categoryNames = {
            'premier': '🏆 Premier/Competitive',
            'competitive': '⚔️ Competitive',
            'wingman': '👥 Wingman',
            'legacy': '📜 Устаревшие'
        };
        
        // Рендерим карты по категориям
        Object.entries(mapCategories).forEach(([category, maps]) => {
            // Добавляем заголовок категории
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'map-category-header';
            categoryHeader.innerHTML = `<span>${categoryNames[category]}</span>`;
            mapsList.appendChild(categoryHeader);
            
            // Добавляем карты категории
            maps.forEach(mapName => {
                if (this.availableMaps.includes(mapName)) {
                    const isSelected = this.selectedMaps.has(mapName);
                    const mapItem = document.createElement('div');
                    mapItem.className = `map-item ${isSelected ? 'selected' : ''}`;
                    mapItem.dataset.map = mapName;
                    
                    mapItem.innerHTML = `
                        <div class="map-checkbox">
                            ${isSelected ? '<i class="fas fa-check"></i>' : ''}
                        </div>
                        <span class="map-name">${this.getMapDisplayName(mapName)}</span>
                        <span class="map-count" id="count-${mapName}">0</span>
                    `;
                    
                    mapsList.appendChild(mapItem);
                }
            });
        });
        
        // Обновляем состояние кнопок
        this.updateMapsButtonsState();
        
        // Обновляем статистику
        this.updateMapsStats();
    }

    getMapDisplayName(mapName) {
        const mapNames = {
            // Активные карты CS2 (Premier/Competitive)
            'de_ancient': 'Ancient',
            'de_dust2': 'Dust II',
            'de_inferno': 'Inferno',
            'de_mirage': 'Mirage',
            'de_nuke': 'Nuke',
            'de_overpass': 'Overpass',
            'de_train': 'Train',
            'de_vertigo': 'Vertigo',
            'de_anubis': 'Anubis',
            'de_grail': 'Grail',
            'de_jura': 'Jura',
            
            // Карты для Wingman
            'de_brewery': 'Brewery',
            'de_dogtown': 'Dogtown',
            
            // Устаревшие карты
            'de_cache': 'Cache',
            'de_dust': 'Dust',
            'de_office': 'Office',
            'de_italy': 'Italy',
            'de_cobblestone': 'Cobblestone',
            'de_aztec': 'Aztec'
        };
        return mapNames[mapName] || mapName;
    }

    bindMapsEvents() {
        // Обработчики для кнопок "Все" и "Ни одной"
        const selectAllBtn = document.getElementById('selectAllMaps');
        const deselectAllBtn = document.getElementById('deselectAllMaps');
        const selectPopularBtn = document.getElementById('selectPopularMaps');
        
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this.selectedMaps = new Set(this.availableMaps);
                this.renderMapsSelector();
                this.saveMapsSettings();
                this.sendMapsUpdateToScanner();
                console.log('✅ Выбраны все карты');
            });
        }
        
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => {
                this.selectedMaps.clear();
                this.renderMapsSelector();
                this.saveMapsSettings();
                this.sendMapsUpdateToScanner();
                console.log('❌ Сняты все карты');
            });
        }
        
        if (selectPopularBtn) {
            selectPopularBtn.addEventListener('click', () => {
                this.selectPopularMaps();
            });
        }

        // Обработчики для отдельных карт
        const mapsList = document.getElementById('mapsList');
        if (mapsList) {
            mapsList.addEventListener('click', (e) => {
                const mapItem = e.target.closest('.map-item');
                if (mapItem) {
                    const mapName = mapItem.dataset.map;
                    this.toggleMap(mapName);
                }
            });
        }
    }

    toggleMap(mapName) {
        if (this.selectedMaps.has(mapName)) {
            this.selectedMaps.delete(mapName);
        } else {
            this.selectedMaps.add(mapName);
        }
        
        this.renderMapsSelector();
        this.saveMapsSettings();
        this.sendMapsUpdateToScanner();
        
        console.log(`🔄 Карта ${mapName} ${this.selectedMaps.has(mapName) ? 'выбрана' : 'снята'}`);
    }

    updateMapsButtonsState() {
        const selectAllBtn = document.getElementById('selectAllMaps');
        const deselectAllBtn = document.getElementById('deselectAllMaps');
        
        if (selectAllBtn && deselectAllBtn) {
            const allSelected = this.selectedMaps.size === this.availableMaps.length;
            const noneSelected = this.selectedMaps.size === 0;
            
            selectAllBtn.disabled = allSelected;
            deselectAllBtn.disabled = noneSelected;
            
            selectAllBtn.style.opacity = allSelected ? '0.5' : '1';
            deselectAllBtn.style.opacity = noneSelected ? '0.5' : '1';
        }
    }

    sendMapsUpdateToScanner() {
        if (this.websocket && this.isConnected) {
            this.sendWebSocketMessage('update_maps', {
                maps: [...this.selectedMaps]
            });
            console.log('📤 Отправлено обновление карт в сканер:', [...this.selectedMaps]);
        }
    }

    updateMapCount(mapName, count) {
        const countElement = document.getElementById(`count-${mapName}`);
        if (countElement) {
            const oldCount = parseInt(countElement.textContent) || 0;
            countElement.textContent = count;
            
            // Добавляем анимацию при изменении
            if (count !== oldCount) {
                countElement.classList.add('updated');
                setTimeout(() => {
                    countElement.classList.remove('updated');
                }, 500);
            }
        }
    }

    getSelectedMaps() {
        return [...this.selectedMaps];
    }

    getMapsStats() {
        const total = this.availableMaps.length;
        const selected = this.selectedMaps.size;
        const percentage = Math.round((selected / total) * 100);
        
        return {
            total,
            selected,
            percentage,
            status: selected === 0 ? 'none' : selected === total ? 'all' : 'partial'
        };
    }

    // Функции для работы со статистикой смен карт
    async getMapChangesStats(steamId) {
        if (!this.isConnected) return null;
        
        return new Promise((resolve) => {
            this.sendWebSocketMessage('get_map_changes_stats', { steam_id: steamId });
            
            // Временный обработчик для получения ответа
            const originalHandler = this.handleWebSocketMessage.bind(this);
            this.handleWebSocketMessage = (data) => {
                if (data.type === 'map_changes_stats') {
                    this.handleWebSocketMessage = originalHandler;
                    resolve(data);
                } else {
                    originalHandler(data);
                }
            };
        });
    }

    async getTopChangingServers(limit = 10) {
        if (!this.isConnected) return [];
        
        return new Promise((resolve) => {
            this.sendWebSocketMessage('get_top_changing_servers', { limit });
            
            // Временный обработчик для получения ответа
            const originalHandler = this.handleWebSocketMessage.bind(this);
            this.handleWebSocketMessage = (data) => {
                if (data.type === 'top_changing_servers') {
                    this.handleWebSocketMessage = originalHandler;
                    resolve(data.servers || []);
                } else {
                    originalHandler(data);
                }
            };
        });
    }

    async setAutoSaveThreshold(threshold) {
        if (!this.isConnected) return false;
        
        return new Promise((resolve) => {
            this.sendWebSocketMessage('set_auto_save_threshold', { threshold });
            
            // Временный обработчик для получения ответа
            const originalHandler = this.handleWebSocketMessage.bind(this);
            this.handleWebSocketMessage = (data) => {
                if (data.type === 'auto_save_threshold_updated') {
                    this.handleWebSocketMessage = originalHandler;
                    resolve(data.status === 'success');
                } else {
                    originalHandler(data);
                }
            };
        });
    }

    async getAutoSaveThreshold() {
        if (!this.isConnected) return 3;
        
        return new Promise((resolve) => {
            this.sendWebSocketMessage('get_auto_save_threshold');
            
            // Временный обработчик для получения ответа
            const originalHandler = this.handleWebSocketMessage.bind(this);
            this.handleWebSocketMessage = (data) => {
                if (data.type === 'auto_save_threshold') {
                    this.handleWebSocketMessage = originalHandler;
                    resolve(data.threshold || 3);
                } else {
                    originalHandler(data);
                }
            };
        });
    }

    updateMapsStats() {
        const stats = this.getMapsStats();
        const mapsHeader = document.querySelector('.maps-header h3');
        
        if (mapsHeader) {
            const statsText = ` (${stats.selected}/${stats.total})`;
            const existingStats = mapsHeader.querySelector('.maps-stats');
            
            if (existingStats) {
                existingStats.textContent = statsText;
            } else {
                const statsSpan = document.createElement('span');
                statsSpan.className = 'maps-stats';
                statsSpan.textContent = statsText;
                mapsHeader.appendChild(statsSpan);
            }
        }
    }

    selectPopularMaps() {
        const popularMaps = [
            // Основные карты Premier/Competitive
            'de_dust2', 'de_mirage', 'de_inferno', 'de_nuke', 
            'de_overpass', 'de_ancient', 'de_vertigo', 'de_train',
            
            // Новые карты CS2
            'de_anubis', 'de_grail', 'de_jura',
            
            // Карты для Wingman
            'de_brewery', 'de_dogtown'
        ];
        
        this.selectedMaps = new Set(popularMaps);
        this.renderMapsSelector();
        this.saveMapsSettings();
        this.sendMapsUpdateToScanner();
        
        console.log('🎯 Выбраны популярные карты');
        this.showNotification('Выбраны популярные карты CS2', 'success');
    }
}

// Инициализация приложения
let cs2Tool;

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен, создаем экземпляр CS2Tool...');
    cs2Tool = new CS2Tool();
    console.log('✅ CS2Tool создан');
    
    // Дополнительная привязка событий после создания экземпляра
    if (cs2Tool && cs2Tool.bindEvents) {
        console.log('🔧 Дополнительная привязка событий...');
        cs2Tool.bindEvents();
    }
});

// Обработка ошибок
window.addEventListener('error', (event) => {
    console.error('Ошибка приложения:', event.error);
    if (cs2Tool) {
        cs2Tool.showNotification('Произошла ошибка в приложении', 'error');
    }
});

// Обработка необработанных промисов
window.addEventListener('unhandledrejection', (event) => {
    console.error('Необработанная ошибка промиса:', event.reason);
    if (cs2Tool) {
        cs2Tool.showNotification('Произошла ошибка при загрузке данных', 'error');
    }
}); 