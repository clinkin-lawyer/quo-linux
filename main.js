const { app, BrowserWindow, Tray, Menu, shell, session, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const QUO_URL = 'https://my.quo.com';
const ALLOWED_HOSTS = ['quo.com', 'openphone.com', 'openphoneapi.com'];
const isAllowedHost = (url) => ALLOWED_HOSTS.some((host) => url.includes(host));
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
const STATE_PATH = path.join(app.getPath('userData'), 'window-state.json');
const LOG_PATH = path.join(app.getPath('userData'), 'recovery.log');

let mainWindow;
let tray;
let isQuitting = false;

// Always-on (not gated by QUO_DEBUG) so a white-screen recurrence leaves a trail
// even if nobody was running with debug logging at the time.
function logRecoveryEvent(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  if (process.env.QUO_DEBUG) console.log(line.trim());
  fs.appendFile(LOG_PATH, line, () => {});
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { width: 1280, height: 860 };
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  fs.writeFileSync(STATE_PATH, JSON.stringify(bounds));
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    ...state,
    icon: ICON_PATH,
    title: 'Quo',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(QUO_URL);

  // A failed load (e.g. autostart racing network-up, a flaky connection) otherwise
  // leaves the window white forever with nothing to recover it. Retry with backoff.
  let retryDelay = 2000;
  mainWindow.webContents.on('did-finish-load', () => {
    retryDelay = 2000;
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = ERR_ABORTED, e.g. a superseded navigation
    logRecoveryEvent(`did-fail-load ${errorCode} ${errorDescription} ${url}, retrying in ${retryDelay}ms`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(QUO_URL);
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  });

  // Recover from a crashed/killed renderer instead of leaving a dead white window.
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    if (details.reason === 'clean-exit') return;
    logRecoveryEvent(`render-process-gone ${details.reason}, reloading`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(QUO_URL);
    }
  });

  if (process.env.QUO_DEBUG) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[renderer] ${message} (${sourceId}:${line})`);
    });
  }

  // Keep Quo itself inside the window; send everything else to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (process.env.QUO_DEBUG) console.log(`[window-open] ${url}`);
    if (!isAllowedHost(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (process.env.QUO_DEBUG) console.log(`[will-navigate] ${url}`);
    if (!isAllowedHost(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  // Chromium's compositor can leave a stale/blank frame after the window sits
  // hidden (tray) or the system suspends; a forced repaint is cheap and fixes it
  // without a full reload.
  mainWindow.on('show', () => {
    logRecoveryEvent('window shown, forcing repaint');
    mainWindow.webContents.invalidate();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON_PATH).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('Quo');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Quo',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Calls need mic (and optionally camera) access; auto-approve for Quo's own origin only.
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL();
      const allowed = ['media', 'notifications', 'clipboard-sanitized-write'];
      if (url.startsWith(QUO_URL) && allowed.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    createWindow();
    createTray();

    powerMonitor.on('resume', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        logRecoveryEvent('system resumed, forcing repaint');
        mainWindow.webContents.invalidate();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // Tray keeps the app alive; do nothing here.
  });
}
