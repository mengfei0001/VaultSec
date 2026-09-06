<template>
  <div>
    <div class="input-wrap">
      <input
        :type="visible ? 'text' : 'password'"
        class="input"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <button type="button" class="eye" @click="visible = !visible" :aria-label="visible ? '隐藏' : '显示'">
        {{ visible ? '🙈' : '👁' }}
      </button>
    </div>
    <div v-if="showStrength && modelValue" class="strength">
      <div class="strength-bar"><i :style="{ width: score + '%' }" /></div>
      <span class="strength-label" :class="lab.cls">{{ lab.text }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { strengthScore, strengthLabel } from '../utils/password'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: 'off' },
  showStrength: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])

const visible = ref(false)
const score = computed(() => strengthScore(props.modelValue))
const lab = computed(() => strengthLabel(score.value))
</script>
