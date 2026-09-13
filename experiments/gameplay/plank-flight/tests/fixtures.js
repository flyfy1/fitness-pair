/** Synthetic close-up input: only a head and one shoulder, never hips or legs. */
export function pose(tMs=0, {x=.4,y=.35,head=true,shoulder=true,...extra}={}) {
  return {version:1,sessionId:'test',source:{kind:'synthetic',id:'fixture'},seq:tMs+1,tMs,
    modelId:'fixture',coordinateSpace:'image-normalized-unmirrored',image:{width:640,height:480},
    joints:shoulder?{leftShoulder:{x:.42,y:.55,confidence:.99}}:{},
    ...(head?{head:{x,y,sizePx:80,confidence:.99}}:{}),...extra};
}
