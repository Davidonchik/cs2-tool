# ⚡ Быстрое развертывание CS2 Tool

## 🚀 Вариант 1: Cloudflare Pages (Только интерфейс)

### Шаги:
1. **Создайте репозиторий на GitHub**
2. **Загрузите код:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/cs2-tool.git
   git push -u origin main
   ```

3. **На Cloudflare Pages:**
   - Создайте проект
   - Подключите GitHub репозиторий
   - Build settings: `public` папка
   - Deploy!

**Результат:** `https://cs2tool.pages.dev`

## 🚀 Вариант 2: Railway (Полная функциональность)

### Шаги:
1. **Зарегистрируйтесь на [railway.app](https://railway.app)**
2. **Подключите GitHub репозиторий**
3. **Railway автоматически определит Python проект**
4. **Добавьте переменные окружения:**
   ```
   PORT=8000
   ```

**Результат:** `https://cs2tool-production.up.railway.app`

## 🚀 Вариант 3: Heroku (Полная функциональность)

### Шаги:
1. **Установите Heroku CLI**
2. **Создайте приложение:**
   ```bash
   heroku create cs2tool-app
   git push heroku main
   ```

**Результат:** `https://cs2tool-app.herokuapp.com`

## 🔧 Настройка после развертывания

### Для Cloudflare Pages:
- ✅ Интерфейс работает
- ❌ Сканирование не работает (нужен бэкенд)

### Для Railway/Heroku:
- ✅ Полная функциональность
- ✅ WebSocket работает
- ✅ Сканирование работает

## 📝 Важные замечания

### Cloudflare Pages (Статический хостинг):
- **Плюсы:** Бесплатно, быстро, надежно
- **Минусы:** Только интерфейс, нет бэкенда
- **Подходит для:** Демонстрации интерфейса

### Railway/Heroku (Полный хостинг):
- **Плюсы:** Полная функциональность
- **Минусы:** Может быть платно, медленнее
- **Подходит для:** Полноценного использования

## 🎯 Рекомендация

**Для демонстрации:** Cloudflare Pages
**Для реального использования:** Railway 