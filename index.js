const puppeteer = require('puppeteer');

async function simulateWebsiteView(url, options = {}) {
  const {
    duration = 30000, // Default 30 seconds
    scrollInterval = 2000, // Scroll every 2 seconds
    randomness = true, // Add some natural-looking behavior
  } = options;

  try {
    // Launch browser in strict headless mode with additional arguments
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--remote-debugging-port=9222',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    // Create a new page
    const page = await browser.newPage();

    // Set viewport to simulate different devices
    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    });

    // Set a random user agent to appear more natural
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);

    // Navigate to the URL
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 60000 // Increased timeout
    });

    // Simulate natural browsing behavior
    const startTime = Date.now();
    while (Date.now() - startTime < duration) {
      if (randomness) {
        // Random scroll
        await page.evaluate(() => {
          window.scrollBy(0, Math.random() * 500);
        });
      }

      // Use a promise-based delay instead of waitForTimeout
      await new Promise(resolve => setTimeout(resolve, scrollInterval));
    }

    // Close the browser
    await browser.close();

    console.log(`Completed view simulation for ${url}`);
  } catch (error) {
    console.error('Error in website view simulation:', error);
    console.error('Detailed Error:', error.stack);
  }
}

// Usage example
const websiteUrl = 'https://xplore-blog.vercel.app/'; // Replace with your actual URL
simulateWebsiteView(websiteUrl, {
  duration: 60000, // 1 minute
  scrollInterval: 3000, // Scroll every 3 seconds
  randomness: true
});

module.exports = simulateWebsiteView;