/** Match the mirrored, object-fit: contain camera preview, including letterboxing. */
export function projectHead(head, width, height) {
  const scale = Math.min(width/head.image.width, height/head.image.height);
  return { x: ((width-head.image.width*scale)/2+(1-head.x)*head.image.width*scale)/width,
    y: ((height-head.image.height*scale)/2+head.y*head.image.height*scale)/height };
}
export const helicopterScale = width => Math.max(.7, Math.min(width/900,1.25));
export function validHeadControl(head) {
  return head && Number.isFinite(head.x) && Number.isFinite(head.y) &&
    head.x >= 0 && head.x <= 1 && head.y >= 0 && head.y <= 1 &&
    Number.isSafeInteger(head.image?.width) && head.image.width > 0 &&
    Number.isSafeInteger(head.image?.height) && head.image.height > 0;
}
