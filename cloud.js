/* Roadmap cloud sync: per-item storage, offline queue and per-user RLS. */
const app = window.Roadmap;
const btn = document.getElementById('cloudBtn');
const dialog = document.getElementById('cloudAuth');
const form = document.getElementById('sendCode');
const emailInput = document.getElementById('cloudEmail');
const message = document.getElementById('cloudMessage');
const config = window.SUPABASE_CONFIG || {};
let client = null, user = null, busy = false, again = false, timer = 0, latestSync = 0;
const prefix = 'ai_roadmap_';
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function jsonGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function jsonSet(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function validKey(key) {
  return key === 'start' ||
    /^(check\.\d+\.\d+\.\d+|note\.[0-5]|quiz\.[0-5]|answer\.[0-5]\.[0-4])$/.test(key);
}
function defaults(key) {
  return key === 'start' ? '2026-10-26' : key.startsWith('check.') ? false :
         key.startsWith('note.') ? '' : null;
}
function flatten(state) {
  const out = {};
  if (!isObj(state)) return out;
  if (typeof state.start === 'string') out.start = state.start;
  for (const [id,v] of Object.entries(state.checks || {})) {
    if (/^\d+\.\d+\.\d+$/.test(id)) out['check.'+id] = !!v;
  }
  for (const [id,v] of Object.entries(state.notes || {})) {
    if (/^[0-5]$/.test(id) && typeof v === 'string') out['note.'+id] = v;
  }
  for (const [id,v] of Object.entries(state.quizzes || {})) {
    if (/^[0-5]$/.test(id)) out['quiz.'+id] = v ?? null;
  }
  for (const [mid,answers] of Object.entries(state.answers || {})) {
    if (!/^[0-5]$/.test(mid) || !isObj(answers)) continue;
    for (const [id,v] of Object.entries(answers)) {
      if (/^[0-4]$/.test(id)) out['answer.'+mid+'.'+id] = v ?? null;
    }
  }
  return out;
}
function keyState(key) {
  const state = flatten(app.getState());
  return Object.prototype.hasOwnProperty.call(state,key) ? state[key] : defaults(key);
}
function queueKey(id) { return prefix+'pending_'+id; }
function versionKey(id) { return prefix+'versions_'+id; }
function queueFor(id) { const v=jsonGet(queueKey(id),{}); return isObj(v)?v:{}; }
function versionsFor(id) { const v=jsonGet(versionKey(id),{}); return isObj(v)?v:{}; }
function setStatus(label, status='') {
  btn.textContent=label;
  btn.className='btn small'+(status ? ' sync-'+status : '');
  btn.title=user ? 'Conectat: '+user.email : 'Conectează-te pentru sincronizare';
}
function setMessage(text, error=false) {
  message.textContent=text;
  message.classList.toggle('error',error);
}
function queueChanges(id, patch) {
  const q=queueFor(id), versions=versionsFor(id);
  for (const [key,value] of Object.entries(patch)) {
    if (!validKey(key)) continue;
    q[key]={value,base:q[key]?.base ?? versions[key] ?? null};
  }
  jsonSet(queueKey(id),q);
}
function changes(before,after) {
  const a=flatten(before),b=flatten(after), patch={};
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {
    if (!validKey(key)) continue;
    const old=Object.hasOwn(a,key)?a[key]:defaults(key);
    const now=Object.hasOwn(b,key)?b[key]:defaults(key);
    if(!same(old,now)) patch[key]=now;
  }
  return patch;
}
function schedule(ms=800) {
  if(!user)return;
  clearTimeout(timer);
  timer=setTimeout(()=>{void sync();},ms);
}
window.addEventListener('roadmap:changed',e=>{
  const patch=changes(e.detail.previous,e.detail.next);
  if(!Object.keys(patch).length)return;
  queueChanges(user?.id || 'guest',patch);
  setStatus(user?'◷ Modificări în așteptare':'◌ Salvat local','pending');
  schedule();
});
function migrateGuest() {
  if(!user)return;
  const migrated=prefix+'migrated_'+user.id;
  const guest=queueFor('guest');
  const isFirst=localStorage.getItem(migrated)!=='1';
  if(!isFirst&&!Object.keys(guest).length)return;
  const patch={};
  if(isFirst) {
    for(const [key,value] of Object.entries(flatten(app.getState()))) {
      if(!same(value,defaults(key))) patch[key]=value;
    }
  }
  for(const [key,item] of Object.entries(guest)) {
    if(validKey(key)&&isObj(item))patch[key]=item.value;
  }
  if(Object.keys(patch).length)queueChanges(user.id,patch);
  jsonSet(queueKey('guest'),{});
  localStorage.setItem(migrated,'1');
}
async function cloudData(account) {
  const {data,error}=await client.from('roadmap_progress')
    .select('item_key,item_value,updated_at').eq('user_id',account).limit(500);
  if(error)throw error;
  return new Map((data||[]).filter(row=>validKey(row.item_key))
     .map(row=>[row.item_key,{value:row.item_value?.v,stamp:row.updated_at}]));
}
async function sync() {
  if(!client||!user)return;
  if(busy){again=true;return;}
  if(!navigator.onLine){setStatus('◷ Offline · salvat local','pending');return;}
  const uid=user.id;
  busy=true;
  try {
    setStatus('↻ Sincronizare…','pending');
    migrateGuest();
    const remote=await cloudData(uid);
    if(user?.id!==uid)return;
    const pending=queueFor(uid),versions=versionsFor(uid),toApply={}, conflicts=[];
    for(const [key,row] of remote) {
      if(pending[key]) {
        if(pending[key].base!==row.stamp)conflicts.push(key);
      } else if(!same(keyState(key),row.value)) {
        toApply[key]=row.value;
      }
      versions[key]=row.stamp;
    }
    for(const [key,item] of Object.entries(pending)) {
      if(!remote.has(key)&&item.base!==null)conflicts.push(key);
    }
    if(conflicts.length) {
      const keep=confirm(
        'Există '+conflicts.length+' modificări diferite pe alt dispozitiv.\n\n'+
        'OK: păstrează modificările de aici.\n'+
        'Anulează: păstrează datele din cloud.\n'+
        'Celelalte elemente vor fi combinate automat.'
      );
      for(const key of conflicts) {
        if(keep) pending[key].base=remote.get(key)?.stamp ?? null;
        else {toApply[key]=remote.get(key)?.value ?? defaults(key);delete pending[key];}
      }
    }
    jsonSet(versionKey(uid),versions);
    jsonSet(queueKey(uid),pending);
    if(Object.keys(toApply).length)app.applyUpdates(toApply);
    for(const [key,queued] of Object.entries(pending)) {
      if(user?.id!==uid)break;
      const newest=queueFor(uid)[key];
      if(!newest||!same(newest.value,queued.value))continue;
      let response;
      if(queued.base!==null) {
        response=await client.from('roadmap_progress')
          .update({item_value:{v:queued.value}})
          .eq('user_id',uid).eq('item_key',key)
          .eq('updated_at',queued.base).select('updated_at').maybeSingle();
      } else {
        response=await client.from('roadmap_progress')
          .insert({user_id:uid,item_key:key,item_value:{v:queued.value}})
          .select('updated_at').single();
      }
      if(response.error||!response.data) {
        const race=response.error?.code==='23505'||(!response.error&&!response.data);
        if(race){setStatus('⚠ Conflict nou · reîncearcă','error');again=true;break;}
        throw response.error||new Error('Actualizarea nu a reușit.');
      }
      const current=queueFor(uid);
      if(current[key]&&same(current[key].value,queued.value)) {
        delete current[key];jsonSet(queueKey(uid),current);
      }
      const known=versionsFor(uid);
      known[key]=response.data.updated_at;
      jsonSet(versionKey(uid),known);
    }
    latestSync=Date.now();
    const left=Object.keys(queueFor(uid)).length;
    setStatus(left?'◷ '+left+' modificări în așteptare':'✓ Sincronizat în cloud',left?'pending':'ok');
  } catch(error) {
    console.warn('Roadmap cloud sync:',error);
    setStatus('⚠ Sincronizare nereușită','error');
    setMessage('Progresul a rămas salvat local. '+(error?.message||''),true);
  } finally {
    busy=false;
    if(again){again=false;schedule(250);}
  }
}
async function signedIn(nextUser) {
  if(!nextUser||user?.id===nextUser.id)return;
  const previous=localStorage.getItem(prefix+'last_user');
  if(previous&&previous!==nextUser.id) {
    const importOld=confirm(
      'Ai conectat un cont diferit. Vrei să imporți progresul local în noul cont?\n'+
      'Anulează pentru a vedea numai progresul noului cont.'
    );
    if(!importOld) {
      const reset={};
      for(const key of Object.keys(flatten(app.getState())))reset[key]=defaults(key);
      app.applyUpdates(reset);
      jsonSet(queueKey('guest'),{});
      localStorage.removeItem(prefix+'migrated_'+nextUser.id);
    }
  }
  user=nextUser;
  localStorage.setItem(prefix+'last_user',user.id);
  if(dialog.open)dialog.close();
  await sync();
}
async function logout() {
  if(Object.keys(queueFor(user?.id||'guest')).length&&!confirm('Există modificări nesincronizate. Te deconectezi?'))return;
  const {error}=await client.auth.signOut();
  if(error){setMessage(error.message,true);return;}
  user=null;
  setStatus('☁ Conectare cont');
  if(dialog.open)dialog.close();
}
btn.addEventListener('click',()=>{
  if(!client){alert('Sincronizarea nu este încă disponibilă. Datele se salvează local.');return;}
  if(user){
    if(confirm('Conectat: '+user.email+'\n\nOK = sincronizează acum.\nAnulează = opțiunea de deconectare.'))void sync();
    else if(confirm('Vrei să te deconectezi?'))void logout();
  } else {
    setMessage('');dialog.showModal();
  }
});
form.addEventListener('submit',async e=>{
  e.preventDefault();
  const email=emailInput.value.trim();
  if(!client||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return;
  setMessage('Se trimite linkul de conectare…');
  try {
    const {error}=await client.auth.signInWithOtp({
      email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}
    });
    if(error)throw error;
    setMessage('Verifică emailul. Deschide linkul primit pe acest dispozitiv.');
  }catch(err){setMessage(err.message||'Trimiterea a eșuat.',true);}
});
window.addEventListener('online',()=>schedule(250));
window.addEventListener('focus',()=>{if(user&&Date.now()-latestSync>5000)schedule(250);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)schedule(250);});
setInterval(()=>{if(user&&!document.hidden)schedule(250);},30000);
try {
  const cfgURL=new URL(config.url);
  if(cfgURL.protocol!=='https:'||!cfgURL.hostname.endsWith('.supabase.co')||
     typeof config.anonKey!=='string'||config.anonKey.length<25)throw Error('Missing public config');
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm');
  client=createClient(config.url,config.anonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  setStatus('☁ Conectare cont');
  const {data:{session},error}=await client.auth.getSession();
  if(error)console.warn('Session:',error);
  if(session?.user)await signedIn(session.user);
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){user=null;setStatus('☁ Conectare cont');}
    else if(event==='SIGNED_IN'&&session?.user&&user?.id!==session.user.id){
      queueMicrotask(()=>{void signedIn(session.user);});
    }
  });
} catch(error) {
  console.warn('Cloud unavailable:',error);
  setStatus('⚠ Cloud indisponibil','error');
}
