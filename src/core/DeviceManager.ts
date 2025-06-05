import fs from 'fs/promises';

import type { ToolSet } from 'ai';
import { z } from 'zod';


import { execAsync, logger } from '../tools/utils.js';
/**
 * Android device information
 */
export interface AndroidDevice {
  id: string;
  name: string;
  model: string;
  status: 'device' | 'offline' | 'unauthorized';
  properties: Record<string, string>;
}

/**
 * Device capabilities and status
 */
export interface DeviceCapabilities {
  hasCamera: boolean;
  hasWifi: boolean;
  screenResolution: { width: number; height: number };
  androidVersion: string;
  apiLevel: number;
}

/**
 * DeviceManager - handles ADB device discovery and management
 * 
 * Responsibilities:
 * - Scan for connected Android devices
 * - Get device information and capabilities
 * - Verify ADB connection health
 * - Filter devices by criteria
 */
export class DeviceManager {
  private cachedDevices: Map<string, AndroidDevice> = new Map();
  private lastScanTime = 0;
  private scanCacheDuration = 10000; // 10 seconds

  private deviceCapabilitiesCache: Map<string, { capabilities: DeviceCapabilities; timestamp: number }> = new Map();
  private capabilitiesCacheDuration = 30000; // 30 seconds

  constructor() {
    logger.debug('DeviceManager initialized');
  }

  /**
   * Take screenshot and return as base64 PNG data
   */
  async takeScreenshot(deviceId: string): Promise<string> {
    const tempPath = `/sdcard/screenshot_${Date.now()}.png`;
    const localTempFile = `/tmp/screenshot_${deviceId}_${Date.now()}.png`;
    
    try {
      // Take screenshot on device
      await execAsync(`adb -s ${deviceId} shell screencap -p ${tempPath}`);
      
      // Pull to local temp file  
      await execAsync(`adb -s ${deviceId} pull ${tempPath} "${localTempFile}"`);
      
      // Read file as base64
      const imageBuffer = await fs.readFile(localTempFile);
      const base64Data = imageBuffer.toString('base64');
      
      // Clean up files
      await execAsync(`adb -s ${deviceId} shell rm ${tempPath}`);
      await fs.unlink(localTempFile);
      
      logger.debug(`📸 [DeviceManager] Screenshot captured for ${deviceId}, size: ${base64Data.length} chars`);
      return base64Data;
      
    } catch (error) {
      logger.error(`❌ Failed to take screenshot for ${deviceId}:`, error);
      throw new Error(`Screenshot failed: ${error}`);
    }
  }

  /**
   * Take screenshot and save to file
   */
  async takeScreenshotToFile(deviceId: string, localPath: string): Promise<void> {
    const tempPath = `/sdcard/screenshot_${Date.now()}.png`;
    
    try {
      // Take screenshot on device
      await execAsync(`adb -s ${deviceId} shell screencap -p ${tempPath}`);
      
      // Pull to local file
      await execAsync(`adb -s ${deviceId} pull ${tempPath} "${localPath}"`);
      
      // Clean up device file
      await execAsync(`adb -s ${deviceId} shell rm ${tempPath}`);
      
      logger.info(`📸 Screenshot saved to: ${localPath}`);
    } catch (error) {
      logger.error(`❌ Failed to save screenshot to ${localPath}:`, error);
      throw new Error(`Screenshot save failed: ${error}`);
    }
  }

  /**
   * Get all connected Android devices
   */
  async getConnectedDevices(forceRefresh = false): Promise<AndroidDevice[]> {
    const now = Date.now();
    
    // Use cached results if recent
    if (!forceRefresh && (now - this.lastScanTime) < this.scanCacheDuration) {
      return Array.from(this.cachedDevices.values());
    }

    try {
      logger.info('🔍 Scanning for Android devices...');
      
      // Check if ADB is available
      await this.verifyAdbInstalled();
      
      // Get raw device list
      const devices = await this.scanAdbDevices();
      
      // Enrich with device information
      const enrichedDevices = await this.enrichDeviceInfo(devices);
      
      // Update cache
      this.cachedDevices.clear();
      enrichedDevices.forEach(device => {
        this.cachedDevices.set(device.id, device);
      });
      this.lastScanTime = now;

      logger.info(`📱 Found ${enrichedDevices.length} devices: ${enrichedDevices.map(d => d.name).join(', ')}`);
      if (enrichedDevices.length > 0) {
        try {
          await this.takeScreenshot(enrichedDevices[0].id);
          logger.info(`📸 [DeviceManager] Screenshot captured with ${enrichedDevices[0].id}, looking good`);
        } catch (err) {
          logger.debug('Skipping screenshot on first device:', err);
        }
      }
      return enrichedDevices;

    } catch (error) {
      logger.error('❌ Failed to scan devices:', error);
      throw error;
    }
  }

  /**
   * Get specific device by ID
   */
  async getDeviceById(deviceId: string): Promise<AndroidDevice | null> {
    const devices = await this.getConnectedDevices();
    return devices.find(d => d.id === deviceId) ?? null;
  }

  /**
   * Get device capabilities and technical info
   */
  private getDeviceCapabilitiesFromCache(deviceId: string): DeviceCapabilities | null {
    const cached = this.deviceCapabilitiesCache.get(deviceId);
    if (cached && (Date.now() - cached.timestamp) < this.capabilitiesCacheDuration) {
      logger.debug(`Using cached capabilities for device ${deviceId}`);
      return cached.capabilities;
    }
    return null;
  }

  async getDeviceCapabilities(deviceId: string): Promise<DeviceCapabilities> {
    const cachedCapabilities = this.getDeviceCapabilitiesFromCache(deviceId);
    if (cachedCapabilities) {
      return cachedCapabilities;
    }

    try {
      logger.debug(`Getting capabilities for device ${deviceId}`);

      const [resolution, androidVersion, apiLevel] = await Promise.all([
        this.getScreenResolution(deviceId),
        this.getProperty(deviceId, 'ro.build.version.release'),
        this.getProperty(deviceId, 'ro.build.version.sdk'),
      ]);

      const capabilities: DeviceCapabilities = {
        hasCamera: await this.hasFeature(deviceId, 'android.hardware.camera'),
        hasWifi: await this.hasFeature(deviceId, 'android.hardware.wifi'),
        screenResolution: resolution,
        androidVersion,
        apiLevel: parseInt(apiLevel, 10),
      };

      this.deviceCapabilitiesCache.set(deviceId, { capabilities, timestamp: Date.now() });
      return capabilities;

    } catch (error) {
      logger.error(`Failed to get capabilities for ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Check if device is ready for automation
   */
  async isDeviceReady(deviceId: string): Promise<boolean> {
    try {
      // Check device connection
      const device = await this.getDeviceById(deviceId);
      if (!device || device.status !== 'device') {
        return false;
      }

      // Check screen is on
      const screenState = await this.getProperty(deviceId, 'service.adb.tcp.port');
      if (!screenState) {
        return false;
      }

      // Check if we can take screenshot (basic interaction test)
      const result = await execAsync(`adb -s ${deviceId} shell screencap -p /dev/null`);
      const output = result.stdout || result.stderr || result;
      return typeof output === 'string' ? !output.includes('error') : true;

    } catch (error) {
      logger.debug(`Device ${deviceId} is not ready:`, error);
      return false;
    }
  }

  /**
   * Verify ADB is installed and accessible
   */
  private async verifyAdbInstalled(): Promise<void> {
    const adbPaths = [
      'adb',
      '/opt/homebrew/bin/adb',
      '/usr/local/bin/adb',
      process.env.ANDROID_HOME ? `${process.env.ANDROID_HOME}/platform-tools/adb` : null,
    ].filter(Boolean);

    for (const adbPath of adbPaths) {
      try {
        const result = await execAsync(`${adbPath} version`);
        if (result.stdout?.includes('Android Debug Bridge') || result.stderr?.includes('Android Debug Bridge')) {
          logger.debug(`✅ ADB verified and working at: ${adbPath}`);
          return;
        }
      } catch (error) {
        logger.debug(`ADB not found at: ${adbPath}, error: ${error}`);
        // Try next path
        continue;
      }
    }

    throw new Error(
      'ADB (Android Debug Bridge) is not installed or not in PATH. ' +
      'Please install Android SDK platform-tools and ensure adb is accessible. ' +
      `Tried paths: ${adbPaths.join(', ')}`
    );
  }

  /**
   * Get raw device list from ADB
   */
  private async scanAdbDevices(): Promise<Array<Partial<AndroidDevice>>> {
    try {
      const result = await execAsync('adb devices -l');
      const output = result.stdout || result;
      
      if (typeof output !== 'string') {
        logger.debug('ADB output type:', typeof output, output);
        throw new Error('Unexpected output format from adb devices');
      }
      
      const lines = output.split('\n').slice(1); // Skip header
      
      const devices: Array<Partial<AndroidDevice>> = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        
        const [deviceId, status] = parts;
        
        // Parse additional properties from device line
        const properties: Record<string, string> = {};
        const propertiesMatch = line.match(/product:(\S+)|model:(\S+)|device:(\S+)/g);
        if (propertiesMatch) {
          propertiesMatch.forEach(prop => {
            const [key, value] = prop.split(':');
            properties[key] = value;
          });
        }

        devices.push({
          id: deviceId,
          status: status as AndroidDevice['status'],
          properties,
        });
      }
      
      return devices;
      
    } catch (error) {
      throw new Error(`Failed to list ADB devices: ${error}`);
    }
  }

  /**
   * Enrich basic device info with detailed properties
   */
  private async enrichDeviceInfo(devices: Array<Partial<AndroidDevice>>): Promise<AndroidDevice[]> {
    const enriched: AndroidDevice[] = [];
    
    for (const device of devices) {
      if (!device.id || device.status !== 'device') {
        continue; // Skip offline/unauthorized devices
      }

      try {
        const [model, manufacturer] = await Promise.all([
          this.getProperty(device.id, 'ro.product.model'),
          this.getProperty(device.id, 'ro.product.manufacturer'),
        ]);

        const name = `${manufacturer} ${model}`.trim() || device.id;

        enriched.push({
          id: device.id,
          name,
          model,
          status: device.status,
          properties: {
            ...device.properties,
            manufacturer,
          },
        });

      } catch (error) {
        logger.warn(`Failed to enrich device ${device.id}:`, error);
        
        // Add with minimal info
        enriched.push({
          id: device.id,
          name: device.id,
          model: 'Unknown',
          status: device.status || 'device',
          properties: device.properties ?? {},
        });
      }
    }
    
    return enriched;
  }

  /**
   * Get device property via ADB
   */
  private async getProperty(deviceId: string, property: string): Promise<string> {
    try {
      const result = await execAsync(`adb -s ${deviceId} shell getprop ${property}`);
      const output = result.stdout || result;
      return typeof output === 'string' ? output.trim() : '';
    } catch (error) {
      logger.debug(`Failed to get property ${property} for ${deviceId}:`, error);
      return '';
    }
  }

  /**
   * Check if device has specific feature
   */
  private async hasFeature(deviceId: string, feature: string): Promise<boolean> {
    try {
      const result = await execAsync(`adb -s ${deviceId} shell pm list features | grep ${feature}`);
      const output = result.stdout || result;
      return typeof output === 'string' ? output.includes(feature) : false;
    } catch (error) {
      logger.debug(`Failed to check feature ${feature} for ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Get screen resolution
   */
  private async getScreenResolution(deviceId: string): Promise<{ width: number; height: number }> {
    try {
      const result = await execAsync(`adb -s ${deviceId} shell wm size`);
      const output = result.stdout || result;
      
      if (typeof output === 'string') {
        const match = output.match(/(\d+)x(\d+)/);
        
        if (match) {
          return {
            width: parseInt(match[1], 10),
            height: parseInt(match[2], 10),
          };
        }
      }
      
      // Default fallback resolution
      return { width: 1080, height: 1920 };
      
    } catch (error) {
      logger.debug(`Failed to get screen resolution for ${deviceId}:`, error);
      return { width: 1080, height: 1920 };
    }
  }

  /**
   * Clear device cache (force refresh on next scan)
   */
  clearCache(): void {
    this.cachedDevices.clear();
    this.lastScanTime = 0;
    logger.debug('Device cache cleared');
  }

  /**
   * Get cached device count
   */
  getCachedDeviceCount(): number {
    return this.cachedDevices.size;
  }

  // ===== DEVICE INTERACTION METHODS =====

  /**
   * Get screen size/dimensions of device
   */
  async getScreenSize(deviceId: string): Promise<{ width: number; height: number; status: string }> {
    try {
      // First try wm size command
      let result = await execAsync(`adb -s ${deviceId} shell wm size`);
      let output = result.stdout || result.stderr || result;
      
      if (typeof output === 'string' && output.includes('Physical size:')) {
        const match = output.match(/Physical size: (\d+)x(\d+)/);
        if (match) {
          const width = parseInt(match[1], 10);
          const height = parseInt(match[2], 10);
          return { width, height, status: 'success' };
        }
      }

      // Fallback to dumpsys method
      result = await execAsync(`adb -s ${deviceId} shell dumpsys window displays | grep 'init='`);
      output = result.stdout || result.stderr || result;
      
      if (typeof output === 'string') {
        const match = output.match(/init=(\d+)x(\d+)/);
        if (match) {
          const width = parseInt(match[1], 10);
          const height = parseInt(match[2], 10);
          logger.debug(`📐 [DeviceManager] Screen size (fallback) for ${deviceId}: ${width}x${height}`);
          return { width, height, status: 'success' };
        }
      }

      // Use cached resolution as last resort
      const capabilities = await this.getDeviceCapabilities(deviceId);
      logger.warn(`⚠️ Using cached screen resolution for ${deviceId}`);
      return { 
        width: capabilities.screenResolution.width, 
        height: capabilities.screenResolution.height, 
        status: 'fallback' 
      };

    } catch (error) {
      logger.error(`❌ Failed to get screen size for ${deviceId}:`, error);
      throw new Error(`Failed to get screen size: ${error}`);
    }
  }

  /**
   * Tap screen at specified coordinates
   */
  async tapScreen(deviceId: string, x: number, y: number): Promise<string> {
    try {
      // Validate coordinates are positive
      if (x < 0 || y < 0) {
        throw new Error(`Invalid coordinates (${x}, ${y}). Coordinates must be positive.`);
      }

      // Optionally validate against screen bounds
      try {
        const screenSize = await this.getScreenSize(deviceId);
        if (x > screenSize.width || y > screenSize.height) {
          logger.warn(`⚠️ Coordinates (${x}, ${y}) exceed screen bounds ${screenSize.width}x${screenSize.height}`);
        }
      } catch (error) {
        logger.debug(`Failed to validate coordinates against screen size:`, error);
      }

      await execAsync(`adb -s ${deviceId} shell input tap ${x} ${y}`);
      logger.info(`👆 [DeviceManager] Tapped at (${x}, ${y}) on ${deviceId}`);
      return `Successfully tapped at coordinates (${x}, ${y})`;

    } catch (error) {
      logger.error(`❌ Failed to tap screen at (${x}, ${y}) on ${deviceId}:`, error);
      throw new Error(`Failed to tap screen: ${error}`);
    }
  }

  /**
   * Perform swipe gesture on screen
   */
  async swipeScreen(
    deviceId: string, 
    x1: number, 
    y1: number, 
    x2: number, 
    y2: number, 
    durationMs = 300
  ): Promise<string> {
    try {
      if (durationMs < 0) {
        throw new Error('Duration must be a positive value');
      }

      await execAsync(`adb -s ${deviceId} shell input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`);
      logger.info(`👆 [DeviceManager] Swiped from (${x1}, ${y1}) to (${x2}, ${y2}) over ${durationMs}ms on ${deviceId}`);
      return `Successfully swiped from (${x1}, ${y1}) to (${x2}, ${y2}) over ${durationMs}ms`;

    } catch (error) {
      logger.error(`❌ Failed to swipe on ${deviceId}:`, error);
      throw new Error(`Failed to perform swipe: ${error}`);
    }
  }

  /**
   * Press key using Android keycode
   */
  async pressKey(deviceId: string, keycode: string | number): Promise<string> {
    try {
      // Common keycodes mapping
      const commonKeycodes: Record<string, string> = {
        'home': 'KEYCODE_HOME',
        'back': 'KEYCODE_BACK', 
        'menu': 'KEYCODE_MENU',
        'search': 'KEYCODE_SEARCH',
        'power': 'KEYCODE_POWER',
        'camera': 'KEYCODE_CAMERA',
        'volume_up': 'KEYCODE_VOLUME_UP',
        'volume_down': 'KEYCODE_VOLUME_DOWN',
        'mute': 'KEYCODE_VOLUME_MUTE',
        'call': 'KEYCODE_CALL',
        'end_call': 'KEYCODE_ENDCALL',
        'enter': 'KEYCODE_ENTER',
        'delete': 'KEYCODE_DEL',
        'brightness_up': 'KEYCODE_BRIGHTNESS_UP',
        'brightness_down': 'KEYCODE_BRIGHTNESS_DOWN',
        'play': 'KEYCODE_MEDIA_PLAY',
        'pause': 'KEYCODE_MEDIA_PAUSE',
        'play_pause': 'KEYCODE_MEDIA_PLAY_PAUSE',
        'next': 'KEYCODE_MEDIA_NEXT',
        'previous': 'KEYCODE_MEDIA_PREVIOUS',
      };

      const actualKeycode = typeof keycode === 'string' 
        ? commonKeycodes[keycode.toLowerCase()] || keycode
        : keycode.toString();

      await execAsync(`adb -s ${deviceId} shell input keyevent ${actualKeycode}`);
      logger.info(`⌨️ [DeviceManager] Pressed key ${keycode} on ${deviceId}`);
      return `Successfully pressed ${keycode}`;

    } catch (error) {
      logger.error(`❌ Failed to press key ${keycode} on ${deviceId}:`, error);
      throw new Error(`Failed to press key: ${error}`);
    }
  }

  /**
   * Input text at current focus
   * Note: Complex characters may need special handling
   */
  async inputText(deviceId: string, text: string): Promise<string> {
    try {
      // Method 1: Standard text input (most reliable for basic text)
      const escapedText = text.replace(/[" ]/g, (match) => {
        if (match === ' ') return '%s';
        return '\\"';
      });
      
      try {
        await execAsync(`adb -s ${deviceId} shell input text "${escapedText}"`);
        logger.info(`⌨️ [DeviceManager] Input text "${text}" on ${deviceId}`);
        return `Successfully input text: '${text}'`;
      } catch (error) {
        logger.warn(`Standard text input failed, trying fallback method: ${error}`);
      }

      // Method 2: Character-by-character input (fallback for special chars)
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === ' ') {
          await execAsync(`adb -s ${deviceId} shell input keyevent 62`); // Space keycode
        } else {
          const escapedChar = char.replace(/"/g, '\\"');
          await execAsync(`adb -s ${deviceId} shell input text "${escapedChar}"`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      logger.info(`⌨️ [DeviceManager] Input text (char-by-char) "${text}" on ${deviceId}`);
      return `Successfully input text (character-by-character): '${text}'`;

    } catch (error) {
      logger.error(`❌ Failed to input text "${text}" on ${deviceId}:`, error);
      throw new Error(`Failed to input text: ${error}`);
    }
  }

  /**
   * Launch application by package name
   */
  async launchApp(deviceId: string, packageName: string, activityName?: string): Promise<string> {
    try {
      let command: string;
      
      if (activityName) {
        // Launch specific activity
        command = `adb -s ${deviceId} shell am start -n "${packageName}/${activityName}"`;
      } else {
        // Launch main activity of the app
        command = `adb -s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      }

      await execAsync(command);
      logger.info(`🚀 [DeviceManager] Launched app "${packageName}" on ${deviceId}`);
      return `Successfully launched app: ${packageName}`;

    } catch (error) {
      logger.error(`❌ Failed to launch app "${packageName}" on ${deviceId}:`, error);
      throw new Error(`Failed to launch app: ${error}`);
    }
  }

  /**
   * Open URL in default browser
   */
  async openUrl(deviceId: string, url: string): Promise<string> {
    try {
      // Basic URL validation and cleanup
      let cleanUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        cleanUrl = `https://${url}`;
      }

      await execAsync(`adb -s ${deviceId} shell am start -a android.intent.action.VIEW -d "${cleanUrl}"`);
      logger.info(`🌐 [DeviceManager] Opened URL "${cleanUrl}" on ${deviceId}`);
      return `Successfully opened URL: ${cleanUrl}`;

    } catch (error) {
      logger.error(`❌ Failed to open URL "${url}" on ${deviceId}:`, error);
      throw new Error(`Failed to open URL: ${error}`);
    }
  }

  /**
   * Long press at specified coordinates
   */
  async longPress(deviceId: string, x: number, y: number, durationMs = 1000): Promise<string> {
    try {
      // Long press is essentially a swipe with same start/end coordinates
      await execAsync(`adb -s ${deviceId} shell input swipe ${x} ${y} ${x} ${y} ${durationMs}`);
      logger.info(`👆 [DeviceManager] Long pressed at (${x}, ${y}) for ${durationMs}ms on ${deviceId}`);
      return `Successfully long pressed at coordinates (${x}, ${y}) for ${durationMs}ms`;

    } catch (error) {
      logger.error(`❌ Failed to long press at (${x}, ${y}) on ${deviceId}:`, error);
      throw new Error(`Failed to long press: ${error}`);
    }
  }

  /**
   * Scroll screen in specified direction
   */
  async scrollScreen(
    deviceId: string, 
    direction: 'up' | 'down' | 'left' | 'right',
    distance = 500
  ): Promise<string> {
    try {
      const screenSize = await this.getScreenSize(deviceId);
      const centerX = Math.floor(screenSize.width / 2);
      const centerY = Math.floor(screenSize.height / 2);

      let x1 = centerX, y1 = centerY, x2 = centerX, y2 = centerY;

      switch (direction) {
        case 'up':
          y1 = centerY + distance/2;
          y2 = centerY - distance/2;
          break;
        case 'down':
          y1 = centerY - distance/2;
          y2 = centerY + distance/2;
          break;
        case 'left':
          x1 = centerX + distance/2;
          x2 = centerX - distance/2;
          break;
        case 'right':
          x1 = centerX - distance/2;
          x2 = centerX + distance/2;
          break;
        default:
          throw new Error(`Invalid direction: ${direction}`);
      }

      return await this.swipeScreen(deviceId, x1, y1, x2, y2, 300);

    } catch (error) {
      logger.error(`❌ Failed to scroll ${direction} on ${deviceId}:`, error);
      throw new Error(`Failed to scroll: ${error}`);
    }
  }

  /**
   * Terminate/force stop an application
   */
  async terminateApp(deviceId: string, packageName: string): Promise<string> {
    try {
      await execAsync(`adb -s ${deviceId} shell am force-stop ${packageName}`);
      logger.info(`🛑 [DeviceManager] Terminated app "${packageName}" on ${deviceId}`);
      return `Successfully terminated app: ${packageName}`;
    } catch (error) {
      logger.error(`❌ Failed to terminate app "${packageName}" on ${deviceId}:`, error);
      throw new Error(`Failed to terminate app: ${error}`);
    }
  }

  /**
   * Set device orientation
   */
  async setOrientation(deviceId: string, orientation: 'portrait' | 'landscape' | 'auto'): Promise<string> {
    try {
      let command: string;
      switch (orientation) {
        case 'portrait':
          command = `adb -s ${deviceId} shell content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0`;
          await execAsync(command);
          await execAsync(`adb -s ${deviceId} shell content insert --uri content://settings/system --bind name:s:user_rotation --bind value:i:0`);
          break;
        case 'landscape':
          command = `adb -s ${deviceId} shell content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0`;
          await execAsync(command);
          await execAsync(`adb -s ${deviceId} shell content insert --uri content://settings/system --bind name:s:user_rotation --bind value:i:1`);
          break;
        case 'auto':
          command = `adb -s ${deviceId} shell content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:1`;
          await execAsync(command);
          break;
        default:
          throw new Error(`Unsupported orientation: ${orientation}`);
      }
      logger.info(`🔄 [DeviceManager] Set orientation to ${orientation} on ${deviceId}`);
      return `Successfully set orientation to: ${orientation}`;
    } catch (error) {
      logger.error(`❌ Failed to set orientation to ${orientation} on ${deviceId}:`, error);
      throw new Error(`Failed to set orientation: ${error}`);
    }
  }

  /**
   * Control device volume
   */
  async setVolume(deviceId: string, action: 'up' | 'down' | 'mute', steps = 1): Promise<string> {
    try {
      let keycode: string;
      let actualSteps = steps;
      switch (action) {
        case 'up':
          keycode = 'KEYCODE_VOLUME_UP';
          break;
        case 'down':
          keycode = 'KEYCODE_VOLUME_DOWN';
          break;
        case 'mute':
          keycode = 'KEYCODE_VOLUME_MUTE';
          actualSteps = 1;
          break;
        default:
          throw new Error(`Unsupported volume action: ${action}`);
      }

      for (let i = 0; i < actualSteps; i++) {
        await execAsync(`adb -s ${deviceId} shell input keyevent ${keycode}`);
        if (actualSteps > 1) await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`🔊 [DeviceManager] Volume ${action} (${actualSteps} steps) on ${deviceId}`);
      return `Successfully adjusted volume: ${action} x${actualSteps}`;
    } catch (error) {
      logger.error(`❌ Failed to adjust volume on ${deviceId}:`, error);
      throw new Error(`Failed to adjust volume: ${error}`);
    }
  }

  /**
   * Navigation shortcuts
   */
  async navigateBack(deviceId: string): Promise<string> {
    return await this.pressKey(deviceId, 'KEYCODE_BACK');
  }

  async navigateHome(deviceId: string): Promise<string> {
    return await this.pressKey(deviceId, 'KEYCODE_HOME');
  }

  async openRecents(deviceId: string): Promise<string> {
    return await this.pressKey(deviceId, 'KEYCODE_APP_SWITCH');
  }

  /**
   * Clipboard operations
   */
  async setClipboard(deviceId: string, text: string): Promise<string> {
    try {
      // Escape special characters for shell
      const escapedText = text.replace(/'/g, "'\"'\"'");
      await execAsync(`adb -s ${deviceId} shell am broadcast -a clipper.set -e text '${escapedText}'`);
      logger.info(`📋 [DeviceManager] Set clipboard on ${deviceId}`);
      return `Successfully set clipboard content`;
    } catch (error) {
      logger.error(`❌ Failed to set clipboard on ${deviceId}:`, error);
      throw new Error(`Failed to set clipboard: ${error}`);
    }
  }

  async getClipboard(deviceId: string): Promise<string> {
    try {
      const result = await execAsync(`adb -s ${deviceId} shell am broadcast -a clipper.get`);
      const output = result.stdout || result;
      logger.info(`📋 [DeviceManager] Got clipboard from ${deviceId}`);
      return typeof output === 'string' ? output.trim() : '';
    } catch (error) {
      logger.error(`❌ Failed to get clipboard from ${deviceId}:`, error);
      return '';
    }
  }

  /**
   * Screen recording
   */
  async startScreenRecording(deviceId: string, outputPath: string, duration = 30): Promise<string> {
    try {
      const devicePath = `/sdcard/recording_${Date.now()}.mp4`;
      
      // Start recording in background
      void execAsync(`adb -s ${deviceId} shell screenrecord --time-limit ${duration} ${devicePath}`);
      
      // Wait for recording to complete
      await new Promise(resolve => setTimeout(resolve, duration * 1000 + 1000));
      
      // Pull recording to local
      await execAsync(`adb -s ${deviceId} pull ${devicePath} "${outputPath}"`);
      
      // Clean up device file
      await execAsync(`adb -s ${deviceId} shell rm ${devicePath}`);
      
      logger.info(`🎥 [DeviceManager] Screen recording saved to: ${outputPath}`);
      return `Successfully recorded screen to: ${outputPath}`;
    } catch (error) {
      logger.error(`❌ Failed to record screen on ${deviceId}:`, error);
      throw new Error(`Failed to record screen: ${error}`);
    }
  }

  /**
   * Wait/delay helper
   */
  async wait(seconds: number, reason = 'Generic wait'): Promise<string> {
    logger.info(`⏳ [DeviceManager] Waiting ${seconds}s: ${reason}`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    return `Waited ${seconds} seconds: ${reason}`;
  }

  /**
   * Enhanced text input with better emoji/special character support
   */
  async inputTextAdvanced(deviceId: string, text: string, method: 'standard' | 'ime' | 'clipboard' = 'standard'): Promise<string> {
    try {
      switch (method) {
        case 'clipboard':
          // Use clipboard for complex text
          await this.setClipboard(deviceId, text);
          await this.pressKey(deviceId, 'KEYCODE_PASTE');
          break;
        case 'ime':
          // Use IME for international characters
          await execAsync(`adb -s ${deviceId} shell ime set com.android.inputmethod.latin/.LatinIME`);
          await this.inputText(deviceId, text);
          break;
        case 'standard':
        default:
          return await this.inputText(deviceId, text);
      }
      
      logger.info(`⌨️ [DeviceManager] Advanced text input (${method}) "${text}" on ${deviceId}`);
      return `Successfully input text using ${method} method: '${text}'`;
    } catch (error) {
      logger.error(`❌ Failed advanced text input on ${deviceId}:`, error);
      throw new Error(`Failed advanced text input: ${error}`);
    }
  }

  getAsAiTools(deviceId: string): ToolSet {
    const tools: ToolSet = {
      launchApp: {
        description: 'Launch an application by package name',
        parameters: z.object({
          packageName: z.string().describe('The package name of the app to launch'),
          activityName: z.string().optional().describe('Optional specific activity to launch'),
        }),
        execute: async ({ packageName, activityName }) => {
          return await this.launchApp(deviceId, packageName, activityName);
        },
      },
      
      tapScreen: {
        description: 'Tap the screen at specified coordinates',
        parameters: z.object({
          x: z.number().describe('X coordinate to tap'),
          y: z.number().describe('Y coordinate to tap'),
        }),
        execute: async ({ x, y }) => {
          return await this.tapScreen(deviceId, x, y);
        },
      },
      
      swipeScreen: {
        description: 'Swipe from one point to another on the screen',
        parameters: z.object({
          x1: z.number().describe('Starting X coordinate'),
          y1: z.number().describe('Starting Y coordinate'),
          x2: z.number().describe('Ending X coordinate'),
          y2: z.number().describe('Ending Y coordinate'),
          durationMs: z.number().optional().default(300).describe('Duration of swipe in milliseconds'),
        }),
        execute: async ({ x1, y1, x2, y2, durationMs }) => {
          return await this.swipeScreen(deviceId, x1, y1, x2, y2, durationMs);
        },
      },
      
      terminateApp: {
        description: 'Terminate/force stop an application',
        parameters: z.object({
          packageName: z.string().describe('The package name of the app to terminate'),
        }),
        execute: async ({ packageName }) => {
          return await this.terminateApp(deviceId, packageName);
        },
      },
      
      getScreenSize: {
        description: 'Get the screen dimensions of the device',
        parameters: z.object({}),
        execute: async () => {
          return await this.getScreenSize(deviceId);
        },
      },
      
      pressKey: {
        description: 'Press a key using Android keycode (e.g., "back", "home", "enter", or keycode number)',
        parameters: z.object({
          keycode: z.string().describe('Key to press (common names like "back", "home" or keycode number as string)'),
        }),
        execute: async ({ keycode }) => {
          // Convert string numbers to actual numbers for the function
          const actualKeycode = isNaN(Number(keycode)) ? keycode : Number(keycode);
          return await this.pressKey(deviceId, actualKeycode);
        },
      },
      
      inputText: {
        description: 'Type text at the current focus position',
        parameters: z.object({
          text: z.string().describe('Text to input'),
        }),
        execute: async ({ text }) => {
          return await this.inputText(deviceId, text);
        },
      },
      
      scrollScreen: {
        description: 'Scroll the screen in a specified direction',
        parameters: z.object({
          direction: z.enum(['up', 'down', 'left', 'right']).describe('Direction to scroll'),
          distance: z.number().optional().default(500).describe('Distance to scroll in pixels'),
        }),
        execute: async ({ direction, distance }) => {
          return await this.scrollScreen(deviceId, direction, distance);
        },
      },

      // New tools
      setOrientation: {
        description: 'Set device screen orientation',
        parameters: z.object({
          orientation: z.enum(['portrait', 'landscape', 'auto']).describe('Orientation to set'),
        }),
        execute: async ({ orientation }) => {
          return await this.setOrientation(deviceId, orientation);
        },
      },

      setVolume: {
        description: 'Control device volume',
        parameters: z.object({
          action: z.enum(['up', 'down', 'mute']).describe('Volume action'),
          steps: z.number().optional().default(1).describe('Number of volume steps'),
        }),
        execute: async ({ action, steps }) => {
          return await this.setVolume(deviceId, action, steps);
        },
      },

      navigateBack: {
        description: 'Press the back button',
        parameters: z.object({}),
        execute: async () => {
          return await this.navigateBack(deviceId);
        },
      },

      navigateHome: {
        description: 'Press the home button',
        parameters: z.object({}),
        execute: async () => {
          return await this.navigateHome(deviceId);
        },
      },

      openRecents: {
        description: 'Open recent apps menu',
        parameters: z.object({}),
        execute: async () => {
          return await this.openRecents(deviceId);
        },
      },

      inputTextAdvanced: {
        description: 'Advanced text input with support for emojis and special characters',
        parameters: z.object({
          text: z.string().describe('Text to input'),
          method: z.enum(['standard', 'ime', 'clipboard']).optional().default('standard').describe('Input method to use'),
        }),
        execute: async ({ text, method }) => {
          return await this.inputTextAdvanced(deviceId, text, method);
        },
      },

      wait: {
        description: 'Wait for a specified number of seconds',
        parameters: z.object({
          seconds: z.number().min(0.1).max(30).describe('Seconds to wait'),
          reason: z.string().optional().default('Generic wait').describe('Reason for waiting'),
        }),
        execute: async ({ seconds, reason }) => {
          return await this.wait(seconds, reason);
        },
      },

      longPress: {
        description: 'Long press at specified coordinates',
        parameters: z.object({
          x: z.number().describe('X coordinate to long press'),
          y: z.number().describe('Y coordinate to long press'),
          durationMs: z.number().optional().default(1000).describe('Duration of long press in milliseconds'),
        }),
        execute: async ({ x, y, durationMs }) => {
          return await this.longPress(deviceId, x, y, durationMs);
        },
      },

      openUrl: {
        description: 'Open URL in default browser',
        parameters: z.object({
          url: z.string().describe('URL to open'),
        }),
        execute: async ({ url }) => {
          return await this.openUrl(deviceId, url);
        },
      },
    };
    
    return tools;
  }
} 