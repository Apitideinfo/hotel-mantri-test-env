import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\chrome_forensic_profile3';

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9223',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 3000));

try {
  const targetsRes = await fetch('http://127.0.0.1:9223/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
  
  if (!pageTarget) {
    console.error('No page target found:', targets);
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
  console.log('Connected to WebSocket');

  await send('Page.enable');
  await send('Runtime.enable');

  // Wait 4s for React to render and fetch data
  await new Promise(r => setTimeout(r, 4000));

  const pageInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const isLogin = !!document.querySelector('input[type="password"]');
      const bodyText = document.body.innerText;
      return {
        url: window.location.href,
        isLogin,
        bodySnippet: bodyText.slice(0, 1000),
      };
    })()`,
    returnByValue: true
  });

  console.log('Initial page info:', pageInfo.result.value);

  // If on login, let's see if we can log in or check current screen
  if (pageInfo.result.value.isLogin) {
    console.log('On login page, attempting login...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const email = inputs.find(i => i.type === 'email' || i.placeholder.toLowerCase().includes('email') || i.name === 'email');
        const pass = inputs.find(i => i.type === 'password');
        const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('sign in') || b.innerText.toLowerCase().includes('login'));
        if (email) {
          email.value = 'admin@hotelmantri.com';
          email.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (pass) {
          pass.value = 'password123';
          pass.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 3000));
  }

  // Navigate to Operations Board if not already there
  await send('Runtime.evaluate', {
    expression: `(() => {
      // Find link or button for Operations Board
      const btns = Array.from(document.querySelectorAll('button, a'));
      const opsBtn = btns.find(b => b.innerText.includes('Operations Board') || b.innerText.includes('Operations'));
      if (opsBtn) opsBtn.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 4000));

  // Inspect the Operations Board DOM
  const opsBoardInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const kpis = Array.from(document.querySelectorAll('.rounded-xl border, [class*="KpiCard"]')).map(el => el.innerText).filter(t => t.length > 0);
      const allText = document.body.innerText;
      const taralCard = allText.includes('Taral') || allText.includes('Mehta');
      const room101 = allText.includes('101');
      return {
        url: window.location.href,
        hasTaralMehta: taralCard,
        hasRoom101: room101,
        pageSnippet: allText.slice(0, 1500)
      };
    })()`,
    returnByValue: true
  });

  console.log('Operations Board DOM inspection:', opsBoardInfo.result.value);

  // Take screenshot
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\ops_board_live.png';
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved screenshot to ${screenshotPath}`);

  ws.close();
} catch (e) {
  console.error('CDP test error:', e);
} finally {
  chrome.kill();
}
