const { chromium } = require('playwright');

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

module.exports = { launchBrowser };
