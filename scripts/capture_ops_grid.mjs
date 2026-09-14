import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\chrome_forensic_profile3';

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9229',
  '--user-data-dir=' + userDataDir,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,1100',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 2500));

try {
  const targetsRes = await fetch('http://127.0.0.1:9229/json/list');
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
  await new Promise(r => setTimeout(r, 2500));

  // Navigate to Operations Board
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelectorAll('button, a').forEach(b => {
        if (b.innerText.includes('Operations Board')) b.click();
      });
    })()`
  });
  await new Promise(r => setTimeout(r, 3000));

  // Scroll down to grid
  await send('Runtime.evaluate', {
    expression: `window.scrollTo({ top: 400, behavior: 'instant' });`
  });
  await new Promise(r => setTimeout(r, 1000));

  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/india/.gemini/antigravity-ide/brain/ee8696dc-d1ad-40f5-ba99-7cea110154a6/scratch/ops_grid_live.png', Buffer.from(ss.data, 'base64'));
  console.log('Saved ops_grid_live.png');

  ws.close();
} catch (e) {
  console.error(e);
} finally {
  chrome.kill();
}
