// Default soundtrack for every game: the original Push-up Flight pattern.
// A game can pass its own speed; the shared default is Flight's initial 1x pace.
export function scheduleGameMusic(audio,speed=1){
    const now=audio.context.currentTime;if(audio.nextBeat<now)audio.nextBeat=now;
    const interval=60/Math.min(164,132+speed*3)/4;
    while(audio.nextBeat<now+.08){
      const t=audio.nextBeat,n=audio.beat++%16;
      if(n%4===0){audio.tone(145,t,.2,.8,'sine',42);audio.tone([55,55,65.41,73.42][n/4],t,.18,.35,'sawtooth');}
      if(n%2===0)audio.hiss(t,.045,.11);
      if(n===4||n===12)audio.hiss(t,.11,.22);
      if(n%2===1)audio.tone([220,261.63,329.63,440][Math.floor(n/2)%4],t,.11,.095,'triangle');
      // Quiet repeating low pulses give the beat a rotor-like texture.
      audio.tone(42,t,.035,.07,'triangle');audio.nextBeat+=interval;
    }
}
