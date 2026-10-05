import { useEffect, useState } from 'react';
import type { Appearance } from './appearance';
import { createAvatar, proceduralAvatar, type AvatarInstance } from './avatarInstance';
import type { Detail } from './geometry';
import { BODY_MODELS } from './models';

interface Built {
  appearance: Appearance;
  detail: Detail;
  avatar: AvatarInstance;
}

/**
 * The avatar for a look, rebuilt when the look changes. The old avatar stays
 * on screen until the new one is ready, so switching bodies never flashes.
 */
export function useAvatar(appearance: Appearance, detail: Detail, seed = 0): AvatarInstance | null {
  const [built, setBuilt] = useState<Built | null>(() =>
    BODY_MODELS[appearance.body].kind === 'procedural' ? { appearance, detail, avatar: proceduralAvatar(appearance, detail, seed) } : null,
  );
  const upToDate = built !== null && built.appearance === appearance && built.detail === detail;

  useEffect(() => {
    if (upToDate) return;
    let cancelled = false;
    void createAvatar(appearance, detail, seed).then((avatar) => {
      if (cancelled) avatar.dispose();
      else setBuilt({ appearance, detail, avatar });
    });
    return () => {
      cancelled = true;
    };
  }, [appearance, detail, seed, upToDate]);

  // Free the previous avatar once it has been replaced (and the last one on unmount).
  const avatar = built?.avatar ?? null;
  useEffect(() => () => avatar?.dispose(), [avatar]);
  return avatar;
}
