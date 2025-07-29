#!/usr/bin/env python3
"""
CS2 Server Scanner - Упрощенная версия
Использует requests вместо aiohttp для совместимости
"""

import json
import logging
import os
import threading
import time
from datetime import datetime
from urllib.parse import urlencode
import argparse
from concurrent.futures import ThreadPoolExecutor

try:
    import requests
    import websocket
    from websocket import create_connection
    import websockets
except ImportError:
    print("❌ Необходимо установить зависимости:")
    print("pip install requests websocket-client websockets")
    exit(1)

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

class CS2ScannerSimple:
    def __init__(self, max_workers=10):
        self.api_key = None
        self.max_workers = max_workers
        self.server_history = {}
        self.disappeared_servers = {}
        self.game_servers = {}
        self.empty_servers = {}
        self.saved_servers = {}
        self.is_scanning = False
        self.websocket_clients = set()
        self.lock = threading.Lock()
        
        self.admin_password = "admin123"
        self.admin_authenticated = False
        
        # Добавляем флаг для ожидания API ключа
        self.api_key_set_flag = threading.Event()
        
        # Новые переменные для отслеживания смены карт
        self.server_map_changes = {}  # Счетчик смен карт для каждого сервера
        self.server_map_history = {}  # История карт для каждого сервера
        self.auto_save_threshold = 3  # Порог для автоматического сохранения (смен карт)
        self.auto_save_cooldown = {}  # Кулдаун для автосохранения (чтобы не спамить)
        
        self.load_saved_servers()
        self.load_map_changes_data()
        
        self.maps = [
            # Активные карты CS2 (Premier/Competitive)
            'de_ancient', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 
            'de_overpass', 'de_train', 'de_vertigo', 'de_anubis', 'de_grail', 'de_jura',
            
            # Карты для Wingman
            'de_brewery', 'de_dogtown',
            
            # Устаревшие карты (для совместимости)
            'de_cache', 'de_dust', 'de_aztec', 'de_italy', 'de_cobblestone', 'de_office'
        ]
        self.selected_maps = set(self.maps)  # По умолчанию все карты выбраны
        self.scan_interval = 2  # seconds

    def fetch_servers(self, map_name, offset=0):
        """Получение серверов для конкретной карты"""
        if not self.api_key:
            logger.warning(f"⚠️ API ключ не установлен, пропускаем запрос для карты {map_name}")
            return []
        
        # Для демо-ключа возвращаем тестовые данные
        if self.api_key == "DEMO_KEY_FOR_TESTING_ONLY":
            logger.info(f"🎮 Демо-режим: возвращаем тестовые данные для карты {map_name}")
            if map_name == "de_dust2":
                return [
                    {
                        'steamid': 'test_server_1',
                        'name': 'Test Server 1',
                        'addr': '192.168.1.100:27015',
                        'map': 'de_dust2',
                        'players': 10,
                        'max_players': 32,
                        'bots': 2,
                        'version': '1.0.0'
                    }
                ]
            return []
            
        try:
            url = "https://api.steampowered.com/IGameServersService/GetServerList/v1/"
            params = {
                'key': self.api_key,
                'filter': f'appid\\730\\region\\44\\map\\{map_name}',
                'limit': 100,
                'offset': offset
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return data.get('response', {}).get('servers', [])
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Ошибка запроса для карты {map_name}: {e}")
            return []
        except json.JSONDecodeError as e:
            logger.error(f"❌ Ошибка JSON для карты {map_name}: {e}")
            return []

    def scan_map_with_offsets(self, map_name, max_offset=0):
        """Сканирование карты с оффсетами"""
        all_servers = []
        
        for offset in range(0, max_offset + 1, 100):
            servers = self.fetch_servers(map_name, offset)
            if not servers:
                break
            all_servers.extend(servers)
            time.sleep(0.1)  # Небольшая задержка между запросами
        
        logger.info(f"🗺️ Карта {map_name}: найдено {len(all_servers)} серверов")
        return all_servers

    def scan_all_maps(self):
        """Сканирование всех карт"""
        all_servers = []
        
        # Создаем пул потоков
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Запускаем сканирование только выбранных карт в отдельном потоке
            future_to_map = {
                executor.submit(self.scan_map_with_offsets, map_name, 0): map_name 
                for map_name in self.selected_maps
            }
            
            for future in future_to_map:
                try:
                    servers = future.result()
                    all_servers.extend(servers)
                except Exception as e:
                    map_name = future_to_map[future]
                    logger.error(f"❌ Ошибка сканирования карты {map_name}: {e}")
        
        logger.info(f"📊 Всего найдено серверов: {len(all_servers)}")
        return all_servers

    def scan_graphics_settings(self):
        """Сканирование graphics_settings"""
        servers = self.scan_map_with_offsets('graphics_settings', 1000)
        return servers

    def process_servers(self, current_servers):
        """Обработка найденных серверов"""
        current_ids = {server['steamid'] for server in current_servers if server.get('steamid')}
        
        # Обновляем историю серверов и добавляем информацию о режиме
        for server in current_servers:
            steam_id = server.get('steamid')
            if steam_id:
                # Добавляем информацию о режиме сервера
                addr = server.get('addr', '')
                if addr:
                    ip_port = addr.split(':')
                    if len(ip_port) == 2:
                        ip, port = ip_port[0], ip_port[1]
                        server['mode'] = self.get_server_mode(ip, port)
                    else:
                        server['mode'] = 'unknown'
                else:
                    server['mode'] = 'unknown'
                
                # Отслеживаем смену карт
                if steam_id in self.server_history:
                    old_map = self.server_history[steam_id].get('map', 'unknown')
                    new_map = server.get('map', 'unknown')
                    server_name = server.get('name', steam_id)
                    
                    if old_map != new_map:
                        self.track_map_change(steam_id, server_name, old_map, new_map)
                
                self.server_history[steam_id] = server
        
        # Проверяем исчезнувшие серверы
        disappeared_count = 0
        for steam_id, old_server in self.server_history.items():
            if steam_id not in current_ids and steam_id not in self.disappeared_servers:
                # Сервер исчез - добавляем в список исчезнувших
                disappeared_server = {
                    **old_server,
                    'map': 'graphics_settings',
                    'players': 0,
                    'max_players': 0,
                    'bots': 0,
                    'version': 'Unknown',
                    'disappeared_at': datetime.now().isoformat()
                }
                
                with self.lock:
                    self.disappeared_servers[steam_id] = disappeared_server
                
                disappeared_count += 1
                logger.info(f"🔴 Сервер {old_server.get('name', steam_id)} исчез с карты {old_server.get('map')}")
        
        # Дополнительная диагностика
        logger.info(f"🔍 Диагностика исчезнувших серверов:")
        logger.info(f"   - Всего в истории: {len(self.server_history)}")
        logger.info(f"   - Текущих серверов: {len(current_ids)}")
        logger.info(f"   - Уже в исчезнувших: {len(self.disappeared_servers)}")
        logger.info(f"   - Новых исчезнувших: {disappeared_count}")
        
        # Проверяем вернувшиеся серверы
        returned_count = 0
        disappeared_to_remove = []
        for steam_id in list(self.disappeared_servers.keys()):
            if steam_id in current_ids:
                # Сервер вернулся - удаляем из исчезнувших
                disappeared_to_remove.append(steam_id)
                returned_count += 1
                server_name = self.disappeared_servers[steam_id].get('name', steam_id)
                logger.info(f"🟢 Сервер {server_name} вернулся на карту {self.server_history[steam_id].get('map', 'Unknown')}")
        
        # Удаляем вернувшиеся серверы
        with self.lock:
            for steam_id in disappeared_to_remove:
                server_name = self.disappeared_servers[steam_id].get('name', steam_id)
                del self.disappeared_servers[steam_id]
                logger.info(f"✅ Сервер {server_name} удален из списка исчезнувших")
        
        # Обновляем игровые серверы
        with self.lock:
            self.game_servers.clear()
            for server in current_servers:
                steam_id = server.get('steamid')
                if steam_id and server.get('map') != 'graphics_settings':
                    self.game_servers[steam_id] = server
        
        if disappeared_count > 0:
            logger.info(f"📊 Найдено {disappeared_count} исчезнувших серверов")
        if returned_count > 0:
            logger.info(f"📊 Найдено {returned_count} вернувшихся серверов")
        
        # Дополнительная диагностика
        logger.info(f"📊 Статистика: отслеживается {len(self.server_history)}, исчезнувших {len(self.disappeared_servers)}, текущих {len(current_servers)}")
        
        return {
            'disappeared_count': disappeared_count,
            'returned_count': returned_count,
            'total_current': len(current_servers),
            'total_tracked': len(self.server_history)
        }

    async def handle_websocket(self, websocket):
        """Обработка WebSocket соединений"""
        try:
            # Добавляем соединение в список клиентов
            self.websocket_clients.add(websocket)
            logger.info("🔌 Новое WebSocket соединение установлено")
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    logger.info(f"📨 Получено сообщение типа: {data.get('type')}")
                    logger.info(f"📨 Полные данные: {data}")
                    
                    if data.get('type') == 'set_api_key':
                        api_key = data.get('api_key')
                        logger.info(f"🔑 Получен запрос на установку API ключа: {api_key[:10] if api_key else 'None'}...")
                        if api_key:
                            self.api_key = api_key
                            logger.info("🔑 API ключ установлен")
                            # Устанавливаем флаг, что API ключ получен
                            self.api_key_set_flag.set()
                            response = {
                                'type': 'api_key_set',
                                'status': 'success'
                            }
                            await websocket.send(json.dumps(response))
                            logger.info("📤 Отправлен ответ об успешной установке API ключа")
                        else:
                            response = {
                                'type': 'api_key_set',
                                'status': 'error',
                                'message': 'API ключ не предоставлен'
                            }
                            await websocket.send(json.dumps(response))
                            logger.info("📤 Отправлен ответ об ошибке установки API ключа")
                    
                    elif data.get('type') == 'get_initial_state':
                        with self.lock:
                            await websocket.send(json.dumps({
                                'type': 'initial_state',
                                'disappeared_servers': list(self.disappeared_servers.values()),
                                'game_servers': list(self.game_servers.values()),
                                'stats': {
                                    'total_tracked': len(self.server_history),
                                    'total_disappeared': len(self.disappeared_servers),
                                    'total_game': len(self.game_servers)
                                }
                            }))
                    
                    elif data.get('type') == 'scan_graphics_settings':
                        servers = self.scan_graphics_settings()
                        with self.lock:
                            self.empty_servers = {server['steamid']: server for server in servers}
                        await websocket.send(json.dumps({
                            'type': 'empty_servers_update',
                            'empty_servers': list(self.empty_servers.values())
                        }))
                    
                    elif data.get('type') == 'get_game_servers':
                        with self.lock:
                            await websocket.send(json.dumps({
                                'type': 'game_servers_update',
                                'game_servers': list(self.game_servers.values())
                            }))
                    
                    elif data.get('type') == 'start_scan':
                        logger.info("🚀 Запуск сканирования по запросу от веб-интерфейса")
                        # Запускаем сканирование в отдельном потоке
                        import threading
                        scan_thread = threading.Thread(target=self.run_single_scan)
                        scan_thread.daemon = True
                        scan_thread.start()
                        
                        await websocket.send(json.dumps({
                            'type': 'scan_started',
                            'status': 'success'
                        }))
                    
                    elif data.get('type') == 'force_update':
                        logger.info("📤 Принудительная отправка данных по запросу")
                        with self.lock:
                            await websocket.send(json.dumps({
                                'type': 'scan_complete',
                                'stats': {
                                    'disappeared_count': len(self.disappeared_servers),
                                    'returned_count': 0,
                                    'total_current': len(self.game_servers),
                                    'total_tracked': len(self.server_history)
                                },
                                'disappeared_servers': list(self.disappeared_servers.values()),
                                'game_servers': list(self.game_servers.values())
                            }))
                        logger.info(f"📤 Принудительно отправлено: {len(self.disappeared_servers)} исчезнувших серверов")
                    
                    elif data.get('type') == 'update_maps':
                        maps = data.get('maps', [])
                        logger.info(f"🗺️ Обновление списка карт для сканирования: {maps}")
                        self.selected_maps = set(maps)
                        response = {
                            'type': 'maps_updated',
                            'status': 'success',
                            'maps': list(self.selected_maps)
                        }
                        await websocket.send(json.dumps(response))
                        logger.info(f"✅ Список карт обновлен: {len(self.selected_maps)} карт")
                    
                    elif data.get('type') == 'authenticate_admin':
                        password = data.get('password')
                        if self.authenticate_admin(password):
                            await websocket.send(json.dumps({
                                'type': 'admin_authenticated',
                                'status': 'success'
                            }))
                        else:
                            await websocket.send(json.dumps({
                                'type': 'admin_authenticated',
                                'status': 'error',
                                'message': 'Неверный пароль администратора'
                            }))
                    
                    elif data.get('type') == 'get_saved_servers':
                        # Обогащаем данные сохраненных серверов информацией о сменах карт и режиме
                        enriched_servers = []
                        logger.info(f"📦 Обработка {len(self.saved_servers)} сохраненных серверов")
                        logger.info(f"📊 Доступно {len(self.server_map_changes)} записей о сменах карт")
                        
                        for server in self.saved_servers.values():
                            # Ищем steam_id для этого сервера в истории
                            steam_id = None
                            server_addr = f"{server['ip']}:{server['port']}"
                            server_name = server['name']
                            
                            # Ищем по адресу в истории серверов
                            for sid, srv in self.server_history.items():
                                if srv.get('addr') == server_addr:
                                    steam_id = sid
                                    break
                            
                            # Если не нашли по адресу, ищем по имени сервера в map_changes
                            if not steam_id:
                                for sid, map_data in self.server_map_changes.items():
                                    map_server_name = map_data.get('server_name', '')
                                    if map_server_name and server_name in map_server_name:
                                        steam_id = sid
                                        break
                            
                            enriched_server = server.copy()
                            
                            # Добавляем информацию о сменах карт
                            if steam_id and steam_id in self.server_map_changes:
                                map_stats = self.server_map_changes[steam_id]
                                enriched_server['map_changes_count'] = map_stats['changes_count']
                                enriched_server['last_map_change'] = map_stats.get('last_change', 'unknown')
                            else:
                                enriched_server['map_changes_count'] = 0
                                enriched_server['last_map_change'] = 'unknown'
                            
                            # Определяем режим на основе карт
                            if steam_id:
                                determined_mode = self.determine_server_mode_from_maps(steam_id)
                                if determined_mode != 'unknown':
                                    enriched_server['mode'] = determined_mode
                                logger.info(f"🔍 Сервер {server['name']} ({server_addr}): steam_id={steam_id}, режим={determined_mode}, смен карт={enriched_server.get('map_changes_count', 0)}")
                            else:
                                logger.warning(f"⚠️ Не найден steam_id для сервера {server['name']} ({server_addr})")
                            
                            enriched_servers.append(enriched_server)
                        
                        await websocket.send(json.dumps({
                            'type': 'saved_servers_update',
                            'saved_servers': enriched_servers
                        }))
                    
                    elif data.get('type') == 'add_saved_server':
                        ip = data.get('ip')
                        port = data.get('port')
                        name = data.get('name')
                        mode = data.get('mode')
                        description = data.get('description', '')
                        if ip and port and name and mode:
                            self.add_saved_server(ip, port, name, mode, description)
                            await websocket.send(json.dumps({
                                'type': 'add_saved_server',
                                'status': 'success',
                                'message': f'Сервер {name} ({ip}:{port}) добавлен'
                            }))
                        else:
                            await websocket.send(json.dumps({
                                'type': 'add_saved_server',
                                'status': 'error',
                                'message': 'Не все данные для добавления сервера предоставлены'
                            }))
                    
                    elif data.get('type') == 'update_saved_server':
                        ip = data.get('ip')
                        port = data.get('port')
                        name = data.get('name')
                        mode = data.get('mode')
                        description = data.get('description', '')
                        if ip and port and name and mode:
                            if self.update_saved_server(ip, port, name, mode, description):
                                await websocket.send(json.dumps({
                                    'type': 'update_saved_server',
                                    'status': 'success',
                                    'message': f'Сервер {name} ({ip}:{port}) обновлен'
                                }))
                            else:
                                await websocket.send(json.dumps({
                                    'type': 'update_saved_server',
                                    'status': 'error',
                                    'message': f'Сервер ({ip}:{port}) не найден'
                                }))
                        else:
                            await websocket.send(json.dumps({
                                'type': 'update_saved_server',
                                'status': 'error',
                                'message': 'Не все данные для обновления сервера предоставлены'
                            }))
                    
                    elif data.get('type') == 'delete_saved_server':
                        ip = data.get('ip')
                        port = data.get('port')
                        if ip and port:
                            if self.delete_saved_server(ip, port):
                                await websocket.send(json.dumps({
                                    'type': 'delete_saved_server',
                                    'status': 'success',
                                    'message': f'Сервер ({ip}:{port}) удален'
                                }))
                            else:
                                await websocket.send(json.dumps({
                                    'type': 'delete_saved_server',
                                    'status': 'error',
                                    'message': f'Сервер ({ip}:{port}) не найден'
                                }))
                        else:
                            await websocket.send(json.dumps({
                                'type': 'delete_saved_server',
                                'status': 'error',
                                'message': 'Не все данные для удаления сервера предоставлены'
                            }))
                    
                    elif data.get('type') == 'get_map_changes_stats':
                        # Получение статистики смен карт
                        steam_id = data.get('steam_id')
                        if steam_id:
                            stats = self.get_server_map_stats(steam_id)
                            if stats:
                                await websocket.send(json.dumps({
                                    'type': 'map_changes_stats',
                                    'status': 'success',
                                    'stats': stats
                                }))
                            else:
                                await websocket.send(json.dumps({
                                    'type': 'map_changes_stats',
                                    'status': 'error',
                                    'message': 'Статистика для сервера не найдена'
                                }))
                        else:
                            await websocket.send(json.dumps({
                                'type': 'map_changes_stats',
                                'status': 'error',
                                'message': 'steam_id не предоставлен'
                            }))
                    
                    elif data.get('type') == 'get_top_changing_servers':
                        # Получение топ серверов по смене карт
                        limit = data.get('limit', 10)
                        top_servers = self.get_top_changing_servers(limit)
                        await websocket.send(json.dumps({
                            'type': 'top_changing_servers',
                            'status': 'success',
                            'servers': top_servers
                        }))
                    
                    elif data.get('type') == 'set_auto_save_threshold':
                        # Установка порога для автосохранения
                        threshold = data.get('threshold')
                        if threshold is not None and isinstance(threshold, int) and threshold > 0:
                            self.auto_save_threshold = threshold
                            await websocket.send(json.dumps({
                                'type': 'auto_save_threshold_updated',
                                'status': 'success',
                                'threshold': self.auto_save_threshold
                            }))
                            logger.info(f"⚙️ Порог автосохранения установлен: {threshold} смен карт")
                        else:
                            await websocket.send(json.dumps({
                                'type': 'auto_save_threshold_updated',
                                'status': 'error',
                                'message': 'Неверное значение порога'
                            }))
                    
                    elif data.get('type') == 'get_auto_save_threshold':
                        # Получение текущего порога автосохранения
                        await websocket.send(json.dumps({
                            'type': 'auto_save_threshold',
                            'status': 'success',
                            'threshold': self.auto_save_threshold
                        }))
                    
                    elif data.get('type') == 'force_cleanup':
                        # Принудительная очистка списка исчезнувших серверов
                        removed_count = self.force_cleanup_disappeared_servers()
                        await websocket.send(json.dumps({
                            'type': 'force_cleanup',
                            'status': 'success',
                            'message': f'Очищено {removed_count} серверов из списка исчезнувших'
                        }))
                        
                        # Отправляем обновленное состояние
                        await websocket.send(json.dumps({
                            'type': 'scan_complete',
                            'stats': {
                                'disappeared_count': 0,
                                'returned_count': removed_count,
                                'total_current': len(self.game_servers),
                                'total_tracked': len(self.server_history)
                            },
                            'disappeared_servers': [],
                            'game_servers': list(self.game_servers.values())
                        }))
                
                except Exception as e:
                    logger.error(f"❌ Ошибка обработки сообщения: {e}")
                
        except websockets.exceptions.InvalidMessage as e:
            logger.warning(f"⚠️ Неверный HTTP запрос к WebSocket: {e}")
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"🔌 WebSocket соединение закрыто клиентом: {e}")
        except Exception as e:
            logger.error(f"❌ Ошибка в WebSocket обработчике: {e}")
        finally:
            self.websocket_clients.discard(websocket)
            logger.info("🔌 WebSocket соединение удалено из списка клиентов")

    async def broadcast_update(self, data):
        """Отправка обновлений всем подключенным клиентам"""
        if not self.websocket_clients:
            return
        
        message = json.dumps(data)
        disconnected = set()
        
        for websocket in self.websocket_clients:
            try:
                await websocket.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(websocket)
            except Exception as e:
                logger.error(f"❌ Ошибка отправки WebSocket: {e}")
                disconnected.add(websocket)
        
        # Удаляем отключенные соединения
        self.websocket_clients -= disconnected

    def broadcast_update_sync(self, data):
        """Синхронная версия отправки обновлений"""
        if not self.websocket_clients:
            return
        
        message = json.dumps(data)
        disconnected = set()
        
        for websocket in self.websocket_clients:
            try:
                # Используем asyncio.run для выполнения асинхронной операции
                asyncio.run(websocket.send(message))
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(websocket)
            except Exception as e:
                logger.error(f"❌ Ошибка отправки WebSocket: {e}")
                disconnected.add(websocket)
        
        # Удаляем отключенные соединения
        self.websocket_clients -= disconnected

    def continuous_scan(self):
        """Непрерывное сканирование"""
        self.is_scanning = True
        first_scan = True
        
        # Ждем установки API ключа перед началом сканирования
        logger.info("⏳ Ожидание API ключа от веб-интерфейса...")
        logger.info("💡 Если API ключ не приходит, сканирование начнется автоматически через 30 секунд")
        
        # Ждем API ключ максимум 30 секунд
        api_key_received = False
        for i in range(30):  # 30 секунд
            if self.api_key_set_flag.is_set():
                api_key_received = True
                break
            time.sleep(1)
        
        if api_key_received:
            logger.info("✅ API ключ получен, начинаем сканирование...")
        else:
            logger.warning("⚠️ API ключ не получен за 30 секунд, начинаем сканирование без него")
        
        while self.is_scanning:
            try:
                if first_scan:
                    logger.info("🔍 Первое сканирование - собираем данные...")
                    current_servers = self.scan_all_maps()
                    first_scan = False
                else:
                    current_servers = self.scan_all_maps()
                    stats = self.process_servers(current_servers)
                    
                    # Дополнительная проверка возвращения серверов
                    current_ids = {server['steamid'] for server in current_servers if server.get('steamid')}
                    still_disappeared = []
                    
                    for steam_id in list(self.disappeared_servers.keys()):
                        if steam_id not in current_ids:
                            still_disappeared.append(steam_id)
                        else:
                            logger.warning(f"⚠️ Сервер {self.disappeared_servers[steam_id].get('name', steam_id)} все еще в списке исчезнувших, но найден в текущем сканировании!")
                    
                    logger.info(f"📊 После обработки: исчезнувших {len(still_disappeared)} из {len(self.disappeared_servers)}")
                    
                    # Отправляем обновления в браузер
                    try:
                        self.broadcast_update_sync({
                            'type': 'scan_complete',
                            'stats': stats,
                            'disappeared_servers': list(self.disappeared_servers.values()),
                            'game_servers': list(self.game_servers.values())
                        })
                        logger.info(f"📤 Отправлено обновление в браузер: {len(self.disappeared_servers)} исчезнувших серверов")
                    except Exception as e:
                        logger.error(f"❌ Ошибка отправки в браузер: {e}")
                
                time.sleep(self.scan_interval)
                
                # Принудительная отправка данных каждые 10 секунд
                if hasattr(self, '_last_force_send'):
                    if time.time() - self._last_force_send > 10:
                        self._last_force_send = time.time()
                        try:
                            self.broadcast_update_sync({
                                'type': 'scan_complete',
                                'stats': {
                                    'disappeared_count': len(self.disappeared_servers),
                                    'returned_count': 0,
                                    'total_current': len(self.game_servers),
                                    'total_tracked': len(self.server_history)
                                },
                                'disappeared_servers': list(self.disappeared_servers.values()),
                                'game_servers': list(self.game_servers.values())
                            })
                            logger.info(f"📤 Принудительная отправка: {len(self.disappeared_servers)} исчезнувших серверов")
                        except Exception as e:
                            logger.error(f"❌ Ошибка принудительной отправки: {e}")
                else:
                    self._last_force_send = time.time()
                
            except Exception as e:
                logger.error(f"❌ Ошибка в непрерывном сканировании: {e}")
                time.sleep(5)  # Пауза при ошибке

    def load_saved_servers(self):
        """Загрузка сохраненных серверов из файла"""
        if os.path.exists('saved_servers.json'):
            try:
                with open('saved_servers.json', 'r') as f:
                    self.saved_servers = json.load(f)
                logger.info(f"📦 Загружено {len(self.saved_servers)} сохраненных серверов")
            except json.JSONDecodeError:
                logger.warning("❌ Ошибка декодирования JSON для сохраненных серверов")
                self.saved_servers = {}
        else:
            logger.info("📦 Не найден файл saved_servers.json, создание нового...")
            self.saved_servers = {}

    def save_servers(self):
        """Сохранение сохраненных серверов в файл"""
        try:
            with open('saved_servers.json', 'w') as f:
                json.dump(self.saved_servers, f, indent=4)
            logger.info(f"📦 Сохранено {len(self.saved_servers)} сохраненных серверов")
        except Exception as e:
            logger.error(f"❌ Ошибка сохранения сохраненных серверов: {e}")

    def load_map_changes_data(self):
        """Загрузка данных о смене карт серверов"""
        if os.path.exists('map_changes_data.json'):
            try:
                with open('map_changes_data.json', 'r') as f:
                    data = json.load(f)
                    self.server_map_changes = data.get('changes', {})
                    self.server_map_history = data.get('history', {})
                logger.info(f"📊 Загружены данные о смене карт для {len(self.server_map_changes)} серверов")
            except json.JSONDecodeError:
                logger.warning("❌ Ошибка декодирования JSON для данных о смене карт")
                self.server_map_changes = {}
                self.server_map_history = {}
        else:
            logger.info("📊 Не найден файл map_changes_data.json, создание нового...")
            self.server_map_changes = {}
            self.server_map_history = {}

    def save_map_changes_data(self):
        """Сохранение данных о смене карт серверов"""
        try:
            data = {
                'changes': self.server_map_changes,
                'history': self.server_map_history
            }
            with open('map_changes_data.json', 'w') as f:
                json.dump(data, f, indent=4)
            logger.info(f"📊 Сохранены данные о смене карт для {len(self.server_map_changes)} серверов")
        except Exception as e:
            logger.error(f"❌ Ошибка сохранения данных о смене карт: {e}")

    def track_map_change(self, steam_id, server_name, old_map, new_map):
        """Отслеживание смены карты сервера"""
        if old_map == new_map:
            return
        
        # Инициализируем данные для сервера
        if steam_id not in self.server_map_changes:
            self.server_map_changes[steam_id] = {
                'changes_count': 0,
                'last_change': None,
                'server_name': server_name,
                'changes_history': []
            }
        
        if steam_id not in self.server_map_history:
            self.server_map_history[steam_id] = []
        
        # Увеличиваем счетчик смен
        self.server_map_changes[steam_id]['changes_count'] += 1
        self.server_map_changes[steam_id]['last_change'] = datetime.now().isoformat()
        self.server_map_changes[steam_id]['server_name'] = server_name
        
        # Добавляем в историю
        change_record = {
            'from': old_map,
            'to': new_map,
            'timestamp': datetime.now().isoformat()
        }
        self.server_map_changes[steam_id]['changes_history'].append(change_record)
        
        # Ограничиваем историю последними 10 изменениями
        if len(self.server_map_changes[steam_id]['changes_history']) > 10:
            self.server_map_changes[steam_id]['changes_history'] = self.server_map_changes[steam_id]['changes_history'][-10:]
        
        # Добавляем в общую историю карт
        self.server_map_history[steam_id].append(new_map)
        if len(self.server_map_history[steam_id]) > 20:  # Ограничиваем историю
            self.server_map_history[steam_id] = self.server_map_history[steam_id][-20:]
        
        logger.info(f"🔄 Сервер {server_name} сменил карту: {old_map} → {new_map} (всего смен: {self.server_map_changes[steam_id]['changes_count']})")
        
        # Проверяем, нужно ли автоматически сохранить сервер
        self.check_auto_save_server(steam_id, server_name)
        
        # Сохраняем данные
        self.save_map_changes_data()

    def check_auto_save_server(self, steam_id, server_name):
        """Проверка необходимости автоматического сохранения сервера"""
        if steam_id not in self.server_map_changes:
            return
        
        changes_count = self.server_map_changes[steam_id]['changes_count']
        current_time = time.time()
        
        # Проверяем кулдаун (не спамить автосохранением)
        if steam_id in self.auto_save_cooldown:
            if current_time - self.auto_save_cooldown[steam_id] < 3600:  # 1 час кулдауна
                return
        
        # Если сервер сменил карту достаточно раз, сохраняем его
        if changes_count >= self.auto_save_threshold:
            # Получаем информацию о сервере из истории
            if steam_id in self.server_history:
                server_info = self.server_history[steam_id]
                addr = server_info.get('addr', '')
                
                if addr and ':' in addr:
                    ip, port = addr.split(':', 1)
                    
                    # Проверяем, не сохранен ли уже сервер
                    server_key = f"{ip}:{port}"
                    if server_key not in self.saved_servers:
                        # Автоматически сохраняем сервер
                        mode = self.get_server_mode(ip, port)
                        description = f"Автосохранен после {changes_count} смен карт"
                        
                        self.add_saved_server(ip, port, server_name, mode, description)
                        logger.info(f"💾 Автоматически сохранен сервер {server_name} после {changes_count} смен карт")
                        
                        # Устанавливаем кулдаун
                        self.auto_save_cooldown[steam_id] = current_time
                    else:
                        logger.info(f"ℹ️ Сервер {server_name} уже сохранен, пропускаем автосохранение")

    def get_server_map_stats(self, steam_id):
        """Получение статистики смен карт для сервера"""
        if steam_id in self.server_map_changes:
            return self.server_map_changes[steam_id]
        return None

    def get_top_changing_servers(self, limit=10):
        """Получение топ серверов по количеству смен карт"""
        sorted_servers = sorted(
            self.server_map_changes.items(),
            key=lambda x: x[1]['changes_count'],
            reverse=True
        )
        return sorted_servers[:limit]

    def get_server_mode(self, ip, port):
        """Получение режима сервера по IP и порту"""
        server_key = f"{ip}:{port}"
        if server_key in self.saved_servers:
            return self.saved_servers[server_key].get('mode', 'unknown')
        return 'unknown'
    
    def determine_server_mode_from_maps(self, steam_id):
        """Определение режима сервера на основе карт, которые он посещал"""
        if steam_id not in self.server_map_history:
            return 'unknown'
        
        maps_visited = set(self.server_map_history[steam_id])
        
        # Определяем режим на основе карт
        premier_maps = {'de_ancient', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 
                       'de_overpass', 'de_train', 'de_vertigo', 'de_anubis', 'de_grail', 'de_jura'}
        wingman_maps = {'de_brewery', 'de_dogtown'}
        legacy_maps = {'de_cache', 'de_dust', 'de_aztec', 'de_italy', 'de_cobblestone', 'de_office'}
        
        # Если сервер посещал только Wingman карты
        if maps_visited.issubset(wingman_maps) and len(maps_visited) > 0:
            return 'Wingman'
        
        # Если сервер посещал Premier карты
        if maps_visited.intersection(premier_maps):
            if maps_visited.intersection(wingman_maps):
                return 'Mixed (Premier + Wingman)'
            else:
                return 'Premier/Competitive'
        
        # Если сервер посещал только Legacy карты
        if maps_visited.issubset(legacy_maps) and len(maps_visited) > 0:
            return 'Legacy'
        
        # Если смешанные карты
        if len(maps_visited) > 0:
            return 'Mixed'
        
        return 'unknown'

    def add_saved_server(self, ip, port, name, mode, description=""):
        """Добавление сохраненного сервера"""
        server_key = f"{ip}:{port}"
        self.saved_servers[server_key] = {
            'ip': ip,
            'port': port,
            'name': name,
            'mode': mode,
            'description': description,
            'added_at': datetime.now().isoformat()
        }
        self.save_servers()
        logger.info(f"📦 Добавлен сохраненный сервер: {name} ({ip}:{port})")

    def update_saved_server(self, ip, port, name, mode, description=""):
        """Обновление сохраненного сервера"""
        server_key = f"{ip}:{port}"
        if server_key in self.saved_servers:
            self.saved_servers[server_key].update({
                'name': name,
                'mode': mode,
                'description': description,
                'updated_at': datetime.now().isoformat()
            })
            self.save_servers()
            logger.info(f"📦 Обновлен сохраненный сервер: {name} ({ip}:{port})")
            return True
        return False

    def delete_saved_server(self, ip, port):
        """Удаление сохраненного сервера"""
        server_key = f"{ip}:{port}"
        if server_key in self.saved_servers:
            server_name = self.saved_servers[server_key]['name']
            del self.saved_servers[server_key]
            self.save_servers()
            logger.info(f"📦 Удален сохраненный сервер: {server_name} ({ip}:{port})")
            return True
        return False

    def authenticate_admin(self, password):
        """Аутентификация администратора"""
        if password == self.admin_password:
            self.admin_authenticated = True
            logger.info("🔐 Администратор аутентифицирован")
            return True
        else:
            logger.warning("❌ Неверный пароль администратора")
            return False

    def force_cleanup_disappeared_servers(self):
        """Принудительная очистка списка исчезнувших серверов"""
        with self.lock:
            old_count = len(self.disappeared_servers)
            self.disappeared_servers.clear()
            logger.info(f"🧹 Принудительная очистка: удалено {old_count} серверов из списка исчезнувших")
            return old_count

    def start_scanning(self):
        """Запуск сканирования в отдельном потоке"""
        scan_thread = threading.Thread(target=self.continuous_scan, daemon=True)
        scan_thread.start()
        logger.info("🚀 Сканирование запущено в фоновом режиме")

    def stop_scanning(self):
        """Остановка сканирования"""
        self.is_scanning = False
        logger.info("🛑 Сканирование остановлено")
    
    def run_single_scan(self):
        """Выполнение одного сканирования"""
        try:
            logger.info("🔍 Выполнение сканирования...")
            current_servers = self.scan_all_maps()
            stats = self.process_servers(current_servers)
            
            # Отправляем результаты через WebSocket
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                loop.create_task(self.broadcast_update({
                    'type': 'scan_complete',
                    'stats': stats,
                    'disappeared_servers': list(self.disappeared_servers.values()),
                    'game_servers': list(self.game_servers.values())
                }))
                logger.info("📤 Результаты сканирования отправлены в веб-интерфейс")
            except (RuntimeError, Exception) as e:
                logger.error(f"❌ Ошибка отправки результатов: {e}")
        except Exception as e:
            logger.error(f"❌ Ошибка выполнения сканирования: {e}")

async def main():
    parser = argparse.ArgumentParser(description='CS2 Server Scanner - Упрощенная версия')
    parser.add_argument('--port', type=int, default=8765, help='Порт WebSocket сервера')
    parser.add_argument('--workers', type=int, default=10, help='Количество рабочих потоков')
    args = parser.parse_args()

    print("=" * 50)
    print("   CS2 Нативный Сканер Серверов (Упрощенная версия)")
    print("=" * 50)
    print()

    # Проверяем зависимости
    try:
        import requests
        import websocket
        import websockets
        print("✅ Зависимости установлены")
    except ImportError as e:
        print(f"❌ Отсутствуют зависимости: {e}")
        print("Установите: pip install requests websocket-client websockets")
        return

    # Создаем сканер
    scanner = CS2ScannerSimple(max_workers=args.workers)
    
    print("🚀 Запуск упрощенного сканера...")
    print(f"📡 WebSocket сервер на порту {args.port}")
    print("⏹️  Нажмите Ctrl+C для остановки")
    print()

    try:
        # Запускаем WebSocket сервер с обработкой ошибок
        async with websockets.serve(scanner.handle_websocket, "0.0.0.0", args.port, ping_interval=None, ping_timeout=None):
            logger.info(f"🔌 WebSocket сервер запущен на порту {args.port}")
            
            # Запускаем сканирование
            scanner.start_scanning()
            
            # Держим программу запущенной
            await asyncio.Future()  # Бесконечное ожидание
            
    except KeyboardInterrupt:
        print("\n🛑 Остановка сканера...")
        scanner.stop_scanning()
    except Exception as e:
        logger.error(f"❌ Критическая ошибка сервера: {e}")
        scanner.stop_scanning()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main()) 