import { App } from '@capacitor/app';
import { applyVolumes, sfx } from '../engine/audio';
import { spriteURL } from '../engine/sprites';
import type { Enemy } from '../game/enemies';
import type { Game, RunSummary, ShopItem, UIHooks } from '../game/game';
import type { Hud } from '../game/hud';
import { loadRun, META_UPGRADES, meta, metaLevel, saveMeta, saveSettings, saveStats, settings, stats } from '../game/profile';
import { FLOORS_TO_WIN } from '../game/themes';
import { HEROES, Upgrade, UPGRADE_BY_ID } from '../game/upgrades';

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v !== undefined && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const icon = (name: string, cls = 'icon') => h('img', { src: spriteURL(name, 2), class: cls, alt: '', draggable: 'false' });

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Menus implements UIHooks {
  private root: HTMLElement;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    this.root = document.getElementById('ui')!;
  }

  private screen(cls: string, ...children: Child[]): HTMLElement {
    this.root.replaceChildren();
    // a 'Back' button built for this screen becomes the Android back action
    this.backAction = this.pendingBack;
    this.pendingBack = null;
    const el = h('div', { class: `screen ${cls}` }, ...children);
    this.root.append(el);
    return el;
  }

  close(): void {
    this.root.replaceChildren();
    this.backAction = null;
  }

  /** What the Android back button does on the current menu screen. */
  private backAction: (() => void) | null = null;
  private pendingBack: (() => void) | null = null;

  get hasBack(): boolean {
    return !!this.backAction;
  }

  back(): void {
    if (this.backAction) {
      sfx('click');
      this.backAction();
    } else if (this.game.state === 'menu') App.exitApp();
    else if (this.game.state === 'dead' || this.game.state === 'victory') this.title();
  }

  private btn(label: Child, onclick: () => void, cls = ''): HTMLButtonElement {
    if (label === 'Back') this.pendingBack = onclick;
    return h(
      'button',
      {
        class: `btn ${cls}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          sfx('click');
          onclick();
        },
      },
      label,
    );
  }

  // ============================================================ title
  title(): void {
    this.game.state = 'menu';
    const run = loadRun();
    const heroes = h('div', { class: 'title-heroes' }, ...HEROES.map((hr) => icon(hr.sprite, 'title-hero')));
    this.screen(
      'title',
      h('div', { class: 'title-logo' }, h('div', { class: 'logo-small' }, 'Descend into the'), h('h1', {}, 'Dungeon Delve')),
      heroes,
      h(
        'div',
        { class: 'menu-col' },
        run && this.btn(h('span', {}, `Continue — Floor ${run.floor}`), () => this.startContinue(), 'primary'),
        this.btn(run ? 'New Run' : 'Play', () => this.heroSelect(), run ? '' : 'primary'),
        this.btn(h('span', {}, 'Soul Shrine ', h('span', { class: 'souls' }, `◆ ${meta.souls}`)), () => this.shrine()),
        h('div', { class: 'row' }, this.btn('Settings', () => this.settings(() => this.title())), this.btn('Records', () => this.records())),
      ),
      h('div', { class: 'footer' }, 'Art: Dungeon Crawl Stone Soup tiles (CC0)'),
    );
  }

  private startContinue(): void {
    const run = loadRun();
    if (!run) return this.title();
    this.close();
    this.game.continueRun(run);
  }

  heroSelect(): void {
    const run = loadRun();
    const cards = HEROES.map((hr) => {
      const unlocked = meta.unlocked.includes(hr.id);
      const s = hr.stats;
      const card = h(
        'div',
        { class: `card hero-card ${unlocked ? '' : 'locked'} ${meta.hero === hr.id ? 'selected' : ''}` },
        icon(hr.sprite, 'hero-img'),
        h('h3', {}, hr.name),
        h('p', {}, hr.blurb),
        h('div', { class: 'stat-line' }, `HP ${s.maxHp ?? 100}`, h('span', {}, ' · '), `Speed ${s.speed ?? 105}`),
        unlocked
          ? this.btn('Choose', () => {
              meta.hero = hr.id;
              saveMeta();
              this.close();
              if (!stats.seenTutorial) this.tutorial(() => this.game.newRun(hr.id));
              else this.game.newRun(hr.id);
            }, 'primary')
          : this.btn(`Unlock ◆ ${hr.cost}`, () => {
              if (meta.souls < hr.cost) return sfx('deny');
              meta.souls -= hr.cost;
              meta.unlocked.push(hr.id);
              saveMeta();
              sfx('buy');
              this.heroSelect();
            }, meta.souls >= hr.cost ? 'gold' : 'disabled'),
      );
      return card;
    });
    this.screen(
      'heroes',
      h('h2', {}, 'Choose your hero'),
      run && h('p', { class: 'warn' }, 'Starting a new run will abandon your saved run.'),
      h('div', { class: 'cards' }, ...cards),
      h('div', { class: 'row' }, this.btn('Back', () => this.title()), h('span', { class: 'souls' }, `◆ ${meta.souls} souls`)),
    );
  }

  private shrine(): void {
    const rows = META_UPGRADES.map((u) => {
      const lvl = metaLevel(u.id);
      const maxed = lvl >= u.max;
      const cost = u.cost(lvl);
      return h(
        'div',
        { class: 'shrine-row' },
        icon(u.icon),
        h('div', { class: 'grow' }, h('b', {}, u.name), h('div', { class: 'pips' }, ...Array.from({ length: u.max }, (_, i) => h('span', { class: i < lvl ? 'pip on' : 'pip' }))), h('small', {}, maxed ? u.desc(lvl) : `Next: ${u.desc(lvl + 1)}`)),
        maxed
          ? h('span', { class: 'maxed' }, 'MAX')
          : this.btn(`◆ ${cost}`, () => {
              if (meta.souls < cost) return sfx('deny');
              meta.souls -= cost;
              meta.levels[u.id] = lvl + 1;
              saveMeta();
              sfx('buy');
              this.shrine();
            }, meta.souls >= cost ? 'gold' : 'disabled'),
      );
    });
    this.screen(
      'shrine',
      h('h2', {}, 'Soul Shrine'),
      h('p', { class: 'sub' }, 'Souls are earned on every run — spend them on permanent power.'),
      h('div', { class: 'souls big' }, `◆ ${meta.souls}`),
      h('div', { class: 'list' }, ...rows),
      this.btn('Back', () => this.title()),
    );
  }

  settings(back: () => void): void {
    const slider = (label: string, key: 'music' | 'sfx') =>
      h(
        'label',
        { class: 'setting' },
        h('span', {}, label),
        h('input', {
          type: 'range',
          min: '0',
          max: '1',
          step: '0.05',
          value: String(settings[key]),
          oninput: (e: Event) => {
            settings[key] = Number((e.target as HTMLInputElement).value);
            applyVolumes();
            saveSettings();
          },
          onchange: () => sfx('coin'),
        }),
      );
    const toggle = (label: string, key: 'vibration' | 'shake' | 'damageNumbers' | 'lefty') => {
      const b = this.btn(settings[key] ? 'On' : 'Off', () => {
        settings[key] = !settings[key];
        saveSettings();
        b.textContent = settings[key] ? 'On' : 'Off';
        b.classList.toggle('on', settings[key]);
        this.game.input.lefty = settings.lefty;
      }, `toggle ${settings[key] ? 'on' : ''}`);
      return h('div', { class: 'setting' }, h('span', {}, label), b);
    };
    const fs = document.fullscreenEnabled
      ? h(
          'div',
          { class: 'setting' },
          h('span', {}, 'Fullscreen'),
          this.btn('Toggle', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))),
        )
      : null;
    this.screen(
      'settings',
      h('h2', {}, 'Settings'),
      h('div', { class: 'list' }, slider('Music', 'music'), slider('Sound', 'sfx'), toggle('Vibration', 'vibration'), toggle('Screen shake', 'shake'), toggle('Damage numbers', 'damageNumbers'), toggle('Left-handed controls', 'lefty'), fs),
      this.btn('Back', back),
    );
  }

  private records(): void {
    const row = (k: string, v: string) => h('div', { class: 'record' }, h('span', {}, k), h('b', {}, v));
    this.screen(
      'records',
      h('h2', {}, 'Records'),
      h(
        'div',
        { class: 'list' },
        row('Runs', String(stats.runs)),
        row('Victories', String(stats.wins)),
        row('Deepest floor', String(stats.bestFloor)),
        row('Fastest victory', stats.bestTime ? fmtTime(stats.bestTime) : '—'),
        row('Monsters slain', String(stats.kills)),
        row('Bosses slain', String(stats.bossKills)),
      ),
      h(
        'p',
        { class: 'sub' },
        'Controls — Touch: drag on the left to move; bolts fire automatically; buttons for Slash, Nova and Dash. Keyboard: WASD/arrows, J slash, K nova, L/Shift dash, Esc pause.',
      ),
      this.btn('Back', () => this.title()),
    );
  }

  private tutorial(then: () => void): void {
    const tip = (ic: string, title: string, body: string) => h('div', { class: 'tip' }, icon(ic), h('div', {}, h('b', {}, title), h('p', {}, body)));
    this.screen(
      'tutorial',
      h('h2', {}, 'How to play'),
      h(
        'div',
        { class: 'tips' },
        tip('ic_swift', 'Move', 'Drag anywhere on the left half of the screen.'),
        tip('ic_dart', 'Bolts', 'Fire automatically at the nearest enemy you can see.'),
        tip('ic_sword', 'Slash', 'Heavy melee arc that also destroys enemy bullets.'),
        tip('ic_blast', 'Nova', 'Damaging, slowing aura that wipes nearby bullets.'),
        tip('ic_blink', 'Dash', 'A quick dodge — you are invulnerable while dashing.'),
        tip('orb', 'Descend', `Clear rooms, level up, defeat the boss of each floor. Beat floor ${FLOORS_TO_WIN} to win.`),
      ),
      this.btn("Let's go", () => {
        stats.seenTutorial = true;
        saveStats();
        this.close();
        then();
      }, 'primary'),
    );
  }

  // ============================================================ in-game modals
  levelUp(options: Upgrade[], title: string, onPick: (u: Upgrade | null) => void, canSkip = false): void {
    const owned = this.game.player.upgrades;
    const count = (id: string) => owned.filter((x) => x === id).length;
    let picked = false;
    const cards = options.map((u) =>
      h(
        'button',
        {
          class: `card upgrade ${u.rarity}`,
          onclick: () => {
            if (picked) return;
            picked = true;
            sfx('buy');
            this.close();
            onPick(u);
          },
        },
        h('div', { class: 'rarity' }, u.rarity),
        icon(u.icon, 'up-icon'),
        h('h3', {}, u.name),
        h('p', {}, u.desc),
        h('div', { class: 'stack' }, `${count(u.id)} / ${u.max}`),
      ),
    );
    const el = this.screen(
      'levelup',
      h('h2', {}, title === 'Treasure' ? 'Treasure!' : 'Level up!'),
      h('p', { class: 'sub' }, title === 'Treasure' ? 'Claim one relic' : `${title} — choose an upgrade`),
      h('div', { class: 'cards' }, ...cards),
      canSkip &&
        this.btn('Leave it', () => {
          this.close();
          onPick(null);
          this.game.closeModal();
        }),
    );
    // brief input guard so a thumb already on the screen doesn't pick by accident
    el.style.pointerEvents = 'none';
    setTimeout(() => (el.style.pointerEvents = ''), 350);
  }

  shop(items: ShopItem[], buy: (i: number) => boolean): void {
    const render = () => {
      const rows = items.map((it, i) => {
        const up = it.upgrade ? UPGRADE_BY_ID.get(it.upgrade) : undefined;
        const name = it.kind === 'potion' ? 'Healing Draught' : it.kind === 'vitality' ? 'Vitality Tonic' : up!.name;
        const desc = it.kind === 'potion' ? 'Restore 50% of your health' : it.kind === 'vitality' ? '+25 max HP' : up!.desc;
        const ic = it.kind === 'potion' ? 'potion' : it.kind === 'vitality' ? 'ic_heal' : up!.icon;
        const afford = this.game.gold >= it.price;
        return h(
          'div',
          { class: `shrine-row ${it.sold ? 'sold' : ''}` },
          icon(ic),
          h('div', { class: 'grow' }, h('b', {}, name), h('small', {}, desc)),
          it.sold
            ? h('span', { class: 'maxed' }, 'SOLD')
            : this.btn(`${it.price} g`, () => {
                buy(i);
                render();
              }, afford ? 'gold' : 'disabled'),
        );
      });
      this.screen(
        'shop',
        h('h2', {}, 'Wandering Merchant'),
        h('div', { class: 'gold big' }, `${this.game.gold} gold`),
        h('div', { class: 'list' }, ...rows),
        this.btn('Leave', () => {
          this.close();
          this.game.closeModal();
        }),
      );
    };
    render();
  }

  pause(): void {
    const g = this.game;
    const p = g.player;
    const ups = new Map<string, number>();
    for (const id of p.upgrades) ups.set(id, (ups.get(id) ?? 0) + 1);
    const build = h(
      'div',
      { class: 'build' },
      ...[...ups.entries()].map(([id, n]) => {
        const u = UPGRADE_BY_ID.get(id);
        return u ? h('div', { class: 'build-item', title: `${u.name}: ${u.desc}` }, icon(u.icon), n > 1 ? h('span', {}, `×${n}`) : null) : null;
      }),
    );
    this.screen(
      'pause',
      h('h2', {}, 'Paused'),
      h('p', { class: 'sub' }, `Floor ${g.floorNum} · ${g.floor.theme.name} · ${fmtTime(g.time)} · ${g.kills} kills`),
      ups.size ? build : h('p', { class: 'sub' }, 'No upgrades yet'),
      h(
        'div',
        { class: 'menu-col' },
        this.btn('Resume', () => this.resume(), 'primary'),
        this.btn('Settings', () => this.settings(() => this.pause())),
        this.btn('Save & quit', () => {
          // the run resumes from the start of this floor
          this.title();
        }),
      ),
      h('p', { class: 'sub small' }, 'Runs are saved at the start of each floor.'),
    );
  }

  resume(): void {
    this.close();
    if (this.game.state === 'paused') this.game.state = 'play';
    this.game.input.reset();
  }

  dead(s: RunSummary): void {
    this.summary('You died', s);
  }

  victory(s: RunSummary): void {
    this.summary('Victory!', s, true);
  }

  private summary(title: string, s: RunSummary, victory = false): void {
    const hero = HEROES.find((x) => x.id === s.hero)!;
    const row = (k: string, v: string) => h('div', { class: 'record' }, h('span', {}, k), h('b', {}, v));
    this.screen(
      `summary ${victory ? 'win' : 'lose'}`,
      h('h2', {}, title),
      icon(hero.sprite, 'hero-img'),
      h(
        'div',
        { class: 'list' },
        row('Floor reached', String(s.floor)),
        row('Level', String(s.level)),
        row('Monsters slain', String(s.kills)),
        row('Bosses slain', String(s.bossKills)),
        row('Time', fmtTime(s.time)),
      ),
      h('div', { class: 'souls big' }, `+◆ ${s.souls} souls`),
      h(
        'div',
        { class: 'menu-col' },
        victory &&
          this.btn('Continue — Endless mode', () => {
            this.close();
            this.game.continueEndless();
          }, 'primary'),
        this.btn(victory ? 'New run' : 'Try again', () => this.heroSelect(), victory ? '' : 'primary'),
        this.btn('Soul Shrine', () => this.shrine()),
        this.btn('Title', () => this.title()),
      ),
    );
  }

  banner(title: string, sub?: string): void {
    this.hud.banner(title, sub);
  }

  bossBar(e: Enemy | null): void {
    this.hud.setBoss(e);
  }
}
