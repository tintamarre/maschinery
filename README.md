# Maschinery

Groovebox dans le navigateur, inspiré de la Native Instruments Maschine MK3 : 8 groupes × 16 pads, sons synthétisés ou samples, séquenceur par patterns/scènes, arrangement, mixeur, effets, sampling, MIDI et export WAV. Vue 3 + Vite + Tailwind + Web Audio API, publié sur GitHub Pages : https://tintamarre.github.io/maschinery/

## Prérequis et commandes

Node 20+ et npm.

```bash
npm install
npm run dev      # serveur de dev (http://localhost:5173/maschinery/)
npm test         # tests unitaires (vitest)
npm run build    # vue-tsc + build de production dans dist/
```

En mode dev, le store est exposé sur `window.__m` (pratique pour piloter l'app depuis la console ou un test navigateur). Penser à `__m.setOutputMute(true)` pour tester en silence.

## Fonctionnalités

- 16 pads vélocité (position du clic, pression tactile/stylet, MIDI), 8 groupes A–H, kits (808, 909, Lo-Fi, Techno, Synth Lab, Samples)
- Modes de pads : Pad, Keys (gammes, tonique, octave), Chords (triades, 7es, power, sus), Step, Scene, Pattern
- Séquenceur 96 PPQ : patterns de 1 à 4 mesures (16 par groupe), swing, quantification, count-in, métronome, enregistrement overdub avec compensation de latence, note repeat, erase, undo/redo
- Scènes (16) et arrangement (Song), changement de pattern synchronisé en fin de pattern
- Sons : 15 moteurs (kick, snare, clap, hat, tom, rim, cowbell, perc FM, shaker, crash, bass, lead, pluck, pad, sample), filtre, drive, envoi reverb/delay, groupes de choke
- Sampler : fichiers audio (glisser-déposer sur un pad), enregistrement micro, trim, découpe en 16 tranches ou par transitoires
- Mixeur (groupes et sons, mute/solo, vumètres), master (compresseur, reverb, delay synchronisé), Perform FX (filtre via la touch strip, stutter, reverb/delay throw)
- Web MIDI (Chrome/Edge) : notes 36–51 = pads, CC 70–77 = potards, CC 1 = touch strip, pitch bend, start/stop
- Sauvegarde automatique (localStorage + IndexedDB pour les samples), slots nommés, export/import JSON (samples inclus), bounce WAV hors-ligne (patterns ou song)
- Interface à taille fixe mise à l'échelle pour tenir dans la fenêtre : jamais de scroll (paysage et portrait)

## Raccourcis clavier

| Touche | Action |
|---|---|
| `Z X C V` / `A S D F` / `Q W E R` / `1 2 3 4` | Pads 1–16 (rangée du bas en premier) |
| `Espace` / `Entrée` | Play-stop / enregistrement |
| `B` `G` `N` `T` | Note repeat / vélocité fixe / métronome / tap tempo |
| `Retour arrière`, `Shift`, `Alt`, `M`, `L` (maintenir) | Erase, Duplicate, Select, Mute, Solo |
| `Tab` | Mode de pads suivant |
| `←` `→` / `↑` `↓` | Groupe précédent-suivant / tempo ±1 (Shift : ±10) |
| `,` `.` | Octave −/+ |
| `Cmd/Ctrl+Z` (+Shift) | Undo / redo des patterns |

## Architecture

```
src/core/constants.ts   résolution (PPQ), gammes, taux de répétition
src/core/types.ts       modèle de données (projet, groupe, son, pattern, événement)
src/core/voices.ts      moteurs de synthèse (un Voice par déclenchement)
src/core/engine.ts      graphe audio : strips -> bus de groupe -> master + sends, utilisable en direct ou hors-ligne
src/core/sequencer.ts   horloge (Web Worker, lookahead), lecture, swing, scènes, song, enregistrement
src/core/pattern.ts     opérations pures sur les patterns
src/core/project.ts     kits, projet de démo, migration
src/core/samples.ts     registre de samples, IndexedDB, WAV, micro, détection de transitoires
src/core/midi.ts        Web MIDI
src/core/bounce.ts      rendu OfflineAudioContext vers WAV
src/store.ts            état réactif et actions (pads, transport, potards, projets)
src/components, views   composants matériels et écrans
```

Notes de conception :

- Les événements sont stockés en ticks (24 ticks = une double-croche). Le swing déforme linéairement chaque paire de doubles-croches ; l'enregistrement applique la déformation inverse pour que la quantification se fasse sur la grille droite.
- L'engine reçoit un `BaseAudioContext`, donc le même code sert à la lecture live et au bounce hors-ligne.
- Le bouton Mute de l'en-tête coupe uniquement la sortie haut-parleurs (les vumètres et les bounces ne sont pas affectés).

## Déploiement

Push sur `main` : le workflow `.github/workflows/deploy.yml` lance les tests, build et publie `dist/` sur GitHub Pages (Settings → Pages → Source : GitHub Actions). Le `base` de Vite est `/maschinery/`.
