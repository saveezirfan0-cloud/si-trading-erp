# iOS Splash Screens

Place PNG splash images here for iOS Add-to-Home-Screen loading screens.

## Required files
| File                     | Device                        | Size (px)   |
|--------------------------|-------------------------------|-------------|
| splash-1290x2796.png     | iPhone 16 Pro Max / 15 Plus   | 1290 × 2796 |
| splash-1179x2556.png     | iPhone 16 / 15 Pro            | 1179 × 2556 |
| splash-750x1334.png      | iPhone SE / 8                 | 750 × 1334  |

## Quick generation
Use https://progressier.com/pwa-screenshots-and-icons or run:

```
npx pwa-asset-generator logo512.png ./public/splash \
  --background "#0d0f14" \
  --splash-only \
  --portrait-only
```

Until you add these, iOS will fall back to a white/black launch screen,
which is fine — the app will still work perfectly.
