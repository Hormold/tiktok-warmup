# TikTok Agent Bot - Multi-Device Vision Automation

Продвинутая система автоматизации TikTok с AI-агентами, использующая стадийную архитектуру, Vision API и LLM для умного взаимодействия с контентом. Поддерживает несколько устройств одновременно.

## 🎯 Концепция

Агентная система с тремя стадиями работы:
- **Initiating**: Поиск и запуск TikTok на устройстве
- **Learning**: Изучение интерфейса и сохранение координат кнопок
- **Working**: Основной луп — просмотр, лайки, комментарии

## 🏗️ Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  DeviceManager  │    │  AgentManager   │    │     Worker      │
│                 │    │                 │    │                 │
│ • Device Scan   │◄──►│ • Stage Control │◄──►│ • Device State  │
│ • ADB Detection │    │ • Memory Mgmt   │    │ • Task Execute  │
│ • Worker Create │    │ • Stage Transit │    │ • Status Report │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │    Stages       │
                    │                 │
                    │ • initiating.ts │
                    │ • learning.ts   │
                    │ • working.ts    │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │     Tools       │
                    │                 │
                    │ • vision.ts     │
                    │ • llm.ts        │
                    │ • device.ts     │
                    └─────────────────┘
```

## 📂 Структура проекта

```
tiktok-agent/
├── src/
│   ├── core/
│   │   ├── AgentManager.ts         // управляет стадиями (initiating, learning, working)
│   │   ├── Worker.ts               // воркер под конкретное устройство
│   │   └── DeviceManager.ts        // сканирует устройства и стартует воркеры
│   │
│   ├── stages/
│   │   ├── initiating.ts           // найти TikTok, запустить, дождаться готовности
│   │   ├── learning.ts             // определить координаты лайка, комментария и т.д.
│   │   └── working.ts              // основной луп — смотреть, лайкать, иногда комментить
│   │
│   ├── tools/
│   │   ├── vision.ts               // Vision API — находит кнопки по скриншоту
│   │   ├── llm.ts                  // LLM генерация комментариев
│   │   ├── device.ts               // adb-обвязка: запуск приложений, скриншоты, тапы
│   │   └── utils.ts                // sleep, random, логирование и пр.
│   │
│   ├── config/
│   │   └── presets.ts              // настройки — частота комментов, список фраз и т.д.
│   │
│   └── index.ts                    // старт: сканирует устройства и запускает AgentManager
├── package.json
└── tsconfig.json
```

## 🔄 Стадийный Flow

### 1. **Device Detection & Worker Creation**
```
┌─ DeviceManager.getDevices()
├─ Сканирует ADB устройства
├─ Создает Worker для каждого устройства
├─ Передает Worker в AgentManager
└─ Запускает первую стадию: initiating
```

### 2. **Stage 1: Initiating**
```
┌─ Worker статус: 'initiating'
├─ Запуск TikTok через adb
├─ Screenshot + Vision проверка готовности
├─ Ожидание полной загрузки интерфейса
└─ Переход в стадию: learning
```

### 3. **Stage 2: Learning**
```
┌─ Worker статус: 'learning'
├─ Серия скриншотов главного экрана
├─ Vision API поиск кнопок:
│  ├─ Like button (координаты x, y)
│  ├─ Comment button (координаты x, y)
│  ├─ Comment input field (координаты x, y)
│  └─ Send button (координаты x, y)
├─ Сохранение координат в WorkerMemory
├─ Тестовое взаимодействие (проверка кнопок)
└─ Переход в стадию: working
```

### 4. **Stage 3: Working (Main Loop)**
```
For each video in infinite loop:
┌─ Worker статус: 'working'
├─ ⏱️ Просмотр видео (60-90 сек)
├─ 🎲 Рандом решение:
│  ├─ 70% шанс: Like (использует saved coordinates)
│  └─ 10% шанс: Comment
│     ├─ LLM генерация комментария
│     ├─ Tap на comment input
│     ├─ Ввод текста
│     └─ Tap на send button
├─ 📱 Swipe для следующего видео
├─ 📊 Обновление статистики Worker
└─ Повтор цикла
```

## 🛠️ Technology Stack

### **Core Management** (TypeScript)
- **AgentManager**: Orchestration стадий и переходов между ними
- **Worker**: Индивидуальный агент для каждого устройства
- **DeviceManager**: Discovery и management Android устройств

### **Computer Vision** (API Integration)
- **Google Vision API / Gemini Vision**: Поиск UI элементов на скриншотах
- **Coordinate Detection**: Точные пиксельные координаты для взаимодействия
- **UI State Recognition**: Определение состояния приложения

### **Language Model** (AI Generation)
- **OpenAI / Gemini LLM**: Генерация естественных комментариев
- **Template System**: Комбинация заготовок и AI-генерации
- **Context Awareness**: Адаптация под контент видео

### **Device Control** (Android ADB)
- **ADB Integration**: Прямое управление Android устройствами
- **Screen Automation**: Touch, swipe, type interactions
- **App Management**: Launch, screenshot, state monitoring

## 🚀 Setup & Installation

### Prerequisites
```bash
# 1. Android SDK / ADB tools
# 2. Node.js 18+ / TypeScript
# 3. Android устройства с USB debugging
# 4. API ключи: Google Vision, OpenAI/Gemini
```

### Installation
```bash
# Clone project
git clone <repository>
cd tiktok-agent
pnpm install

# Setup environment
cp .env.example .env
# Add API keys:
# GOOGLE_VISION_API_KEY=
# OPENAI_API_KEY= (or GEMINI_API_KEY=)
```

### Device Setup
```bash
# Enable Developer Options + USB Debugging on Android
# Connect devices and authorize computer
adb devices  # Should list all connected devices

# Install TikTok on target devices
adb -s <device_id> install tiktok.apk
```

## ▶️ Usage

### Automatic Multi-Device
```bash
# Запуск на всех подключенных устройствах
pnpm start

# Система автоматически:
# 1. Найдет все Android устройства
# 2. Создаст Worker для каждого
# 3. Запустит параллельные агенты
# 4. Пройдет стадии: initiating → learning → working
```

### Manual Single Device
```bash
# Запуск на конкретном устройстве
pnpm start --device <device_id>

# Debugging с подробными логами
DEBUG=agent:* pnpm start
```

## 🔧 Configuration

### Behavioral Presets
```typescript
// src/config/presets.ts
export const AUTOMATION_PRESETS = {
  video: {
    watchDuration: [60, 90],      // Случайное время просмотра
    scrollDelay: [2, 4],          // Задержка между видео
  },
  
  interactions: {
    likeChance: 0.7,              // 70% шанс лайка
    commentChance: 0.1,           // 10% шанс комментария
    dailyLimit: 500,              // Лимит действий в день
  },
  
  comments: {
    templates: [
      "Amazing! 🔥",
      "Love this content ❤️",
      "So cool! 😍"
    ],
    useAI: true,                  // LLM генерация
    maxLength: 50,                // Максимальная длина
  }
};
```

### Vision Detection
```typescript
// src/tools/vision.ts
export interface VisionConfig {
  confidence: number;             // Минимальная уверенность (0.8)
  retryAttempts: number;          // Попытки поиска (3)
  searchRegions: Region[];        // Области поиска UI
}
```

## 📊 Monitoring & Stats

### Real-time Dashboard
```
🤖 Active Workers: 3/3
📱 Devices: Samsung S23, Pixel 7, OnePlus 11

Worker #1 (S23):     [Working] Videos: 45, Likes: 32, Comments: 4
Worker #2 (Pixel):   [Learning] Detecting UI elements...
Worker #3 (OnePlus): [Working] Videos: 38, Likes: 27, Comments: 3

📈 Total Session: 2h 15m, 83 videos, 59 likes, 7 comments
⚡ Success Rate: Like 98%, Comment 85%
```

### Logs & Analytics
```bash
# View worker logs
tail -f logs/worker-{device_id}.log

# Performance metrics
cat logs/stats.json | jq '.workers[] | .performance'

# Error monitoring
grep ERROR logs/*.log
```

## 🔍 Development Guide

### Adding New Stages
```typescript
// src/stages/custom-stage.ts
export class CustomStage implements Stage {
  async execute(worker: Worker): Promise<StageResult> {
    // Custom stage logic
    return { success: true, nextStage: 'working' };
  }
}
```

### Custom Vision Tools
```typescript
// src/tools/vision.ts
export async function findCustomElement(
  screenshot: Buffer,
  element: string
): Promise<Coordinates | null> {
  // Custom vision detection logic
}
```

### Worker Extensions
```typescript
// src/core/Worker.ts
export class Worker {
  async executeCustomAction(action: CustomAction): Promise<boolean> {
    // Add custom worker capabilities
  }
}
```

## 🎛️ Advanced Features

### Multi-Account Management
- Automatic account switching
- Session isolation per device
- Rotation strategies

### Content Analysis
- Video content categorization
- Engagement prediction
- Trend detection

### Performance Optimization
- Concurrent device management
- Resource usage monitoring
- Battery optimization awareness

## ⚠️ Production Considerations

### Rate Limiting
```typescript
const RATE_LIMITS = {
  likes: { max: 100, window: '1h' },
  comments: { max: 20, window: '1h' },
  videos: { max: 500, window: '24h' }
};
```

### Error Recovery
- Automatic stage rollback
- Device disconnection handling
- App crash recovery
- Network failure resilience

### Compliance
- TikTok API rate respect
- Human-like behavior patterns
- Privacy consideration
- Terms of service adherence

## 🚦 TODO List

### 🔧 1. Device Detection (device.ts)
- [ ] ADB devices scan and connection
- [ ] Device capabilities detection
- [ ] Basic controls: tap(x,y), screenshot(), launchApp()

### 🧠 2. AgentManager.ts
- [ ] Worker lifecycle management
- [ ] Stage transition orchestration  
- [ ] Memory and state persistence

### 🤖 3. Stages Implementation
- [ ] **initiating.ts**: TikTok launch and readiness check
- [ ] **learning.ts**: UI mapping and coordinate detection
- [ ] **working.ts**: Main automation loop

### 📸 4. Vision Tools (vision.ts)
- [ ] findCoordinates(label, screenshot) implementation
- [ ] Google Vision API / Gemini integration
- [ ] Confidence scoring and validation

### 💬 5. LLM Integration (llm.ts)
- [ ] Comment generation with context
- [ ] Template system + AI enhancement
- [ ] Content-aware responses

### ⚙️ 6. Configuration (presets.ts)
- [ ] Behavioral settings and limits
- [ ] Device-specific configurations
- [ ] A/B testing presets

---

**Ready to build?** Готов генерить каркас кода для всех файлов сразу. Скажи слово — и будет полная структура с пустыми функциями и TODO комментариями. 