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

async function zipProfile() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_FILE)
    const archive = archiver('zip', { zlib: { level: 9 } })

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
    headers: form.getHeaders()
  })

  return response.data
}

app.get('/q', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url')

  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: PROFILE_DIR,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
      ]
    })

    const page = await browser.newPage()

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
    ]
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)])

    await page.setViewport({
      width: 1280 + Math.floor(Math.random() * 50),
      height: 720 + Math.floor(Math.random() * 50),
      deviceScaleFactor: 1
    })

    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9'
    })

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' })
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] })
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 })

      const toDataURL = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = function () {
        const ctx = this.getContext('2d')
        ctx.fillStyle = 'rgba(255,255,255,0.01)'
        ctx.fillRect(0, 0, this.width, this.height)
        return toDataURL.apply(this, arguments)
      }

      const getImageData = CanvasRenderingContext2D.prototype.getImageData
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const data = getImageData.apply(this, arguments)
        for (let i = 0; i < data.data.length; i += 50) {
          data.data[i] = data.data[i] ^ 0x01
        }
        return data
      }

      const getParameter = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return 'Intel Inc.'
        if (param === 37446) return 'Intel Iris OpenGL Engine'
        return getParameter.call(this, param)
      }

      const getChannelData = AudioBuffer.prototype.getChannelData
      AudioBuffer.prototype.getChannelData = function () {
        const data = getChannelData.call(this)
        for (let i = 0; i < data.length; i += 100) {
          data[i] = data[i] + Math.random() * 0.00001
        }
        return data
      }

      const originalQuery = navigator.permissions.query
      navigator.permissions.query = parameters =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' })
          : originalQuery(parameters)

      const originalCreateOffer = RTCPeerConnection.prototype.createOffer
      RTCPeerConnection.prototype.createOffer = function () {
        return originalCreateOffer.apply(this, arguments)
      }

      const originalFonts = document.fonts
      document.fonts = { check: () => true, ready: Promise.resolve(), ...originalFonts }

      Intl.DateTimeFormat = function () {
        return {
          resolvedOptions: () => ({ timeZone: 'America/New_York' })
        }
      }

      const origNow = performance.now
      performance.now = function () {
        return origNow.call(this) + Math.random() * 0.0001
      }
    })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })

    // Wait for any initial redirects to complete
    await new Promise(r => setTimeout(r, 3000))

    async function humanLikeActions(page) {
      try {
        const box = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }))

        for (let i = 0; i < 5; i++) {
          if (page.isClosed()) break

          try {
            const x = Math.floor(Math.random() * box.width)
            const y = Math.floor(Math.random() * box.height)
            await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) })
            
            if (Math.random() > 0.7) {
              await page.mouse.click(x, y)
            }
            if (Math.random() > 0.5) {
              await page.keyboard.press('ArrowDown')
            }
            if (Math.random() > 0.8) {
              await page.evaluate(() => window.scrollBy(0, 100 + Math.floor(Math.random() * 200)))
            }
            await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 1000)))
          } catch (err) {
            if (err.message.includes('Execution context was destroyed') || 
                err.message.includes('Session closed')) {
              console.log('Navigation detected during human actions')
              break
            }
            throw err
          }
        }
      } catch (err) {
        console.log('Human actions interrupted (likely due to navigation):', err.message)
      }
    }

    await humanLikeActions(page)

    // Wait for final page state
    await new Promise(r => setTimeout(r, 15000))

    const finalUrl = page.url()
    
    if (finalUrl.startsWith('https://character.ai/')) {
      // Extract cookies in Puppeteer-compatible JSON format
      const cookies = await page.cookies()
      const cookiesJson = JSON.stringify(cookies, null, 2)
      const COOKIES_FILE = path.join(__dirname, 'cookies.json')
      fs.writeFileSync(COOKIES_FILE, cookiesJson)

      // Get HTML and screenshot
      const html = await page.content()
      fs.writeFileSync(HTML_FILE, html)
      await page.screenshot({ path: SCREENSHOT_FILE, fullPage: true })
      
      await browser.close()

      // Upload cookies, HTML, and screenshot
      const cookiesUrl = await uploadToCatbox(COOKIES_FILE)
      const htmlUrl = await uploadToCatbox(HTML_FILE)
      const screenshotUrl = await uploadToCatbox(SCREENSHOT_FILE)

      return res.json({
        cookies: cookiesUrl,
        html: htmlUrl,
        screenshot: screenshotUrl,
        redirected: finalUrl,
        message: 'Success - cookies saved in Puppeteer-ready format'
      })
    } else {
      if (browser) await browser.close()
      return res.json({ redirected: finalUrl, message: 'Did not match target redirect' })
    }
  } catch (err) {
    if (browser) await browser.close()
    console.error(err)
    res.status(500).send('Error: ' + err.message)
  }
})

app.get('/session-screenshot', async (req, res) => {
  const { cookies } = req.query
  if (!cookies) return res.status(400).send('Missing cookies URL')

  let browser
  try {
    // Fetch cookies JSON from URL
    const response = await axios.get(cookies)
    const cookiesData = response.data

    // Validate that it's an array of cookies
    if (!Array.isArray(cookiesData)) {
      return res.status(400).send('Invalid cookies format - expected JSON array')
    }

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
      ]
    })

    const page = await browser.newPage()

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
    ]
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)])

    await page.setViewport({
      width: 1280 + Math.floor(Math.random() * 50),
      height: 720 + Math.floor(Math.random() * 50),
      deviceScaleFactor: 1
    })

    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9'
    })

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' })
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] })
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 })

      const toDataURL = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = function () {
        const ctx = this.getContext('2d')
        ctx.fillStyle = 'rgba(255,255,255,0.01)'
        ctx.fillRect(0, 0, this.width, this.height)
        return toDataURL.apply(this, arguments)
      }

      const getImageData = CanvasRenderingContext2D.prototype.getImageData
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const data = getImageData.apply(this, arguments)
        for (let i = 0; i < data.data.length; i += 50) {
          data.data[i] = data.data[i] ^ 0x01
        }
        return data
      }

      const getParameter = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return 'Intel Inc.'
        if (param === 37446) return 'Intel Iris OpenGL Engine'
        return getParameter.call(this, param)
      }

      const getChannelData = AudioBuffer.prototype.getChannelData
      AudioBuffer.prototype.getChannelData = function () {
        const data = getChannelData.call(this)
        for (let i = 0; i < data.length; i += 100) {
          data[i] = data[i] + Math.random() * 0.00001
        }
        return data
      }

      const originalQuery = navigator.permissions.query
      navigator.permissions.query = parameters =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' })
          : originalQuery(parameters)

      const originalCreateOffer = RTCPeerConnection.prototype.createOffer
      RTCPeerConnection.prototype.createOffer = function () {
        return originalCreateOffer.apply(this, arguments)
      }

      const originalFonts = document.fonts
      document.fonts = { check: () => true, ready: Promise.resolve(), ...originalFonts }

      Intl.DateTimeFormat = function () {
        return {
          resolvedOptions: () => ({ timeZone: 'America/New_York' })
        }
      }

      const origNow = performance.now
      performance.now = function () {
        return origNow.call(this) + Math.random() * 0.0001
      }
    })

    // Load cookies into the page BEFORE navigating
    await page.setCookie(...cookiesData)

    // Now navigate with cookies already set
    await page.goto('https://character.ai/', { waitUntil: 'networkidle2', timeout: 60000 })

    async function humanLikeActions(page) {
      try {
        const box = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }))

        for (let i = 0; i < 5; i++) {
          if (page.isClosed()) break

          try {
            const x = Math.floor(Math.random() * box.width)
            const y = Math.floor(Math.random() * box.height)
            await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) })
            
            if (Math.random() > 0.7) {
              await page.mouse.click(x, y)
            }
            if (Math.random() > 0.5) {
              await page.keyboard.press('ArrowDown')
            }
            if (Math.random() > 0.8) {
              await page.evaluate(() => window.scrollBy(0, 100 + Math.floor(Math.random() * 200)))
            }
            await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 1000)))
          } catch (err) {
            if (err.message.includes('Execution context was destroyed') || 
                err.message.includes('Session closed')) {
              console.log('Navigation detected during human actions')
              break
            }
            throw err
          }
        }
      } catch (err) {
        console.log('Human actions interrupted:', err.message)
      }
    }

    await humanLikeActions(page)
    await new Promise(r => setTimeout(r, 10000))

    const tempDir = path.join(os.tmpdir(), 'screenshot_' + Date.now())
    fs.mkdirSync(tempDir, { recursive: true })
    const screenshotPath = path.join(tempDir, 'screenshot.png')
    
    await page.screenshot({ path: screenshotPath, fullPage: true })

    await browser.close()

    const screenshotUrl = await uploadToCatbox(screenshotPath)

    res.json({ screenshot: screenshotUrl, message: 'Screenshot taken with loaded session' })
  } catch (err) {
    if (browser) await browser.close()
    console.error(err)
    res.status(500).send('Error: ' + err.message)
  }
})

app.get('/session-message', async (req, res) => {
  const { cookies, message, chatId } = req.query;
  if (!cookies) return res.status(400).send('Missing cookies URL');
  if (!message) return res.status(400).send('Missing message');
  if (!chatId) return res.status(400).send('Missing chatId');

  let browser;
  try {
    // 1. Fetch cookies JSON from URL
    const response = await axios.get(cookies);
    const cookiesData = response.data;

    if (!Array.isArray(cookiesData)) {
      return res.status(400).send('Invalid cookies format - expected JSON array');
    }

    // 2. Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
      ]
    });

    const page = await browser.newPage();

    // 3. Random UA
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    await page.setViewport({
      width: 1280 + Math.floor(Math.random() * 50),
      height: 720 + Math.floor(Math.random() * 50),
      deviceScaleFactor: 1
    });

    // 4. Stealth patches
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    });

    // 5. Load cookies BEFORE navigating
    await page.setCookie(...cookiesData);

    // 6. Open chat page using chatId
    await page.goto(`https://character.ai/chat/${chatId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 7. Wait for input
    await page.waitForSelector('textarea[placeholder*="Message"]', {
      visible: true,
      timeout: 60000
    });

    // 8. Count messages before sending
    const initialCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );

    // 9. Send message
    await page.type('textarea[placeholder*="Message"]', message, { delay: 50 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Send a message..."]');
      return btn && !btn.disabled;
    }, { timeout: 30000 });
    await page.click('button[aria-label="Send a message..."]');

    // 10. Refresh page twice before fetching reply
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('textarea[placeholder*="Message"]', { visible: true, timeout: 60000 });
    }

    // 11. Count messages after reloads
    const postReloadCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );

    // 12. Wait until top bot message stops changing
    let lastText = '';
    let stableCount = 0;
    while (stableCount < 3) {
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
      await new Promise(r => setTimeout(r, 500));
    }

    // 13. Get newest bot reply ignoring user's own message
    const reply = await page.evaluate((userMsg, prevCount) => {
      const allMsgs = Array.from(document.querySelectorAll(
        'div[data-testid="completed-message"] div.font-display.font-light'
      ));
      const newMsgs = allMsgs.slice(prevCount);
      const botMsgs = newMsgs.map(el => el.innerText.trim())
                             .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase());
      return botMsgs[0] || null;
    }, message, initialCount);

    // 14. Store session with cleanup timer
    const uid = Math.random().toString(36).substring(2, 10);
    globalThis.sessions = globalThis.sessions || {};
    globalThis.sessions[uid] = {
      browser,
      page,
      cookiesUrl: cookies,
      messageCount: postReloadCount,
      lastUsed: Date.now()
    };

    // Auto-close after 10 minutes of inactivity
    setTimeout(() => {
      const s = globalThis.sessions[uid];
      if (s && Date.now() - s.lastUsed >= 10 * 60 * 1000) {
        s.browser.close().catch(() => {});
        delete globalThis.sessions[uid];
        console.log(`Session ${uid} closed after 10 minutes inactivity`);
      }
    }, 10 * 60 * 1000);

    res.json({ uid, reply });

  } catch (err) {
    if (browser) await browser.close();
    console.error(err);
    res.status(500).send('Error: ' + err.message);
  }
});
app.get('/session-messagex', async (req, res) => {
  const { cookies, message, chatId } = req.query;

  if (!cookies) return res.status(400).send('Missing cookies URL');
  if (!message) return res.status(400).send('Missing message');
  if (!chatId)  return res.status(400).send('Missing chatId');

  let browser;
  try {
    const [cookiesResponse, browserInstance] = await Promise.all([
      axios.get(cookies),
      puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-infobars',
          '--window-size=1920,1080',
        ],
      }),
    ]);

    browser = browserInstance;
    const cookiesData = cookiesResponse.data;

    if (!Array.isArray(cookiesData)) {
      return res.status(400).send('Invalid cookies JSON');
    }

    const page = await browser.newPage();

    // Minimal stealth
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
    });

    await page.setCookie(...cookiesData);
    await page.goto(`https://character.ai/chat/${chatId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for message box
    await page.waitForSelector('textarea[placeholder*="Message"]', { visible: true, timeout: 30000 });

    // Count messages BEFORE sending (so we know where new ones start)
    const initialCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      els => els.length
    );

    // === SEND MESSAGE ===
    await page.type('textarea[placeholder*="Message"]', message, { delay: 50 });

    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label="Send a message..."]');
        return btn && !btn.disabled;
      },
      { timeout: 20000 }
    );

    await Promise.all([
      page.click('button[aria-label="Send a message..."]'),
      page.waitForResponse(resp => resp.url().includes('/send_message/') || resp.url().includes('/trpc/')), // optional: wait for request
    ]);

    // === WAIT FOR BOT REPLY TO STABILIZE ===
    let lastText = '';
    let stableCount = 0;
    let reply = '';

    while (stableCount < 4) { // 4 consecutive identical reads = stable
      reply = await page.evaluate((userMsg, prevCount) => {
        const messages = Array.from(
          document.querySelectorAll('div[data-testid="completed-message"] div.font-display.font-light')
        );

        const newMessages = messages.slice(prevCount);
        const botTexts = newMessages
          .map(el => el.innerText.trim())
          .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase());

        return botTexts[0] || '';
      }, message, initialCount);

      if (reply === lastText && reply !== '') {
        stableCount++;
      } else {
        stableCount = 0;
        lastText = reply;
      }

      if (stableCount < 4) await page.waitForTimeout(800); // wait a bit before next check
    }

    await browser.close();

    if (!reply) {
      return res.status(504).json({ error: 'No reply received (timeout or blocked)' });
    }

    return res.json({ reply });

  } catch (err) {
    console.error(err);
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
});
app.get('/session-message-continue', async (req, res) => {
  const { uid, message } = req.query;
  if (!uid) return res.status(400).json({ error: 'Missing uid' });
  if (!message) return res.status(400).json({ error: 'Missing message' });

  globalThis.sessions = globalThis.sessions || {};
  const session = globalThis.sessions[uid];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Refresh lastUsed so this session doesn't auto-close
  session.lastUsed = Date.now();

  const { page } = session;

  try {
    // 1. Wait for input to be ready
    await page.waitForSelector('textarea[placeholder*="Message"]', { visible: true, timeout: 60000 });

    // 2. Count messages before sending
    const prevCount = await page.$$eval(
      'div[data-testid="completed-message"] div.font-display.font-light',
      msgs => msgs.length
    );

    // 3. Send user message
    await page.type('textarea[placeholder*="Message"]', message, { delay: 50 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Send a message..."]');
      return btn && !btn.disabled;
    }, { timeout: 30000 });
    await page.click('button[aria-label="Send a message..."]');

    // 4. Wait for bot reply to appear (at least 2 new messages: user's + bot's)
    await page.waitForFunction(
      (count) => {
        return document.querySelectorAll(
          'div[data-testid="completed-message"] div.font-display.font-light'
        ).length >= count + 2;
      },
      { timeout: 60000 },
      prevCount
    );

    // 5. Wait until top bot message stops changing (~1.5s stable)
    let lastText = '';
    let stableCount = 0;
    while (stableCount < 3) {
      const currentText = await page.evaluate((userMsg) => {
        const allMsgs = Array.from(
          document.querySelectorAll('div[data-testid="completed-message"] div.font-display.font-light')
        )
          .map(el => el.innerText.trim())
          .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase()); // skip user message
        return allMsgs[0] || '';
      }, message);

      if (currentText === lastText) stableCount++;
      else {
        stableCount = 0;
        lastText = currentText;
      }
      await new Promise(r => setTimeout(r, 1200));
    }

    // 6. Get newest bot reply ignoring user's message
    const reply = await page.evaluate((userMsg) => {
      const allMsgs = Array.from(
        document.querySelectorAll('div[data-testid="completed-message"] div.font-display.font-light')
      )
        .map(el => el.innerText.trim())
        .filter(text => text && text.toLowerCase() !== userMsg.toLowerCase()); // skip user message
      return allMsgs[0] || null;
    }, message);

    // 7. Update session message count
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
