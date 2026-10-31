import { execSync } from 'child_process';

const PATTERNS = [
  { name: 'JWT Token (Supabase Key)', regex: /eyJ[a-zA-Z0-9_-]{15,}\.eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}/g },
  { name: 'Razorpay Live Key', regex: /rzp_live_[a-zA-Z0-9]{14,}/g },
  { name: 'Stripe Live Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g },
  { name: 'Meta Access Token', regex: /EAAG[a-zA-Z0-9]{30,}/g },
  { name: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'Postgres Connection String with Password', regex: /postgres:\/\/[a-zA-Z0-9_]+:[^@\s:]+@[a-zA-Z0-9.-]+/g },
  { name: 'Service Role Key Assignment', regex: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{30,}['"]?/g },
  { name: 'Razorpay Secret Assignment', regex: /(?:RAZORPAY_KEY_SECRET|RAZORPAY_SECRET)\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{16,}['"]?/g },
  { name: 'Webhook Secret Assignment', regex: /(?:WHINTA_WEBHOOK_SECRET|RAZORPAY_WEBHOOK_SECRET|N8N_WEBHOOK_SECRET)\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{16,}['"]?/g },
  { name: 'Meta Access Token Assignment', regex: /(?:WHATSAPP_ACCESS_TOKEN|META_WHATSAPP_ACCESS_TOKEN)\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{20,}['"]?/g },
  { name: 'Cron Secret Assignment', regex: /CRON_SECRET\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{16,}['"]?/g },
  { name: 'Internal API Secret Assignment', regex: /INTERNAL_API_SECRET\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{16,}['"]?/g },
];

function mask(str) {
  if (str.length <= 8) return '***';
  return str.slice(0, 4) + '...' + str.slice(-4);
}

console.log('========================================================================');
console.log('GIT HISTORY SECRETS & CREDENTIAL SCANNER');
console.log('Scanning all branches, commits, and diffs for leaked secrets...');
console.log('========================================================================\n');

try {
  const gitLogOutput = execSync('git log -p --all --unified=0', {
    maxBuffer: 100 * 1024 * 1024,
    encoding: 'utf8',
  });

  const lines = gitLogOutput.split('\n');
  let currentCommit = '';
  let currentFile = '';
  const findings = [];

  for (const line of lines) {
    if (line.startsWith('commit ')) {
      currentCommit = line.split(' ')[1].trim();
    } else if (line.startsWith('diff --git a/')) {
      const parts = line.split(' ');
      currentFile = parts[2]?.replace('a/', '') || '';
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      const addedContent = line.slice(1);
      // Skip test mocks, placeholders, and dummy secrets
      if (
        addedContent.includes('dummy') ||
        addedContent.includes('fake') ||
        addedContent.includes('example') ||
        addedContent.includes('test_') ||
        addedContent.includes('your_') ||
        addedContent.includes('placeholder') ||
        addedContent.includes('<secret>') ||
        addedContent.includes('eyJhbGci...') ||
        addedContent.includes('process.env')
      ) {
        continue;
      }

      for (const pattern of PATTERNS) {
        const matches = addedContent.match(pattern.regex);
        if (matches) {
          for (const m of matches) {
            findings.push({
              commit: currentCommit.slice(0, 10),
              file: currentFile,
              pattern: pattern.name,
              masked: mask(m),
            });
          }
        }
      }
    }
  }

  console.log(`Scan completed across git history.\n`);
  if (findings.length === 0) {
    console.log('✓ PASS: Zero sensitive keys, live tokens, or credentials found in git history.');
  } else {
    console.log(`⚠️ FINDINGS DETECTED (${findings.length} occurrences):`);
    for (const f of findings) {
      console.log(`  - Commit [${f.commit}] in ${f.file}: ${f.pattern} (masked: ${f.masked})`);
    }
  }
} catch (err) {
  console.error('Git log scan error:', err.message);
  process.exit(1);
}
