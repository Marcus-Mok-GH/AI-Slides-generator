/**
 * Planning Module for AI Slides Generator
 * 
 * Implements a human-in-the-loop planning system where:
 * - User goals are broken into structured steps
 * - Each step specifies what tool is needed
 * - Steps requiring user confirmation set approval_required=true
 * - Steps execute sequentially
 * - Failed steps trigger replanning
 */

/**
 * @typedef {Object} PlanStep
 * @property {string} id - Unique identifier for the step
 * @property {string} description - Human-readable description of what this step does
 * @property {string} tool_needed - Name of the tool to execute (e.g., 'slide_generator', 'image_search', 'none')
 * @property {boolean} approval_required - Whether user must approve before execution
 * @property {Object} [params] - Parameters to pass to the tool
 * @property {string} [status] - Current status: 'pending', 'approved', 'rejected', 'executing', 'completed', 'failed'
 * @property {string} [result] - Result/output from execution
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} Plan
 * @property {string} id - Unique plan identifier
 * @property {string} goal - Original user goal
 * @property {PlanStep[]} steps - Ordered list of steps
 * @property {string} status - 'draft', 'in_progress', 'completed', 'failed'
 * @property {number} current_step_index - Index of the next step to execute
 * @property {Date} created_at
 * @property {Date} updated_at
 */

class Planner {
  constructor() {
    this.plans = new Map();
    this.planCounter = 0;
  }

  /**
   * Generate a plan from a user goal
   * @param {string} goal - User's goal (e.g., "Make a presentation about AI trends")
   * @returns {Plan} - Generated plan with steps
   */
  generatePlan(goal) {
    const planId = `plan_${++this.planCounter}`;
    const steps = this._breakIntoSteps(goal);
    
    const plan = {
      id: planId,
      goal,
      steps,
      status: 'draft',
      current_step_index: 0,
      created_at: new Date(),
      updated_at: new Date()
    };

    this.plans.set(planId, plan);
    return plan;
  }

  /**
   * Break a goal into structured steps
   * This is the core planning logic - can be extended with LLM calls
   * @private
   */
  _breakIntoSteps(goal) {
    const lowerGoal = goal.toLowerCase();
    
    // Detect intent from goal
    const isPresentation = lowerGoal.includes('presentation') || 
                          lowerGoal.includes('slides') || 
                          lowerGoal.includes('deck');
    const isResearch = lowerGoal.includes('research') || 
                      lowerGoal.includes('find') || 
                      lowerGoal.includes('search');
    const isImageSearch = lowerGoal.includes('image') || 
                         lowerGoal.includes('picture') || 
                         lowerGoal.includes('photo');

    const steps = [];
    let stepId = 0;

    // Step 1: Always clarify/confirm the goal with user
    steps.push({
      id: `step_${++stepId}`,
      description: `Confirm goal: "${goal}" - I'll create a plan to achieve this. Does this sound right?`,
      tool_needed: 'none',
      approval_required: true,
      params: { action: 'confirm_goal', goal },
      status: 'pending'
    });

    if (isPresentation || isResearch || lowerGoal.includes('about')) {
      // Step 2: Research/outline the topic
      steps.push({
        id: `step_${++stepId}`,
        description: 'Research the topic and generate an outline for the presentation',
        tool_needed: 'slide_generator',
        approval_required: true,
        params: { action: 'generate_outline', topic: goal },
        status: 'pending'
      });

      // Step 3: Generate slide content
      steps.push({
        id: `step_${++stepId}`,
        description: 'Generate detailed slide content based on the approved outline',
        tool_needed: 'slide_generator',
        approval_required: true,
        params: { action: 'generate_slides' },
        status: 'pending'
      });

      // Step 4: Search for images if needed
      if (isImageSearch || lowerGoal.includes('visual')) {
        steps.push({
          id: `step_${++stepId}`,
          description: 'Search for relevant images to enhance the slides',
          tool_needed: 'image_search',
          approval_required: true,
          params: { action: 'search_images' },
          status: 'pending'
        });
      }

      // Step 5: Final review
      steps.push({
        id: `step_${++stepId}`,
        description: 'Review the complete presentation and make any final adjustments',
        tool_needed: 'slide_generator',
        approval_required: true,
        params: { action: 'finalize' },
        status: 'pending'
      });
    } else {
      // Generic fallback for unrecognized goals
      steps.push({
        id: `step_${++stepId}`,
        description: `Process request: ${goal}`,
        tool_needed: 'chat',
        approval_required: true,
        params: { action: 'process', goal },
        status: 'pending'
      });
    }

    return steps;
  }

  /**
   * Get a plan by ID
   */
  getPlan(planId) {
    return this.plans.get(planId);
  }

  /**
   * Approve a specific step
   * @param {string} planId
   * @param {string} stepId
   * @returns {PlanStep|null} - The approved step or null if not found
   */
  approveStep(planId, stepId) {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) return null;

    step.status = 'approved';
    plan.updated_at = new Date();
    return step;
  }

  /**
   * Reject a specific step
   * @param {string} planId
   * @param {string} stepId
   * @param {string} [reason] - Why the step was rejected
   * @returns {PlanStep|null} - The rejected step or null if not found
   */
  rejectStep(planId, stepId, reason = '') {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) return null;

    step.status = 'rejected';
    step.error = reason;
    plan.updated_at = new Date();
    return step;
  }

  /**
   * Mark a step as executing
   */
  markExecuting(planId, stepId) {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const step = plan.steps.find(s => s.id === stepId);
    if (step) {
      step.status = 'executing';
      plan.status = 'in_progress';
      plan.updated_at = new Date();
    }
    return step;
  }

  /**
   * Mark a step as completed with result
   */
  markCompleted(planId, stepId, result) {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const step = plan.steps.find(s => s.id === stepId);
    if (step) {
      step.status = 'completed';
      step.result = result;
      plan.current_step_index++;
      plan.updated_at = new Date();
      
      // Check if all steps are done
      if (plan.current_step_index >= plan.steps.length) {
        plan.status = 'completed';
      }
    }
    return step;
  }

  /**
   * Mark a step as failed and trigger replanning
   */
  markFailed(planId, stepId, error) {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const step = plan.steps.find(s => s.id === stepId);
    if (step) {
      step.status = 'failed';
      step.error = error;
      plan.status = 'failed';
      plan.updated_at = new Date();
    }
    return step;
  }

  /**
   * Replan from a failed step
   * Creates a new plan that addresses the failure
   */
  replan(planId, failureContext = '') {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    // Find the failed step
    const failedStepIndex = plan.steps.findIndex(s => s.status === 'failed');
    if (failedStepIndex === -1) return plan;

    const failedStep = plan.steps[failedStepIndex];

    // Insert recovery steps after the failed step
    const recoverySteps = [
      {
        id: `step_recovery_${Date.now()}`,
        description: `Replanning: Address failure - ${failureContext || failedStep.error || 'Step failed'}`,
        tool_needed: 'none',
        approval_required: true,
        params: { action: 'replan', original_step: failedStep.id, context: failureContext },
        status: 'pending'
      },
      {
        id: `step_retry_${Date.now()}`,
        description: `Retry: ${failedStep.description}`,
        tool_needed: failedStep.tool_needed,
        approval_required: true,
        params: failedStep.params,
        status: 'pending'
      }
    ];

    // Insert recovery steps at the failed position
    plan.steps.splice(failedStepIndex + 1, 0, ...recoverySteps);
    
    // Reset the failed step to pending for retry
    failedStep.status = 'pending';
    delete failedStep.error;
    
    plan.status = 'in_progress';
    plan.updated_at = new Date();

    return plan;
  }

  /**
   * Get the next step that needs action
   * Returns the next pending/approved step
   */
  getNextStep(planId) {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    return plan.steps.find(s => 
      s.status === 'pending' || s.status === 'approved'
    );
  }

  /**
   * Get all plans
   */
  getAllPlans() {
    return Array.from(this.plans.values());
  }

  /**
   * Check if a goal should trigger planning mode
   * Goals are typically imperative sentences with clear objectives
   */
  static isGoal(message) {
    const lower = message.toLowerCase().trim();
    
    // Keywords that indicate a goal/planning request
    const goalIndicators = [
      'make', 'create', 'generate', 'build', 'design',
      'presentation', 'slides', 'deck', 'slide',
      'research', 'find', 'search for'
    ];

    // Exclude obvious chat patterns
    const chatIndicators = [
      'hello', 'hi', 'hey', 'how are you', 'what\'s up',
      'thanks', 'thank you', 'bye', 'goodbye',
      'what is', 'how do', 'can you explain',
      '?', 'help me understand'
    ];

    const isChat = chatIndicators.some(ind => lower.includes(ind));
    const isGoal = goalIndicators.some(ind => lower.includes(ind));

    // If it looks like a goal and not like chat, trigger planning
    return isGoal && !isChat;
  }

  /**
   * Serialize plan for API response
   */
  serializePlan(plan) {
    return {
      id: plan.id,
      goal: plan.goal,
      status: plan.status,
      current_step_index: plan.current_step_index,
      total_steps: plan.steps.length,
      steps: plan.steps.map(s => ({
        id: s.id,
        description: s.description,
        tool_needed: s.tool_needed,
        approval_required: s.approval_required,
        status: s.status,
        result: s.result,
        error: s.error
      })),
      created_at: plan.created_at,
      updated_at: plan.updated_at
    };
  }
}

module.exports = { Planner };
