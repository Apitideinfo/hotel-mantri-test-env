import { spawn } from 'child_process';
import fs from 'fs';

const email = 'tester_1789400058254@example.com';
const password = 'TestPassword123!';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\91b90960-48b9-45bd-a7b9-426b4bb6229c\\scratch\\chrome_dash_profile';
const screenshotPath = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\91b90960-48b9-45bd-a7b9-426b4bb6229c\\dashboard_reconciled.png';

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log('Launching headless Chrome for Dashboard Verification...');
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9250',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1600,1200',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 2500));

try {
  const targetsRes = await fetch('http://127.0.0.1:9250/json/list');
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

  // Check state and log in
  const state1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const onLanding = text.includes('ABOUT HOTELMANTRI') || text.includes('Sign In') || text.includes('Sign in');
      const inApp = text.includes('Hotel Gopal') || text.includes('Dashboard');
      return { onLanding, inApp };
    })()`,
    returnByValue: true
  });
  console.log('State on load:', state1.result.value);

  if (!state1.result.value.inApp) {
    // Click Sign In
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const btn = btns.find(b => b.innerText.includes('Sign In') || b.innerText.includes('Sign in') || b.innerText.includes('Login'));
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1500));

    // Fill credentials
    console.log('Submitting credentials...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const emailInput = document.querySelector('#auth-email-input');
        const passInput = document.querySelector('#auth-password-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (emailInput) {
          nativeSetter.call(emailInput, ${JSON.stringify(email)});
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (passInput) {
          nativeSetter.call(passInput, ${JSON.stringify(password)});
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 5000));
  }

  // Navigate to Dashboard
  console.log('Navigating to Dashboard...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => b.innerText.trim() === 'Dashboard');
      if (btn) btn.click();
    })()`
  });

  // Wait for data to load (wait until .animate-kpi elements are in DOM)
  console.log('Waiting for dashboard data to load...');
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    const hasKpis = await send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.animate-kpi').length > 0`,
      returnByValue: true
    });
    if (hasKpis.result.value) {
      console.log(`Dashboard data loaded after ${attempt + 1}s`);
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));

  // Extract KPI Cards
  const kpis = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.animate-kpi'));
      return cards.map(c => c.innerText.replace(/\\n+/g, ' | '));
    })()`,
    returnByValue: true
  });
  console.log('\n--- KPI CARDS ON DASHBOARD ---');
  for (const k of kpis.result.value) {
    console.log('  KPI:', k);
  }

  // Extract Financial Overview Cards
  const overviewCards = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.shadow-card'));
      return cards.map(c => c.innerText.replace(/\\n+/g, ' | '));
    })()`,
    returnByValue: true
  });
  console.log('\n--- FINANCIAL BREAKDOWN CARDS ---');
  for (const c of overviewCards.result.value) {
    if (c.includes('Breakup') || c.includes('Receivables') || c.includes('Income') || c.includes('Collection')) {
      console.log('  CARD:', c);
    }
  }

  // Capture screenshot
  const scr = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(scr.data, 'base64'));
  console.log(`\nScreenshot saved to ${screenshotPath}`);

} catch (err) {
  console.error('Error during verification:', err);
} finally {
  chrome.kill();
}
