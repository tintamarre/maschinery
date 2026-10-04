# Sample packs

Put audio files (wav, mp3, ogg, flac) in this folder and list them in `index.json`; they then show up in Browser → Sample packs and can be loaded into any group (first 16 files, one per pad).

```json
{
  "kits": [
    {
      "name": "My kit",
      "files": [
        { "name": "Kick", "url": "mykit/kick.wav" },
        { "name": "Snare", "url": "mykit/snare.wav" }
      ]
    }
  ]
}
```

`url` is relative to this folder (or an absolute https URL that allows cross-origin requests). Only add material you have the rights to publish: everything in `public/` is served from the public GitHub Pages site.
