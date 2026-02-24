/* ============================================================
   Ultimate All-in-One Calculator (patched)
   - Output bug fix: setOut() + safe formatting
   - History "입력" bug fix: expose calc set/get hooks
   - More detailed outputs: Algebra / Stats / Discrete / Finance / Base / Units / Random
   ============================================================ */

const $ = (id) => document.getElementById(id);

/* =========================
   출력 버그 방지 핵심
   ========================= */
function setOut(id, text){
  const el = $(id);
  if(!el) return;
  // 값이 0, false, NaN 같은 경우도 확실히 출력되도록 문자열화
  const s = (text === null || text === undefined) ? "" : String(text);
  el.textContent = s;
}

function setHTML(id, html){
  const el = $(id);
  if(!el) return;
  el.innerHTML = html;
}

/* =========================
   글로벌 상태
   ========================= */
let DEG = true;
let MEM = 0;

const HISTORY_KEY = "u_calc_history_v1";
const THEME_KEY = "u_calc_theme_v1";

/* 계산기 입력/출력 훅 (기록 탭 입력 버그 수정용) */
let __calcSetInput = null;
let __calcGetInput = null;

/* =========================
   init
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initTheme();
  initCalc();
  initAlgebra();
  initGraph();
  initGeometry();
  initStats();
  initDiscrete();
  initFinance();
  initBase();
  initUnits();
  initRandom();
  initHistoryUI();
});

/* ============================================================
   NAV / THEME
   ============================================================ */
function drawGraph() {}
function initNav(){
  document.querySelectorAll(".nav").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      document.querySelectorAll(".section").forEach(sec=>sec.classList.remove("active"));
      $(target).classList.add("active");
      if(target === "sec-history") renderHistory();
      if(target === "sec-graph") requestAnimationFrame(()=>drawGraph());
    });
  });

  $("btnAngle").addEventListener("click", ()=>{
    DEG = !DEG;
    $("btnAngle").textContent = DEG ? "DEG" : "RAD";
    // 각도 모드 바꿨으면 그래프도 갱신
    if(document.querySelector("#sec-graph.section.active")) drawGraph();
  });

  $("btnTheme").addEventListener("click", ()=>{
  // 라이트 모드 비활성화
  document.documentElement.classList.remove("light");
  localStorage.setItem(THEME_KEY, "dark");
  $("btnTheme").textContent = "DARK";
});
}

function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if(saved === "light"){
    document.documentElement.classList.add("light");
    $("btnTheme").textContent = "LIGHT";
  }else{
    $("btnTheme").textContent = "DARK";
  }
}

/* ============================================================
   SAFE EXPRESSION ENGINE (no eval)
   ============================================================ */

function isDigit(ch){ return ch >= "0" && ch <= "9"; }
function isAlpha(ch){ return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_"; }

function tokenize(input){
  const s = input.replace(/\s+/g, "");
  const tokens = [];
  let i=0;

  while(i < s.length){
    const c = s[i];

    if(isDigit(c) || (c==="." && i+1<s.length && isDigit(s[i+1]))){
      let j=i+1;
      while(j<s.length && (isDigit(s[j]) || s[j]===".")) j++;
      tokens.push({t:"num", v: parseFloat(s.slice(i,j))});
      i=j; continue;
    }

    if(isAlpha(c)){
      let j=i+1;
      while(j<s.length && (isAlpha(s[j]) || isDigit(s[j]))) j++;
      const name = s.slice(i,j).toLowerCase();
      tokens.push({t:"name", v:name});
      i=j; continue;
    }

    if("+-*/^(),%!".includes(c)){
      tokens.push({t:"sym", v:c});
      i++; continue;
    }

    if(c==="×"){ tokens.push({t:"sym", v:"*"}); i++; continue; }
    if(c==="÷"){ tokens.push({t:"sym", v:"/"}); i++; continue; }

    throw new Error("Invalid character: "+c);
  }

  return tokens;
}

const OPS = {
  "+": {prec:1, assoc:"L", arity:2, fn:(a,b)=>a+b},
  "-": {prec:1, assoc:"L", arity:2, fn:(a,b)=>a-b},
  "*": {prec:2, assoc:"L", arity:2, fn:(a,b)=>a*b},
  "/": {prec:2, assoc:"L", arity:2, fn:(a,b)=>a/b},
  "^": {prec:4, assoc:"R", arity:2, fn:(a,b)=>Math.pow(a,b)},
  "u-":{prec:3, assoc:"R", arity:1, fn:(a)=>-a},
  "%": {prec:5, assoc:"L", arity:1, postfix:true, fn:(a)=>a/100},
  "!": {prec:6, assoc:"L", arity:1, postfix:true, fn:(a)=>factSafe(a)},
  "mod":{prec:2, assoc:"L", arity:2, fn:(a,b)=>a%b},
};

const FUNCS = {
  "sin": (x)=>Math.sin(DEG? x*Math.PI/180 : x),
  "cos": (x)=>Math.cos(DEG? x*Math.PI/180 : x),
  "tan": (x)=>Math.tan(DEG? x*Math.PI/180 : x),
  "ln":  (x)=>Math.log(x),
  "log": (x)=>Math.log10(x),
  "sqrt":(x)=>Math.sqrt(x),
  "abs": (x)=>Math.abs(x),
};

const CONSTS = {
  "pi": Math.PI,
  "e": Math.E,
};

function factSafe(x){
  if(!Number.isFinite(x)) throw new Error("factorial invalid");
  const n = Math.round(x);
  if(Math.abs(n - x) > 1e-10) throw new Error("factorial needs integer");
  if(n < 0) throw new Error("factorial needs non-negative");
  if(n > 170) throw new Error("factorial too large");
  let r=1;
  for(let i=2;i<=n;i++) r*=i;
  return r;
}

function toRPN(tokens){
  const out = [];
  const stack = [];
  let prevType = "start";

  for(let i=0;i<tokens.length;i++){
    const tok = tokens[i];

    if(tok.t==="num"){
      out.push(tok);
      prevType="value";
      continue;
    }

    if(tok.t==="name"){
      const name = tok.v;
      const next = tokens[i+1];
      if(name in FUNCS && next && next.t==="sym" && next.v==="("){
        stack.push({t:"func", v:name});
        prevType="func";
      }else if(name in CONSTS){
        out.push({t:"num", v:CONSTS[name]});
        prevType="value";
      }else if(name==="mod"){
        handleOp("mod");
        prevType="op";
      }else{
        throw new Error("unknown name: "+name);
      }
      continue;
    }

    if(tok.t==="sym"){
      const sym = tok.v;

      if(sym==="("){
        stack.push({t:"sym", v:"("});
        prevType="lparen";
        continue;
      }
      if(sym===")"){
        while(stack.length && !(stack[stack.length-1].t==="sym" && stack[stack.length-1].v==="(")){
          out.push(stack.pop());
        }
        if(!stack.length) throw new Error("mismatched parentheses");
        stack.pop();

        if(stack.length && stack[stack.length-1].t==="func"){
          out.push(stack.pop());
        }
        prevType="value";
        continue;
      }
      if(sym===","){
        while(stack.length && !(stack[stack.length-1].t==="sym" && stack[stack.length-1].v==="(")){
          out.push(stack.pop());
        }
        if(!stack.length) throw new Error("comma error");
        prevType="comma";
        continue;
      }

      if(sym==="%" || sym==="!"){
        out.push({t:"op", v:sym});
        prevType="value";
        continue;
      }

      if(sym==="+" || sym==="-" || sym==="*" || sym==="/" || sym==="^"){
        let op = sym;
        if(op==="-" && (prevType==="start" || prevType==="op" || prevType==="lparen" || prevType==="comma" || prevType==="func")){
          op = "u-";
        }
        handleOp(op);
        prevType="op";
        continue;
      }

      throw new Error("unknown symbol: "+sym);
    }
  }

  while(stack.length){
    const top = stack.pop();
    if(top.t==="sym" && top.v==="(") throw new Error("mismatched parentheses");
    out.push(top);
  }

  return out;

  function handleOp(op){
    const o1 = OPS[op];
    if(!o1) throw new Error("unknown operator: "+op);

    while(stack.length){
      const top = stack[stack.length-1];
      if(top.t==="op"){
        const o2 = OPS[top.v];
        if(!o2) break;
        const cond = (o1.assoc==="L" && o1.prec<=o2.prec) || (o1.assoc==="R" && o1.prec<o2.prec);
        if(cond){
          out.push(stack.pop());
          continue;
        }
      }
      break;
    }
    stack.push({t:"op", v:op});
  }
}

function evalRPN(rpn){
  const st = [];
  for(const tok of rpn){
    if(tok.t==="num"){
      st.push(tok.v);
      continue;
    }
    if(tok.t==="op"){
      const op = OPS[tok.v];
      if(!op) throw new Error("bad op: "+tok.v);
      if(op.arity===1){
        if(st.length<1) throw new Error("stack underflow");
        const a = st.pop();
        st.push(op.fn(a));
      }else{
        if(st.length<2) throw new Error("stack underflow");
        const b = st.pop();
        const a = st.pop();
        st.push(op.fn(a,b));
      }
      continue;
    }
    if(tok.t==="func"){
      const fn = FUNCS[tok.v];
      if(!fn) throw new Error("bad func: "+tok.v);
      if(st.length<1) throw new Error("stack underflow");
      const a = st.pop();
      st.push(fn(a));
      continue;
    }
    throw new Error("bad token in rpn");
  }
  if(st.length!==1) throw new Error("invalid expression");
  return st[0];
}

function safeEval(exprStr){
  const tokens = tokenize(exprStr);
  const rpn = toRPN(tokens);
  const v = evalRPN(rpn);
  if(!Number.isFinite(v)) throw new Error("not finite");
  return v;
}

/* ============================================================
   SCIENTIFIC CALC UI (patched: expose set/get input)
   ============================================================ */

function initCalc(){
  const display = $("display");
  const smallLine = $("smallLine");
  const resultLine = $("resultLine");

  let input = "";

  function setInput(s){
    input = s;
    display.textContent = input.length ? input : "0";
  }
  function getInput(){
    return input;
  }

  __calcSetInput = (s)=>{
    // 외부에서 입력 넣을 때 small/result 라인도 같이 정리
    resultLine.textContent = "";
    smallLine.textContent = "";
    setInput(String(s ?? ""));
  };
  __calcGetInput = ()=>getInput();

  function append(token){
    if(token === "mod") token = " mod ";
    if(token === "pi") token = "pi";
    if(token === "e") token = "e";

    if(token === "%"){ setInput(input + "%"); return; }
    if(token === "!"){ setInput(input + "!"); return; }
    if(token === "^"){ setInput(input + "^"); return; }

    setInput(input + token);
  }

  function evaluate(){
    if(!input.trim()) return;
    try{
      smallLine.textContent = input;
      const v = safeEval(input);
      const out = formatNumber(v);
      resultLine.textContent = out;
      setInput(out);
      pushHistory(`${smallLine.textContent} = ${out}`);
    }catch{
      resultLine.textContent = "Error";
    }
  }

  function clearAll(){
    smallLine.textContent = "";
    resultLine.textContent = "";
    setInput("");
  }

  function back(){
    if(!input.length) return;
    setInput(input.slice(0,-1));
  }

  document.querySelectorAll(".keypad .k").forEach(btn=>{
    const k = btn.dataset.k;
    const act = btn.dataset.act;

    btn.addEventListener("click", ()=>{
      if(act==="eval") return evaluate();
if(act==="clear") return clearAll();
if(act==="back") return back();
if(k) append(k);
    });
  });

  $("btnClear").addEventListener("click", clearAll);
  $("btnBack").addEventListener("click", back);
  $("btnCopy").addEventListener("click", async ()=>{
    try{ await navigator.clipboard.writeText(display.textContent); }catch{}
  });

  $("btnMPlus").addEventListener("click", ()=>{
    const v = parseFloat(display.textContent);
    if(Number.isFinite(v)){
      MEM += v;
      $("memVal").textContent = formatNumber(MEM);
    }
  });
  $("btnMR").addEventListener("click", ()=>{
    __calcSetInput(formatNumber(MEM));
  });
  $("btnMC").addEventListener("click", ()=>{
    MEM = 0;
    $("memVal").textContent = "0";
  });

  document.addEventListener("keydown", (e)=>{
    const key = e.key;

    const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : "";
    if(tag==="input" || tag==="select" || tag==="textarea") return;

    if((key>="0" && key<="9") || "+-*/().".includes(key)){
      append(key);
      e.preventDefault();
      return;
    }
    if(key === "Enter"){
      evaluate(); e.preventDefault(); return;
    }
    if(key === "Backspace"){
      back(); e.preventDefault(); return;
    }
    if(key === "Escape"){
      clearAll(); e.preventDefault(); return;
    }
    if(key === "^"){
      append("^"); e.preventDefault(); return;
    }
  });
}

/* ============================================================
   ALGEBRA (more detailed)
   ============================================================ */

function initAlgebra(){
  $("btnSolveLin").addEventListener("click", ()=>{
    const a = parseFloat($("linA").value);
    const b = parseFloat($("linB").value);

    if(!Number.isFinite(a) || !Number.isFinite(b)){
      return setOut("outLin","입력이 올바르지 않음");
    }
    if(Math.abs(a) < 1e-12){
      if(Math.abs(b) < 1e-12) return setOut("outLin","0x + 0 = 0 → 모든 x가 해");
      return setOut("outLin","0x + b = 0 (b≠0) → 해 없음");
    }

    const x = -b/a;
    const steps =
`식: ${formatNumber(a)}x + ${formatNumber(b)} = 0
이동: ${formatNumber(a)}x = ${formatNumber(-b)}
나누기: x = ${formatNumber(-b)} / ${formatNumber(a)}
결과: x = ${formatNumber(x)}`;
    setOut("outLin", steps);
  });

  $("btnSolveQuad").addEventListener("click", ()=>{
    const a = parseFloat($("qa").value);
    const b = parseFloat($("qb").value);
    const c = parseFloat($("qc").value);

    if(!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)){
      return setOut("outQuad","입력이 올바르지 않음");
    }

    if(Math.abs(a) < 1e-12){
      // linear fallback with steps
      if(Math.abs(b) < 1e-12){
        if(Math.abs(c) < 1e-12) return setOut("outQuad","0x + 0 = 0 → 모든 x가 해");
        return setOut("outQuad","0x + c = 0 (c≠0) → 해 없음");
      }
      const x = -c/b;
      const steps =
`a=0 → 1차로 처리
식: ${formatNumber(b)}x + ${formatNumber(c)} = 0
x = ${formatNumber(-c)} / ${formatNumber(b)}
결과: x = ${formatNumber(x)}`;
      return setOut("outQuad", steps);
    }

    const D = b*b - 4*a*c;
    let steps =
`식: ${formatNumber(a)}x² + ${formatNumber(b)}x + ${formatNumber(c)} = 0
판별식: D = b² - 4ac
D = (${formatNumber(b)})² - 4·${formatNumber(a)}·${formatNumber(c)}
D = ${formatNumber(D)}
`;

    if(D < 0){
      steps += `D < 0 → 실근 없음 (복소근)`;
      return setOut("outQuad", steps);
    }

    const s = Math.sqrt(D);
    const x1 = (-b + s) / (2*a);
    const x2 = (-b - s) / (2*a);

    steps +=
`
공식: x = (-b ± √D) / (2a)
√D = ${formatNumber(s)}
x1 = (${formatNumber(-b)} + ${formatNumber(s)}) / ${formatNumber(2*a)} = ${formatNumber(x1)}
x2 = (${formatNumber(-b)} - ${formatNumber(s)}) / ${formatNumber(2*a)} = ${formatNumber(x2)}`;

    setOut("outQuad", steps);
  });

  $("btnSolveSys").addEventListener("click", ()=>{
    const a1 = parseFloat($("a1").value);
    const b1 = parseFloat($("b1").value);
    const c1 = parseFloat($("c1").value);
    const a2 = parseFloat($("a2").value);
    const b2 = parseFloat($("b2").value);
    const c2 = parseFloat($("c2").value);

    if([a1,b1,c1,a2,b2,c2].some(v=>!Number.isFinite(v))){
      return setOut("outSys","입력이 올바르지 않음");
    }

    const det = a1*b2 - a2*b1;

    let steps =
`식:
(${formatNumber(a1)})x + (${formatNumber(b1)})y = ${formatNumber(c1)}
(${formatNumber(a2)})x + (${formatNumber(b2)})y = ${formatNumber(c2)}

크래머 공식:
det = a1·b2 - a2·b1
det = ${formatNumber(a1)}·${formatNumber(b2)} - ${formatNumber(a2)}·${formatNumber(b1)}
det = ${formatNumber(det)}
`;

    if(Math.abs(det) < 1e-12){
      steps += `det = 0 → 해가 없거나 무한히 많음`;
      return setOut("outSys", steps);
    }

    const detX = c1*b2 - c2*b1;
    const detY = a1*c2 - a2*c1;
    const x = detX/det;
    const y = detY/det;

    steps +=
`
detX = c1·b2 - c2·b1 = ${formatNumber(detX)}
detY = a1·c2 - a2·c1 = ${formatNumber(detY)}

x = detX / det = ${formatNumber(x)}
y = detY / det = ${formatNumber(y)}
`;

    setOut("outSys", steps);
  });
}

/* ============================================================
   GRAPH
   ============================================================ */

let graphState = {
  fx: "sin(x)",
  scale: 50,
  offX: 0,
  offY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function initGraph(){
  const canvas = $("graph");
  const ctx = canvas.getContext("2d");

  $("btnPlot").addEventListener("click", ()=>{
    graphState.fx = $("fx").value.trim() || "sin(x)";
    drawGraph();
  });

  $("btnResetView").addEventListener("click", ()=>{
    graphState.scale = 50;
    graphState.offX = 0;
    graphState.offY = 0;
    drawGraph();
  });

  $("btnZoomIn").addEventListener("click", ()=>{
    graphState.scale = Math.min(300, graphState.scale * 1.15);
    drawGraph();
  });
  $("btnZoomOut").addEventListener("click", ()=>{
    graphState.scale = Math.max(10, graphState.scale / 1.15);
    drawGraph();
  });

  canvas.addEventListener("mousedown", (e)=>{
    graphState.dragging = true;
    graphState.lastX = e.offsetX;
    graphState.lastY = e.offsetY;
  });
  window.addEventListener("mouseup", ()=> graphState.dragging=false);
  canvas.addEventListener("mousemove", (e)=>{
    if(!graphState.dragging) return;
    const dx = e.offsetX - graphState.lastX;
    const dy = e.offsetY - graphState.lastY;
    graphState.lastX = e.offsetX;
    graphState.lastY = e.offsetY;
    graphState.offX += dx;
    graphState.offY += dy;
    drawGraph();
  });

  canvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    if(delta>0) graphState.scale = Math.max(10, graphState.scale/1.15);
    else graphState.scale = Math.min(300, graphState.scale*1.15);
    drawGraph();
  }, {passive:false});

  drawGraph();

  drawGraph = function(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // ⭐ 여기 추가
    const isLight = document.documentElement.classList.contains("light");

    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--panel');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    const cx = w/2 + graphState.offX;
    const cy = h/2 + graphState.offY;
    const s = graphState.scale;

    // grid
    ctx.save();
    ctx.strokeStyle = isLight
  ? "rgba(0,0,0,0.08)"
  : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    const step = s;
    for(let x = cx%step; x<=w; x+=step){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    for(let y = cy%step; y<=h; y+=step){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
    ctx.restore();

    // axes
    ctx.save();
    ctx.strokeStyle = "rgba(180,220,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(w,cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,h); ctx.stroke();
    ctx.restore();

    // function
    const fxStr = graphState.fx;

    ctx.save();
    ctx.strokeStyle = "rgba(0,229,255,0.9)";
    ctx.lineWidth = 2;

    let started = false;
    ctx.beginPath();
    for(let px=0; px<=w; px++){
      const x = (px - cx)/s;
      let y;
      try{
        y = safeEval(fxStr.replace(/\bx\b/gi, `(${x})`));
        if(!Number.isFinite(y)) { started=false; continue; }
      }catch{
        started=false; continue;
      }
      const py = cy - y*s;
      if(py < -10000 || py > 10000){ started=false; continue; }

      if(!started){
        ctx.moveTo(px, py);
        started = true;
      }else{
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.restore();
  };
}

/* ============================================================
   GEOMETRY (more detailed outputs)
   ============================================================ */

function initGeometry(){
  $("btnCircle").addEventListener("click", ()=>{
    const r = num($("g_r").value);
    if(!ok(r) || r<0) return setOut("outCircle","반지름이 올바르지 않음");
    const area = Math.PI*r*r;
    const per = 2*Math.PI*r;
    const steps =
`공식:
넓이 A = πr²
둘레 C = 2πr

대입:
A = π·(${formatNumber(r)})² = ${formatNumber(area)}
C = 2π·${formatNumber(r)} = ${formatNumber(per)}`;
    setOut("outCircle", steps);
  });

  $("btnHeron").addEventListener("click", ()=>{
    const a=num($("t_a").value), b=num($("t_b").value), c=num($("t_c").value);
    if(!ok(a,b,c) || a<=0||b<=0||c<=0) return setOut("outHeron","변 길이가 올바르지 않음");
    if(a+b<=c || a+c<=b || b+c<=a) return setOut("outHeron","삼각형 조건 불만족");

    const s = (a+b+c)/2;
    const area = Math.sqrt(s*(s-a)*(s-b)*(s-c));
    const steps =
`헤론 공식:
s = (a+b+c)/2
A = √( s(s-a)(s-b)(s-c) )

대입:
s = (${formatNumber(a)}+${formatNumber(b)}+${formatNumber(c)})/2 = ${formatNumber(s)}
A = √( ${formatNumber(s)}·${formatNumber(s-a)}·${formatNumber(s-b)}·${formatNumber(s-c)} )
A = ${formatNumber(area)}
둘레 = ${formatNumber(a+b+c)}`;
    setOut("outHeron", steps);
  });

  $("btnQuads").addEventListener("click", ()=>{
    const w=num($("r_w").value), h=num($("r_h").value);
    const a=num($("tr_a").value), b=num($("tr_b").value), th=num($("tr_h").value);
    if(!ok(w,h) || w<0||h<0) return setOut("outQuads","직사각형 입력 오류");
    if(!ok(a,b,th) || a<0||b<0||th<0) return setOut("outQuads","사다리꼴 입력 오류");

    const rect = w*h;
    const trap = (a+b)*th/2;
    const steps =
`직사각형:
A = w·h = ${formatNumber(w)}·${formatNumber(h)} = ${formatNumber(rect)}

사다리꼴:
A = (a+b)·h/2
A = (${formatNumber(a)}+${formatNumber(b)})·${formatNumber(th)}/2 = ${formatNumber(trap)}`;
    setOut("outQuads", steps);
  });

  $("btnPoly").addEventListener("click", ()=>{
    const n = Math.floor(num($("p_n").value));
    const s = num($("p_s").value);
    if(!Number.isFinite(n) || n<3) return setOut("outPoly","n은 3 이상 정수");
    if(!ok(s) || s<=0) return setOut("outPoly","s는 양수");

    const area = n*s*s / (4*Math.tan(Math.PI/n));
    const per = n*s;
    const steps =
`공식:
둘레 P = n·s
넓이 A = n·s² / (4·tan(π/n))

대입:
P = ${n}·${formatNumber(s)} = ${formatNumber(per)}
A = ${n}·(${formatNumber(s)}²) / (4·tan(π/${n})) = ${formatNumber(area)}`;
    setOut("outPoly", steps);
  });

  $("btnSolid").addEventListener("click", ()=>{
    const sr=num($("s_r").value);
    const cyr=num($("cyr").value), cyh=num($("cyh").value);
    const cor=num($("cor").value), coh=num($("coh").value);
    const ba=num($("ba").value), bb=num($("bb").value), bc=num($("bc").value);

    if(!ok(sr,cyr,cyh,cor,coh,ba,bb,bc)) return setOut("outSolid","입력 오류");
    if([sr,cyr,cyh,cor,coh,ba,bb,bc].some(v=>v<0)) return setOut("outSolid","음수 불가");

    const sphereV = 4/3*Math.PI*Math.pow(sr,3);
    const cylV = Math.PI*cyr*cyr*cyh;
    const coneV = Math.PI*cor*cor*coh/3;
    const boxV = ba*bb*bc;

    const steps =
`구:
V = 4/3·π·r³
V = 4/3·π·(${formatNumber(sr)}³) = ${formatNumber(sphereV)}

원기둥:
V = π·r²·h
V = π·(${formatNumber(cyr)}²)·${formatNumber(cyh)} = ${formatNumber(cylV)}

원뿔:
V = 1/3·π·r²·h
V = 1/3·π·(${formatNumber(cor)}²)·${formatNumber(coh)} = ${formatNumber(coneV)}

직육면체:
V = a·b·c
V = ${formatNumber(ba)}·${formatNumber(bb)}·${formatNumber(bc)} = ${formatNumber(boxV)}`;
    setOut("outSolid", steps);
  });

  $("btnPyth").addEventListener("click", ()=>{
    const a=num($("py_a").value), b=num($("py_b").value);
    if(!ok(a,b) || a<0||b<0) return setOut("outPyth","입력 오류");
    const c = Math.sqrt(a*a+b*b);
    const steps =
`피타고라스:
c = √(a² + b²)
c = √(${formatNumber(a)}² + ${formatNumber(b)}²)
c = √(${formatNumber(a*a + b*b)}) = ${formatNumber(c)}`;
    setOut("outPyth", steps);
  });
}

/* ============================================================
   STATS (more detailed)
   ============================================================ */

function initStats(){
  $("btnStats").addEventListener("click", ()=>{
    const arr = parseNumberList($("statInput").value);
    if(arr.length===0) return setOut("outStats","값이 없음");

    const sorted = [...arr].sort((a,b)=>a-b);
    const n=arr.length;
    const sum = arr.reduce((p,c)=>p+c,0);
    const mean = sum/n;
    const minV = sorted[0];
    const maxV = sorted[n-1];
    const range = maxV-minV;

    const median = (n%2===1) ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2;

    const freq = new Map();
    for(const v of arr){
      const k = String(v);
      freq.set(k, (freq.get(k)||0)+1);
    }
    let modeVal = null, modeCnt=0;
    for(const [k,c] of freq.entries()){
      if(c>modeCnt){ modeCnt=c; modeVal=parseFloat(k); }
    }

    const variance = arr.reduce((p,c)=>p+(c-mean)*(c-mean),0)/n;
    const std = Math.sqrt(variance);

    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);

    const steps =
`데이터(${n}개):
[정렬] ${sorted.join(", ")}

합계:
sum = ${arr.join(" + ")} = ${formatNumber(sum)}

평균:
mean = sum / n = ${formatNumber(sum)} / ${n} = ${formatNumber(mean)}

중앙값:
median = ${formatNumber(median)}

최빈값:
mode = ${formatNumber(modeVal)} (빈도 ${modeCnt})

최솟값/최댓값/범위:
min = ${formatNumber(minV)}, max = ${formatNumber(maxV)}, range = ${formatNumber(range)}

분산(모집단):
var = (Σ(x-mean)²) / n = ${formatNumber(variance)}

표준편차:
std = √var = ${formatNumber(std)}

사분위수:
Q1 = ${formatNumber(q1)}
Q3 = ${formatNumber(q3)}`;
    setOut("outStats", steps);
  });
}

function quantile(sorted, q){
  const n = sorted.length;
  if(n===1) return sorted[0];
  const pos = (n-1)*q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if(lo===hi) return sorted[lo];
  const w = pos-lo;
  return sorted[lo]*(1-w) + sorted[hi]*w;
}

/* ============================================================
   DISCRETE (more detailed)
   ============================================================ */

function initDiscrete(){
  $("btnGcdLcm").addEventListener("click", ()=>{
    const a0 = Math.abs(Math.trunc(num($("gl_a").value)));
    const b0 = Math.abs(Math.trunc(num($("gl_b").value)));
    if(!Number.isFinite(a0) || !Number.isFinite(b0)) return setOut("outGcdLcm","입력 오류");

    const {g, steps} = gcdWithSteps(a0,b0);
    const l = (a0===0||b0===0) ? 0 : (a0/g)*b0;

    const out =
`유클리드 호제법:
${steps.join("\n")}

gcd = ${g}
lcm = a·b / gcd = ${a0}·${b0} / ${g} = ${l}`;
    setOut("outGcdLcm", out);
  });

  $("btnNcrNpr").addEventListener("click", ()=>{
    const n = Math.trunc(num($("nc_n").value));
    const r = Math.trunc(num($("nc_r").value));
    if(!Number.isFinite(n)||!Number.isFinite(r) || n<0 || r<0 || r>n) return setOut("outNcrNpr","입력 오류");

    const npr = perm(n,r);
    const ncr = comb(n,r);

    const out =
`정의:
nPr = n·(n-1)·...·(n-r+1)
nCr = nPr / r!

결과:
nPr = ${npr}
nCr = ${ncr}`;
    setOut("outNcrNpr", out);
  });

  $("btnPrime").addEventListener("click", ()=>{
    const n = Math.trunc(num($("pr_n").value));
    if(!Number.isFinite(n) || n<0) return setOut("outPrime","입력 오류");

    const detail = primeCheckDetail(n);
    setOut("outPrime", detail);
  });

  $("btnFactors").addEventListener("click", ()=>{
    const n0 = Math.trunc(num($("fac_n").value));
    if(!Number.isFinite(n0) || n0<=0) return setOut("outFactors","n은 양의 정수");

    const divs = divisors(n0);
    const {pf, steps} = primeFactorizationSteps(n0);

    const out =
`약수(${divs.length}개):
${divs.join(", ")}

소인수분해 과정:
${steps.join("\n")}

소인수분해 결과:
${pf}`;
    setOut("outFactors", out);
  });
}

function gcdWithSteps(a,b){
  const steps=[];
  let x=a, y=b;
  while(y!==0){
    steps.push(`${x} = ${y} * ${Math.floor(x/y)} + ${x%y}`);
    const t=x%y; x=y; y=t;
  }
  return {g:x, steps: steps.length?steps:[`${a}와 ${b} 중 하나가 0이면 gcd는 다른 값`] };
}

function perm(n,r){
  let res=1n;
  for(let k=0;k<r;k++) res *= BigInt(n-k);
  return res.toString();
}
function comb(n,r){
  r = Math.min(r, n-r);
  let num=1n, den=1n;
  for(let k=1;k<=r;k++){
    num *= BigInt(n-r+k);
    den *= BigInt(k);
  }
  return (num/den).toString();
}

function primeCheckDetail(n){
  if(n<2) return `${n}은(는) 소수가 아님 (2 이상부터 소수 가능)`;
  if(n===2) return `2는 소수`;
  if(n%2===0) return `${n}은(는) 2로 나누어떨어짐 → 소수 아님`;

  const r = Math.floor(Math.sqrt(n));
  let checked = [];
  for(let i=3;i<=r;i+=2){
    checked.push(i);
    if(n%i===0){
      return `${n}은(는) ${i}로 나누어떨어짐 → 소수 아님\n(검사 범위: 3..${r} 홀수)`;
    }
    if(checked.length>=20){ checked.push("..."); break; }
  }
  return `${n}은(는) 소수\n(검사 범위: 3..${r} 홀수)`;
}

function divisors(n){
  const res=[];
  const r = Math.floor(Math.sqrt(n));
  for(let i=1;i<=r;i++){
    if(n%i===0){
      res.push(i);
      if(i*i!==n) res.push(n/i);
    }
  }
  return res.sort((a,b)=>a-b);
}

function primeFactorizationSteps(n){
  let x=n;
  const parts=[];
  const steps=[];
  let p=2;

  while(p*p<=x){
    let cnt=0;
    while(x%p===0){
      steps.push(`${x} ÷ ${p} = ${x/p}`);
      x/=p; cnt++;
    }
    if(cnt>0) parts.push(cnt===1? `${p}` : `${p}^${cnt}`);
    p = (p===2)?3:p+2;
  }
  if(x>1){
    parts.push(`${x}`);
    if(x!==n) steps.push(`남은 수 ${x}는 소수 → 인수로 포함`);
  }
  return {pf: parts.join(" * "), steps: steps.length?steps:[`${n}은(는) 소수이거나 더 이상 나눌 수 없음`] };
}

/* ============================================================
   FINANCE (more detailed)
   ============================================================ */

function initFinance(){
  $("btnSI").addEventListener("click", ()=>{
    const P=num($("si_P").value), r=num($("si_r").value)/100, t=num($("si_t").value);
    if(!ok(P,r,t) || P<0 || t<0) return setOut("outSI","입력 오류");

    const A = P*(1+r*t);
    const I = A-P;

    const out =
`단리 공식:
A = P(1 + r·t)

대입:
P=${formatMoney(P)}
r=${formatNumber(r)} (=${formatNumber(r*100)}%)
t=${formatNumber(t)}년

A = ${formatMoney(P)} · (1 + ${formatNumber(r)}·${formatNumber(t)})
A = ${formatMoney(A)}
이자 I = A - P = ${formatMoney(I)}`;
    setOut("outSI", out);
  });

  $("btnCI").addEventListener("click", ()=>{
    const P=num($("ci_P").value), r=num($("ci_r").value)/100, t=num($("ci_t").value);
    if(!ok(P,r,t) || P<0 || t<0) return setOut("outCI","입력 오류");

    const A = P*Math.pow(1+r,t);
    const I = A-P;

    const out =
`복리 공식:
A = P(1 + r)^t

대입:
P=${formatMoney(P)}
r=${formatNumber(r)} (=${formatNumber(r*100)}%)
t=${formatNumber(t)}년

A = ${formatMoney(P)} · (1+${formatNumber(r)})^${formatNumber(t)}
A = ${formatMoney(A)}
이자 I = A - P = ${formatMoney(I)}`;
    setOut("outCI", out);
  });

  $("btnLoan").addEventListener("click", ()=>{
    const P=num($("loan_P").value);
    const annual=num($("loan_r").value)/100;
    const n=Math.trunc(num($("loan_n").value));
    if(!ok(P,annual,n) || P<=0 || annual<0 || n<=0) return setOut("outLoan","입력 오류");

    const m = annual/12;
    let pay;
    let out =
`원리금 균등상환:
월이율 i = 연이율/12
i = ${formatNumber(annual)} / 12 = ${formatNumber(m)}

`;

    if(m===0){
      pay = P/n;
      out += `이율 0% → 월 상환액 = P/n = ${formatMoney(P)} / ${n} = ${formatMoney(pay)}\n`;
    }else{
      // pay = P * ( i(1+i)^n / ((1+i)^n - 1) )
      const pow = Math.pow(1+m, n);
      pay = P * (m*pow) / (pow - 1);

      out +=
`공식:
M = P · [ i(1+i)^n / ((1+i)^n - 1) ]

중간값:
(1+i)^n = (1+${formatNumber(m)})^${n} = ${formatNumber(pow)}

대입:
M = ${formatMoney(P)} · [ ${formatNumber(m)}·${formatNumber(pow)} / (${formatNumber(pow)} - 1) ]
M = ${formatMoney(pay)}
`;
    }

    const total = pay*n;
    const interest = total - P;

    out +=
`
총 상환액 = M·n = ${formatMoney(pay)} · ${n} = ${formatMoney(total)}
총 이자 = 총상환 - 원금 = ${formatMoney(interest)}`;

    setOut("outLoan", out);
  });
}

/* ============================================================
   BASE (more detailed)
   ============================================================ */

function initBase(){
  $("btnBase").addEventListener("click", ()=>{
    const s = $("baseVal").value.trim();
    const from = parseInt($("baseFrom").value,10);
    const to = parseInt($("baseTo").value,10);

    try{
      const dec = parseInt(s, from);
      if(!Number.isFinite(dec)) throw new Error();

      const outTo = dec.toString(to).toUpperCase();

      const steps =
`입력: ${s} (base ${from})

1) 10진수로 변환:
${s}_(base ${from}) = ${dec}_(base 10)

2) 목표 진법으로 변환:
${dec}_(base 10) = ${outTo}_(base ${to})`;

      setOut("outBase", steps);
    }catch{
      setOut("outBase", "변환 실패 (입력/진법 확인)");
    }
  });
}

/* ============================================================
   UNITS (more detailed)
   ============================================================ */

function initUnits(){
  $("btnLen").addEventListener("click", ()=>{
    const v=num($("lenVal").value);
    const from=$("lenFrom").value, to=$("lenTo").value;
    if(!ok(v)) return setOut("outLen","입력 오류");

    const m = lengthToMeters(v, from);
    const out = metersToLength(m, to);

    const steps =
`1) 기준(m)으로 변환:
${formatNumber(v)} ${from} → ${formatNumber(m)} m

2) 목표 단위로 변환:
${formatNumber(m)} m → ${formatNumber(out)} ${to}`;
    setOut("outLen", steps);
  });

  $("btnMass").addEventListener("click", ()=>{
    const v=num($("massVal").value);
    const from=$("massFrom").value, to=$("massTo").value;
    if(!ok(v)) return setOut("outMass","입력 오류");

    const kg = massToKg(v, from);
    const out = kgToMass(kg, to);

    const steps =
`1) 기준(kg)으로 변환:
${formatNumber(v)} ${from} → ${formatNumber(kg)} kg

2) 목표 단위로 변환:
${formatNumber(kg)} kg → ${formatNumber(out)} ${to}`;
    setOut("outMass", steps);
  });

  $("btnTemp").addEventListener("click", ()=>{
    const v=num($("tempVal").value);
    const from=$("tempFrom").value, to=$("tempTo").value;
    if(!ok(v)) return setOut("outTemp","입력 오류");

    const out = convertTemp(v, from, to);

    const steps =
`변환:
${formatNumber(v)} ${from} → ${formatNumber(out)} ${to}

(중간은 모두 °C 기준으로 처리)`;
    setOut("outTemp", steps);
  });
}

function lengthToMeters(v, unit){
  switch(unit){
    case "mm": return v/1000;
    case "cm": return v/100;
    case "m": return v;
    case "km": return v*1000;
    case "in": return v*0.0254;
    case "ft": return v*0.3048;
  }
  return NaN;
}
function metersToLength(m, unit){
  switch(unit){
    case "mm": return m*1000;
    case "cm": return m*100;
    case "m": return m;
    case "km": return m/1000;
    case "in": return m/0.0254;
    case "ft": return m/0.3048;
  }
  return NaN;
}

function massToKg(v, unit){
  switch(unit){
    case "g": return v/1000;
    case "kg": return v;
    case "lb": return v*0.45359237;
  }
  return NaN;
}
function kgToMass(kg, unit){
  switch(unit){
    case "g": return kg*1000;
    case "kg": return kg;
    case "lb": return kg/0.45359237;
  }
  return NaN;
}

function convertTemp(v, from, to){
  const c = (from==="C") ? v :
            (from==="F") ? (v-32)*5/9 :
            (v-273.15);
  return (to==="C") ? c :
         (to==="F") ? (c*9/5+32) :
         (c+273.15);
}

/* ============================================================
   RANDOM (more detailed)
   ============================================================ */

function initRandom(){
  $("btnRndInt").addEventListener("click", ()=>{
    const a=num($("rndMin").value), b=num($("rndMax").value);
    if(!ok(a,b)) return setOut("outRnd","입력 오류");
    const lo=Math.min(a,b), hi=Math.max(a,b);
    const r = Math.floor(Math.random()*(Math.floor(hi)-Math.ceil(lo)+1))+Math.ceil(lo);

    const steps =
`정수 랜덤:
범위 [${formatNumber(lo)}, ${formatNumber(hi)}]
결과 = ${r}`;
    setOut("outRnd", steps);
  });

  $("btnRndFloat").addEventListener("click", ()=>{
    const a=num($("rndMin").value), b=num($("rndMax").value);
    if(!ok(a,b)) return setOut("outRnd","입력 오류");
    const lo=Math.min(a,b), hi=Math.max(a,b);
    const r = Math.random()*(hi-lo)+lo;

    const steps =
`실수 랜덤:
범위 [${formatNumber(lo)}, ${formatNumber(hi)}]
결과 = ${formatNumber(r)}`;
    setOut("outRnd", steps);
  });

  $("btnDice").addEventListener("click", ()=>{
    const sides=Math.trunc(num($("diceSides").value));
    const cnt=Math.trunc(num($("diceCount").value));
    if(!Number.isFinite(sides)||!Number.isFinite(cnt)||sides<2||cnt<1||cnt>200) return setOut("outDice","입력 오류");

    const rolls=[];
    let sum=0;
    for(let i=0;i<cnt;i++){
      const v = 1 + Math.floor(Math.random()*sides);
      rolls.push(v); sum+=v;
    }

    const steps =
`주사위 d${sides} × ${cnt}회
결과: ${rolls.join(", ")}
합: ${sum}`;
    setOut("outDice", steps);
  });

  $("btnPick").addEventListener("click", ()=>{
    const list = $("pickList").value.split(",").map(s=>s.trim()).filter(Boolean);
    const k = Math.trunc(num($("pickK").value));
    if(list.length===0) return setOut("outPick","후보가 없음");
    if(!Number.isFinite(k) || k<1) return setOut("outPick","k 입력 오류");

    const kk = Math.min(k, list.length);
    const arr = [...list];
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    const picked = arr.slice(0, kk);

    const steps =
`후보(${list.length}): ${list.join(", ")}
k=${kk}
추첨: ${picked.join(", ")}`;
    setOut("outPick", steps);
  });
}

/* ============================================================
   HISTORY (bug fix: "입력" really sets calc input)
   ============================================================ */

function initHistoryUI(){
  $("btnHistClear").addEventListener("click", ()=>{
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });
}

function pushHistory(line){
  const hist = loadHistory();
  hist.unshift({t: Date.now(), line});
  if(hist.length>200) hist.length=200;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
}

function loadHistory(){
  try{
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  }catch{
    return [];
  }
}

function renderHistory(){
  const box = $("histList");
  const hist = loadHistory();
  if(hist.length===0){
    box.innerHTML = `<div class="out">기록 없음</div>`;
    return;
  }

  box.innerHTML = "";
  for(const item of hist){
    const row = document.createElement("div");
    row.className = "histItem";

    const expr = document.createElement("div");
    expr.className = "histExpr";
    expr.textContent = item.line;

    const btns = document.createElement("div");
    btns.className = "histBtns";

    const useBtn = document.createElement("button");
    useBtn.className = "smallBtn";
    useBtn.textContent = "입력";
    useBtn.addEventListener("click", ()=>{
      const navCalc = document.querySelector(`.nav[data-target="sec-calc"]`);
      navCalc.click();

      const left = item.line.includes("=") ? item.line.split("=")[0].trim() : item.line.trim();
      if(__calcSetInput) __calcSetInput(left);
      else {
        $("display").textContent = left || "0";
        $("smallLine").textContent = "";
        $("resultLine").textContent = "";
      }
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "smallBtn";
    copyBtn.textContent = "복사";
    copyBtn.addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText(item.line); }catch{}
    });

    const delBtn = document.createElement("button");
    delBtn.className = "smallBtn";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", ()=>{
      const now = loadHistory().filter(h=>h.t!==item.t);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(now));
      renderHistory();
    });

    btns.appendChild(useBtn);
    btns.appendChild(copyBtn);
    btns.appendChild(delBtn);

    row.appendChild(expr);
    row.appendChild(btns);
    box.appendChild(row);
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function num(v){ return parseFloat(v); }
function ok(...vals){ return vals.every(x=>Number.isFinite(x)); }

function parseNumberList(s){
  return s.split(",")
    .map(x=>x.trim())
    .filter(Boolean)
    .map(x=>parseFloat(x))
    .filter(x=>Number.isFinite(x));
}

function formatNumber(x){
  if(!Number.isFinite(x)) return String(x); // Infinity, NaN 도 문자열로
  const ax = Math.abs(x);
  if(ax!==0 && (ax>=1e12 || ax<1e-6)){
    let t = x.toExponential(10);
    t = t.replace(/(\.\d*?)0+e/, "$1e").replace(/\.e/,"e");
    return t;
  }
  let s = x.toFixed(12);
  s = s.replace(/\.?0+$/,"");
  return s;
}

function formatMoney(x){
  if(!Number.isFinite(x)) return String(x);
  const v = Math.round(x);
  return v.toLocaleString("ko-KR") + "원";
}
/* ============================================================
   ===== SAFE PATCH (DOMContentLoaded 이후 실행) =====
   ============================================================ */

document.addEventListener("DOMContentLoaded", ()=>{

  /* ---- 공학 계산기 안전성 강화 ---- */
  const _safeEval = safeEval;
  window.safeEval = function(expr){
    if(typeof expr !== "string" || !expr.trim()){
      throw new Error("empty expression");
    }
    if(/[\+\-\*\/\^]{2,}/.test(expr.replace(/\-\-/g,""))){
      throw new Error("operator sequence error");
    }
    const open = (expr.match(/\(/g)||[]).length;
    const close = (expr.match(/\)/g)||[]).length;
    if(open !== close){
      throw new Error("parenthesis mismatch");
    }
    return _safeEval(expr);
  };

  /* ---- number 입력 자동 검증 ---- */
  document.querySelectorAll("input[type='number']").forEach(inp=>{
    inp.addEventListener("blur", ()=>{
      if(inp.value.trim()===""){
        inp.value = "0";
        return;
      }
      const v = parseFloat(inp.value);
      if(!Number.isFinite(v)){
        inp.value = "0";
      }
    });
  });

  /* ---- 통계 표본 추가 ---- */
  $("btnStats")?.addEventListener("click", ()=>{
    const arr = parseNumberList($("statInput").value);
    if(arr.length < 2) return;

    const n = arr.length;
    const mean = arr.reduce((a,b)=>a+b,0)/n;
    const sampleVar = arr.reduce((p,c)=>p+(c-mean)*(c-mean),0)/(n-1);
    const sampleStd = Math.sqrt(sampleVar);

    $("outStats").textContent +=
`\n\n[표본 통계]
표본분산 s² = ${formatNumber(sampleVar)}
표본표준편차 s = ${formatNumber(sampleStd)}`;
  });

  /* ---- 복리 월복리 ---- */
  $("btnCI")?.addEventListener("click", ()=>{
    const P=num($("ci_P").value);
    const r=num($("ci_r").value)/100;
    const t=num($("ci_t").value);
    if(!ok(P,r,t) || P<0 || t<0) return;

    const yearly = P*Math.pow(1+r,t);
    const monthly = P*Math.pow(1+r/12, t*12);

    $("outCI").textContent +=
`\n\n[월복리 계산]
A_monthly = ${formatMoney(monthly)}
차이 = ${formatMoney(monthly - yearly)}`;
  });

  /* ---- 2차 복소근 ---- */
  $("btnSolveQuad")?.addEventListener("click", ()=>{
    const a = parseFloat($("qa").value);
    const b = parseFloat($("qb").value);
    const c = parseFloat($("qc").value);
    if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(c)||Math.abs(a)<1e-12) return;

    const D = b*b - 4*a*c;
    if(D < 0){
      const real = -b/(2*a);
      const imag = Math.sqrt(-D)/(2*a);

      $("outQuad").textContent +=
`\n\n복소근:
x = ${formatNumber(real)} ± ${formatNumber(imag)}i`;
    }
  });

  /* ---- 랜덤 정수 경우의 수 ---- */
  $("btnRndInt")?.addEventListener("click", ()=>{
    const a=num($("rndMin").value), b=num($("rndMax").value);
    if(!ok(a,b)) return;
    const lo=Math.min(a,b), hi=Math.max(a,b);
    const total = Math.floor(hi) - Math.ceil(lo) + 1;

    $("outRnd").textContent += `\n가능한 정수 개수: ${total}`;
  });

});