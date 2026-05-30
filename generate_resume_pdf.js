const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const htmlPath = 'file:///C:/Users/Manoj%20Ambati/Desktop/playwright-mcp/playwright-mcp/Manoj_Ambati_Resume_2026_Improved.html';
  const pdfPath = 'C:\\Users\\Manoj Ambati\\Desktop\\Ambati Manoj — Resume 2026 latest.pdf';

  await page.goto(htmlPath, { waitUntil: 'networkidle' });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0.35in', bottom: '0.35in', left: '0.4in', right: '0.4in' },
    preferCSSPageSize: false,
  });

  await browser.close();
  console.log('PDF saved to:', pdfPath);
})();
