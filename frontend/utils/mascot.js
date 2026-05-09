// utils/mascot.js — global trigger utility

export function mascotSay(state, text = '') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mascot', { detail: { state, text } }));
  }
}
