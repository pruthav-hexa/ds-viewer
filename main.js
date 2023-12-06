// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog, Menu, clipboard } = require('electron')
const path = require('path')
const config = require('./config/config');
const { exec } = require('child_process');

const log = require('electron-log');

const { autoUpdater } = require('electron-updater');


log.transports.file.level = 'info';
log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
autoUpdater.autoDownload = false;
function logger(level, msg){
  if (config.NODE_ENV === "development") {
    console[level](msg)
  } else {
    log[level](msg)
  }
}

const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Restart',
        click: () => {
          logger('info', `App relaunch executed...`)
          app.relaunch();
          app.exit();
        },
      },
      {
        label: 'Exit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          logger('info', `App quit executed...`)
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Get System Details',
        click: () => {
          logger('info', `Get System Details clicked...`)
          exec(`explorer "${log.transports.file.getFile()}"`);
          mainWindow.webContents.send('message', "show-system-details");
        },
      },
      {
        label: 'Open Logs',
        click: () => {
          exec(`explorer "${log.transports.file.getFile()}"`);
        },
      },
    ],
  },
  // {
  //   label: app.getVersion(),
  //   submenu:[]
  // }
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));

let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    frame: true,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, './scripts/preload.js')
    }
  })

  mainWindow.loadFile('index.html')
  // mainWindow.setMenu(null)
  logger('info', `App started with ${config.NODE_ENV} env.`)
  if (config.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools()
  }
  let appVersion = app.getVersion();
  mainWindow.webContents.send('app-version', appVersion);
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {

    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on("send-alert", (event, message) => {
  
  if (message === 'system-not-allowed') {
    logger('info', `main app received for show system info`)
    let child = new BrowserWindow({
      width: 700,
      height: 350,
      parent: mainWindow,
      modal: true,
      closable: true,
      resizable: false,
      minimizable: false,
      closable: false,
      webPreferences: {
        preload: path.join(__dirname, './scripts/preload-restrict.js')
      }
    })

    child.setMenu(null)
    child.loadFile('./html/not-allowed.html')
    if (config.NODE_ENV === "development") {
      child.webContents.openDevTools()
    }
    child.show()

  } else if (message === 'close-application') {
    logger('info', `main app received for exit application : ${message}`)
    app.quit();
  } else {
    logger('info', `main app received for showing alert : ${message}`)
    const options = {
      type: "none",
      buttons: ["Ok"],
      title: "Alert Message",
      message: message
    }
    dialog.showMessageBox(options)
  }

})


ipcMain.on('check-for-update', (event) => {
  logger('info', `check if update is available`)
  autoUpdater.checkForUpdates(); // Initiates update check
});

autoUpdater.on('update-available', (e) => {
  logger('info', `update(${e.version}) is available for download`)
  mainWindow.webContents.send('update-available', e);
});

autoUpdater.on('update-not-available', (e) => {
  mainWindow.webContents.send('update-not-available', e);
});


ipcMain.on('show-update-dialog', (e, version) => {
  dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Update', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update available',
    message: `A new version(${version}) of the app is available. Would you like to update now?`
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
      logger('info', `update downloading `)
      mainWindow.webContents.send('download-progress');
      autoUpdater.on('update-downloaded', () => {
        setTimeout(() => {
          setImmediate(() => {
            logger('info', `update downloaded `)
            autoUpdater.quitAndInstall();
          });
        }, 10000);
      });
    } else {
      logger('info', `quit `)
      app.quit();
    }
  });
});

autoUpdater.on('error', (message) => {
  console.error('There was a problem updating the application')
  logger('error', `message: ${message}`)
})
