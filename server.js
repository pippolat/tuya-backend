const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

// ================== CONFIGURAZIONE TUYA ==================

// Sostituisci con i tuoi dati del progetto Tuya
const TUYA_CLIENT_ID = "ep7vfqefm35t8ec779ku";
const TUYA_CLIENT_SECRET = "75dbfb3358484d00b0ad7cbcaf638711";

// Device ID della serratura Tuya (copialo da Tuya Cloud → Devices)
const TUYA_DEVICE_ID = "bf78239666e007293e3a3q";

// Endpoint base Tuya per il data center del tuo progetto
// Se il progetto è in Europa → openapi.tuyaeu.com
const TUYA_BASE_URL = "https://openapi.tuyaeu.com";

// ================== CACHE TOKEN ==================
let cachedToken = null;
let cachedTokenExpireAt = 0;

async function getTuyaToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpireAt - 60000) {
    console.log("Uso token Tuya in cache");
    return cachedToken;
  }

  const t = Date.now().toString();
  const stringToSign = TUYA_CLIENT_ID + t;

  console.log("DEBUG TUYA TOKEN");
  console.log("client_id:", TUYA_CLIENT_ID);
  console.log("t:", t);
  console.log("stringToSign (client_id + t):", stringToSign);

  const sign = crypto
    .createHmac("sha256", TUYA_CLIENT_SECRET)
    .update(stringToSign)
    .digest("hex")
    .toUpperCase();

  console.log("sign calcolato:", sign);

  const headers = {
    "client_id": TUYA_CLIENT_ID,
    "sign": sign,
    "t": t,
    "sign_method": "HMAC-SHA256"
  };

  const url = `${TUYA_BASE_URL}/v1.0/token?grant_type=1`;
  console.log("Richiesta token Tuya a:", url);
  console.log("Headers usati:", JSON.stringify(headers));

  const resp = await axios.get(url, { headers });

  console.log("Risposta Tuya token RAW:", JSON.stringify(resp.data));

  if (!resp.data || resp.data.success !== true) {
    throw new Error("Errore ottenendo token Tuya: " + JSON.stringify(resp.data));
  }

  const result = resp.data.result;
  if (!result || !result.access_token) {
    throw new Error("Risposta token senza access_token: " + JSON.stringify(resp.data));
  }

  const token = result.access_token;
  const expire = result.expire_time;

  cachedToken = token;
  cachedTokenExpireAt = now + expire * 1000;

  console.log("Token Tuya ottenuto, scade tra (sec):", expire);

  return token;
}


// ================== FIRMA RICHIESTE BUSINESS ==================

function signRequest(accessToken, method, path, bodyJson) {
  const t = Date.now().toString();

  const contentSha256 = bodyJson
    ? crypto.createHash("sha256").update(bodyJson).digest("hex")
    : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const stringToSign = [
    method.toUpperCase(),
    contentSha256,
    "",
    path
  ].join("\n");

  const signStr = TUYA_CLIENT_ID + accessToken + t + stringToSign;

  const sign = crypto
    .createHmac("sha256", TUYA_CLIENT_SECRET)
    .update(signStr)
    .digest("hex")
    .toUpperCase();

  return { sign, t };
}

// ================== CREA PASSWORD TEMPORANEA ==================

async function createTempPassword(startTimeMs, endTimeMs) {
  const token = await getTuyaToken();

  const effectiveSec = Math.floor(startTimeMs / 1000);
  const invalidSec = Math.floor(endTimeMs / 1000);

  const path = `/v1.1/devices/${TUYA_DEVICE_ID}/door-lock/offline-temp-password`;
  const method = "POST";

  const body = {
    offline_pwd_add_request: {
      effective_time: effectiveSec,
      invalid_time: invalidSec,
      name: "SelfCheckinCode",
      type: "multiple" // password offline riutilizzabile nella finestra
    }
  };

  const bodyJson = JSON.stringify(body);
  const { sign, t } = signRequest(token, method, path, bodyJson);

  const headers = {
    "client_id": TUYA_CLIENT_ID,
    "access_token": token,
    "sign": sign,
    "t": t,
    "sign_method": "HMAC-SHA256",
    "Content-Type": "application/json"
  };

  const url = `${TUYA_BASE_URL}${path}`;
  console.log("Richiesta creazione password temporanea a:", url);
  console.log("Body richiesta:", bodyJson);

  const resp = await axios.post(url, body, { headers });

  console.log("Risposta Tuya offline-temp-password:", JSON.stringify(resp.data));

  if (!resp.data || resp.data.success !== true) {
    throw new Error("Errore Tuya offline-temp-password: " + JSON.stringify(resp.data));
  }

  const result = resp.data.result;
  if (!result || !result.offline_temp_password) {
    throw new Error("Risultato Tuya senza offline_temp_password: " + JSON.stringify(resp.data));
  }

  return {
    code: result.offline_temp_password,
    effectiveTimeMs: result.effective_time * 1000,
    invalidTimeMs: result.invalid_time * 1000
  };
}

// ================== SERVER EXPRESS ==================

const app = express();
app.use(express.json());

// Endpoint di test base
app.get("/", (req, res) => {
  res.send("Tuya backend attivo");
});

// Endpoint chiamato da Google Apps Script
app.post("/generateLockCode", async (req, res) => {
  try {
    const { startTimeMs, endTimeMs } = req.body;

    if (!startTimeMs || !endTimeMs) {
      return res.status(400).json({
        success: false,
        error: "startTimeMs ed endTimeMs sono obbligatori"
      });
    }

    const pwd = await createTempPassword(startTimeMs, endTimeMs);

    return res.json({
      success: true,
      code: pwd.code,
      effective_time_ms: pwd.effectiveTimeMs,
      invalid_time_ms: pwd.invalidTimeMs
    });

  } catch (e) {
    console.error("Errore /generateLockCode:", e.toString());
    return res.status(500).json({ success: false, error: e.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Doorlock backend in ascolto sulla porta " + PORT);
});



