/**
 * Automation presets and configuration
 */

export interface AutomationPresets {
  tiktokAppPackage: string;
  tiktokLoadTime: number;
  video: {
    watchDuration: [number, number]; // [min, max] seconds for normal viewing
    quickSkipChance: number;         // 0-1 probability to skip after 1 second
    quickSkipDuration: number;       // seconds to watch before quick skip
    scrollDelay: [number, number];   // [min, max] seconds
  };
  
  interactions: {
    likeChance: number;     // 0-1 probability
    commentChance: number;  // 0-1 probability
    dailyLimit: number;     // max actions per day
  };
  
  comments: {
    templates: string[];
    useAI: boolean;
    maxLength: number;
  };
  
  // Control settings for health checks, errors, and ban detection
  control: {
    healthCheckInterval: number;   // number of videos between health checks
    maxHealthFailures: number;     // max consecutive health check failures
    shadowBanInterval: number;     // number of videos between shadow ban checks
    maxConsecutiveErrors: number;  // max consecutive processing errors before stop
  };
}

/**
 * Default automation settings
 */
export const AUTOMATION_PRESETS: AutomationPresets = {
  tiktokAppPackage: 'com.zhiliaoapp.musically',
  tiktokLoadTime: 3,
  video: {
    watchDuration: [5, 10],   // Watch 5-10 seconds normally
    quickSkipChance: 0.2,     // Skip quickly on 20% of videos (1 in 5)
    quickSkipDuration: 1,     // Watch only 1 second before skipping
    scrollDelay: [1, 3],      // Wait 1-3 seconds between videos
  },
  
  interactions: {
    likeChance: 0.7,          // Like 70% of videos
    commentChance: 0.99,       // Comment on 10% of videos
    dailyLimit: 500,          // Max 500 actions per day
  },
  
  comments: {
    templates: [
      "amazing",
      "love this content",
      "so cool",
      "great video",
      "nice",
      "this is fire",
      "cant stop watching",
      "so good",
      "perfect",
      "love it",
      "this hits different",
      "absolutely love this",
      "so talented",
      "incredible",
      "this is everything",
    ],
    useAI: true,
    maxLength: 50,
  },
  
  control: {
    healthCheckInterval: 10, // Every 10 videos check screen if it is healthy and looks like TikTok feed
    maxHealthFailures: 3, // Max 3 health check failures before retraining UI coordinates
    shadowBanInterval: 50, // Every 50 videos check if the account is shadow banned
    maxConsecutiveErrors: 5, // Max 5 consecutive errors before stopping
  },
}; 