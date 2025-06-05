import type { ToolSet } from 'ai';
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
  action: z.enum(['like', 'comment', 'skip', 'next_video']),
  reason: z.string(),
  commentText: z.string().optional(),
});

/**
 * Comment Generation Schema
 */
export const CommentGenerationSchema = z.object({
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
  private mcpTools: ToolSet;
  private presets: AutomationPresets;
  private learnedUI: LearnedUIElements;
  
  private stats = {
    videosWatched: 0,
    likesGiven: 0,
    commentsPosted: 0,
    errors: 0,
  };

  constructor(
    deviceId: string, 
    deviceManager: DeviceManager,
    mcpTools: ToolSet,
    presets: AutomationPresets,
    learnedUI: LearnedUIElements
  ) {
    this.deviceId = deviceId;
    this.deviceManager = deviceManager;
    this.mcpTools = mcpTools;
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
        this.mcpTools, 
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
   * Generate random delay based on presets
   */
  private getRandomDelay(range: [number, number]): number {
    const [min, max] = range;
    return Math.random() * (max - min) + min;
  }

  /**
   * Wait for specified duration
   */
  private async wait(seconds: number, reason: string): Promise<void> {
    logger.debug(`⏳ [Working] Waiting ${seconds.toFixed(1)}s: ${reason}`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Decide what action to take based on presets and AI analysis
   */
  async decideAction(): Promise<z.infer<typeof ActionDecisionSchema>> {
    // Roll dice for actions based on presets
    const likeRoll = Math.random();
    const commentRoll = Math.random();
    
    if (commentRoll < this.presets.interactions.commentChance) {
      // Generate comment with AI or use template
      let commentText: string;
      
      if (this.presets.comments.useAI) {
        try {
          const prompt = `You are a TikTok comment generator. Your mission is to create a natural, engaging comment for this video.

**CRITICAL: YOU MUST CALL finish_task AS YOUR FINAL STEP!**

**Your workflow:**
1. take_and_analyze_screenshot(query="Analyze this TikTok video content to understand what it's about - describe the main subject, activity, or theme", action="answer_question")
2. Based on the video analysis, generate an appropriate comment
3. finish_task with the comment, confidence, and reasoning

**STRICT COMMENT RULES - FOLLOW EXACTLY:**
- Keep it under ${this.presets.comments.maxLength} characters
- USE ONLY BASIC LETTERS AND SPACES - NO PUNCTUATION EXCEPT SPACES
- ABSOLUTELY NO EMOJIS, SYMBOLS, OR SPECIAL CHARACTERS
- ONLY lowercase letters a-z and spaces
- Examples: "this is amazing", "love this", "so good", "definitely trying this"
- DO NOT USE: ! ? . , : ; ' " & @ # $ % ^ * ( ) - + = [ ] { } | \\ / < > ~

**STOP RULE: Always call finish_task with your generated comment!**`;

          const result = await interactWithScreen<z.infer<typeof CommentGenerationSchema>>(
            prompt, 
            this.deviceId, 
            this.deviceManager, 
            this.mcpTools, 
            {}, 
            CommentGenerationSchema
          );
          
          // Sanitize the AI-generated comment text
          const sanitizedComment = sanitizeTextForADB(result.commentText);
          commentText = sanitizedComment.slice(0, this.presets.comments.maxLength);
          logger.info(`🤖 [Working] AI generated comment: "${commentText}" (confidence: ${result.confidence})`);
          
        } catch (error) {
          // Fallback to template if AI generation fails
          const {templates} = this.presets.comments;
          const templateComment = templates[Math.floor(Math.random() * templates.length)];
          commentText = sanitizeTextForADB(templateComment);
          logger.warn(`⚠️ [Working] AI comment generation failed, using template: ${commentText}`, error);
        }
      } else {
        // Use random template
        const {templates} = this.presets.comments;
        commentText = templates[Math.floor(Math.random() * templates.length)];
      }
      
      return {
        action: 'comment',
        reason: `Random comment roll: ${commentRoll.toFixed(3)} < ${this.presets.interactions.commentChance}`,
        commentText,
      };
    }
    
    if (likeRoll < this.presets.interactions.likeChance) {
      return {
        action: 'like',
        reason: `Random like roll: ${likeRoll.toFixed(3)} < ${this.presets.interactions.likeChance}`,
      };
    }
    
    return {
      action: 'skip',
      reason: `No action triggered. Like: ${likeRoll.toFixed(3)}, Comment: ${commentRoll.toFixed(3)}`,
    };
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
      
      const scrollDelay = this.getRandomDelay(this.presets.video.scrollDelay);
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
      const watchDuration = this.getRandomDelay(this.presets.video.watchDuration);
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
      
      // Step 2: Health check every 10th video (after first video)
      if (this.stats.videosWatched > 0 && this.stats.videosWatched % 10 === 0) {
        logger.info(`🩺 [Working] Performing health check on video #${this.stats.videosWatched + 1}`);
        const healthOk = await this.performHealthCheck();
        if (!healthOk) {
          logger.warn(`⚠️ [Working] Health check failed, but continuing automation`);
          // Continue anyway - the health check should have tried to fix issues
        }
      }
      
      // Step 3: Decide action
      const decision = await this.decideAction();
      logger.info(`🎯 [Working] Action decision: ${decision.action} - ${decision.reason}`);
      
      // Step 4: Execute action
      switch (decision.action) {
        case 'like':
          await this.executeLike();
          break;
          
        case 'comment':
          if (decision.commentText) {
            await this.executeComment(decision.commentText);
          }
          break;
          
        case 'skip':
          logger.debug(`⏭️ [Working] Skipping interaction on this video`);
          break;
        case 'next_video':
          logger.debug(`⏭️ [Working] Moving to next video`);
          break;
        default:
          logger.error(`❌ [Working] Unknown action: ${decision.action}`);
          break;
      }
      
      // Step 5: Move to next video
      await this.scrollToNextVideo();
      
      // Step 6: Increment video counter AFTER processing is complete
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
- App crashed → launch_app_activity("com.zhiliaoapp.musically")

Before finishing the task, make sure to take a screenshot of the screen and analyze it to confirm that the problems are fixed/solved.

**STOP RULE: ALWAYS call finish_task after max 10 steps!**`;

    const HealthCheckSchema = z.object({
      success: z.boolean(),
      currentState: z.string().describe('Description of what was found on screen'),
      problemsDetected: z.array(z.string()).describe('List of issues found'),
      actionsPerformed: z.array(z.string()).describe('List of actions taken to fix issues'),
      message: z.string(),
    });

    try {
      const result = await interactWithScreen<z.infer<typeof HealthCheckSchema>>(
        prompt, 
        this.deviceId, 
        this.deviceManager, 
        this.mcpTools, 
        {}, 
        HealthCheckSchema
      );
      
      if (result.success) {
        logger.info(`✅ [Working] Health check passed: ${result.message}`);
        if (result.actionsPerformed.length > 0) {
          logger.info(`🔧 [Working] Fixed issues: ${result.actionsPerformed.join(', ')}`);
        }
      } else {
        logger.error(`❌ [Working] Health check failed: ${result.message}`);
        logger.error(`🚨 [Working] Problems detected: ${result.problemsDetected.join(', ')}`);
        if (result.actionsPerformed.length > 0) {
          logger.info(`🔧 [Working] Attempted fixes: ${result.actionsPerformed.join(', ')}`);
        }
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
3. IF TikTok not ready -> launch_app_activity(package_name="com.zhiliaoapp.musically")
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
        this.mcpTools, 
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
    const maxConsecutiveErrors = 5;
    
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
        
        // Log progress every 10 videos
        if (this.stats.videosWatched % 10 === 0 && this.stats.videosWatched > 0) {
          logger.info(`📊 [Working] Progress: ${this.stats.videosWatched} videos, ${this.stats.likesGiven} likes, ${this.stats.commentsPosted} comments`);
        }
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
  mcpTools: ToolSet,
  presets: AutomationPresets,
  learnedUI: LearnedUIElements
): Promise<z.infer<typeof WorkingResultSchema>> {
  const stage = new WorkingStage(deviceId, deviceManager, mcpTools, presets, learnedUI);
  
  try {
    return await stage.execute();
  } finally {
    await stage.cleanup();
  }
} 