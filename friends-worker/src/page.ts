// The "Get Stack" page: install instructions for Mac or Windows, and the
// landing page for invite links (/join/<code>).

const APP_URL = 'http://localhost:4747';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function getPage(origin: string, inviteCode?: string) {
  const invite = inviteCode ? `${origin}/join/${inviteCode}` : undefined;
  const macCmd = invite
    ? `curl -fsSL ${origin}/install.sh | STACK_INVITE='${invite}' sh`
    : `curl -fsSL ${origin}/install.sh | sh`;
  const winCmd = invite
    ? `$env:STACK_INVITE='${invite}'; irm ${origin}/install.ps1 | iex`
    : `irm ${origin}/install.ps1 | iex`;
  const openUrl = invite ? `${APP_URL}/#join=${encodeURIComponent(invite)}` : APP_URL;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${invite ? 'Join on Stack' : 'Get Stack'}</title>
<style>
  :root {
    --bg: #f6f5f1; --surface: #fff; --surface-2: #f0eee8; --text: #1d1c1a; --muted: #6d6a63;
    --border: #e2dfd6; --accent: #2f6b4f; --accent-text: #fff; --code: #1d1c1a; --code-text: #ecebe6;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #151514; --surface: #1e1e1c; --surface-2: #272724; --text: #ecebe6; --muted: #9c998f;
      --border: #33322e; --accent: #5fae86; --accent-text: #0f1a14; --code: #0d0d0c; --code-text: #ecebe6;
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 40px 16px 64px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 6px; }
  h2 { font-size: 17px; margin: 0 0 6px; }
  p { margin: 0 0 10px; }
  a { color: var(--accent); }
  .lead { color: var(--muted); margin-bottom: 24px; }
  .invite { background: var(--surface); border: 1px solid var(--accent); border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
  .tabs { display: inline-flex; background: var(--surface-2); border-radius: 10px; padding: 3px; margin-bottom: 16px; }
  .tabs button { font: inherit; font-size: 14px; border: none; background: none; color: var(--muted);
    padding: 6px 16px; border-radius: 8px; cursor: pointer; }
  .tabs button[aria-selected="true"] { background: var(--surface); color: var(--text); font-weight: 600;
    box-shadow: 0 1px 2px rgb(0 0 0 / .15); }
  ol { list-style: none; counter-reset: step; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
  ol > li { counter-increment: step; background: var(--surface); border-radius: 12px; padding: 16px 16px 16px 56px; position: relative; }
  ol > li::before { content: counter(step); position: absolute; left: 16px; top: 15px; width: 26px; height: 26px;
    border-radius: 50%; background: var(--accent); color: var(--accent-text); font-weight: 700; font-size: 14px;
    display: grid; place-items: center; }
  .muted { color: var(--muted); font-size: 14px; }
  .cmd { display: flex; gap: 8px; align-items: stretch; margin-top: 8px; }
  .cmd code { flex: 1; min-width: 0; background: var(--code); color: var(--code-text); border-radius: 8px;
    padding: 10px 12px; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow-x: auto; white-space: nowrap; }
  button.copy, a.button { font: inherit; font-size: 14px; font-weight: 600; border-radius: 8px; padding: 8px 14px;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; }
  a.button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  ul { margin: 6px 0 0; padding-left: 20px; }
  .phone { display: none; background: var(--surface); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  [hidden] { display: none !important; }
  footer { margin-top: 32px; }
</style>
</head>
<body>
<main>
  <h1>${invite ? "You're invited to Stack" : 'Get Stack'}</h1>
  <p class="lead">Track the supplements you take, why you take them, and whether they're any good, with research by
    Claude on your own subscription. Share your stack with friends and see theirs.</p>

  ${invite ? `<div class="invite"><strong>A friend invited you to their group.</strong>
    <p class="muted" style="margin:4px 0 0">Install below and you'll land on the join screen. Already have Stack?
    <a href="${esc(openUrl)}">Open it and join</a>.</p></div>` : ''}

  <div class="phone" id="phone">
    <strong>Stack runs on a computer.</strong>
    <p class="muted" style="margin:4px 0 0">Open this link on your Mac or Windows PC to install it.</p>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" id="tab-mac" aria-selected="true" data-os="mac">Mac</button>
    <button role="tab" id="tab-win" aria-selected="false" data-os="win">Windows</button>
  </div>

  <section data-panel="mac">
    <ol>
      <li>
        <h2>Install two things first</h2>
        <ul>
          <li><a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a>, the LTS version</li>
          <li><a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a>, so research
            and chat use your Claude subscription. The installer offers to set this up if it's missing.</li>
        </ul>
      </li>
      <li>
        <h2>Paste this into Terminal</h2>
        <p class="muted">Open Terminal (press ⌘ Space, type <em>Terminal</em>, press Return), paste, and press Return.</p>
        <div class="cmd"><code>${esc(macCmd)}</code><button class="copy" data-copy="${esc(macCmd)}">Copy</button></div>
      </li>
      <li>
        <h2>Open Stack</h2>
        <p class="muted">It opens by itself when installing finishes and starts on its own whenever you log in.
          Bookmark it.</p>
        <a class="button primary" href="${esc(openUrl)}">Open Stack</a>
      </li>
    </ol>
  </section>

  <section data-panel="win" hidden>
    <ol>
      <li>
        <h2>Install three things first</h2>
        <ul>
          <li><a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a>, the LTS version</li>
          <li><a href="https://git-scm.com/download/win" target="_blank" rel="noreferrer">Git for Windows</a> (the default options are fine)</li>
          <li><a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a>, so research
            and chat use your Claude subscription. The installer offers to set this up if it's missing.</li>
        </ul>
      </li>
      <li>
        <h2>Paste this into PowerShell</h2>
        <p class="muted">Open the Start menu, type <em>PowerShell</em>, open it, paste, and press Enter. A regular
          window is fine; it doesn't need admin.</p>
        <div class="cmd"><code>${esc(winCmd)}</code><button class="copy" data-copy="${esc(winCmd)}">Copy</button></div>
      </li>
      <li>
        <h2>Open Stack</h2>
        <p class="muted">It opens by itself when installing finishes and starts on its own whenever you sign in.
          Bookmark it.</p>
        <a class="button primary" href="${esc(openUrl)}">Open Stack</a>
      </li>
    </ol>
  </section>

  <footer class="muted">
    Everything runs on your computer. Friends only see the items you choose to share.
    <a href="https://github.com/brianthomas17/stack" target="_blank" rel="noreferrer">Source code</a>
  </footer>
</main>
<script>
  const ua = navigator.userAgent;
  const phone = /iPhone|iPad|Android/i.test(ua);
  const os = /Windows/i.test(ua) ? 'win' : 'mac';
  if (phone) document.getElementById('phone').style.display = 'block';
  function show(which) {
    for (const t of document.querySelectorAll('[role=tab]')) t.setAttribute('aria-selected', String(t.dataset.os === which));
    for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== which;
  }
  for (const t of document.querySelectorAll('[role=tab]')) t.addEventListener('click', () => show(t.dataset.os));
  show(os);
  for (const b of document.querySelectorAll('button.copy')) {
    b.addEventListener('click', async () => {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = 'Copied';
      setTimeout(() => (b.textContent = 'Copy'), 1500);
    });
  }
</script>
</body>
</html>`;
}
