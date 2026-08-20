// journey-animation-pim.jsx — journey animation recolored for the light PIM template shell.
// Fits its container (not the viewport); player bar sits below the stage, not over it.
// Playback is chaptered: it holds at each stage beat and advances on click / space / arrow.

(function() {

  const E = {
    outCubic:    t => { const u = t - 1; return u * u * u + 1; },
    inOutCubic:  t => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
    outBack:     t => { const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); },
    outQuart:    t => { const u = t - 1; return 1 - u*u*u*u; },
    inOutSine:   t => -(Math.cos(Math.PI*t)-1)/2,
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function tween(time, start, dur, fn) { return fn(clamp01((time - start) / Math.max(dur, 0.001))); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  const TimeCtx = React.createContext(0);
  function useTime() { return React.useContext(TimeCtx); }

  // ── Palette (template: white page, green / yellow / dark green) ──────────────
  const GREEN='#0aaf7b', YELLOW='#d2bd17', DEEP='#203530';
  const GREEN_TXT='#07845d', YELLOW_TXT='#7d700a';
  const INK='#000000', MUTED='#6b6b6b', LINE='#ececec', PAGE='#ffffff';

  const STORAGE_KEY = 'journey-anim-pim-t';
  const EPS = 1e-6;

  class Stage extends React.Component {
    constructor(props) {
      super(props);
      const { duration } = props;
      const initT = (() => { try { const v = parseFloat(localStorage.getItem(STORAGE_KEY)); return isNaN(v) ? 0 : Math.min(v, duration); } catch(e) { return 0; } })();
      // tCur / playingFlag are the authoritative clock. React batches setState, so
      // reading this.state inside the rAF tick can be a frame or more stale, which
      // is enough to step straight over a hold. State is a mirror for rendering only.
      this.tCur = initT;
      this.playingFlag = true;
      this.state = { t: initT, playing: true, vp: { s: 0.001, ox: 0, oy: 0 } };
      this.lastTime = null;
      this.rafId = null;
      this.el = null;
      this.advance = this.advance.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onScrub = this.onScrub.bind(this);
      this.onPlayButton = this.onPlayButton.bind(this);
    }

    sync() { this.setState({ t: this.tCur, playing: this.playingFlag }); }

    persist(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch(e) {} }

    // Next hold strictly ahead of `time`, or null when none remain. The guard must
    // be EPS and not a wider margin: anything larger than one frame's dt makes a
    // tCur that lands just short of a hold skip past it, which drops the chapter.
    nextHold(time) {
      const hs = this.props.holds || [];
      for (let i = 0; i < hs.length; i++) if (hs[i] > time + EPS) return hs[i];
      return null;
    }

    // Index of the hold we are parked on, or -1 when scrubbed off-beat. Parking
    // clamps tCur to the hold exactly, so this compares exactly too.
    holdIndex(time) {
      const hs = this.props.holds || [];
      for (let i = 0; i < hs.length; i++) if (Math.abs(hs[i] - time) < 0.001) return i;
      return -1;
    }

    componentDidMount() {
      this.tick = (now) => {
        if (this.playingFlag && this.lastTime !== null) {
          const dt = Math.min((now - this.lastTime) / 1000, 0.05);
          let nt = Math.min(this.props.duration, this.tCur + dt);
          const hold = this.nextHold(this.tCur);
          // EPS matters: accumulating dt drifts nt a few 1e-15 below an exact hold,
          // which would step over it and lose that chapter for good. Clamping nt to
          // the hold value also resets the drift at the start of every chapter.
          if (hold !== null && nt >= hold - EPS) { nt = hold; this.playingFlag = false; }
          if (nt >= this.props.duration - EPS) { nt = this.props.duration; this.playingFlag = false; }
          this.tCur = nt;
          this.persist(nt);
          this.sync();
        }
        this.lastTime = now;
        this.rafId = requestAnimationFrame(this.tick);
      };
      this.rafId = requestAnimationFrame(this.tick);

      this.measure = () => {
        if (!this.el) return;
        const { width, height } = this.props;
        const w = this.el.clientWidth, h = this.el.clientHeight;
        if (!w || !h) return;
        const s = Math.max(0.05, Math.min(w / width, h / height));
        this.setState({ vp: { s, ox: (w - width * s) / 2, oy: (h - height * s) / 2 } });
      };
      this.measure();
      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(() => this.measure());
        if (this.el) this.ro.observe(this.el);
      }
      window.addEventListener('resize', this.measure);
    }

    componentWillUnmount() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (this.ro) this.ro.disconnect();
      window.removeEventListener('resize', this.measure);
    }

    restart() {
      this.tCur = 0;
      this.playingFlag = true;
      this.lastTime = null;
      this.persist(0);
      this.sync();
    }

    // Click / key on the stage: replay at the end, otherwise run to the next hold.
    advance() {
      if (this.tCur >= this.props.duration) { this.restart(); return; }
      this.playingFlag = !this.playingFlag;
      this.sync();
    }

    onPlayButton(e) {
      e.stopPropagation();
      this.advance();
    }

    onScrub(v) {
      this.tCur = v;
      this.playingFlag = false;
      this.persist(v);
      this.sync();
    }

    onKeyDown(e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.advance();
      }
    }

    render() {
      const { width, height, duration, background, children } = this.props;
      const { t, playing, vp } = this.state;

      const atEnd = t >= duration;
      const hi = this.holdIndex(t);
      let hint = null;
      if (!playing) {
        if (atEnd) hint = 'Click to replay';
        else if (hi >= 0 && hi <= 5) hint = `Click for stage ${hi + 1} of 6`;
        else if (hi === 6) hint = 'Click for the channel summary';
        else hint = 'Click to play';
      }

      return React.createElement(TimeCtx.Provider, { value: t },
        React.createElement('div', { style:{ width:'100%', display:'flex', flexDirection:'column' } },
          React.createElement('div', {
            ref: el => { this.el = el; },
            onClick: this.advance,
            onKeyDown: this.onKeyDown,
            tabIndex: 0,
            role: 'button',
            'aria-label': 'Consumer journey animation. Click or press space to advance one stage.',
            style:{
              position:'relative', width:'100%', aspectRatio:'16 / 9', overflow:'hidden',
              background: background || PAGE, cursor:'pointer', outline:'none',
            }
          },
            React.createElement('div', {
              style:{
                position:'absolute', left:0, top:0, width, height,
                transform:`translate(${vp.ox}px,${vp.oy}px) scale(${vp.s})`,
                transformOrigin:'top left',
                pointerEvents:'none',
              }
            }, children),
            hint && React.createElement('div', { style:{
              position:'absolute', right:20, bottom:18,
              display:'flex', alignItems:'center', gap:9,
              background:PAGE, border:`1px solid ${LINE}`, borderRadius:100,
              boxShadow:'0 2px 10px rgba(32,53,48,0.10)',
              padding:'8px 15px 8px 13px', pointerEvents:'none',
            }},
              React.createElement('span', { style:{ width:8, height:8, borderRadius:'50%', background:GREEN, flexShrink:0 } }),
              React.createElement('span', { style:{ fontFamily:'Outfit,sans-serif', fontSize:13, fontWeight:600, color:DEEP, whiteSpace:'nowrap' } }, hint)
            )
          ),
          React.createElement('div', {
            style:{
              height:44, background:'#fafafa', borderTop:`1px solid ${LINE}`,
              display:'flex', alignItems:'center', gap:14, padding:'0 20px'
            }
          },
            React.createElement('button', {
              onClick: this.onPlayButton,
              style:{ background:'none', border:'none', color:DEEP, fontSize:15, cursor:'pointer', padding:'0 4px', flexShrink:0, lineHeight:1 }
            }, (playing && !atEnd) ? '⏸' : (atEnd ? '↺' : '▶')),
            React.createElement('input', {
              type:'range', min:0, max:duration, step:0.05, value:t,
              onChange: e => this.onScrub(parseFloat(e.target.value)),
              style:{ flex:1, accentColor:GREEN, cursor:'pointer' }
            }),
            React.createElement('span', { style:{ fontFamily:'Outfit,sans-serif', fontSize:13, fontWeight:500, color:MUTED, width:74, textAlign:'right', flexShrink:0 } },
              `${t.toFixed(1)} / ${duration}s`
            )
          )
        )
      );
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────────
  const STAGES = [
    { id:1, x:200,  above:true,  color:YELLOW, phase:'Awareness',     title:['Legal Need','Arises'],       pills:['Search','Social'],           dark:true  },
    { id:2, x:504,  above:false, color:YELLOW, phase:'Awareness',     title:['Digital','Discovery'],       pills:['Video','Display','Social'],  dark:true  },
    { id:3, x:808,  above:true,  color:GREEN,  phase:'Consideration', title:['Research &','Exploration'],  pills:['Search','Reviews'],          dark:false },
    { id:4, x:1112, above:false, color:GREEN,  phase:'Consideration', title:['Active','Consideration'],    pills:['Social','CTV','Display'],    dark:false },
    { id:5, x:1416, above:true,  color:DEEP,   phase:'Conversion',    title:['Intent &','Decision'],       pills:['Search','Retargeting'],      dark:false },
    { id:6, x:1720, above:false, color:DEEP,   phase:'Conversion',    title:['Contact','& Hire'],          pills:['Search','Maps','Phone'],     dark:false, final:true },
  ];
  const STAGE_STARTS = [3.5, 5.5, 7.5, 9.5, 11.5, 13.5];
  const TOTAL = 20;

  // Chapter boundaries. Each stage animation resolves ~1.35s after its start, so
  // holding at start + 1.7 parks the story with that stage complete and the next
  // one not yet begun. Stage 6 holds at 16.6 so its glow bloom finishes first.
  const HOLDS = [3.45, 5.2, 7.2, 9.2, 11.2, 13.2, 16.45, TOTAL];

  // ── SVG spine layer ─────────────────────────────────────────────────────────
  function SpineLayer() {
    const t = useTime();
    const spineP = tween(t, 2.0, 1.7, E.inOutCubic);
    const divsP  = tween(t, 2.8, 0.5, E.outCubic);
    const arrP   = tween(t, 2.7, 0.8, E.outCubic);

    const arrowXs    = [346, 650, 954, 1258, 1562];
    const arrowFills = [YELLOW, DEEP, GREEN, DEEP, GREEN];
    const arrowOps   = [0.9, 0.22, 0.9, 0.22, 0.9];
    const glowP      = tween(t, 14.5, 2.0, E.outQuart);

    return React.createElement('svg', {
      style:{ position:'absolute', top:0, left:0, width:'1920px', height:'1080px', pointerEvents:'none' }
    },
      React.createElement('defs', null,
        React.createElement('radialGradient', { id:'rgPim6', cx:'90%', cy:'76%', r:'30%' },
          React.createElement('stop', { offset:'0%',   stopColor:GREEN, stopOpacity: 0.16 * glowP }),
          React.createElement('stop', { offset:'100%', stopColor:GREEN, stopOpacity: 0 })
        )
      ),
      glowP > 0 && React.createElement('rect', { width:1920, height:1080, fill:'url(#rgPim6)' }),
      // Dividers
      React.createElement('line', { x1:662,  y1:120, x2:662,  y2:840, stroke:DEEP, strokeOpacity:0.14*divsP, strokeWidth:1, strokeDasharray:'4 4' }),
      React.createElement('line', { x1:1258, y1:120, x2:1258, y2:840, stroke:DEEP, strokeOpacity:0.14*divsP, strokeWidth:1, strokeDasharray:'4 4' }),
      // Spine
      React.createElement('line', { x1:200, y1:500, x2:lerp(200,1720,spineP), y2:500, stroke:DEEP, strokeOpacity:0.3, strokeWidth:2, strokeDasharray:'9 6' }),
      // Traveling bead
      spineP > 0 && spineP < 1 && React.createElement('g', null,
        React.createElement('circle', { cx:lerp(200,1720,spineP), cy:500, r:16, fill:GREEN, opacity:0.14 }),
        React.createElement('circle', { cx:lerp(200,1720,spineP), cy:500, r:6,  fill:GREEN, opacity:0.9 })
      ),
      // Arrows
      ...arrowXs.map((ax,i) => React.createElement('polygon', { key:'ar'+i, points:`${ax},496 ${ax+15},500 ${ax},504`, fill:arrowFills[i], opacity:arrowOps[i]*arrP })),
      // Dots + connectors per stage
      ...STAGES.map((s,i) => {
        const st = STAGE_STARTS[i];
        if (t < st - 0.05) return null;
        const dotP  = tween(t, st,       0.38, E.outBack);
        const connP = tween(t, st + 0.12, 0.42, E.outCubic);
        const connY2 = s.above ? 430 : 570;
        const connCurY = lerp(500, connY2, connP);
        const elapsed  = Math.max(0, t - st);
        const cycleT   = (elapsed % 2.2) / 2.2;
        const pulseR   = 18 + cycleT * 18;
        const pulseO   = Math.max(0, 0.40 - cycleT * 0.40) * Math.min(1, elapsed * 4) * dotP;

        return React.createElement('g', { key:'sg'+i },
          connP > 0 && React.createElement('line', { x1:s.x, y1:500, x2:s.x, y2:connCurY, stroke:s.color, strokeOpacity:0.8, strokeWidth:2 }),
          React.createElement('circle', { cx:s.x, cy:500, r:pulseR, fill:'none', stroke:s.color, strokeOpacity:pulseO, strokeWidth:1.5 }),
          React.createElement('circle', { cx:s.x, cy:500, r:13*dotP, fill:s.color }),
          dotP > 0.55 && React.createElement('text', {
            x:s.x, y:505, textAnchor:'middle',
            fontFamily:'Outfit,sans-serif', fontSize:11, fontWeight:700,
            fill: s.dark ? DEEP : 'white',
            opacity: clamp01((dotP - 0.55) * 2.5)
          }, `0${s.id}`)
        );
      })
    );
  }

  // ── Stage card ──────────────────────────────────────────────────────────────
  function StageCard({ stage, startTime }) {
    const t = useTime();
    if (t < startTime + 0.15) return null;

    const cardP  = tween(t, startTime + 0.20, 0.55, E.outBack);
    const labelP = tween(t, startTime + 0.50, 0.30, E.outCubic);
    const titleP = tween(t, startTime + 0.56, 0.38, E.outCubic);

    const W = 284;
    const left   = stage.x - W / 2;
    const top    = stage.above ? 190 : 570;
    const yOff   = stage.above ? lerp(-50, 0, cardP) : lerp(50, 0, cardP);

    const textC  = stage.dark ? DEEP : 'white';
    const subC   = stage.dark ? 'rgba(32,53,48,0.7)'  : 'rgba(255,255,255,0.7)';
    const pillBg = stage.dark ? 'rgba(32,53,48,0.12)' : 'rgba(255,255,255,0.18)';
    const pillBd = stage.dark ? 'rgba(32,53,48,0.22)' : 'rgba(255,255,255,0.32)';
    const pillC  = stage.dark ? DEEP : 'white';

    const fgP    = stage.final ? tween(t, startTime + 0.7, 1.6, E.outQuart) : 0;
    const shadow = stage.final
      ? `0 10px 34px rgba(10,175,123,${0.20 + 0.24*fgP}), 0 0 ${Math.round(46*fgP)}px rgba(10,175,123,0.32)`
      : `0 6px 22px rgba(32,53,48,0.16)`;

    return React.createElement('div', { style:{
      position:'absolute', left, top: top + yOff, width:W, height:240,
      background:stage.color, borderRadius:10, boxShadow:shadow,
      border: stage.final ? `2px solid rgba(10,175,123,${0.55*fgP})` : 'none',
      opacity: clamp01(cardP * 1.5), overflow:'hidden',
      display:'flex', flexDirection:'column', padding:'22px 20px 16px',
      transform:`scale(${lerp(0.86,1,clamp01(cardP))})`,
      transformOrigin: stage.above ? 'bottom center' : 'top center',
    }},
      React.createElement('div', { style:{ position:'absolute', right:-32, bottom:-32, width:120, height:120, borderRadius:'50%', background: stage.dark ? 'rgba(32,53,48,0.07)' : 'rgba(255,255,255,0.11)', pointerEvents:'none' } }),
      React.createElement('div', { style:{ fontFamily:'Outfit,sans-serif', fontSize:15, fontWeight:700, letterSpacing:'2.2px', color:subC, textTransform:'uppercase', marginBottom:10, opacity:labelP } },
        stage.phase
      ),
      React.createElement('div', { style:{ fontFamily:'Outfit,sans-serif', fontSize:28, fontWeight:700, letterSpacing:'-0.4px', color:textC, lineHeight:1.2, flex:1, opacity:titleP } },
        stage.title[0], React.createElement('br'), stage.title[1]
      ),
      React.createElement('div', { style:{ display:'flex', gap:6, flexWrap:'wrap' } },
        ...stage.pills.map((pill, pi) => {
          const pp = tween(t, startTime + 0.78 + pi * 0.13, 0.28, E.outBack);
          return React.createElement('span', { key:pi, style:{
            fontFamily:'Outfit,sans-serif', fontSize:15, fontWeight:600,
            color:pillC, background:pillBg, border:`1px solid ${pillBd}`,
            borderRadius:100, padding:'6px 13px', whiteSpace:'nowrap',
            opacity:clamp01(pp*1.5), display:'inline-block',
            transform:`scale(${lerp(0.62,1,clamp01(pp))})`, transformOrigin:'left center'
          }}, pill);
        })
      )
    );
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  function Footer() {
    const t = useTime();
    const p = tween(t, 16.5, 0.9, E.outCubic);
    if (p < 0.01) return null;
    const channels = ['Paid Search','Social Media','Programmatic Display','Video & CTV','Retargeting','Local & Directory','Organic / SEO'];
    return React.createElement('div', { style:{
      position:'absolute', bottom:44, left:72, right:72,
      borderTop:`1px solid ${LINE}`, paddingTop:20,
      display:'flex', alignItems:'center', gap:28,
      opacity:p, transform:`translateY(${lerp(20,0,p)}px)`
    }},
      React.createElement('div', { style:{ flexShrink:0 } },
        React.createElement('div', { style:{ fontFamily:'Outfit,sans-serif', fontSize:15, fontWeight:700, letterSpacing:'2.4px', color:GREEN_TXT, textTransform:'uppercase', marginBottom:6 } }, 'Full-Funnel Media Reach'),
        React.createElement('div', { style:{ fontFamily:'Outfit,sans-serif', fontSize:18, fontWeight:500, color:MUTED } }, 'Present from first awareness to final hire.')
      ),
      React.createElement('div', { style:{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' } },
        ...channels.map((ch,i) => {
          const cp = tween(t, 16.6 + i * 0.09, 0.3, E.outCubic);
          return React.createElement('span', { key:i, style:{
            fontFamily:'Outfit,sans-serif', fontSize:15, fontWeight:500,
            color:'#444444', background:'#fafafa',
            border:`1px solid ${LINE}`, borderRadius:100,
            padding:'7px 15px', whiteSpace:'nowrap', opacity:cp
          }}, ch);
        })
      )
    );
  }

  // ── Chrome (top bar, phase bands) ───────────────────────────────────────────
  function ChromeLayer() {
    const t = useTime();

    const barP   = tween(t, 0.1, 0.9,  E.outCubic);

    const phNames  = ['Awareness','Consideration','Conversion'];
    const phTextC  = [YELLOW_TXT, GREEN_TXT, DEEP];
    const phBg     = ['rgba(210,189,23,0.16)','rgba(10,175,123,0.10)','rgba(32,53,48,0.07)'];
    const phBrd    = [YELLOW, GREEN, DEEP];
    const phRad    = ['3px 0 0 3px','0','0 3px 3px 0'];

    return React.createElement(React.Fragment, null,

      React.createElement('div', { style:{ position:'absolute', top:0, left:0, right:0, height:5, background:`linear-gradient(90deg,${YELLOW},${GREEN},${DEEP},${GREEN},${YELLOW})`, transform:`scaleX(${barP})`, transformOrigin:'left center' } }),

      React.createElement('div', { style:{ position:'absolute', top:64, left:72, right:72, height:44, display:'flex', gap:2 } },
        ...phNames.map((ph,i) => {
          const pp = tween(t, 2.0 + i * 0.2, 0.52, E.outCubic);
          return React.createElement('div', { key:ph, style:{ flex:1, background:phBg[i], display:'flex', alignItems:'center', paddingLeft:16, borderLeft:`3px solid ${phBrd[i]}`, borderRadius:phRad[i], opacity:pp, transform:`translateX(${lerp(-14,0,pp)}px)` } },
            React.createElement('span', { style:{ fontFamily:'Outfit,sans-serif', fontSize:15, fontWeight:700, letterSpacing:'2.8px', color:phTextC[i], textTransform:'uppercase' } }, ph)
          );
        })
      )
    );
  }

  function JourneyAnimPIM() {
    return React.createElement(Stage, { width:1920, height:1080, duration:TOTAL, holds:HOLDS, background:PAGE },
      React.createElement(ChromeLayer, null),
      React.createElement(SpineLayer, null),
      ...STAGES.map((s,i) => React.createElement(StageCard, { key:i, stage:s, startTime:STAGE_STARTS[i] })),
      React.createElement(Footer, null)
    );
  }

  window.JourneyAnimPIM = JourneyAnimPIM;
  if (typeof module !== 'undefined') module.exports = { JourneyAnimPIM };

})();
