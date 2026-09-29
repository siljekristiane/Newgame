import { useEffect } from 'react';
import { applyView, viewIdFromHash } from './views';

/** Jump to a fixed camera view when the URL hash is `#v-<id>`. */
export function useViewHash(): void {
  useEffect(() => {
    const apply = () => {
      const id = viewIdFromHash(window.location.hash);
      if (id) applyView(id);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
}
