import { app, shell, dialog, BrowserWindow, components, Menu, ipcMain, MenuItem, Tray, MenuItemConstructorOptions, webContents } from 'electron';
import path from 'path'
import fs from 'fs'
import { Player } from './player';
import { MPRISIntegration } from './integration/mpris';
import { MKPlaybackState, MKRepeatMode, WebsiteType } from './@types/enums';
import { DiscordIntegration } from './integration/discord';
import { AppConfig } from './config';
import { LastFMClient } from './lastfm/client';
import { AM_BASE_URL, AM_CLASSICAL_BASE_URL, LASTFM_CREDS, parseCookie } from './utils';
import { LastFMIntegration } from './integration/lastfm';
import { TrackMetadata } from './@types/interfaces';
import log4js from 'log4js'
import os from 'node:os'

const logger = log4js.getLogger('amwrapper-main')
logger.level = 'debug'

let mainWindow: Electron.BrowserWindow;
let amWebContents: Electron.WebContents;
const currentPlatform = os.platform()
logger.debug('current operating system:', currentPlatform)

if (currentPlatform === 'linux') {
    app.commandLine.appendSwitch(
        'enable-features',
        'UseOzonePlatform,WaylandWindowDecorations',
    );
    app.commandLine.appendSwitch('disable-features', 'MediaSessionService');
}

app.whenReady().then(async () => {
    const configHelper = new AppConfig(app, {
        currentWebsite: 'music',
        enableDiscordRPC: false,
        enableMPRIS: true,
        enableLastFm: true
    })
    const currentWebsite = configHelper.get('currentWebsite') ?? WebsiteType.Music
    const DEFAULT_TITLE = currentWebsite === WebsiteType.Music ? 'Apple Music' : 'Apple Music Classical'

    const getIconFilenames = (website: WebsiteType) => {
        // png used for tray (better compatibility), svg for in-app logo
        return {
            trayPng: website === WebsiteType.Music ? 'am-icon.png' : 'am-classical-icon.png',
            rendererSvg: website === WebsiteType.Music ? 'am-icon.svg' : 'am-classical-icon.svg'
        }
    }

    let player: Player;
    let lastFmIntegration: LastFMIntegration | null = null

    const lastFmClient = new LastFMClient(
        LASTFM_CREDS.apiKey,
        LASTFM_CREDS.apiSecret
    )

    function validateLfmAuthToken(player: Player) {
        const authToken = configHelper.get('lastFmAuthToken')
        logger.info('validating last.fm auth token', authToken)

        lastFmClient.validateAuthToken(authToken)
            .then(data => {
                configHelper.set('lastFmSession', {
                    username: data['session']['name'],
                    subscriber: data['session']['subscriber'],
                    token: data['session']['key']
                })
                configHelper.delete('lastFmAuthToken')
                loadLastFmIntegration(player)

                return
            })
            .catch(error => {
                logger.debug('failed to retrieve an actual last.fm token', error)
                configHelper.delete('lastFmAuthToken')
            })
    }

    let isQuitting = false
    
    logger.info("awaiting components to be ready")
    await components.whenReady()
    const resourcesPath = process.env.NODE_ENV === 'dev' ?
        __dirname.split(path.sep).slice(0, -1).join(path.sep)
        : process.resourcesPath

    const options = {
        icon: getIconFilenames(currentWebsite).trayPng,
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            plugins: true,
            webviewTag: true
        },
        //darkTheme: true,
        //show: false
    }
    Object.assign(options, configHelper.get('winBounds'))
    mainWindow = new BrowserWindow(options);
    
    // nativeTheme.themeSource = 'dark'
    mainWindow.setTitle(DEFAULT_TITLE)

    function loadLastFmIntegration(player: Player) {
        if (!configHelper.get('enableLastFm')) return
        
        const lastFmSession = configHelper.get('lastFmSession')

        if (typeof lastFmSession === 'object' && Object.prototype.hasOwnProperty.call(lastFmSession, "token")) {
            const token = lastFmSession['token']
          
            if (!player.hasIntegration("lastfm")) {
                const newInstance = new LastFMIntegration(player, currentWebsite, lastFmClient)
                newInstance.setSession(token)
                player.addIntegration(newInstance)
                return
            }
            
            const instance = player.getIntegration<LastFMIntegration>("lastfm")
            instance.setSession(token)
            player.enableIntegration("lastfm")
        } else {
            logger.debug('last.fm: tried to load lastfm integration, but the saved session is invalid')
        }
    }

    function switchWebsite(website: WebsiteType) {
        configHelper.set('currentWebsite', website)
        // restart the app
        app.relaunch()
        app.exit()
    }


    const playbackTemplate = (player: Player) => [
        {
            id: 'nowPlaying',
            label: player.metadata?.name ? `${player.metadata.name} - ${player.metadata.artistName}` : 'No music playing',
            enabled: false
        },
        { type: 'separator' },
        {
            label: '&Play/Pause',
            click: () => {
                player.playPause()
            }
        },
        {
            label: '&Next',
            click: () => {
                player.next()
            }
        },
        {
            label: 'P&revious',
            click: () => {
                player.previous()
            }
        },
        { type: 'separator' },
        {
            label: '&Shuffle',
            type: 'checkbox',
            checked: player.shuffleMode,
            click: (menuItem: MenuItem) => {
                player.setShuffle(menuItem.checked)
            }
        },
        {
            label: '&Repeat',
            submenu: [
                {
                    label: 'None',
                    type: 'radio',
                    checked: player.repeatMode === MKRepeatMode.None,
                    click: () => {
                        player.setRepeat(MKRepeatMode.None)
                    }
                },
                {
                    label: '&Track',
                    type: 'radio',
                    checked: player.repeatMode === MKRepeatMode.One,
                    click: () => {
                        player.setRepeat(MKRepeatMode.One)
                    }
                },
                {
                    label: 'A&lbum/Playlist',
                    type: 'radio',
                    checked: player.repeatMode === MKRepeatMode.All,
                    click: () => {
                        player.setRepeat(MKRepeatMode.All)
                    }
                }
            ]
        }
    ]


    const createMenuTemplate = (player: Player, lastFmIntegration: LastFMIntegration | null) => [
        {
            id: 'File',
            label: '&File',
            submenu: [
                {
                    label: "Switch website",
                    submenu: [
                        {
                            label: 'Music',
                            type: 'checkbox',
                            checked: currentWebsite === 'music',
                            click: () => {
                                switchWebsite(WebsiteType.Music)
                            }
                        },
                        {
                            label: 'Classical',
                            type: 'checkbox',
                            checked: currentWebsite === 'classical',
                            click: () => {
                                switchWebsite(WebsiteType.Classical)
                            }
                        }
                    ]
                },
                {
                    label: '&Back',
                    click: () => {
                        amWebContents.navigationHistory.goBack()
                    }
                },
                {
                    label: '&Forward',
                    click: () => {
                        amWebContents.navigationHistory.goForward()
                    }
                },
                ...(process.env.NODE_ENV === 'dev' ? [
                    { type: 'separator' },
                    {
                        label: 'Reload',
                        click: () => {
                            amWebContents.reload()
                        }
                    },
                    {
                        label: 'Toggle DevTools',
                        click: () => {
                            amWebContents.toggleDevTools()
                        }
                    }
                ] : []),
                { type: 'separator' },
                {
                    label: 'Minimize to tray',
                    click: () => {
                        mainWindow.hide()
                        buildTrayMenu(player)
                    }
                },
                {
                    label: 'Quit',
                    click: () => {
                        isQuitting = true
                        app.quit()
                    }
                }
            ]
        },
        {
            id: 'playback',
            label: '&Playback',
            submenu: playbackTemplate(player)
        },
        {
            id: 'options',
            label: '&Options',
            submenu: [
                {
                    label: '&Discord integration',
                    type: 'checkbox',
                    checked: configHelper.get('enableDiscordRPC'),
                    click: (menuItem: MenuItem) => {
                        configHelper.set('enableDiscordRPC', menuItem.checked)
                    }
                },
                {
                    label: '&MPRIS integration',
                    type: 'checkbox',
                    checked: configHelper.get('enableMPRIS'),
                    click: (menuItem: MenuItem) => {
                        configHelper.set('enableMPRIS', menuItem.checked)
                    }
                },
                {
                    label: "&Last.fm",
                    submenu: [
                        {
                            label: 'Enabled',
                            type: 'checkbox',
                            checked: configHelper.get('enableLastFm'),
                            click: (menuItem: MenuItem) => {
                                configHelper.set('enableLastFm', menuItem.checked)
                            }
                        },
                        {
                            type: 'separator'
                        },
                        ...(configHelper.get('lastFmSession') ? [
                            {
                                label: configHelper.get('lastFmSession')['username'],
                                enabled: false
                            },
                            {
                                label: configHelper.get('lastFmSession')['subscriber'] === 1 ? 'Last.fm Pro' : 'Normal user',
                                checked: configHelper.get('lastFmSession')['subscriber'] === 1,
                                type: 'checkbox',
                                enabled: false
                            },
                            {
                                type: 'separator'
                            },
                            {
                                label: lastFmIntegration?.wasScrobbled ?
                                    'Scrobbled'
                                    : lastFmIntegration?.wasIgnored ? 'Scrobble ignored' :
                                        player.playbackState === MKPlaybackState.Playing ? 'Scrobbling' : 'Not playing',
                                type: 'checkbox',
                                checked: lastFmIntegration?.wasScrobbled,
                                enabled: false
                            },
                            {
                                type: 'separator'
                            },
                            {
                                label: 'Log &out...',
                                click: () => {
                                    configHelper.delete('lastFmAuthToken')
                                    configHelper.delete('lastFmSession')
                                }
                            }
                        ] : [
                            {
                                label: configHelper.get('lastFmAuthToken') ? 'Authenticate...' : 'Log in...',
                                click: async () => {
                                    if (!configHelper.get('lastFmAuthToken')) {
                                        const response = await lastFmClient.requestAuthToken()
                                        const authToken = response['token']
                                        configHelper.set('lastFmAuthToken', authToken)
                                        if (authToken) {
                                            logger.info('last.fm: successfully retrieved the session token, redirecting user to the authorization page')
                                            shell.openExternal(`http://www.last.fm/api/auth/?api_key=${LASTFM_CREDS.apiKey}&token=${authToken}`)
                                        }
                                    } else {
                                        validateLfmAuthToken(player)
                                    }
                                }
                            }
                        ])
                    ]
                }
            ]
        },
        {
            id: 'help',
            label: '&Help',
            submenu: [
                {
                    label: '&About',
                    click: async () => {
                        dialog.showMessageBox({
                            title: 'About',
                            message: 'am-wrapper',
                            detail: `A simple wrapper for Apple Music's website with some extra features like MPRIS and Discord RPC.\n\n
                            Disclaimer: This application is not an official Apple product. It is not endorsed, sponsored, or affiliated with Apple Inc. All trademarks, logos, and intellectual property are the property of their respective owners. Use of this app is at your own risk.\n\n
                            Version: ${app.getVersion()}`.split('\n').map(line => line.trim()).join('\n'),

                            buttons: ['Close']
                        })
                    }
                }
            ]
        }
    ] as Electron.MenuItemConstructorOptions[]

    const buildMainWindowMenu = async (player: Player, lastFmIntegration: LastFMIntegration | null) => {
        const menu = Menu.buildFromTemplate(createMenuTemplate(player, lastFmIntegration))
        Menu.setApplicationMenu(menu)
    }


    const { trayPng, rendererSvg } = getIconFilenames(currentWebsite)
    const tray = new Tray(path.join(resourcesPath, 'assets', trayPng))
    tray.setToolTip(DEFAULT_TITLE)
    //tray.on('click', () => mainWindow.show()) this crashes the app for me for some reason

    const buildTrayMenu = (player: Player) => {
        const menu = Menu.buildFromTemplate([
            ...playbackTemplate(player) as MenuItemConstructorOptions[],
            { type: 'separator' },
            mainWindow.isVisible() ? {
                label: 'Hide',
                click: () => {
                    mainWindow.hide()
                    buildTrayMenu(player)
                }
            } : {
                label: 'Show',
                click: () => {
                    mainWindow.show()
                    buildTrayMenu(player)
                }
            },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true
                    app.quit()
                }
            }
        ])
        tray.setContextMenu(menu)
    }

    const buildMenus = (player: Player, lastFmIntegration: LastFMIntegration | null) => {
        buildMainWindowMenu(player, lastFmIntegration)
        buildTrayMenu(player)
    }

    // this a workaround for the app not closing properly
    process.on('SIGINT', () => process.exit(0))

    mainWindow.on('page-title-updated', e => e.preventDefault())

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault()
            mainWindow.hide()
            buildTrayMenu(player)
            return false
        } else {
            configHelper.set('winBounds', mainWindow.getBounds())
            mainWindow.destroy()
            return true
        }
    })

    ipcMain.on('open-menu', () => {
        const menu = Menu.buildFromTemplate(createMenuTemplate(player, lastFmIntegration))
        menu.popup({ window: mainWindow })
    })

    const sendNavState = () => {
        if (!amWebContents) return
        const canGoBack = amWebContents.navigationHistory?.canGoBack?.() ?? false
        const canGoForward = amWebContents.navigationHistory?.canGoForward?.() ?? false
        mainWindow.webContents.send('nav-state', { back: canGoBack, forward: canGoForward })
    }

    ipcMain.on('nav', (_event, action: string) => {
        if (!amWebContents) return
        switch (action) {
            case 'back':
                if (amWebContents.navigationHistory.canGoBack()) {
                    amWebContents.navigationHistory.goBack()
                }
                break
            case 'forward':
                if (amWebContents.navigationHistory.canGoForward()) {
                    amWebContents.navigationHistory.goForward()
                }
                break
        }
        setTimeout(sendNavState, 50)
    })

    ipcMain.on('window', (_event, action: string) => {
        switch (action) {
            case 'minimize':
                mainWindow.minimize()
                break
            case 'maximize':
                if (mainWindow.isMaximized()) {
                    mainWindow.unmaximize()
                } else {
                    mainWindow.maximize()
                }
                break
            case 'close':
                app.quit()
                break
        }
    })

    //mainWindow.on('ready-to-show', () => mainWindow.show())

    try {
        if (!configHelper.get('storefrontId')) {
            const amResponse = await fetch(AM_BASE_URL)
            const setCookieResponse = amResponse.headers.get('Set-Cookie')
            if (setCookieResponse) {
                const cookie = parseCookie(setCookieResponse)
                const guessedGeo = cookie['geo']

                if (guessedGeo) {
                    logger.info(`guessed user location is ${guessedGeo}`)
                    configHelper.set('storefrontId', guessedGeo)
                }
            }
        }
    } catch (e) {
        logger.debug('failed to guess user location for setting the correct storefront.', e)
    }

    const guessedGeo = configHelper.get('storefrontId')
    const currentWebsiteURL = configHelper.get('currentWebsite') === "music" ? AM_BASE_URL : AM_CLASSICAL_BASE_URL
    logger.debug(`current geolocation: ${guessedGeo}, current website: ${currentWebsiteURL}`)

    let amUrl = currentWebsiteURL
    if (guessedGeo && typeof guessedGeo === 'string') {
        amUrl = `${currentWebsiteURL}/${guessedGeo.toLowerCase()}`
    }

    mainWindow.loadFile(path.join(resourcesPath, 'assets', 'index.html'))
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('init', {
            url: amUrl,
            preload: path.join(__dirname, 'preload.js'),
            icon: rendererSvg
        })
    })

    ipcMain.once('webview-ready', (_event, id: number) => {
        logger.debug("webview is ready")
        amWebContents = webContents.fromId(id)!

        player = new Player(ipcMain, amWebContents)
        if (configHelper.get('enableMPRIS') && currentPlatform === 'linux') {
            player.addIntegration(new MPRISIntegration(player))
        }

        if (configHelper.get('enableDiscordRPC')) {
            player.addIntegration(new DiscordIntegration(player, currentWebsite))
        }

        lastFmIntegration = loadLastFmIntegration(player) ?? null

        player.initialize()

        function loadScripts(filenames: Array<string>, stage: string) {
            filenames.forEach(async scriptFileName => {
                logger.info(`${stage}: loading ${scriptFileName}`)
                try {
                    await amWebContents.executeJavaScript(
                        fs.readFileSync(
                            path.join(resourcesPath, 'assets', 'userscripts', scriptFileName)
                        ).toString()
                    )
                } catch (e) {
                    logger.debug(`failed to load script ${scriptFileName}`, e)
                }
            })
        }

        amWebContents.on('did-finish-load', () => loadScripts(['musicKitHook.js', 'styleFix.js'], 'post-load'))
        amWebContents.on('did-finish-load', () => sendNavState())
        amWebContents.on('did-navigate-in-page', () => sendNavState())
        amWebContents.on('did-navigate', () => sendNavState())

        amWebContents.on('before-input-event', (event, input) => {
            if (input.alt && input.key === 'ArrowLeft') {
                amWebContents.navigationHistory.goBack()
                return
            }
            if (input.alt && input.key === 'ArrowRight') {
                amWebContents.navigationHistory.goForward()
                return
            }

            if (input.alt && input.shift && input.key.toLowerCase() === 'i') {
                amWebContents.openDevTools()
                return
            }
        })

        amWebContents.setWindowOpenHandler(() => {
            return { action: 'deny' }
        })

        player.on('nowPlaying', (metadata: TrackMetadata) => {
            if (metadata) {
                mainWindow.setTitle(`${metadata.name} - ${metadata.artistName} — ${DEFAULT_TITLE}`)
            }
            buildMenus(player, lastFmIntegration)
        })
        player.on('playbackState', ({ state }) => {
            if (player.metadata) {
                switch (state) {
                    case MKPlaybackState.Paused:
                        mainWindow.setTitle(`⏸ ${player.metadata?.name} - ${player.metadata?.artistName} — ${DEFAULT_TITLE}`)
                        break
                    case MKPlaybackState.Playing:
                        mainWindow.setTitle(`▶ ${player.metadata?.name} - ${player.metadata?.artistName} — ${DEFAULT_TITLE}`)
                        break
                    default:
                        mainWindow.setTitle(DEFAULT_TITLE)
                        break
                }
            } else {
                mainWindow.setTitle(DEFAULT_TITLE)
            }
            buildMenus(player, lastFmIntegration)
        })
        
        player.on('lfm:invalidsession', async () => {
            if (lastFmIntegration) {
                logger.info("disabling last.fm integration and removing session")
                configHelper.delete('lastFmSession')
                player.disableIntegration("lastfm")
            }
            await dialog.showMessageBox({
                title: "Invalid Last.fm session",
                message: "Your Last.fm session is expired, please log in again through the menus."
            })
        })
        player.on('lfm:scrobble', () => buildMenus(player, lastFmIntegration))
        player.on('shuffle', () => buildMenus(player, lastFmIntegration))
        player.on('repeat', () => buildMenus(player, lastFmIntegration))

        configHelper.on('setKey', () => buildMenus(player, lastFmIntegration))
        configHelper.on('deletedKey', () => buildMenus(player, lastFmIntegration))

        buildMenus(player, lastFmIntegration)
    })

    return
}).catch(logger.error);
