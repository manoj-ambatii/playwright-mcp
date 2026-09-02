const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const htmlFile = path.join(__dirname, '../../frontend/resume/resume.html');
  const pdfPath  = path.join(__dirname, '../../frontend/resume/Manoj_Ambati_Java_Full_Stack_Resume.pdf');
  const htmlPath = 'file:///' + htmlFile.replace(/\\/g, '/');

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
