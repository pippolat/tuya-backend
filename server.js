const express = require("express");
const { TuyaContext } = require("@tuya/tuya-connector-nodejs");

// ============ CONFIGURAZIONE TUYA ============

// Prendi questi da:
// Cloud → Development → SelfCheckinDoorlock1 → Overview
const TUYA_CLIENT_ID = "5ddwvs9yc43jvpurhhrr";        // Access ID
const TUYA_CLIENT_SECRET = "0f033fdef91a4d7eb40e65b2401d3d26"; // Access Secret (mostralo e copialo identico)

// Device ID della serratura (Cloud → Development → SelfCheckinDoorlock1 → Devices)
const TUYA_DEVICE_ID = "bf78239666e007293e3a3q";

// Data center EU
const TUYA_BASE_URL = "https://openapi.tuyaeu.com";

console.log("DEBUG: lunghezza secret:", TUYA_CLIENT_SECRET && TUYA_CLIENT_SECRET.length);


// ============ CREAZIONE CONTESTO TUYA ============

const tuya = new TuyaContext({
  accessKey: TUYA_CLIENT_ID,
  secretKey: TUYA_CLIENT_SECRET,
  baseUrl: TUYA_BASE_URL
});

// Elimina tutte le temporary password (offline + temp) per un device
async function resetTempPasswords(deviceId) {
  console.log("Reset temporary passwords per device:", deviceId);

  const res = await tuya.request({
    method: "POST",
    path: `/v1.0/devices/${deviceId}/door-lock/temp-passwords/rest-password`
  });

  console.log("Risposta Tuya resetTempPasswords:", JSON.stringify(res));

  if (!res || res.success !== true) {
    throw new Error("Errore Tuya resetTempPasswords: " + JSON.stringify(res));
  }

  return true;
}

// ============ FUNZIONE: CREA PASSWORD TEMPORANEA ============

async function createTempPassword(deviceId, startTimeMs, endTimeMs) {
  const effectiveSec = Math.floor(startTimeMs / 1000);
  const invalidSec = Math.floor(endTimeMs / 1000);

  console.log("Creo password OFFLINE v1.0 per device:", deviceId);
  console.log("effective_time (sec):", effectiveSec, "invalid_time (sec):", invalidSec);

  const res = await tuya.request({
    method: "POST",
    path: `/v1.0/devices/${deviceId}/door-lock/offline-temp-password`,
    body: {
      effective_time: effectiveSec,
      invalid_time: invalidSec,
      name: "SelfCheckinCode",
      type: 0,
      lang: "en"
    }
  });

  console.log("Risposta Tuya createTempPassword:", JSON.stringify(res));

  if (!res || res.success !== true) {
    throw new Error("Errore Tuya createTempPassword: " + JSON.stringify(res));
  }

  const r = res.result;
  if (!r || !r.offline_temp_password) {
    throw new Error("Risultato Tuya senza offline_temp_password: " + JSON.stringify(res));
  }

  return {
    code: r.offline_temp_password,
    effectiveTimeMs: startTimeMs,
    invalidTimeMs: endTimeMs
  };
}


// ============ SERVER EXPRESS ============

const app = express();
app.use(express.json());

// Endpoint di test base
app.get("/", (req, res) => {
  res.send("Tuya backend attivo (SDK)");
});

// Endpoint chiamato da Google Apps Script
app.post("/generateLockCode", async (req, res) => {
  try {
    const { deviceId, startTimeMs, endTimeMs } = req.body || {};

    if (!deviceId || !startTimeMs || !endTimeMs) {
      return res.status(400).json({
        success: false,
        error: "deviceId, startTimeMs ed endTimeMs sono obbligatori"
      });
    }

    const pwd = await createTempPassword(deviceId, startTimeMs, endTimeMs);

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
  console.log("Tuya backend (SDK) in ascolto sulla porta " + PORT);
});








