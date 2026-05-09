# AI Slides Generator - Planning Module

## Overview

This directory contains a new planning module with human-in-the-loop approval for the AI Slides Generator. It introduces a structured planning mode where the agent breaks user goals into steps, each requiring explicit approval before execution.

## Files Created

### 1. `server/tools/planner.js` - Planning Module

Core planning logic that:
- Takes a user goal and generates a structured plan with ordered steps
- Each step has: `id`, `description`, `tool_needed`, `approval_required` (boolean)
- Steps with `approval_required=true` wait for user confirmation
- Executes steps sequentially
- Replans automatically if a step fails (inserts recovery steps)
- Detects whether a user message is a goal (triggers planning) or chat (stays in chat mode)

**Key Methods:**
- `generatePlan(goal)` - Creates a plan from a goal
- `approveStep(planId, stepId)` - Approves a step for execution
- `rejectStep(planId, stepId, reason)` - Rejects a step
- `markExecuting(planId, stepId)` - Marks step as running
- `markCompleted(planId, stepId, result)` - Marks step as done
- `markFailed(planId, stepId, error)` - Marks step failed, triggers replanning
- `replan(planId, context)` - Creates recovery steps after failure
- `getNextStep(planId)` - Gets the next actionable step
- `isGoal(message)` - Static method to detect goal vs chat

### 2. `server/agentFive.js` - Updated Agent

Agent Five now supports two modes:

**"planning" mode:**
- Triggered when user sends a goal (e.g., "Make a presentation about AI trends")
- Generates a plan via the planner module
- Streams plan steps to user with approval buttons
- Executes approved steps using existing tools
- Falls back to chat mode for clarifications or on `exit`/`cancel` commands

**"chatting" mode:**
- Default conversational mode
- Handles Q&A, greetings, and general chat
- Suggests how to trigger planning mode

**Key Methods:**
- `processMessage(message, streamCallback)` - Main entry point
- `_startPlanning(goal)` - Initiates planning mode
- `_handleApproval(message)` - Processes step approval
- `_handleRejection(message)` - Processes step rejection
- `_executeStep(step)` - Runs the tool for a step
- `_chat(message)` - Chat mode response
- `getPlanStatus()` - Returns current plan state

### 3. `server/routes/plan.js` - API Routes

New REST endpoints for plan management:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agentfive/plan` | Create a plan from a goal |
| GET | `/api/agentfive/plan/:planId` | Get plan status |
| POST | `/api/agentfive/plan/:planId/step/:stepId/approve` | Approve a step |
| POST | `/api/agentfive/plan/:planId/step/:stepId/reject` | Reject a step |
| POST | `/api/agentfive/plan/:planId/execute` | Execute next approved step |
| POST | `/api/agentfive/plan/:planId/step/:stepId/complete` | Mark step completed |
| POST | `/api/agentfive/plan/:planId/step/:stepId/fail` | Mark step failed |
| POST | `/api/agentfive/plan/:planId/replan` | Trigger replanning |
| GET | `/api/agentfive/plans` | List all plans |

### 4. `server/tools/planner.test.js` - Tests

32 tests covering:
- Plan generation from goals
- Step structure validation
- Approve/reject flow
- Execute/complete/fail lifecycle
- Replanning after failure
- Goal vs chat detection
- Plan serialization

Run tests: `node server/tools/planner.test.js`

## Human-in-the-Loop Design

The planning module preserves human control at every significant step:

1. **Goal Confirmation** - First step always asks user to confirm the goal
2. **Step Approval** - Each step with `approval_required=true` pauses for user
3. **Rejection Handling** - Rejected steps can be skipped or replanned
4. **Failure Recovery** - Failed steps trigger replanning with recovery steps
5. **Exit Anytime** - User can say "exit", "cancel", or "chat mode" to leave planning

## Integration Notes

To wire this into the existing AI Slides Generator:

1. **Import the planner in your main server file:**
   ```js
   const planRoutes = require('./routes/plan');
   app.use('/api/agentfive', planRoutes);
   ```

2. **Use AgentFive in your WebSocket or message handler:**
   ```js
   const { AgentFive } = require('./agentFive');
   const agent = new AgentFive();
   
   // In your message handler:
   const response = await agent.processMessage(userMessage, (streamData) => {
     // Send streamData to client via WebSocket/SSE
   });
   ```

3. **Client-side: render approval buttons** when `step.approval_required=true`

4. **Tool integration:** Replace placeholder methods in `agentFive.js`:
   - `_executeSlideGenerator()` - Wire to actual slide generation
   - `_executeImageSearch()` - Wire to image search service
   - `_chat()` - Wire to LLM/chat service
