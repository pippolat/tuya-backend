const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

// ================== CONFIGURAZIONE TUYA ==================

// Sostituisci con i tuoi dati del progetto Tuya
const TUYA_CLIENT_ID = "h3vhgjfr44qg4ug53yya";
const TUYA_CLIENT_SECRET = "50b2f6ab94634344a3d4a0fe9a967b74";

// Device ID della serratura Tuya (copialo da Tuya Cloud → Devices)
const TUYA_DEVICE_ID = "bf78239666e007293e3a3q";

// Endpoint base Tuya per il data center del tuo progetto
// Se il progetto è in Europa → openapi.tuyaeu.com
const TUYA_BASE_URL = "https://openapi.tuyaeu.com";

// ================== CACHE TOKEN ==================
let cachedToken = null;
let cachedTokenExpireAt = 0;

// Ottiene il token di accesso da Tuya
async function getTuyaToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpireAt - 60000) {
    console.log("Uso token Tuya in cache");
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

  const url = `${TUYA_BASE_URL}/v1.0/token?grant_type=1`;
  console.log("Richiesta token Tuya a:", url);

  const resp = await axios.get(url, { headers });

  console.log("Risposta Tuya token:", JSON.stringify(resp.data));

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

async function createTemp

