# Build Resources - Application Icons

This directory contains icon resources for the LLM Aggregator application.

## Current Files

- **llmicon.svg** - Master SVG icon (512x512)
- **llmicon.png** - Placeholder for PNG format
- **llmicon.ico** - Placeholder for Windows icon
- **llmicon.icns** - Placeholder for macOS icon

## Generating Production Icons

### Option 1: Using electron-icon-builder (Recommended)

```bash
npm install --save-dev electron-icon-builder
npm run build:icons
```

Add to package.json scripts:
```json
"build:icons": "electron-icon-builder --input=./build/llmicon.svg --output=./build --flatten"
```

### Option 2: Manual Generation

**For PNG (Linux):**
```bash
# Using ImageMagick
convert build/llmicon.svg -resize 512x512 build/llmicon.png

# Or using Inkscape
inkscape build/llmicon.svg --export-png=build/llmicon.png --export-width=512
```

**For ICO (Windows):**
```bash
# Using ImageMagick (generates multi-resolution .ico)
convert build/llmicon.svg -define icon:auto-resize=256,128,64,48,32,16 build/llmicon.ico
```

**For ICNS (macOS):**
```bash
# On macOS only
mkdir llmicon.iconset
sips -z 16 16     build/llmicon.png --out llmicon.iconset/icon_16x16.png
sips -z 32 32     build/llmicon.png --out llmicon.iconset/icon_16x16@2x.png
sips -z 32 32     build/llmicon.png --out llmicon.iconset/icon_32x32.png
sips -z 64 64     build/llmicon.png --out llmicon.iconset/icon_32x32@2x.png
sips -z 128 128   build/llmicon.png --out llmicon.iconset/icon_128x128.png
sips -z 256 256   build/llmicon.png --out llmicon.iconset/icon_128x128@2x.png
sips -z 256 256   build/llmicon.png --out llmicon.iconset/icon_256x256.png
sips -z 512 512   build/llmicon.png --out llmicon.iconset/icon_256x256@2x.png
sips -z 512 512   build/llmicon.png --out llmicon.iconset/icon_512x512.png
cp build/llmicon.png llmicon.iconset/icon_512x512@2x.png
iconutil -c icns llmicon.iconset
mv llmicon.icns build/llmicon.icns
rm -rf llmicon.iconset
```

### Option 3: Online Tools

- [iConvert Icons](https://iconverticons.com/online/)
- [CloudConvert](https://cloudconvert.com/svg-to-ico)
- [AnyConv](https://anyconv.com/svg-to-icns-converter/)

## Usage

These icons are automatically used by electron-builder when building the application:

- **Windows:** `llmicon.ico` for .exe installer and app icon
- **macOS:** `llmicon.icns` for .dmg installer and app icon
- **Linux:** `llmicon.png` for AppImage/deb package and app icon

The `electron-builder.yml` configuration references these files automatically from the `build/` directory.
