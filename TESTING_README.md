# 🧪 ho_OJluGun AI - Руководство по тестированию

## 🚀 Быстрый старт

```bash
# Показать все доступные команды тестирования
npm run test:all

# Запустить standalone сервер (рекомендуется)
npm run test:standalone

# В новом терминале запустить webview dev server
npm run test:webview

# Открыть http://localhost:25463 в браузере для тестирования UI
```

## 📋 Доступные способы тестирования

### 1. 🎯 Standalone Core API Server (Рекомендуется)
```bash
npm run test:standalone
```
- **Что:** Запускает ядро Cline как автономный gRPC сервер
- **Порт:** 26040 (gRPC), 26041 (HostBridge)
- **Преимущества:** Не требует VS Code, полная функциональность backend
- **Использование:** Для тестирования API и backend логики

### 2. 🌐 Webview Development Server
```bash
npm run test:webview
```
- **Что:** Запускает UI интерфейс отдельно
- **URL:** http://localhost:25463
- **Преимущества:** Быстрая разработка UI, hot reload
- **Использование:** Для тестирования интерфейса и компонентов

### 3. 🔧 Testing Platform Orchestrator
```bash
npm run test:orchestrator
```
- **Что:** Автоматизированное тестирование с JSON спецификациями
- **Файл:** testing-platform/test-spec.json
- **Преимущества:** Структурированное тестирование, CI/CD готовность
- **Использование:** Для комплексного тестирования

### 4. 🎭 Специализированные тесты
```bash
# Тестирование встроенного браузера
npm run test:browser

# Тестирование AI консультации
npm run test:consultation
```

## 🏗️ Архитектура тестирования

```
ho_OJluGun AI Testing Suite
├── 🎯 Standalone Server (Backend)
│   ├── gRPC API Server (port 26040)
│   ├── HostBridge Server (port 26041)
│   └── Cosmos AI Services (stubs)
├── 🌐 Webview UI (Frontend)
│   ├── React + Vite dev server
│   ├── Hot reload development
│   └── Component testing
└── 🔧 Testing Platform
    ├── JSON-based test specs
    ├── Automated execution
    └── Result validation
```

## 🎮 Как тестировать новые функции

### 🚀 Быстрый тест (Рекомендуется)
1. Запустите серверы: `npm run test:standalone` (в одном терминале)
2. Запустите webview: `npm run test:webview` (в другом терминале)
3. Откройте `test-standalone.html` в браузере для проверки статуса
4. Перейдите к полному UI по ссылке в HTML файле

### Встроенный браузер (🌐 TV icon)
1. Запустите standalone сервер: `npm run test:standalone`
2. Откройте http://localhost:25464 в браузере
3. Найдите иконку браузера в интерфейсе
4. Протестируйте навигацию и функциональность

### AI консультация (⏳ Hourglass icon)
1. Запустите standalone сервер: `npm run test:standalone`
2. Откройте http://localhost:25464 в браузере
3. Найдите иконку консультации в интерфейсе
4. Создайте задачу и протестируйте предварительную проверку

## 🔧 Устранение неполадок

### Standalone сервер не запускается
```bash
# Очистить и пересобрать
npm run clean:all
npm install
npm run compile-standalone
npm run test:standalone
```

### Webview не загружается
```bash
# Проверить порты
lsof -i :25463
# Или сменить порт в webview-ui/vite.config.ts
```

### Тесты не проходят
```bash
# Проверить логи сервера
npm run test:standalone 2>&1 | tee server.log
```

## 📊 Статус тестирования

- ✅ **Standalone Core API Server**: Работает
- ✅ **Webview Development Server**: Работает
- ✅ **Testing Platform Orchestrator**: Настроен
- 🔄 **Embedded Browser Feature**: Готов к тестированию
- 🔄 **AI Consultation Feature**: Готов к тестированию
- ⚠️ **Cosmos AI Services**: Stubbed (ожидают реализации)

## 🎯 Следующие шаги

1. **Тестирование в браузере**: Открыть http://localhost:25463 и протестировать UI
2. **Функциональное тестирование**: Проверить работу всех кнопок и функций
3. **Интеграционное тестирование**: Протестировать взаимодействие компонентов
4. **Производительность**: Замерить скорость работы и потребление ресурсов

---

**Создано для удобного тестирования ho_OJluGun AI без VS Code дебаггинга!** 🚀
