import type { Chef } from '../../../../packages/shared/src/types';

export type CameraProfile =
  | 'desktop-overview'
  | 'mobile-portrait'
  | 'mobile-landscape'
  | 'tablet-portrait';

export type CameraFrame = {
  profile: CameraProfile;
  width: number;
  height: number;
  defaultZoom: number;
  overviewZoom: number;
  followX: number;
  followZ: number;
};

export function cameraProfile(width: number, height: number, touch: boolean): CameraProfile {
  if (!touch) return 'desktop-overview';
  if (width > height) return 'mobile-landscape';
  if (Math.min(width, height) >= 700) return 'tablet-portrait';
  return 'mobile-portrait';
}

/** Orthographic framing uses the actual playable canvas after the HUD reserves its edges. */
export function cameraFrame(width: number, height: number, profile: CameraProfile): CameraFrame {
  const aspect = Math.max(0.3, width / Math.max(1, height));
  const minWidth =
    profile === 'mobile-portrait' ? 15.8 : profile === 'tablet-portrait' ? 17.4 : 15.8;
  const minHeight =
    profile === 'desktop-overview' ? 14.2 : profile === 'mobile-landscape' ? 11.5 : 12.4;
  const frameWidth = Math.max(minWidth, minHeight * aspect);
  const frameHeight = frameWidth / aspect;
  return {
    profile,
    width: frameWidth,
    height: frameHeight,
    defaultZoom:
      profile === 'mobile-portrait'
        ? Math.min(1.82, frameHeight / 10.5)
        : profile === 'mobile-landscape'
          ? 1.2
          : profile === 'tablet-portrait'
            ? 1.04
            : 1,
    overviewZoom: profile === 'mobile-portrait' ? 0.98 : 0.96,
    followX:
      profile === 'mobile-portrait'
        ? 2.8
        : profile === 'mobile-landscape'
          ? 1.6
          : profile === 'tablet-portrait'
            ? 1.4
            : 0.75,
    followZ:
      profile === 'mobile-portrait'
        ? 2.4
        : profile === 'mobile-landscape'
          ? 0.8
          : profile === 'tablet-portrait'
            ? 1.1
            : 0.6,
  };
}

export function cameraTarget(chef: Pick<Chef, 'x' | 'z'> | undefined, frame: CameraFrame) {
  if (!chef) return { x: 0, z: 0 };
  const xFactor = frame.profile === 'desktop-overview' ? 0.12 : 0.55;
  const desktop = frame.profile === 'desktop-overview';
  const zFactor = desktop ? 0.12 : frame.profile === 'mobile-portrait' ? 0.22 : 0.48;
  return {
    x: Math.max(-frame.followX, Math.min(frame.followX, (chef.x - 7) * xFactor)),
    z: desktop
      ? -frame.followZ
      : Math.max(-frame.followZ, Math.min(frame.followZ, (chef.z - 5) * zFactor)),
  };
}
