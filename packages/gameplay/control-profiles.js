// Camera requirements, independent of rendering, recording and game rules.
const upper = {category: 'upper-body', label: 'Upper body', startGesture: 'hands-together',
  framing: 'Keep both shoulders and hands visible. Hips and legs can stay outside the frame. You can play seated.'};
export const controlProfiles = Object.fromEntries(
  ['ar-breakout', 'ar-invaders', 'ar-stack', 'ar-knife', 'ar-bubble', 'ar-fruit'].map(id => [id, {...upper}]));
controlProfiles['plank-flight'] = {category: 'upper-body', label: 'Upper body', startGesture: 'automatic',
  framing: 'Keep your head and at least one shoulder visible. No hand gesture is needed to start.'};
controlProfiles['jump-game'] = {category: 'upper-body', label: 'Upper body', startGesture: 'hands-together',
  framing: 'Keep both shoulders and hips visible. Feet can stay outside the frame; you still need standing room to rise and return.'};
controlProfiles['motion-quest'] = {category: 'full-body', label: 'Full body', startGesture: 'left-hand',
  framing: 'Keep shoulders through ankles visible, with room to squat and stand.'};
controlProfiles['orbit-pop'] = {category: 'no-camera', label: 'No camera', framing: 'Use touch or a pointer. This concept does not use camera tracking.'};
export const upperBodyStart = 'Bring your hands together for one second, then separate and lower them for the countdown.';
