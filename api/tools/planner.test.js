/**
 * Tests for the Planning Module
 */

const { Planner } = require('./planner');

function runTests() {
  console.log('Running Planner tests...\n');
  
  const planner = new Planner();
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  PASS:', message);
      passed++;
    } else {
      console.log('  FAIL:', message);
      failed++;
    }
  }

  // Test 1: Generate plan
  console.log('Test 1: Generate plan from goal');
  const plan = planner.generatePlan('Make a presentation about AI trends');
  assert(plan.id.startsWith('plan_'), 'Plan has valid ID');
  assert(plan.goal === 'Make a presentation about AI trends', 'Plan stores goal');
  assert(plan.steps.length > 0, 'Plan has steps');
  assert(plan.status === 'draft', 'Plan starts as draft');

  // Test 2: Step structure
  console.log('\nTest 2: Step structure');
  const firstStep = plan.steps[0];
  assert(firstStep.id, 'Step has ID');
  assert(firstStep.description, 'Step has description');
  assert(firstStep.tool_needed, 'Step has tool_needed');
  assert(typeof firstStep.approval_required === 'boolean', 'Step has approval_required boolean');
  assert(firstStep.status === 'pending', 'Step starts as pending');

  // Test 3: Approve step
  console.log('\nTest 3: Approve step');
  const approvedStep = planner.approveStep(plan.id, firstStep.id);
  assert(approvedStep !== null, 'Approve returns step');
  assert(approvedStep.status === 'approved', 'Step status becomes approved');

  // Test 4: Reject step
  console.log('\nTest 4: Reject step');
  const secondStep = plan.steps[1];
  const rejectedStep = planner.rejectStep(plan.id, secondStep.id, 'Not needed');
  assert(rejectedStep !== null, 'Reject returns step');
  assert(rejectedStep.status === 'rejected', 'Step status becomes rejected');
  assert(rejectedStep.error === 'Not needed', 'Rejection reason stored');

  // Test 5: Mark executing and completed
  console.log('\nTest 5: Execute and complete step');
  planner.markExecuting(plan.id, firstStep.id);
  const executingStep = plan.steps.find(s => s.id === firstStep.id);
  assert(executingStep.status === 'executing', 'Step marked executing');
  
  planner.markCompleted(plan.id, firstStep.id, { slides: 5 });
  const completedStep = plan.steps.find(s => s.id === firstStep.id);
  assert(completedStep.status === 'completed', 'Step marked completed');
  assert(completedStep.result.slides === 5, 'Result stored');

  // Test 6: Get next step
  console.log('\nTest 6: Get next step');
  const nextStep = planner.getNextStep(plan.id);
  // Should skip approved/completed and rejected steps
  const pendingSteps = plan.steps.filter(s => s.status === 'pending');
  assert(nextStep === pendingSteps[0] || !nextStep, 'Returns next pending step');

  // Test 7: Mark failed and replan
  console.log('\nTest 7: Fail and replan');
  if (nextStep) {
    planner.markFailed(plan.id, nextStep.id, 'API error');
    const failedStep = plan.steps.find(s => s.id === nextStep.id);
    assert(failedStep.status === 'failed', 'Step marked failed');
    assert(failedStep.error === 'API error', 'Error stored');

    const replanned = planner.replan(plan.id, 'Service unavailable');
    assert(replanned !== null, 'Replan returns plan');
    const recoveryStepsCount = replanned.steps.filter(s => s.id.includes('recovery') || s.id.includes('retry')).length;
    assert(recoveryStepsCount >= 2, 'Recovery steps added');
  }

  // Test 8: isGoal detection
  console.log('\nTest 8: Goal detection');
  assert(Planner.isGoal('Make a presentation about space'), 'Detects presentation goal');
  assert(Planner.isGoal('Create slides about AI'), 'Detects slides goal');
  assert(Planner.isGoal('Build a deck for my meeting'), 'Detects deck goal');
  assert(!Planner.isGoal('Hello, how are you?'), 'Rejects greeting');
  assert(!Planner.isGoal('What is AI?'), 'Rejects question');
  assert(!Planner.isGoal('Thanks for the help'), 'Rejects thanks');

  // Test 9: Serialization
  console.log('\nTest 9: Plan serialization');
  const serialized = planner.serializePlan(plan);
  assert(serialized.id === plan.id, 'Serialized has ID');
  assert(Array.isArray(serialized.steps), 'Serialized has steps array');
  assert(serialized.total_steps === plan.steps.length, 'Serialized has total_steps');
  assert(!serialized.steps[0].params, 'Params excluded from serialization');

  console.log(`\n--- Results ---`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  return failed === 0;
}

if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };
