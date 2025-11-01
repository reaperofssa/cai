const express = require('express')
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const fs = require('fs')
const AdmZip = require('adm-zip')
const axios = require('axios')
const os = require('os')
const FormData = require('form-data')
const archiver = require('archiver')
const path = require('path')

puppeteer.use(StealthPlugin())

const app = express()
const PORT = 7860
const PROFILE_DIR = path.join(__dirname, 'chrome-profile')
const ZIP_FILE = 'profile.zip'
const HTML_FILE = 'page.html'
const SCREENSHOT_FILE = 'screenshot.png'

// Keep browser instance alive for reuse
let globalBrowser = null;

async function getOrCreateBrowser(userDataDir) {
  if (globalBrowser && globalBrowser.isConnected()) {
    return globalBrowser;
  }
  
  globalBrowser = await puppeteer.launch({
    headless: true,
    userDataDir: userDataDir || PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process', // Faster startup
      '--no-zygote',
      '--disable-extensions',
      '--disable-default-apps'
    ]
  });
  
  return globalBrowser;
}

// Lightweight stealth - only essential overrides
async function applyMinimalStealth(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  });
}

// Simplified human actions - much faster
async function quickHumanActions(page) {
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(
      Math.random() * 500 + 100,
      Math.random() * 300 + 100,
      { steps: 5 }
    );
    await new Promise(r => setTimeout(r, 300));
  }
}

// Compress profile with lower compression for speed
async function zipProfileFast() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_FILE)
    const archive = archiver('zip', { zlib: { level: 1 } }) // Fast compression

    output.on('close', () => resolve(ZIP_FILE))
    archive.on('error', err => reject(err))

    archive.pipe(output)
    archive.directory(PROFILE_DIR, false)
    archive.finalize()
  })
}

async function uploadToCatbox(filePath) {
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', fs.createReadStream(filePath))

  const response = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    maxRedirects: 0,
    timeout: 30000
  })

  return response.data
}

app.get('/q', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url')

  try {
    const browser = await getOrCreateBrowser(PROFILE_DIR);
    const page = await browser.newPage()

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    ]
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)])
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
    await applyMinimalStealth(page);

    // Faster page load - domcontentloaded instead of networkidle2
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    
    await quickHumanActions(page)
    await new Promise(r => setTimeout(r, 5000)) // Reduced from 15s

    const finalUrl = page.url()
    if (finalUrl.startsWith('https://character.ai/')) {
      const html = await page.content()
      fs.writeFileSync(HTML_FILE, html)
      await page.screenshot({ path: SCREENSHOT_FILE, fullPage: false }) // Not full page
      await page.close()

      const zipPath = await zipProfileFast()
      
      // Upload in parallel
      const [profileUrl, htmlUrl, screenshotUrl] = await Promise.all([
        uploadToCatbox(zipPath),
        uploadToCatbox(HTML_FILE),
        uploadToCatbox(SCREENSHOT_FILE)
      ]);

      return res.json({
        profile: profileUrl,
        html: htmlUrl,
        screenshot: screenshotUrl,
        redirected: finalUrl
      })
    } else {
      await page.close()
      return res.json({ redirected: finalUrl, message: 'Did not match target redirect' })
    }
  } catch (err) {
    console.error(err)
    res.status(500).send('Error: ' + err.message)
  }
})

app.get('/session-screenshot', async (req, res) => {
  const { profile } = req.query
  if (!profile) return res.status(400).send('Missing profile URL')

  const tempDir = path.join(os.tmpdir(), 'pupp_profile_' + Date.now())
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    const response = await axios.get(profile, { responseType: 'arraybuffer', timeout: 30000 })
    const zipPath = path.join(tempDir, 'profile.zip')
    fs.writeFileSync(zipPath, response.data)

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tempDir, true)

    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: tempDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote'
      ]
    })

    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
    await applyMinimalStealth(page);

    await page.goto('https://character.ai/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await quickHumanActions(page)
    await new Promise(r => setTimeout(r, 3000)) // Reduced from 10s

    const screenshotPath = path.join(tempDir, 'screenshot.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    await browser.close()

    const screenshotUrl = await uploadToCatbox(screenshotPath)

    res.json({ screenshot: screenshotUrl })
  } catch (err) {
    console.error(err)
    res.status(500).send('Error: ' + err.message)
  }
})

app.get('/session-message', async (req, res) => {
  const { profile, message, chatId } = req.query;
  if (!profile) return res.status(400).send('Missing profile URL');
  if (!message) return res.status(400).send('Missing message');
  if (!chatId) return res.status(400).send('Missing chatId');

  const tempDir = path.join(os.tmpdir(), 'pupp_profile_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Download and extract profile
    const response = await axios.get(profile, { responseType: 'arraybuffer', timeout: 30000 });
    const zipPath = path.join(tempDir, 'profile.zip');
    fs.writeFileSync(zipPath, response.data);
    new AdmZip(zipPath).extractAllTo(tempDir, true);

    // Launch browser
    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: tempDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await applyMinimalStealth(page);

    // Open chat page
    await page.goto(`https://character.ai/chat/${chatId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for input
    await page.waitForSelector('textarea[placeholder*="Message"]', {
      visible: true,
      timeout: 30000
    });

    // Count messages before
    const initialCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );

    // Send message
    await page.type('textarea[placeholder*="Message"]', message, { delay: 30 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Send a message..."]');
      return btn && !btn.disabled;
    }, { timeout: 15000 });
    await page.click('button[aria-label="Send a message..."]');

    // Single reload instead of two
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('textarea[placeholder*="Message"]', { visible: true, timeout: 30000 });

    // Wait for stable reply - reduced polling
    let lastText = '';
    let stableCount = 0;
    while (stableCount < 2) { // Reduced from 3
      const currentText = await page.evaluate((userMsg, prevCount) => {
        const allMsgs = Array.from(document.querySelectorAll(
          'div[data-testid="completed-message"] div.font-display.font-light'
        ));
        const newMsgs = allMsgs.slice(prevCount);
        const botMsgs = newMsgs.map(el => el.innerText.trim())
                               .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase());
        return botMsgs[0] || '';
      }, message, initialCount);

      if (currentText === lastText) stableCount++;
      else {
        stableCount = 0;
        lastText = currentText;
      }
      await new Promise(r => setTimeout(r, 800)); // Reduced from 500 but check less often
    }

    // Get reply
    const reply = await page.evaluate((userMsg, prevCount) => {
      const allMsgs = Array.from(document.querySelectorAll(
        'div[data-testid="completed-message"] div.font-display.font-light'
      ));
      const newMsgs = allMsgs.slice(prevCount);
      const botMsgs = newMsgs.map(el => el.innerText.trim())
                             .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase());
      return botMsgs[0] || null;
    }, message, initialCount);

    const postReloadCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );

    // Store session
    const uid = Math.random().toString(36).substring(2, 10);
    globalThis.sessions = globalThis.sessions || {};
    globalThis.sessions[uid] = {
      browser,
      page,
      messageCount: postReloadCount,
      lastUsed: Date.now(),
      profileDir: tempDir
    };

    // Auto-close after 10 minutes
    setTimeout(() => {
      const s = globalThis.sessions[uid];
      if (s && Date.now() - s.lastUsed >= 10 * 60 * 1000) {
        s.browser.close().catch(() => {});
        fs.rmSync(s.profileDir, { recursive: true, force: true });
        delete globalThis.sessions[uid];
      }
    }, 10 * 60 * 1000);

    res.json({ uid, reply });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error: ' + err.message);
  }
});

app.get('/session-message-continue', async (req, res) => {
  const { uid, message } = req.query;
  if (!uid) return res.status(400).json({ error: 'Missing uid' });
  if (!message) return res.status(400).json({ error: 'Missing message' });

  globalThis.sessions = globalThis.sessions || {};
  const session = globalThis.sessions[uid];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  session.lastUsed = Date.now();
  const { page } = session;

  try {
    await page.waitForSelector('textarea[placeholder*="Message"]', { visible: true, timeout: 30000 });

    const prevCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );

    await page.type('textarea[placeholder*="Message"]', message, { delay: 30 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Send a message..."]');
      return btn && !btn.disabled;
    }, { timeout: 15000 });
    await page.click('button[aria-label="Send a message..."]');

    await page.waitForFunction(
      (count) => {
        return document.querySelectorAll(
          'div[data-testid="completed-message"] div.font-display.font-light'
        ).length >= count + 2;
      },
      { timeout: 30000 },
      prevCount
    );

    // Faster stability check
    let lastText = '';
    let stableCount = 0;
    while (stableCount < 2) {
      const currentText = await page.evaluate((userMsg) => {
        const allMsgs = Array.from(
          document.querySelectorAll('div[data-testid="completed-message"] div.font-display.font-light')
        )
          .map(el => el.innerText.trim())
          .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase());
        return allMsgs[0] || '';
      }, message);

      if (currentText === lastText) stableCount++;
      else {
        stableCount = 0;
        lastText = currentText;
      }
      await new Promise(r => setTimeout(r, 800));
    }

    const reply = await page.evaluate((userMsg) => {
      const allMsgs = Array.from(
        document.querySelectorAll('div[data-testid="completed-message"] div.font-display.font-light')
      )
        .map(el => el.innerText.trim())
        .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase());
      return allMsgs[0] || null;
    }, message);

    const newCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );
    session.messageCount = newCount;

    res.json({ uid, reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
