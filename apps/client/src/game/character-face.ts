import type { Snapshot } from '../../../../packages/shared/src/types';

export const faceExpressions = [
  'neutral',
  'happy',
  'focused',
  'confused',
  'panic',
  'proud',
  'disappointed',
  'exhausted',
] as const;
export type FaceExpression = (typeof faceExpressions)[number];

export function chefExpression(state: Snapshot | null, id: string, pulse: number): FaceExpression {
  if (state?.result) return state.result.won ? 'proud' : 'disappointed';
  const chef = state?.chefs[id];
  if (!chef || state?.phase !== 'playing') return 'neutral';
  let processing = false;
  for (const station of state.stations) {
    if (Math.hypot(chef.x - station.x, chef.z - station.z) > 1.05) continue;
    if (station.phase === 'burnt') return 'panic';
    if (station.phase === 'processing' && station.kind === chef.action) processing = true;
  }
  if (pulse > 0 && ['invalid', 'blocked'].includes(state.event.key)) return 'confused';
  if (pulse > 0 && chef.action === 'seat') return 'proud';
  if (pulse > 0 && chef.item) return 'happy';
  if (processing) return 'focused';
  if (state.remaining < 15) return 'exhausted';
  return 'neutral';
}

/** Sixteen original face cells: eight moods, each with an actual closed-eye variant. */
export function paintFaceAtlas(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, 512, 512);
  const line = (points: number[][], width = 6, color = '#362737') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    if (points.length === 3)
      ctx.quadraticCurveTo(...(points[1] as [number, number]), ...(points[2] as [number, number]));
    else for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  };
  for (let cell = 0; cell < 16; cell++) {
    const mood = faceExpressions[cell % 8],
      blink = cell >= 8;
    ctx.save();
    ctx.translate((cell % 4) * 128, Math.floor(cell / 4) * 128);
    for (const side of [-1, 1]) {
      const x = 64 + side * 26;
      const tired = mood === 'exhausted' || mood === 'disappointed';
      const joyful = mood === 'happy';
      const eyeH = mood === 'panic' ? 16 : tired || mood === 'proud' ? 5 : 11;
      if (blink || joyful || (mood === 'proud' && side === -1))
        line(
          [
            [x - 9, 55],
            [x, joyful ? 43 : 59],
            [x + 9, 55],
          ],
          6,
        );
      else {
        ctx.fillStyle = '#fff9e9';
        ctx.beginPath();
        ctx.ellipse(x, 54, 12, eyeH + 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#302738';
        ctx.beginPath();
        ctx.ellipse(x + (mood === 'confused' ? -4 : 1), 55, 6, eyeH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff9e9';
        ctx.beginPath();
        ctx.arc(x + 2, 50, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const tilt =
        mood === 'focused'
          ? side * 7
          : mood === 'confused'
            ? 7
            : mood === 'disappointed'
              ? -side * 6
              : 0;
      const browY = mood === 'panic' ? 25 : mood === 'proud' ? 31 : 34;
      line(
        [
          [x - 10, browY + tilt],
          [x, browY - 4],
          [x + 10, browY - tilt],
        ],
        5,
      );
    }
    if (mood === 'panic' || mood === 'exhausted') {
      ctx.fillStyle = '#743c43';
      ctx.beginPath();
      ctx.ellipse(64, 91, mood === 'panic' ? 12 : 8, mood === 'panic' ? 14 : 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'happy' || mood === 'proud') {
      ctx.fillStyle = '#743c43';
      ctx.beginPath();
      ctx.moveTo(45, 83);
      ctx.quadraticCurveTo(64, 116, 83, 83);
      ctx.closePath();
      ctx.fill();
      line(
        [
          [50, 86],
          [78, 86],
        ],
        4,
        '#fff9e9',
      );
    } else if (mood === 'disappointed')
      line(
        [
          [49, 96],
          [64, 80],
          [79, 96],
        ],
        5,
        '#743c43',
      );
    else if (mood === 'confused')
      line(
        [
          [52, 92],
          [65, 92],
          [77, 86],
        ],
        5,
        '#743c43',
      );
    else if (mood === 'focused')
      line(
        [
          [55, 91],
          [73, 91],
        ],
        5,
        '#743c43',
      );
    else
      line(
        [
          [50, 87],
          [64, 99],
          [78, 87],
        ],
        5,
        '#743c43',
      );
    ctx.restore();
  }
}

export function faceUVs(expression: FaceExpression, closed: boolean, columns = 6, rows = 4) {
  const cell = faceExpressions.indexOf(expression) + (closed ? 8 : 0);
  const uvs: number[] = [];
  for (let row = 0; row <= rows; row++)
    for (let col = 0; col <= columns; col++)
      uvs.push(
        ((cell % 4) + 0.04 + (col / columns) * 0.92) / 4,
        (Math.floor(cell / 4) + 0.04 + (row / rows) * 0.92) / 4,
      );
  return uvs;
}
