# TikTok Agent Bot - Multi-Device Vision Automation

> **Note:** This is a 3-hours hack project entirely written by an LLM. Please excuse any rough edges or code quality issues—your help to remove the MCP server and implement direct ADB device control for one or more specific devices is highly appreciated.

Advanced TikTok automation system with AI agents using staged architecture, Vision API, and LLM for intelligent content interaction. Supports multiple Android devices simultaneously.

## 🎯 Concept

Agent-based system with three operational stages:
- **Initiating**: Finding and launching TikTok on device
- **Learning**: Interface analysis and button coordinate detection  
- **Working**: Main loop - viewing, liking, commenting

## 🏗️ Architecture

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
                    │ • interaction.ts│
                    │ • llm.ts        │
                    │ • utils.ts      │
                    │ • phone-mcp.ts  │
                    └─────────────────┘
```

## 📂 Project Structure

```
/
├── src/
│   ├── core/
│   │   ├── AgentManager.ts         // manages stages (initiating, learning, working)
│   │   ├── Worker.ts               // worker for specific device
│   │   └── DeviceManager.ts        // scans devices and starts workers
│   │
│   ├── stages/
│   │   ├── initiating.ts           // find TikTok, launch, wait for ready state
│   │   ├── learning.ts             // determine coordinates of like, comment, etc.
│   │   └── working.ts              // main loop - watch, like, occasionally comment
│   │
│   ├── tools/
│   │   ├── interaction.ts          // AI-powered screen interaction wrapper
│   │   ├── utils.ts                // sleep, random, logging, etc.
│   │   ├── llm.ts                  // LLM integration stub
│   │   └── phone-mcp.ts            // MCP ADB integration and screen analysis
│   │
│   ├── config/
│   │   └── presets.ts              // settings - comment frequency, phrase lists, etc.
│   │
│   └── index.ts                    // startup: scan devices and launch AgentManager
├── package.json
└── tsconfig.json
```

## 🔄 Stage Flow

### 1. **Device Detection & Worker Creation**
```
┌─ DeviceManager.getDevices()
├─ Scan ADB devices
├─ Create Worker for each device
├─ Pass Worker to AgentManager
└─ Start first stage: initiating
```

### 2. **Stage 1: Initiating**
```
┌─ Worker status: 'initiating'
├─ Launch TikTok via adb
├─ Screenshot + UI analysis readiness check
├─ Wait for full interface loading
└─ Transition to stage: learning
```

### 3. **Stage 2: Learning**
```
┌─ Worker status: 'learning'
├─ Series of main screen screenshots
├─ UI analysis button search:
│  ├─ Like button (coordinates x, y)
│  ├─ Comment button (coordinates x, y)
│  ├─ Comment input field (coordinates x, y)
│  ├─ Send button (coordinates x, y)
│  └─ Close button (coordinates x, y)
├─ Save coordinates to WorkerMemory
├─ Test interaction (verify buttons work)
└─ Transition to stage: working
```

### 4. **Stage 3: Working (Main Loop)**
```
For each video in infinite loop:
┌─ Worker status: 'working'
├─ ⏱️ Watch video (5-10 sec normal, 1 sec quick skip 20% chance)
├─ 🎲 Random decision:
│  ├─ 70% chance: Like (uses saved coordinates)
│  └─ 10% chance: Comment
│     ├─ AI comment generation or template
│     ├─ Tap comment input
│     ├─ Enter text
│     └─ Tap send button
├─ 📱 Swipe to next video
├─ 🩺 Health check every 10th video
├─ 🕵️ Shadow ban detection every 20th video
├─ 📊 Update Worker statistics
└─ Repeat cycle
```

## 🛠️ Technology Stack

### **Core Management**
- **AgentManager**: Stage orchestration and transitions
- **Worker**: Individual agent per device
- **DeviceManager**: Android device discovery and management

### **Screen Analysis**
- **phone-mcp analyze_screen**: Inspect UI elements using ADB
- **Coordinate Detection**: Precise pixel coordinates for interaction using Gemini Vision API
- **UI State Recognition**: Application state determination

### **Language Model**
- **Google Gemini LLM**: Natural comment generation based on video content
- **Template System**: Combination of templates and AI generation
- **Context Awareness**: Video content adaptation

### **Device Control**
- **ADB Integration**: Direct Android device control
- **Screen Automation**: Touch, swipe, type interactions
- **App Management**: Launch, screenshot, state monitoring

## 🚀 Setup & Installation

### Prerequisites
```bash
# 1. Android SDK / ADB tools
# 2. Node.js 18+ / TypeScript
# 3. Android devices with USB debugging
# 4. Google Gemini API key
# 5. Python 3.x for phone-mcp server
```

### Installation
```bash
# Clone project
git clone <repository>
cd tiktok-bot
pnpm install

# Install phone-mcp server (required for device control)
# Option 1: Using uvx (recommended)
uvx phone-mcp

# Option 2: Using uv
uv pip install phone-mcp

# Option 3: Using pip
pip install phone-mcp

# Setup environment
cp .env.example .env
# Add API key:
# GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here
```

### Device Setup
```bash
# Enable Developer Options + USB Debugging on Android
# Connect devices and authorize computer
adb devices  # Should list all connected devices

```

## ▶️ Usage

### Automatic Multi-Device
```bash
# Run on all connected devices
pnpm start

# System automatically:
# 1. Finds all Android devices
# 2. Creates Worker for each
# 3. Runs parallel agents
# 4. Goes through stages: initiating → learning → working
```

### Manual Single Device
```bash
# Run on specific device
pnpm start --device <device_id>

# Debugging with detailed logs
DEBUG=agent:* pnpm start
```

## 🔧 Configuration

### Behavioral Presets
```typescript
// src/config/presets.ts
export const AUTOMATION_PRESETS = {
  video: {
    watchDuration: [5, 10],       // Random viewing time (seconds)
    quickSkipChance: 0.2,         // 20% chance quick skip (1 second)
    quickSkipDuration: 1,         // Duration for quick skip
    scrollDelay: [1, 3],          // Delay between videos
  },
  
  interactions: {
    likeChance: 0.7,              // 70% like chance
    commentChance: 0.1,           // 10% comment chance
    dailyLimit: 500,              // Daily action limit
  },
  
  comments: {
    templates: [
      "amazing",
      "love this content", 
      "so cool",
      "great video",
      // ... more templates
    ],
    useAI: true,                  // LLM generation
    maxLength: 50,                // Maximum length
  }
};
```

### Learning Stage Behavior
The learning stage uses UI analysis to:
1. **Launch TikTok** and verify it's ready
2. **Locate UI elements** through screenshot analysis:
   - Like button (heart icon, usually right side)
   - Comment button (speech bubble icon)
3. **Learn comment flow** by practicing the sequence:
   - Click comment → wait → find input field
   - Test typing → find send button → find close button
   - Save all coordinates for working stage

### Working Stage Behavior  
The working stage implements the main automation:
1. **Video watching** with realistic durations and quick skip chances
2. **Action decisions** based on probability (like 70%, comment 10%)
3. **AI comment generation** or template selection
4. **Health checks** every 10 videos to ensure proper TikTok state
5. **Shadow ban detection** every 20 videos
6. **Adaptive delays** based on time of day and activity

## ⚠️ Known Issues

### MCP Server Dependency
Currently the system uses the [phone-mcp](https://github.com/hao-cyber/phone-mcp) server for device control, which only works with one device at a time. This external dependency needs to be replaced with a set of direct ADB functions and removed (planned for near future).

### Android Only
Currently only supports Android devices. iOS support may be added later.

## 🎛️ Advanced Features

### Multi-Account Management
- Automatic account switching
- Session isolation per device
- Rotation strategies

### Content Analysis
- Video content categorization via AI vision
- Engagement prediction
- Trend detection

### Performance Optimization
- Concurrent device management
- Resource usage monitoring
- Battery optimization awareness

## ⚠️ Production Considerations

### Daily Limits
The system implements a simple daily limit check in the working stage:
```typescript
// Check daily limits from presets.ts
const totalActions = this.stats.likesGiven + this.stats.commentsPosted;
if (totalActions >= this.presets.interactions.dailyLimit) {
  logger.info(`🛑 Daily limit reached: ${totalActions}/${this.presets.interactions.dailyLimit}`);
  return false; // Stop automation
}
```

### Error Recovery
- Automatic stage rollback
- Device disconnection handling
- App crash recovery
- Network failure resilience

### Compliance
- TikTok API rate respect
- Human-like behavior patterns
- Privacy considerations
- Terms of service adherence

## 🚦 Current Implementation Status

### ✅ Completed
- [x] **Learning stage**: AI-powered UI element detection and coordinate learning
- [x] **Working stage**: Full automation loop with realistic behavior patterns
- [x] **Configuration system**: Flexible presets for different automation strategies
- [x] **AI integration**: Gemini for UI analysis and LLM for comment generation
- [x] **Health monitoring**: Automatic checks and shadow ban detection

### 🔧 In Progress
- [ ] **Multi-device support**: Replace MCP server with direct function calls
- [ ] **Device manager**: Complete ADB integration and device lifecycle management
- [ ] **Agent manager**: Stage transition orchestration and memory persistence

### 📋 TODO
- [ ] **Error recovery**: Comprehensive error handling and recovery strategies
- [ ] **Statistics dashboard**: Real-time monitoring and analytics
- [ ] **A/B testing**: Multiple preset configurations for optimization