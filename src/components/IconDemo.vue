<script setup lang="ts">
// Demo component showing various icon usage patterns
import { 
  Search, Settings, Plus, Trash2, Edit3, Save, X,
  FileText, Folder, Archive, Download, Upload,
  Check, AlertCircle, Info, ChevronDown, ChevronUp, MoreVertical,
  MessageSquare, Sparkles, Database
} from 'lucide-vue-next'
import { ref } from 'vue'

const activeTab = ref<'basic' | 'colors' | 'sizes' | 'interactive'>('basic')
const isExpanded = ref(false)
const status = ref<'idle' | 'success' | 'error'>('idle')

const handleAction = (action: string) => {
  console.log(`Icon action: ${action}`)
  status.value = 'success'
  setTimeout(() => status.value = 'idle', 2000)
}
</script>

<template>
  <div class="icon-demo">
    <div class="demo-header">
      <h1>
        <Sparkles :size="28" color="#667eea" />
        Icon Usage Examples
      </h1>
      <p>Demonstrating lucide-vue-next icons in LLM Aggregator</p>
    </div>

    <!-- Tab Navigation -->
    <div class="tabs">
      <button 
        v-for="tab in ['basic', 'colors', 'sizes', 'interactive']" 
        :key="tab"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab as any"
      >
        {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
      </button>
    </div>

    <!-- Basic Icons -->
    <section v-if="activeTab === 'basic'" class="demo-section">
      <h2>Basic Icons</h2>
      
      <div class="icon-grid">
        <div class="icon-item">
          <Search :size="24" />
          <span>Search</span>
        </div>
        <div class="icon-item">
          <Settings :size="24" />
          <span>Settings</span>
        </div>
        <div class="icon-item">
          <Plus :size="24" />
          <span>Plus</span>
        </div>
        <div class="icon-item">
          <Trash2 :size="24" />
          <span>Trash2</span>
        </div>
        <div class="icon-item">
          <Edit3 :size="24" />
          <span>Edit3</span>
        </div>
        <div class="icon-item">
          <Save :size="24" />
          <span>Save</span>
        </div>
        <div class="icon-item">
          <FileText :size="24" />
          <span>FileText</span>
        </div>
        <div class="icon-item">
          <Folder :size="24" />
          <span>Folder</span>
        </div>
        <div class="icon-item">
          <Archive :size="24" />
          <span>Archive</span>
        </div>
        <div class="icon-item">
          <Download :size="24" />
          <span>Download</span>
        </div>
        <div class="icon-item">
          <Upload :size="24" />
          <span>Upload</span>
        </div>
        <div class="icon-item">
          <MessageSquare :size="24" />
          <span>Message</span>
        </div>
      </div>
    </section>

    <!-- Colored Icons -->
    <section v-if="activeTab === 'colors'" class="demo-section">
      <h2>Custom Colors</h2>
      
      <div class="color-examples">
        <div class="color-box">
          <Check :size="32" color="#10b981" />
          <span>Success</span>
        </div>
        <div class="color-box">
          <X :size="32" color="#ef4444" />
          <span>Error</span>
        </div>
        <div class="color-box">
          <AlertCircle :size="32" color="#f59e0b" />
          <span>Warning</span>
        </div>
        <div class="color-box">
          <Info :size="32" color="#3b82f6" />
          <span>Info</span>
        </div>
        <div class="color-box">
          <Database :size="32" color="#8b5cf6" />
          <span>Database</span>
        </div>
      </div>

      <div class="code-example">
        <pre>&lt;Check :size="32" color="#10b981" /&gt;</pre>
      </div>
    </section>

    <!-- Different Sizes -->
    <section v-if="activeTab === 'sizes'" class="demo-section">
      <h2>Icon Sizes</h2>
      
      <div class="size-examples">
        <div class="size-item">
          <Settings :size="16" />
          <span>16px</span>
        </div>
        <div class="size-item">
          <Settings :size="20" />
          <span>20px</span>
        </div>
        <div class="size-item">
          <Settings :size="24" />
          <span>24px</span>
        </div>
        <div class="size-item">
          <Settings :size="32" />
          <span>32px</span>
        </div>
        <div class="size-item">
          <Settings :size="48" />
          <span>48px</span>
        </div>
        <div class="size-item">
          <Settings :size="64" />
          <span>64px</span>
        </div>
      </div>

      <h3>Stroke Width</h3>
      <div class="stroke-examples">
        <div class="stroke-item">
          <Edit3 :size="32" :stroke-width="1" />
          <span>Thin (1)</span>
        </div>
        <div class="stroke-item">
          <Edit3 :size="32" :stroke-width="2" />
          <span>Normal (2)</span>
        </div>
        <div class="stroke-item">
          <Edit3 :size="32" :stroke-width="3" />
          <span>Bold (3)</span>
        </div>
      </div>
    </section>

    <!-- Interactive Icons -->
    <section v-if="activeTab === 'interactive'" class="demo-section">
      <h2>Interactive Buttons</h2>
      
      <div class="button-group">
        <button class="icon-btn primary" @click="handleAction('search')">
          <Search :size="18" />
          Search
        </button>
        <button class="icon-btn success" @click="handleAction('save')">
          <Save :size="18" />
          Save
        </button>
        <button class="icon-btn danger" @click="handleAction('delete')">
          <Trash2 :size="18" />
          Delete
        </button>
        <button class="icon-btn secondary" @click="handleAction('edit')">
          <Edit3 :size="18" />
          Edit
        </button>
      </div>

      <div v-if="status === 'success'" class="status-message success">
        <Check :size="20" />
        Action completed successfully!
      </div>

      <h3>Expandable Section</h3>
      <div class="expandable">
        <button class="expand-btn" @click="isExpanded = !isExpanded">
          <component :is="isExpanded ? ChevronUp : ChevronDown" :size="20" />
          {{ isExpanded ? 'Collapse' : 'Expand' }} Details
        </button>
        <div v-if="isExpanded" class="expand-content">
          <p>This content uses dynamic icon toggling based on state.</p>
          <p>The ChevronDown/ChevronUp icons switch when you click the button.</p>
        </div>
      </div>

      <h3>Icon-Only Buttons</h3>
      <div class="icon-only-buttons">
        <button class="icon-only-btn" title="More options">
          <MoreVertical :size="20" />
        </button>
        <button class="icon-only-btn" title="Download">
          <Download :size="20" />
        </button>
        <button class="icon-only-btn" title="Upload">
          <Upload :size="20" />
        </button>
        <button class="icon-only-btn" title="Archive">
          <Archive :size="20" />
        </button>
      </div>
    </section>

    <!-- Footer -->
    <div class="demo-footer">
      <Info :size="16" />
      <span>
        See <strong>ICONS.md</strong> for complete documentation
      </span>
    </div>
  </div>
</template>

<style scoped>
.icon-demo {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
}

.demo-header {
  text-align: center;
  margin-bottom: 2rem;
}

.demo-header h1 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.demo-header p {
  color: #6b7280;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e5e7eb;
}

.tabs button {
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: #6b7280;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.tabs button:hover {
  color: #667eea;
}

.tabs button.active {
  color: #667eea;
  border-bottom-color: #667eea;
  font-weight: 600;
}

/* Demo Sections */
.demo-section {
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.demo-section h2 {
  margin-bottom: 1.5rem;
  color: #1f2937;
}

.demo-section h3 {
  margin-top: 2rem;
  margin-bottom: 1rem;
  color: #374151;
}

/* Icon Grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  transition: all 0.2s;
}

.icon-item:hover {
  border-color: #667eea;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.1);
  transform: translateY(-2px);
}

.icon-item span {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Color Examples */
.color-examples {
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.color-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
  min-width: 120px;
}

.color-box span {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.code-example {
  background: #1f2937;
  color: #e5e7eb;
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
}

.code-example pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
}

/* Size Examples */
.size-examples,
.stroke-examples {
  display: flex;
  align-items: flex-end;
  gap: 2rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.size-item,
.stroke-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.size-item span,
.stroke-item span {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Buttons */
.button-group {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.icon-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn.primary {
  background: #667eea;
  color: white;
}

.icon-btn.primary:hover {
  background: #5568d3;
}

.icon-btn.success {
  background: #10b981;
  color: white;
}

.icon-btn.success:hover {
  background: #059669;
}

.icon-btn.danger {
  background: #ef4444;
  color: white;
}

.icon-btn.danger:hover {
  background: #dc2626;
}

.icon-btn.secondary {
  background: #e5e7eb;
  color: #374151;
}

.icon-btn.secondary:hover {
  background: #d1d5db;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 2rem;
  animation: slideDown 0.3s;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.status-message.success {
  background: #d1fae5;
  color: #065f46;
}

/* Expandable */
.expandable {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
}

.expand-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  color: #374151;
  padding: 0.5rem;
  width: 100%;
  text-align: left;
}

.expand-btn:hover {
  color: #667eea;
}

.expand-content {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
  color: #6b7280;
}

.expand-content p {
  margin: 0.5rem 0;
}

/* Icon-Only Buttons */
.icon-only-buttons {
  display: flex;
  gap: 0.5rem;
}

.icon-only-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-only-btn:hover {
  background: #e5e7eb;
  border-color: #667eea;
  color: #667eea;
}

/* Footer */
.demo-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #e5e7eb;
  color: #6b7280;
  font-size: 0.875rem;
}
</style>
