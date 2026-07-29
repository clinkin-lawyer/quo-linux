# Quo for Linux (unofficial)

Quo (getquo.com, formerly OpenPhone) ships official desktop apps for Windows and macOS
only. This is a thin Electron wrapper around their own web app (`my.quo.com`) that
gives you a native-feeling desktop client on Linux — window, dock/taskbar icon, tray,
system notifications, and persistent login — without any official Linux support.

This is not affiliated with, endorsed by, or supported by Quo. It's just Electron
loading the same web app you'd otherwise use in a browser tab, wrapped for
convenience. No Quo code, assets, or credentials are bundled in this repo — the app
icon is fetched from Quo's own CDN at build time (see `scripts/fetch-icon.sh`),
never committed.

## Requirements

- Node.js 18+ and npm
- Linux with a working desktop session (X11 or Wayland)

## Run in dev mode

```
npm install
npm start
```

`npm install` triggers a `postinstall` step that pulls the app icon from Quo's CDN
into `build/icon.png` (gitignored — regenerated on every install).

## Build a real package

```
npm run dist
```

Produces an AppImage and a `.deb` in `release/`. Install the `.deb` with:

```
sudo apt install ./release/quo-linux_*.deb
```

This registers a proper app-menu entry ("Quo") with icon, and sets up the Electron
sandbox permissions automatically via the package's postinst script.

## Notes

- Login persists across restarts (standard Electron session storage in
  `~/.config/quo-linux`).
- Calls need mic access — `main.js` auto-approves microphone/notification
  permission requests for `my.quo.com` only.
- Login and OAuth navigate through `signin.openphone.com` (Quo's auth backend
  still runs on the legacy OpenPhone domain) — everything outside
  `quo.com` / `openphone.com` / `openphoneapi.com` opens in your system browser
  instead of inside the app window.
- If you hit "no microphone found" during a call, that's almost always a host-level
  PipeWire/ALSA issue, not this wrapper — check `pactl list cards` for an
  output-only active profile.

## License

MIT for the code in this repo. Quo's name, icon, and web app are their own
property — this project just points Electron at their public web app.
