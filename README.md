# Watch out for the monsters, boo 👻

**Play it:** https://bob-obringer.github.io/watch-out-for-the-monsters-boo/

A spooky-but-cute 3D hex builder. You're **Boo**, a little black cat on an island at night.

- 🎃 **Pumpkin Patch**, 🧪 **Witch Pot** and 🏰 **Haunted Castle** make candy. Tap the floating candy to grab it.
- Tap the grey tiles with a 🍬 price to buy more land.
- Monsters crawl out of **The Dark** (the black fog with the eyes). When they reach your stuff
  they **chase Boo**, and if they catch Boo you drop candy.
  **Tap a monster** and Boo runs over and yells **BOO!** It runs away and drops candy.
- 👁️ Eyeball spiders are the most common (they stare at you). Giant ones need 3 BOOs.
- 🏮 **Lanterns** scare away monsters that wander into their light, and Boo runs to them to hide.
- Sometimes the moon turns red… *watch out for the monsters, boo!* A giant eyeball comes too.
- 👻 The **Hide!** button makes Boo invisible for a few seconds, so monsters lose track of Boo.
- 🏰 The Haunted Castle zaps nearby monsters with lightning.
- 🪦 Tap the **Graveyard** sign in The Dark to open the Spooky Graveyard (🍬 400). Zombies rise from its graves.
- Tap a building to level it up (up to ★★★). The goal card at the top left gives bonus candy.

Drag to move around, pinch (or scroll) to zoom. The game saves on its own; ⚙️ → Start Over resets.

## Run it locally

```bash
npm install
npm run dev
```

Open the "Network" address it prints (e.g. `http://192.168.x.x:5173`) in Safari on the iPad
(same Wi-Fi). Share → **Add to Home Screen** makes it fullscreen like a real app.

Every push to `main` rebuilds and redeploys the site with GitHub Actions.

## Tweaking

- Game rules (costs, candy amounts, lantern size, goals): top of `src/main.js`
- 3D models (pumpkins, monsters, Boo, house): `src/models.js`
- Sounds and music (all synthesized): `src/audio.js`
- Console helpers: `game.addCandy(100)`, `game.spawnMonster()`, `game.giant()`, `game.zombie()`, `game.thunder()`, `game.startWave()`
