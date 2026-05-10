const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_SUITES = {
  auth: [
    'auth-01-full-test.js',
    'auth-02-sign-in.js',
    'auth-03-invalid-credentials.js',
    'auth-04-forgot-password.js',
    'auth-05-duplicate-email.js',
    'auth-06-logout.js',
    'auth-07-email-validation.js',
    'auth-08-session-persistence.js'
  ]
};

const results = { passed: [], failed: [], skipped: [] };
let totalTests = 0;
const startTime = Date.now();

const colors = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', blue: '\x1b[34m', gray: '\x1b[90m'
};

function log(msg, color = null) {
  const timestamp = new Date().toISOString().substr(11, 8);
  const prefix = `\x1b[90m[${timestamp}]\x1b[0m`;
  console.log(color ? `${prefix} ${color}${msg}${colors.reset}` : `${prefix} ${msg}`);
}

function runTest(scriptName) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    const testName = scriptName.replace('.js', '').toUpperCase();
    log(`Running ${testName}...`, colors.blue);

    const testStart = Date.now();
    const proc = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: 'pipe'
    });

    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); process.stdout.write(d); });
    proc.stderr.on('data', (d) => { output += d.toString(); process.stderr.write(d); });

    proc.on('close', (code) => {
      const duration = ((Date.now() - testStart) / 1000).toFixed(1);
      if (code === 0) {
        log(`✅ ${testName} PASSED (${duration}s)`, colors.green);
        results.passed.push({ test: testName, duration, output });
      } else if (code === 2) {
        log(`⏭️  ${testName} SKIPPED (${duration}s)`, colors.yellow);
        results.skipped.push({ test: testName, duration, output, code });
      } else {
        log(`❌ ${testName} FAILED (${duration}s)`, colors.red);
        results.failed.push({ test: testName, duration, output, code });
      }
      resolve(code);
    });

    proc.on('error', (error) => {
      log(`❌ ${testName} ERROR: ${error.message}`, colors.red);
      results.failed.push({ test: testName, error: error.message });
      resolve(1);
    });
  });
}

// Ensure screenshots dir exists
fs.mkdirSync(path.join(__dirname, '..', 'screenshots'), { recursive: true });

async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  🧪 LEDGERLAB REGRESSION TEST SUITE           ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const missingEmail = !process.env.LEDGERLAB_TEST_EMAIL;
  const missingPassword = !process.env.LEDGERLAB_TEST_PASSWORD;

  if (missingEmail || missingPassword) {
    log('⚠️  Missing env vars: ' + [missingEmail && 'LEDGERLAB_TEST_EMAIL', missingPassword && 'LEDGERLAB_TEST_PASSWORD'].filter(Boolean).join(', '), colors.yellow);
  }

  for (const test of TEST_SUITES.auth) {
    totalTests++;
    await runTest(test);
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  📊 TEST RESULTS                               ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  log(`Total: ${totalTests}  ✅ ${results.passed.length}  ❌ ${results.failed.length}  ⏭️  ${results.skipped.length}  ⏱️  ${totalDuration}s`, colors.blue);

  if (results.failed.length > 0) {
    console.log('');
    log('FAILED TESTS:', colors.red);
    for (const f of results.failed) {
      log(`  ❌ ${f.test}${f.error ? ': ' + f.error : ''}`, colors.red);
    }
  }

  if (results.skipped.length > 0) {
    console.log('');
    log('SKIPPED TESTS:', colors.yellow);
    for (const s of results.skipped) {
      log(`  ⏭️  ${s.test}`, colors.yellow);
    }
  }

  console.log('');
  if (results.failed.length > 0) {
    log('❌ REGRESSION SUITE FAILED', colors.red);
    process.exit(1);
  } else if (results.skipped.length > 0) {
    log('⚠️  REGRESSION SUITE INCOMPLETE', colors.yellow);
    process.exit(1);
  } else {
    log('✅ REGRESSION SUITE PASSED', colors.green);
    process.exit(0);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
