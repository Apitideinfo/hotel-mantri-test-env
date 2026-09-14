import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\chrome_forensic_profile3';

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9231',
  '--user-data-dir=' + userDataDir,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,1100',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 2500));

try {
  const targetsRes = await fetch('http://127.0.0.1:9231/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
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
  await new Promise(r => setTimeout(r, 2000));

  // Click Dashboard if not on dashboard
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

  const collections = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.body.innerText;
      return el.split('\\n').filter(l => l.includes('₹') || l.includes('Collection') || l.includes('Income'));
    })()`,
    returnByValue: true
  });
  console.log('COLLECTION LINES:', collections.result.value.slice(0, 25));

} catch (err) {
  console.error('Error:', err);
} finally {
  chrome.kill();
}
