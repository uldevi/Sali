const { useState, useEffect, useRef } = React;
const TABS = ["log", "history", "progress"];

const MUSCLES = [
  ["Rinta","Selkä"],
  ["Olkapäät","Ojentajat","Hauikset"],
  ["Jalat","Vatsat","Cardio"]
];
const KEY = "gym_v5";

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
db.enablePersistence().catch(() => {});

function uid() { return Math.random().toString(36).slice(2); }
function haptic() { try { navigator.vibrate && navigator.vibrate(8); } catch(e) {} }

async function runBatched(ops) {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach(op => {
      if (op.type === "delete") batch.delete(op.ref);
      else batch.set(op.ref, op.data);
    });
    await batch.commit();
  }
}
function fmtDate(d) { return new Date(d+"T12:00:00").toLocaleDateString("fi-FI",{day:"numeric",month:"short",year:"numeric"}); }
function todayStr() { return new Date().toISOString().split("T")[0]; }
function nowTime() { return new Date().toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"}); }
function newSet() { return {id:uid(),reps:"",weight:""}; }
function newEx() { return {id:uid(),name:"",sets:[newSet()]}; }
function newBlock(muscle) { return {id:uid(),muscle,exercises:[newEx()],ct:"",cn:""}; }

// ---------- design tokens ----------

const C = {
  bg: "#121212",
  bgElev: "#1a1a1a",
  bgElev2: "#222222",
  border: "#2e2e2e",
  borderSoft: "#242424",
  text: "#ededed",
  textDim: "#9a9a9a",
  textFaint: "#6b6b6b",
  accent: "#c9c9c9",
  accentDim: "#8f8f8f",
  accentSoft: "rgba(201,201,201,0.10)",
  danger: "#d9534f",
  warn: "#c9a227",
  success: "#7aa863"
};

const NAV_H = 60;
const NAV_SAFE_H = "calc("+NAV_H+"px + env(safe-area-inset-bottom))";

const S = {
  wrap: {fontFamily:"'Manrope',sans-serif", maxWidth:520, margin:"0 auto", color:C.text, minHeight:"100vh", display:"flex", flexDirection:"column"},
  scroll: {padding:"14px 14px 0", flex:1},
  header: {display:"flex", alignItems:"center", gap:10, marginBottom:18},
  logoWrap: {width:36, height:36, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 0 1px "+C.border, flexShrink:0, overflow:"hidden"},
  brand: {fontFamily:"'Oswald',sans-serif", fontSize:21, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase", color:C.text, margin:0, flex:1},
  iconBtn: {width:38, height:38, borderRadius:7, border:"1px solid "+C.border, background:C.bgElev, color:C.textDim, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0},

  card: {background:C.bgElev, border:"1px solid "+C.border, borderRadius:6, padding:"14px", marginBottom:12},
  cardEditing: {background:C.bgElev, border:"1px solid "+C.border, borderRadius:6, padding:"12px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10},
  cardBlock: {background:C.bgElev, border:"1px solid "+C.border, borderRadius:6, padding:"14px", marginBottom:12},

  label: {fontSize:11, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:700, marginBottom:10},

  mBtn: a => ({padding:"7px 13px", borderRadius:5, border:"1px solid "+(a?C.accent:C.border), background:a?C.accent:C.bgElev2, color:a?"#141414":C.text, fontSize:12.5, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5}),

  inp: {height:38, padding:"0 10px", border:"1px solid "+C.border, borderRadius:5, fontSize:14, background:C.bgElev2, color:C.text, width:"100%"},
  textarea: {padding:"8px 10px", border:"1px solid "+C.border, borderRadius:5, fontSize:14, background:C.bgElev2, color:C.text, width:"100%", height:60, resize:"none"},

  exBox: {background:C.bgElev2, borderRadius:5, padding:"11px", marginBottom:9, border:"1px solid "+C.borderSoft},
  chip: {fontSize:11.5, padding:"4px 10px", borderRadius:4, background:C.bg, color:C.textDim, border:"1px solid "+C.border, cursor:"pointer"},

  setHeaderRow: {display:"flex", gap:6, marginBottom:5, paddingLeft:28},
  setHeaderCell: {width:98, textAlign:"center", fontSize:9.5, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700},
  setRow: {display:"flex", alignItems:"center", gap:6, marginBottom:6},
  setBadge: {width:22, height:22, borderRadius:4, background:C.bg, color:C.textDim, fontSize:10.5, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0},
  stepper: {display:"flex", alignItems:"center", background:C.bg, border:"1px solid "+C.border, borderRadius:5, overflow:"hidden", width:98, flexShrink:0},
  stepBtn: {width:28, height:32, border:"none", background:"transparent", color:C.textDim, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, padding:0},
  stepInput: {width:42, height:32, border:"none", background:"transparent", color:C.text, textAlign:"center", fontSize:13.5, fontWeight:600, padding:0, flex:1, minWidth:0},
  delIcon: {background:"none", border:"none", cursor:"pointer", color:C.textFaint, display:"flex", alignItems:"center", justifyContent:"center", padding:5, marginLeft:"auto", flexShrink:0},

  sbtn: {padding:"7px 12px", borderRadius:5, border:"1px solid "+C.border, background:"transparent", fontSize:12.5, cursor:"pointer", color:C.textDim, marginTop:2, display:"inline-flex", alignItems:"center", gap:5, fontWeight:600},
  abtn: {width:"100%", padding:"10px", borderRadius:5, border:"1px dashed "+C.border, background:"transparent", fontSize:13.5, cursor:"pointer", color:C.textDim, marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontWeight:600},

  tag: {fontSize:11, padding:"3px 9px", borderRadius:4, background:C.bgElev2, color:C.textDim, fontWeight:700, border:"1px solid "+C.border},
  empty: {textAlign:"center", color:C.textFaint, padding:"2.2rem 0", fontSize:13.5},

  stats: {display:"flex", gap:8, marginBottom:12},
  stat: {flex:1, background:C.bgElev, border:"1px solid "+C.border, borderRadius:6, padding:"12px 8px", textAlign:"center"},
  statNum: {fontFamily:"'Oswald',sans-serif", fontSize:24, fontWeight:600, lineHeight:1},
  statLabel: {fontSize:10, color:C.textFaint, marginTop:4, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600},

  calGrid: {display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3},
  histItem: {background:C.bgElev, border:"1px solid "+C.border, borderRadius:6, padding:"12px 13px", marginBottom:9},

  toast: {position:"fixed", left:"50%", transform:"translateX(-50%)", background:C.bgElev2, border:"1px solid "+C.border, color:C.text, padding:"10px 18px", borderRadius:5, fontSize:13, zIndex:999, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:8, boxShadow:"0 8px 24px rgba(0,0,0,0.4)"},

  nav: {position:"fixed", left:0, right:0, bottom:0, background:"rgba(18,18,18,0.92)", backdropFilter:"blur(10px)", borderTop:"1px solid "+C.border, paddingBottom:"env(safe-area-inset-bottom)", zIndex:50},
  navInner: {maxWidth:520, margin:"0 auto", display:"flex", height:NAV_H},
  navItem: a => ({flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, background:"none", border:"none", cursor:"pointer", color:a?C.accent:C.textFaint, position:"relative"}),
  navLabel: {fontSize:10.5, fontWeight:700, letterSpacing:"0.02em"},
  navIndicator: {position:"absolute", top:0, left:"38%", right:"38%", height:2, background:C.accent},

  sheetBackdrop: {position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:100, display:"flex", alignItems:"flex-end"},
  sheet: {width:"100%", maxWidth:520, margin:"0 auto", background:C.bgElev, borderRadius:"8px 8px 0 0", border:"1px solid "+C.border, borderBottom:"none", padding:"10px 20px calc(24px + env(safe-area-inset-bottom))", textAlign:"center"},
  sheetHandle: {width:36, height:4, borderRadius:3, background:C.border, margin:"4px auto 18px"},
  avatar: {width:56, height:56, borderRadius:6, background:C.bgElev2, border:"1px solid "+C.border, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Oswald',sans-serif", fontSize:22, fontWeight:600, margin:"0 auto 12px"},
  sheetName: {fontSize:15, fontWeight:700, color:C.text},
  sheetEmail: {fontSize:12.5, color:C.textFaint, marginBottom:20},
  dangerBtn: {width:"100%", padding:"12px", borderRadius:5, border:"1px solid rgba(217,83,79,0.3)", background:"rgba(217,83,79,0.08)", color:C.danger, fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8},

  savebar: {position:"fixed", left:0, right:0, background:C.bg, borderTop:"1px solid "+C.border, padding:"10px 14px", zIndex:40},
  savebarInner: {maxWidth:520, margin:"0 auto"},
  savebtn: {width:"100%", padding:13, borderRadius:5, border:"1px solid "+C.accent, background:C.accent, color:"#141414", fontSize:14.5, fontWeight:700, cursor:"pointer"},
  cancelbtn: {width:"100%", padding:10, borderRadius:5, border:"none", background:"transparent", color:C.textFaint, fontSize:13, cursor:"pointer", marginTop:6, fontWeight:600},

  authWrap: {minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, textAlign:"center", padding:24, fontFamily:"'Manrope',sans-serif", color:C.text},
  authLogo: {width:72, height:72, borderRadius:10, boxShadow:"0 0 0 1px "+C.border, overflow:"hidden"},
  authTitle: {fontFamily:"'Oswald',sans-serif", fontSize:28, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase", margin:0},
  authSub: {fontSize:13.5, color:C.textDim, maxWidth:280, lineHeight:1.5},
  authBtn: {padding:"13px 28px", borderRadius:5, border:"1px solid "+C.accent, background:C.accent, color:"#141414", fontSize:14.5, fontWeight:700, cursor:"pointer"},
  authFoot: {fontSize:11.5, color:C.textFaint, maxWidth:260},

  spinner: {width:32, height:32, borderRadius:"50%", border:"3px solid "+C.borderSoft, borderTopColor:C.accent}
};

// ---------- icons ----------

function Icon({children, size=19, style}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}
function IconPlus(p){ return <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>; }
function IconMinus(p){ return <Icon {...p}><path d="M5 12h14"/></Icon>; }
function IconDumbbell(p){ return <Icon {...p}><path d="M6.5 6.5l11 11M4 9l2.5-2.5M20 15l-2.5 2.5M2.5 7.5l2 2M19.5 16.5l2 2M7 4l2 2M15 18l2 2"/></Icon>; }
function IconClock(p){ return <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3.2 2"/></Icon>; }
function IconTrending(p){ return <Icon {...p}><path d="M3 17l6-6 4 4 7-8"/><path d="M15 7h6v6"/></Icon>; }
function IconSettings(p){ return <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></Icon>; }
function IconX(p){ return <Icon {...p}><path d="M18 6L6 18M6 6l12 12"/></Icon>; }
function IconTrash(p){ return <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></Icon>; }
function IconEdit(p){ return <Icon {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></Icon>; }
function IconCheck(p){ return <Icon {...p}><path d="M20 6L9 17l-5-5"/></Icon>; }
function IconLogOut(p){ return <Icon {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></Icon>; }

const NAV_ITEMS = [
  ["log","Treeni",IconPlus],
  ["history","Historia",IconClock],
  ["progress","Progressio",IconTrending]
];

function Stepper({value, step, onChange}) {
  function bump(delta) {
    const cur = parseFloat(value) || 0;
    let next = Math.round((cur + delta) * 100) / 100;
    if (next < 0) next = 0;
    onChange(String(next));
    haptic();
  }
  return (
    <div style={S.stepper}>
      <button type="button" className="press" style={S.stepBtn} onClick={() => bump(-step)} aria-label="Vähennä"><IconMinus size={13}/></button>
      <input style={S.stepInput} type="number" inputMode="decimal" step={step} value={value}
        onFocus={e => e.target.select()}
        onChange={e => onChange(e.target.value)} />
      <button type="button" className="press" style={S.stepBtn} onClick={() => bump(step)} aria-label="Lisää"><IconPlus size={13}/></button>
    </div>
  );
}

function Spinner({label}) {
  return (
    <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"40px 0"}}>
      <div className="spin-anim" style={S.spinner} />
      {label && <div style={{color:C.textFaint, fontSize:13}}>{label}</div>}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState("log");
  const [workouts, setWorkouts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [toast, setToast] = useState("");
  const [pEx, setPEx] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const touchRef = useRef({x:0, y:0, t:0});
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  useEffect(() => {
    function onStart(e) {
      const t = e.touches[0];
      touchRef.current = {x:t.clientX, y:t.clientY, t:Date.now()};
    }
    function onEnd(e) {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      const dt = Date.now() - touchRef.current.t;
      if (dt > 600) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.7) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (["input","textarea","select","button"].includes(tag)) return;
      const idx = TABS.indexOf(tabRef.current);
      if (dx < 0 && idx < TABS.length-1) setTab(TABS[idx+1]);
      else if (dx > 0 && idx > 0) setTab(TABS[idx-1]);
    }
    document.addEventListener("touchstart", onStart, {passive:true});
    document.addEventListener("touchend", onEnd, {passive:true});
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) { setWorkouts([]); setLoaded(false); return; }
    const col = db.collection("users").doc(user.uid).collection("workouts");
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      try {
        const probe = await col.limit(1).get();
        if (probe.empty) {
          try {
            const raw = localStorage.getItem(KEY);
            const local = raw ? (JSON.parse(raw).w || []) : [];
            if (local.length) {
              const base = Date.now() - local.length;
              const ops = local.map((w, i) => {
                const id = w.id || uid();
                return {type:"set", ref: col.doc(id), data: Object.assign({}, w, {id, ts: base + i})};
              });
              await runBatched(ops);
            }
          } catch(e) {}
        }
      } catch(e) {}
      if (cancelled) return;
      unsub = col.orderBy("ts", "asc").onSnapshot(snap => {
        setWorkouts(snap.docs.map(d => d.data()));
        setLoaded(true);
      }, () => setLoaded(true));
    })();
    return () => { cancelled = true; unsub(); };
  }, [user]);

  function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(() => {
      auth.signInWithRedirect(provider).catch(() => showToast("Kirjautuminen epäonnistui"));
    });
  }
  function signOutUser() { auth.signOut(); }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2000); }

  const selMuscles = blocks.map(b => b.muscle);

  function toggleMuscle(m) {
    haptic();
    const idx = blocks.findIndex(b => b.muscle === m);
    if (idx >= 0) setBlocks(p => p.filter(b => b.muscle !== m));
    else setBlocks(p => [...p, newBlock(m)]);
  }

  function rmBlock(id) { haptic(); setBlocks(p => p.filter(b => b.id !== id)); }
  function updBlock(id, f, v) { setBlocks(p => p.map(b => b.id === id ? Object.assign({}, b, {[f]:v}) : b)); }

  function addEx(bid) {
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises:[...b.exercises, newEx()]}) : b));
  }
  function rmEx(bid, eid) {
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises: b.exercises.filter(e => e.id !== eid)}) : b));
  }
  function setExName(bid, eid, v) {
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises: b.exercises.map(e => e.id === eid ? Object.assign({}, e, {name:v}) : e)}) : b));
  }
  function addSet(bid, eid) {
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises: b.exercises.map(e => {
      if (e.id !== eid) return e;
      const last = e.sets[e.sets.length - 1];
      const copy = last ? {id:uid(), reps:last.reps, weight:last.weight} : newSet();
      return Object.assign({}, e, {sets:[...e.sets, copy]});
    })}) : b));
  }
  function rmSet(bid, eid, sid) {
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises: b.exercises.map(e => e.id === eid ? Object.assign({}, e, {sets: e.sets.filter(s => s.id !== sid)}) : e)}) : b));
  }
  function updSet(bid, eid, sid, f, v) {
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises: b.exercises.map(e => e.id === eid ? Object.assign({}, e, {sets: e.sets.map(s => s.id === sid ? Object.assign({}, s, {[f]:v}) : s)}) : e)}) : b));
  }

  function prevEx(muscle) {
    const s = new Set();
    workouts.forEach(w => (w.groups||[]).forEach(g => {
      if (g.muscle === muscle) (g.exercises||[]).forEach(e => e.name && s.add(e.name));
    }));
    return [...s];
  }

  function saveWorkout() {
    if (!blocks.length) { showToast("Lisää lihasryhmä"); return; }
    const groups = blocks.map(b => {
      if (b.muscle === "Cardio") return {muscle:"Cardio", ct:b.ct, cn:b.cn, exercises:[]};
      return {muscle:b.muscle, exercises:b.exercises.filter(e => e.name.trim()).map(e => ({name:e.name.trim(), sets:e.sets}))};
    }).filter(g => g.muscle === "Cardio" || g.exercises.length);
    if (!groups.length) { showToast("Lisää liike"); return; }
    haptic();
    const col = db.collection("users").doc(user.uid).collection("workouts");
    if (editingId !== null) {
      const existing = workouts.find(w => w.id === editingId);
      col.doc(editingId).set(Object.assign({}, existing, {groups})).catch(() => showToast("Tallennus epäonnistui"));
      setEditingId(null);
      setBlocks([]);
      showToast("Päivitetty!");
    } else {
      const id = uid();
      col.doc(id).set({id, date:todayStr(), time:nowTime(), ts:Date.now(), groups}).catch(() => showToast("Tallennus epäonnistui"));
      setBlocks([]);
      showToast("Tallennettu!");
    }
  }

  function editWorkout(id) {
    const w = workouts.find(x => x.id === id);
    if (!w) return;
    haptic();
    const newBlocks = (w.groups||[]).map(g => ({
      id: uid(),
      muscle: g.muscle,
      exercises: g.muscle === "Cardio" ? [newEx()] : (g.exercises || []).map(e => ({
        id: uid(),
        name: e.name,
        sets: (e.sets || []).map(s => ({id:uid(), reps:s.reps, weight:s.weight}))
      })),
      ct: g.ct || "",
      cn: g.cn || ""
    }));
    setBlocks(newBlocks);
    setEditingId(id);
    setTab("log");
    setShowSettings(false);
    window.scrollTo(0, 0);
  }

  function cancelEdit() {
    setEditingId(null);
    setBlocks([]);
  }

  function delW(id) {
    if (!confirm("Poistetaanko tämä treeni?")) return;
    haptic();
    if (editingId === id) { setEditingId(null); setBlocks([]); }
    db.collection("users").doc(user.uid).collection("workouts").doc(id).delete().catch(() => showToast("Poisto epäonnistui"));
  }

  const allEx = [...new Set(workouts.flatMap(w => (w.groups||[]).flatMap(g => (g.exercises||[]).map(e => e.name))))].filter(Boolean).sort();
  const curEx = pEx || allEx[0] || "";

  const prs = {};
  workouts.forEach(w => (w.groups||[]).forEach(g => (g.exercises||[]).forEach(e => {
    (e.sets||[]).forEach(s => {
      const wt = parseFloat(s.weight)||0;
      if (!prs[e.name] || wt > prs[e.name].w) prs[e.name] = {w:wt, d:w.date};
    });
  })));

  const pEntries = workouts.flatMap(w =>
    (w.groups||[]).flatMap(g =>
      (g.exercises||[]).filter(e => e.name === curEx).flatMap(e =>
        (e.sets||[]).map(s => ({date:w.date, reps:s.reps, weight:parseFloat(s.weight)||0}))
      )
    )
  ).reverse();

  const cardioCount = workouts.filter(w => (w.groups||[]).some(g => g.muscle === "Cardio")).length;

  const last30 = Date.now() - 30*24*3600*1000;
  const recent30 = workouts.filter(w => new Date(w.date+"T12:00:00").getTime() > last30).length;
  let consLabel = "Heikko", consColor = C.danger;
  if (workouts.length === 0) { consLabel = "—"; consColor = C.textFaint; }
  else if (recent30 >= 12) { consLabel = "Erinomainen"; consColor = C.success; }
  else if (recent30 >= 8) { consLabel = "Hyvä"; consColor = "#c3e08a"; }
  else if (recent30 >= 4) { consLabel = "Kohtalainen"; consColor = C.warn; }
  else { consLabel = "Heikko"; consColor = C.danger; }

  const now = new Date();
  const yr = now.getFullYear(), mo = now.getMonth();
  const fd = new Date(yr,mo,1).getDay();
  const dim = new Date(yr,mo+1,0).getDate();
  const wDates = {};
  workouts.forEach(w => {
    const prefix = yr+"-"+String(mo+1).padStart(2,"0");
    if (w.date.startsWith(prefix)) {
      const d = parseInt(w.date.split("-")[2]);
      wDates[d] = (w.groups||[]).map(g => g.muscle).join(" + ");
    }
  });

  if (authLoading) {
    return <div style={S.authWrap}><Spinner /></div>;
  }

  if (!user) {
    return (
      <div style={S.authWrap}>
        <div style={S.authLogo}><img src="icon-192.png" width="72" height="72" alt="" /></div>
        <h1 style={S.authTitle}>Sali</h1>
        <div style={S.authSub}>Kirjaudu sisään, jotta treenisi synkronoituvat kaikille laitteillesi reaaliajassa.</div>
        <button style={S.authBtn} className="press" onClick={signIn}>Jatka Google-tilillä</button>
        <div style={S.authFoot}>Treenidatasi on yksityinen ja näkyy vain sinulle.</div>
      </div>
    );
  }

  if (!loaded) {
    return <div style={S.authWrap}><Spinner label="Haetaan treenejä" /></div>;
  }

  const showBar = tab === "log" && blocks.length > 0;
  const barH = showBar ? (editingId !== null ? 128 : 76) : 0;

  return (
    <div style={S.wrap}>
      <div style={{...S.scroll, paddingBottom: "calc("+(24 + barH)+"px + "+NAV_SAFE_H+")"}}>
        <div style={S.header}>
          <div style={S.logoWrap}><img src="icon-192.png" width="36" height="36" alt="" /></div>
          <h1 style={S.brand}>Sali</h1>
          <button style={S.iconBtn} className="press" onClick={() => setShowSettings(true)} aria-label="Asetukset">
            <IconSettings size={18}/>
          </button>
        </div>

        {tab === "log" && (
          <div className="fade-anim">
            {editingId !== null && workouts.find(w => w.id === editingId) && (() => {
              const ew = workouts.find(w => w.id === editingId);
              return (
                <div style={S.cardEditing}>
                  <IconEdit size={16} style={{color:C.warn, flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:13, fontWeight:700, color:C.warn}}>Muokataan treeniä</div>
                    <div style={{fontSize:12, color:C.textDim, marginTop:1}}>
                      {fmtDate(ew.date)}{ew.time && " · " + ew.time}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div style={S.card}>
              <div style={S.label}>Valitse lihasryhmät</div>
              {MUSCLES.map((row, ri) => (
                <div key={ri} style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom: ri < MUSCLES.length-1 ? 8 : 0}}>
                  {row.map(m => {
                    const a = selMuscles.includes(m);
                    return (
                      <button key={m} className="press" style={S.mBtn(a)} onClick={() => toggleMuscle(m)}>
                        {a ? <IconCheck size={13}/> : <IconPlus size={13}/>}{m}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {blocks.map(block => (
              <div key={block.id} style={S.cardBlock}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                  <span style={{fontWeight:700, fontSize:15}}>{block.muscle}</span>
                  <button style={S.delIcon} className="press" onClick={() => rmBlock(block.id)} aria-label="Poista lihasryhmä"><IconX size={16}/></button>
                </div>

                {block.muscle === "Cardio" ? (
                  <div style={{display:"flex", flexDirection:"column", gap:8}}>
                    <input style={S.inp} type="number" placeholder="Kesto (min)" value={block.ct}
                      onChange={e => updBlock(block.id,"ct",e.target.value)} />
                    <textarea style={S.textarea}
                      placeholder="Muistiinpanot..." value={block.cn}
                      onChange={e => updBlock(block.id,"cn",e.target.value)} />
                  </div>
                ) : (
                  <div>
                    {block.exercises.map((ex, xi) => (
                      <div key={ex.id} style={S.exBox}>
                        <div style={{display:"flex", gap:6, alignItems:"center", marginBottom:8}}>
                          <input style={S.inp} list={"dl-"+ex.id}
                            placeholder="Liikkeen nimi" value={ex.name}
                            onChange={e => setExName(block.id, ex.id, e.target.value)} />
                          <datalist id={"dl-"+ex.id}>
                            {prevEx(block.muscle).map(n => <option key={n} value={n} />)}
                          </datalist>
                          {xi > 0 && <button style={S.delIcon} className="press" onClick={() => rmEx(block.id, ex.id)} aria-label="Poista liike"><IconX size={15}/></button>}
                        </div>
                        {(() => {
                          const q = ex.name.trim().toLowerCase();
                          const suggestions = prevEx(block.muscle).filter(n =>
                            n.toLowerCase() !== q && (!q || n.toLowerCase().includes(q))
                          );
                          if (!suggestions.length) return null;
                          return (
                            <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:9}}>
                              {suggestions.map(n => (
                                <button key={n} className="press" style={S.chip}
                                  onClick={() => setExName(block.id, ex.id, n)}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        <div style={S.setHeaderRow}>
                          <span style={S.setHeaderCell}>Toistot</span>
                          <span style={S.setHeaderCell}>Paino kg</span>
                        </div>
                        {ex.sets.map((s, si) => (
                          <div key={s.id} style={S.setRow}>
                            <span style={S.setBadge}>{si+1}</span>
                            <Stepper value={s.reps} step={1} onChange={v => updSet(block.id, ex.id, s.id, "reps", v)} />
                            <Stepper value={s.weight} step={2} onChange={v => updSet(block.id, ex.id, s.id, "weight", v)} />
                            <button style={S.delIcon} className="press" onClick={() => rmSet(block.id, ex.id, s.id)} aria-label="Poista sarja"><IconX size={14}/></button>
                          </div>
                        ))}
                        <button style={S.sbtn} className="press" onClick={() => addSet(block.id, ex.id)}><IconPlus size={12}/> Sarja</button>
                      </div>
                    ))}
                    <button style={S.abtn} className="press" onClick={() => addEx(block.id)}><IconPlus size={14}/> Lisää liike</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="fade-anim">
            <div style={S.card}>
              <div style={{fontWeight:700, fontSize:14, marginBottom:10, textTransform:"capitalize", fontFamily:"'Oswald',sans-serif", letterSpacing:"0.02em"}}>
                {now.toLocaleDateString("fi-FI",{month:"long",year:"numeric"})}
              </div>
              <div style={{...S.calGrid, marginBottom:5}}>
                {["Su","Ma","Ti","Ke","To","Pe","La"].map(d => (
                  <div key={d} style={{fontSize:10, color:C.textFaint, textAlign:"center", fontWeight:700}}>{d}</div>
                ))}
              </div>
              <div style={S.calGrid}>
                {Array.from({length: fd===0?6:fd-1}).map((_,i) => <div key={"e"+i} />)}
                {Array.from({length:dim}).map((_,i) => {
                  const d = i+1, info = wDates[d], isT = d===now.getDate();
                  return (
                    <div key={d} title={info||""} style={{
                      aspectRatio:"1", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:isT?700:500,
                      background:info?C.accent:"transparent",
                      color:info?"#141414":C.textDim,
                      boxShadow:isT && !info ? "inset 0 0 0 1.5px "+C.accent : "none"
                    }}>{d}</div>
                  );
                })}
              </div>
              {Object.keys(wDates).length > 0 && (
                <div style={{marginTop:12, display:"flex", flexDirection:"column", gap:3}}>
                  {Object.entries(wDates).sort((a,b) => a[0]-b[0]).map(([d,info]) => (
                    <div key={d} style={{fontSize:12, color:C.textDim}}><b style={{color:C.text}}>{d}.</b> {info}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={S.stats}>
              <div style={S.stat}>
                <div style={{...S.statNum, color:C.text}}>{workouts.length}</div>
                <div style={S.statLabel}>Treeniä</div>
              </div>
              <div style={S.stat}>
                <div style={{...S.statNum, color:C.text}}>{cardioCount}</div>
                <div style={S.statLabel}>Cardio</div>
              </div>
              <div style={S.stat}>
                <div style={{...S.statNum, fontSize:15, color:consColor}}>{consLabel}</div>
                <div style={S.statLabel}>Säännöllisyys</div>
              </div>
            </div>

            {workouts.length === 0 && <div style={S.card}><div style={S.empty}>Ei vielä treenejä — aloita Treeni-välilehdeltä</div></div>}
            {[...workouts].reverse().map((w) => (
              <div key={w.id} style={S.histItem}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <span style={{fontWeight:700, fontSize:13.5}}>
                    {fmtDate(w.date)}
                    {w.time && <span style={{fontWeight:500, color:C.textFaint, fontSize:12, marginLeft:6}}>{w.time}</span>}
                  </span>
                  <div style={{display:"flex", gap:16}}>
                    <button style={S.delIcon} className="press" onClick={() => editWorkout(w.id)} aria-label="Muokkaa"><IconEdit size={16}/></button>
                    <button style={S.delIcon} className="press" onClick={() => delW(w.id)} aria-label="Poista"><IconTrash size={16}/></button>
                  </div>
                </div>
                <div style={{display:"flex", flexWrap:"wrap", gap:5, margin:"7px 0"}}>
                  {(w.groups||[]).map(g => <span key={g.muscle} style={S.tag}>{g.muscle}</span>)}
                </div>
                {(w.groups||[]).map(g => (
                  <div key={g.muscle} style={{fontSize:12.5, color:C.textDim, marginBottom:2, lineHeight:1.5}}>
                    <b style={{color:C.text}}>{g.muscle}: </b>
                    {g.muscle==="Cardio"
                      ? (g.ct?g.ct+" min":"")+(g.cn?" · "+g.cn:"")
                      : (g.exercises||[]).map(e => e.name+" ("+(e.sets||[]).map(s => s.reps+"×"+s.weight+"kg").join(", ")+")").join(" · ")
                    }
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === "progress" && (
          <div className="fade-anim">
            <div style={S.card}>
              {allEx.length === 0 ? (
                <div style={S.empty}>Tallenna ensin treenejä</div>
              ) : (
                <div>
                  <select value={curEx} onChange={e => setPEx(e.target.value)}
                    style={{...S.inp, marginBottom:12, fontWeight:600}}>
                    {allEx.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 55px 65px", gap:4, marginBottom:6}}>
                    {["Päivä","Toistot","Paino"].map((l,i) => (
                      <span key={l} style={{fontSize:9.5, color:C.textFaint, textAlign:i>0?"center":"left", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700}}>{l}</span>
                    ))}
                  </div>
                  {pEntries.map((e,i) => (
                    <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 55px 65px", gap:4, padding:"7px 0", borderBottom:"1px solid "+C.borderSoft, fontSize:13}}>
                      <span style={{color:C.textDim}}>{fmtDate(e.date)}</span>
                      <span style={{textAlign:"center", fontWeight:600}}>{e.reps}</span>
                      <span style={{textAlign:"center", fontWeight:600}}>{e.weight} kg</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.label}>Ennätykset</div>
              {Object.keys(prs).length === 0 ? (
                <div style={S.empty}>Ei ennätyksiä</div>
              ) : (
                Object.entries(prs).sort((a,b) => b[1].w-a[1].w).map(([name,pr]) => (
                  <div key={name} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid "+C.borderSoft}}>
                    <span style={{fontSize:13.5, fontWeight:600}}>{name}</span>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Oswald',sans-serif", fontWeight:600, fontSize:16, color:C.accent}}>{pr.w} kg</div>
                      <div style={{fontSize:10.5, color:C.textFaint}}>{fmtDate(pr.d)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showBar && (
        <div style={{...S.savebar, bottom:NAV_SAFE_H}}>
          <div style={S.savebarInner}>
            <button style={S.savebtn} className="press" onClick={saveWorkout}>
              {editingId !== null ? "Päivitä treeni" : "Tallenna treeni"}
            </button>
            {editingId !== null && (
              <button style={S.cancelbtn} className="press" onClick={cancelEdit}>Peruuta muokkaus</button>
            )}
          </div>
        </div>
      )}

      <nav style={S.nav}>
        <div style={S.navInner}>
          {NAV_ITEMS.map(([id,label,IconC]) => {
            const a = tab === id;
            return (
              <button key={id} className="press" style={S.navItem(a)} onClick={() => setTab(id)}>
                {a && <div style={S.navIndicator} />}
                <IconC size={21}/>
                <span style={S.navLabel}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showSettings && (
        <div style={S.sheetBackdrop} className="backdrop-anim" onClick={() => setShowSettings(false)}>
          <div style={S.sheet} className="sheet-anim" onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.avatar}>{(user.displayName || user.email || "?").charAt(0).toUpperCase()}</div>
            <div style={S.sheetName}>{user.displayName || "Käyttäjä"}</div>
            <div style={S.sheetEmail}>{user.email}</div>
            <button style={S.dangerBtn} className="press" onClick={signOutUser}>
              <IconLogOut size={16}/> Kirjaudu ulos
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{...S.toast, bottom: "calc(16px + "+NAV_SAFE_H+")"}}>
          <IconCheck size={15} style={{color:C.accent}}/>{toast}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
