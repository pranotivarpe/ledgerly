import { Router } from 'express';
import { getOutbox } from '../lib/email.js';
import { HttpError } from '../lib/http-error.js';

/** Development-only helpers. Never mounted in production. */
export const devRouter = Router();

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

devRouter.get('/emails', (_req, res) => {
  const rows = getOutbox()
    .map(
      (e) => `<tr>
        <td><a href="/api/dev/emails/${e.id}" target="preview">${escape(e.subject)}</a></td>
        <td>${escape(e.to)}</td>
        <td>${e.sentAt.toLocaleTimeString()}</td>
      </tr>`,
    )
    .join('');

  res.type('html')
    .send(`<!doctype html><html><head><meta charset="utf-8"><title>Dev outbox · Ledgerly</title>
    <style>
      body{font:14px system-ui,sans-serif;margin:0;display:grid;grid-template-columns:minmax(320px,40%) 1fr;height:100vh}
      aside{border-right:1px solid #e5e7eb;overflow:auto;padding:16px}
      h1{font-size:16px;margin:0 0 4px} p{color:#6b7280;margin:0 0 16px}
      table{width:100%;border-collapse:collapse} td{padding:8px 6px;border-bottom:1px solid #f1f2f5;vertical-align:top}
      a{color:#4f46e5;text-decoration:none;font-weight:500} iframe{border:0;width:100%;height:100%}
    </style></head><body>
    <aside><h1>Dev outbox</h1><p>Emails captured in development (newest first). Not available in production.</p>
    <table>${rows || '<tr><td>No emails yet.</td></tr>'}</table></aside>
    <iframe name="preview" title="Email preview"></iframe></body></html>`);
});

devRouter.get('/emails/latest', (_req, res) => {
  const email = getOutbox()[0];
  if (!email) throw HttpError.notFound('No emails yet');
  res.json(email);
});

devRouter.get('/emails/:id', (req, res) => {
  const email = getOutbox().find((e) => e.id === req.params.id);
  if (!email) throw HttpError.notFound('Email not found');
  res.type('html').send(email.html);
});
