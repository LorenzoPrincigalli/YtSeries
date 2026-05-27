const { chromium } = require('playwright');
const path = require('path');

const EXTENSION_PATH = 'C:\\Progetti\\YTSeries';

(async () => {
  console.log('Launching Chrome with extension...');
  const browser = await chromium.launch({
    headless: false,
    args: [
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage();

  // Go to extensions page
  console.log('Navigating to chrome://extensions...');
  try {
    await page.goto('chrome://extensions', { waitUntil: 'load', timeout: 20000 });
    console.log('Extensions page loaded');
    await new Promise(r => setTimeout(r, 3000));
    
    // Grab the page content
    const content = await page.content();
    console.log('Page content length:', content.length);
    console.log('Page title:', await page.title());
    
    // Save a screenshot
    await page.screenshot({ path: EXTENSION_PATH + '\\src\\assets\\store\\debug-extensions.png' });
    console.log('Saved debug screenshot');
    
    // Try to find extension IDs from the inner text
    const text = await page.evaluate(() => document.body.innerText);
    console.log('Visible text on page:');
    console.log(text);
  } catch (e) {
    console.error('Failed to load extensions page:', e.message);
  }

  await new Promise(r => setTimeout(r, 5000));

  // Close browser
  console.log('Closing...');
  await browser.close();
})().catch(e => {
  console.error('Error:', e.message, e.stack);
  process.exit(1);
});
