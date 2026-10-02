const { useState, useEffect, useRef } = React;
const TABS = ["log", "history", "progress"];

const GROUPS = {
  Push: ["Rinta","Olkapäät","Ojentajat"],
  Pull: ["Selkä","Hauikset"],
  Legs: ["Jalat","Vatsat"],
  Muut: ["Cardio"]
};
const KEY = "gym_v5";

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
db.enablePersistence().catch(() => {});

function uid() { return Math.random().toString(36).slice(2); }

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
    const idx = blocks.findIndex(b => b.muscle === m);
    if (idx >= 0) setBlocks(p => p.filter(b => b.muscle !== m));
    else setBlocks(p => [...p, newBlock(m)]);
  }

  function rmBlock(id) { setBlocks(p => p.filter(b => b.id !== id)); }
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
    setBlocks(p => p.map(b => b.id === bid ? Object.assign({}, b, {exercises: b.exercises.map(e => e.id === eid ? Object.assign({}, e, {sets:[...e.sets, newSet()]}) : e)}) : b));
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
    if (editingId === id) { setEditingId(null); setBlocks([]); }
    db.collection("users").doc(user.uid).collection("workouts").doc(id).delete().catch(() => showToast("Poisto epäonnistui"));
  }

  function exportData() {
    const data = JSON.stringify({w:workouts}, null, 2);
    const blob = new Blob([data], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sali-varmuuskopio-"+todayStr()+".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Varmuuskopio ladattu");
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const arr = parsed.w || parsed.workouts || parsed;
        if (!Array.isArray(arr)) throw new Error("Virheellinen muoto");
        if (!confirm("Korvataanko nykyiset "+workouts.length+" treeniä tiedoston "+arr.length+" treenillä?")) return;
        const col = db.collection("users").doc(user.uid).collection("workouts");
        const existing = await col.get();
        const base = Date.now() - arr.length;
        const ops = existing.docs.map(d => ({type:"delete", ref: d.ref}))
          .concat(arr.map((w, i) => {
            const id = w.id || uid();
            return {type:"set", ref: col.doc(id), data: Object.assign({}, w, {id, ts: base + i})};
          }));
        await runBatched(ops);
        setShowSettings(false);
        showToast("Tiedot tuotu!");
      } catch(err) {
        showToast("Virheellinen tiedosto");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
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
  let consLabel = "Heikko", consColor = "#ff6b6b";
  if (workouts.length === 0) { consLabel = "—"; consColor = "#666"; }
  else if (recent30 >= 12) { consLabel = "Erinomainen"; consColor = "#4ade80"; }
  else if (recent30 >= 8) { consLabel = "Hyvä"; consColor = "#86efac"; }
  else if (recent30 >= 4) { consLabel = "Kohtalainen"; consColor = "#fbbf24"; }
  else { consLabel = "Heikko"; consColor = "#ff6b6b"; }

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

  const c = {
    wrap: {padding:"12px", fontFamily:"system-ui,sans-serif", maxWidth:500, margin:"0 auto", color:"#fff", minHeight:"100vh"},
    tabs: {display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", alignItems:"center"},
    tab: a => ({padding:"7px 14px", borderRadius:8, border:"1px solid "+(a?"transparent":"#333"), background:a?"#fff":"#1a1a1a", color:a?"#000":"#fff", fontSize:13, cursor:"pointer"}),
    gear: {marginLeft:"auto", width:34, height:34, borderRadius:8, border:"1px solid #333", background:"#1a1a1a", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center"},
    card: {background:"#161616", border:"1px solid #2a2a2a", borderRadius:12, padding:"12px", marginBottom:10},
    cardBl: {background:"#161616", border:"1px solid #2a2a2a", borderLeft:"3px solid #fff", borderRadius:12, padding:"12px", marginBottom:10},
    label: {fontSize:11, color:"#fff", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8},
    mBtn: a => ({padding:"6px 10px", borderRadius:8, border:"1px solid "+(a?"transparent":"#333"), background:a?"#fff":"#222", color:a?"#000":"#fff", fontSize:12, cursor:"pointer", opacity:a?0.7:1}),
    inp: {height:34, padding:"0 8px", border:"1px solid #2a2a2a", borderRadius:7, fontSize:13, background:"#1f1f1f", color:"#e5e5e5", width:"100%"},
    inpC: {height:34, padding:"0 8px", border:"1px solid #2a2a2a", borderRadius:7, fontSize:13, background:"#1f1f1f", color:"#e5e5e5", width:"100%", textAlign:"center"},
    exBox: {background:"#1a1a1a", borderRadius:8, padding:"10px", marginBottom:8, border:"1px solid #252525"},
    row: {display:"grid", gridTemplateColumns:"22px 1fr 1fr 20px", gap:4, alignItems:"center", marginBottom:4},
    del: {background:"none", border:"none", cursor:"pointer", color:"#fff", fontSize:14, padding:0},
    sbtn: {padding:"4px 10px", borderRadius:6, border:"1px solid #2a2a2a", background:"#1f1f1f", fontSize:12, cursor:"pointer", color:"#fff", marginTop:2},
    abtn: {width:"100%", padding:7, borderRadius:8, border:"1px solid #2a2a2a", background:"#1f1f1f", fontSize:13, cursor:"pointer", color:"#fff", marginTop:4},
    savebtn: {width:"100%", padding:12, borderRadius:8, border:"none", background:"#fff", color:"#000", fontSize:14, fontWeight:500, cursor:"pointer", marginTop:6},
    tag: {fontSize:11, padding:"2px 8px", borderRadius:20, background:"#252525", color:"#fff"},
    empty: {textAlign:"center", color:"#fff", padding:"2rem 0", fontSize:14},
    stats: {display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12},
    stat: {background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:8, padding:"10px", textAlign:"center"},
    calGrid: {display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2},
    prRow: {display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #252525", fontSize:13},
    histItem: {padding:"10px 0", borderBottom:"1px solid #252525"},
  };

  if (authLoading) {
    return <div style={{...c.wrap, display:"flex", alignItems:"center", justifyContent:"center"}}>Ladataan...</div>;
  }

  if (!user) {
    return (
      <div style={{...c.wrap, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, minHeight:"100vh", textAlign:"center"}}>
        <img src="icon-192.png" width="64" height="64" style={{borderRadius:14}} alt="" />
        <h2 style={{margin:0}}>Sali</h2>
        <div style={{fontSize:13, color:"#aaa", maxWidth:280}}>Kirjaudu sisään, jotta treenit synkkautuvat kaikille laitteillesi.</div>
        <button style={{...c.savebtn, maxWidth:280}} onClick={signIn}>Kirjaudu Google-tilillä</button>
      </div>
    );
  }

  if (!loaded) {
    return <div style={{...c.wrap, display:"flex", alignItems:"center", justifyContent:"center"}}>Ladataan...</div>;
  }

  return (
    <div style={c.wrap}>
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:16}}>
        <img src="icon-192.png" width="32" height="32" style={{borderRadius:7, display:"block"}} alt="" />
        <h2 style={{fontSize:20, fontWeight:700, color:"#fff", margin:0, flex:1}}>Sali</h2>
      </div>
      <div style={c.tabs}>
        {[["log","+ Treeni"],["history","Historia"],["progress","Progressio"]].map(([id,l]) => (
          <button key={id} style={c.tab(tab===id)} onClick={() => setTab(id)}>{l}</button>
        ))}
        <button style={c.gear} onClick={() => setShowSettings(s => !s)} title="Asetukset">⚙</button>
      </div>

      {showSettings && (
        <div style={c.card}>
          <div style={c.label}>Asetukset</div>
          <div style={{fontSize:12, color:"#fff", marginBottom:10}}>
            Kirjautuneena: {user.displayName || user.email}
          </div>
          <button style={{...c.abtn, marginTop:0, marginBottom:8}} onClick={signOutUser}>Kirjaudu ulos</button>
          <div style={{fontSize:12, color:"#fff", marginBottom:10}}>
            Varmuuskopioi treenit tiedostoon tai palauta aiemmin tallennetusta tiedostosta.
          </div>
          <button style={{...c.abtn, marginTop:0, marginBottom:8}} onClick={exportData}>
            ⬇ Vie tiedot ({workouts.length} treeniä)
          </button>
          <label style={{...c.abtn, display:"block", textAlign:"center", marginTop:0}}>
            ⬆ Tuo tiedot tiedostosta
            <input type="file" accept="application/json,.json" onChange={importData} style={{display:"none"}} />
          </label>
        </div>
      )}

      {tab === "log" && (
        <div>
          {editingId !== null && workouts.find(w => w.id === editingId) && (() => {
            const ew = workouts.find(w => w.id === editingId);
            return (
              <div style={{...c.card, borderLeft:"3px solid #fbbf24", background:"#1a1610"}}>
                <div style={{fontSize:13, fontWeight:500, color:"#fbbf24"}}>Muokataan treeniä</div>
                <div style={{fontSize:12, color:"#fff", marginTop:2}}>
                  {fmtDate(ew.date)}
                  {ew.time && " · " + ew.time}
                </div>
              </div>
            );
          })()}
          <div style={c.card}>
            <div style={c.label}>Valitse lihasryhmät</div>
            {Object.entries(GROUPS).map(([cat,muscles]) => (
              <div key={cat} style={{marginBottom:10}}>
                <div style={{fontSize:11, color:"#fff", marginBottom:4}}>{cat}</div>
                <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                  {muscles.map(m => (
                    <button key={m} style={c.mBtn(selMuscles.includes(m))} onClick={() => toggleMuscle(m)}>
                      {selMuscles.includes(m) ? "✓ " : "+ "}{m}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {blocks.map(block => (
            <div key={block.id} style={c.cardBl}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                <span style={{fontWeight:500}}>{block.muscle}</span>
                <button style={c.del} onClick={() => rmBlock(block.id)}>✕</button>
              </div>

              {block.muscle === "Cardio" ? (
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  <input style={c.inp} type="number" placeholder="Kesto (min)" value={block.ct}
                    onChange={e => updBlock(block.id,"ct",e.target.value)} />
                  <textarea style={{...c.inp, height:56, padding:"6px 8px", resize:"none"}}
                    placeholder="Muistiinpanot..." value={block.cn}
                    onChange={e => updBlock(block.id,"cn",e.target.value)} />
                </div>
              ) : (
                <div>
                  {block.exercises.map((ex, xi) => (
                    <div key={ex.id} style={c.exBox}>
                      <div style={{display:"flex", gap:6, alignItems:"center", marginBottom:6}}>
                        <input style={c.inp} list={"dl-"+ex.id}
                          placeholder="Liikkeen nimi" value={ex.name}
                          onChange={e => setExName(block.id, ex.id, e.target.value)} />
                        <datalist id={"dl-"+ex.id}>
                          {prevEx(block.muscle).map(n => <option key={n} value={n} />)}
                        </datalist>
                        {xi > 0 && <button style={c.del} onClick={() => rmEx(block.id, ex.id)}>✕</button>}
                      </div>
                      {(() => {
                        const q = ex.name.trim().toLowerCase();
                        const suggestions = prevEx(block.muscle).filter(n =>
                          n.toLowerCase() !== q && (!q || n.toLowerCase().includes(q))
                        );
                        if (!suggestions.length) return null;
                        return (
                          <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:8}}>
                            {suggestions.map(n => (
                              <button key={n}
                                style={{fontSize:11, padding:"3px 9px", borderRadius:14, background:"#1f1f1f", color:"#fff", border:"1px solid #2a2a2a", cursor:"pointer"}}
                                onClick={() => setExName(block.id, ex.id, n)}>
                                {n}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                      <div style={{display:"grid", gridTemplateColumns:"22px 1fr 1fr 20px", gap:4, marginBottom:4}}>
                        <span></span>
                        <span style={{fontSize:10, color:"#fff", textAlign:"center"}}>Toistot</span>
                        <span style={{fontSize:10, color:"#fff", textAlign:"center"}}>Paino kg</span>
                        <span></span>
                      </div>
                      {ex.sets.map((s, si) => (
                        <div key={s.id} style={c.row}>
                          <span style={{fontSize:12, color:"#fff", textAlign:"center"}}>{si+1}</span>
                          <input style={c.inpC} type="number" placeholder="10" value={s.reps}
                            onChange={e => updSet(block.id, ex.id, s.id, "reps", e.target.value)} />
                          <input style={c.inpC} type="number" placeholder="0" step="0.5" value={s.weight}
                            onChange={e => updSet(block.id, ex.id, s.id, "weight", e.target.value)} />
                          <button style={c.del} onClick={() => rmSet(block.id, ex.id, s.id)}>✕</button>
                        </div>
                      ))}
                      <button style={c.sbtn} onClick={() => addSet(block.id, ex.id)}>+ sarja</button>
                    </div>
                  ))}
                  <button style={c.abtn} onClick={() => addEx(block.id)}>+ liike</button>
                </div>
              )}
            </div>
          ))}

          {blocks.length > 0 && (
            <div>
              <button style={c.savebtn} onClick={saveWorkout}>
                {editingId !== null ? "Päivitä treeni" : "Tallenna treeni"}
              </button>
              {editingId !== null && (
                <button style={{...c.abtn, marginTop:8}} onClick={cancelEdit}>Peruuta muokkaus</button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div>
          <div style={c.card}>
            <div style={{fontWeight:500, fontSize:14, marginBottom:10, textTransform:"capitalize"}}>
              {now.toLocaleDateString("fi-FI",{month:"long",year:"numeric"})}
            </div>
            <div style={{...c.calGrid, marginBottom:4}}>
              {["Su","Ma","Ti","Ke","To","Pe","La"].map(d => (
                <div key={d} style={{fontSize:10, color:"#fff", textAlign:"center"}}>{d}</div>
              ))}
            </div>
            <div style={c.calGrid}>
              {Array.from({length: fd===0?6:fd-1}).map((_,i) => <div key={"e"+i} />)}
              {Array.from({length:dim}).map((_,i) => {
                const d = i+1, info = wDates[d], isT = d===now.getDate();
                return (
                  <div key={d} title={info||""} style={{
                    aspectRatio:"1", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:isT?600:400,
                    background:info?"#fff":isT?"#2a2a2a":"transparent",
                    color:info?"#000":isT?"#fff":"#888"
                  }}>{d}</div>
                );
              })}
            </div>
            {Object.keys(wDates).length > 0 && (
              <div style={{marginTop:10}}>
                {Object.entries(wDates).sort((a,b) => a[0]-b[0]).map(([d,info]) => (
                  <div key={d} style={{fontSize:12, color:"#fff", marginBottom:2}}><b>{d}.</b> {info}</div>
                ))}
              </div>
            )}
          </div>

          <div style={c.stats}>
            <div style={c.stat}>
              <div style={{fontSize:20, fontWeight:500}}>{workouts.length}</div>
              <div style={{fontSize:11, color:"#fff"}}>Treenikertaa</div>
            </div>
            <div style={c.stat}>
              <div style={{fontSize:20, fontWeight:500}}>{cardioCount}</div>
              <div style={{fontSize:11, color:"#fff"}}>Cardio</div>
            </div>
            <div style={c.stat}>
              <div style={{fontSize:15, fontWeight:600, color:consColor}}>{consLabel}</div>
              <div style={{fontSize:11, color:"#fff"}}>Säännöllisyys</div>
            </div>
          </div>

          <div style={c.card}>
            {workouts.length === 0 && <div style={c.empty}>Ei treenejä</div>}
            {[...workouts].reverse().map((w) => {
              return (
                <div key={w.id} style={c.histItem}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <span style={{fontWeight:500, fontSize:13}}>
                      {fmtDate(w.date)}
                      {w.time && <span style={{fontWeight:400, color:"#fff", fontSize:12, marginLeft:6}}>{w.time}</span>}
                    </span>
                    <div style={{display:"flex", gap:14}}>
                      <button style={{...c.del, color:"#fbbf24", fontSize:16}} onClick={() => editWorkout(w.id)} title="Muokkaa">✎</button>
                      <button style={c.del} onClick={() => delW(w.id)} title="Poista">🗑</button>
                    </div>
                  </div>
                  <div style={{display:"flex", flexWrap:"wrap", gap:4, margin:"4px 0"}}>
                    {(w.groups||[]).map(g => <span key={g.muscle} style={c.tag}>{g.muscle}</span>)}
                  </div>
                  {(w.groups||[]).map(g => (
                    <div key={g.muscle} style={{fontSize:12, color:"#fff", marginBottom:2}}>
                      <b style={{color:"#e5e5e5"}}>{g.muscle}: </b>
                      {g.muscle==="Cardio"
                        ? (g.ct?g.ct+" min":"")+(g.cn?" · "+g.cn:"")
                        : (g.exercises||[]).map(e => e.name+" ("+(e.sets||[]).map(s => s.reps+"×"+s.weight+"kg").join(", ")+")").join(" · ")
                      }
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "progress" && (
        <div>
          <div style={c.card}>
            {allEx.length === 0 ? (
              <div style={c.empty}>Tallenna ensin treenejä</div>
            ) : (
              <div>
                <select value={curEx} onChange={e => setPEx(e.target.value)}
                  style={{...c.inp, height:36, marginBottom:12}}>
                  {allEx.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <div style={{display:"grid", gridTemplateColumns:"1fr 55px 65px", gap:4, marginBottom:4}}>
                  {["Päivä","Toistot","Paino"].map((l,i) => (
                    <span key={l} style={{fontSize:10, color:"#fff", textAlign:i>0?"center":"left"}}>{l}</span>
                  ))}
                </div>
                {pEntries.map((e,i) => (
                  <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 55px 65px", gap:4, padding:"6px 0", borderBottom:"1px solid #252525", fontSize:13}}>
                    <span style={{color:"#fff"}}>{fmtDate(e.date)}</span>
                    <span style={{textAlign:"center"}}>{e.reps}</span>
                    <span style={{textAlign:"center"}}>{e.weight} kg</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={c.card}>
            <div style={c.label}>Ennätykset</div>
            {Object.keys(prs).length === 0 ? (
              <div style={c.empty}>Ei ennätyksiä</div>
            ) : (
              Object.entries(prs).sort((a,b) => b[1].w-a[1].w).map(([name,pr]) => (
                <div key={name} style={c.prRow}>
                  <span>{name}</span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:500}}>{pr.w} kg</div>
                    <div style={{fontSize:11, color:"#fff"}}>{fmtDate(pr.d)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:"#fff", color:"#000", padding:"8px 18px", borderRadius:8, fontSize:13, zIndex:999, whiteSpace:"nowrap"}}>
          {toast}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
