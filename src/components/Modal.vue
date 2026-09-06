<template>
  <div v-if="open" class="modal-mask" @click.self="onClose">
    <div class="modal">
      <h3>{{ title }}</h3>
      <p v-if="desc" class="sub">{{ desc }}</p>
      <slot />
      <div class="btn-row mt">
        <button v-if="showCancel" class="btn ghost" @click="onClose">{{ cancelText }}</button>
        <button class="btn primary" @click="onConfirm" :disabled="disabled">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  showCancel: { type: Boolean, default: true }
})
const emit = defineEmits(['close', 'confirm'])
const open = ref(false)
const disabled = ref(false)

function show() {
  open.value = true
  disabled.value = false
}
function hide() {
  open.value = false
}
function onClose() {
  open.value = false
  emit('close')
}
async function onConfirm() {
  open.value = false
  emit('confirm')
}

defineExpose({ show, hide })
</script>
