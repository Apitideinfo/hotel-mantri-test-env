const { execSync } = require('child_process');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
console.log('Testing Chrome execution...');
try {
  const stdout = execSync(`"${chromePath}" --headless=new --disable-gpu --dump-dom "http://localhost:5173"`, {
    timeout: 10000,
    encoding: 'utf8'
  });
  console.log('Dump DOM output length:', stdout.length);
  console.log('First 300 chars:\n', stdout.slice(0, 300));
} catch (err) {
  console.error('Error running Chrome:', err.message);
}
