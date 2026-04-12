const puppeteer = require('puppeteer')
const path = require('path')

;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const page = await browser.newPage()

  const htmlPath = path.resolve(__dirname, 'docs/technical-doc.html')
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' })

  await page.pdf({
    path: 'docs/stler-tasks-technical-doc.pdf',
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: '1.5cm', right: '0', bottom: '1.5cm', left: '0' },
  })

  await browser.close()
  console.log('Done: docs/stler-tasks-technical-doc.pdf')
})()
