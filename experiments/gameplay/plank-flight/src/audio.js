const VOICES=['three','two','one','start','nice','keep-going','finish'];

/** Original synthesized backing track and local prerecorded speech; no microphone input. */
export class FlightAudio {
  constructor() {
    this.muted=false;this.context=null;this.nodes=new Set();this.buffers=new Map();
    this.session=null;this.phase=null;this.count=null;this.passed=0;this.nextBeat=0;this.beat=0;
    this.generation=0;this.voiceSerial=0;this.lastCue=null;this.unavailable=false;
  }
  unlock() {
    if(this.muted)return;
    try {
      if(!this.context||this.context.state==='closed') {
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Context){this.unavailable=true;return;}
        const c=this.context=new Context();
        this.master=c.createGain();this.master.gain.value=.7;
        this.music=c.createGain();this.music.gain.value=.22;this.music.connect(this.master);
        const limiter=c.createDynamicsCompressor();this.master.connect(limiter);limiter.connect(c.destination);
        this.noise=c.createBuffer(1,c.sampleRate*.3,c.sampleRate);
        const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        this.ready=Promise.all(VOICES.map(async name=>{
          try {
            const url=new URL(`audio/${name}.wav`,new URL(import.meta.env.BASE_URL,location.href));
            const response=await fetch(url);if(!response.ok)return;
            this.buffers.set(name,await c.decodeAudioData(await response.arrayBuffer()));
          } catch { /* Keep musical cues available if a voice asset cannot load. */ }
        }));
      }
      void this.context.resume().catch(()=>{this.unavailable=true;});
    } catch {this.unavailable=true;}
  }
  snapshot(){return {muted:this.muted,state:this.context?.state??'idle',lastCue:this.lastCue,voicesReady:this.buffers.size,unavailable:this.unavailable};}
  setMuted(value){this.muted=value;this.stop();if(!value)this.unlock();}
  track(node,gain){
    this.nodes.add(node);node.onended=()=>{this.nodes.delete(node);node.disconnect();gain.disconnect();};
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
    const generation=this.generation,serial=++this.voiceSerial;
    const play=()=>{
      if(generation!==this.generation||serial!==this.voiceSerial||this.muted||this.context?.state!=='running')return;
      const buffer=this.buffers.get(name);if(!buffer)return;
      const c=this.context,source=c.createBufferSource(),gain=c.createGain();
      source.buffer=buffer;gain.gain.value=.9;source.connect(gain);gain.connect(this.master);
      this.track(source,gain);source.start();
      const t=c.currentTime;this.music.gain.cancelScheduledValues(t);this.music.gain.setValueAtTime(.065,t);
      this.music.gain.setTargetAtTime(.22,t+buffer.duration,.12);
    };
    if(this.buffers.has(name))play();else void this.ready?.then(play);
  }
  cue(name) {
    this.lastCue=name;
    if(this.muted||this.context?.state!=='running')return;
    const t=this.context.currentTime;
    if(['three','two','one'].includes(name))this.tone(480,t,.15,.2,'square',650,this.master);
    if(name==='start')for(let i=0;i<4;i++)this.tone([330,440,660,880][i],t+i*.075,.17,.16,'triangle',1100,this.master);
    if(name==='nice'||name==='keep-going')for(let i=0;i<3;i++)this.tone([660,880,1320][i],t+i*.06,.15,.15,'sine',undefined,this.master);
    if(name==='crash'){this.hiss(t,.3,.35);this.tone(380,t,1.1,.25,'sawtooth',35,this.master);return;}
    if(name==='finish')for(let i=0;i<3;i++)this.tone([261.63,329.63,392][i],t,1,.1,'triangle',undefined,this.master);
    this.voice(name);
  }
  update(state,speed) {
    if(this.session!==state.sessionId){this.clearNodes();this.session=state.sessionId;this.phase=null;this.count=null;this.passed=0;this.beat=0;}
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
    if(status==='flying'&&state.passed>this.passed){this.passed=state.passed;this.cue(this.passed%2?'nice':'keep-going');}
    if(status!=='flying'||this.muted||this.context?.state!=='running')return;
    const now=this.context.currentTime;if(this.nextBeat<now)this.nextBeat=now;
    const interval=60/Math.min(164,132+speed*3)/4;
    while(this.nextBeat<now+.08){
      const t=this.nextBeat,n=this.beat++%16;
      if(n%4===0){this.tone(145,t,.2,.8,'sine',42);this.tone([55,55,65.41,73.42][n/4],t,.18,.35,'sawtooth');}
      if(n%2===0)this.hiss(t,.045,.11);
      if(n===4||n===12)this.hiss(t,.11,.22);
      if(n%2===1)this.tone([220,261.63,329.63,440][Math.floor(n/2)%4],t,.11,.095,'triangle');
      // Quiet repeating low pulses give the beat a rotor-like texture.
      this.tone(42,t,.035,.07,'triangle');this.nextBeat+=interval;
    }
  }
  clearNodes(){
    this.generation++;this.voiceSerial++;
    for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();this.nextBeat=0;
    if(this.context&&this.music){const t=this.context.currentTime;this.music.gain.cancelScheduledValues(t);this.music.gain.setValueAtTime(.22,t);}
  }
  stop(){this.clearNodes();if(this.context?.state==='running')void this.context.suspend().catch(()=>{});}
  dispose(){this.stop();if(this.context?.state!=='closed')void this.context?.close().catch(()=>{});}
}
