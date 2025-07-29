#!/usr/bin/env python3
"""
API Server для CS2 Tool
HTTP API вместо WebSocket для совместимости с бесплатными платформами
"""
import os
import sys
import json
import time
import threading
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests
from scanner_simple import CS2ScannerSimple

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class CS2APIHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, scanner=None, **kwargs):
        self.scanner = scanner
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        """Обработка GET запросов"""
        try:
            parsed_url = urlparse(self.path)
            path = parsed_url.path
            query_params = parse_qs(parsed_url.query)
            
            # CORS заголовки
            self.send_cors_headers()
            
            if path == '/api/status':
                self.handle_status()
            elif path == '/api/servers':
                self.handle_get_servers(query_params)
            elif path == '/api/saved-servers':
                self.handle_get_saved_servers()
            elif path == '/api/scan':
                self.handle_scan(query_params)
            elif path == '/api/maps':
                self.handle_get_maps()
            elif path.startswith('/api/static/'):
                self.handle_static_files(path)
            else:
                self.handle_static_files(path)
                
        except Exception as e:
            logger.error(f"❌ Ошибка обработки запроса: {e}")
            self.send_error_response(f"Ошибка сервера: {str(e)}")
    
    def do_POST(self):
        """Обработка POST запросов"""
        try:
            parsed_url = urlparse(self.path)
            path = parsed_url.path
            
            # CORS заголовки
            self.send_cors_headers()
            
            if path == '/api/update-settings':
                self.handle_update_settings()
            elif path == '/api/clear-cache':
                self.handle_clear_cache()
            else:
                self.send_error_response("Неизвестный endpoint", 404)
                
        except Exception as e:
            logger.error(f"❌ Ошибка обработки POST запроса: {e}")
            self.send_error_response(f"Ошибка сервера: {str(e)}")
    
    def do_OPTIONS(self):
        """Обработка CORS preflight запросов"""
        self.send_cors_headers()
        self.send_response(200)
        self.end_headers()
    
    def send_cors_headers(self):
        """Отправка CORS заголовков"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
    
    def handle_status(self):
        """Статус API сервера"""
        status = {
            'status': 'online',
            'timestamp': time.time(),
            'scanner_running': self.scanner.is_running if self.scanner else False,
            'servers_count': len(self.scanner.servers) if self.scanner else 0,
            'saved_servers_count': len(self.scanner.saved_servers) if self.scanner else 0
        }
        self.send_json_response(status)
    
    def handle_get_servers(self, query_params):
        """Получение списка серверов"""
        try:
            server_type = query_params.get('type', ['all'])[0]
            
            if server_type == 'all':
                servers = list(self.scanner.servers.values())
            elif server_type == 'game':
                servers = [s for s in self.scanner.servers.values() if s.get('status') == 'game']
            elif server_type == 'empty':
                servers = [s for s in self.scanner.servers.values() if s.get('status') == 'empty']
            elif server_type == 'disappeared':
                servers = [s for s in self.scanner.servers.values() if s.get('status') == 'disappeared']
            else:
                servers = list(self.scanner.servers.values())
            
            # Сортировка по времени (новые сверху)
            servers.sort(key=lambda x: x.get('last_seen', 0), reverse=True)
            
            self.send_json_response({
                'servers': servers,
                'count': len(servers),
                'type': server_type
            })
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения серверов: {e}")
            self.send_error_response(f"Ошибка получения серверов: {str(e)}")
    
    def handle_get_saved_servers(self):
        """Получение сохраненных серверов"""
        try:
            saved_servers = []
            for server_id, server_data in self.scanner.saved_servers.items():
                # Определяем режим сервера по картам
                mode = self.scanner.determine_server_mode_from_maps(server_data.get('map_history', []))
                server_data['mode'] = mode
                saved_servers.append(server_data)
            
            # Сортировка по количеству смен карт (больше сверху)
            saved_servers.sort(key=lambda x: x.get('map_changes', 0), reverse=True)
            
            self.send_json_response({
                'saved_servers': saved_servers,
                'count': len(saved_servers)
            })
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения сохраненных серверов: {e}")
            self.send_error_response(f"Ошибка получения сохраненных серверов: {str(e)}")
    
    def handle_scan(self, query_params):
        """Запуск сканирования"""
        try:
            if not self.scanner.is_running:
                self.scanner.start_scanning()
                message = "Сканирование запущено"
            else:
                message = "Сканирование уже запущено"
            
            self.send_json_response({
                'status': 'success',
                'message': message,
                'scanner_running': self.scanner.is_running
            })
            
        except Exception as e:
            logger.error(f"❌ Ошибка запуска сканирования: {e}")
            self.send_error_response(f"Ошибка запуска сканирования: {str(e)}")
    
    def handle_get_maps(self):
        """Получение списка карт"""
        try:
            maps = self.scanner.maps if self.scanner else []
            self.send_json_response({
                'maps': maps,
                'count': len(maps)
            })
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения карт: {e}")
            self.send_error_response(f"Ошибка получения карт: {str(e)}")
    
    def handle_update_settings(self):
        """Обновление настроек"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                settings = json.loads(post_data.decode('utf-8'))
                
                # Обновляем настройки сканера
                if 'selected_maps' in settings:
                    self.scanner.selected_maps = settings['selected_maps']
                if 'auto_save_threshold' in settings:
                    self.scanner.auto_save_threshold = settings['auto_save_threshold']
                
                self.send_json_response({
                    'status': 'success',
                    'message': 'Настройки обновлены'
                })
            else:
                self.send_error_response("Нет данных для обновления")
                
        except Exception as e:
            logger.error(f"❌ Ошибка обновления настроек: {e}")
            self.send_error_response(f"Ошибка обновления настроек: {str(e)}")
    
    def handle_clear_cache(self):
        """Очистка кэша"""
        try:
            self.scanner.servers.clear()
            self.send_json_response({
                'status': 'success',
                'message': 'Кэш очищен'
            })
            
        except Exception as e:
            logger.error(f"❌ Ошибка очистки кэша: {e}")
            self.send_error_response(f"Ошибка очистки кэша: {str(e)}")
    
    def handle_static_files(self, path):
        """Обработка статических файлов"""
        try:
            if path == '/':
                path = '/index.html'
            
            # Убираем /api/static/ из пути
            if path.startswith('/api/static/'):
                path = path[11:]  # Убираем '/api/static/'
            
            # Определяем путь к файлу
            current_dir = os.path.dirname(os.path.abspath(__file__))
            public_dir = os.path.join(current_dir, 'public')
            file_path = os.path.join(public_dir, path.lstrip('/'))
            
            if not os.path.exists(file_path):
                self.send_error_response("Файл не найден", 404)
                return
            
            # Определяем MIME тип
            mime_types = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.ico': 'image/x-icon'
            }
            
            ext = os.path.splitext(file_path)[1].lower()
            content_type = mime_types.get(ext, 'text/plain')
            
            with open(file_path, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            
        except Exception as e:
            logger.error(f"❌ Ошибка обработки статического файла: {e}")
            self.send_error_response("Ошибка обработки файла")
    
    def send_json_response(self, data):
        """Отправка JSON ответа"""
        try:
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(json_data.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(json_data.encode('utf-8'))
        except Exception as e:
            logger.error(f"❌ Ошибка отправки JSON: {e}")
            self.send_error_response("Ошибка отправки ответа")
    
    def send_error_response(self, message, status_code=500):
        """Отправка ошибки"""
        try:
            error_data = {
                'error': True,
                'message': message,
                'status_code': status_code
            }
            json_data = json.dumps(error_data, ensure_ascii=False)
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(json_data.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(json_data.encode('utf-8'))
        except Exception as e:
            logger.error(f"❌ Ошибка отправки ошибки: {e}")

class CS2APIServer:
    def __init__(self, port=8000):
        self.port = port
        self.scanner = None
        self.server = None
        self.is_running = False
    
    def start(self):
        """Запуск API сервера"""
        try:
            # Инициализируем сканер
            self.scanner = CS2ScannerSimple(max_workers=10)
            
            # Создаем обработчик с передачей сканера
            def handler(*args, **kwargs):
                return CS2APIHandler(*args, scanner=self.scanner, **kwargs)
            
            # Запускаем HTTP сервер
            self.server = HTTPServer(('0.0.0.0', self.port), handler)
            self.is_running = True
            
            logger.info(f"🚀 API сервер запущен на порту {self.port}")
            logger.info(f"📡 Доступен по адресу: http://localhost:{self.port}")
            logger.info(f"🔗 API endpoints:")
            logger.info(f"   GET  /api/status - статус сервера")
            logger.info(f"   GET  /api/servers - список серверов")
            logger.info(f"   GET  /api/saved-servers - сохраненные серверы")
            logger.info(f"   GET  /api/scan - запуск сканирования")
            logger.info(f"   GET  /api/maps - список карт")
            logger.info(f"   POST /api/update-settings - обновление настроек")
            logger.info(f"   POST /api/clear-cache - очистка кэша")
            
            # Запускаем сканер в фоновом режиме
            scanner_thread = threading.Thread(target=self.scanner.start_scanning, daemon=True)
            scanner_thread.start()
            logger.info("🔍 Сканер запущен в фоновом режиме")
            
            # Запускаем сервер
            self.server.serve_forever()
            
        except Exception as e:
            logger.error(f"❌ Ошибка запуска API сервера: {e}")
            raise
    
    def stop(self):
        """Остановка API сервера"""
        if self.server:
            self.server.shutdown()
            self.is_running = False
            logger.info("🛑 API сервер остановлен")

def main():
    """Главная функция"""
    try:
        port = int(os.environ.get('PORT', 8000))
        api_server = CS2APIServer(port)
        api_server.start()
    except KeyboardInterrupt:
        logger.info("🛑 Получен сигнал остановки")
        if 'api_server' in locals():
            api_server.stop()
    except Exception as e:
        logger.error(f"❌ Критическая ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 