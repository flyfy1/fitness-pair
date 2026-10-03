import type {PoseFrame,Source} from '../../../../contracts/index.js';

export type GameplayPhase='setup'|'playing'|'paused'|'ending'|'complete'|'idle';
export interface GameplayFrame {
 round: string|number;
 sessionId?: string;
 phase: GameplayPhase;
 canvas: HTMLCanvasElement;
 video?: HTMLVideoElement|null;
 audio?: MediaStream|null;
 skeleton?: HTMLCanvasElement|null;
 skeletonMirrored?: boolean;
 isAR?: boolean;
 score: string;
 source?: Source;
 /** Optional local recognition context; never credentials or model-index arrays. */
 recognition?: Record<string,unknown>;
 hud?: {health?:string;cue?:string;charge?:string;elapsed?:string};
 layout?: {width:number;height:number;x:number;y:number;canvasWidth:number;canvasHeight:number};
}
export interface GamePresentation {
 getFrame(): GameplayFrame|null;
 subscribe?(changed:()=>void): ()=>void;
 subscribeTracking?(tracked:(frame:PoseFrame)=>void): ()=>void;
 configureHost?(options:{homeURL:string;recordingNote:string}):void;
 dispose?():void;
}
export interface GameplayRuntime {
 getViewport?():{width:number;height:number};
 /** Current sampling clock in the source frame's performance time origin. */
 getInputTime?():number;
 readFrame():GameplayFrame|null;
 subscribe(changed:()=>void):()=>void;
 subscribeTracking(tracked:(frame:PoseFrame)=>void):()=>void;
 configureHost(options:{homeURL:string;recordingNote:string}):void;
 dispose():void;
}
export type GameAdapter=(frame:HTMLIFrameElement)=>GameplayRuntime;
