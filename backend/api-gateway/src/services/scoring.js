// Priority rules from section 6 of the requirements.
const HOUR = 60 * 60 * 1000;
export const CRM_DEFAULT_URGENCY_POINTS = 15;

export function deadlinePoints(deadline, now) {
  const msLeft = new Date(deadline).getTime() - now;
  if (msLeft < 0) return 50;
  if (msLeft <= 24 * HOUR) return 40;
  if (msLeft <= 3 * 24 * HOUR) return 25;
  if (msLeft <= 7 * 24 * HOUR) return 10;
  return 0;
}

// Helpdesk urgency 1-4 maps to 10-40. CRM tasks have no urgency (null) and get the default.
export function urgencyPoints(urgency) {
  return urgency == null ? CRM_DEFAULT_URGENCY_POINTS : urgency * 10;
}

export function priorityLabel(score) {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

// Completed work carries no deadline pressure, so a finished task that was
// late is not labelled critical. Done tasks are also sorted to the bottom.
export function scoreTask(task, now) {
  const deadline = task.status === 'done' ? 0 : deadlinePoints(task.deadline, now);
  const priorityScore = deadline + urgencyPoints(task.urgency);
  return { ...task, priorityScore, priorityLabel: priorityLabel(priorityScore) };
}

export function compareTasks(a, b) {
  const aDone = a.status === 'done';
  const bDone = b.status === 'done';
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  const byDeadline = new Date(a.deadline) - new Date(b.deadline);
  if (byDeadline !== 0) return byDeadline;
  return a.taskKey.localeCompare(b.taskKey);
}
