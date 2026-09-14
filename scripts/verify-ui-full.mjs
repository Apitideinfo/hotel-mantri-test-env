import { spawn } from 'child_process';
import fs from 'fs';

const email = 'tester_1789400058254@example.com';
const password = 'TestPassword123!';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\chrome_forensic_profile3';

console.log('Launching headless Chrome for Operations Board UI verification...');
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9224',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,900',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 2500));

try {
  const targetsRes = await fetch('http://127.0.0.1:9224/json/list');
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

  const consoleLogs = [];
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const line = `[Browser ${data.params.type}] ` + data.params.args.map(a => (typeof a.value === 'object' ? JSON.stringify(a.value) : (a.value || a.description || ''))).join(' ');
      consoleLogs.push(line);
      console.log(line);
    }
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
  await send('DOM.enable');

  await new Promise(r => setTimeout(r, 2000));

  // Step 1: Check if on landing page and log in
  const state1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const onLanding = text.includes('ABOUT HOTELMANTRI') || text.includes('Sign In') || text.includes('Sign in');
      const onLogin = !!document.querySelector('#auth-email-input');
      const inApp = text.includes('Hotel Gopal') || text.includes('Dashboard') || text.includes('Operations Board');
      return { onLanding, onLogin, inApp };
    })()`,
    returnByValue: true
  });
  console.log('Current page status:', state1.result.value);

  if (state1.result.value.onLanding && !state1.result.value.inApp) {
    console.log('Navigating from landing page to login...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const btn = btns.find(b => b.innerText.includes('Sign In') || b.innerText.includes('Sign in') || b.innerText.includes('Login'));
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1500));
  }

  const state2 = await send('Runtime.evaluate', {
    expression: `!!document.querySelector('#auth-email-input')`,
    returnByValue: true
  });

  if (state2.result.value) {
    console.log('Entering credentials...');
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
    console.log('Waiting for authentication...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // Step 2: Navigate to Operations Board
  console.log('Navigating to Operations Board...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const opsBtn = btns.find(b => b.innerText.trim() === 'Operations Board' || b.innerText.includes('Operations Board'));
      if (opsBtn) opsBtn.click();
      else {
        const op = btns.find(b => b.innerText.includes('Operations') || b.innerText.includes('Front Office'));
        if (op) op.click();
      }
    })()`
  });

  // Wait until 'Loading board' is gone or max 15 seconds
  console.log('Waiting for Operations Board data to finish loading...');
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const isStillLoading = await send('Runtime.evaluate', {
      expression: `document.body.innerText.includes('Loading board')`,
      returnByValue: true
    });
    if (!isStillLoading.result.value) {
      console.log(`Board loaded after ${i + 1}s`);
      break;
    }
  }
  // Wait an extra second for React render to settle
  await new Promise(r => setTimeout(r, 1500));

  // Step 3: Inspect the Operations Board DOM & KPIs
  const opsBoardReport = await send('Runtime.evaluate', {
    expression: `(() => {
      // Find KPI cards
      const kpis = Array.from(document.querySelectorAll('div')).filter(d => {
        const t = d.innerText || '';
        return t.includes('Occupied') || t.includes('Vacant') || t.includes('Arrivals') || t.includes('Departures') || t.includes('Revenue');
      }).map(d => d.innerText.split('\\n').map(s => s.trim()).filter(Boolean));

      // Extract specifically cards that have 2 lines (Label and Value)
      const kpiCards = Array.from(document.querySelectorAll('.rounded-xl')).map(el => {
        const text = el.innerText.trim().split('\\n');
        if (text.length === 2) {
          return { label: text[0], value: text[1] };
        }
        return null;
      }).filter(Boolean);

      // Check date navigator
      const dateDisplay = document.querySelector('.font-bold.text-slate-800, [class*="min-w-[130px]"]')?.innerText || '';

      // Check rooms
      const allText = document.body.innerText;
      const hasRoom101 = allText.includes('101');
      const hasTaral = allText.includes('Taral') || allText.includes('Mehta');
      
      // Look for reservation card elements
      const bookingButtons = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = b.innerText || '';
        return t.includes('Taral') || t.includes('Mehta') || t.includes('travelguru') || t.includes('Travelguru');
      }).map(b => ({
        text: b.innerText,
        title: b.getAttribute('title'),
        classes: b.className
      }));

      return {
        dateDisplay,
        kpiCards,
        hasRoom101,
        hasTaral,
        bookingButtons,
        fullBodySnippet: allText.slice(0, 1000)
      };
    })()`,
    returnByValue: true
  });

  console.log('\n====================================================');
  console.log('OPERATIONS BOARD LIVE BROWSER AUDIT REPORT');
  console.log('====================================================');
  console.log('Date Navigator Display:', opsBoardReport.result.value.dateDisplay);
  console.log('KPI Cards Detected:', opsBoardReport.result.value.kpiCards);
  console.log('Room 101 Present:', opsBoardReport.result.value.hasRoom101);
  console.log('Taral Mehta Present:', opsBoardReport.result.value.hasTaral);
  console.log('Matching Booking Cards:', opsBoardReport.result.value.bookingButtons);

  // If Taral Mehta button exists, click it to open detail panel
  if (opsBoardReport.result.value.bookingButtons.length > 0) {
    console.log('\nClicking Taral Mehta reservation card to inspect BookingDetailPanel...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const taralBtn = btns.find(b => b.innerText.includes('Taral') || b.innerText.includes('Mehta'));
        if (taralBtn) taralBtn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1500));

    const panelReport = await send('Runtime.evaluate', {
      expression: `(() => {
        const panel = document.querySelector('[class*="BookingDetailPanel"], [class*="fixed inset-y-0 right-0"], aside, .bg-white.shadow-2xl');
        const text = panel ? panel.innerText : document.body.innerText;
        const actionButtons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText.trim(),
          disabled: b.disabled
        })).filter(b => ['Check-In', 'Check In', 'Edit', 'Cancel', 'Collect Payment', 'Room Shift', 'Extend Stay'].includes(b.text));
        
        return {
          panelFound: !!panel,
          actionButtons,
          panelSnippet: text.slice(0, 600)
        };
      })()`,
      returnByValue: true
    });
    console.log('BookingDetailPanel Report:', panelReport.result.value);
  }

  // Take screenshot
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = 'C:\\Users\\india\\.gemini\\antigravity-ide\\brain\\ee8696dc-d1ad-40f5-ba99-7cea110154a6\\scratch\\operations_board_verified.png';
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`\n[SUCCESS] High-resolution screenshot saved to: ${screenshotPath}`);

  ws.close();
} catch (e) {
  console.error('Test error:', e);
} finally {
  chrome.kill();
}
