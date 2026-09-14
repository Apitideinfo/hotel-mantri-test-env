import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\chrome_forensic_profile3';

console.log('Launching headless Chrome to verify CheckInModal...');
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9225',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,900',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 2500));

try {
  const targetsRes = await fetch('http://127.0.0.1:9225/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
  if (!pageTarget) throw new Error('No target found');

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

  // Navigate to Operations Board
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const opsBtn = btns.find(b => b.innerText.trim() === 'Operations Board' || b.innerText.includes('Operations Board'));
      if (opsBtn) opsBtn.click();
    })()`
  });

  // Wait until 'Loading board' is gone
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const isStillLoading = await send('Runtime.evaluate', {
      expression: `document.body.innerText.includes('Loading board')`,
      returnByValue: true
    });
    if (!isStillLoading.result.value) break;
  }
  await new Promise(r => setTimeout(r, 1500));

  // Click Taral Mehta's reservation card to open panel
  console.log('Clicking Taral Mehta card...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const taralBtn = btns.find(b => b.innerText.includes('Taral') || b.innerText.includes('Mehta'));
      if (taralBtn) taralBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Now click "Check In" button in the panel
  console.log('Clicking Check In button in BookingDetailPanel...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const checkInBtn = btns.find(b => b.innerText.trim() === 'Check In');
      if (checkInBtn) checkInBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1500));

  // Inspect the CheckInModal
  const modalReport = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('[role="dialog"], .fixed.inset-0, .bg-white.rounded-2xl');
      const text = modal ? modal.innerText : document.body.innerText;
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type,
        placeholder: i.placeholder,
        value: i.value
      }));
      return {
        modalTitle: document.querySelector('h2, h3')?.innerText || '',
        inputs: inputs.filter(i => i.value),
        modalSnippet: text.slice(0, 800)
      };
    })()`,
    returnByValue: true
  });
  console.log('CheckInModal Report:', modalReport.result.value);

  // Capture screenshot of CheckInModal
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\check_in_modal_verified.png';
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved CheckInModal screenshot to: ${screenshotPath}`);

  ws.close();
} catch (e) {
  console.error('Error:', e);
} finally {
  chrome.kill();
}
