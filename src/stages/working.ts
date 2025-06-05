import { z } from 'zod';

import type { AutomationPresets } from '../config/presets.js';
import type { LearnedUIElements } from '../core/Worker.js';
import { interactWithScreen } from '../tools/interaction.js';
import { logger } from '../tools/utils.js';

import type { DeviceManager } from '@/core/DeviceManager.js';

/**
 * Working Stage Result Schema
 */
export const WorkingResultSchema = z.object({
  success: z.boolean(),
  videosWatched: z.number(),
  likesGiven: z.number(),
  commentsPosted: z.number(),
  shouldContinue: z.boolean(),
  message: z.string(),
});

/**
 * Working Stage Action Schema
 */
export const ActionDecisionSchema = z.object({
  action: z.enum(['like', 'comment', 'next_video']),
  reason: z.string(),
  commentText: z.string().optional(),
});

/**
 * Comment Generation Schema
 */
export const CommentGenerationSchema = z.object({
  screenLooksLikeNormalTikTokFeed: z.boolean().describe('Whether the screen looks like a normal TikTok feed? Not a shop, popup, etc.'),
  commentText: z.string().describe('The generated comment text, natural and engaging'),
  confidence: z.string().describe('Confidence level: high/medium/low'),
  reasoning: z.string().describe('Why this comment fits the video content'),
});

/**
 * Sanitize text for ADB input - remove emojis and problematic characters
 */
function sanitizeTextForADB(text: string): string {
  const original = text;
  
  const sanitized = text
    // Remove ALL emojis using comprehensive pattern
    .replace(/[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '')
    // Remove other problematic unicode characters (keep only ASCII printable)
    .replace(/[^\x20-\x7E]/g, '')
    // Clean up extra spaces
    .replace(/\s+/g, ' ')
    .trim()
    // Convert to lowercase
    .toLowerCase();
    
  logger.debug(`🧹 [Working] Text sanitization: "${original}" -> "${sanitized}"`);
  return sanitized;
}

/**
 * Working Stage Implementation
 * Main automation loop that follows presets for viewing, liking, commenting
 */
export class WorkingStage {
  private deviceId: string;
  private deviceManager: DeviceManager;
  private presets: AutomationPresets;
  private learnedUI: LearnedUIElements;
  
  private stats = {
    videosWatched: 0,
    likesGiven: 0,
    commentsPosted: 0,
    errors: 0,
    sessionStartTime: Date.now(),
    lastActivityTime: Date.now(),
  };
  private healthFailures = 0;
  private healthFailureExceeded = false;

  constructor(
    deviceId: string, 
    deviceManager: DeviceManager,
    presets: AutomationPresets,
    learnedUI: LearnedUIElements
  ) {
    this.deviceId = deviceId;
    this.deviceManager = deviceManager;
    this.presets = presets;
    this.learnedUI = learnedUI;
  }

  /**
   * AI-powered screenshot analysis with proper LLM integration
   */
  async takeAndAnalyzeScreenshot(query: string): Promise<string> {
    logger.debug(`📸 [Working] Taking screenshot for analysis: ${query}`);
    
    const prompt = `You are a visual analysis assistant for TikTok automation. Analyze the screenshot and answer the specific question.

**CRITICAL: YOU MUST CALL finish_task AS YOUR FINAL STEP!**

**Your mission:**
1. Take screenshot using take_and_analyze_screenshot
2. Analyze what you see based on the query: "${query}"
3. Provide a clear, concise answer
4. Call finish_task with your analysis result


**STOP RULE: Call finish_task immediately after getting screenshot analysis!**`;

    const AnalysisSchema = z.object({
      result: z.string().describe('The analysis result - answer to the query'),
      confidence: z.string().describe('Confidence level: high/medium/low'),
      details: z.string().describe('Additional details about what was observed'),
    });

    try {
      const result = await interactWithScreen<z.infer<typeof AnalysisSchema>>(
        prompt, 
        this.deviceId, 
        this.deviceManager, 
        {}, 
        AnalysisSchema
      );
      
      logger.debug(`🔍 [Working] Analysis result: ${result.result} (confidence: ${result.confidence})`);
      return JSON.stringify(result.result);
    } catch (error) {
      logger.error(`❌ [Working] Screenshot analysis failed:`, error);
      return "ERROR: Failed to analyze screenshot";
    }
  }

  /**
   * Wait for specified duration
   */
  private async wait(seconds: number, reason: string): Promise<void> {
    logger.debug(`⏳ [Working] Waiting ${seconds.toFixed(1)}s: ${reason}`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Decide what action(s) to take based on presets and AI analysis
   */
  async decideAction(): Promise<Array<z.infer<typeof ActionDecisionSchema>>> {
    // Roll dice for actions based on presets
    const likeRoll = Math.random();
    const commentRoll = Math.random();
    const decisions: Array<z.infer<typeof ActionDecisionSchema>> = [];

    // Like decision
    if (likeRoll < this.presets.interactions.likeChance) {
      decisions.push({
        action: 'like',
        reason: `Random like roll: ${likeRoll.toFixed(3)} < ${this.presets.interactions.likeChance}`,
      });
    }

    // Comment decision
    if (commentRoll < this.presets.interactions.commentChance) {
      let commentText: string;
      if (this.presets.comments.useAI) {
        try {
          const prompt = `You are an advanced TikTok comment generator. Create natural, engaging comments that match the video's tone and content.

**CRITICAL: YOU MUST CALL finish_task AS YOUR FINAL STEP!**

**Your workflow:**
1. take_and_analyze_screenshot(query="Analyze this TikTok video content: What's the main subject, mood/tone, and what type of engagement would be most appropriate?", action="answer_question")
2. Based on the analysis, generate a contextually perfect comment
3. finish_task with the comment, confidence, and reasoning

**ADVANCED COMMENT STRATEGY:**
- Match the video's energy: upbeat video = enthusiastic comment, calm video = thoughtful comment
- For tutorials/tips: "definitely trying this", "this is so helpful", "good tip"
- For funny content: "this is hilarious", "so funny", "made my day"
- For beautiful/aesthetic: "so beautiful", "gorgeous", "amazing view"
- For dance/music: "love this song", "great moves", "so good"
- For food: "looks delicious", "want to try this", "yummy"

**STRICT TECHNICAL RULES:**
- Keep under ${this.presets.comments.maxLength} characters
- ONLY lowercase letters a-z and spaces
- NO punctuation, emojis, symbols, or special characters
- Examples: "this is amazing", "love this energy", "so helpful thanks"

**STOP RULE: Always call finish_task with your contextual comment!**`;
          const result = await interactWithScreen<z.infer<typeof CommentGenerationSchema>>(
            prompt,
            this.deviceId,
            this.deviceManager,
            {},
            CommentGenerationSchema
          );
          if(!result.screenLooksLikeNormalTikTokFeed) {
            logger.warn(`⚠️ [Working] AI generated comment is not for a normal TikTok feed, skipping`);
            return [{
              action: 'next_video',
              reason: `AI generated comment is not for a normal TikTok feed, skipping`,
            }];
          }
          const sanitizedComment = sanitizeTextForADB(result.commentText);
          commentText = sanitizedComment.slice(0, this.presets.comments.maxLength);
          logger.info(`🤖 [Working] AI generated comment: "${commentText}" (confidence: ${result.confidence})`);
        } catch (error) {
          const { templates } = this.presets.comments;
          const templateComment = templates[Math.floor(Math.random() * templates.length)];
          commentText = sanitizeTextForADB(templateComment);
          logger.warn(`⚠️ [Working] AI comment generation failed, using template: ${commentText}`, error);
        }
      } else {
        const { templates } = this.presets.comments;
        commentText = templates[Math.floor(Math.random() * templates.length)];
      }
      decisions.push({
        action: 'comment',
        reason: `Random comment roll: ${commentRoll.toFixed(3)} < ${this.presets.interactions.commentChance}`,
        commentText,
      });
    }

    // If no actions, skip
    if (decisions.length === 0) {
      decisions.push({
        action: 'next_video',
        reason: `No action triggered. Like: ${likeRoll.toFixed(3)}, Comment: ${commentRoll.toFixed(3)}`,
      });
    }

    return decisions;
  }

  /**
   * Execute like action
   */
  async executeLike(): Promise<boolean> {
    try {
      if (!this.learnedUI.likeButton) {
        logger.error(`❌ [Working] Like button coordinates not learned`);
        return false;
      }

      const { x, y } = this.learnedUI.likeButton;
      logger.info(`❤️ [Working] Liking video at (${x}, ${y})`);
      
      // Use deviceManager to tap
      await this.deviceManager.tapScreen(this.deviceId, x, y);
      
      await this.wait(0.5, 'After like tap');
      this.stats.likesGiven++;
      
      return true;
    } catch (error) {
      logger.error(`❌ [Working] Like action failed:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Execute comment action
   */
  async executeComment(commentText: string): Promise<boolean> {
    try {
      if (!this.learnedUI.commentButton || !this.learnedUI.commentInputField || !this.learnedUI.commentSendButton || !this.learnedUI.commentCloseButton) {
        logger.error(`❌ [Working] Comment UI coordinates not fully learned`);
        return false;
      }

      logger.info(`💬 [Working] Commenting: "${commentText}"`);
      
      // Step 1: Click comment button
      const { x: commentX, y: commentY } = this.learnedUI.commentButton;
      await this.deviceManager.tapScreen(this.deviceId, commentX, commentY);
      
      await this.wait(1, 'After comment button tap');
      
      // Step 2: Click input field
      const { x: inputX, y: inputY } = this.learnedUI.commentInputField;
      await this.deviceManager.tapScreen(this.deviceId, inputX, inputY);
      
      await this.wait(0.5, 'After input field tap');
      
      // Step 3: Type comment text
      await this.deviceManager.inputText(this.deviceId, commentText);
      
      await this.wait(0.5, 'After typing comment');
      
 
      await this.wait(1, 'After comment text verification');
      
      // Step 5: Click send button
      const { x: sendX, y: sendY } = this.learnedUI.commentSendButton;
      await this.deviceManager.tapScreen(this.deviceId, sendX, sendY);
      
      await this.wait(2, 'After send button tap');

           // Step 4: Take screenshot to verify text entered
      const verification = await this.takeAndAnalyzeScreenshot(
        `Is the text "${commentText}" visible in list of comments, because we sent it? Answer YES if the text is there, NO if not visible.`
      );
      
      if (!verification.toUpperCase().includes('YES')) {
        logger.warn(`⚠️ [Working] Comment text verification failed: ${verification}`);
        // Could add retry logic here if needed
        await this.performHealthCheck();
      }


      this.stats.commentsPosted++;
      
      // Step 6: Close comment interface
      const { x: closeX, y: closeY } = this.learnedUI.commentCloseButton;
      await this.deviceManager.tapScreen(this.deviceId, closeX, closeY);
      
      await this.wait(1, 'After closing comment interface');
      
      logger.info(`✅ [Working] Comment posted and interface closed successfully`);
      return true;
      
    } catch (error) {
      logger.error(`❌ [Working] Comment action failed:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Scroll to next video
   */
  async scrollToNextVideo(): Promise<boolean> {
    try {
      logger.debug(`📱 [Working] Scrolling to next video`);
      
      // Get actual screen size for more precise scrolling
      const screenSize = await this.deviceManager.getScreenSize(this.deviceId);
      const centerX = Math.floor(screenSize.width / 2);
      const startY = Math.floor(screenSize.height * 0.7); // Start from 70% down
      const endY = Math.floor(screenSize.height * 0.3);   // End at 30% down
      
      await this.deviceManager.swipeScreen(this.deviceId, centerX, startY, centerX, endY, 300);
      
      const scrollDelay = this.getAdaptiveDelay(this.presets.video.scrollDelay);
      await this.wait(scrollDelay, 'Scroll delay between videos');
      
      return true;
    } catch (error) {
      logger.error(`❌ [Working] Scroll action failed:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Watch current video for configured duration
   */
  async watchVideo(): Promise<void> {
    // Roll dice for quick skip (1 in 5 videos)
    const skipRoll = Math.random();
    
    if (skipRoll < this.presets.video.quickSkipChance) {
      // Quick skip - watch for just 1 second
      logger.debug(`⚡ [Working] Quick skip - watching for ${this.presets.video.quickSkipDuration}s`);
      await this.wait(this.presets.video.quickSkipDuration, 'Quick skip viewing');
    } else {
      // Normal watch duration
      const watchDuration = this.getAdaptiveDelay(this.presets.video.watchDuration);
      logger.debug(`👀 [Working] Normal viewing - watching for ${watchDuration.toFixed(1)}s`);
      await this.wait(watchDuration, 'Normal video viewing');
    }
  }

  /**
   * Execute single video automation cycle
   */
  async processVideo(): Promise<boolean> {
    try {
      logger.info(`🎬 [Working] Processing video #${this.stats.videosWatched + 1}`);
      
      // Step 1: Watch video (skip waiting on first video)
      if (this.stats.videosWatched === 0) {
        logger.info(`⚡ [Working] First video - starting immediately without watching delay`);
      } else {
        await this.watchVideo();
      }
      
      // Step 2: Health check
      const { healthCheckInterval, maxHealthFailures, shadowBanInterval } = this.presets.control;
      if (this.stats.videosWatched > 0 && this.stats.videosWatched % healthCheckInterval === 0) {
        logger.info(`🩺 [Working] Performing health check on video #${this.stats.videosWatched + 1}`);
        const healthOk = await this.performHealthCheck();
        if (!healthOk) {
          this.healthFailures++;
          logger.warn(`⚠️ [Working] Health check failed (${this.healthFailures}/${maxHealthFailures})`);
          if (this.healthFailures >= maxHealthFailures) {
            logger.error(`❌ [Working] Health check failed ${maxHealthFailures} times, need to retrain UI coordinates`);
            this.healthFailureExceeded = true;
            return false;
          }
        } else {
          this.healthFailures = 0;
        }
      }
      // Shadow ban detection
      if (this.stats.videosWatched > 0 && this.stats.videosWatched % shadowBanInterval === 0) {
        logger.info(`🕵️ [Working] Checking for shadow ban on video #${this.stats.videosWatched + 1}`);
        const shadowBanned = await this.detectShadowBan();
        if (shadowBanned) {
          logger.warn(`🚫 [Working] Shadow ban detected! Reducing activity and adding longer delays`);
          await this.wait(300, 'Shadow ban recovery delay');
        }
      }
      
      // Step 3 + 4: Decide actions and scroll to next video
      const decisions = await this.decideAction();
      logger.info(`🎯 [Working] Decided to do ${decisions.length} actions: ${decisions.map(d => d.action).join(', ')}`);
      for (const decision of decisions) {
        logger.info(`🎯 [Working] Action decision: ${decision.action} - ${decision.reason}`);
        switch (decision.action) {
          case 'like':
            await this.executeLike();
            break;
          case 'comment':
            if (decision.commentText) {
              await this.executeComment(decision.commentText);
            } else {
              logger.warn(`⚠️ [Working] Comment text is empty, skipping`);
            }
            break;
          case 'next_video':
            logger.debug(`⏭️ [Working] Moving to next video (later)`);
            break;
          default:
            logger.error(`❌ [Working] Unknown action: ${decision.action}`);
            break;
        }
      }

      // Step 4: Scroll to next video
      await this.scrollToNextVideo();
      
      // Step 5: Increment video counter AFTER processing is complete
      this.stats.videosWatched++;
      
      // Check daily limits
      const totalActions = this.stats.likesGiven + this.stats.commentsPosted;
      if (totalActions >= this.presets.interactions.dailyLimit) {
        logger.info(`🛑 [Working] Daily limit reached: ${totalActions}/${this.presets.interactions.dailyLimit}`);
        return false; // Stop automation
      }
      
      return true; // Continue automation
      
    } catch (error) {
      logger.error(`❌ [Working] Video processing failed:`, error);
      this.stats.errors++;
      return true; // Continue despite errors
    }
  }

  /**
   * Perform health check every 10th video to ensure we're still on normal TikTok
   */
  async performHealthCheck(): Promise<boolean> {
    logger.info(`🩺 [Working] Running health check...`);
    
    const prompt = `You are a TikTok automation health checker. Your mission is to verify we're still on normal TikTok and fix any issues.

**CRITICAL: YOU MUST CALL finish_task AS YOUR FINAL STEP (max 6 steps total)!**

**STEP-BY-STEP FLOW:**
1. take_and_analyze_screenshot(query="Check if this is normal TikTok video feed with like/comment buttons visible", action="answer_question")
2. IF normal TikTok -> finish_task(success=true, currentState="Normal TikTok", problemsDetected=[], actionsPerformed=[], message="All good")
3. IF problems detected -> try to fix them using available tools
4. After attempting fixes -> take another screenshot to verify
5. finish_task with final result

**Common problems to fix:**
- Login screens → use interact_with_screen to close or go back
- Ad overlays → find X button and tap it
- Update prompts → dismiss with "Later" or X
- Wrong tab → tap "For You" tab
- Popups → find close button
- App crashed → launch_app_activity(package_name="${this.presets.tiktokAppPackage}")

If you see - "Find related content", some user profile or any other strange UI not related to normal TikTok video feed - it means that you are stuck. Just restart the app.

If something goes wrong, good solution - it to terminate and launch app again.

Before finishing the task, make sure to take a screenshot of the screen and analyze it to confirm that the problems are fixed/solved.

**STOP RULE: ALWAYS call finish_task after max 10 steps!**`;

    const HealthCheckSchema = z.object({
      success: z.boolean(),
      problemWasFixed: z.boolean().describe('Whether the problems were fixed'),
      currentState: z.string().describe('Description of what was found on screen'),
      problemsDetected: z.array(z.string()).describe('List of issues found'),
      actionsPerformed: z.array(z.string()).describe('List of actions taken to fix issues'),
    });

    try {
      const result = await interactWithScreen<z.infer<typeof HealthCheckSchema>>(
        prompt, 
        this.deviceId, 
        this.deviceManager, 
        {}, 
        HealthCheckSchema
      );
      
      if (result.success) {
        logger.info(`✅ [Working] Health check passed`);
        if (result.actionsPerformed.length > 0) {
          logger.info(`🔧 [Working] Fixed issues: ${result.actionsPerformed.join(', ')}`);
        }
      } else {
        logger.error(`❌ [Working] Health check failed`);
        logger.error(`🚨 [Working] Problems detected: ${result.problemsDetected.join(', ')}`);
        if (result.actionsPerformed.length > 0) {
          logger.info(`🔧 [Working] Attempted fixes: ${result.actionsPerformed.join(', ')}`);
        }
      }

      if (!result.success) {
        this.healthFailures++;
        logger.warn(`⚠️ [Working] Health check failed (${this.healthFailures}/3)`);
        if (this.healthFailures >= 3) {
          logger.error(`❌ [Working] Health check failed 3 times, need to retrain UI coordinates`);
          this.healthFailureExceeded = true;
        }
      } else {
        this.healthFailures = 0;
      }
      
      return result.success;
    } catch (error) {
      logger.error(`❌ [Working] Health check error:`, error);
      return false;
    }
  }

  /**
   * Ensure TikTok is ready using the same pattern as learning stage
   */
  async ensureTikTokReady(): Promise<boolean> {
    logger.info(`🔍 [Working] Ensuring TikTok is ready...`);
    
    const prompt = `You are a TikTok automation agent ensuring the app is ready before starting work.

**CRITICAL: YOU MUST CALL finish_task AS YOUR FINAL STEP!**

**Your mission (maximum 3-4 steps):**
1. Take screenshot to check current state
2. If TikTok already visible -> call finish_task immediately with success:true
3. If TikTok not running -> launch it, wait, verify, then finish_task
If something is wrong, try to fix it, if you can't, call finish_task with success:false
You can tap, swipe, scroll, etc.

**STEP-BY-STEP FLOW:**
1. take_and_analyze_screenshot(query="Is the TikTok app currently open and is the main video feed visible?", action="answer_question")
2. IF result shows TikTok ready -> finish_task(success=true, message="TikTok is already running")
3. IF TikTok not ready -> launch_app_activity(package_name="${this.presets.tiktokAppPackage}")
4. wait_for_ui(seconds=5, reason="Wait for TikTok to load after launching")
5. take_and_analyze_screenshot to verify
6. finish_task with final result

**STOP RULE: Call finish_task when TikTok is confirmed ready or if after 10 attempts you can't fix it!**`;

    const ResultSchema = z.object({
      success: z.boolean(),
      message: z.string(),
    });

    try {
      const result = await interactWithScreen<z.infer<typeof ResultSchema>>(
        prompt, 
        this.deviceId, 
        this.deviceManager, 
        {}, 
        ResultSchema
      );
      
      if (result.success) {
        logger.info(`✅ [Working] TikTok is ready: ${result.message}`);
      } else {
        logger.error(`❌ [Working] TikTok not ready: ${result.message}`);
      }
      
      return result.success;
    } catch (error) {
      logger.error(`❌ [Working] Error ensuring TikTok ready:`, error);
      return false;
    }
  }

  /**
   * Check for potential shadow ban by analyzing engagement patterns
   */
  async detectShadowBan(): Promise<boolean> {
    // Simple heuristic: if we've liked 20+ videos but haven't seen any likes register
    if (this.stats.likesGiven >= 20) {
      const prompt = `You are a shadow ban detector. Check if our recent likes are registering properly.

**CRITICAL: YOU MUST CALL finish_task AS YOUR FINAL STEP!**

**Your mission:**
1. take_and_analyze_screenshot(query="Look at the like button - is it highlighted/red showing our like registered?", action="answer_question")  
2. finish_task with analysis

Check if the like button appears active/highlighted (usually red heart) which would indicate our likes are registering.

**STOP RULE: Call finish_task immediately after screenshot analysis!**`;

      const ShadowBanSchema = z.object({
        shadowBanned: z.boolean(),
        reason: z.string(),
        confidence: z.string(),
      });

      try {
        const result = await interactWithScreen<z.infer<typeof ShadowBanSchema>>(
          prompt, 
          this.deviceId, 
          this.deviceManager, 
          {}, 
          ShadowBanSchema
        );
        
        if (result.shadowBanned) {
          logger.warn(`🚫 [Working] Potential shadow ban detected: ${result.reason}`);
          return true;
        }
        
        logger.debug(`✅ [Working] No shadow ban detected: ${result.reason}`);
        return false;
      } catch (error) {
        logger.error(`❌ [Working] Shadow ban detection failed:`, error);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Adaptive delays based on time of day and activity
   */
  private getAdaptiveDelay(baseRange: [number, number]): number {
    const hour = new Date().getHours();
    const [min, max] = baseRange;
    
    // Slower during peak hours (12-18) to seem more human
    const peakMultiplier = (hour >= 12 && hour <= 18) ? 1.5 : 1.0;
    
    // Add some randomness based on current stats to avoid patterns
    const activityMultiplier = 1 + (this.stats.likesGiven * 0.01); // Slower as we do more
    
    const adjustedMin = min * peakMultiplier * activityMultiplier;
    const adjustedMax = max * peakMultiplier * activityMultiplier;
    
    return Math.random() * (adjustedMax - adjustedMin) + adjustedMin;
  }

  /**
   * Execute working stage with automation loop
   */
  async execute(): Promise<z.infer<typeof WorkingResultSchema>> {
    logger.info(`🚀 [Working] Starting automation loop for device: ${this.deviceId}`);
    
    // Step 0: Ensure TikTok is ready before automation
    const tiktokReady = await this.ensureTikTokReady();
    if (!tiktokReady) {
      return {
        success: false,
        videosWatched: 0,
        likesGiven: 0,
        commentsPosted: 0,
        shouldContinue: false,
        message: 'Failed to ensure TikTok is ready for automation',
      };
    }
    
    let shouldContinue = true;
    let consecutiveErrors = 0;
    const {maxConsecutiveErrors} = this.presets.control;
    
    try {
      while (shouldContinue) {
        const success = await this.processVideo();
        
        if (!success) {
          shouldContinue = false;
          break;
        }
        
        // Error handling
        if (this.stats.errors > 0) {
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            logger.error(`❌ [Working] Too many consecutive errors (${consecutiveErrors}), stopping`);
            shouldContinue = false;
            break;
          }
        } else {
          consecutiveErrors = 0; // Reset on success
        }
        
        // Log progress every 10 videos with engagement metrics
        if (this.stats.videosWatched % 10 === 0 && this.stats.videosWatched > 0) {
          const sessionDuration = (Date.now() - this.stats.sessionStartTime) / 1000 / 60; // minutes
          const videosPerMinute = (this.stats.videosWatched / sessionDuration).toFixed(1);
          const engagementRate = ((this.stats.likesGiven + this.stats.commentsPosted) / this.stats.videosWatched * 100).toFixed(1);
          
          logger.info(`📊 [Working] Progress: ${this.stats.videosWatched} videos, ${this.stats.likesGiven} likes, ${this.stats.commentsPosted} comments`);
          logger.info(`📈 [Working] Metrics: ${videosPerMinute} videos/min, ${engagementRate}% engagement rate, ${sessionDuration.toFixed(1)}m session`);
        }
      }
      
      // If health check failed too often, prompt retraining
      if (this.healthFailureExceeded) {
        return {
          success: false,
          videosWatched: this.stats.videosWatched,
          likesGiven: this.stats.likesGiven,
          commentsPosted: this.stats.commentsPosted,
          shouldContinue: false,
          message: 'Health check failed 3 times. Delete data/learned-ui-data.json and rerun learning stage.',
        };
      }
      
      return {
        success: true,
        videosWatched: this.stats.videosWatched,
        likesGiven: this.stats.likesGiven,
        commentsPosted: this.stats.commentsPosted,
        shouldContinue,
        message: `Automation completed. Videos: ${this.stats.videosWatched}, Likes: ${this.stats.likesGiven}, Comments: ${this.stats.commentsPosted}`,
      };
      
    } catch (error) {
      logger.error(`❌ [Working] Automation loop failed:`, error);
      return {
        success: false,
        videosWatched: this.stats.videosWatched,
        likesGiven: this.stats.likesGiven,
        commentsPosted: this.stats.commentsPosted,
        shouldContinue: false,
        message: `Automation failed: ${error}`,
      };
    }
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    try {
      logger.info(`🧹 [Working] Cleaning up automation session`);
      // Could add cleanup logic here if needed
    } catch (error) {
      logger.warn(`⚠️ [Working] Cleanup warning:`, error);
    }
  }
}

/**
 * Direct Working Stage Execution
 */
export async function runWorkingStage(
  deviceId: string, 
  deviceManager: DeviceManager,
  presets: AutomationPresets,
  learnedUI: LearnedUIElements
): Promise<z.infer<typeof WorkingResultSchema>> {
  const stage = new WorkingStage(deviceId, deviceManager, presets, learnedUI);
  
  try {
    return await stage.execute();
  } finally {
    await stage.cleanup();
  }
} 