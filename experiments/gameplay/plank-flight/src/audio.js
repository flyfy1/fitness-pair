import {readLanguage,subscribeLanguage} from '../../../../packages/gameplay/locale.js';
import {scheduleGameMusic} from '../../../../packages/gameplay/soundtrack.js';
import {sharedVoiceURL} from '../../../../packages/gameplay/voice-assets.js';
import {encouragementPack,createEncouragementSchedule,voiceResource,voiceResources} from './encouragement.js';
const VOICES=['three','two','one','start','nice','keep-going','finish'];
const RESOURCES=[...VOICES.map(id=>({id,file:`${id}.wav`})),
  ...encouragementPack.styles.map(style=>({id:`music-${style.id}`,file:`encouragement/music-${style.id}.wav`}))];

/** Original synthesized backing track and local prerecorded speech; no microphone input. */
export class FlightAudio {
  constructor(language=readLanguage()) {
    this.releaseLanguage=subscribeLanguage(value=>this.setLanguage(value));
    globalThis.addEventListener?.('pagehide',this.releaseLanguage,{once:true});
    this.language=language;this.loading=new Map();this.speechNodes=new Set();
    this.encouragement=createEncouragementSchedule();this.lastEncouragement=null;this.lastVoice=null;
    this.muted=false;this.context=null;this.nodes=new Set();this.buffers=new Map();
    this.session=null;this.phase=null;this.count=null;this.passed=0;this.nextBeat=0;this.beat=0;
    this.generation=0;this.voiceSerial=0;this.lastCue=null;this.unavailable=false;
  }
  unlock() {
    try {
      if(!this.context||this.context.state==='closed') {
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Context){this.unavailable=true;return;}
        const c=this.context=new Context();
        this.master=c.createGain();this.master.gain.value=.7;
        this.music=c.createGain();this.music.gain.value=.22;this.music.connect(this.master);
        const limiter=c.createDynamicsCompressor();this.master.connect(limiter);limiter.connect(c.destination);
        // A stable post-mix output lets the host record exactly the game sound.
        this.recording=c.createMediaStreamDestination();limiter.connect(this.recording);
        this.noise=c.createBuffer(1,c.sampleRate*.3,c.sampleRate);
        const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        for(const resource of RESOURCES)this.load(resource.id,resource.file);
        this.loadLanguage();
      }
      if(this.muted)return;
      void this.context.resume().catch(()=>{this.unavailable=true;});
    } catch {this.unavailable=true;}
  }
  resourceKey(resource){return resource.locale==='en'&&resource.generate===false?resource.id:`${resource.locale}:${resource.id}`;}
  load(id,file){
    if(this.loading.has(id))return this.loading.get(id);
    const context=this.context;
    const pending=(async()=>{
      try{
        const url=(/^(?:https?:|\/)/.test(file)?file:sharedVoiceURL(file))||new URL(`audio/${file}`,new URL(import.meta.env.BASE_URL,location.href));
        const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)return;
        const buffer=await context.decodeAudioData(await response.arrayBuffer());
        if(this.context===context&&context.state!=='closed')this.buffers.set(id,buffer);
      }catch{/* Missing optional speech never blocks the game. */}
    })();
    this.loading.set(id,pending);return pending;
  }
  loadLanguage(){
    if(!this.context)return;
    if(this.language==='zh')for(const name of ['nice','keep-going','finish'])this.load(`zh:${name}`,sharedVoiceURL(`${name}.wav`,'zh'));
    for(const resource of voiceResources(this.language))this.load(this.resourceKey(resource),`encouragement/${resource.file}`);
  }
  setLanguage(language){
    if(!Object.hasOwn(encouragementPack.locales,language)||language===this.language)return;
    this.language=language;this.voiceSerial++;this.lastEncouragement=null;this.lastVoice=null;
    for(const node of this.speechNodes){try{node.stop();}catch{}}
    this.speechNodes.clear();
    if(this.context&&this.music){const now=this.context.currentTime;this.music.gain.cancelScheduledValues(now);this.music.gain.setTargetAtTime(.22,now,.12);}
    this.loadLanguage();
  }
  getAudioStream(){return this.recording?.stream??null;}
  snapshot(){return {playing:!this.muted&&this.context?.state==='running'&&this.nodes.size>0,muted:this.muted,state:this.context?.state??'idle',language:this.language,lastVoice:this.lastVoice,lastCue:this.lastCue,lastEncouragement:this.lastEncouragement,voicesReady:VOICES.filter(id=>this.buffers.has(id)).length,encouragementReady:encouragementPack.clips.filter(clip=>this.buffers.has(this.resourceKey(voiceResource(clip.id,this.language)))).length,unavailable:this.unavailable};}
  setMuted(value){this.muted=value;this.stop();if(!value)this.unlock();}
  track(node,gain,speech=false){
    if(speech)this.speechNodes.add(node);
    this.nodes.add(node);node.onended=()=>{this.nodes.delete(node);this.speechNodes.delete(node);node.disconnect();gain.disconnect();};
  }
  tone(freq,time,duration,volume=.1,type='sine',end=freq,bus=this.music) {
    if(!this.context||this.muted)return;
    const c=this.context,o=c.createOscillator(),g=c.createGain();o.type=type;
    o.frequency.setValueAtTime(freq,time);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),time+duration);
    g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.006);
    g.gain.exponentialRampToValueAtTime(.0001,time+duration);
    o.connect(g);g.connect(bus);this.track(o,g);o.start(time);o.stop(time+duration+.02);
  }
  hiss(time,duration,volume){
    const c=this.context,n=c.createBufferSource(),g=c.createGain();n.buffer=this.noise;
    g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
    n.connect(g);g.connect(this.music);this.track(n,g);n.start(time);n.stop(time+duration);
  }
  voice(name) {
    const resource=voiceResource(name,this.language),key=resource?this.resourceKey(resource):this.language==='en'?name:`zh:${name}`;
    if(!key)return;
    const generation=this.generation,serial=++this.voiceSerial;
    const play=()=>{
      if(generation!==this.generation||serial!==this.voiceSerial||this.muted||this.context?.state!=='running')return;
      const buffer=this.buffers.get(key);if(!buffer)return;
      const c=this.context,source=c.createBufferSource(),gain=c.createGain();
      this.lastVoice={id:name,language:this.language,file:resource?.file??`${name}.wav`,text:resource?.text??name};
      source.buffer=buffer;gain.gain.value=.9;source.connect(gain);gain.connect(this.master);
      this.track(source,gain,true);source.start();
      const t=c.currentTime;this.music.gain.cancelScheduledValues(t);this.music.gain.setValueAtTime(.065,t);
      this.music.gain.setTargetAtTime(.22,t+buffer.duration,.12);
    };
    if(this.buffers.has(key))play();else void this.loading.get(key)?.then(play);
  }
  encourage(clip,fallback){
    const resource=voiceResource(clip.id,this.language);
    if(!this.buffers.has(this.resourceKey(resource))){this.voice(fallback);return;}
    this.lastEncouragement={id:clip.id,text:resource.text,style:clip.style,language:this.language};
    const buffer=this.buffers.get(`music-${clip.style}`);
    if(buffer){
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      source.buffer=buffer;gain.gain.value=.65;source.connect(gain);gain.connect(this.master);
      this.track(source,gain);source.start();
    }
    this.voice(clip.id);
  }
  cue(name) {
    this.lastCue=name;
    if(this.muted||this.context?.state!=='running')return;
    const t=this.context.currentTime;
    if(['three','two','one'].includes(name))this.tone(480,t,.15,.2,'square',650,this.master);
    if(name==='start')for(let i=0;i<4;i++)this.tone([330,440,660,880][i],t+i*.075,.17,.16,'triangle',1100,this.master);
    if(name==='nice'||name==='keep-going')for(let i=0;i<3;i++)this.tone([660,880,1320][i],t+i*.06,.15,.15,'sine',undefined,this.master);
    if(name==='crash'){this.hiss(t,.3,.35);this.tone(380,t,1.1,.25,'sawtooth',35,this.master);return;}
    if(name==='finish'){this.encourage(this.encouragement.finish(),'finish');return;}
    this.voice(name);
  }
  update(state,speed) {
    if(this.session!==state.sessionId){this.clearNodes();this.session=state.sessionId;this.phase=null;this.count=null;this.passed=0;this.beat=0;this.encouragement.reset();this.lastEncouragement=null;}
    const status=state.status;
    if(status!==this.phase){
      if(status==='flying')this.cue('start');
      if(status==='crashing'){this.clearNodes();this.cue('crash');}
      if(status==='finished'){this.clearNodes();this.cue('finish');}
      if(status==='paused')this.stop();
      this.phase=status;
    }
    if(status==='countdown'){
      const count=Math.max(1,Math.ceil(3-state.countdownSeconds));
      if(count!==this.count){this.count=count;this.cue(({3:'three',2:'two',1:'one'})[count]);}
    }
    if(status==='flying'&&state.passed>this.passed){
      this.passed=state.passed;
      const clip=this.encouragement.milestone(state.passed,state.flightSeconds,!this.muted&&this.context?.state==='running');
      if(clip){this.lastCue='encouragement';this.encourage(clip,'nice');}
    }
    if(status!=='flying'||this.muted||this.context?.state!=='running')return;
    scheduleGameMusic(this,speed);
  }

  clearNodes(){
    this.generation++;this.voiceSerial++;
    for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();this.nextBeat=0;
    if(this.context&&this.music){const t=this.context.currentTime;this.music.gain.cancelScheduledValues(t);this.music.gain.setValueAtTime(.22,t);}
  }
  stop(){this.clearNodes();if(this.context?.state==='running')void this.context.suspend().catch(()=>{});}
  dispose(){this.stop();this.recording?.stream.getTracks().forEach(track=>track.stop());if(this.context?.state!=='closed')void this.context?.close().catch(()=>{});}
}
