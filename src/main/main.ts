/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import {
  AppUpdater,
  NsisUpdater,
  AppImageUpdater,
  MacUpdater,
} from 'electron-updater';
import log from 'electron-log';
import { AllPublishOptions } from 'electron-updater/node_modules/builder-util-runtime';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

let mainWindow: BrowserWindow | null = null;
const appVersion = app.getVersion();

export default class Updater {
  constructor() {
    log.transports.file.level = 'info';
    log.log(`Logpath: ${log.transports.file.getFile().path}`);

    let updater: AppUpdater;

    const apiUrl = 'https://localhost:5004/api';
    // const GHToken = ''; Specify a github token if using private repository.

    const options: AllPublishOptions = {
      provider: 'generic',
      url: `${apiUrl}/update/${process.platform}/${app.getVersion()}`,
      requestHeaders: {
        // Authorization: `Bearer ${GHToken}`, Specify a github token if using private repository.
        accept: 'application/octet-stream',
      },
    };

    if (process.platform === 'win32') {
      updater = new NsisUpdater(options);
    } else if (process.platform === 'darwin') {
      updater = new MacUpdater(options);
    } else {
      updater = new AppImageUpdater(options);
    }

    updater.allowDowngrade = true;
    updater.logger = log;
    updater.addListener('checking-for-update', () => {
      mainWindow?.setTitle('Checking for update');
    });
    updater.addListener('update-available', ({ version }: any) => {
      mainWindow?.setTitle(`Version: ${version} is available`);
    });
    updater.addListener('update-not-available', () => {
      mainWindow?.setTitle(`${appVersion}: Up to date.`);
    });
    updater.addListener('error', (e: Error) => {
      log.log(`${appVersion}: Update error: ${e}`);
      mainWindow?.setTitle(
        `${appVersion}: Update error check logfile: ${
          log.transports.file.getFile().path
        }`
      );
    });
    updater.addListener('update-downloaded', () => {
      mainWindow?.setTitle(
        `${appVersion}: Update downloaded, Restart to install`
      );
    });

    updater.checkForUpdates();
  }
}

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  // if (isDevelopment) {
  await installExtensions();
  // }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    title: `AutoUpdateElectronApp v${app.getVersion()}`,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      enableRemoteModule: true,
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  // @TODO: Use 'ready-to-show' event
  //        https://github.com/electron/electron/blob/main/docs/api/browser-window.md#using-ready-to-show-event
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new Updater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(createWindow).catch(console.log);

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
});
