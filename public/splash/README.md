# iOS Splash Screens

These PNGs are the launch screens iOS shows while an Add-to-Home-Screen install
starts up. They are **generated from code**, not hand-drawn — do not edit them
by hand, they will be overwritten:

```bash
python3 tools/icons/generate_icons.py
```

| File                 | Device                      | Size (px)   |
|----------------------|-----------------------------|-------------|
| splash-1290x2796.png | iPhone 16 Pro Max / 15 Plus | 1290 × 2796 |
| splash-1179x2556.png | iPhone 16 / 15 Pro          | 1179 × 2556 |
| splash-750x1334.png  | iPhone SE / 8               | 750 × 1334  |

Each is matched to a device by the `apple-touch-startup-image` media queries in
`public/index.html`. A device with no matching entry falls back to a plain
launch screen — harmless, the app still works.

Android needs none of this: it draws its own splash from the manifest's
`background_color` and icon.
