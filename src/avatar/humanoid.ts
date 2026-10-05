/**
 * The humanoid skeleton the game animates. A rigged model (.glb) maps its own
 * bone names to these roles in `models.ts`, so models from different tools
 * (our own builder, Mixamo, MakeHuman …) share the same animation code.
 *
 * Left/right are the character's own: facing +Z, its left is +X.
 */
export const HUMANOID_BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'upperArmL',
  'foreArmL',
  'handL',
  'upperArmR',
  'foreArmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
] as const;

export type HumanoidBone = (typeof HUMANOID_BONES)[number];

/** Role → bone name in the model. Missing roles are simply not animated. */
export type BoneMap = Partial<Record<HumanoidBone, string>>;

/** The names our own avatar builder writes: the role names themselves. */
export const IDENTITY_BONE_MAP: BoneMap = Object.fromEntries(HUMANOID_BONES.map((b) => [b, b]));

/** Mixamo's standard rig, for models rigged at mixamo.com. */
export const MIXAMO_BONE_MAP: BoneMap = {
  hips: 'mixamorigHips',
  spine: 'mixamorigSpine1',
  chest: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  head: 'mixamorigHead',
  upperArmL: 'mixamorigLeftArm',
  foreArmL: 'mixamorigLeftForeArm',
  handL: 'mixamorigLeftHand',
  upperArmR: 'mixamorigRightArm',
  foreArmR: 'mixamorigRightForeArm',
  handR: 'mixamorigRightHand',
  thighL: 'mixamorigLeftUpLeg',
  shinL: 'mixamorigLeftLeg',
  footL: 'mixamorigLeftFoot',
  thighR: 'mixamorigRightUpLeg',
  shinR: 'mixamorigRightLeg',
  footR: 'mixamorigRightFoot',
};
