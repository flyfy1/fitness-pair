import type {Source} from '../../../../contracts/index.js';

export type GameplayPhase='setup'|'playing'|'paused'|'ending'|'complete'|'idle';
export interface GameplayFrame {
 round: string|number;
 phase: GameplayPhase;
 canvas: HTMLCanvasElement;
 video?: HTMLVideoElement|null;
 audio?: MediaStream|null;
 skeleton?: HTMLCanvasElement|null;
 skeletonMirrored?: boolean;
 isAR?: boolean;
 score: string;
 source?: Source;
 hud?: {health?:string;cue?:string;charge?:string;elapsed?:string};
 layout?: {width:number;height:number;x:number;y:number;canvasWidth:number;canvasHeight:number};
}
export interface GamePresentation {
 getFrame(): GameplayFrame|null;
 subscribe?(changed:()=>void): ()=>void;
 configureHost?(options:{homeURL:string;recordingNote:string}):void;
 dispose?():void;
}
export interface GameplayRuntime {
 getViewport?():{width:number;height:number};
 readFrame():GameplayFrame|null;
 subscribe(changed:()=>void):()=>void;
 configureHost(options:{homeURL:string;recordingNote:string}):void;
 dispose():void;
}
export type GameAdapter=(frame:HTMLIFrameElement)=>GameplayRuntime;
