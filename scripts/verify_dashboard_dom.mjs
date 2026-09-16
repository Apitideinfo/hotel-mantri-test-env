import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\91b90960-48b9-45bd-a7b9-426b4bb6229c\\scratch\\chrome_test_profile';

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9244',
  '--user-data-dir=' + userDataDir,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,1100',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 2500));

try {
  const targetsRes = await fetch('http://127.0.0.1:9244/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
  if (!pageTarget) {
    console.log('No page target found');
    process.exit(1);
  }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 2500));

  // If on login or landing, check what text is visible
  const title = await send('Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true
  });
  console.log('Page Title:', title.result.value);

  // Navigate/click Dashboard if needed
  await send('Runtime.evaluate', {
    expression: `(() => {
      const b = Array.from(document.querySelectorAll('button, a')).find(el => el.innerText.trim() === 'Dashboard');
      if (b) b.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));

  const kpis = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.animate-kpi'));
      return cards.map(c => c.innerText.replace(/\\n+/g, ' | '));
    })()`,
    returnByValue: true
  });
  console.log('KPI CARDS ON DASHBOARD:', kpis.result.value);

  const breakdownCards = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.shadow-card'));
      return cards.map(c => c.innerText.replace(/\\n+/g, ' | '));
    })()`,
    returnByValue: true
  });
  console.log('BREAKDOWN CARDS:');
  for (const c of breakdownCards.result.value.slice(0, 10)) {
    console.log('--- CARD ---', c);
  }

} catch (err) {
  console.error('Error:', err);
} finally {
  chrome.kill();
}
