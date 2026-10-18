# Dungeon Delve

A fast, mobile-first roguelite dungeon crawler. Fight through five themed floors
of procedurally generated rooms, level up with stacking upgrades, beat each
floor's boss, and spend souls on permanent power between runs.

Built for phones in landscape (touch controls), and also plays with keyboard or
a gamepad in any desktop browser.

## Install on your Android phone (Pixel)

**APK (recommended)** — every push builds a signed APK on GitHub Actions and
publishes it to a rolling pre-release:

1. On the phone, open the repo's **Releases** page and pick
   `Dungeon Delve (latest <branch> build)`, or go straight to
   `https://github.com/CircuitCoder-ngh/dungeonGame/releases/download/latest-<branch>/DungeonDelve.apk`
   (for `main`: `latest-main`).
2. Download `DungeonDelve.apk` and open it. Android will ask you to allow
   installs from your browser ("Install unknown apps") the first time.
3. Later builds install over the old one and keep your progress, because CI
   always signs with the same key.

**Web / PWA** — the `Deploy to GitHub Pages` workflow publishes the game on
pushes to `main` (enable it once in *Settings → Pages → Source: GitHub Actions*).
Open the page in Chrome on the phone and choose *Add to Home screen / Install app*;
it then runs full-screen and works offline.

## How to play

| | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Move | drag on the left half | WASD / arrows | left stick |
| Bolts | automatic — aim at the nearest visible enemy | | |
| Slash (destroys bullets) | big button | J / Space | A |
| Nova (damage aura, wipes bullets) | top button | K / E | X / Y |
| Dash (invulnerable) | small button | L / Shift | B / RB |
| Pause | ❚❚ top-right | Esc / P | Start |

- Rooms lock until every monster is dead. Some rooms have two waves.
- Each level-up offers three upgrades (bolt, slash, nova, dash, defence and
  summon builds stack and combine).
- Special rooms: **treasure** (free rare relic), **merchant** (spend gold),
  **fountain** (heal), and the **boss** (stairs down appear when it falls).
- Floors: The Crypt → The Sewers → The Ossuary → Frozen Depths → The Inferno.
  Beat the Balrug to win, then keep going in endless mode.
- Souls are earned every run; spend them in the **Soul Shrine** on permanent
  upgrades and to unlock the Arcanist and the Ranger.
- Runs are checkpointed at the start of every floor, so closing the app is safe.

## Development

```bash
npm install
npm run dev          # http://localhost:5173 (use --host to test on a phone on your LAN)
npm run build        # type-check + production build into dist/
npm run android:sync # build and copy into the Android project
```

Building the APK locally needs the Android SDK (Android Studio): after
`npm run android:sync`, run `./gradlew assembleRelease` in `android/` or open the
folder in Android Studio.

### Layout

- `src/engine/` — sprites/atlas, input (virtual joystick, keyboard, gamepad),
  WebAudio synth sound effects and generative music, local saves.
- `src/game/` — dungeon generation, collision and flow-field pathfinding,
  player, enemies (generator-based AI "brains"), bosses, upgrades, renderer
  (pixel-scaled world + dynamic lighting) and HUD.
- `src/ui/` — DOM menus and styles.
- `art/tiles/` — the individual sprites; `python3 tools/build_atlas.py` packs
  them into `public/assets/atlas.png` + `src/assets/atlas.json`.
- `android/` — Capacitor Android project (landscape, immersive full-screen).
- `legacy/` — the original pygame prototype, kept for reference
  (run `python legacy/Game.py` from inside `legacy/`).

## Credits

Sprites: [Dungeon Crawl Stone Soup](https://github.com/crawl/crawl) tiles,
public domain / CC0. Font: Pixelify Sans (SIL Open Font License). All sound is
synthesised at runtime.
