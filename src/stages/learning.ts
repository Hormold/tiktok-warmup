import type { ToolSet } from 'ai';
import { z } from 'zod';

import type { DeviceManager } from '@/core/DeviceManager.js';
import { interactWithScreen } from '@/tools/interaction.js';
/**
 * Learning Stage Result Schema
 */
const LearningResultSchema = z.object({
  success: z.boolean(),
  tiktokLaunched: z.boolean(),
  uiElementsFound: z.object({
    likeButton: z.object({
      found: z.boolean(),
      coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      boundingBox: z.object({ y1: z.number(), x1: z.number(), y2: z.number(), x2: z.number() }).optional(),
      confidence: z.number().optional(),
      label: z.string().optional(),
    }),
    commentButton: z.object({
      found: z.boolean(),
      coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      boundingBox: z.object({ y1: z.number(), x1: z.number(), y2: z.number(), x2: z.number() }).optional(),
      confidence: z.number().optional(),
      label: z.string().optional(),
    }),
    commentInputField: z.object({
      found: z.boolean(),
      coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      boundingBox: z.object({ y1: z.number(), x1: z.number(), y2: z.number(), x2: z.number() }).optional(),
      confidence: z.number().optional(),
      label: z.string().optional(),
    }),
    commentSendButton: z.object({
      found: z.boolean(),
      coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      boundingBox: z.object({ y1: z.number(), x1: z.number(), y2: z.number(), x2: z.number() }).optional(),
      confidence: z.number().optional(),
      label: z.string().optional(),
    }),
    commentCloseButton: z.object({
      found: z.boolean(),
      coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      boundingBox: z.object({ y1: z.number(), x1: z.number(), y2: z.number(), x2: z.number() }).optional(),
      confidence: z.number().optional(),
      label: z.string().optional(),
    }),
  }),
  nextStage: z.enum(['learning', 'working']),
  message: z.string(),
  stepsUsed: z.number(),
});

const prompt = `You are a TikTok automation agent in the LEARNING stage. Your mission:

    1. **FIRST**: Check device connection and launch TikTok app
    If not - find the app and launch it
    2. **THEN**: Take screenshots to analyze the TikTok interface
    3. **FIND**: Locate key UI elements and their exact coordinates:
      - Like button (heart icon, usually on right side)  
      - Comment button (speech bubble icon)
    4. **LEARN COMMENT FLOW**: Practice comment writing sequence:
      - Click comment button
      - Wait 1 second for comment UI to load  
      - Take screenshot to analyze comment interface
      - Find comment input field (text input area)
      - Find send button (usually red/colored button)
      - Test the full flow: click input → type test → find send button

    **IMPORTANT RULES:**
    - Use the provided MCP tools to interact with the phone
    - Take screenshots frequently to see current state. 
    - If TikTok is not open, launch it first using launch_app_activity
    - Be patient - wait for UI to load between actions
    - Try different approaches if first attempts fail
    - **MUST LEARN COMMENT FLOW**: Don't finish until you've found comment input and send button
    - Only return success:true when ALL UI elements are found including comment input and send button


    **Error Handling:**
    - If you can't reach the goal. Maybe some coordinates are wrong. Try to find the object again.

    ## Comment Learning Sequence:
    1. Click comment button → wait 1s → screenshot
    2. Find comment input field coordinates
    3. Click input field → wait 1s → type "Nice video 👍" (or any other realistic test comment)
    4. Take screenshot to confirm text entered
    5. Find red/colored send button coordinates
    6. Click send button to actually post the comment (complete the flow, not keyboard button, but the send button in TikTok UI)
    7. Wait 2s for comment to be posted
    8. Find close/back button to close comment interface (X button or back arrow)
    9. Test close button to return to main TikTok feed
    10. Save all coordinates for working stage

    ## How to finish the learning stage
    Run final function 'finish_task' with the result.
    Do not close keyboard using other tools. it should be automatically by submitting comment.

    - When you have found ALL UI elements (like, comment, input field, send button, close button), return success:true
    - If missing any UI elements, return success:false


    For screenshot, use take_and_analyze_screenshot tool. But use it only for one query per call. Like one for like button, one for comment button, one for input field, one for send button.
    Start by checking device connection and launching TikTok!`

/**
 * Learning Stage Implementation
 * Uses AI SDK generateObject with maxSteps to learn TikTok interface
 */
export class LearningStage {
  private deviceId: string;
  private mcpTools: ToolSet;
  private deviceManager: DeviceManager;

  constructor(deviceId: string, mcpTools: ToolSet, deviceManager: DeviceManager) {
    this.deviceId = deviceId;
    this.mcpTools = mcpTools;
    this.deviceManager = deviceManager;
  }
  
  /**
   * Execute learning stage with AI agent
   */
  async execute(): Promise<z.infer<typeof LearningResultSchema>> {
    console.log(`🧠 [Learning] Starting learning stage for device: ${this.deviceId}`);

    return await interactWithScreen<z.infer<typeof LearningResultSchema>>(prompt, this.deviceId, this.deviceManager, this.mcpTools, {}, LearningResultSchema);
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    try {
      //await phoneMCP.disconnect();
    } catch (error) {
      console.warn(`⚠️ [Learning] Cleanup warning:`, error);
    }
  }
}

/**
 * Direct Learning Stage Execution
 */
export async function runLearningStage(deviceId: string, mcpTools: ToolSet, deviceManager: DeviceManager): Promise<z.infer<typeof LearningResultSchema>> {
  const stage = new LearningStage(deviceId, mcpTools, deviceManager);
  
  try {
    return await stage.execute();
  } finally {
    await stage.cleanup();
  }
} 