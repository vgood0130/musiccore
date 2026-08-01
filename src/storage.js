// src/storage.js
//
// 데이터 저장 방식 안내
// ---------------------------------------------------------------
// 이 앱은 Claude.ai 안에서 쓰던 임시 저장소(window.storage) 대신,
// 아래 두 가지 방식 중 하나를 "자동으로" 선택해서 사용합니다.
//
// 1) Supabase 연동 (.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정 시)
//    -> 데이터가 클라우드 DB에 저장되어 휴대폰·PC 등 어떤 기기에서 열어도
//       같은 내용을 보고 편집할 수 있습니다. (진짜 기기 간 동기화)
//
// 2) 브라우저 localStorage (환경변수를 설정하지 않았을 때 기본값)
//    -> 별도 설정 없이 바로 실행/배포할 수 있지만, 데이터가 "그 기기의
//       그 브라우저"에만 저장됩니다. 휴대폰에서 입력한 내용이 PC에는
//       보이지 않고, 그 반대도 마찬가지입니다.
//
// 기기 간 동기화가 필요하면 README.md의 "Supabase 연동" 안내를 따라
// 무료 프로젝트를 만들고 .env에 키를 넣어주세요. 키는 코드에 직접 적지
// 않고 .env 파일에만 두며, .env는 git에 올라가지 않도록 되어 있습니다
// (.gitignore 참고). Vercel에 배포할 때는 Vercel 프로젝트의
// Environment Variables 설정에 같은 값을 넣어주면 됩니다.
// ---------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientPromise = null;
async function getClient() {
  if (!hasSupabase) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    );
  }
  return clientPromise;
}

// ---------- localStorage fallback (per-device only) ----------
const LOCAL_PREFIX = "ticket-desk:";

function localGet(key) {
  const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
  return raw == null ? null : { key, value: raw, shared: false };
}
function localSet(key, value) {
  window.localStorage.setItem(LOCAL_PREFIX + key, value);
  return { key, value, shared: false };
}
function localDelete(key) {
  const existed = window.localStorage.getItem(LOCAL_PREFIX + key) != null;
  window.localStorage.removeItem(LOCAL_PREFIX + key);
  return { key, deleted: existed, shared: false };
}
function localList(prefix = "") {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(LOCAL_PREFIX)) {
      const bare = k.slice(LOCAL_PREFIX.length);
      if (bare.startsWith(prefix)) keys.push(bare);
    }
  }
  return { keys, prefix, shared: false };
}

// ---------- public API (matches the shape the UI code already expects) ----------
export const storage = {
  isCloudEnabled: hasSupabase,

  async get(key, shared = false) {
    const client = await getClient();
    if (client) {
      const { data, error } = await client
        .from("kv_store")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { key, value: data.value, shared };
    }
    return localGet(key);
  },

  async set(key, value, shared = false) {
    const client = await getClient();
    if (client) {
      const { error } = await client
        .from("kv_store")
        .upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return { key, value, shared };
    }
    return localSet(key, value);
  },

  async delete(key, shared = false) {
    const client = await getClient();
    if (client) {
      const { error } = await client.from("kv_store").delete().eq("key", key);
      if (error) throw error;
      return { key, deleted: true, shared };
    }
    return localDelete(key);
  },

  async list(prefix = "", shared = false) {
    const client = await getClient();
    if (client) {
      const { data, error } = await client
        .from("kv_store")
        .select("key")
        .like("key", `${prefix}%`);
      if (error) throw error;
      return { keys: (data || []).map((r) => r.key), prefix, shared };
    }
    return localList(prefix);
  },
};
