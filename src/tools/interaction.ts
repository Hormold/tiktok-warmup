/* eslint-disable no-duplicate-imports */
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { ToolSet} from "ai";
import { generateObject, generateText, hasToolCall, stepCountIs } from "ai";
import { z } from "zod";

import { llm } from "./llm.js";
import { logger, uuidv4 } from "./utils.js";

import type { DeviceManager } from "@/core/DeviceManager.js";


/**
  * Convert normalized coordinates (0-1000) to pixel coordinates
  */
const convertToPixelCoordinates = (normalizedCoords: { y1: number, x1: number, y2: number, x2: number }, screenWidth: number, screenHeight: number) => {
  const { y1, x1, y2, x2 } = normalizedCoords;
  
  return {
    y1: Math.round((y1 / 1000) * screenHeight),
    x1: Math.round((x1 / 1000) * screenWidth),
    y2: Math.round((y2 / 1000) * screenHeight),
    x2: Math.round((x2 / 1000) * screenWidth),
    centerX: Math.round(((x1 + x2) / 2 / 1000) * screenWidth),
    centerY: Math.round(((y1 + y2) / 2 / 1000) * screenHeight)
  };
}

const analyzeScreenshot = async (taskId: string, screenshot: string, query: string) => {
  logger.info(`🔍 [Interacting#${taskId}] Analyzing screenshot: ${query}`);
  const result = await generateObject({
    model: llm,
    messages: [
      {
        role: 'system',
        content: `You are a visual LLM for object detection and spatial understanding. 
        You are analyzing a TikTok app screenshot to find UI elements and answer any question from orechstation LLM agent who will ask you to analyze the screenshot.
        `,
      },
      {
        role: 'user',
        content: [{
          type: 'text',
          text: query,
        },{
          type: 'image',
          image: `data:image/png;base64,${screenshot}`,
        }],
      },
    ],
    schema: z.object({
      result: z.string().describe('The result of the analysis, like "confirmed, object present" or "not found"'),
    }),
    schemaName: 'analysis_screenshot',
    schemaDescription: 'Analysis screenshot result',
  });

  const analysisResult = result.object;
  logger.info(`🔍 [Interacting#${taskId}] Analysis result:`, analysisResult);
  return analysisResult;
};

const findObject = async (taskId: string, deviceId: string, deviceManager: DeviceManager, screenshot: string, query: string) => {
    logger.info(`🔍 [Interacting#${taskId}] Finding object: ${query}`);
    
    // Get screen dimensions for coordinate conversion
    const capabilities = await deviceManager.getDeviceCapabilities(deviceId);
    const { width: screenWidth, height: screenHeight } = capabilities.screenResolution;
    
    const result = await generateObject({
      model: llm,
      messages: [
        {
          role: 'system',
          content: `
          You are a visual LLM for object detection and spatial understanding. 
          Return bounding box coordinates in format [y1, x1, y2, x2] normalized to 0-1000.
          Where y1,y2 are top/bottom coordinates and x1,x2 are left/right coordinates.
          
          You are analyzing a TikTok app screenshot to find UI elements.
          If object is found, return box_2d coordinates and descriptive label.
          If object is NOT found, set found=false and explain why in another_response field.
          `,
        },
        {
          role: 'user',
          content: [{
            type: 'text',
            text: query,
          },{
            type: 'image',
            image: `data:image/png;base64,${screenshot}`,
          }],
        },
      ],
      schema: z.object({
        found: z.boolean().describe('Whether the requested object was found'),
        box_2d: z.array(z.number()).length(4).describe('Bounding box coordinates [y1, x1, y2, x2] normalized to 0-1000, required if found=true'),
        label: z.string().describe('Descriptive label of the found object'),
        another_response: z.string().describe('Explanation if object not found or additional context').optional(),
      }),
      schemaName: 'detection_result',
      schemaDescription: 'Object detection result with normalized coordinates',
    });

    const detection = result.object;
    logger.info(`🔍 [Interacting#${taskId}] Detection result:`, detection);

    // Process and return structured result
    if (detection.found && detection.box_2d.length === 4) {
      const [y1, x1, y2, x2] = detection.box_2d;
      
      // Convert normalized coordinates to pixel coordinates
      const pixelCoords = convertToPixelCoordinates({ y1, x1, y2, x2 }, screenWidth, screenHeight);
      
      return {
        found: true,
        coordinates: {
          // Real pixel coordinates for clicking
          x: pixelCoords.centerX,
          y: pixelCoords.centerY
        },
        boundingBox: { 
          y1: pixelCoords.y1, 
          x1: pixelCoords.x1, 
          y2: pixelCoords.y2, 
          x2: pixelCoords.x2 
        }, // Pixel coordinates
        label: detection.label,
        message: `Found ${detection.label} at pixel coordinates (${pixelCoords.centerX}, ${pixelCoords.centerY})`
      };
    } else {
      logger.info(`🔍 [Interacting#${taskId}] Object not found: ${query}`);
      return {
        found: false,
        message: detection.another_response ?? `Object not found: ${query}`,
        suggestion: "Try taking another screenshot or look for similar UI elements",
        coordinates: null,
        boundingBox: null
      };
    }
  }

export async function interactWithScreen<T>(
  prompt: string,
  deviceId: string,
  deviceManager: DeviceManager,
  mcpTools: ToolSet,
  additionalTools: ToolSet,
  finalResultSchema: z.ZodSchema
): Promise<any> {
    const interactionTaskId = uuidv4();
    return new Promise((resolve, reject) => {
      generateText({
        model: llm,
        prompt,
        providerOptions: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        } satisfies GoogleGenerativeAIProviderOptions,
        stopWhen: [hasToolCall('finish_task'), stepCountIs(20)],
        
        tools: {
          ...mcpTools,

          take_and_analyze_screenshot: {
            description: 'Take a screenshot and ask Visual LLM to analyze it, like return coordinates of the UI element or something else. one task per screenshot. One object to find = one request',
            parameters: z.object({
              query: z.string().describe('The query to the LLM, like "find the like button" or "analyze the screenshot"'),
              action: z.enum(['answer_question', 'find_object']),
            }),
            execute: async ({ query, action }: { query: string, action: 'answer_question' | 'find_object' }) => {
              // Adb take screenshot by device id
              const screenshot = await deviceManager.takeScreenshot(deviceId);
              if(action === 'answer_question') {
                const analysisResult = await analyzeScreenshot(interactionTaskId, screenshot, query);
                return analysisResult;
              } else if(action === 'find_object') {
                const findResult = await findObject(interactionTaskId, deviceId, deviceManager, screenshot, query);
                return findResult;
              } else {
                logger.error(`[Interacting#${interactionTaskId}] Invalid action: ${action}`);
                throw new Error(`Invalid action: ${action}`);
              }
            },
          },
          
          wait_for_ui: {
            description: 'Wait for UI elements to load completely',
            parameters: z.object({
              seconds: z.number().min(1).max(10),
              reason: z.string(),
            }),
            execute: async ({ seconds, reason }: { seconds: number, reason: string }) => {
              logger.info(`⏳ [Learning#${interactionTaskId}] Waiting ${seconds}s for: ${reason}`);
              await new Promise(r => setTimeout(r, seconds * 1000));
              return { waited: true, seconds, reason };
            },
          },

          finish_task: {
            description: 'Finish task, this should be the last step ALWAYS if you are sure that you have completed the task. Stop execution after this, do not continue. Do not take any steps after this.',
            parameters: finalResultSchema,
            execute: async (finalResult: z.infer<typeof finalResultSchema>) => {
              logger.info(`🏁 [Interacting#${interactionTaskId}] Finished: ${finalResult}`);
              resolve(finalResult as unknown as T);
              return 'Ok. We done here. Stop execution, do not continue. Do not take any steps after this.'
            },
          },

          ...additionalTools,
        },
        onStepFinish: (result) => {
          logger.info(`🏁 [Interacting#${interactionTaskId}] Step finished`);
          if(result.toolCalls.length > 0) {
            logger.info(`[Interacting#${interactionTaskId}] Called tool: ${result.toolCalls[0].toolName} -> ${JSON.stringify(result.toolResults[0].result)}`);
          }
        },
      }).catch(reject);
    
    });
  }