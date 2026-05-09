/**
 * Agent Five - AI Slides Generator Agent
 * 
 * Supports two modes:
 * 1. "chatting" - Conversational mode for Q&A and clarifications
 * 2. "planning" - Goal-driven mode with human-in-the-loop step approval
 */

const { Planner } = require('./tools/planner');

class AgentFive {
  constructor() {
    this.planner = new Planner();
    this.currentMode = 'chatting'; // 'chatting' | 'planning'
    this.activePlanId = null;
    this.conversationHistory = [];
  }

  /**
   * Process user message and determine mode
   */
  async processMessage(message, streamCallback) {
    // Check if this is a goal that should trigger planning
    if (Planner.isGoal(message) && this.currentMode === 'chatting') {
      this.currentMode = 'planning';
      return this._startPlanning(message, streamCallback);
    }

    // If we're in planning mode, handle plan-related interactions
    if (this.currentMode === 'planning' && this.activePlanId) {
      // Check if user wants to exit planning mode
      const exitCommands = ['exit', 'quit', 'cancel', 'stop', 'chat mode'];
      if (exitCommands.some(cmd => message.toLowerCase().includes(cmd))) {
        this.currentMode = 'chatting';
        this.activePlanId = null;
        return {
          type: 'mode_switch',
          mode: 'chatting',
          message: 'Switched back to chat mode. How can I help you?'
        };
      }

      // Handle approval/rejection responses
      if (message.toLowerCase().includes('approve') || message.toLowerCase().includes('yes')) {
        return this._handleApproval(message, streamCallback);
      }
      if (message.toLowerCase().includes('reject') || message.toLowerCase().includes('no')) {
        return this._handleRejection(message, streamCallback);
      }
    }

    // Default: chat mode
    return this._chat(message, streamCallback);
  }

  /**
   * Start planning mode for a goal
   */
  async _startPlanning(goal, streamCallback) {
    const plan = this.planner.generatePlan(goal);
    this.activePlanId = plan.id;

    // Stream the plan to the user
    const response = {
      type: 'plan_created',
      mode: 'planning',
      plan: this.planner.serializePlan(plan),
      message: `I've created a plan for: "${goal}"\n\n` +
        `This plan has ${plan.steps.length} steps. ` +
        `Each significant step requires your approval before execution.\n\n` +
        `Step 1: ${plan.steps[0].description}\n` +
        `Please approve or reject this step.`
    };

    if (streamCallback) {
      streamCallback(response);
    }

    return response;
  }

  /**
   * Handle step approval
   */
  async _handleApproval(message, streamCallback) {
    if (!this.activePlanId) {
      return { type: 'error', message: 'No active plan to approve.' };
    }

    const plan = this.planner.getPlan(this.activePlanId);
    if (!plan) {
      return { type: 'error', message: 'Plan not found.' };
    }

    // Find the next pending step
    const nextStep = this.planner.getNextStep(this.activePlanId);
    if (!nextStep) {
      // All steps completed
      this.currentMode = 'chatting';
      this.activePlanId = null;
      return {
        type: 'plan_completed',
        mode: 'chatting',
        message: 'All plan steps have been completed! Switching back to chat mode.'
      };
    }

    // Approve the step
    this.planner.approveStep(this.activePlanId, nextStep.id);

    // Execute the step
    const result = await this._executeStep(nextStep, streamCallback);

    // Check if there are more steps
    const followingStep = this.planner.getNextStep(this.activePlanId);
    
    const response = {
      type: 'step_executed',
      step: nextStep,
      result: result,
      nextStep: followingStep ? {
        id: followingStep.id,
        description: followingStep.description,
        approval_required: followingStep.approval_required
      } : null,
      message: result.message
    };

    if (streamCallback) {
      streamCallback(response);
    }

    return response;
  }

  /**
   * Handle step rejection
   */
  async _handleRejection(message, streamCallback) {
    if (!this.activePlanId) {
      return { type: 'error', message: 'No active plan to modify.' };
    }

    const plan = this.planner.getPlan(this.activePlanId);
    const nextStep = this.planner.getNextStep(this.activePlanId);
    
    if (nextStep) {
      this.planner.rejectStep(this.activePlanId, nextStep.id, 'User rejected');
    }

    const response = {
      type: 'step_rejected',
      step: nextStep,
      message: `Step rejected: "${nextStep?.description}". ` +
        'Would you like to replan, skip this step, or exit planning mode?'
    };

    if (streamCallback) {
      streamCallback(response);
    }

    return response;
  }

  /**
   * Execute a single step using the appropriate tool
   */
  async _executeStep(step, streamCallback) {
    this.planner.markExecuting(this.activePlanId, step.id);

    try {
      let result;

      switch (step.tool_needed) {
        case 'slide_generator':
          result = await this._executeSlideGenerator(step.params);
          break;
        case 'image_search':
          result = await this._executeImageSearch(step.params);
          break;
        case 'chat':
          result = await this._executeChat(step.params);
          break;
        case 'none':
        default:
          result = { success: true, message: 'Step acknowledged.', data: null };
          break;
      }

      this.planner.markCompleted(this.activePlanId, step.id, result);
      return result;

    } catch (error) {
      this.planner.markFailed(this.activePlanId, step.id, error.message);
      
      // Trigger replanning
      const replanned = this.planner.replan(this.activePlanId, error.message);
      
      return {
        success: false,
        message: `Step failed: ${error.message}. I've created a recovery plan. ` +
          `Next step: ${replanned.steps.find(s => s.status === 'pending')?.description || 'Review and retry'}`,
        error: error.message
      };
    }
  }

  /**
   * Execute slide generator tool
   */
  async _executeSlideGenerator(params) {
    // Placeholder: integrate with actual slide generation logic
    return {
      success: true,
      message: `Slide generation action "${params.action}" completed.`,
      data: { action: params.action, status: 'completed' }
    };
  }

  /**
   * Execute image search tool
   */
  async _executeImageSearch(params) {
    // Placeholder: integrate with actual image search logic
    return {
      success: true,
      message: 'Image search completed. Found relevant images.',
      data: { images: [], status: 'completed' }
    };
  }

  /**
   * Execute chat tool for fallback
   */
  async _executeChat(params) {
    return {
      success: true,
      message: `Processed: ${params.goal || params.action}`,
      data: { status: 'completed' }
    };
  }

  /**
   * Chat mode - simple conversational response
   */
  async _chat(message, streamCallback) {
    this.conversationHistory.push({ role: 'user', content: message });

    // Placeholder: integrate with actual chat/LLM logic
    const response = {
      type: 'chat_response',
      mode: 'chatting',
      message: `I received: "${message}". ` +
        'To start a planning session, try saying something like ' +
        '"Make a presentation about AI trends" or "Create slides about space exploration".',
      history: this.conversationHistory
    };

    this.conversationHistory.push({ role: 'assistant', content: response.message });

    if (streamCallback) {
      streamCallback(response);
    }

    return response;
  }

  /**
   * Get current plan status
   */
  getPlanStatus() {
    if (!this.activePlanId) {
      return { active: false, mode: this.currentMode };
    }
    const plan = this.planner.getPlan(this.activePlanId);
    return {
      active: true,
      mode: this.currentMode,
      plan: plan ? this.planner.serializePlan(plan) : null
    };
  }

  /**
   * Manually set mode (for testing or API control)
   */
  setMode(mode) {
    this.currentMode = mode;
    if (mode === 'chatting') {
      this.activePlanId = null;
    }
  }
}

module.exports = { AgentFive };
