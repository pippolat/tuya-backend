const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

// ================== CONFIGURAZIONE TUYA ==================

// Sostituisci con i tuoi dati del progetto Tuya
const TUYA_CLIENT_ID = "h3vhgjfr44qg4ug53yya";
const TUYA_CLIENT_SECRET = "50b2f6ab94634344a3d4a0fe9a967b74";

// Device ID della serratura Tuya (copialo da Tuya Cloud)
const TUYA_DEVICE_ID = "bf78239666e007293e3a3q";

// Endpoint base Tuya per l'Europa
const TUYA_BASE_URL = "https://openapi.tuyaeu.com";

// ================== CACHE TOKEN ==================
let cachedToken = null;
let cachedTokenExpireAt = 0;

async function getTuyaToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpireAt - 60000) {
    return cachedToken;
  }

  const t = Date.now().toString();
  const signStr = TUYA_CLIENT_ID + t;
  const sign = crypto
    .createHmac("sha256", TUYA_CLIENT_SECRET)
    .update(signStr)
    .digest("hex")
    .toUpperCase();

  const headers = {
    "client_id": TUYA_CLIENT_ID,
    "sign": sign,
    "t": t,
    "sign_method": "HMAC-SHA256"
  };

  const resp = await axios.get(`${TUYA_BASE_URL}/v1.0/token?grant_type=1`, { headers });
  const result = resp.data.result;

  cachedToken = result.access_token;
  cachedTokenExpireAt = now + result.expire_time * 1000;

  return cachedToken;
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
      type: "multiple" // password offline usabile più volte nella finestra
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

  const resp = await axios.post(`${TUYA_BASE_URL}${path}`, body, { headers });

  if (!resp.data || !resp.data.success) {
    throw new Error("Errore Tuya: " + JSON.stringify(resp.data));
  }

  const result = resp.data.result;

  return {
    code: result.offline_temp_password,
    effectiveTimeMs: result.effective_time * 1000,
    invalidTimeMs: result.invalid_time * 1000
  };
}

// ================== SERVER EXPRESS ==================

const app = express();
app.use(express.json());

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
