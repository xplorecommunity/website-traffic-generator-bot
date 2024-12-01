
---

### **1. Install Tor**
Ensure that Tor is installed and running on your Linux system.

```bash
sudo apt update
sudo apt install tor -y
```

---

### **2. Configure Tor for SOCKS Proxy**
Tor runs a SOCKS proxy by default on `127.0.0.1:9050`. You can confirm this in the Tor configuration file:

```bash
sudo nano /etc/tor/torrc
```

Ensure the following lines are present (and uncommented):
```bash
SOCKSPort 9050
```

### **4. Configure Puppeteer to Use Tor**
Update your Puppeteer script to use Tor's SOCKS proxy. Use the `--proxy-server=socks5://127.0.0.1:9050` argument when launching Puppeteer:

#### Example Code:
```javascript
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--proxy-server=socks5://127.0.0.1:9050']
  });

  const page = await browser.newPage();

  // Verify IP
  await page.goto('https://check.torproject.org');
  const isUsingTor = await page.$eval('body', (body) =>
    body.innerText.includes('Congratulations. This browser is configured to use Tor')
  );

  console.log(isUsingTor ? 'Connected to Tor!' : 'Not connected to Tor.');

  await browser.close();
})();
```

---

### **5. Automate IP Changes (Optional)**
To change IP addresses during script execution, use the `NEWNYM` command with the Tor ControlPort:

#### Enable ControlPort in Tor
Edit the Tor configuration file:
```bash
sudo nano /etc/tor/torrc
```

Add:
```bash
ControlPort 9051
CookieAuthentication 1
```

Restart Tor:
```bash
sudo service tor restart
```

#### Install `tor` Controller Package
Install `tor-control` or use a native Tor client API to send `NEWNYM` commands:
```bash
npm install tor-control
```

Example to change the IP:
```javascript
const TorControl = require('tor-control');
const controller = new TorControl({ password: null });

controller.signalNewnym().then(() => console.log('New Tor circuit created.'));
```

---

### **6. Verify New IP Address**
You can verify the new IP address by repeatedly checking `https://check.torproject.org` in Puppeteer.


---
```
sudo service tor start
sudo service tor status
sudo service tor restart
```
---

## Alternative: Use Password Authentication
If cookie authentication continues to fail, you can switch to password authentication:

Add a password to the Tor configuration file (/etc/tor/torrc):

```
HashedControlPassword <hashed_password>
```

Generate the hashed password using:
```
tor --hash-password "your_password"
```
Replace <hashed_password> with the generated output.

Restart Tor:
```
sudo service tor restart
```

Update the script to include the password:
```
const torControl = new TorControl({
  host: '127.0.0.1',
  port: 9051,
  password: 'your_password',
});
```

Try these steps and let me know if it resolves the issue!