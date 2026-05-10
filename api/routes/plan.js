/**
 * API Routes for Planning Module
 * 
 * POST /api/agentfive/plan
 *   - Accepts a goal
 *   - Returns a plan with steps
 *   - Each step can be approved/rejected individually
 * 
 * POST /api/agentfive/plan/:planId/step/:stepId/approve
 *   - Approves a specific step
 * 
 * POST /api/agentfive/plan/:planId/step/:stepId/reject
 *   - Rejects a specific step
 * 
 * GET /api/agentfive/plan/:planId
 *   - Gets current plan status
 * 
 * POST /api/agentfive/plan/:planId/replan
 *   - Triggers replanning after a failure
 */

const express = require('express');
const { Planner } = require('../tools/planner');

const router = express.Router();

// Shared planner instance - in production, use persistent storage
const planner = new Planner();

/**
 * POST /api/agentfive/plan
 * Create a new plan from a goal
 */
router.post('/plan', (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({
        error: 'Goal is required and must be a string'
      });
    }

    const plan = planner.generatePlan(goal);

    res.status(201).json({
      success: true,
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create plan',
      message: error.message
    });
  }
});

/**
 * GET /api/agentfive/plan/:planId
 * Get plan status and steps
 */
router.get('/plan/:planId', (req, res) => {
  try {
    const { planId } = req.params;
    const plan = planner.getPlan(planId);

    if (!plan) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    res.json({
      success: true,
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve plan',
      message: error.message
    });
  }
});

/**
 * POST /api/agentfive/plan/:planId/step/:stepId/approve
 * Approve a specific step
 */
router.post('/plan/:planId/step/:stepId/approve', (req, res) => {
  try {
    const { planId, stepId } = req.params;
    
    const step = planner.approveStep(planId, stepId);
    
    if (!step) {
      return res.status(404).json({
        error: 'Plan or step not found'
      });
    }

    const plan = planner.getPlan(planId);

    res.json({
      success: true,
      message: `Step "${step.description}" approved`,
      step: {
        id: step.id,
        description: step.description,
        status: step.status,
        tool_needed: step.tool_needed
      },
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to approve step',
      message: error.message
    });
  }
});

/**
 * POST /api/agentfive/plan/:planId/step/:stepId/reject
 * Reject a specific step
 */
router.post('/plan/:planId/step/:stepId/reject', (req, res) => {
  try {
    const { planId, stepId } = req.params;
    const { reason } = req.body;
    
    const step = planner.rejectStep(planId, stepId, reason);
    
    if (!step) {
      return res.status(404).json({
        error: 'Plan or step not found'
      });
    }

    const plan = planner.getPlan(planId);

    res.json({
      success: true,
      message: `Step "${step.description}" rejected`,
      reason: reason || 'No reason provided',
      step: {
        id: step.id,
        description: step.description,
        status: step.status
      },
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to reject step',
      message: error.message
    });
  }
});

/**
 * POST /api/agentfive/plan/:planId/execute
 * Execute the next approved step
 */
router.post('/plan/:planId/execute', (req, res) => {
  try {
    const { planId } = req.params;
    const plan = planner.getPlan(planId);

    if (!plan) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    const nextStep = planner.getNextStep(planId);
    
    if (!nextStep) {
      return res.json({
        success: true,
        message: 'All steps completed',
        plan: planner.serializePlan(plan)
      });
    }

    if (nextStep.status !== 'approved') {
      return res.status(400).json({
        error: 'Next step requires approval before execution',
        step: {
          id: nextStep.id,
          description: nextStep.description,
          status: nextStep.status,
          approval_required: nextStep.approval_required
        }
      });
    }

    // Mark as executing
    planner.markExecuting(planId, nextStep.id);

    res.json({
      success: true,
      message: `Executing step: ${nextStep.description}`,
      step: {
        id: nextStep.id,
        description: nextStep.description,
        status: 'executing',
        tool_needed: nextStep.tool_needed
      },
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to execute step',
      message: error.message
    });
  }
});

/**
 * POST /api/agentfive/plan/:planId/step/:stepId/complete
 * Mark a step as completed (called by tool after execution)
 */
router.post('/plan/:planId/step/:stepId/complete', (req, res) => {
  try {
    const { planId, stepId } = req.params;
    const { result } = req.body;

    const step = planner.markCompleted(planId, stepId, result);

    if (!step) {
      return res.status(404).json({
        error: 'Plan or step not found'
      });
    }

    const plan = planner.getPlan(planId);

    res.json({
      success: true,
      message: `Step "${step.description}" completed`,
      result: result,
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to complete step',
      message: error.message
    });
  }
});

/**
 * POST /api/agentfive/plan/:planId/step/:stepId/fail
 * Mark a step as failed (called by tool on error)
 */
router.post('/api/agentfive/plan/:planId/step/:stepId/fail', (req, res) => {
  try {
    const { planId, stepId } = req.params;
    const { error } = req.body;

    const step = planner.markFailed(planId, stepId, error);

    if (!step) {
      return res.status(404).json({
        error: 'Plan or step not found'
      });
    }

    const plan = planner.getPlan(planId);

    res.json({
      success: false,
      message: `Step "${step.description}" failed`,
      error: error,
      plan: planner.serializePlan(plan)
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to mark step as failed',
      message: err.message
    });
  }
});

/**
 * POST /api/agentfive/plan/:planId/replan
 * Trigger replanning after failure
 */
router.post('/plan/:planId/replan', (req, res) => {
  try {
    const { planId } = req.params;
    const { context } = req.body;

    const plan = planner.replan(planId, context);

    if (!plan) {
      return res.status(404).json({
        error: 'Plan not found or no failed steps to replan'
      });
    }

    res.json({
      success: true,
      message: 'Replanning completed. Recovery steps added.',
      plan: planner.serializePlan(plan)
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to replan',
      message: error.message
    });
  }
});

/**
 * GET /api/agentfive/plans
 * List all plans
 */
router.get('/plans', (req, res) => {
  try {
    const plans = planner.getAllPlans().map(p => planner.serializePlan(p));
    
    res.json({
      success: true,
      plans
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to list plans',
      message: error.message
    });
  }
});

module.exports = router;
