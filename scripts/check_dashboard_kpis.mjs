import puppeteer from 'puppeteer';

async function check() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' }).catch(() => null);
  if (!browser) {
    console.log('No CDP browser connected on 9222');
    return;
  }
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:5173')) || pages[0];
  if (page) {
    console.log('Page URL:', page.url());
    const cards = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.animate-kpi')).map(c => c.innerText.replace(/\n+/g, ' | '));
    });
    console.log('Dashboard KPI Cards:', cards);
  }
}
check().catch(console.error);
