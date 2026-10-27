// Human-facing detail page (the target of "Open in Helpdesk" links on the dashboard).
// Styled to match the Employee Hub dashboard, with this system's own accent colour.
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const URGENCY = { 1: 'Low', 2: 'Normal', 3: 'High', 4: 'Urgent' };
const STATUS = { new: { label: 'New', tone: 'open' }, open: { label: 'Open', tone: 'open' }, pending: { label: 'Pending', tone: 'in_progress' }, solved: { label: 'Solved', tone: 'done' } };
const fullDate = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

function dueText(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms < 0) return { text: 'Overdue', tone: 'red' };
  if (ms < 24 * 3600_000) return { text: 'Due within 24 hours', tone: 'blue' };
  return { text: `Due in ${Math.ceil(ms / (24 * 3600_000))} days`, tone: 'gray' };
}

const page = (title, body, dashboardUrl) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Helpdesk</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--accent:#15803d;--accent-50:#e6f6ee;--ink:#1c2130;--ink-700:#3d4455;--muted:#6b7385;--line:#e8e9ee;--soft:#f7f8fa;
    --red:#d32f2f;--red-50:#fdecec;--blue:#2563eb;--blue-50:#e5f0ff;--amber:#c27a00;--amber-50:#fff6e0;--green:#15803d;--green-50:#e6f6ee;--gray:#555d6e;--gray-50:#f1f2f5}
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.5}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:17px}
  .logo{width:36px;height:36px;border-radius:10px;background:var(--accent-50);color:var(--accent);display:grid;place-items:center}
  .brand small{display:block;font-weight:400;font-size:12.5px;color:var(--muted)}
  a.back{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border:1px solid #d9dbe3;border-radius:10px;color:var(--ink-700);text-decoration:none;font-weight:500;font-size:14px}
  a.back:hover{background:var(--soft)}
  a:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(242,84,27,.35)}
  main{max-width:720px;margin:32px auto;padding:0 16px}
  .card{border:1px solid var(--line);border-radius:22px;padding:28px;box-shadow:0 1px 2px rgba(28,33,48,.04),0 2px 8px rgba(28,33,48,.04)}
  .pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
  .pill{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:500}
  .pill-accent{background:var(--accent-50);color:var(--accent)}
  .pill-red{background:var(--red-50);color:var(--red)}.pill-blue{background:var(--blue-50);color:var(--blue)}.pill-gray{background:var(--gray-50);color:var(--gray)}
  .pill-open{background:var(--blue-50);color:var(--blue)}.pill-in_progress{background:var(--amber-50);color:var(--amber)}.pill-done{background:var(--green-50);color:var(--green)}
  h1{margin:0 0 6px;font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.25;overflow-wrap:anywhere}
  .sub{margin:0 0 24px;color:var(--muted)}
  dl{margin:0;padding:4px 18px;border:1px solid var(--line);border-radius:16px}
  dl div{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
  dl div:last-child{border-bottom:0}
  dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--soft);padding:1px 6px;border-radius:6px}
  .note{margin-top:20px;font-size:13px;color:var(--muted)}
  .empty{text-align:center;padding:48px 16px}
  @media (max-width:560px){header{padding:12px 16px}.card{padding:20px 16px}h1{font-size:22px}dl div{grid-template-columns:110px 1fr}a.back span{display:none}}
</style></head>
<body>
<header>
  <div class="brand"><span class="logo" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg></span><span>Helpdesk<small>Support issues &amp; tickets</small></span></div>
  <a class="back" href="${escapeHtml(dashboardUrl)}">&larr; <span>Back to Employee Hub</span></a>
</header>
<main>${body}</main>
</body></html>`;

export function detailPage(record, { dashboardUrl }) {
  const r = { id: record.ticket_id, title: record.title, deadline: record.sla_due_at, status: record.state, done: record.state === 'solved' };
  const status = STATUS[r.status] ?? { label: r.status, tone: 'gray' };
  const due = dueText(r.deadline);
  const rows = [
    ['Urgency', `${escapeHtml(URGENCY[record.urgency] ?? record.urgency)} (${escapeHtml(record.urgency)} of 4)`],
    ['Assignee', escapeHtml(record.assignee_email)],
    ['SLA due', escapeHtml(fullDate(record.sla_due_at))],
    ['Helpdesk state', `<code>${escapeHtml(record.state)}</code>`],
  ]
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join('');
  return page(r.id, `<article class="card">
    <div class="pills"><span class="pill pill-accent">Helpdesk</span><span class="pill pill-${status.tone}">${escapeHtml(status.label)}</span>${r.done ? '' : `<span class="pill pill-${due.tone}">${due.text}</span>`}</div>
    <h1>${escapeHtml(r.title)}</h1>
    <p class="sub">Support ticket <code>${escapeHtml(r.id)}</code></p>
    <dl>${rows}</dl>
    <p class="note">This is the Helpdesk's own record. Changes made on the Employee Hub dashboard are saved here.</p>
  </article>`, dashboardUrl);
}

export function notFoundPage(id, { dashboardUrl }) {
  return page('Not found', `<article class="card empty"><h1>Helpdesk ticket not found</h1><p class="sub">${escapeHtml(id)} does not exist or was deleted.</p></article>`, dashboardUrl);
}
