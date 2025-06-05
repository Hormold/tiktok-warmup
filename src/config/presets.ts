/**
 * Automation presets and configuration
 */

export interface AutomationPresets {
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
}

/**
 * Default automation settings
 */
export const AUTOMATION_PRESETS: AutomationPresets = {
  video: {
    watchDuration: [5, 10],   // Watch 5-10 seconds normally
    quickSkipChance: 0.2,     // Skip quickly on 20% of videos (1 in 5)
    quickSkipDuration: 1,     // Watch only 1 second before skipping
    scrollDelay: [1, 3],      // Wait 1-3 seconds between videos
  },
  
  interactions: {
    likeChance: 0.7,          // Like 70% of videos
    commentChance: 0.1,       // Comment on 10% of videos
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
}; 