# Game packages

Drop provider game packages here — one directory per game:

```
games/
└── your-game/
    └── index.js     # exports createPlugin(): GamePlugin
```

The platform discovers them at boot, validates their metadata, and registers
them in the `installedPlugins` collection (enable/disable there). The platform
ships zero games — everything playable comes from this directory.

See `../../docs/GAME_PROVIDER_GUIDE.md` for the full integration contract.
