# Icon Integration Guide

This document describes how icons are configured and used throughout the LLM Aggregator application.

## 1. Native Application Icons (Electron)

### Location
All native app icons are stored in the `build/` directory:
- `build/llmicon.svg` - Master SVG source (512x512)
- `build/llmicon.png` - PNG format for Linux and window icon
- `build/llmicon.ico` - Windows format (multi-resolution)
- `build/llmicon.icns` - macOS format (multi-resolution)

### Configuration

**electron-builder.yml** is configured to use these icons automatically:
```yaml
mac:
  icon: build/llmicon.icns
win:
  icon: build/llmicon.ico
linux:
  icon: build/llmicon.png
```

**electron/main.ts** sets the window icon at runtime:
```typescript
mainWindow = new BrowserWindow({
  icon: join(__dirname, '../build/llmicon.png'),
  // ...other options
})
```

### Build Commands
```bash
# Build for current platform
npm run electron:build

# Build for specific platforms
npm run electron:build:win
npm run electron:build:mac
npm run electron:build:linux
```

### Icon Appears In:
- ✅ Windows: Taskbar, Alt+Tab, system tray, installer
- ✅ macOS: Dock, Cmd+Tab, DMG installer
- ✅ Linux: Application launcher, taskbar, package icon

## 2. Web Development Icons

### Favicon
The browser tab icon is configured in `index.html`:
```html
<link rel="icon" type="image/svg+xml" href="/llm-aggregator.svg" />
```

**File location:** `public/llm-aggregator.svg`

### During Development
When running `npm run dev`, the favicon appears in:
- Browser tab
- Bookmarks
- History
- Browser's site info

## 3. UI Icons (Vue Components)

### Library: lucide-vue-next

**Installation:**
```bash
npm install lucide-vue-next
```

### Usage Examples

**Basic Icon:**
```vue
<script setup lang="ts">
import { Search, Settings, FileText } from 'lucide-vue-next'
</script>

<template>
  <button>
    <Search :size="20" />
    Search
  </button>
</template>
```

**With Custom Styling:**
```vue
<script setup lang="ts">
import { Trash2, Edit3 } from 'lucide-vue-next'
</script>

<template>
  <div class="actions">
    <Edit3 :size="18" color="#667eea" :stroke-width="2" />
    <Trash2 :size="18" color="#e53e3e" :stroke-width="2" />
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
</style>
```

**Dynamic Icons:**
```vue
<script setup lang="ts">
import { Check, X, AlertCircle } from 'lucide-vue-next'

const statusIcons = {
  success: Check,
  error: X,
  warning: AlertCircle,
}

const props = defineProps<{
  status: 'success' | 'error' | 'warning'
}>()
</script>

<template>
  <component :is="statusIcons[status]" :size="20" />
</template>
```

### Common Icons in LLM Aggregator

```typescript
// Navigation & Actions
import { 
  Search,        // Search functionality
  Settings,      // Settings dialog
  Plus,          // Add new QA pair
  Trash2,        // Delete actions
  Edit3,         // Edit actions
  Save,          // Save operations
  X,             // Close/Cancel
} from 'lucide-vue-next'

// Content & Files
import {
  FileText,      // Documents/threads
  Folder,        // Directories
  Archive,       // Archived items
  Download,      // Export
  Upload,        // Import
} from 'lucide-vue-next'

// UI & Status
import {
  Check,         // Success/confirmation
  AlertCircle,   // Warnings
  Info,          // Information
  ChevronDown,   // Dropdowns
  ChevronUp,     // Collapse
  MoreVertical,  // Menu/options
} from 'lucide-vue-next'
```

### Icon Props Reference

```typescript
<IconName
  :size="24"              // Number: icon size in pixels
  color="#000000"         // String: CSS color
  :stroke-width="2"       // Number: 1 (thin) to 3 (bold)
  :absolute-stroke-width="true"  // Boolean: scale-independent stroke
  class="custom-class"    // String: CSS classes
/>
```

## 4. Generating Production Icons

### Option 1: electron-icon-builder (Recommended)

```bash
# Install
npm install --save-dev electron-icon-builder

# Add to package.json scripts
"build:icons": "electron-icon-builder --input=./build/llmicon.svg --output=./build --flatten"

# Generate
npm run build:icons
```

### Option 2: Online Tools
- [iConvert Icons](https://iconverticons.com/online/) - SVG to ICO/ICNS
- [CloudConvert](https://cloudconvert.com/svg-to-ico) - Format converter
- Use your master `build/llmicon.svg` as source

### Option 3: Manual (Advanced)
See `build/README.md` for detailed ImageMagick/Inkscape commands

## 5. Testing Icons

### Test Native App Icon:
```bash
npm run electron:build
# Install the generated .exe/.dmg/.deb and check:
# - Desktop shortcut icon
# - Taskbar/Dock icon
# - Alt+Tab/Cmd+Tab icon
```

### Test Favicon:
```bash
npm run dev
# Open http://localhost:5173
# Check browser tab icon
```

### Test UI Icons:
- Icons should scale properly at different sizes
- Icons should inherit color when using `color: currentColor`
- Icons should align with text (use flex alignment)

## 6. Best Practices

### Native Icons
- ✅ Use 512x512 or higher resolution source
- ✅ Simple, recognizable design
- ✅ High contrast for visibility
- ❌ Don't use text that becomes unreadable at small sizes

### UI Icons
- ✅ Use consistent sizes (16px, 20px, 24px)
- ✅ Consistent stroke-width across app (2 is standard)
- ✅ Use semantic color choices (red for delete, green for success)
- ❌ Don't mix icon libraries (stick to lucide-vue-next)

### Favicon
- ✅ SVG format for sharp display at any size
- ✅ Should work on both light and dark browser themes
- ✅ Keep design simple for small sizes

## 7. Troubleshooting

**Icons not showing in built app?**
- Check `build/` directory has .ico/.icns/.png files
- Verify `electron-builder.yml` paths are correct
- Rebuild: `npm run electron:build`

**Favicon not showing in dev?**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)
- Check `public/llm-aggregator.svg` exists

**UI icons not rendering?**
- Verify lucide-vue-next is installed: `npm list lucide-vue-next`
- Check import statement capitalization
- Ensure component name matches icon name

## 8. Future Enhancements

Potential icon-related features:
- System tray icon with notifications
- Custom file association icons (.llmdata files)
- macOS DMG background image
- Windows installer banner
- Loading/splash screen
- Dark/light theme icon variants
