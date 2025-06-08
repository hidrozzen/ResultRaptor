const { test } = require('@playwright/test');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const ExcelJS = require('exceljs');
const config = require('../config');  // Adjust path if needed

test.setTimeout(10 * 60 * 1000);  // 10 minutes

test('YMCA Result Automation for multiple students with retry and error handling', async ({ browser }) => {
  const SEMESTER = config.semester;
  const START_ROLL = config.startRoll;
  const END_ROLL = config.endRoll;
  const MAX_OCR_RETRIES = 3;
  const CAPTCHA_WAIT_MS = 3000;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Semester_${SEMESTER}`);
  sheet.columns = [
    { header: 'Roll Number', key: 'roll', width: 20 },
    { header: 'Student Name', key: 'name', width: 25 },
    { header: "Father's Name", key: 'father', width: 25 },
    { header: 'Credit', key: 'credit', width: 15 },
    { header: 'SGPA', key: 'sgpa', width: 10 },
    { header: 'CGPA', key: 'cgpa', width: 10 },
    { header: 'Semester', key: 'semester', width: 15 },
  ];

  for (let roll = START_ROLL; roll <= END_ROLL; roll++) {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`\n🔄 Processing Roll No: ${roll}`);

    try {
      await page.goto('https://jcboseustymca.co.in/Forms/Student/ResultStudents.aspx', { timeout: 60000 });

      await page.fill('#txtRollNo', String(roll));
      await page.selectOption('#ddlSem', SEMESTER);

      // OCR retry logic for captcha
      let captchaText = '';
      let attempt = 0;
      while (attempt < MAX_OCR_RETRIES) {
        const captchaElement = await page.locator('img[alt="CAPTCHA"]');
        const captchaBuffer = await captchaElement.screenshot();
        fs.writeFileSync('captcha.png', captchaBuffer);

        const { data: { text } } = await Tesseract.recognize('captcha.png', 'eng', {
          logger: () => {},
        });

        captchaText = text.trim();
        if (captchaText.length >= 4 && /^[a-zA-Z0-9]+$/.test(captchaText)) {
          break;
        } else {
          console.log(`⚠️ OCR attempt ${attempt + 1} failed or invalid captcha "${captchaText}", retrying...`);
          attempt++;
          await page.waitForTimeout(CAPTCHA_WAIT_MS);
        }
      }

      if (captchaText.length === 0 || attempt === MAX_OCR_RETRIES) {
        console.error(`❌ OCR failed after ${MAX_OCR_RETRIES} attempts for Roll No: ${roll}. Skipping.`);
        await context.close();
        continue;
      }

      console.log('📄 CAPTCHA:', captchaText);
      await page.fill('#txtCaptcha', captchaText);

      console.log("⏳ Waiting 10s for manual correction (if needed)...");
      await page.waitForTimeout(10000);

      let resultPage;
      try {
        [resultPage] = await Promise.all([
          page.waitForEvent('popup', { timeout: 15000 }),
          page.click('#btnResult'),
        ]);

        await resultPage.waitForLoadState('load', { timeout: 15000 });

        const rollNumber = await resultPage.locator('#lblRollNo').innerText();
        const name = await resultPage.locator('#lblname').innerText();
        const fatherName = await resultPage.locator('#lblFatherName').innerText();
        const credit = await resultPage.locator('#lblCredit').innerText();
        const sgpa = await resultPage.locator('#lblResult').innerText();
        const cgpa = await resultPage.locator('#lblCgpaResult').innerText();

        console.log(`✅ ${rollNumber} | ${name} | ${fatherName} | ${credit} | ${sgpa} | ${cgpa}`);

        sheet.addRow({
          roll: rollNumber,
          name,
          father: fatherName,
          credit,
          sgpa,
          cgpa,
          semester: `Semester ${SEMESTER}`,
        });

        if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');
        await resultPage.screenshot({ path: `screenshots/${rollNumber}.png`, fullPage: true });

        await resultPage.close();

      } catch (popupErr) {
        console.warn(`⚠️ No result popup for Roll No: ${roll}. Writing blank entry...`);
        sheet.addRow({
          roll: roll,
          name: '',
          father: '',
          credit: '',
          sgpa: '',
          cgpa: '',
          semester: `Semester ${SEMESTER}`,
        });
      }

      await context.close();

    } catch (err) {
      console.error(`❌ Error for Roll No: ${roll} - ${err.message}`);
      await context.close();
      continue;
    }
  }

  const fileName = `Semester_${SEMESTER}_Results.xlsx`;
  await workbook.xlsx.writeFile(fileName);
  console.log(`📁 Results saved to ${fileName}`);
});
