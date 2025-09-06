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

  try {
    const browser = await puppeteer.launch({
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

    async function humanLikeActions(page) {
      const box = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }))

      for (let i = 0; i < 5; i++) {
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
      }
    }

    await humanLikeActions(page)

    await new Promise(r => setTimeout(r, 15000))

    const finalUrl = page.url()
    if (finalUrl.startsWith('https://character.ai/')) {
      const html = await page.content()
      fs.writeFileSync(HTML_FILE, html)
      await page.screenshot({ path: SCREENSHOT_FILE, fullPage: true })
      await browser.close()

      const zipPath = await zipProfile()
      const profileUrl = await uploadToCatbox(zipPath)
      const htmlUrl = await uploadToCatbox(HTML_FILE)
      const screenshotUrl = await uploadToCatbox(SCREENSHOT_FILE)

      return res.json({
        profile: profileUrl,
        html: htmlUrl,
        screenshot: screenshotUrl,
        redirected: finalUrl
      })
    } else {
      await browser.close()
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
    const response = await axios.get(profile, { responseType: 'arraybuffer' })
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

    await page.goto('https://character.ai/', { waitUntil: 'networkidle2', timeout: 60000 })

    async function humanLikeActions(page) {
      const box = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }))

      for (let i = 0; i < 5; i++) {
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
      }
    }

    await humanLikeActions(page)
    await new Promise(r => setTimeout(r, 10000))

    const screenshotPath = path.join(tempDir, 'screenshot.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    await browser.close()

    const screenshotUrl = await uploadToCatbox(screenshotPath)

    res.json({ screenshot: screenshotUrl })
  } catch (err) {
    console.error(err)
    res.status(500).send('Error: ' + err.message)
  }
})

app.get('/session-message', async (req, res) => {
  const { profile, message } = req.query;
  if (!profile) return res.status(400).send('Missing profile URL');
  if (!message) return res.status(400).send('Missing message');

  const tempDir = path.join(os.tmpdir(), 'pupp_profile_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Download and extract session profile
    const response = await axios.get(profile, { responseType: 'arraybuffer' });
    const zipPath = path.join(tempDir, 'profile.zip');
    fs.writeFileSync(zipPath, response.data);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);

    // 2. Launch browser
    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: tempDir,
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

    // 3. Apply random UA + stealth tweaks
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
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });

    // 4. Stealth patches (copied from your existing route)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        const ctx = this.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0.01)';
        ctx.fillRect(0, 0, this.width, this.height);
        return toDataURL.apply(this, arguments);
      };

      const getImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const data = getImageData.apply(this, arguments);
        for (let i = 0; i < data.data.length; i += 50) {
          data.data[i] = data.data[i] ^ 0x01;
        }
        return data;
      };

      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, param);
      };

      const getChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function () {
        const data = getChannelData.call(this);
        for (let i = 0; i < data.length; i += 100) {
          data[i] = data[i] + Math.random() * 0.00001;
        }
        return data;
      };

      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = parameters =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' })
          : originalQuery(parameters);

      const originalFonts = document.fonts;
      document.fonts = { check: () => true, ready: Promise.resolve(), ...originalFonts };

      Intl.DateTimeFormat = function () {
        return {
          resolvedOptions: () => ({ timeZone: 'America/New_York' })
        };
      };

      const origNow = performance.now;
      performance.now = function () {
        return origNow.call(this) + Math.random() * 0.0001;
      };
    });

    // 5. Go to specific chat
    await page.goto('https://character.ai/chat/UMvyxGD17y0PfEoC3oB_K44ova364o4GCKH23YiwuRc', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 6. Send message
    await page.waitForSelector('textarea[placeholder="Message..."]', { visible: true });
    await page.type('textarea[placeholder="Message..."]', message, { delay: 50 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Send a message..."]');
      return btn && !btn.disabled;
    });
    await page.click('button[aria-label="Send a message..."]');

    // 7. Wait for reply & grab newest
    await page.waitForSelector('div[data-testid="completed-message"]', { visible: true });
    const reply = await page.evaluate(() => {
      const messages = document.querySelectorAll('div[data-testid="completed-message"] div.font-display.font-light');
      const lastMessage = messages[messages.length - 1];
      return lastMessage ? lastMessage.innerText.trim() : null;
    });

    // 8. Generate UID for reuse
    const uid = Math.random().toString(36).substring(2, 10);

    res.json({ uid, reply });

    // ❗ Keep browser alive for reuse — store it globally
    globalThis.sessions = globalThis.sessions || {};
    globalThis.sessions[uid] = { browser, page };

  } catch (err) {
    console.error(err);
    res.status(500).send('Error: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
