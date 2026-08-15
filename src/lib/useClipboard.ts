import { useState, useCallback } from 'react';

export const useClipboard = (): [boolean, (text: string) => Promise<void>] => {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copy failed. Please select the text and copy manually.');
    }
  }, []);
  return [copied, copy];
};
