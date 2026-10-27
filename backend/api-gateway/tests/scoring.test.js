import { describe, expect, it } from 'vitest';
import { compareTasks, deadlinePoints, priorityLabel, scoreTask, urgencyPoints } from '../src/services/scoring.js';

const HOUR = 3600_000;
const NOW = Date.parse('2026-10-25T12:00:00Z');
const at = (hours) => new Date(NOW + hours * HOUR).toISOString();

describe('deadlinePoints', () => {
  it.each([
    ['overdue', -1, 50],
    ['due in 1 hour', 1, 40],
    ['due in exactly 24 hours', 24, 40],
    ['due in 25 hours', 25, 25],
    ['due in exactly 3 days', 72, 25],
    ['due in 4 days', 96, 10],
    ['due in exactly 7 days', 168, 10],
    ['due in 8 days', 192, 0],
  ])('%s → +%i', (_, hours, expected) => {
    expect(deadlinePoints(at(hours), NOW)).toBe(expected);
  });
});

describe('urgencyPoints', () => {
  it.each([[1, 10], [2, 20], [3, 30], [4, 40]])('helpdesk urgency %i → +%i', (u, expected) => {
    expect(urgencyPoints(u)).toBe(expected);
  });
  it('CRM tasks (no urgency) get the +15 default', () => {
    expect(urgencyPoints(null)).toBe(15);
  });
});

describe('priorityLabel', () => {
  it.each([[100, 'critical'], [70, 'critical'], [69, 'high'], [45, 'high'], [44, 'medium'], [25, 'medium'], [24, 'low'], [0, 'low']])(
    'score %i → %s', (score, label) => expect(priorityLabel(score)).toBe(label),
  );
});

describe('worked examples from the requirements', () => {
  it('helpdesk urgency 4 due in 12 hours = 80 critical', () => {
    expect(scoreTask({ status: 'open', urgency: 4, deadline: at(12) }, NOW)).toMatchObject({ priorityScore: 80, priorityLabel: 'critical' });
  });
  it('helpdesk urgency 3 overdue = 80 critical', () => {
    expect(scoreTask({ status: 'open', urgency: 3, deadline: at(-5) }, NOW)).toMatchObject({ priorityScore: 80, priorityLabel: 'critical' });
  });
  it('CRM overdue = 65 high', () => {
    expect(scoreTask({ status: 'open', urgency: null, deadline: at(-5) }, NOW)).toMatchObject({ priorityScore: 65, priorityLabel: 'high' });
  });
  it('CRM due in 5 days = 25 medium', () => {
    expect(scoreTask({ status: 'open', urgency: null, deadline: at(120) }, NOW)).toMatchObject({ priorityScore: 25, priorityLabel: 'medium' });
  });
  it('done tasks carry no deadline pressure', () => {
    expect(scoreTask({ status: 'done', urgency: 3, deadline: at(-5) }, NOW)).toMatchObject({ priorityScore: 30, priorityLabel: 'medium' });
  });
});

describe('compareTasks', () => {
  const t = (taskKey, priorityScore, hours, status = 'open') => ({ taskKey, priorityScore, deadline: at(hours), status });
  it('puts done last, then sorts by score desc, then earliest deadline', () => {
    const sorted = [t('a', 25, 10), t('b', 80, 5, 'done'), t('c', 65, 30), t('d', 65, 2), t('e', 80, 1)].sort(compareTasks);
    expect(sorted.map((x) => x.taskKey)).toEqual(['e', 'd', 'c', 'a', 'b']);
  });
});
