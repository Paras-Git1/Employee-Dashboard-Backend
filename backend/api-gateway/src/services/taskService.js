import { createCache } from './cache.js';
import { HttpError } from './errors.js';
import { compareTasks, scoreTask } from './scoring.js';

// taskKey is "<source>-<sourceId>", e.g. "helpdesk-T-204".
export function parseTaskKey(taskKey) {
  const dash = typeof taskKey === 'string' ? taskKey.indexOf('-') : -1;
  if (dash <= 0 || dash === taskKey.length - 1) return null;
  return { source: taskKey.slice(0, dash), sourceId: taskKey.slice(dash + 1) };
}

export function createTaskService({ sources, employeeRepo, events, cacheTtlMs = 0, now = () => Date.now(), logger = console }) {
  const cache = createCache({ ttlMs: cacheTtlMs });

  // Successful source responses are cached; failures are not, so a recovered source shows up on the next request.
  async function loadSource(source) {
    const cached = cache.get(source.name);
    if (cached) return cached;
    const records = await source.fetchRecords();
    const tasks = [];
    for (const record of records) {
      const task = source.normalize(record);
      if (task) tasks.push(task);
      else logger.warn(`[${source.name}] skipped malformed record:`, JSON.stringify(record));
    }
    cache.set(source.name, tasks);
    return tasks;
  }

  // Counts per source are taken before the source filter, so the sidebar can show both numbers.
  async function getTasks({ employeeId, status, source } = {}) {
    const [results, employees] = await Promise.all([
      Promise.allSettled(sources.map(loadSource)),
      employeeRepo.list(),
    ]);
    const byEmail = new Map(employees.map((e) => [e.email.toLowerCase(), e]));

    const errors = [];
    const sourceStatus = [];
    let tasks = [];
    results.forEach((result, i) => {
      const source = sources[i];
      if (result.status === 'fulfilled') {
        tasks.push(...result.value);
        sourceStatus.push({ source: source.name, label: source.label, ok: true });
      } else {
        const message = result.reason?.source ? result.reason.message : `${source.label} service failed`;
        logger.error(`[${source.name}] fetch failed: ${message}`, result.reason?.cause ?? result.reason);
        errors.push({ source: source.name, message });
        sourceStatus.push({ source: source.name, label: source.label, ok: false });
      }
    });

    const currentTime = now();
    tasks = tasks
      .map(({ employeeEmail, ...task }) => {
        const employee = byEmail.get(employeeEmail);
        return { ...task, employeeId: employee?.id ?? null, employeeName: employee?.name ?? null };
      })
      .filter((t) => employeeId == null || t.employeeId === employeeId)
      .filter((t) => status == null || t.status === status);
    const counts = Object.fromEntries(sources.map((s) => [s.name, tasks.filter((t) => t.source === s.name && t.status !== 'done').length]));
    tasks = tasks
      .filter((t) => source == null || t.source === source)
      .map((t) => scoreTask(t, currentTime))
      .sort(compareTasks);

    return {
      tasks,
      errors,
      sources: sourceStatus.map((s) => ({ ...s, openCount: counts[s.source] ?? 0 })),
      allFailed: errors.length === sources.length,
      generatedAt: new Date(currentTime).toISOString(),
    };
  }

  const sourceNamed = (name) => sources.find((s) => s.name === name);

  function present(task, employee, currentTime = now()) {
    const { employeeEmail, ...rest } = task;
    return scoreTask({ ...rest, employeeId: employee?.id ?? null, employeeName: employee?.name ?? null }, currentTime);
  }

  async function employeeFor(employeeId) {
    const employee = await employeeRepo.findById(employeeId);
    if (!employee) throw new HttpError(400, 'Selected employee does not exist.');
    return employee;
  }

  function sourceForKey(taskKey) {
    const parsed = parseTaskKey(taskKey);
    const source = parsed && sourceNamed(parsed.source);
    if (!source) throw new HttpError(404, 'Task not found.');
    return { source, sourceId: parsed.sourceId };
  }

  // Returns the unified task (with employeeId) for permission checks, or throws 404.
  async function getTask(taskKey) {
    const { source, sourceId } = sourceForKey(taskKey);
    const task = (await loadSource(source)).find((t) => t.sourceId === sourceId);
    if (!task) throw new HttpError(404, 'Task not found.');
    const employees = await employeeRepo.list();
    return present(task, employees.find((e) => e.email.toLowerCase() === task.employeeEmail));
  }

  // Tells connected dashboards what changed and who changed it.
  const publish = (type, task, actor, extra = {}) => events?.publish({ type, task, actorId: actor?.id ?? null, actorName: actor?.name ?? null, at: new Date(now()).toISOString(), ...extra });

  async function createTask({ source: sourceName, employeeId, ...fields }, actor) {
    const source = sourceNamed(sourceName);
    if (!source) throw new HttpError(400, `source must be one of ${sources.map((s) => s.name).join(', ')}`);
    const employee = await employeeFor(employeeId);
    const created = await source.create({ ...fields, employeeEmail: employee.email });
    cache.delete(source.name);
    const task = present(created, employee);
    publish('created', task, actor);
    return task;
  }

  async function updateTask(taskKey, { employeeId, ...fields }, actor) {
    const { source, sourceId } = sourceForKey(taskKey);
    const before = await getTask(taskKey).catch(() => null);
    const input = { ...fields };
    let employee;
    if (employeeId !== undefined) {
      employee = await employeeFor(employeeId);
      input.employeeEmail = employee.email;
    }
    const updated = await source.update(sourceId, input);
    cache.delete(source.name);
    if (!employee) employee = (await employeeRepo.list()).find((e) => e.email.toLowerCase() === updated.employeeEmail);
    const task = present(updated, employee);
    publish('updated', task, actor, {
      previousStatus: before?.status ?? null,
      previousEmployeeId: before && before.employeeId !== task.employeeId ? before.employeeId : null,
    });
    return task;
  }

  async function deleteTask(taskKey, actor) {
    const { source, sourceId } = sourceForKey(taskKey);
    const before = await getTask(taskKey).catch(() => null);
    await source.remove(sourceId);
    cache.delete(source.name);
    publish('deleted', before ?? { taskKey }, actor);
  }

  // HTML detail page from the source system, returned as { status, html }.
  async function fetchSourcePage(taskKey) {
    const { source, sourceId } = sourceForKey(taskKey);
    return source.fetchPage(sourceId);
  }

  return { getTasks, getTask, createTask, updateTask, deleteTask, fetchSourcePage, clearCache: () => cache.clear() };
}
